import { z } from "zod";

export type LlmResponseModelSlug =
  | "chat_gpt"
  | "claude"
  | "gemini"
  | "perplexity";

/**
 * OpenRouter model ids come from OpenRouter's FREE public catalog
 * (`GET /api/v1/models`, no key), so the app tracks new model families
 * without code changes: a hardcoded pin goes stale as providers ship. Unlike
 * DataForSEO, OpenRouter does not bill a request it rejects for an unknown
 * model, so a pick needs no separate validation before dispatch.
 */
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

const catalogSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

/**
 * Snapshot fallback (2026-10-27) used when the catalog is unreachable or
 * lists no flagship id: ids OpenRouter listed then, newest first.
 */
const FALLBACK_MODEL_IDS: Record<LlmResponseModelSlug, string[]> = {
  chat_gpt: ["openai/gpt-5.6-luna", "openai/gpt-5.5"],
  claude: ["anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-5"],
  gemini: ["google/gemini-3.1-pro-preview", "google/gemini-2.5-pro"],
  perplexity: ["perplexity/sonar-reasoning-pro", "perplexity/sonar-pro"],
};

/**
 * Explicit preferred model per provider, taking precedence over the
 * plain-id rule below while the catalog still lists it. ChatGPT is pinned to
 * the 5.6 tier by maintainer choice — the rule can't rank tier variants
 * (terra/sol/luna), and 5.6 is newer than the plain gpt-5.5 id.
 */
const PINNED_MODEL_IDS: Partial<Record<LlmResponseModelSlug, string>> = {
  chat_gpt: "openai/gpt-5.6-luna",
};

/**
 * The flagship id per provider: a plain family name. Suffixed variants
 * (mini/nano/-lite, tier names, `:batch`, `-image`, `-codex`) are size, speed
 * or modality tiers whose consumer-default semantics we can't know, so the
 * highest plain id is what "latest" means here. Gemini Pro ships as
 * `-preview` for months, so a preview counts, below a GA id of the same
 * version.
 */
const LATEST_RULES: Record<LlmResponseModelSlug, RegExp> = {
  chat_gpt: /^openai\/gpt-(\d+(?:\.\d+)*)$/,
  claude: /^anthropic\/claude-sonnet-(\d+(?:\.\d+)*)$/,
  gemini: /^google\/gemini-(\d+(?:\.\d+)*)-pro(-preview)?$/,
  perplexity: /^perplexity\/sonar-reasoning-pro$/,
};

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function pickLatestLlmModelId(
  slug: LlmResponseModelSlug,
  ids: string[],
): string {
  const pinned = PINNED_MODEL_IDS[slug];
  if (pinned && ids.includes(pinned)) return pinned;
  const rule = LATEST_RULES[slug];
  let best: { id: string; version: number[]; preview: boolean } | null = null;
  for (const id of ids) {
    const match = rule.exec(id);
    if (!match) continue;
    const version = (match[1] ?? "0").split(".").map(Number);
    const preview = Boolean(match[2]);
    const order = best ? compareVersions(version, best.version) : 1;
    if (order > 0 || (order === 0 && best?.preview && !preview)) {
      best = { id, version, preview };
    }
  }
  // No flagship id in the catalog: take the newest snapshot id it still
  // lists, so the pick is one OpenRouter serves.
  const fallback = FALLBACK_MODEL_IDS[slug];
  return best?.id ?? fallback.find((id) => ids.includes(id)) ?? fallback[0];
}

const CATALOG_TTL_MS = 60 * 60 * 1000;
const CATALOG_TIMEOUT_MS = 10_000;

// Per-isolate cache: one catalog serves every provider, and there's no reason
// to refetch it on every prompt. Failures are not cached, so a transient
// outage self-heals.
let catalogCache: { ids: string[]; fetchedAt: number } | null = null;

async function getOpenRouterModelIds(): Promise<string[] | null> {
  if (catalogCache && Date.now() - catalogCache.fetchedAt < CATALOG_TTL_MS) {
    return catalogCache.ids;
  }
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const ids = catalogSchema
      .parse(await response.json())
      .data.map((model) => model.id);
    if (ids.length === 0) return null;
    catalogCache = { ids, fetchedAt: Date.now() };
    return ids;
  } catch (error) {
    console.warn("openrouter.llm-models.catalog-fetch failed", error);
    return null;
  }
}

/** The OpenRouter model id to use for a provider, picked from the live catalog. */
export async function resolveLatestLlmModelName(
  slug: LlmResponseModelSlug,
): Promise<string> {
  const ids = await getOpenRouterModelIds();
  return ids ? pickLatestLlmModelId(slug, ids) : FALLBACK_MODEL_IDS[slug][0];
}
