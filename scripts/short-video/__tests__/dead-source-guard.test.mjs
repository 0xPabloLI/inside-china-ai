/**
 * Tests for #269 Phase 1 — dead-source detection + quarantine skip.
 *
 * Demonstrated failure (ithome, 2026-09): the search URL 404s / CDP gets
 * redirected to the homepage, so articleScript's link-grab fallback scrapes
 * 534 homepage links as "articles". articles.length > 0 then short-circuits
 * googleSiteFallback/mcpFallback and the trajectory records the CDP layer as
 * a success. Three guards close the loop:
 *
 *   1. URL pre-flight probe — HTTP >= 400 or redirect off the search path
 *      (e.g. to the site homepage) marks the layer dead-url and skips it.
 *   2. Keyword relevance guard — a large result set with 0 keyword hits in
 *      title/url is a false positive and is discarded (zero-result semantics).
 *   3. Quarantine — invalid/zero streaks >= QUARANTINE_THRESHOLD mark the
 *      source quarantined; later runs skip it until a manual clear or a
 *      passing probe recheck after QUARANTINE_RECHECK_DAYS.
 */
import { describe, it, expect } from "vitest";
import {
  QUARANTINE_THRESHOLD,
  QUARANTINE_RECHECK_DAYS,
  RELEVANCE_MIN_RESULTS,
  judgeUrlProbe,
  judgeUrlProbeForSource,
  isProbeAuthoritative,
  planQuarantineRecheck,
  judgeRelevance,
  isKeywordRelevant,
  isQuarantined,
  updateSourceHealth,
} from "../lib/source-health.mjs";
import { collectFromSource } from "../search-sources.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── judgeUrlProbe (pre-flight URL health probe verdict) ───

describe("judgeUrlProbe", () => {
  it("marks HTTP >= 400 as dead", () => {
    const v = judgeUrlProbe({
      searchUrl: "https://www.ithome.com/search?word=x",
      finalUrl: "https://www.ithome.com/search?word=x",
      httpStatus: 404,
    });
    expect(v.dead).toBe(true);
    expect(v.reason).toBe("http-status");
  });

  it("marks a redirect to the site homepage as dead", () => {
    const v = judgeUrlProbe({
      searchUrl: "https://www.ithome.com/search?word=x",
      finalUrl: "https://www.ithome.com/",
      httpStatus: 200,
    });
    expect(v.dead).toBe(true);
    expect(v.reason).toBe("redirected-home");
  });

  it("keeps a same-page redirect (query-only change) alive", () => {
    const v = judgeUrlProbe({
      searchUrl: "https://www.news.cn/search/news.htm?keyword=x",
      finalUrl: "https://www.news.cn/search/news.htm?keyword=x&from=redirect",
      httpStatus: 200,
    });
    expect(v.dead).toBe(false);
  });

  it("fails open on network errors (no verdict without an HTTP response)", () => {
    const v = judgeUrlProbe({
      searchUrl: "https://www.ithome.com/search?word=x",
      finalUrl: null,
      httpStatus: null,
      error: "getaddrinfo ENOTFOUND",
    });
    expect(v.dead).toBe(false);
    expect(v.reason).toBeNull();
  });
});

// ─── #285: login-gated sources cannot be judged by an unauthenticated probe ───

