import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import { fetchQuestionsAnswers } from "@/server/lib/dataforseo/business";
import { fetchLlmCrossAggregatedMetrics } from "@/server/lib/dataforseo/ai";
import { buildLlmTarget } from "@/server/lib/dataforseo/shared";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

describe("DataForSEO SDK-backed endpoints", () => {
  it("uses the live endpoint for Google Business Q&A and returns items + billing", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: [
              "v3",
              "business_data",
              "google",
              "questions_and_answers",
              "live",
            ],
            cost: 0.0006,
            result_count: 1,
            result: [
              {
                items: [
                  {
                    question_text: "Do you offer indoor storage?",
                    answer_text: "Yes.",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchQuestionsAnswers({
      keyword: "Acme Storage",
      locationCoordinate: "33.1234568,-84.9876543,5000",
      languageCode: "en",
      depth: 20,
    });

    expect(
      fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" || url instanceof URL
          ? url.toString()
          : url.url,
      ),
    ).toEqual([
      "https://api.dataforseo.com/v3/business_data/google/questions_and_answers/live",
    ]);
    expect(result.data).toEqual([
      { question_text: "Do you offer indoor storage?", answer_text: "Yes." },
    ]);
    expect(result.billing).toEqual({
      path: ["v3", "business_data", "google", "questions_and_answers", "live"],
      costUsd: 0.0006,
    });
  });

  it("serializes cross-aggregated target groups", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: [
              "v3",
              "ai_optimization",
              "llm_mentions",
              "cross_aggregated_metrics",
              "live",
            ],
            cost: 0.0001,
            result_count: 1,
            result: [{ items: [] }],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchLlmCrossAggregatedMetrics({
      groups: [
        {
          key: "example.com",
          target: buildLlmTarget({ type: "domain", value: "example.com" }),
        },
        {
          key: "Acme Storage",
          target: buildLlmTarget({ type: "keyword", value: "Acme Storage" }),
        },
      ],
      platform: "google",
      locationCode: 2840,
      languageCode: "en",
    });

    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1])).toEqual([
      {
        targets: [
          {
            aggregation_key: "example.com",
            target: [
              {
                search_scope: ["any"],
                search_filter: "include",
                domain: "example.com",
                include_subdomains: true,
              },
            ],
          },
          {
            aggregation_key: "Acme Storage",
            target: [
              {
                search_scope: ["any", "brand_entities"],
                search_filter: "include",
                keyword: "Acme Storage",
                match_type: "word_match",
              },
            ],
          },
        ],
        location_code: 2840,
        language_code: "en",
        platform: "google",
        internal_list_limit: 5,
      },
    ]);
  });
});
