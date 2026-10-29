import { truncate, type Metrics, type ScoreInput } from "./geoSignals";
import { entityChecks } from "./geoEntityChecks";
import {
  GEO_CATEGORIES,
  type GeoCategoryScore,
  type GeoCheck,
  type GeoCrawler,
} from "@/types/schemas/geo-readiness";

/**
 * Pure scoring for GEO Readiness: page analysis + robots.txt + llms.txt in,
 * checks and scores out. No I/O, so the same inputs always score the same.
 *
 * Ported from GEOPilot's GEO score (entity density, structure, citation
 * probability, clarity) and extended with the signals generative engines
 * actually gate on: whether their crawlers may fetch the page, whether the
 * content exists without JavaScript, and machine-readable entity data.
 */

const SOURCING_PHRASES = [
  "according to",
  "research",
  "study",
  "survey",
  "report",
  "data shows",
  "found that",
  "analysis",
  "source:",
];

const STATISTIC_PATTERN =
  /\b\d[\d,.]*\s?(?:%|percent\b|x\b|million\b|billion\b|thousand\b)|[$€£]\s?\d[\d,.]*/gi;

const QUESTION_HEADING_PATTERN =
  /\?\s*$|^(?:how|what|why|when|which|who|can|does|is|are|should)\b/i;

export function scoreGeoReadiness(input: ScoreInput) {
  const { page, signals, hasLlmsTxt } = input;
  const metrics: Metrics = {
    statistics: (page.bodyText.match(STATISTIC_PATTERN) ?? []).length,
    externalLinks: page.links.filter((l) => !l.isInternal).length,
    questionHeadings: signals.subheadings.filter((h) =>
      QUESTION_HEADING_PATTERN.test(h),
    ).length,
  };
  const scoreInput = { ...input, ...metrics };
  const checks = [
    ...accessChecks(scoreInput),
    ...structureChecks(scoreInput),
    ...citabilityChecks(scoreInput),
    ...entityChecks(scoreInput),
  ];

  const categories: GeoCategoryScore[] = GEO_CATEGORIES.map((category) => ({
    category,
    score: categoryScore(checks.filter((c) => c.category === category)),
  }));
  const score = Math.round(
    categories.reduce((sum, c) => sum + c.score, 0) / categories.length,
  );

  return {
    score,
    categories,
    checks,
    stats: {
      wordCount: page.wordCount,
      ...metrics,
      schemaTypes: signals.schemaTypes,
      hasLlmsTxt,
    },
  };
}

// ---- Access: can the engines fetch and use the page at all? ---------------
function accessChecks({
  page,
  crawlers,
  hasLlmsTxt,
}: ScoreInput & Metrics): GeoCheck[] {
  const checks: GeoCheck[] = [];
  const add = (check: GeoCheck) => checks.push(check);
  const blockedSearch = crawlers.filter(
    (c) => c.purpose === "search" && !c.allowed,
  );
  const blockedTraining = crawlers.filter(
    (c) => c.purpose === "training" && !c.allowed,
  );
  add({
    id: "search-crawlers",
    category: "access",
    label: "AI search crawlers allowed",
    status: blockedSearch.length === 0 ? "pass" : "fail",
    detail:
      blockedSearch.length === 0
        ? "robots.txt lets every AI search crawler fetch this page."
        : `robots.txt blocks ${names(blockedSearch)}, so those engines can't read or cite this page.`,
    fix:
      blockedSearch.length === 0
        ? null
        : `Allow ${names(blockedSearch)} in robots.txt. Search crawlers only fetch pages to answer a user's question and link to the source.`,
    weight: 4,
  });
  add({
    id: "training-crawlers",
    category: "access",
    label: "AI training crawlers",
    status: blockedTraining.length === 0 ? "pass" : "warn",
    detail:
      blockedTraining.length === 0
        ? "Training crawlers are allowed, so models can learn your brand and facts."
        : `robots.txt blocks ${names(blockedTraining)}. Models trained without your pages know less about your brand.`,
    fix:
      blockedTraining.length === 0
        ? null
        : "Blocking training crawlers is a valid choice. If brand awareness in AI answers matters more than opting out, allow them.",
    weight: 1,
  });
  const noindex = /noindex|none/i.test(page.robotsMeta ?? "");
  add({
    id: "indexable",
    category: "access",
    label: "Page is indexable",
    status: noindex ? "fail" : "pass",
    detail: noindex
      ? `The robots meta tag says "${page.robotsMeta}", which keeps the page out of search and AI indexes.`
      : "No noindex directive on the page.",
    fix: noindex ? "Remove noindex from the robots meta tag." : null,
    weight: 3,
  });
  const contentWithoutJs = page.wordCount >= 150 && !page.javascriptShell;
  add({
    id: "server-rendered",
    category: "access",
    label: "Content readable without JavaScript",
    status: contentWithoutJs ? "pass" : page.wordCount >= 50 ? "warn" : "fail",
    detail: contentWithoutJs
      ? `${page.wordCount.toLocaleString()} words are in the HTML the server sends.`
      : `Only ${page.wordCount.toLocaleString()} words are in the server HTML. Most AI crawlers don't run JavaScript, so they see an almost empty page.`,
    fix: contentWithoutJs
      ? null
      : "Server-render or pre-render the main content so it is in the initial HTML.",
    weight: 3,
  });
  add({
    id: "llms-txt",
    category: "access",
    label: "llms.txt",
    status: hasLlmsTxt ? "pass" : "warn",
    detail: hasLlmsTxt
      ? "The site publishes /llms.txt, a map of its key pages for language models."
      : "No /llms.txt found.",
    fix: hasLlmsTxt
      ? null
      : "Publish /llms.txt: a short Markdown summary of the site with links to its most important pages.",
    weight: 1,
  });

  return checks;
}

