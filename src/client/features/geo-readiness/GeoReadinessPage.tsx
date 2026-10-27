import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  FileSearch,
  Globe,
  Quote,
  ShieldCheck,
  Sparkles,
  Tags,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { sortBy } from "remeda";
import { cn } from "cn";
import { checkGeoReadiness } from "@/serverFunctions/geo-readiness";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { QueryError } from "@/client/components/QueryState";
import { PageHeader, SectionHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Card } from "@/client/components/ui/card";
import { Badge } from "@/client/components/ui/badge";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  GEO_CATEGORIES,
  GEO_READINESS_MAX_URL_LENGTH,
  type GeoCategory,
  type GeoCheck,
  type GeoCrawler,
  type GeoReadinessResult,
} from "@/types/schemas/geo-readiness";
import { GeoScoreRing, scoreTone } from "./GeoScoreRing";

const CATEGORY_META: Record<
  GeoCategory,
  { label: string; blurb: string; icon: LucideIcon }
> = {
  access: {
    label: "AI crawler access",
    blurb: "Can the engines fetch and read the page?",
    icon: ShieldCheck,
  },
  structure: {
    label: "Structure",
    blurb: "Can they lift a clean answer out of it?",
    icon: FileSearch,
  },
  citability: {
    label: "Citability",
    blurb: "Is there something worth citing?",
    icon: Quote,
  },
  entity: {
    label: "Entity signals",
    blurb: "Do they know what and who this is?",
    icon: Tags,
  },
};

const STATUS_ORDER = { fail: 0, warn: 1, pass: 2 } as const;

export function GeoReadinessPage({
  projectId,
  url,
  onUrlChange,
}: {
  projectId: string;
  url: string | undefined;
  onUrlChange: (url: string | undefined) => void;
}) {
  const projectsQuery = useQuery(projectsQueryOptions());
  const projectDomain = projectsQuery.data?.find(
    (p) => p.id === projectId,
  )?.domain;
  const [draft, setDraft] = useState(url ?? "");

  const query = useQuery({
    queryKey: ["geoReadiness", projectId, url],
    queryFn: () => checkGeoReadiness({ data: { projectId, url: url ?? "" } }),
    enabled: Boolean(url),
    staleTime: 5 * 60_000,
    retry: false,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim() || projectDomain || "";
    if (!next) return;
    setDraft(next);
    if (next === url) void query.refetch();
    else onUrlChange(next);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            GEO Readiness
            <Badge className="bg-ai text-white">AI</Badge>
          </span>
        }
        description="How well a page can be crawled, understood and cited by ChatGPT, Claude, Perplexity and Google AI."
      />

      <form
        onSubmit={submit}
        className="glass flex flex-col gap-2 rounded-[22px] p-2 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-label-secondary" />
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={GEO_READINESS_MAX_URL_LENGTH}
            placeholder={projectDomain ?? "https://example.com/page"}
            aria-label="Page URL"
            className="h-11 rounded-2xl border-transparent bg-transparent pl-10 text-[0.9375rem] shadow-none focus-visible:bg-card"
          />
        </div>
        <Button type="submit" variant="ai" size="lg" pending={query.isFetching}>
          <Sparkles />
          Analyze page
        </Button>
      </form>

      {!url ? (
        <IntroCards />
      ) : query.isPending ? (
        <ResultSkeleton />
      ) : query.isError ? (
        <QueryError
          error={query.error}
          fallback="We couldn't read that page. Check the URL and that the site is reachable."
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      ) : (
        <Results result={query.data} />
      )}
    </div>
  );
}

