/**
 * #636 — the same-DOM image harvest (enrichWithMedia) must respect the
 * source's own declaration that its DOM images are not usable assets.
 *
 * Why this exists: the article path is a second producer of the URL class the
 * ticket is about. `articleScript` results are cached by trends-utils as
 * `topics[].images[].url`, and the asset sourcer's Phase 0 replays them through
 * `loadCachedImages` as `source: "cached"` — so a card thumbnail harvested here
 * still reaches the download chain even with the media capabilities gone.
 *
 * The contract under test is the wiring plus the request the harvest makes:
 * the mocked `evalInTab` emulates the real script's gating (the real one only
 * fills `results.images` when it harvests), so the assertions are about the
 * observable outcome — whether an `imageUrl` comes back — not about the
 * script text. #945 added the script-text contract itself: the dispatched
 * script must parse as page JavaScript.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const capturedScripts = [];
const ARTICLE_URL = "https://publisher.example/deepseek-story";
const THUMBNAIL = "https://th.bing.com/th?id=OVFT.abc&pid=News";
const PAGE_VIDEO = "https://video.example/clip.mp4";
const PUBLISHED_TIME = "2026-10-15T00:00:00Z";

// `vi.hoisted` so the mock factory (hoisted above these declarations) can read
// the per-test article shape without hitting the temporal dead zone.
const extraction = vi.hoisted(() => ({ imageUrl: null }));

vi.mock("../lib/cdp-client.mjs", () => ({
  CDP_BASE: "http://localhost:3456",
  cdpNewTab: vi.fn(async () => "tab-636"),
  cdpCloseTab: vi.fn(async () => {}),
  waitForPageLoad: vi.fn(async () => true),
  // #945: media enrichment evaluates a script that returns an object, so it
  // must go through the value-transparent eval — not the array-only
  // extractFromTab, whose contract would turn this object into [].
  evalInTab: vi.fn(async (tabId, script) => {
    capturedScripts.push(script);
    const harvests = /harvestImages = true/.test(script);
    return {
      images: harvests ? { [ARTICLE_URL]: THUMBNAIL } : {},
      videos: { _page: [PAGE_VIDEO] },
      metadata: { publishedTime: PUBLISHED_TIME },
    };
  }),
  extractFromTab: vi.fn(async () => []),
  extractWithRetry: vi.fn(async () => [
    {
      title: "DeepSeek 具身智能",
      url: ARTICLE_URL,
      ...(extraction.imageUrl ? { imageUrl: extraction.imageUrl } : {}),
    },
  ]),
  rateLimitBackoffDelayMs: vi.fn(() => 0),
  detectAntiBot: vi.fn(async () => null),
  runPageGates: vi.fn(async () => ({ gate: "ok" })),
  ensureCdpProxy: vi.fn(async () => {}),
  ScriptError: class ScriptError extends Error {},
}));

import { collectFromSource } from "../search-sources.mjs";
import { evalInTab, ScriptError } from "../lib/cdp-client.mjs";

function testSource(overrides = {}) {
  return {
    name: "harvest_test",
    label: "Harvest Test",
    category: "news",
    supportsKeyword: true,
    accessMethod: { primary: "cdp" },
    needsAuth: false,
    useCleanTitle: false,
    url: () => "https://search.example/?q=deepseek",
    articleScript: "return [];",
    capabilities: { articles: {} },
    ...overrides,
  };
}

/**
 * Drive the real `collectFromSource` → `collectFromCdp` path with the CDP
 * client mocked. Fake timers only to step over the fixed page-load wait
 * (PAGE_LOAD_WAIT_MS) — otherwise each case would sit idle for 3 seconds.
 */
async function collect(source) {
  vi.useFakeTimers();
  try {
    const promise = collectFromSource(source, "DeepSeek", null, {
      // #269 pre-flight probe: keep the fake domain off the real network.
      probeFn: async (searchUrl) => ({ searchUrl, finalUrl: null, httpStatus: null }),
    });
    await vi.advanceTimersByTimeAsync(0); // let the chain reach the wait
    await vi.advanceTimersByTimeAsync(3000);
    return await promise;
  } finally {
    vi.useRealTimers();
  }
}

beforeEach(() => {
  capturedScripts.length = 0;
  extraction.imageUrl = null;
});

