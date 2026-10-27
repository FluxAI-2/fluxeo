import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn(async () => undefined),
}));

import { fetchPagespeedLighthouse } from "@/server/lib/pagespeedLighthouse";
import { readStoredLighthousePayload } from "@/server/lib/lighthousePayload";

function stubPagespeed(body: unknown, status = 200) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const check = { url: "https://everyapp.dev/", strategy: "mobile" } as const;

describe("fetchPagespeedLighthouse", () => {
  it("stores only issue-level lighthouse data and key metadata", async () => {
    const fetchMock = stubPagespeed({
      lighthouseResult: {
        requestedUrl: "https://everyapp.dev/",
        finalUrl: "https://everyapp.dev/",
        lighthouseVersion: "12.8.0",
        categories: {
          performance: {
            score: 0.54,
            auditRefs: [{ id: "unused-javascript" }],
          },
          accessibility: { score: 0.93, auditRefs: [] },
          "best-practices": { score: 0.79, auditRefs: [] },
          seo: { score: 0.92, auditRefs: [] },
        },
        audits: {
          "unused-javascript": {
            title: "Reduce unused JavaScript",
            description: "Trim dead code.",
            score: 0,
            scoreDisplayMode: "metricSavings",
            displayValue: "Potential savings of 188 KiB",
            numericValue: 193002,
            details: {
              overallSavingsMs: 1270,
              overallSavingsBytes: 193002,
              items: [
                { url: "https://cdn.example.com/app.js", wastedBytes: 193002 },
              ],
            },
          },
          interactive: {
            title: "Time to Interactive",
            description: "Time until the page becomes interactive.",
            score: 0.13,
            scoreDisplayMode: "numeric",
            displayValue: "12.8 s",
            numericValue: 12800,
          },
        },
      },
    });

    const parsed = await fetchPagespeedLighthouse(check);
    const { report } = readStoredLighthousePayload(JSON.stringify(parsed));

    const input = fetchMock.mock.calls[0]?.[0];
    const requested = new URL(typeof input === "string" ? input : "");
    expect(requested.searchParams.get("strategy")).toBe("mobile");
    expect(requested.searchParams.getAll("category")).toEqual([
      "PERFORMANCE",
      "ACCESSIBILITY",
      "BEST_PRACTICES",
      "SEO",
    ]);
    expect(parsed).toMatchObject({
      version: 2,
      source: "pagespeed-insights",
      hasIssueDetails: true,
      metadata: {
        finalUrl: "https://everyapp.dev/",
        strategy: "mobile",
        lighthouseVersion: "12.8.0",
        cost: 0,
      },
      scores: {
        performance: 54,
        accessibility: 93,
        "best-practices": 79,
        seo: 92,
      },
      metrics: {
        timeToInteractive: { score: 13, displayValue: "12.8 s" },
      },
    });
    expect(report.issues).toEqual([
      expect.objectContaining({
        auditKey: "unused-javascript",
        category: "performance",
        impactMs: 1270,
        impactBytes: 193002,
      }),
    ]);
  });

  it("surfaces Lighthouse's runtime error when the page produced no scores", async () => {
    stubPagespeed({
      lighthouseResult: {
        runtimeError: {
          code: "NO_FCP",
          message: "The page did not paint any content.",
        },
        categories: { performance: { score: null, auditRefs: [] } },
        audits: {},
      },
    });

    await expect(fetchPagespeedLighthouse(check)).rejects.toThrow(
      "Lighthouse returned error: NO_FCP. The page did not paint any content.",
    );
  });

  it("rejects a report whose audit fields are off-spec", async () => {
    stubPagespeed({
      lighthouseResult: {
        categories: {
          performance: {
            score: 0.54,
            auditRefs: [{ id: "unused-javascript" }],
          },
        },
        audits: { "unused-javascript": { title: 42, score: 0 } },
      },
    });

    await expect(fetchPagespeedLighthouse(check)).rejects.toThrow(
      "PageSpeed Insights returned an invalid report",
    );
  });

  it("reads audits whose details.items is a single object", async () => {
    stubPagespeed({
      lighthouseResult: {
        categories: {
          performance: {
            score: 0.54,
            auditRefs: [{ id: "document-latency-insight" }],
          },
        },
        audits: {
          "document-latency-insight": {
            title: "Document request latency",
            score: 0,
            scoreDisplayMode: "metricSavings",
            details: { items: { url: "https://everyapp.dev/" } },
          },
        },
      },
    });

    const parsed = await fetchPagespeedLighthouse(check);

    expect(parsed.issues).toEqual([
      expect.objectContaining({
        auditKey: "document-latency-insight",
        items: ['{"url":"https://everyapp.dev/"}'],
      }),
    ]);
  });

  it("points a keyless quota error at PAGESPEED_API_KEY", async () => {
    stubPagespeed({ error: { message: "Quota exceeded." } }, 429);

    await expect(fetchPagespeedLighthouse(check)).rejects.toThrow(
      "Quota exceeded. Set PAGESPEED_API_KEY to raise the PageSpeed Insights quota.",
    );
  });
});