describe("judgeUrlProbeForSource (#285 — login-gated sources)", () => {
  // Live evidence (#317, s.weibo.com/weibo?q=): an auth-walled search page
  // answers the unauthenticated probe fetch with 404 while the cookie-carrying
  // CDP layer renders 19/19 real posts. The probe cannot speak for such a
  // source, so any verdict derived from it is noise.
  const loginGated = () => ({
    name: "zhihu",
    needsAuth: true,
    capabilities: { articles: { needsAuth: true } },
  });

  it("never marks a needsAuth source dead — the probe is not authoritative there", () => {
    const v = judgeUrlProbeForSource(loginGated(), {
      searchUrl: "https://www.zhihu.com/search?q=DeepSeek",
      finalUrl: "https://www.zhihu.com/search?q=DeepSeek",
      httpStatus: 403,
    });
    expect(v.dead).toBe(false);
    expect(v.probeSkipped).toBe(true);
    expect(v.reason).toBeNull();
  });

  it("reads capabilities.articles.needsAuth before the top-level field (#199)", () => {
    const v = judgeUrlProbeForSource(
      { name: "zhihu", needsAuth: false, capabilities: { articles: { needsAuth: true } } },
      { searchUrl: "https://www.zhihu.com/search?q=DeepSeek", httpStatus: 403 },
    );
    expect(v.dead).toBe(false);
    expect(v.probeSkipped).toBe(true);
  });

  it("keeps judging non-login-gated sources exactly as before (403 still kills)", () => {
    const v = judgeUrlProbeForSource(
      { name: "ithome", needsAuth: false },
      {
        searchUrl: "https://www.ithome.com/search?word=x",
        finalUrl: "https://www.ithome.com/search?word=x",
        httpStatus: 403,
      },
    );
    expect(v.dead).toBe(true);
    expect(v.reason).toBe("http-status");
    expect(v.probeSkipped).toBeFalsy();
  });

  it("isProbeAuthoritative mirrors the same rule for callers that gate on it", () => {
    expect(isProbeAuthoritative(loginGated())).toBe(false);
    expect(isProbeAuthoritative({ name: "ithome", needsAuth: false })).toBe(true);
    // unknown/absent → still probeable: the wider false-negative net must not
    // become a blanket opt-out that hides genuinely dead sources.
    expect(isProbeAuthoritative({})).toBe(true);
  });
});

// ─── Keyword relevance guard ───

describe("judgeRelevance / isKeywordRelevant", () => {
  it("matches Chinese keywords by substring in title or url (incl. percent-encoded)", () => {
    expect(
      isKeywordRelevant("讯飞", { title: "讯飞星火 4.0 发布", url: "https://www.ithome.com/a/1" }),
    ).toBe(true);
    expect(
      isKeywordRelevant("讯飞", {
        title: "某发布会",
        url: `https://www.ithome.com/tag/${encodeURIComponent("讯飞")}`,
      }),
    ).toBe(true);
    expect(
      isKeywordRelevant("讯飞", { title: " unrelated ", url: "https://www.ithome.com/a/2" }),
    ).toBe(false);
  });

  it("matches English keywords as whole words", () => {
    expect(
      isKeywordRelevant("DeepSeek", { title: "DeepSeek V4 released", url: "https://x.com/a" }),
    ).toBe(true);
    expect(
      isKeywordRelevant("DeepSeek", { title: "DeepSeeker tool", url: "https://x.com/a" }),
    ).toBe(false);
  });

  it("hits when any token of a multi-token keyword matches", () => {
    expect(
      isKeywordRelevant("DeepSeek V4", { title: "V4 upgrade notes", url: "https://x.com/a" }),
    ).toBe(true);
  });

  it("invalidates a large result set with 0% keyword hits", () => {
    const junk = Array.from({ length: RELEVANCE_MIN_RESULTS }, (_, i) => ({
      title: `homepage link ${i}`,
      url: `https://www.ithome.com/${i}`,
    }));
    const v = judgeRelevance("讯飞", junk);
    expect(v.invalid).toBe(true);
    expect(v.hits).toBe(0);
  });

  it("does not kill small result sets even with 0 hits (avoid over-killing)", () => {
    const few = Array.from({ length: 3 }, (_, i) => ({
      title: `homepage link ${i}`,
      url: `https://www.ithome.com/${i}`,
    }));
    expect(judgeRelevance("讯飞", few).invalid).toBe(false);
  });

  it("passes a large result set where every item hits the keyword", () => {
    const good = Array.from({ length: RELEVANCE_MIN_RESULTS }, (_, i) => ({
      title: `讯飞发布新模型 ${i}`,
      url: `https://www.ithome.com/${i}`,
    }));
    const v = judgeRelevance("讯飞", good);
    expect(v.invalid).toBe(false);
    expect(v.hits).toBe(RELEVANCE_MIN_RESULTS);
  });

  it("is skipped entirely when no keyword is given (trend mode)", () => {
    const junk = Array.from({ length: 50 }, (_, i) => ({
      title: `t ${i}`,
      url: `https://x.com/${i}`,
    }));
    expect(judgeRelevance(null, junk).invalid).toBe(false);
  });
});

// ─── Quarantine lifecycle (source-health) ───

