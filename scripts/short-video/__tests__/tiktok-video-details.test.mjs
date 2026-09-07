import { describe, it, expect } from "vitest";

/**
 * Tests for the per-video analytics detail fetcher (#215).
 *
 * All CDP interaction is injected via opts seams (same pattern as
 * extractWithRetry's opts.extractFn) — no network in tests.
 *
 * Fixtures are real page text captured via CDP on 2026-09-07
 * (video 7679644897619561748: views 467, avg watch 7.18s, full 2.6%,
 * For You 88.5% / Search 8.9%).
 */

import {
  parseVideoDetailText,
  fetchDetailText,
  fetchVideoDetails,
  pacingDelayMs,
} from "../lib/tiktok-video-details.mjs";

// Real page innerText captured 2026-09-07 via CDP eval.
const REAL_DETAIL_TEXT = [
  " #alibaba #qwen",
  "Posted on 8/30/2026",
  "467",
  "11",
  "0",
  "1",
  "5",
  "Video views",
  "467",
  "Total play time",
  "1h:00m:41s",
  "Average watch time",
  "7.18s",
  "Watched full video",
  "2.6%",
  "New followers",
  "0",
  "Chart shows the data trend during the first 7 days after posting.",
  "Retention rate",
  "Most viewers stopped watching at 0:01. Play the video below to see when they lost interest.",
  "NaN:NaN (--)",
  "NaN:NaN",
  "Traffic source",
  "For You",
  "88.5%",
  "Search",
  "8.9%",
  "Personal profile",
  "2.6%",
].join("\n");

const immediateSleep = () => Promise.resolve();

describe("parseVideoDetailText", () => {
  it("parses the real captured detail page", () => {
    const r = parseVideoDetailText(REAL_DETAIL_TEXT);
    expect(r.postedOn).toBe("8/30/2026");
    expect(r.videoViews).toBe(467);
    expect(r.totalPlayTime).toBe("1h:00m:41s");
    expect(r.avgWatchTimeSec).toBe(7.18);
    expect(r.watchedFullVideoPct).toBe(2.6);
    expect(r.newFollowers).toBe(0);
    expect(r.retentionInsight).toBe(
      "Most viewers stopped watching at 0:01. Play the video below to see when they lost interest.",
    );
    expect(r.trafficSource).toEqual({ forYouPct: 88.5, searchPct: 8.9 });
  });

  it("returns nulls for crash page", () => {
    const r = parseVideoDetailText("Unexpected Application Error! window.t is not a function");
    expect(r.videoViews).toBeNull();
    expect(r.avgWatchTimeSec).toBeNull();
    expect(r.trafficSource.forYouPct).toBeNull();
  });

  it("returns nulls for empty text", () => {
    const r = parseVideoDetailText("");
    expect(r.videoViews).toBeNull();
    expect(r.postedOn).toBeNull();
  });

  it("parses comma-grouped numbers", () => {
    const text = REAL_DETAIL_TEXT.replace("Video views\n467", "Video views\n1,234").replace(
      "New followers\n0",
      "New followers\n12",
    );
    const r = parseVideoDetailText(text);
    expect(r.videoViews).toBe(1234);
    expect(r.newFollowers).toBe(12);
  });

  it("handles missing Search in traffic source", () => {
    const text = REAL_DETAIL_TEXT.split("\nTraffic source")[0] + "\nTraffic source\nFor You\n91.0%";
    const r = parseVideoDetailText(text);
    expect(r.trafficSource.forYouPct).toBe(91.0);
    expect(r.trafficSource.searchPct).toBeNull();
  });

  it("retention insight drops numeric and NaN noise lines", () => {
    const r = parseVideoDetailText(REAL_DETAIL_TEXT);
    expect(r.retentionInsight).not.toMatch(/NaN/);
    expect(r.retentionInsight).not.toMatch(/^\d/);
  });
});

describe("pacingDelayMs", () => {
  it("stays in the 4-8s band with a deterministic RNG", () => {
    const seq = [0, 0.5, 0.999];
    let i = 0;
    const rand = () => seq[i++ % seq.length];
    expect(pacingDelayMs(rand)).toBe(4000);
    expect(pacingDelayMs(rand)).toBe(6000);
    expect(pacingDelayMs(rand)).toBe(7996); // 4000 + round(0.999*4000)
  });
});

describe("fetchDetailText", () => {
  it("returns page text after silent render wait", async () => {
    const evals = [];
    const text = await fetchDetailText("tab1", "123", {
      renderWaitMs: 1,
      evalFn: async (_tab, script) => {
        evals.push(script);
        return { value: REAL_DETAIL_TEXT };
      },
      sleepFn: immediateSleep,
    });
    expect(text).toBe(REAL_DETAIL_TEXT);
    expect(evals).toHaveLength(1);
  });

  it("reloads exactly once on SPA crash and recovers", async () => {
    let evalCount = 0;
    const navigations = [];
    const text = await fetchDetailText("tab1", "123", {
      renderWaitMs: 1,
      navigateFn: async (tab, url) => navigations.push({ tab, url }),
      evalFn: async (_tab, script) => {
        if (script.includes("location.reload")) return { value: "reloading" };
        evalCount++;
        if (evalCount === 1)
          return { value: "Unexpected Application Error! window.t is not a function" };
        return { value: REAL_DETAIL_TEXT };
      },
      sleepFn: immediateSleep,
    });
    expect(text).toBe(REAL_DETAIL_TEXT);
    expect(evalCount).toBe(2);
    expect(navigations).toHaveLength(1);
    expect(navigations[0].url).toContain("/analytics/123/overview");
  });

  it("returns null when eval errors", async () => {
    const text = await fetchDetailText("tab1", "123", {
      renderWaitMs: 1,
      evalFn: async () => ({ error: "Execution context was destroyed" }),
      sleepFn: immediateSleep,
    });
    expect(text).toBeNull();
  });
});

