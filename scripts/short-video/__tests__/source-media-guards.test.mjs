/**
 * Tests for #75 Batch 1:
 *
 * 1. baidu_news CDP_MEDIA_CAPABILITIES entry (#77 疑点 1 修复): the source's
 *    notes claim "Articles + images from same DOM" but the entry was missing,
 *    so its media capability was unverifiable and its video capability
 *    unexploited. The entry reuses CDP_VIDEO_SCRIPT and derives imageScript
 *    from the articleScript's img extraction.
 * 2. Completeness guard: any source whose accessMethod.notes claims media
 *    from the same DOM MUST have a CDP_MEDIA_CAPABILITIES entry — the exact
 *    class of contradiction the audit caught.
 * 3. Zero-fallback list lock: AUTOGEN_EXCLUDED_SOURCES is design-intentional
 *    (search engines/image libraries get no site: fallback); a new source
 *    accidentally landing in the zero-fallback group must be caught.
 */
import { describe, it, expect } from "vitest";
import { join } from "path";
import { ALL_SOURCES, AUTOGEN_EXCLUDED_SOURCES } from "../lib/source-registry.mjs";

// ALL_SOURCES ships pre-enriched capabilities (enrichWithCapabilities runs
// per universe list at module load).
const byName = Object.fromEntries(ALL_SOURCES.map((s) => [s.name, s]));

function capabilitiesOf(name) {
  return byName[name].capabilities;
}

describe("baidu_news media capabilities (#75 Batch 1)", () => {
  it("has a CDP_MEDIA_CAPABILITIES entry wired into capabilities.images", () => {
    const caps = capabilitiesOf("baidu_news");
    expect(caps.images).toBeTruthy();
    expect(caps.images.method).toBe("cdp");
    expect(typeof caps.images.imageScript).toBe("string");
    expect(caps.images.imageScript.length).toBeGreaterThan(50);
  });

  it("declares video capability reusing CDP_VIDEO_SCRIPT", () => {
    const caps = capabilitiesOf("baidu_news");
    expect(caps.videos).toBeTruthy();
    expect(caps.videos.method).toBe("cdp");
    expect(typeof caps.videos.videoScript).toBe("string");
    expect(caps.videos.videoScript).toContain("video");
    expect(typeof caps.videos.url).toBe("function");
  });

  it("imageScript keeps the article titles as provenance (sourceUrl)", () => {
    const caps = capabilitiesOf("baidu_news");
    // The entry must preserve the articleScript's per-item provenance shape.
    expect(caps.images.imageScript).toContain("sourceUrl");
    expect(caps.images.imageScript).toContain("type: 'image'");
  });
});

describe("CDP_MEDIA_CAPABILITIES completeness guard", () => {
  it("every source claiming same-DOM media in its notes has a media entry", () => {
    const claimers = ALL_SOURCES.filter((s) =>
      /images?\s+from\s+same\s+DOM/i.test(s.accessMethod?.notes ?? ""),
    );
    expect(claimers.length).toBeGreaterThan(0); // the claim pattern is real
    const missing = claimers.map((s) => s.name).filter((name) => !capabilitiesOf(name).images);
    expect(missing).toEqual([]);
  });
});

describe("zero-fallback list lock", () => {
  const articlesCapable = ALL_SOURCES.filter((s) => s.capabilities?.articles);

  it("exports AUTOGEN_EXCLUDED_SOURCES for the lock test", () => {
    expect(AUTOGEN_EXCLUDED_SOURCES).toBeInstanceOf(Set);
    expect(AUTOGEN_EXCLUDED_SOURCES.size).toBeGreaterThan(5);
  });

  it("every excluded source is a real source name (no stale entries)", () => {
    // The 2026-09-06 audit found a typo dead-entry (pexels_video vs
    // pexels-video) in this set — a lock catches that class.
    const stale = [...AUTOGEN_EXCLUDED_SOURCES].filter((name) => !byName[name]);
    expect(stale).toEqual([]);
  });

  it("zero-fallback articles sources stay inside the excluded set (snapshot)", () => {
    // A source is "zero-fallback" when no site: fallback was auto-generated
    // AND no explicit fallback layer exists. The audit counted 9 such sources
    // (设计内——聚合/搜索类自为兜底)；a future source silently landing in this
    // group must update the snapshot deliberately, not slip through.
    const zeroFallback = articlesCapable
      .filter(
        (s) =>
          !(s.googleSiteFallback || s.capabilities?.articles?.googleSiteFallback) &&
          !s.apiSearch &&
          !s.apiFallback &&
          !s.mcpFallback,
      )
      .map((s) => s.name)
      .sort();
    expect(zeroFallback).toEqual([
      "baidu_news",
      "baidu_search",
      "bing_news",
      "digg_search",
      "duckduckgo_search",
      "google_news",
      "polymarket_search",
      "techmeme_search",
      "wechat_dongchabeating",
    ]);
    for (const name of zeroFallback) {
      expect(AUTOGEN_EXCLUDED_SOURCES.has(name), name).toBe(true);
    }
  });
});
