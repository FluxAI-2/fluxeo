import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolveLatestLlmModelName } from "@/server/lib/llmResponseModels";

function stubCatalog(ids: string[]) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: ids.map((id) => ({ id })) })),
  );
}

// The catalog is cached for an hour at module level. Moving the clock two
// hours per test makes every test read its own stubbed catalog.
let clock = Date.UTC(2026, 0, 1);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock += 2 * 60 * 60 * 1000;
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
});

it("picks the newest plain flagship id, ignoring tier, batch and dated variants", async () => {
  stubCatalog([
    "anthropic/claude-sonnet-5",
    "anthropic/claude-sonnet-5.5",
    "anthropic/claude-sonnet-5.5:batch",
    "anthropic/claude-opus-5.5",
    "anthropic/claude-sonnet-4.6",
  ]);

  expect(await resolveLatestLlmModelName("claude")).toBe(
    "anthropic/claude-sonnet-5.5",
  );
});

it("prefers a GA Gemini Pro over its preview, and a newer preview over an older GA", async () => {
  stubCatalog([
    "google/gemini-2.5-pro",
    "google/gemini-3.1-pro-preview",
    "google/gemini-3.8-flash",
  ]);
  expect(await resolveLatestLlmModelName("gemini")).toBe(
    "google/gemini-3.1-pro-preview",
  );

  vi.setSystemTime((clock += 2 * 60 * 60 * 1000));
  stubCatalog(["google/gemini-3.1-pro-preview", "google/gemini-3.1-pro"]);
  expect(await resolveLatestLlmModelName("gemini")).toBe(
    "google/gemini-3.1-pro",
  );
});

it("keeps ChatGPT on its pinned tier while the catalog lists it", async () => {
  stubCatalog(["openai/gpt-5.6-luna", "openai/gpt-5.6-sol", "openai/gpt-5.5"]);

  expect(await resolveLatestLlmModelName("chat_gpt")).toBe(
    "openai/gpt-5.6-luna",
  );
});

it("falls back to the snapshot when the catalog is unreachable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockRejectedValue(new Error("network down")),
  );

  expect(await resolveLatestLlmModelName("perplexity")).toBe(
    "perplexity/sonar-reasoning-pro",
  );
});
