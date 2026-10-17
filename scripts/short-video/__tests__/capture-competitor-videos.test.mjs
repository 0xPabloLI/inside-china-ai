/**
 * #300 stage 2 — competitor capture gates and ranking.
 *
 * Why the gate cases matter more than the happy path: both gate failures are
 * *silent* in production. A wrong CDP profile turns every later verdict into a
 * projection of "not logged in" (2026-09-22 incident), and a HK exit makes
 * TikTok serve a region page that reads as "this account has no videos". The
 * assertions therefore pin the ordering — a failed gate must stop before any
 * listing or download happens, not merely produce a warning.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { tmpdir } from "os";

const state = vi.hoisted(() => ({
  profileVerdict: { status: "ok", message: "ok", fixCommand: null },
  traceText: "fl=1\nloc=JP\ncolo=NRT\n",
  listJson: JSON.stringify({ count: 0, regionBlocked: false, items: [] }),
}));

vi.mock("../lib/cdp-profile-guard.mjs", () => ({
  checkAutomationProfile: vi.fn(async () => state.profileVerdict),
  formatVerdict: vi.fn((v) => v.message),
}));

vi.mock("../lib/cdp-client.mjs", () => ({
  CDP_BASE: "http://localhost:3456",
  cdpNewTab: vi.fn(async () => "tab-300"),
  cdpCloseTab: vi.fn(async () => {}),
  cdpEval: vi.fn(async (tabId, script) => {
    if (script.includes("cdn-cgi/trace")) return state.traceText;
    if (script.includes("user-post-item")) return state.listJson;
    return "scrolled";
  }),
}));

vi.mock("../lib/video-downloaders.mjs", () => ({
  downloadVideo: vi.fn(async (url) => ({
    status: "ok",
    strategy: "ytdlp",
    sourceUrl: url,
    byteLength: 1234,
    buffer: Buffer.from([1, 2, 3, 4]),
  })),
}));

const { parsePlayCount, normalizeTikTokVideoUrl, captureCompetitorVideos } =
  await import("../capture-competitor-videos.mjs");
const { cdpNewTab } = await import("../lib/cdp-client.mjs");
const { downloadVideo } = await import("../lib/video-downloaders.mjs");

describe("normalizeTikTokVideoUrl (#300 stage 2)", () => {
  it("leaves an absolute href untouched", () => {
    const abs = "https://www.tiktok.com/@rileybrown.ai/video/7309572377577393451";
    expect(normalizeTikTokVideoUrl(abs)).toBe(abs);
  });

  it("strips the query string and never double-prefixes the origin", () => {
    const url = normalizeTikTokVideoUrl(
      "https://www.tiktok.com/@x/video/123?is_from_webapp=1&lang=en",
    );
    expect(url).toBe("https://www.tiktok.com/@x/video/123");
    expect(url).not.toMatch(/tiktok\.comhttps/);
  });

  it("still resolves a relative href (site migration guard)", () => {
    expect(normalizeTikTokVideoUrl("/@x/video/123")).toBe("https://www.tiktok.com/@x/video/123");
  });

  it("returns an empty string for missing or blank hrefs", () => {
    expect(normalizeTikTokVideoUrl(undefined)).toBe("");
    expect(normalizeTikTokVideoUrl("")).toBe("");
    expect(normalizeTikTokVideoUrl("   ")).toBe("");
  });
});

describe("parsePlayCount (#300 stage 2)", () => {
  it("parses the K/M labels TikTok renders", () => {
    expect(parsePlayCount("965")).toBe(965);
    expect(parsePlayCount("177.5K")).toBe(177500);
    expect(parsePlayCount("2.1M")).toBe(2100000);
    expect(parsePlayCount("1,234")).toBe(1234);
    expect(parsePlayCount("1.2B")).toBe(1200000000);
  });

  it("returns 0 for empty or unparsable labels rather than NaN", () => {
    expect(parsePlayCount("")).toBe(0);
    expect(parsePlayCount(undefined)).toBe(0);
    expect(parsePlayCount("No views")).toBe(0);
  });
});

describe("captureCompetitorVideos gates (#300 stage 2)", () => {
  const outDir = join(tmpdir(), `competitor-capture-test-${process.pid}`);

  beforeEach(() => {
    vi.clearAllMocks();
    state.profileVerdict = { status: "ok", message: "ok", fixCommand: null };
    state.traceText = "fl=1\nloc=JP\ncolo=NRT\n";
    state.listJson = JSON.stringify({ count: 0, regionBlocked: false, items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops on a wrong CDP profile before opening any page", async () => {
    state.profileVerdict = {
      status: "wrong-profile",
      message: "port 9229 carries ~/.chrome-cdp, not the automation profile",
      fixCommand: "open -na ...",
    };

    await expect(captureCompetitorVideos({ accounts: ["someone"], outDir })).rejects.toThrow(
      /CDP profile gate failed/,
    );
    expect(cdpNewTab).not.toHaveBeenCalled();
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("stops on a HK exit before listing or downloading", async () => {
    // TikTok serves an "unavailable in your region" page from HK and reports no
    // error, so this must abort rather than record "0 videos".
    state.traceText = "fl=1\nloc=HK\ncolo=HKG\n";

    await expect(captureCompetitorVideos({ accounts: ["someone"], outDir })).rejects.toThrow(
      /exit gate failed.*HK/s,
    );
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("ranks by parsed plays, not by the label string", async () => {
    vi.useFakeTimers();
    state.listJson = JSON.stringify({
      count: 3,
      regionBlocked: false,
      items: [
        { id: "1", views: "965", href: "https://www.tiktok.com/@x/video/1" },
        { id: "2", views: "177.5K", href: "https://www.tiktok.com/@x/video/2" },
        { id: "3", views: "9.2K", href: "https://www.tiktok.com/@x/video/3" },
      ],
    });

    const pending = captureCompetitorVideos({ accounts: ["x"], topN: 2, outDir });
    await vi.runAllTimersAsync();
    const manifest = await pending;

    // "965" < "9.2K" < "177.5K" — a string sort would have ordered 965 last.
    expect(manifest.accounts[0].videos.map((v) => v.id)).toEqual(["2", "3"]);
    expect(manifest.accounts[0].videos[0].plays).toBe(177500);
    expect(manifest.exit).toBe("JP");
  });

  it("hands the downloader a clean absolute URL (regression: 0/36 batch on 2026-10-17)", async () => {
    // The profile grid's href is already absolute. The old extractor prefixed
    // the origin unconditionally, yielding host `www.tiktok.comhttps` → every
    // download failed as `unsupported-by-downloader`. The URL passed to
    // downloadVideo must be exactly the href, not a re-prefixed one.
    vi.useFakeTimers();
    state.listJson = JSON.stringify({
      count: 1,
      regionBlocked: false,
      items: [
        {
          id: "7309572377577393451",
          views: "309.9K",
          href: "https://www.tiktok.com/@rileybrown.ai/video/7309572377577393451",
        },
      ],
    });

    const pending = captureCompetitorVideos({ accounts: ["rileybrown.ai"], topN: 1, outDir });
    await vi.runAllTimersAsync();
    const manifest = await pending;

    const [video] = manifest.accounts[0].videos;
    expect(video.url).toBe("https://www.tiktok.com/@rileybrown.ai/video/7309572377577393451");
    expect(video.url).not.toMatch(/tiktok\.comhttps/);
    expect(downloadVideo).toHaveBeenCalledWith(video.url);
    expect(video.file).toBeTruthy();
  });

  it("records a region-blocked page as an error on the account entry", async () => {
    vi.useFakeTimers();
    state.listJson = JSON.stringify({ count: 0, regionBlocked: true, items: [] });

    const pending = captureCompetitorVideos({ accounts: ["x"], outDir });
    await vi.runAllTimersAsync();
    const manifest = await pending;

    expect(manifest.accounts[0].error).toMatch(/region-blocked/);
    expect(downloadVideo).not.toHaveBeenCalled();
  });
});