function Results({ result }: { result: GeoReadinessResult }) {
  const tone = scoreTone(result.score);
  const failing = result.checks.filter((c) => c.status !== "pass");
  return (
    <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <Card className="flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8 sm:px-6">
        <GeoScoreRing score={result.score}>
          <div>
            <div className="text-[2.75rem] leading-none font-bold tracking-[-0.04em] tabular-nums">
              {result.score}
            </div>
            <div className="mt-1 text-footnote font-medium text-label-secondary">
              GEO score
            </div>
          </div>
        </GeoScoreRing>
        <div className="min-w-0 flex-1 space-y-3 px-5 text-center sm:px-0 sm:text-left">
          <div className="space-y-1">
            <div className="text-title-2" style={{ color: tone.color }}>
              {tone.label}
            </div>
            <p className="text-label-secondary">
              {failing.length === 0
                ? "This page passes every check. Generative engines can fetch, parse and cite it."
                : `${failing.length} improvement${failing.length === 1 ? "" : "s"} would make this page easier for AI engines to cite.`}
            </p>
          </div>
          <div className="min-w-0 truncate text-footnote text-label-tertiary">
            {result.title ? `${result.title} · ` : ""}
            <a
              href={result.finalUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary"
            >
              {result.finalUrl}
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
            <Stat label="words" value={result.stats.wordCount} />
            <Stat label="statistics" value={result.stats.statistics} />
            <Stat label="outbound links" value={result.stats.externalLinks} />
            <Stat
              label="question headings"
              value={result.stats.questionHeadings}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {result.categories.map(({ category, score }) => {
          const meta = CATEGORY_META[category];
          const Icon = meta.icon;
          return (
            <Card key={category} size="sm" className="gap-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div className="grid size-8 place-items-center rounded-[10px] bg-fill-tertiary">
                  <Icon className="size-4 text-label-secondary" />
                </div>
                <GeoScoreRing score={score} size={36} stroke={4.5}>
                  <span className="text-[0.625rem] font-semibold tabular-nums">
                    {score}
                  </span>
                </GeoScoreRing>
              </div>
              <div>
                <div className="font-semibold">{meta.label}</div>
                <div className="text-footnote text-label-secondary">
                  {meta.blurb}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="space-y-3">
          <SectionHeader
            title="What to fix"
            hint="Sorted by impact. Each check explains what we found and how to fix it."
          />
          <Card className="gap-0 py-0">
            {sortBy(result.checks, (check) => STATUS_ORDER[check.status], [
              (check) => check.weight,
              "desc",
            ]).map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </Card>
        </section>
        <section className="space-y-3">
          <SectionHeader
            title="AI crawlers"
            hint="What robots.txt allows for this page."
          />
          <Card className="gap-0 py-1.5">
            {result.crawlers.map((crawler) => (
              <CrawlerRow key={crawler.userAgent} crawler={crawler} />
            ))}
          </Card>
          {result.stats.schemaTypes.length > 0 ? (
            <Card size="sm" className="gap-2 px-4">
              <div className="text-footnote font-semibold text-label-secondary">
                Schema types
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.stats.schemaTypes.map((type) => (
                  <Badge key={type} variant="secondary">
                    {type}
                  </Badge>
                ))}
              </div>
            </Card>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full bg-fill-tertiary px-2.5 py-1 text-footnote">
      <span className="font-semibold tabular-nums">
        {value.toLocaleString()}
      </span>
      <span className="text-label-secondary">{label}</span>
    </span>
  );
}

const STATUS_ICON = {
  pass: { icon: CheckCircle2, className: "text-sys-green" },
  warn: { icon: CircleAlert, className: "text-sys-orange" },
  fail: { icon: XCircle, className: "text-sys-red" },
} as const;

function CheckRow({ check }: { check: GeoCheck }) {
  const { icon: Icon, className } = STATUS_ICON[check.status];
  return (
    <div className="flex gap-3 border-b border-separator px-5 py-3.5 last:border-0">
      <Icon className={cn("mt-0.5 size-[1.125rem] shrink-0", className)} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{check.label}</span>
          <span className="text-footnote text-label-tertiary">
            {CATEGORY_META[check.category].label}
          </span>
        </div>
        <p className="text-label-secondary">{check.detail}</p>
        {check.fix ? (
          <p className="rounded-xl bg-fill-tertiary px-3 py-2 text-callout text-foreground/90">
            {check.fix}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CrawlerRow({ crawler }: { crawler: GeoCrawler }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          crawler.allowed ? "bg-sys-green" : "bg-sys-red",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[0.8125rem]">
          {crawler.userAgent}
        </div>
        <div className="text-footnote text-label-secondary">
          {crawler.operator}
          {crawler.purpose === "training" ? " · training only" : null}
        </div>
      </div>
      <span
        className={cn(
          "text-footnote font-semibold",
          crawler.allowed ? "text-sys-green" : "text-sys-red",
        )}
      >
        {crawler.allowed ? "Allowed" : "Blocked"}
      </span>
    </div>
  );
}

function IntroCards() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {GEO_CATEGORIES.map((category) => {
        const meta = CATEGORY_META[category];
        const Icon = meta.icon;
        return (
          <Card key={category} className="gap-3 px-5">
            <div className="grid size-10 place-items-center rounded-xl bg-ai text-white shadow-e2">
              <Icon className="size-5" />
            </div>
            <div className="space-y-1">
              <div className="text-headline">{meta.label}</div>
              <div className="text-label-secondary">{meta.blurb}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <Card className="flex-row items-center gap-8 px-6">
        <Skeleton className="size-[168px] rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
