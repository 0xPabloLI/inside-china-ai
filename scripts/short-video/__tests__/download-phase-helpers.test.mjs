/**
 * Tests for the shared download-phase helpers extracted from main():
 *   shouldSkipByPreFilter / shouldSkipByDedup / downloadAndRecord
 *
 * Spec: docs/archive/spec-asset-sourcer-techdebt-cleanup.md (Ticket 1)
 * These helpers unify the duplicated per-phase download loop structure.
 * Behavior must be line-for-line equivalent to the original hand-written
 * branches (scenario matrix rows 1-10).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "path";

const mockDownloadCandidate = vi.fn();

vi.mock("../lib/download-candidate.mjs", () => ({
  downloadCandidate: (...args) => mockDownloadCandidate(...args),
}));

import {
  shouldSkipByPreFilter,
  shouldSkipByDedup,
  downloadAndRecord,
  PRE_DOWNLOAD_FILTER_THRESHOLD,
} from "../lib/asset-sourcer.mjs";

/** Low-scoring candidate (technicalScore 3) — same fixture as T05 suite. */
const LOW_SCORE_CANDIDATE = {
  title: "Random unrelated video",
  type: "video",
  duration: 300,
  url: "https://example.com/low.jpg",
  score: 3,
};

/** High-scoring candidate (technicalScore 63) — same fixture as T05 suite. */
const HIGH_SCORE_CANDIDATE = {
  title: "Unitree Robot Demo",
  type: "image",
  fileSize: 3_000_000,
  resolution: "720p",
  url: "https://example.com/good.jpg",
  score: 80,
};

const makeContext = (overrides = {}) => ({
  downloadedUrls: new Set(),
  allAssets: [],
  failed: [],
  skipped: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shouldSkipByPreFilter", () => {
  it("returns true and records skipped for candidates below the pre-download threshold", () => {
    const ctx = makeContext();
    const result = shouldSkipByPreFilter(
      LOW_SCORE_CANDIDATE,
      "Unitree",
      "test-source",
      ctx.skipped,
    );
    expect(result).toBe(true);
    expect(ctx.skipped).toEqual([
      { source: "test-source", reason: `pre-download filter (score: 3)` },
    ]);
  });

  it("returns false and records nothing for candidates above the threshold", () => {
    const ctx = makeContext();
    const result = shouldSkipByPreFilter(
      HIGH_SCORE_CANDIDATE,
      "Unitree",
      "test-source",
      ctx.skipped,
    );
    expect(result).toBe(false);
    expect(ctx.skipped).toEqual([]);
  });

  it("uses the given keyword for scoring (not the candidate title alone)", () => {
    // Title matches "Unitree" but keyword is "Other" → no title match (0)
    // + image duration (14) = 14 < 20 → skipped. With keyword "Unitree" the
    // same candidate scores 28 + 14 = 42 → passes.
    const candidate = { ...HIGH_SCORE_CANDIDATE, fileSize: undefined, resolution: undefined };
    const ctx = makeContext();
    const result = shouldSkipByPreFilter(candidate, "Other", "s", ctx.skipped);
    expect(result).toBe(true);
    expect(ctx.skipped[0].reason).toContain("pre-download filter");

    const ctx2 = makeContext();
    expect(shouldSkipByPreFilter(candidate, "Unitree", "s", ctx2.skipped)).toBe(false);
  });

  // #547: the pre-download gate must use the same "is there content evidence?"
  // judgment as the post-download gate. Real cached shape: didi / 16s /
  // 1080x1920 / "amin naderloei video" scores 13 < 20 and used to die here.
  it("#547: does not skip a candidate whose low score comes from absent metadata", () => {
    const candidate = {
      source: "pexels-video",
      title: "", // Pexels videos API returns no description
      author: "amin naderloei",
      type: "video",
      duration: 16,
      resolution: "1080x1920",
      url: "https://example.com/pexels-video-didi-05.mp4",
      score: 13,
    };
    const ctx = makeContext();
    expect(shouldSkipByPreFilter(candidate, "didi", "pexels-video", ctx.skipped)).toBe(false);
    expect(ctx.skipped).toEqual([]);
  });

  it("#547: legacy author-derived title is not content evidence, descriptive titles still are", () => {
    const legacy = {
      source: "pexels-video",
      title: "Evgenij Mikhailov video",
      author: "Evgenij Mikhailov",
      type: "video",
      duration: 16,
      resolution: "2160x3840",
      url: "https://example.com/a.mp4",
      score: 13,
    };
    const ctx = makeContext();
    // 3 (16s) + 10 (2160) = 13 < 20, but the title only names the author
    expect(shouldSkipByPreFilter(legacy, "didi", "pexels-video", ctx.skipped)).toBe(false);
    expect(ctx.skipped).toEqual([]);

    const described = { ...legacy, title: "unrelated clip", author: undefined };
    const ctx2 = makeContext();
    expect(shouldSkipByPreFilter(described, "didi", "pexels-video", ctx2.skipped)).toBe(true);
    expect(ctx2.skipped[0].reason).toContain("pre-download filter");
  });
});

