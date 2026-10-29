import { describe, expect, it } from "vitest";
import { readCrawlerAccess, readGeoPageSignals } from "./geoSignals";

describe("readCrawlerAccess", () => {
  it("reads per-bot rules, falling back to the wildcard group", () => {
    const robots = [
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "User-agent: PerplexityBot",
      "Disallow: /docs/",
      "",
      "User-agent: *",
      "Allow: /",
    ].join("\n");

    const access = Object.fromEntries(
      readCrawlerAccess("https://example.com/docs/page", robots).map((c) => [
        c.userAgent,
        c.allowed,
      ]),
    );

    expect(access).toMatchObject({
      GPTBot: false,
      PerplexityBot: false,
      "OAI-SearchBot": true,
      ClaudeBot: true,
    });
  });

  it("allows every crawler when the site has no robots.txt", () => {
    expect(
      readCrawlerAccess("https://example.com/", null).every((c) => c.allowed),
    ).toBe(true);
  });
});

describe("readGeoPageSignals", () => {
  it("collects JSON-LD types from @graph and skips invalid blocks", () => {
    const html = `
      <script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["Article","NewsArticle"],"dateModified":"2026-01-01"}]}</script>
      <script type="application/ld+json">{not json</script>`;

    expect(readGeoPageSignals(html)).toMatchObject({
      schemaTypes: ["Article", "NewsArticle", "Organization"],
      hasDate: true,
    });
  });
});