describe("fetchVideoDetails", () => {
  function makeCdp({ list, detailQueue }) {
    const calls = { newTab: 0, closedTabs: [] };
    return {
      calls,
      cdpNewTab: async () => {
        calls.newTab++;
        return "tab1";
      },
      cdpCloseTab: async (tabId) => {
        calls.closedTabs.push(tabId);
      },
      evalFn: async (_tab, script) => {
        if (script.includes('a[href*="/video/"]')) {
          return { value: JSON.stringify(list) };
        }
        if (script.includes("location.reload")) return { value: "reloading" };
        return { value: detailQueue.length ? detailQueue.shift() : "" };
      },
    };
  }

  it("fetches list then each video, closing the tab at the end", async () => {
    const cdp = makeCdp({
      list: [
        { videoId: "111", title: "A" },
        { videoId: "222", title: "B" },
      ],
      detailQueue: [REAL_DETAIL_TEXT, REAL_DETAIL_TEXT],
    });

    const result = await fetchVideoDetails({
      renderWaitMs: 1,
      sleepFn: immediateSleep,
      rand: () => 0.5,
      cdpNewTab: cdp.cdpNewTab,
      cdpCloseTab: cdp.cdpCloseTab,
      evalFn: cdp.evalFn,
    });

    expect(cdp.calls.newTab).toBe(1);
    expect(cdp.calls.closedTabs).toEqual(["tab1"]);
    expect(result.videos).toHaveLength(2);
    expect(result.videos[0]).toMatchObject({
      videoId: "111",
      title: "A",
      videoViews: 467,
      avgWatchTimeSec: 7.18,
      watchedFullVideoPct: 2.6,
    });
    expect(result.failed).toHaveLength(0);
  });

  it("records failures without aborting the run", async () => {
    const calls = { newTab: 0, closedTabs: [] };
    const list = [
      { videoId: "111", title: "A" },
      { videoId: "222", title: "B" },
    ];
    // Video 111: every read errors → fetchDetailText returns null → "eval failed".
    // Video 222: page loads but never shows metrics → "no metrics parsed".
    let detailReads = 0;
    const evalFn = async (_tab, script) => {
      if (script.includes('a[href*="/video/"]')) {
        return { value: JSON.stringify(list) };
      }
      detailReads++;
      if (detailReads <= 6) return { error: "context destroyed" };
      return { value: "some page without metrics" };
    };

    const result = await fetchVideoDetails({
      renderWaitMs: 1,
      sleepFn: immediateSleep,
      rand: () => 0.5,
      cdpNewTab: async () => {
        calls.newTab++;
        return "tab1";
      },
      cdpCloseTab: async (tabId) => {
        calls.closedTabs.push(tabId);
      },
      evalFn,
    });

    expect(result.videos).toHaveLength(0);
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0].reason).toBe("eval failed");
    expect(result.failed[1].reason).toMatch(/no metrics parsed/);
    expect(calls.closedTabs).toEqual(["tab1"]);
  });

  it("honors limit and explicit videoIds", async () => {
    const cdp = makeCdp({
      list: [
        { videoId: "111", title: "A" },
        { videoId: "222", title: "B" },
        { videoId: "333", title: "C" },
      ],
      detailQueue: [REAL_DETAIL_TEXT, REAL_DETAIL_TEXT, REAL_DETAIL_TEXT],
    });

    const limited = await fetchVideoDetails({
      limit: 2,
      renderWaitMs: 1,
      sleepFn: immediateSleep,
      cdpNewTab: cdp.cdpNewTab,
      cdpCloseTab: cdp.cdpCloseTab,
      evalFn: cdp.evalFn,
    });
    expect(limited.videos).toHaveLength(2);

    const explicit = await fetchVideoDetails({
      videoIds: ["999"],
      renderWaitMs: 1,
      sleepFn: immediateSleep,
      cdpNewTab: cdp.cdpNewTab,
      cdpCloseTab: cdp.cdpCloseTab,
      evalFn: cdp.evalFn,
    });
    expect(explicit.videos).toHaveLength(1);
    expect(explicit.videos[0].videoId).toBe("999");
    expect(explicit.videos[0].title).toBe("");
  });

  it("closes the tab even when the list page fails", async () => {
    const cdp = makeCdp({ list: [], detailQueue: [] });
    await expect(
      fetchVideoDetails({
        renderWaitMs: 1,
        sleepFn: immediateSleep,
        cdpNewTab: cdp.cdpNewTab,
        cdpCloseTab: cdp.cdpCloseTab,
        evalFn: async () => {
          throw new Error("proxy down");
        },
      }),
    ).rejects.toThrow("Failed to list videos");
    expect(cdp.calls.closedTabs).toEqual(["tab1"]);
  });
});
