import { describe, expect, it, vi } from "vitest";

const fetchPagespeedLighthouseMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/lib/pagespeedLighthouse", () => ({
  fetchPagespeedLighthouse: fetchPagespeedLighthouseMock,
}));

vi.mock("@/server/lib/r2", () => ({
  putTextToR2: vi.fn(),
}));

import { fetchLighthouseResult, selectLighthouseSample } from "./lighthouse";

const okPage = (url: string) => ({
  url,
  statusCode: 200,
  fetchClass: "ok" as const,
});

describe("selectLighthouseSample", () => {
  it("does not spend checks on a bot challenge that answered 200", () => {
    const selected = selectLighthouseSample(
      [
        { ...okPage("https://example.com/"), fetchClass: "blocked" },
        okPage("https://example.com/about"),
      ],
      "https://example.com/",
      "auto",
    );

    expect(selected).toEqual(["https://example.com/about"]);
  });

  it("includes a start page reached through a trailing-slash redirect", () => {
    const pages = [
      ...Array.from({ length: 10 }, (_, index) =>
        okPage(`https://example.com/section${index}`),
      ),
      okPage("https://example.com/services/"),
    ];

    const selected = selectLighthouseSample(
      pages,
      "https://example.com/services",
      "auto",
    );

    expect(selected).toHaveLength(10);
    expect(selected[0]).toBe("https://example.com/services/");
  });

  it("prefers an exact start page when both slash forms return 2xx", () => {
    const selected = selectLighthouseSample(
      [
        okPage("https://example.com/services/"),
        okPage("https://example.com/services"),
      ],
      "https://example.com/services",
      "auto",
    );

    expect(selected[0]).toBe("https://example.com/services");
  });

  it("does not sample another page from the start page's template", () => {
    const selected = selectLighthouseSample(
      [
        okPage("https://example.com/products/123"),
        okPage("https://example.com/products/456"),
        okPage("https://example.com/about"),
      ],
      "https://example.com/products/123",
      "auto",
    );

    expect(selected).toEqual([
      "https://example.com/products/123",
      "https://example.com/about",
    ]);
  });
});

describe("fetchLighthouseResult", () => {
  // The audit workflow relies on provider failures never rejecting: they
  // land on the audit row instead.
  it("turns a failed check into an error row", async () => {
    fetchPagespeedLighthouseMock.mockRejectedValue(
      new Error("Lighthouse returned error: NO_FCP."),
    );

    const fetched = await fetchLighthouseResult(
      "https://example.com/",
      "page-1",
      "desktop",
    );

    expect(fetchPagespeedLighthouseMock).toHaveBeenCalledOnce();
    expect(fetched.result.errorMessage).toBe(
      "Lighthouse returned error: NO_FCP.",
    );
  });
});
