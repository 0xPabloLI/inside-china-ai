import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { ensureMock } = vi.hoisted(() => ({ ensureMock: vi.fn() }));

vi.mock("../searxng/lifecycle.mjs", () => ({
  ensureSearxng: ensureMock,
  isLocalSearxngUrl: (url) =>
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(String(url ?? "")),
  isSearxngAutoStartEnabled: () => process.env.SEARXNG_AUTO_START !== "0",
}));

const originalAutoStart = process.env.SEARXNG_AUTO_START;

async function loadImageSearch() {
  vi.resetModules();
  return import("../short-video/lib/progressive-search.mjs");
}

beforeEach(() => {
  ensureMock.mockReset();
  ensureMock.mockResolvedValue({ ok: true, started: true });
  process.env.SEARXNG_AUTO_START = "1";
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [] }),
  });
});

afterEach(() => {
  if (originalAutoStart === undefined) delete process.env.SEARXNG_AUTO_START;
  else process.env.SEARXNG_AUTO_START = originalAutoStart;
});

describe("searchSearXngImages ensure hook", () => {
  it("ensures once before a local image search", async () => {
    const { searchSearXngImages } = await loadImageSearch();
    await searchSearXngImages("AI chip", { baseUrl: "http://localhost:8888" });
    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not ensure for a remote baseUrl", async () => {
    const { searchSearXngImages } = await loadImageSearch();
    await searchSearXngImages("AI chip", { baseUrl: "http://example.test:9999" });
    expect(ensureMock).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not ensure when SEARXNG_AUTO_START=0", async () => {
    process.env.SEARXNG_AUTO_START = "0";
    const { searchSearXngImages } = await loadImageSearch();
    await searchSearXngImages("AI chip", { baseUrl: "http://localhost:8888" });
    expect(ensureMock).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