// ---- Structure: can the engine lift a clean passage out of it? -------------
function structureChecks({
  page,
  signals,
  questionHeadings,
}: ScoreInput & Metrics): GeoCheck[] {
  const checks: GeoCheck[] = [];
  const add = (check: GeoCheck) => checks.push(check);
  const h1Count = page.h1s.length;
  add({
    id: "single-h1",
    category: "structure",
    label: "One clear H1",
    status: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warn",
    detail:
      h1Count === 1
        ? `H1: "${truncate(page.h1s[0], 80)}"`
        : h1Count === 0
          ? "The page has no H1, so its main topic is implicit."
          : `The page has ${h1Count} H1s, which blurs its main topic.`,
    fix:
      h1Count === 1 ? null : "Use exactly one H1 that names the page's topic.",
    weight: 2,
  });
  const skips = countHeadingSkips(page.headingOrder);
  const subheadingCount = page.headingOrder.filter((l) => l > 1).length;
  add({
    id: "heading-outline",
    category: "structure",
    label: "Logical heading outline",
    status:
      subheadingCount >= 2 && skips === 0
        ? "pass"
        : subheadingCount === 0
          ? "fail"
          : "warn",
    detail:
      subheadingCount === 0
        ? "No H2–H6 subheadings. Engines split pages into passages at headings."
        : skips > 0
          ? `${subheadingCount} subheadings, but the outline skips a level ${skips} time${skips === 1 ? "" : "s"}.`
          : `${subheadingCount} subheadings in a clean outline.`,
    fix:
      subheadingCount >= 2 && skips === 0
        ? null
        : "Break the content into sections with H2s and H3s, without skipping levels.",
    weight: 2,
  });
  add({
    id: "question-headings",
    category: "structure",
    label: "Question-style headings",
    status:
      questionHeadings >= 2 ? "pass" : questionHeadings === 1 ? "warn" : "fail",
    detail:
      questionHeadings > 0
        ? `${questionHeadings} heading${questionHeadings === 1 ? " is" : "s are"} phrased as questions people ask.`
        : "No headings are phrased as questions.",
    fix:
      questionHeadings >= 2
        ? null
        : "Phrase some H2s as the questions buyers type into ChatGPT, and answer each in the first sentence below it.",
    weight: 2,
  });
  const scannable = signals.listCount + signals.tableCount;
  add({
    id: "lists-tables",
    category: "structure",
    label: "Lists and tables",
    status: scannable >= 2 ? "pass" : scannable === 1 ? "warn" : "fail",
    detail:
      scannable > 0
        ? `${signals.listCount} list${signals.listCount === 1 ? "" : "s"} and ${signals.tableCount} table${signals.tableCount === 1 ? "" : "s"}.`
        : "No lists or tables.",
    fix:
      scannable >= 2
        ? null
        : "Put steps, features and comparisons in lists or tables. Engines quote them almost verbatim.",
    weight: 1,
  });
  const avgSentence = averageSentenceLength(page.bodyText);
  add({
    id: "clarity",
    category: "structure",
    label: "Concise sentences",
    status: avgSentence <= 20 ? "pass" : avgSentence <= 26 ? "warn" : "fail",
    detail: `Sentences average ${Math.round(avgSentence)} words.`,
    fix:
      avgSentence <= 20
        ? null
        : "Aim for about 20 words per sentence. Short, self-contained sentences are easier to quote.",
    weight: 1,
  });

  return checks;
}

