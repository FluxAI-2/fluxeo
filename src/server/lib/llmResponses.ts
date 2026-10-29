import { z } from "zod";
import { supportsWebSearchCountry } from "@/shared/prompt-search-countries";
import type { LlmResponseResult } from "@/server/lib/dataforseoLlmSchemas";
import {
  DataforseoChargedTaskError,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import type { LlmResponseModelSlug } from "@/server/lib/llmResponseModels";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

// Answers to a single user prompt from ChatGPT, Claude, Gemini and Perplexity,
// through OpenRouter. Raw fetch rather than the AI SDK provider: the provider
// doesn't know the `openrouter:web_search` server tool, and its sources lose
// which message text each citation came from.
// https://openrouter.ai/docs/guides/features/server-tools/web-search
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

// Search-backed answers can take a minute or more.
const REQUEST_TIMEOUT_MS = 150_000;

// Claude can otherwise search many times per answer, and each search is
// billed. OpenRouter forwards `max_uses` only to Anthropic.
const MAX_SEARCHES = 3;

export const LLM_RESPONSE_WEB_SEARCH_DEFAULT = true;

// Upper-bound USD for one answer at the 4096-token output cap, read against
// the metered estimate before the call (see pricing.ts). uncalibrated: from
// OpenRouter list prices on 2026-10-27 for the model each slug resolves to —
// output at the cap, a padded input bill for searched pages, and the
// provider's per-search fee for up to MAX_SEARCHES searches. Recalibrate
// against the `usage.cost` OpenRouter reports.
const LLM_RESPONSE_USD: Record<
  LlmResponseModelSlug,
  { webSearch: number; noSearch: number }
> = {
  // gpt-5.6-luna: $0.2/M in, $1.2/M out, $0.01 per search.
  chat_gpt: { webSearch: 0.06, noSearch: 0.01 },
  // claude-sonnet-5.5: $2/M in, $10/M out, $0.01 per search.
  claude: { webSearch: 0.2, noSearch: 0.05 },
  // gemini-3.1-pro-preview: $2/M in, $12/M out, $0.014 per search.
  gemini: { webSearch: 0.15, noSearch: 0.06 },
  // sonar-reasoning-pro: $2/M in, $8/M out, and it always searches.
  perplexity: { webSearch: 0.06, noSearch: 0.06 },
};

/** Estimated USD for one answer at the 4096-token output cap. */
export function llmResponseUsd(
  modelSlug: LlmResponseModelSlug,
  webSearch: boolean,
): number {
  const price = LLM_RESPONSE_USD[modelSlug];
  return webSearch ? price.webSearch : price.noSearch;
}

function clampLimit(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

const completionSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          annotations: z
            .array(
              z.object({
                type: z.string(),
                url_citation: z
                  .object({
                    url: z.string(),
                    title: z.string().nullable().optional(),
                  })
                  .optional(),
              }),
            )
            .nullable()
            .optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      completion_tokens: z.number().optional(),
      cost: z.number().optional(),
    })
    .optional(),
});

const costSchema = z.object({ usage: z.object({ cost: z.number() }) });

type LlmResponsesInput = {
  userPrompt: string;
  modelSlug: LlmResponseModelSlug;
  /** OpenRouter model id, from resolveLatestLlmModelName. */
  modelName: string;
  webSearch?: boolean;
  maxOutputTokens?: number;
  /** Two-letter ISO country code used to geolocate the web-search component. */
  webSearchCountryCode?: string;
};

function searchOptions(input: LlmResponsesInput, webSearch: boolean) {
  const country = webSearch ? input.webSearchCountryCode : undefined;
  const userLocation = country
    ? { user_location: { type: "approximate", country } }
    : {};
  // Perplexity's Sonar models always search natively; a search tool on top
  // would only add a second, separately billed search. They take the country
  // through web_search_options instead.
  if (input.modelSlug === "perplexity") {
    return country ? { web_search_options: userLocation } : {};
  }
  if (!webSearch) return {};
  return {
    tools: [
      {
        type: "openrouter:web_search",
        parameters: { max_uses: MAX_SEARCHES, ...userLocation },
      },
    ],
  };
}

function upstreamError(status: number, detail: string): AppError {
  if (status === 402) {
    return new AppError(
      "AI_SEARCH_BILLING_ISSUE",
      "The connected OpenRouter account has a billing or balance issue",
    );
  }
  if (status === 401 || status === 403) {
    return new AppError(
      "INTERNAL_ERROR",
      `OpenRouter rejected the API key (${status}): ${detail}`,
    );
  }
  // OpenRouter bills only completed generations, so a failed request is free
  // to retry.
  if (status === 408 || status === 429 || status >= 500) {
    return new AppError(
      "UPSTREAM_UNAVAILABLE",
      `OpenRouter request failed (${status}): ${detail}`,
    );
  }
  return new AppError(
    "INTERNAL_ERROR",
    `OpenRouter request failed (${status}): ${detail}`,
  );
}

export async function fetchLlmResponse(
  input: LlmResponsesInput,
): Promise<DataforseoApiResponse<LlmResponseResult>> {
  const webSearch = input.webSearch ?? LLM_RESPONSE_WEB_SEARCH_DEFAULT;
  if (
    webSearch &&
    input.webSearchCountryCode &&
    !supportsWebSearchCountry(input.modelSlug, input.webSearchCountryCode)
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Unsupported web-search country ${input.webSearchCountryCode} for ${input.modelSlug}`,
    );
  }
  const apiKey = await getRequiredEnvValue("OPENROUTER_API_KEY");
  const path = ["openrouter", input.modelSlug, "llm_responses"];

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.modelName,
      messages: [{ role: "user", content: input.userPrompt }],
      // Reasoning models count hidden reasoning against this budget.
      max_tokens: clampLimit(input.maxOutputTokens ?? 1024, 256, 4096),
      usage: { include: true },
      ...searchOptions(input, webSearch),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw upstreamError(response.status, (await response.text()).slice(0, 300));
  }

  const body: unknown = await response.json();
  // Read the cost before validating the rest: OpenRouter has already billed a
  // completed generation, so a malformed body must still be metered.
  const cost = costSchema.safeParse(body);
  const billing = { path, costUsd: cost.success ? cost.data.usage.cost : 0 };
  if (!cost.success) {
    // Without usage accounting the real spend is unknown; meter the estimate
    // rather than nothing.
    console.error("openrouter.llm-responses.cost-missing", input.modelName);
    billing.costUsd = llmResponseUsd(input.modelSlug, webSearch);
  }
  const parsed = completionSchema.safeParse(body);
  if (!parsed.success) {
    throw new DataforseoChargedTaskError(
      "OpenRouter returned an invalid completion shape",
      billing,
    );
  }

  const message = parsed.data.choices[0].message;
  const annotations = (message.annotations ?? []).flatMap((annotation) =>
    annotation.type === "url_citation" && annotation.url_citation
      ? [
          {
            type: "url_citation",
            title: annotation.url_citation.title ?? null,
            url: annotation.url_citation.url,
          },
        ]
      : [],
  );
  return {
    data: {
      model_name: parsed.data.model ?? input.modelName,
      output_tokens: parsed.data.usage?.completion_tokens ?? null,
      // Citations are the only evidence a search ran: the model may decide
      // not to search, and Prompt Explorer retries an answer without them.
      web_search: annotations.length > 0,
      items: [
        {
          type: "message",
          sections: [
            { type: "text", text: message.content ?? "", annotations },
          ],
        },
      ],
      fan_out_queries: null,
    },
    billing,
  };
}
