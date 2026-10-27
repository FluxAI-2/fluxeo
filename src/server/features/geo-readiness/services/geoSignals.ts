import robotsParser from "robots-parser";
import { identity, sortBy } from "remeda";
import type { PageAnalysis } from "@/server/lib/audit/types";
import type { GeoCrawler } from "@/types/schemas/geo-readiness";

/**
 * Readers for the inputs GEO Readiness scores: AI crawler access from
 * robots.txt, and the HTML signals the audit page analyzer does not carry.
 */

/** The crawlers each engine uses. Search bots fetch to answer and cite. */
const AI_CRAWLERS: Array<Omit<GeoCrawler, "allowed">> = [
  { userAgent: "OAI-SearchBot", operator: "ChatGPT search", purpose: "search" },
  { userAgent: "ChatGPT-User", operator: "ChatGPT", purpose: "search" },
  {
    userAgent: "Claude-SearchBot",
    operator: "Claude search",
    purpose: "search",
  },
  { userAgent: "Claude-User", operator: "Claude", purpose: "search" },
  { userAgent: "PerplexityBot", operator: "Perplexity", purpose: "search" },
  { userAgent: "Bingbot", operator: "Copilot / Bing", purpose: "search" },
  { userAgent: "GPTBot", operator: "OpenAI training", purpose: "training" },
  {
    userAgent: "ClaudeBot",
    operator: "Anthropic training",
    purpose: "training",
  },
  {
    userAgent: "Google-Extended",
    operator: "Gemini training",
    purpose: "training",
  },
  {
    userAgent: "Applebot-Extended",
    operator: "Apple Intelligence",
    purpose: "training",
  },
  { userAgent: "CCBot", operator: "Common Crawl", purpose: "training" },
];

export type GeoPageSignals = {
  /** Text of every h2/h3, used for question-style headings. */
  subheadings: string[];
  listCount: number;
  tableCount: number;
  schemaTypes: string[];
  /** A dateModified/datePublished/article:modified_time value was found. */
  hasDate: boolean;
};

/** The HTML signals PageAnalysis doesn't carry, read with light regexes. */
export function readGeoPageSignals(html: string): GeoPageSignals {
  const subheadings = Array.from(
    html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi),
    (match) => stripTags(match[1]),
  ).filter(Boolean);
  const listCount = (html.match(/<(?:ul|ol)[\s>]/gi) ?? []).length;
  const tableCount = (html.match(/<table[\s>]/gi) ?? []).length;

  const schemaTypes = new Set<string>();
  let hasDate = /article:(?:modified|published)_time|<time[\s>]/i.test(html);
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      collectSchemaTypes(JSON.parse(match[1]) as unknown, schemaTypes);
    } catch {
      // Invalid JSON-LD is skipped; engines ignore it too.
    }
    if (/"date(?:Modified|Published)"/.test(match[1])) hasDate = true;
  }

  return {
    subheadings,
    listCount,
    tableCount,
    schemaTypes: sortBy([...schemaTypes], identity()),
    hasDate,
  };
}

function collectSchemaTypes(node: unknown, into: Set<string>) {
  if (Array.isArray(node)) {
    for (const item of node) collectSchemaTypes(item, into);
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = new Map(Object.entries(node));
  const type: unknown = record.get("@type");
  if (typeof type === "string") into.add(type);
  if (Array.isArray(type)) {
    for (const t of type) if (typeof t === "string") into.add(t);
  }
  if (record.has("@graph")) collectSchemaTypes(record.get("@graph"), into);
}

function stripTags(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function readCrawlerAccess(
  pageUrl: string,
  robotsTxt: string | null,
): GeoCrawler[] {
  const robots =
    robotsTxt === null
      ? null
      : robotsParser(new URL("/robots.txt", pageUrl).toString(), robotsTxt);
  return AI_CRAWLERS.map((crawler) => ({
    ...crawler,
    allowed: robots
      ? (robots.isAllowed(pageUrl, crawler.userAgent) ?? true)
      : true,
  }));
}

export type ScoreInput = {
  page: PageAnalysis;
  signals: GeoPageSignals;
  crawlers: GeoCrawler[];
  hasLlmsTxt: boolean;
};

/** Counts shared by the checks and the result's stats. */
export type Metrics = {
  statistics: number;
  externalLinks: number;
  questionHeadings: number;
};

export function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