// ---- Citability: is there something worth citing? --------------------------
function citabilityChecks({
  page,
  signals,
  statistics,
  externalLinks,
}: ScoreInput & Metrics): GeoCheck[] {
  const checks: GeoCheck[] = [];
  const add = (check: GeoCheck) => checks.push(check);
  const lowerText = page.bodyText.toLowerCase();
  add({
    id: "statistics",
    category: "citability",
    label: "Concrete numbers and statistics",
    status: statistics >= 5 ? "pass" : statistics >= 2 ? "warn" : "fail",
    detail: `${statistics} statistic${statistics === 1 ? "" : "s"}, percentages or figures found.`,
    fix:
      statistics >= 5
        ? null
        : "Add specific numbers: prices, percentages, benchmarks, dates. Answers favor sources with hard facts.",
    weight: 3,
  });
  const sourcing = SOURCING_PHRASES.filter((p) => lowerText.includes(p)).length;
  add({
    id: "sourcing",
    category: "citability",
    label: "Claims backed by sources",
    status:
      sourcing >= 2 && externalLinks >= 2
        ? "pass"
        : sourcing >= 1 || externalLinks >= 1
          ? "warn"
          : "fail",
    detail: `${sourcing} sourcing phrase${sourcing === 1 ? "" : "s"} ("according to", "study"…) and ${externalLinks} outbound link${externalLinks === 1 ? "" : "s"}.`,
    fix:
      sourcing >= 2 && externalLinks >= 2
        ? null
        : 'Attribute claims ("according to…") and link to the studies and data you cite.',
    weight: 2,
  });
  add({
    id: "depth",
    category: "citability",
    label: "Substantial content",
    status:
      page.wordCount >= 600 ? "pass" : page.wordCount >= 300 ? "warn" : "fail",
    detail: `${page.wordCount.toLocaleString()} words of visible content.`,
    fix:
      page.wordCount >= 600
        ? null
        : "Cover the topic fully. Thin pages rarely get chosen as a source.",
    weight: 2,
  });
  add({
    id: "freshness",
    category: "citability",
    label: "Visible publish or update date",
    status: signals.hasDate ? "pass" : "warn",
    detail: signals.hasDate
      ? "The page declares when it was published or updated."
      : "No publish or modified date found.",
    fix: signals.hasDate
      ? null
      : 'Add dateModified to your schema and a visible "Updated" date. Engines prefer recent sources.',
    weight: 1,
  });

  return checks;
}

const STATUS_CREDIT = { pass: 1, warn: 0.5, fail: 0 } as const;

function categoryScore(checks: GeoCheck[]) {
  const total = checks.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return 0;
  const earned = checks.reduce(
    (sum, c) => sum + c.weight * STATUS_CREDIT[c.status],
    0,
  );
  return Math.round((earned / total) * 100);
}

function countHeadingSkips(levels: number[]) {
  let skips = 0;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) skips++;
  }
  return skips;
}

function averageSentenceLength(text: string) {
  const sentences = text
    .split(/[.!?]+\s/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);
  if (sentences.length === 0) return 0;
  const words = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
  return words / sentences.length;
}

function names(crawlers: GeoCrawler[]) {
  return crawlers.map((c) => c.userAgent).join(", ");
}
