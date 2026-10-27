import { z } from "zod";

/**
 * GEO Readiness: how well one page can be crawled, understood and cited by
 * generative engines (ChatGPT, Claude, Perplexity, Google AI). Stateless like
 * Prompt Explorer: the user enters a URL, we fetch it and score it. Nothing
 * is billed — no DataForSEO or LLM call is made.
 */

export const GEO_READINESS_MAX_URL_LENGTH = 2048;

export const geoReadinessInputSchema = z.object({
  projectId: z.string().min(1),
  url: z.string().trim().min(1).max(GEO_READINESS_MAX_URL_LENGTH),
});

export const geoReadinessSearchSchema = z.object({
  url: z.string().max(GEO_READINESS_MAX_URL_LENGTH).optional().catch(undefined),
});

export const GEO_CATEGORIES = [
  "access",
  "structure",
  "citability",
  "entity",
] as const;

export type GeoCategory = (typeof GEO_CATEGORIES)[number];

export type GeoCheckStatus = "pass" | "warn" | "fail";

export type GeoCheck = {
  id: string;
  category: GeoCategory;
  label: string;
  status: GeoCheckStatus;
  /** What we found on the page, in one sentence. */
  detail: string;
  /** How to fix it. Only set when the check did not pass. */
  fix: string | null;
  /** Relative weight inside its category. */
  weight: number;
};

/** One AI crawler and whether robots.txt lets it fetch the page. */
export type GeoCrawler = {
  userAgent: string;
  operator: string;
  /** "search" bots fetch pages to answer and cite; "training" bots collect data. */
  purpose: "search" | "training";
  allowed: boolean;
};

export type GeoCategoryScore = {
  category: GeoCategory;
  score: number;
};

export type GeoReadinessResult = {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  title: string | null;
  /** 0–100, the mean of the four category scores. */
  score: number;
  categories: GeoCategoryScore[];
  checks: GeoCheck[];
  crawlers: GeoCrawler[];
  stats: {
    wordCount: number;
    statistics: number;
    externalLinks: number;
    questionHeadings: number;
    schemaTypes: string[];
    hasLlmsTxt: boolean;
  };
};
