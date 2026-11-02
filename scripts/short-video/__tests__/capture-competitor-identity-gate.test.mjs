/**
 * #748 — the identity gate, as behaviour rather than unit truth.
 *
 * This file deliberately imports only `captureCompetitorVideos`, which the
 * pre-#748 implementation already exported: that is what makes it usable as a
 * red baseline. Running it against the old capture file must fail on behaviour
 * (a wrong account or an empty grid written as `error: null`), not on a missing
 * import.
 *
 * The failure mode it pins is the one that produced the bad corpus: 2026-10-17
 * wrote `@allsiekmiller` (handle does not exist) and `@natebjones` (a
 * 35-follower stranger) as accounts with `videos: []` or off-niche rows and
 * `error: null`, so every downstream consumer read "this account has no videos"
 * instead of "this run sampled nothing".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { tmpdir } from "os";

const state = vi.hoisted(() => ({
  traceText: "fl=1\nloc=JP\ncolo=NRT\n",
  profile: {
    regionBlocked: false,
    gridError: false,
    notFound: false,
    items: [],
    followerCount: 100000,
    videoCount: 0,
  },
  identityOverride: {},
  tabs: new Map(),
  ready: "ready",
}));

vi.mock("../lib/cdp-profile-guard.mjs", () => ({
  checkAutomationProfile: vi.fn(async () => ({ status: "ok", message: "ok", fixCommand: null })),
  formatVerdict: vi.fn((v) => v.message),
}));

vi.mock("../lib/cdp-client.mjs", () => ({
  CDP_BASE: "http://localhost:3456",
  cdpNewTab: vi.fn(async (url) => {
    const id = `tab-${state.tabs.size}`;
    state.tabs.set(id, url);
    return id;
  }),
  cdpCloseTab: vi.fn(async () => {}),
  cdpEval: vi.fn(async (tabId, script) => {
    if (script === "document.body.innerText" || script.includes("cdn-cgi/trace")) {
      return { result: { value: state.traceText } };
    }
    if (script.includes("return 'waiting'")) {
      return { result: { value: state.ready } };
    }
    if (script.includes("user-post-item")) {
      const url = state.tabs.get(tabId) ?? "";
      const handle = url.includes("@") ? url.split("@")[1] : null;
      return {
        result: {
          value: JSON.stringify({
            count: state.profile.items.length,
            uniqueId: handle,
            nickname: handle,
            ...state.profile,
            ...state.identityOverride,
          }),
        },
      };
    }
    return { result: { value: "scrolled" } };
  }),
}));

vi.mock("../lib/video-downloaders.mjs", () => ({
  downloadVideo: vi.fn(async (url) => ({
    status: "ok",
    strategy: "ytdlp",
    sourceUrl: url,
    byteLength: 4,
    buffer: Buffer.from([1, 2, 3, 4]),
  })),
}));

const { captureCompetitorVideos } = await import("../capture-competitor-videos.mjs");
const { downloadVideo } = await import("../lib/video-downloaders.mjs");

const outDir = join(tmpdir(), `competitor-identity-gate-${process.pid}`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.traceText = "fl=1\nloc=JP\ncolo=NRT\n";
  state.profile = {
    regionBlocked: false,
    gridError: false,
    notFound: false,
    items: [],
    followerCount: 100000,
    videoCount: 0,
  };
  state.identityOverride = {};
  state.tabs.clear();
  state.ready = "ready";
});

afterEach(() => {
  vi.useRealTimers();
});

/** Capture with fake timers drained, so the render/pacing waits do not hang. */
async function capture(opts) {
  const pending = captureCompetitorVideos(opts);
  await vi.runAllTimersAsync();
  return pending;
}

describe("identity gate (#748)", () => {
  it("records a missing profile as an identity error, not an empty sample", async () => {
    state.identityOverride = { notFound: true, uniqueId: null, nickname: null };
    state.ready = "not-found";

    const manifest = await capture({
      accounts: [{ handle: "allsiekmiller", displayName: "Allie K. Miller" }],
      outDir,
    });

    expect(manifest.accounts[0].videos).toEqual([]);
    expect(manifest.accounts[0].error).toMatch(/identity gate failed.*no profile/i);
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("rejects a stranger who holds the expected handle", async () => {
    // The 2026-11-02 @natebjones case: handle right, person wrong.
    state.identityOverride = { nickname: "user3796273088564" };
    state.profile.items = [
      { id: "1", views: "5", href: "https://www.tiktok.com/@natebjones/video/1" },
    ];

    const manifest = await capture({
      accounts: [{ handle: "natebjones", displayName: "Nate B. Jones" }],
      outDir,
    });

    expect(manifest.accounts[0].error).toMatch(/identity gate failed.*user3796273088564/s);
    expect(manifest.accounts[0].videos).toEqual([]);
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("refuses to record a failed grid as a sample", async () => {
    state.profile.gridError = true;

    const manifest = await capture({
      accounts: [{ handle: "x", displayName: "X" }],
      outDir,
    });

    expect(manifest.accounts[0].error).toMatch(/grid failed to render/);
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("refuses a zero-video grid even when the page reports no error", async () => {
    state.profile.items = [];

    const manifest = await capture({
      accounts: [{ handle: "x", displayName: "X" }],
      outDir,
    });

    expect(manifest.accounts[0].error).toMatch(/listed 0 videos/);
    expect(downloadVideo).not.toHaveBeenCalled();
  });
});
