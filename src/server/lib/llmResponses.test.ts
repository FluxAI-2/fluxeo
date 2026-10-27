import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { fetchLlmResponse } from "@/server/lib/llmResponses";

function completion(overrides: Record<string, unknown> = {}) {
  return Response.json({
    model: "anthropic/claude-sonnet-5.5",
    choices: [
      {
        message: {
          content: "Try OpenSEO.",
          annotations: [
            {
              type: "url_citation",
              url_citation: { url: "https://openseo.so/", title: "OpenSEO" },
            },
          ],
        },
      },
    ],
    usage: { completion_tokens: 42, cost: 0.031 },
    ...overrides,
  });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof stubFetch>): unknown {
  const body = fetchMock.mock.calls[0]?.[1]?.body;
  return typeof body === "string" ? JSON.parse(body) : null;
}

describe("fetchLlmResponse", () => {
  it("asks with a country-located search and returns cited text with OpenRouter's cost", async () => {
    const fetchMock = stubFetch(completion());

    const result = await fetchLlmResponse({
      userPrompt: "Best SEO tools?",
      modelSlug: "claude",
      modelName: "anthropic/claude-sonnet-5.5",
      webSearchCountryCode: "FI",
    });

    expect(requestBody(fetchMock)).toEqual({
      model: "anthropic/claude-sonnet-5.5",
      messages: [{ role: "user", content: "Best SEO tools?" }],
      max_tokens: 1024,
      usage: { include: true },
      tools: [
        {
          type: "openrouter:web_search",
          parameters: {
            max_uses: 3,
            user_location: { type: "approximate", country: "FI" },
          },
        },
      ],
    });
    expect(result).toEqual({
      data: {
        model_name: "anthropic/claude-sonnet-5.5",
        output_tokens: 42,
        web_search: true,
        items: [
          {
            type: "message",
            sections: [
              {
                type: "text",
                text: "Try OpenSEO.",
                annotations: [
                  {
                    type: "url_citation",
                    title: "OpenSEO",
                    url: "https://openseo.so/",
                  },
                ],
              },
            ],
          },
        ],
        fan_out_queries: null,
      },
      billing: {
        path: ["openrouter", "claude", "llm_responses"],
        costUsd: 0.031,
      },
    });
  });

  it("gives Perplexity the country without a second search tool", async () => {
    const fetchMock = stubFetch(completion());

    await fetchLlmResponse({
      userPrompt: "Best SEO tools?",
      modelSlug: "perplexity",
      modelName: "perplexity/sonar-reasoning-pro",
      webSearchCountryCode: "BG",
    });

    const body = requestBody(fetchMock);
    expect(body).toMatchObject({
      web_search_options: {
        user_location: { type: "approximate", country: "BG" },
      },
    });
    expect(body).not.toHaveProperty("tools");
  });

  it("rejects a country the model can't search before a paid dispatch", async () => {
    const fetchMock = stubFetch(completion());

    await expect(
      fetchLlmResponse({
        userPrompt: "Find local studios",
        modelSlug: "gemini",
        modelName: "google/gemini-3.1-pro-preview",
        webSearchCountryCode: "US",
      }),
    ).rejects.toThrow(/Unsupported web-search country/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("meters a billed answer whose body is malformed", async () => {
    stubFetch(Response.json({ choices: [], usage: { cost: 0.02 } }));

    const rejection = fetchLlmResponse({
      userPrompt: "x",
      modelSlug: "chat_gpt",
      modelName: "openai/gpt-5.6-luna",
    });

    await expect(rejection).rejects.toBeInstanceOf(DataforseoChargedTaskError);
    await expect(rejection).rejects.toMatchObject({
      billing: { costUsd: 0.02 },
    });
  });

  it.each([
    [502, "UPSTREAM_UNAVAILABLE"],
    [402, "AI_SEARCH_BILLING_ISSUE"],
  ])("maps HTTP %i to %s without retrying", async (status, code) => {
    const fetchMock = stubFetch(new Response("failed", { status }));

    await expect(
      fetchLlmResponse({
        userPrompt: "x",
        modelSlug: "chat_gpt",
        modelName: "openai/gpt-5.6-luna",
      }),
    ).rejects.toMatchObject({ code });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