describe("quarantine marking", () => {
  it("marks a source quarantined after QUARANTINE_THRESHOLD failing runs", () => {
    let log = null;
    for (let i = 0; i < QUARANTINE_THRESHOLD; i++) {
      log = updateSourceHealth(log, [{ name: "ithome", count: 0, zeroReason: "dead-url" }], {
        now: 1000 + i,
      });
    }
    const rec = log.sources.ithome;
    expect(rec.consecutiveZeroRuns).toBe(QUARANTINE_THRESHOLD);
    expect(rec.quarantined).toBe(true);
    expect(rec.quarantinedAt).toBe(1000 + QUARANTINE_THRESHOLD - 1);
    expect(rec.quarantineReason).toBe("dead-url");
  });

  it("counts invalid-relevance runs toward the quarantine streak", () => {
    let log = null;
    for (let i = 0; i < QUARANTINE_THRESHOLD; i++) {
      log = updateSourceHealth(
        log,
        [{ name: "ithome", count: 0, zeroReason: "invalid-relevance" }],
        {
          now: 1000 + i,
        },
      );
    }
    expect(log.sources.ithome.quarantined).toBe(true);
  });

  it("clears quarantine when the source returns results again", () => {
    let log = null;
    for (let i = 0; i < QUARANTINE_THRESHOLD; i++) {
      log = updateSourceHealth(log, [{ name: "ithome", count: 0, zeroReason: "dead-url" }], {
        now: 1000 + i,
      });
    }
    log = updateSourceHealth(log, [{ name: "ithome", count: 7 }], { now: 5000 });
    expect(log.sources.ithome.quarantined).toBeFalsy();
    expect(log.sources.ithome.consecutiveZeroRuns).toBe(0);
  });

  it("keeps backward compatibility with old health logs (no quarantine fields)", () => {
    const oldLog = {
      version: 1,
      sources: { legacy: { consecutiveZeroRuns: 2, lastZeroAt: 1, lastOkAt: null } },
    };
    const log = updateSourceHealth(oldLog, [{ name: "legacy", count: 0 }], { now: 3000 });
    expect(log.sources.legacy.consecutiveZeroRuns).toBe(3);
    expect(log.sources.legacy.quarantined).toBe(true);
  });

  it("isQuarantined reports recheckDue after QUARANTINE_RECHECK_DAYS", () => {
    const rec = { quarantined: true, quarantinedAt: 1000, quarantineReason: "dead-url" };
    expect(isQuarantined(rec, 1000 + QUARANTINE_RECHECK_DAYS * DAY_MS - 1)).toEqual({
      quarantined: true,
      recheckDue: false,
    });
    expect(isQuarantined(rec, 1000 + QUARANTINE_RECHECK_DAYS * DAY_MS)).toEqual({
      quarantined: true,
      recheckDue: true,
    });
    expect(isQuarantined(null, 9999)).toEqual({ quarantined: false, recheckDue: false });
    expect(isQuarantined({ quarantined: false }, 9999).quarantined).toBe(false);
  });
});

// ─── #285: quarantine recheck planning ───

describe("planQuarantineRecheck (#285 — the recheck must not misjudge login-gated sources)", () => {
  const searchUrl = "https://www.zhihu.com/search?q=DeepSeek";

  it("skips the probe for a needsAuth source and hands the window to a real attempt", async () => {
    const calls = [];
    const plan = await planQuarantineRecheck({
      source: { name: "zhihu", needsAuth: true },
      searchUrl,
      probeFn: async (u) => {
        calls.push(u);
        return { httpStatus: 403, finalUrl: searchUrl };
      },
    });
    expect(calls).toEqual([]); // no unauthenticated fetch was fired…
    expect(plan.verdict.dead).toBe(false); // …so it cannot be judged dead…
    expect(plan.action).toBe("attempt"); // …the recheck window gets a real attempt…
    expect(plan.releaseNow).toBe(false); // …without a preemptive release.
  });

  it("still skips a non-login-gated source whose URL probes dead", async () => {
    const plan = await planQuarantineRecheck({
      source: { name: "ithome", needsAuth: false },
      searchUrl: "https://www.ithome.com/search?word=x",
      probeFn: async () => ({
        httpStatus: 404,
        finalUrl: "https://www.ithome.com/search?word=x",
      }),
    });
    expect(plan.verdict.dead).toBe(true);
    expect(plan.action).toBe("skip");
    expect(plan.releaseNow).toBe(false);
    expect(plan.probe.recheck).toBe(true);
    expect(plan.probe.httpStatus).toBe(404);
  });

  it("releases a non-login-gated source whose URL probes live (unchanged behavior)", async () => {
    const plan = await planQuarantineRecheck({
      source: { name: "ithome", needsAuth: false },
      searchUrl: "https://www.ithome.com/search?word=x",
      probeFn: async () => ({
        httpStatus: 200,
        finalUrl: "https://www.ithome.com/search?word=x",
      }),
    });
    expect(plan.verdict.dead).toBe(false);
    expect(plan.action).toBe("attempt");
    expect(plan.releaseNow).toBe(true);
  });

  it("fails open when the source registers no search URL (nothing to judge)", async () => {
    const plan = await planQuarantineRecheck({
      source: { name: "rss-only", needsAuth: false },
      searchUrl: null,
      probeFn: async () => ({ httpStatus: 404, finalUrl: null }),
    });
    expect(plan.verdict.dead).toBe(false);
    expect(plan.releaseNow).toBe(true);
  });
});

