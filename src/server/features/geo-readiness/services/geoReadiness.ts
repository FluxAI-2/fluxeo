import { analyzeHtml } from "@/server/lib/audit/page-analyzer";
import { MAX_HTML_BYTES, readTextUpTo } from "@/server/lib/audit/html-response";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";
import { AppError } from "@/server/lib/errors";
import { scoreGeoReadiness } from "./geoScoring";
import { readCrawlerAccess, readGeoPageSignals } from "./geoSignals";
import type { GeoReadinessResult } from "@/types/schemas/geo-readiness";

const USER_AGENT = "Fluxeo-GEO/1.0 (+https://github.com/FluxAI-2/fluxeo)";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const MAX_SIDE_FILE_BYTES = 256 * 1024;

type Fetched = { url: string; status: number; text: string; elapsedMs: number };

/**
 * GET with manual redirects so every hop is re-validated against the SSRF
 * guard; redirect:"follow" would let a 30x reach an internal host.
 */
async function fetchValidated(
  startUrl: string,
  maxBytes: number,
  accept: string,
): Promise<Fetched | null> {
  const started = Date.now();
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current, {
      headers: { "user-agent": USER_AGENT, accept },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      current = await normalizeAndValidateStartUrl(
        new URL(location, current).toString(),
      );
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    return {
      url: current,
      status: response.status,
      text: await readTextUpTo(response, maxBytes),
      elapsedMs: Date.now() - started,
    };
  }
  return null;
}

/** robots.txt or llms.txt; a missing or unreadable file is just null. */
async function fetchSideFile(origin: string, path: string) {
  try {
    const file = await fetchValidated(
      await normalizeAndValidateStartUrl(new URL(path, origin).toString()),
      MAX_SIDE_FILE_BYTES,
      "text/plain,*/*",
    );
    // Many sites answer unknown paths with their HTML app shell and a 200.
    if (!file || /^\s*<(?:!doctype|html)/i.test(file.text)) return null;
    return file.text;
  } catch {
    return null;
  }
}

export async function analyzeGeoReadiness(
  rawUrl: string,
): Promise<GeoReadinessResult> {
  const url = await normalizeAndValidateStartUrl(rawUrl);

  let page: Fetched | null;
  try {
    page = await fetchValidated(
      url,
      MAX_HTML_BYTES,
      "text/html,application/xhtml+xml",
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("UPSTREAM_UNAVAILABLE", `Could not fetch ${url}`);
  }
  if (!page) {
    throw new AppError("UPSTREAM_UNAVAILABLE", `${url} did not return a page`);
  }

  const origin = new URL(page.url).origin;
  const [robotsTxt, llmsTxt] = await Promise.all([
    fetchSideFile(origin, "/robots.txt"),
    fetchSideFile(origin, "/llms.txt"),
  ]);

  const analysis = analyzeHtml(
    page.text,
    page.url,
    page.status,
    page.elapsedMs,
  );
  const crawlers = readCrawlerAccess(page.url, robotsTxt);
  const scored = scoreGeoReadiness({
    page: analysis,
    signals: readGeoPageSignals(page.text),
    crawlers,
    hasLlmsTxt: llmsTxt !== null && llmsTxt.trim().length > 0,
  });

  return {
    url,
    finalUrl: page.url,
    fetchedAt: new Date().toISOString(),
    title: analysis.title || null,
    crawlers,
    ...scored,
  };
}