describe("shouldSkipByDedup", () => {
  it("returns true and records skipped for an already-downloaded URL", () => {
    const ctx = makeContext({ downloadedUrls: new Set(["https://example.com/good.jpg"]) });
    const result = shouldSkipByDedup(
      HIGH_SCORE_CANDIDATE,
      ctx.downloadedUrls,
      "cached",
      ctx.skipped,
    );
    expect(result).toBe(true);
    expect(ctx.skipped).toEqual([{ source: "cached", reason: "URL already downloaded" }]);
  });

  it("returns false and records nothing for a fresh URL", () => {
    const ctx = makeContext();
    const result = shouldSkipByDedup(
      HIGH_SCORE_CANDIDATE,
      ctx.downloadedUrls,
      "cached",
      ctx.skipped,
    );
    expect(result).toBe(false);
    expect(ctx.skipped).toEqual([]);
  });
});

describe("downloadAndRecord", () => {
  it("records a successful download into allAssets with status 'downloaded' and marks URL", async () => {
    mockDownloadCandidate.mockResolvedValue({ success: true, path: "/tmp/assets/good-01.jpg" });
    const ctx = makeContext();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await downloadAndRecord(HIGH_SCORE_CANDIDATE, {
      destPath: join("/tmp/assets", "good-01.jpg"),
      contentDir: "/content",
      label: "unitree",
      sourceName: "unitree",
      keyword: "Unitree",
      ...ctx,
    });

    expect(ctx.allAssets).toEqual([
      expect.objectContaining({
        ...HIGH_SCORE_CANDIDATE,
        path: "/tmp/assets/good-01.jpg",
        status: "downloaded",
      }),
    ]);
    expect(ctx.downloadedUrls.has(HIGH_SCORE_CANDIDATE.url)).toBe(true);
    expect(ctx.failed).toEqual([]);
    expect(ctx.skipped).toEqual([]);
    expect(logSpy).toHaveBeenCalledWith("    ✅ unitree: good-01.jpg (score: 80)");
    logSpy.mockRestore();
  });

  it("records status 'already exists' when dl.skipped is true but download succeeded", async () => {
    mockDownloadCandidate.mockResolvedValue({
      success: true,
      skipped: true,
      path: "/tmp/assets/good-01.jpg",
    });
    const ctx = makeContext();

    await downloadAndRecord(HIGH_SCORE_CANDIDATE, {
      destPath: join("/tmp/assets", "good-01.jpg"),
      contentDir: "/content",
      label: "cached",
      sourceName: "cached",
      keyword: "Unitree",
      ...ctx,
    });

    expect(ctx.allAssets[0].status).toBe("already exists");
    expect(ctx.downloadedUrls.has(HIGH_SCORE_CANDIDATE.url)).toBe(true);
  });

  it("records dl.skipped into the skipped array with dl.error as reason", async () => {
    mockDownloadCandidate.mockResolvedValue({
      success: false,
      skipped: true,
      error: "already downloaded by yt-dlp",
    });
    const ctx = makeContext();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await downloadAndRecord(HIGH_SCORE_CANDIDATE, {
      destPath: join("/tmp/assets", "good-01.jpg"),
      contentDir: "/content",
      label: "youtube_search",
      sourceName: "youtube_search",
      keyword: "Unitree",
      ...ctx,
    });

    expect(ctx.skipped).toEqual([
      {
        source: "youtube_search",
        url: HIGH_SCORE_CANDIDATE.url,
        reason: "already downloaded by yt-dlp",
      },
    ]);
    expect(ctx.allAssets).toEqual([]);
    expect(ctx.failed).toEqual([]);
    expect(logSpy).toHaveBeenCalledWith("    ⏭️  youtube_search: already downloaded by yt-dlp");
    logSpy.mockRestore();
  });

  it("records a skipped candidate's URL so the reason names its input (#636)", async () => {
    // #636: `non-http-url` is a skip (no adapter can fetch it), so the reason
    // alone cannot say which candidate shape was refused — the report line
    // needs the URL next to it, same as the failed branch.
    mockDownloadCandidate.mockResolvedValue({
      success: false,
      skipped: true,
      error: "non-http-url",
    });
    const ctx = makeContext();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await downloadAndRecord(
      { ...HIGH_SCORE_CANDIDATE, url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ" },
      {
        destPath: join("/tmp/assets", "good-01.jpg"),
        contentDir: "/content",
        label: "cached",
        sourceName: "cached",
        keyword: "Unitree",
        ...ctx,
      },
    );

    // The payload is the whole string in a data: URI — keep scheme + media
    // type, drop the base64 body.
    expect(ctx.skipped).toEqual([
      { source: "cached", url: "data:image/jpeg;base64,…", reason: "non-http-url" },
    ]);
    logSpy.mockRestore();
  });

  it("records a hard failure into failed with source + keyword + url + error", async () => {
    mockDownloadCandidate.mockResolvedValue({
      success: false,
      skipped: false,
      error: "Connection refused",
    });
    const ctx = makeContext();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await downloadAndRecord(HIGH_SCORE_CANDIDATE, {
      destPath: join("/tmp/assets", "good-01.jpg"),
      contentDir: "/content",
      label: "wikimedia",
      sourceName: "wikimedia",
      keyword: "Unitree",
      ...ctx,
    });

    // #636: the URL belongs in the report — without it a failure line cannot
    // tell which candidate shape the download chain rejected.
    expect(ctx.failed).toEqual([
      {
        source: "wikimedia",
        keyword: "Unitree",
        url: HIGH_SCORE_CANDIDATE.url,
        error: "Connection refused",
      },
    ]);
    expect(ctx.allAssets).toEqual([]);
    expect(ctx.skipped).toEqual([]);
    expect(logSpy).toHaveBeenCalledWith("    ❌ wikimedia: Connection refused");
    logSpy.mockRestore();
  });

  it("awaits an onDownloaded hook before pushing the entry (wikimedia license pattern)", async () => {
    mockDownloadCandidate.mockResolvedValue({ success: true, path: "/tmp/assets/good-01.jpg" });
    const ctx = makeContext();
    const onDownloaded = vi.fn(async (entry, candidate) => {
      entry.licenseInfo = { license: "CC BY", author: "someone" };
    });

    await downloadAndRecord(HIGH_SCORE_CANDIDATE, {
      destPath: join("/tmp/assets", "good-01.jpg"),
      contentDir: "/content",
      label: "wikimedia",
      sourceName: "wikimedia",
      keyword: "Unitree",
      onDownloaded,
      ...ctx,
    });

    expect(onDownloaded).toHaveBeenCalledTimes(1);
    expect(ctx.allAssets[0].licenseInfo).toEqual({ license: "CC BY", author: "someone" });
  });

  it("passes downloadOpts (e.g. headers) through to downloadCandidate", async () => {
    mockDownloadCandidate.mockResolvedValue({ success: true, path: "/tmp/assets/good-01.jpg" });
    const ctx = makeContext();
    const headers = { "User-Agent": "ChinaAINews/1.0" };

    await downloadAndRecord(HIGH_SCORE_CANDIDATE, {
      destPath: join("/tmp/assets", "good-01.jpg"),
      contentDir: "/content",
      label: "wikimedia",
      sourceName: "wikimedia",
      keyword: "Unitree",
      downloadOpts: { headers },
      ...ctx,
    });

    expect(mockDownloadCandidate).toHaveBeenCalledWith(HIGH_SCORE_CANDIDATE, {
      destPath: join("/tmp/assets", "good-01.jpg"),
      contentDir: "/content",
      headers,
    });
  });

  it("does not mark URL as downloaded when the download fails", async () => {
    mockDownloadCandidate.mockResolvedValue({ success: false, skipped: false, error: "boom" });
    const ctx = makeContext();

    await downloadAndRecord(HIGH_SCORE_CANDIDATE, {
      destPath: join("/tmp/assets", "good-01.jpg"),
      contentDir: "/content",
      label: "unitree",
      sourceName: "unitree",
      keyword: "Unitree",
      ...ctx,
    });

    expect(ctx.downloadedUrls.has(HIGH_SCORE_CANDIDATE.url)).toBe(false);
  });
});
