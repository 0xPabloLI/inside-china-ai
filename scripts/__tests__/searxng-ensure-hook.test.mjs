import { describe, it, expect, vi, beforeEach } from "vitest";

const { ensureMock } = vi.hoisted(() => ({ ensureMock: vi.fn() }));

vi.mock("../searxng/lifecycle.mjs", () => ({ ensureSearxng: ensureMock }));

async function loadImageSearch() {
  vi.resetModules();
  return import("../short-video/lib/progressive-search.mjs");
}

beforeEach(() => {
  ensureMock.mockReset();
  ensureMock.mockResolvedValue({ ok: true, started: true });
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [] }),
  });
});

describe("searchSearXngImages ensure hook", () => {
  it("ensures before an image search", async () => {
    const { searchSearXngImages } = await loadImageSearch();
    await searchSearXngImages("AI chip", { baseUrl: "http://localhost:8888" });
    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("re-ensures on a later search so a mid-run park cannot poison it", async () => {
    const { searchSearXngImages } = await loadImageSearch();
    await searchSearXngImages("AI chip");
    await searchSearXngImages("robotaxi");
    expect(ensureMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent searches into one ensure", async () => {
    const { searchSearXngImages } = await loadImageSearch();
    ensureMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 5)),
    );
    await Promise.all([searchSearXngImages("a"), searchSearXngImages("b")]);
    expect(ensureMock).toHaveBeenCalledTimes(1);
  });
});
