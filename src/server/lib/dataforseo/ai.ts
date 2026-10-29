import { z } from "zod";
import {
  llmAggregatedTotalSchema,
  llmCrossAggregatedItemSchema,
  llmMentionItemSchema,
  llmTopPagesItemSchema,
  type LlmAggregatedTotal,
  type LlmCrossAggregatedItem,
  type LlmMentionItem,
  type LlmTopPagesItem,
} from "@/server/lib/dataforseoLlmSchemas";
import { createDataforseoBillingClassifier } from "@/server/lib/dataforseoBillingClassification";
import { AppError } from "@/server/lib/errors";
import { dataforseoPost } from "@/server/lib/dataforseo/core";
import type { LlmPlatform, LlmTarget } from "@/server/lib/dataforseo/shared";
import {
  assertOk,
  buildTaskBilling,
  isRecord,
  type DataforseoApiResponse,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";

const classifyAiSearchError = createDataforseoBillingClassifier({
  pathPrefix: "/ai_optimization/",
  billingIssueCode: "AI_SEARCH_BILLING_ISSUE",
  billingIssueMessage:
    "The connected DataForSEO account has a billing or balance issue",
});

const assertOptions = (path: string) =>
  ({ classify: classifyAiSearchError, classifyPath: path }) as const;

function clampLimit(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

// Request default shared with pricing.ts, whose estimate must reserve for
// what this module actually sends.
export function resolveLlmMentionsLimit(limit?: number): number {
  return clampLimit(limit ?? 100, 1, 1000);
}

function targetList(target: LlmTarget): LlmTarget[] {
  return [target];
}

function firstResult(task: DataforseoTaskLike): Record<string, unknown> | null {
  const first = task.result?.[0];
  return isRecord(first) ? first : null;
}

// ---------------------------------------------------------------------------
// LLM Mentions Search
// ---------------------------------------------------------------------------

type LlmMentionsSearchInput = {
  target: LlmTarget;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  limit?: number;
  orderBy?: string[];
};

export async function fetchLlmMentionsSearch(
  input: LlmMentionsSearchInput,
): Promise<DataforseoApiResponse<LlmMentionItem[]>> {
  const response = await dataforseoPost(
    "/v3/ai_optimization/llm_mentions/search/live",
    [
      {
        target: targetList(input.target),
        platform: input.platform,
        location_code: input.locationCode,
        language_code: input.languageCode,
        limit: resolveLlmMentionsLimit(input.limit),
        order_by: input.orderBy,
      },
    ],
    { classify: classifyAiSearchError },
  );
  const task = assertOk(
    response,
    assertOptions("/v3/ai_optimization/llm_mentions/search/live"),
  );

  const items = z
    .array(llmMentionItemSchema)
    .safeParse(firstResult(task)?.items ?? []);
  if (!items.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO llm_mentions/search returned an invalid mention items shape",
    );
  }
  return { data: items.data, billing: buildTaskBilling(task) };
}

// ---------------------------------------------------------------------------
// LLM Mentions Aggregated Metrics
// ---------------------------------------------------------------------------

type LlmAggregatedMetricsInput = {
  target: LlmTarget;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  internalListLimit?: number;
};

export async function fetchLlmAggregatedMetrics(
  input: LlmAggregatedMetricsInput,
): Promise<DataforseoApiResponse<LlmAggregatedTotal>> {
  const response = await dataforseoPost(
    "/v3/ai_optimization/llm_mentions/aggregated_metrics/live",
    [
      {
        target: targetList(input.target),
        platform: input.platform,
        location_code: input.locationCode,
        language_code: input.languageCode,
        internal_list_limit: clampLimit(input.internalListLimit ?? 10, 1, 20),
      },
    ],
    { classify: classifyAiSearchError },
  );
  const task = assertOk(
    response,
    assertOptions("/v3/ai_optimization/llm_mentions/aggregated_metrics/live"),
  );

  const total = llmAggregatedTotalSchema.safeParse(
    firstResult(task)?.total ?? {},
  );
  if (!total.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO llm_mentions/aggregated_metrics returned an invalid shape",
    );
  }
  return { data: total.data, billing: buildTaskBilling(task) };
}

// ---------------------------------------------------------------------------
// LLM Mentions Top Pages
// ---------------------------------------------------------------------------

type LlmTopPagesInput = {
  target: LlmTarget;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  itemsListLimit?: number;
};

export async function fetchLlmTopPages(
  input: LlmTopPagesInput,
): Promise<DataforseoApiResponse<LlmTopPagesItem[]>> {
  const response = await dataforseoPost(
    "/v3/ai_optimization/llm_mentions/top_pages/live",
    [
      {
        target: targetList(input.target),
        platform: input.platform,
        location_code: input.locationCode,
        language_code: input.languageCode,
        links_scope: "sources",
        items_list_limit: clampLimit(input.itemsListLimit ?? 10, 1, 10),
        internal_list_limit: 5,
      },
    ],
    { classify: classifyAiSearchError },
  );
  const task = assertOk(
    response,
    assertOptions("/v3/ai_optimization/llm_mentions/top_pages/live"),
  );

  const items = z
    .array(llmTopPagesItemSchema)
    .safeParse(firstResult(task)?.items ?? []);
  if (!items.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO llm_mentions/top_pages returned an invalid shape",
    );
  }
  return { data: items.data, billing: buildTaskBilling(task) };
}

// ---------------------------------------------------------------------------
// LLM Mentions Cross-Aggregated Metrics
// Compares 2..10 aggregation groups (target + competitors) in one call and
// returns one item per group, keyed by its aggregation_key (brand label).
// ---------------------------------------------------------------------------

type LlmCrossAggregatedMetricsInput = {
  groups: Array<{ key: string; target: LlmTarget }>;
  platform: LlmPlatform;
  locationCode: number;
  languageCode: string;
  internalListLimit?: number;
};

export async function fetchLlmCrossAggregatedMetrics(
  input: LlmCrossAggregatedMetricsInput,
): Promise<DataforseoApiResponse<LlmCrossAggregatedItem[]>> {
  if (input.groups.length < 2 || input.groups.length > 10) {
    throw new AppError(
      "VALIDATION_ERROR",
      "DataForSEO llm_mentions/cross_aggregated_metrics requires 2 to 10 target groups",
    );
  }

  const response = await dataforseoPost(
    "/v3/ai_optimization/llm_mentions/cross_aggregated_metrics/live",
    [
      {
        targets: input.groups.map((group) => ({
          aggregation_key: group.key,
          target: targetList(group.target),
        })),
        platform: input.platform,
        location_code: input.locationCode,
        language_code: input.languageCode,
        internal_list_limit: clampLimit(input.internalListLimit ?? 5, 1, 10),
      },
    ],
    { classify: classifyAiSearchError },
  );
  const task = assertOk(
    response,
    assertOptions(
      "/v3/ai_optimization/llm_mentions/cross_aggregated_metrics/live",
    ),
  );

  const items = z
    .array(llmCrossAggregatedItemSchema)
    .safeParse(firstResult(task)?.items ?? []);
  if (!items.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO llm_mentions/cross_aggregated_metrics returned an invalid shape",
    );
  }
  return { data: items.data, billing: buildTaskBilling(task) };
}