// ─── collectFromSource wiring (stubbed layers) ───

describe("collectFromSource dead-url probe + relevance guard", () => {
  // CDP-first source (no apiSearch) with a distinct googleSiteFallback so the
  // fallback chain has somewhere to go after the primary layer is skipped.
  const source = {
    name: "ithome",
    label: "iThome",
    capabilities: {
      articles: {
        url: (kw) => `https://www.ithome.com/search?word=${encodeURIComponent(kw)}`,
        articleScript: "return [];",
        googleSiteFallback: {
          url: (kw) => `https://www.google.com/search?q=site:ithome.com+${encodeURIComponent(kw)}`,
          articleScript: "return [];",
        },
      },
    },
  };

  function stubDeps(overrides = {}) {
    return {
      collectApi: async () => [],
      collectCdp: async () => ({ articles: [], status: null }),
      collectBigsong: async () => [],
      collectMcp: async () => [],
      searchPoolFn: async () => ({ attempts: [], articles: [] }),
      isPoolEligibleFn: () => false,
      probeFn: async () => ({ httpStatus: 200, finalUrl: "https://www.ithome.com/search?word=kw" }),
      probeCache: new Map(),
      ...overrides,
    };
  }

  it("skips the CDP layer with reason dead-url when the probe gets a 404", async () => {
    const events = [];
    const cdpCalls = [];
    const collected = await collectFromSource(
      source,
      "讯飞",
      (e) => events.push(e),
      stubDeps({
        probeFn: async () => ({
          httpStatus: 404,
          finalUrl: "https://www.ithome.com/search?word=x",
        }),
        collectCdp: async (src) => {
          cdpCalls.push(src.name);
          return { articles: [], status: null };
        },
      }),
    );
    expect(collected).toEqual([]);
    const cdp = events.find((e) => e.layer === "cdp");
    expect(cdp.reason).toBe("dead-url");
    expect(cdp.count).toBeNull();
    // The primary CDP layer never opened a tab…
    expect(cdpCalls).not.toContain("ithome");
    // …but the google fallback still ran through collectCdp.
    expect(cdpCalls).toContain("ithome_fallback");
  });

  it("skips the CDP layer when the probe is redirected to the homepage", async () => {
    const events = [];
    await collectFromSource(
      source,
      "讯飞",
      (e) => events.push(e),
      stubDeps({
        probeFn: async () => ({ httpStatus: 200, finalUrl: "https://www.ithome.com/" }),
      }),
    );
    expect(events.find((e) => e.layer === "cdp")?.reason).toBe("dead-url");
  });

  it("#317: needsAuth sources skip the pre-flight probe — an auth-walled page 4xxs on bare fetch while the cookie-carrying CDP layer renders fine", async () => {
    // s.weibo.com/weibo?q= answers 404 to the unauthenticated probe fetch, but
    // the CDP layer with the Chrome-cookie session renders it (verified live).
    // The probe verdict is noise for login-walled sources — the CDP layer's
    // own loginCheck is the authority.
    const needsAuthSource = {
      ...source,
      needsAuth: true,
      capabilities: {
        ...source.capabilities,
        articles: { ...source.capabilities.articles, needsAuth: true },
      },
    };
    const events = [];
    const cdpCalls = [];
    const probeUrls = [];
    const collected = await collectFromSource(
      needsAuthSource,
      "DeepSeek",
      (e) => events.push(e),
      stubDeps({
        probeFn: async (url) => {
          probeUrls.push(url);
          return { httpStatus: 404, finalUrl: "https://www.ithome.com/search?word=x" };
        },
        collectCdp: async (src) => {
          cdpCalls.push(src.name);
          return { articles: [], status: null };
        },
      }),
    );
    // the probe never fired…
    expect(probeUrls).toEqual([]);
    // …no dead-url verdict was recorded…
    expect(events.find((e) => e.layer === "cdp")?.reason).not.toBe("dead-url");
    // …and the primary CDP layer still ran (alongside the fallback after it
    // returned zero).
    expect(cdpCalls).toContain("ithome");
    expect(cdpCalls).toContain("ithome_fallback");
    expect(collected).toEqual([]);
  });

  it("caches the probe verdict within the run (one probe per URL)", async () => {
    const probeUrls = [];
    const probeFn = async (url) => {
      probeUrls.push(url);
      return { httpStatus: 200, finalUrl: url };
    };
    const deps = stubDeps({ probeFn });
    await collectFromSource(source, "讯飞", () => {}, deps);
    await collectFromSource(source, "讯飞", () => {}, deps);
    expect(probeUrls.length).toBe(1);
  });

  it("runs the CDP layer normally when the probe passes", async () => {
    const events = [];
    const collected = await collectFromSource(
      source,
      "讯飞",
      (e) => events.push(e),
      stubDeps({
        collectCdp: async () => ({
          articles: [
            { title: "讯飞星火发布", url: "https://www.ithome.com/0/1/1.htm" },
            { title: "讯飞新模型", url: "https://www.ithome.com/0/1/2.htm" },
          ],
          status: null,
        }),
      }),
    );
    expect(collected).toHaveLength(2);
    expect(events.find((e) => e.layer === "cdp")?.count).toBe(2);
  });

  it("invalidates a large 0%-hit CDP result set and continues down the fallback chain", async () => {
    const events = [];
    const junk = Array.from({ length: RELEVANCE_MIN_RESULTS }, (_, i) => ({
      title: `homepage nav link ${i}`,
      url: `https://www.ithome.com/${i}`,
    }));
    const cdpCalls = [];
    const collected = await collectFromSource(
      source,
      "讯飞",
      (e) => events.push(e),
      stubDeps({
        collectCdp: async (src) => {
          cdpCalls.push(src.name);
          return src.name === "ithome"
            ? { articles: junk, status: null }
            : { articles: [], status: null };
        },
      }),
    );
    expect(collected).toEqual([]);
    const cdp = events.find((e) => e.layer === "cdp");
    expect(cdp.reason).toBe("invalid-relevance");
    expect(cdp.count).toBe(0);
    // raw extracted count is preserved as an extra field for reviewers
    expect(cdp.extracted).toBe(junk.length);
    // the fallback layer was still attempted
    expect(cdpCalls).toContain("ithome_fallback");
  });

  it("keeps a small 0%-hit CDP result set (no over-killing)", async () => {
    const events = [];
    const collected = await collectFromSource(
      source,
      "讯飞",
      (e) => events.push(e),
      stubDeps({
        collectCdp: async () => ({
          articles: [{ title: "random headline", url: "https://www.ithome.com/0/2/3.htm" }],
          status: null,
        }),
      }),
    );
    expect(collected).toHaveLength(1);
    expect(events.find((e) => e.layer === "cdp")?.reason).toBeUndefined();
  });

  it("invalidates a large 0%-hit google-fallback result set too (run-1 leak)", async () => {
    // Real evidence (2026-09-13 smoke, #269): with the primary layer skipped by
    // the probe, the googleSiteFallback scraped Google's consent page via the
    // shared script's link-grab fallback → 534 junk links entered the results.
    const events = [];
    const junk = Array.from({ length: RELEVANCE_MIN_RESULTS }, (_, i) => ({
      title: `consent page link ${i}`,
      url: `https://www.google.com/${i}`,
    }));
    const collected = await collectFromSource(
      source,
      "讯飞",
      (e) => events.push(e),
      stubDeps({
        collectCdp: async (src) =>
          src.name === "ithome" ? { articles: [], status: null } : { articles: junk, status: null },
      }),
    );
    expect(collected).toEqual([]);
    const fb = events.find((e) => e.layer === "google-fallback");
    expect(fb.reason).toBe("invalid-relevance");
    expect(fb.count).toBe(0);
    expect(fb.extracted).toBe(junk.length);
  });
});
