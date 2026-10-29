import type { GeoCheck } from "@/types/schemas/geo-readiness";
import { truncate, type Metrics, type ScoreInput } from "./geoSignals";
// ---- Entity: do engines know what (and who) this is? -----------------------
export function entityChecks({
  page,
  signals,
}: ScoreInput & Metrics): GeoCheck[] {
  const checks: GeoCheck[] = [];
  const add = (check: GeoCheck) => checks.push(check);
  const titleLength = page.title.trim().length;
  add({
    id: "title",
    category: "entity",
    label: "Descriptive title",
    status:
      titleLength >= 30 && titleLength <= 65
        ? "pass"
        : titleLength > 0
          ? "warn"
          : "fail",
    detail:
      titleLength > 0
        ? `"${truncate(page.title, 80)}" (${titleLength} characters)`
        : "The page has no title.",
    fix:
      titleLength >= 30 && titleLength <= 65
        ? null
        : "Write a 30–65 character title that names the topic and your brand.",
    weight: 2,
  });
  const descLength = page.metaDescription.trim().length;
  add({
    id: "meta-description",
    category: "entity",
    label: "Meta description",
    status:
      descLength >= 70 && descLength <= 165
        ? "pass"
        : descLength > 0
          ? "warn"
          : "fail",
    detail:
      descLength > 0 ? `${descLength} characters.` : "No meta description.",
    fix:
      descLength >= 70 && descLength <= 165
        ? null
        : "Summarize the page in 70–165 characters. Engines often reuse it as the page's one-line description.",
    weight: 1,
  });
  const hasSchema = signals.schemaTypes.length > 0 || page.hasStructuredData;
  const hasEntitySchema = signals.schemaTypes.some((t) =>
    [
      "Organization",
      "LocalBusiness",
      "Person",
      "Product",
      "Brand",
      "Corporation",
      "SoftwareApplication",
    ].includes(t),
  );
  add({
    id: "structured-data",
    category: "entity",
    label: "Structured data",
    status: hasSchema ? (hasEntitySchema ? "pass" : "warn") : "fail",
    detail: hasSchema
      ? signals.schemaTypes.length > 0
        ? `Schema types: ${signals.schemaTypes.join(", ")}.`
        : "Structured data is present."
      : "No JSON-LD structured data.",
    fix: hasEntitySchema
      ? null
      : "Add JSON-LD for your Organization (or Product / Person) with name, logo, url and sameAs links, so engines can tie this page to your brand.",
    weight: 3,
  });
  const hasFaqSchema = signals.schemaTypes.some((t) =>
    [
      "FAQPage",
      "HowTo",
      "QAPage",
      "Article",
      "BlogPosting",
      "NewsArticle",
    ].includes(t),
  );
  add({
    id: "content-schema",
    category: "entity",
    label: "Content schema (Article, FAQ, HowTo)",
    status: hasFaqSchema ? "pass" : "warn",
    detail: hasFaqSchema
      ? "The page declares what kind of content it is."
      : "No Article, FAQPage or HowTo schema.",
    fix: hasFaqSchema
      ? null
      : "Mark up the content type: Article for posts, FAQPage for Q&A sections, HowTo for steps.",
    weight: 1,
  });
  const hasOpenGraph = Boolean(page.ogTitle && page.ogImage);
  add({
    id: "open-graph",
    category: "entity",
    label: "Open Graph tags",
    status: hasOpenGraph ? "pass" : "warn",
    detail: hasOpenGraph
      ? "og:title and og:image are set."
      : "og:title or og:image is missing.",
    fix: hasOpenGraph
      ? null
      : "Set og:title, og:description and og:image. AI answers show them in link previews.",
    weight: 1,
  });
  add({
    id: "canonical",
    category: "entity",
    label: "Canonical URL",
    status: page.canonical ? "pass" : "warn",
    detail: page.canonical
      ? `Canonical: ${truncate(page.canonical, 80)}`
      : "No canonical link.",
    fix: page.canonical
      ? null
      : "Add a canonical link so engines credit one URL instead of splitting citations across duplicates.",
    weight: 1,
  });
  return checks;
}
