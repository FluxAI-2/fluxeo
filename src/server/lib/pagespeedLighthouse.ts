import { z } from "zod";
import {
  buildStoredLighthouseIssues,
  buildStoredLighthouseMetrics,
  type RawLighthouseAudit,
  type RawLighthouseCategory,
  scoreToPercent,
  type StoredLighthousePayload,
  storedLighthousePayloadSchema,
} from "@/server/lib/lighthouseStoredPayload";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// Google's free PageSpeed Insights API runs Lighthouse on Google's servers.
// Without PAGESPEED_API_KEY it runs on a keyless quota shared with everyone,
// which is often used up for the day; a free key gives the project its own
// daily quota.
// https://developers.google.com/speed/docs/insights/v5/get-started
const PAGESPEED_URL =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATEGORIES = ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"];
// Lighthouse on a slow page can take over a minute.
const REQUEST_TIMEOUT_MS = 120_000;

type LighthouseStrategy = "mobile" | "desktop";

const pagespeedResponseSchema = z.object({
  lighthouseResult: z.object({
    requestedUrl: z.string().optional(),
    finalUrl: z.string().optional(),
    lighthouseVersion: z.string().optional(),
    runtimeError: z
      .object({ code: z.string().optional(), message: z.string().optional() })
      .optional(),
    // Only the key map is copied here, so the multi-MB category/audit bodies
    // stay as the response's own objects. Deep-parsing them cloned the whole
    // report a second time and pushed the audit worker over its memory limit.
    categories: z
      .record(z.string(), z.custom<RawLighthouseCategory>())
      .optional(),
    audits: z.record(z.string(), z.custom<RawLighthouseAudit>()).optional(),
  }),
});

const pagespeedErrorSchema = z.object({
  error: z.object({ message: z.string() }),
});

function summarizeZodIssues(error: z.ZodError, maxIssues = 3): string {
  return error.issues
    .slice(0, maxIssues)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function parsePagespeedLighthousePayload(
  payload: unknown,
  input: { url: string; strategy: LighthouseStrategy },
): StoredLighthousePayload {
  // Only the envelope scalars are validated up front. The report is reduced
  // straight into the compact stored payload, which is then validated in full
  // below — at kilobyte size instead of multi-megabyte.
  const parsed = pagespeedResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `PageSpeed Insights returned an invalid response: ${summarizeZodIssues(parsed.error)}`,
    );
  }
  const result = parsed.data.lighthouseResult;
  const categories = result.categories ?? {};
  const audits = result.audits ?? {};
  const issueReport = buildStoredLighthouseIssues({ audits, categories });
  const storedPayload: StoredLighthousePayload = {
    version: 2,
    source: "pagespeed-insights",
    hasIssueDetails: issueReport.hasIssueDetails,
    metadata: {
      requestedUrl: result.requestedUrl ?? input.url,
      finalUrl: result.finalUrl ?? input.url,
      strategy: input.strategy,
      fetchedAt: new Date().toISOString(),
      lighthouseVersion: result.lighthouseVersion ?? null,
      taskId: null,
      cost: 0,
    },
    scores: {
      performance: scoreToPercent(categories.performance?.score),
      accessibility: scoreToPercent(categories.accessibility?.score),
      "best-practices": scoreToPercent(categories["best-practices"]?.score),
      seo: scoreToPercent(categories.seo?.score),
    },
    metrics: buildStoredLighthouseMetrics({ audits }),
    issues: issueReport.issues,
  };

  const allScoresMissing = Object.values(storedPayload.scores).every(
    (score) => score == null,
  );
  if (allScoresMissing) {
    // A page Lighthouse couldn't load still answers 200, with the reason here.
    const runtime = result.runtimeError;
    throw new Error(
      runtime?.code
        ? `Lighthouse returned error: ${runtime.code}. ${runtime.message ?? ""}`.trim()
        : `PageSpeed Insights returned no category scores for ${storedPayload.metadata.finalUrl}`,
    );
  }

  // Without this, an off-spec field (a numeric audit title, say) would be
  // stored and then fail to parse on read, silently blanking the page's whole
  // Lighthouse view instead of failing the check.
  const validated = storedLighthousePayloadSchema.safeParse(storedPayload);
  if (!validated.success) {
    throw new Error(
      `PageSpeed Insights returned an invalid report: ${summarizeZodIssues(validated.error)}`,
    );
  }
  return storedPayload;
}

// One payload read+parse at a time per isolate. This module runs in the
// open-seo-audit worker, and the raw Lighthouse payload (1-10MB, held several
// times over while parsing) is the operation that OOMed the main worker;
// concurrent checks bursting onto one isolate could do the same here. The
// fetches themselves stay concurrent — parsing (well under a second each) is
// cheap against a 30-60s Lighthouse run, and workerd streams un-read response
// bodies, so queued siblings don't buffer.
let parseChain: Promise<unknown> = Promise.resolve();
function withParseLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = parseChain.then(fn, fn);
  parseChain = run.catch(() => {});
  return run;
}

export async function fetchPagespeedLighthouse(input: {
  url: string;
  strategy: LighthouseStrategy;
}): Promise<StoredLighthousePayload> {
  const params = new URLSearchParams({
    url: input.url,
    strategy: input.strategy,
  });
  for (const category of CATEGORIES) params.append("category", category);
  const apiKey = await getOptionalEnvValue("PAGESPEED_API_KEY");
  if (apiKey) params.set("key", apiKey);

  // The timeout is cleared once headers arrive: an armed signal would
  // otherwise cover a body read queued behind the parse lock.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${PAGESPEED_URL}?${params}`, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = pagespeedErrorSchema.safeParse(
      await response.json().catch(() => null),
    );
    const message = error.success
      ? error.data.error.message
      : `PageSpeed Insights request failed (${response.status})`;
    throw new Error(
      response.status === 429 && !apiKey
        ? `${message} Set PAGESPEED_API_KEY to raise the PageSpeed Insights quota.`
        : message,
    );
  }

  return withParseLock(async () =>
    parsePagespeedLighthousePayload(await response.json(), input),
  );
}