describe("#945 — the dispatched media script is valid page JavaScript", () => {
  it("parses the script that is actually sent to Runtime.evaluate", async () => {
    // The script is built inside a template literal: `\.` / `\/` are consumed
    // by the template and the page receives an unparseable regex literal
    // (SyntaxError: Invalid regular expression flags). Parsing the captured
    // text is the contract the old test missed.
    await collect(testSource());
    expect(capturedScripts).toHaveLength(1);
    expect(() => new Function(capturedScripts[0])).not.toThrow();
  });

  it("evaluates that script to an { images, videos, metadata } object", async () => {
    await collect(testSource());
    const links = [
      {
        href: ARTICLE_URL,
        querySelector: () => ({ src: THUMBNAIL }),
        parentElement: null,
        closest: () => null,
      },
    ];
    const documentStub = {
      querySelectorAll: (sel) => (sel === "a[href]" ? links : []),
      querySelector: (sel) =>
        sel === 'meta[property="article:published_time"]'
          ? { getAttribute: () => PUBLISHED_TIME }
          : null,
    };
    const runWithDom = new Function("document", capturedScripts[0]);
    const out = runWithDom(documentStub);
    expect(out).toMatchObject({
      images: { [ARTICLE_URL]: THUMBNAIL },
      videos: {},
      metadata: { publishedTime: PUBLISHED_TIME },
    });
  });

  it("falls back to og:article:published_time when the plain tag is absent", async () => {
    await collect(testSource());
    const documentStub = {
      querySelectorAll: () => [],
      querySelector: (sel) =>
        sel === 'meta[property="og:article:published_time"]'
          ? { getAttribute: () => PUBLISHED_TIME }
          : null,
    };
    const out = new Function("document", capturedScripts[0])(documentStub);
    expect(out.metadata).toEqual({ publishedTime: PUBLISHED_TIME });
  });
});

describe("#945 — a broken enrichment script is reported loudly, not swallowed", () => {
  it("keeps the articles but logs the ScriptError under its own prefix", async () => {
    evalInTab.mockRejectedValueOnce(
      new ScriptError("SyntaxError: Invalid regular expression flags"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const articles = await collect(testSource());
      // Media is optional — the article batch survives.
      expect(articles).toHaveLength(1);
      expect(articles[0].url).toBe(ARTICLE_URL);
      const logged = warn.mock.calls.flat().join("\n");
      expect(logged).toContain("media enrichment script broken");
      expect(logged).not.toContain("Media enrichment failed");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("#636 — DOM image harvest honours the source declaration", () => {
  it("fills imageUrl from the DOM when the source does not opt out", async () => {
    const articles = await collect(testSource());
    expect(articles).toHaveLength(1);
    expect(articles[0].imageUrl).toBe(THUMBNAIL);
    expect(articles[0].hasImage).toBe(true);
  });

  it("leaves imageUrl empty for a source declaring harvestImages: false", async () => {
    const articles = await collect(testSource({ harvestImages: false }));
    expect(articles).toHaveLength(1);
    // The article itself still arrives — only the unusable card image is gone.
    expect(articles[0].url).toBe(ARTICLE_URL);
    expect(articles[0].imageUrl ?? null).toBeNull();
    expect(articles[0].hasImage).toBe(false);
  });

  it("keeps video and metadata enrichment for that source", async () => {
    const articles = await collect(testSource({ harvestImages: false }));
    // The opt-out is about images only — the same eval still carries the
    // video signals and og-meta the news contract reads (#309).
    expect(articles[0].videoUrls).toEqual([PAGE_VIDEO]);
    expect(articles[0].metadata.publishedTime).toBe(PUBLISHED_TIME);
    // #309/#945: the metadata channel feeds the publishedAt promotion — a
    // page date now lands as a real assertion instead of dateDegraded.
    expect(articles[0].publishedAt).toBe("2026-10-15T00:00:00.000Z");
    expect(articles[0].dateDegraded).toBeUndefined();
    expect(capturedScripts).toHaveLength(1);
    expect(capturedScripts[0]).toContain("results.videos");
  });

  it("drops an imageUrl the extraction script itself emitted", async () => {
    // The second producer: a source whose articleScript still returns one
    // (bing_news's no longer does, but the gate must not depend on that).
    extraction.imageUrl = THUMBNAIL;
    const articles = await collect(testSource({ harvestImages: false }));
    expect(articles[0].imageUrl ?? null).toBeNull();
    expect(articles[0].hasImage).toBe(false);
  });

  it("keeps that extraction imageUrl for a source that did not opt out", async () => {
    extraction.imageUrl = "https://publisher.example/og.jpg";
    const articles = await collect(testSource());
    expect(articles[0].imageUrl).toBe("https://publisher.example/og.jpg");
  });
});
