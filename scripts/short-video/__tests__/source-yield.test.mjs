/**
 * Source yield assertions (#779).
 *
 * TDD: these tests were written before `lib/source-yield.mjs` existed. The
 * contract under test is arithmetic only — no network, no model calls:
 * per-source media contribution vs a baseline derived from persisted runs.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  SOURCE_YIELD_SCHEMA_VERSION,
  YIELD_HISTORY_FILE,
  YIELD_REPORT_FILE,
  YIELD_BASELINE_WINDOW,
  mediaTypeOfAsset,
  collectContributedCounts,
  collectAttemptReasons,
  deriveBaselines,
  buildSourceYieldReport,
  renderSourceYieldSummary,
  loadYieldHistory,
  appendYieldHistory,
  bootstrapYieldHistory,
  strictYieldExitCode,
  writeYieldReport,
} from "../lib/source-yield.mjs";
import { buildExpectedYieldSources } from "../lib/asset-sourcer.mjs";

const BEFORE = "2026-01-10T00:00:00.000Z";

function historyEntry(runAt, counts) {
  return {
    schemaVersion: 1,
    runAt,
    content: "fixture",
    sources: Object.entries(counts).map(([source, contributed]) => ({
      source,
      contributed,
      status: contributed > 0 ? "ok" : "no-baseline",
    })),
  };
}

function expectedSource(source, capabilities, conditional = false) {
  return { source, capabilities, conditional };
}

function buildReport(overrides = {}) {
  return buildSourceYieldReport({
    contentSlug: "fixture",
    runAt: BEFORE,
    expectedSources: [expectedSource("pexels", ["image"])],
    assets: [],
    skipped: [],
    failed: [],
    baselines: {},
    tier3Ran: false,
    priorRuns: 0,
    ...overrides,
  });
}

function rowFor(report, source) {
  return report.sources.find((row) => row.source === source);
}

// ─── Baseline arithmetic ───

describe("deriveBaselines", () => {
  it("ignores zeros and takes the minimum positive contribution", () => {
    const history = [
      historyEntry("2026-01-01T00:00:00.000Z", { pexels: 0 }),
      historyEntry("2026-01-02T00:00:00.000Z", { pexels: 5 }),
      historyEntry("2026-01-03T00:00:00.000Z", { pexels: 2 }),
      historyEntry("2026-01-04T00:00:00.000Z", { pexels: 0 }),
    ];
    expect(deriveBaselines(history, { before: BEFORE })).toEqual({ pexels: 2 });
  });

  it("limits the window to the last 10 prior runs in file order", () => {
    const history = [historyEntry("2026-01-01T00:00:00.000Z", { pexels: 1 })];
    for (let day = 2; day <= 11; day++) {
      history.push(
        historyEntry(`2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`, { pexels: 4 }),
      );
    }
    expect(YIELD_BASELINE_WINDOW).toBe(10);
    expect(deriveBaselines(history, { before: "2026-02-01T00:00:00.000Z" })).toEqual({
      pexels: 4,
    });
  });

  it("excludes runs at or after the `before` cutoff", () => {
    const history = [
      historyEntry("2026-01-09T23:59:59.000Z", { pexels: 3 }),
      historyEntry(BEFORE, { pexels: 1 }),
      historyEntry("2026-01-11T00:00:00.000Z", { pexels: 1 }),
    ];
    expect(deriveBaselines(history, { before: BEFORE })).toEqual({ pexels: 3 });
  });

  it("ignores malformed entries and observations", () => {
    const history = [
      null,
      "not-an-entry",
      {},
      { runAt: "not-a-date", sources: [{ source: "pexels", contributed: 9 }] },
      { runAt: "2026-01-01T00:00:00.000Z", sources: "not-an-array" },
      {
        runAt: "2026-01-02T00:00:00.000Z",
        sources: [
          null,
          { source: "pexels", contributed: "9" },
          { source: "pexels", contributed: Number.NaN },
          { source: "pexels", contributed: 3 },
        ],
      },
    ];
    expect(deriveBaselines(history, { before: BEFORE })).toEqual({ pexels: 3 });
  });

  it("returns no baseline when a source has no positive observation", () => {
    const history = [
      historyEntry("2026-01-01T00:00:00.000Z", { pexels: 0 }),
      historyEntry("2026-01-02T00:00:00.000Z", { ithome: 4 }),
    ];
    expect(deriveBaselines(history, { before: BEFORE })).toEqual({ ithome: 4 });
  });

  it("is deterministic for the same input", () => {
    const history = [
      historyEntry("2026-01-02T00:00:00.000Z", { youtube_search: 3, pexels: 5 }),
      historyEntry("2026-01-03T00:00:00.000Z", { youtube_search: 1, pexels: 2 }),
    ];
    const first = deriveBaselines(history, { before: BEFORE });
    const second = deriveBaselines(history, { before: BEFORE });
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.keys(first)).toEqual(["pexels", "youtube_search"]);
  });
});

// ─── Media filtering ───

describe("collectContributedCounts", () => {
  it("counts only media assets and excludes cached-media", () => {
    const assets = [
      { source: "pexels", type: "image", path: "a.jpg" },
      { source: "pexels", type: "image", path: "b.jpg" },
      { source: "pexels-video", type: "video", path: "c.mp4" },
      { source: "google_search", type: "text", path: null },
      { source: "google_search", type: "text", path: "article.jpg" },
      { source: "cached-media", type: "image", path: "d.jpg" },
      { source: "cached-media", type: "video", path: "e.mp4" },
    ];
    expect(collectContributedCounts(assets)).toEqual({ pexels: 2, "pexels-video": 1 });
  });

  it("infers media type from the path when `type` is absent", () => {
    expect(mediaTypeOfAsset({ path: "x/photo.JPEG" })).toBe("image");
    expect(mediaTypeOfAsset({ path: "x/photo.png" })).toBe("image");
    expect(mediaTypeOfAsset({ path: "x/photo.webp" })).toBe("image");
    expect(mediaTypeOfAsset({ path: "x/clip.MOV" })).toBe("video");
    expect(mediaTypeOfAsset({ path: "x/clip.m4v" })).toBe("video");
    expect(mediaTypeOfAsset({ path: "x/file.bin" })).toBe(null);
    expect(mediaTypeOfAsset({ type: "text", path: "x/file.jpg" })).toBe(null);
    expect(mediaTypeOfAsset({ type: "image", path: null })).toBe("image");
    expect(mediaTypeOfAsset(null)).toBe(null);
    expect(collectContributedCounts([{ source: "legacy", path: "x/a.MP4" }])).toEqual({
      legacy: 1,
    });
  });
});

// ─── Attempt reasons ───

describe("collectAttemptReasons", () => {
  it("deduplicates reasons, preserves order, and caps at 3 per source", () => {
    const reasons = collectAttemptReasons(
      [
        { source: "pexels", reason: "no API key" },
        { source: "pexels", reason: "no API key" },
        { source: "youtube_search", reason: "pre-download filter (score: 3)" },
        { source: "s", reason: "a" },
        { source: "s", reason: "b" },
        { source: "s", reason: "c" },
        { source: "s", reason: "d" },
        { source: "empty", reason: "" },
      ],
      [
        { source: "youtube_search", error: "boom" },
        { source: "pexels", error: "rate limited (x)" },
      ],
    );
    expect(reasons).toEqual({
      pexels: ["no API key", "rate limited (x)"],
      s: ["a", "b", "c"],
      youtube_search: ["pre-download filter (score: 3)", "boom"],
    });
  });
});

// ─── Status matrix ───

describe("buildSourceYieldReport statuses", () => {
  it("marks a source at or above baseline as ok", () => {
    const report = buildReport({
      assets: [{ source: "pexels", type: "image", path: "x.jpg" }],
      baselines: { pexels: 1 },
    });
    expect(rowFor(report, "pexels")).toMatchObject({
      expected: true,
      contributed: 1,
      baseline: 1,
      status: "ok",
    });
    expect(report.drops).toEqual([]);
  });

  it("drops a source at 0 and surfaces the pre-download filter reason", () => {
    const report = buildReport({
      expectedSources: [expectedSource("youtube_search", ["video"])],
      skipped: [{ source: "youtube_search", reason: "pre-download filter (score: 3)" }],
      baselines: { youtube_search: 2 },
    });
    expect(rowFor(report, "youtube_search")).toMatchObject({
      contributed: 0,
      skipped: 1,
      failed: 0,
      reasons: ["pre-download filter (score: 3)"],
      baseline: 2,
      status: "drop",
    });
    expect(report.drops).toHaveLength(1);
  });

  it("drops a source below a non-zero baseline", () => {
    const report = buildReport({
      assets: [{ source: "pexels", type: "image", path: "x.jpg" }],
      baselines: { pexels: 3 },
    });
    expect(rowFor(report, "pexels").status).toBe("drop");
    expect(report.drops).toHaveLength(1);
  });

  it("classifies a missing API key as an environmental skip, not a drop", () => {
    const report = buildReport({
      expectedSources: [expectedSource("tavily_images", ["image"], true)],
      skipped: [{ source: "tavily_images", reason: "no API key" }],
      baselines: { tavily_images: 2 },
      tier3Ran: true,
    });
    expect(rowFor(report, "tavily_images")).toMatchObject({
      status: "skipped",
      reasons: ["no API key"],
    });
    expect(report.drops).toEqual([]);
  });

  it("classifies a rate-limit reason with no baseline as an environmental skip", () => {
    const report = buildReport({
      expectedSources: [expectedSource("ithome", ["image"])],
      skipped: [{ source: "ithome", reason: "rate limited (_default) — skipped" }],
    });
    expect(rowFor(report, "ithome").status).toBe("skipped");
    expect(report.drops).toEqual([]);
  });

  it("marks a Tier-3-only source as not-run when Tier 3 did not run", () => {
    const report = buildReport({
      expectedSources: [expectedSource("google_images", ["image"], true)],
      baselines: { google_images: 2 },
      tier3Ran: false,
    });
    expect(rowFor(report, "google_images")).toMatchObject({
      conditional: true,
      status: "not-run",
      baseline: 2,
    });
    expect(report.drops).toEqual([]);
  });

  it("uses no-baseline when there is no prior observation", () => {
    const report = buildReport({
      assets: [{ source: "pexels", type: "image", path: "x.jpg" }],
      baselines: {},
    });
    expect(rowFor(report, "pexels")).toMatchObject({
      baseline: null,
      observedRuns: 0,
      status: "no-baseline",
    });
  });

  it("reports unexpected sources without asserting on them", () => {
    const report = buildReport({
      assets: [{ source: "legacy", type: "image", path: "legacy.jpg" }],
      skipped: [{ source: "mystery", reason: "rate limited (x)" }],
      baselines: {},
    });
    expect(rowFor(report, "legacy")).toMatchObject({
      expected: false,
      contributed: 1,
      status: "observed",
    });
    expect(rowFor(report, "mystery")).toMatchObject({
      expected: false,
      skipped: 1,
      status: "observed",
    });
    expect(report.drops).toEqual([]);
  });

  it("records failed counts and errors as reasons", () => {
    const report = buildReport({
      expectedSources: [expectedSource("searxng_image", ["image"])],
      failed: [{ source: "searxng_image", keyword: "robot", error: "http-426" }],
      baselines: { searxng_image: 1 },
    });
    expect(rowFor(report, "searxng_image")).toMatchObject({
      failed: 1,
      reasons: ["http-426"],
      status: "drop",
    });
  });

  it("carries schema, report metadata, and sorted rows", () => {
    const report = buildReport({
      expectedSources: [
        expectedSource("youtube_search", ["video"]),
        expectedSource("pexels", ["image"]),
      ],
      priorRuns: 3,
    });
    expect(report).toMatchObject({
      schemaVersion: SOURCE_YIELD_SCHEMA_VERSION,
      content: "fixture",
      runAt: BEFORE,
      tier3Ran: false,
      baseline: {
        rule: "min-positive",
        window: YIELD_BASELINE_WINDOW,
        historyFile: YIELD_HISTORY_FILE,
        priorRuns: 3,
      },
    });
    expect(report.sources.map((row) => row.source)).toEqual(["pexels", "youtube_search"]);
  });
});

// ─── Summary rendering ───

describe("renderSourceYieldSummary", () => {
  it("names the baseline rule and the table columns", () => {
    const report = buildReport({
      assets: [{ source: "pexels", type: "image", path: "x.jpg" }],
      baselines: { pexels: 1 },
    });
    const lines = renderSourceYieldSummary(report);
    expect(lines[0]).toMatch(/lowest positive/i);
    expect(lines[0]).toContain(String(YIELD_BASELINE_WINDOW));
    expect(lines.some((line) => /source.*baseline.*status/i.test(line))).toBe(true);
  });

  it("renders the exact drop warning for a zero-yield source", () => {
    const report = buildReport({
      expectedSources: [expectedSource("youtube_search", ["video"])],
      skipped: [{ source: "youtube_search", reason: "pre-download filter (score: 3)" }],
      baselines: { youtube_search: 2 },
    });
    const lines = renderSourceYieldSummary(report);
    const dropLine = lines.find((line) => line.includes("[SOURCE-YIELD-DROP]"));
    expect(dropLine).toBe(
      "⚠️ [SOURCE-YIELD-DROP] youtube_search: actual 0 < baseline 2 — pre-download filter (score: 3)",
    );
  });

  it("does not render a drop warning for ok rows", () => {
    const report = buildReport({
      assets: [{ source: "pexels", type: "image", path: "x.jpg" }],
      baselines: { pexels: 1 },
    });
    const lines = renderSourceYieldSummary(report);
    expect(lines.some((line) => line.includes("[SOURCE-YIELD-DROP]"))).toBe(false);
  });

  it("falls back to `no candidates returned` when a drop has no reasons", () => {
    const report = buildReport({ baselines: { pexels: 2 } });
    const lines = renderSourceYieldSummary(report);
    const dropLine = lines.find((line) => line.includes("[SOURCE-YIELD-DROP]"));
    expect(dropLine).toBe(
      "⚠️ [SOURCE-YIELD-DROP] pexels: actual 0 < baseline 2 — no candidates returned",
    );
  });
});

// ─── Persisted history ───

describe("yield history", () => {
  let tmp = null;

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });

  function appendReport(filePath, { runAt, pexels }) {
    const report = buildReport({
      runAt,
      expectedSources: [
        expectedSource("pexels", ["image"]),
        expectedSource("google_images", ["image"], true),
      ],
      assets: [
        ...Array.from({ length: pexels }, (_, i) => ({
          source: "pexels",
          type: "image",
          path: `p-${i}.jpg`,
        })),
        { source: "legacy", type: "image", path: "legacy.jpg" },
      ],
      baselines: {},
    });
    return { report, result: appendYieldHistory(filePath, report) };
  }

  it("appends one line per run with expected sources only, including zeros", () => {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-test-"));
    const filePath = join(tmp, "nested", "deeper", YIELD_HISTORY_FILE);
    expect(existsSync(filePath)).toBe(false);

    const first = appendReport(filePath, { runAt: "2026-01-11T00:00:00.000Z", pexels: 3 });
    const second = appendReport(filePath, { runAt: "2026-01-12T00:00:00.000Z", pexels: 1 });
    expect(first.result).toEqual({ ok: true });
    expect(second.result).toEqual({ ok: true });

    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const entry = JSON.parse(lines[0]);
    expect(entry).toEqual({
      schemaVersion: SOURCE_YIELD_SCHEMA_VERSION,
      runAt: "2026-01-11T00:00:00.000Z",
      content: "fixture",
      sources: [
        { source: "google_images", contributed: 0, status: "not-run" },
        { source: "pexels", contributed: 3, status: "no-baseline" },
      ],
    });
  });

  it("round-trips through loadYieldHistory and reproduces the same baseline", () => {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-test-"));
    const filePath = join(tmp, YIELD_HISTORY_FILE);
    appendReport(filePath, { runAt: "2026-01-11T00:00:00.000Z", pexels: 3 });
    appendReport(filePath, { runAt: "2026-01-12T00:00:00.000Z", pexels: 1 });

    const history = loadYieldHistory(filePath);
    expect(history).toHaveLength(2);
    const first = deriveBaselines(history, { before: "2026-01-13T00:00:00.000Z" });
    const second = deriveBaselines(loadYieldHistory(filePath), {
      before: "2026-01-13T00:00:00.000Z",
    });
    expect(first).toEqual({ pexels: 1 });
    expect(first).toEqual(second);
  });

  it("ignores malformed lines and returns [] for a missing file", () => {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-test-"));
    const filePath = join(tmp, YIELD_HISTORY_FILE);
    writeFileSync(
      filePath,
      `${JSON.stringify(historyEntry("2026-01-01T00:00:00.000Z", { pexels: 2 }))}\n` +
        "not-json\n" +
        "[1,2]\n" +
        "null\n" +
        `${JSON.stringify(historyEntry("2026-01-02T00:00:00.000Z", { pexels: 1 }))}\n`,
      "utf8",
    );
    expect(loadYieldHistory(filePath)).toHaveLength(2);
    expect(loadYieldHistory(join(tmp, "missing.jsonl"))).toEqual([]);
  });

  it("returns a warning result instead of throwing when the file cannot be written", () => {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-test-"));
    const blocker = join(tmp, "blocker");
    writeFileSync(blocker, "x");
    const result = appendYieldHistory(join(blocker, YIELD_HISTORY_FILE), buildReport());
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  it("exposes the report and history file names", () => {
    expect(YIELD_REPORT_FILE).toBe("source-yield-report.json");
    expect(YIELD_HISTORY_FILE).toBe("source-yield-history.jsonl");
  });
});

// ─── Expected-source SSOT from asset-sourcer ───

describe("buildExpectedYieldSources", () => {
  const sources = buildExpectedYieldSources();
  const byName = new Map(sources.map((row) => [row.source, row]));

  it("lists all 24 distinct expected sources exactly once", () => {
    expect(sources).toHaveLength(24);
    expect(new Set(sources.map((row) => row.source)).size).toBe(24);
  });

  it("derives capabilities from API, yt-dlp, CDP, and Tier 3 phases", () => {
    expect(byName.get("pexels")?.capabilities).toEqual(["image"]);
    expect(byName.get("pexels-video")?.capabilities).toEqual(["video"]);
    expect(byName.get("youtube_search")?.capabilities).toEqual(["video"]);
    // #314: qbitai's generic CDP video declaration was removed (0 players on
    // 5 live article pages); douyin has a verified video search page.
    expect(byName.get("qbitai")?.capabilities).toEqual(["image"]);
    expect(byName.get("douyin")?.capabilities).toEqual(["video"]);
    expect(byName.get("baidu_search")?.capabilities).toEqual(["image", "video"]);
  });

  it("marks only Tier-3-only engines conditional", () => {
    for (const name of ["google_images", "bing_images", "duckduckgo_images", "tavily_images"]) {
      expect(byName.get(name)?.conditional, name).toBe(true);
    }
    expect(byName.get("brave_image")?.conditional).toBe(false);
    expect(byName.get("searxng_image")?.conditional).toBe(false);
    expect(byName.get("brave_image")?.capabilities).toEqual(["image"]);
  });
});

// ─── Historical artifact bootstrap ───

describe("bootstrapYieldHistory", () => {
  let tmp = null;

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });

  function writeJson(filePath, value, mtimeIso) {
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, JSON.stringify(value), "utf8");
    const mtime = new Date(mtimeIso);
    utimesSync(filePath, mtime, mtime);
  }

  function fixture() {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-bootstrap-"));
    const outputDir = join(tmp, "output");
    writeJson(
      join(outputDir, "asset-report.json"),
      {
        content: "alpha",
        assets: [
          { source: "pexels", type: "image", path: "a.jpg" },
          { source: "pexels", type: "image", path: "b.jpg" },
          { source: "google_search", type: "text", path: null },
          { source: "cached-media", type: "image", path: "c.jpg" },
        ],
      },
      "2026-01-01T00:00:00.000Z",
    );
    writeJson(
      join(outputDir, "beta", "media-patch.json"),
      [
        { source: "pexels-video", path: "clip.mp4" },
        { source: "google_search", path: null },
      ],
      "2026-01-02T00:00:00.000Z",
    );
    writeJson(
      join(outputDir, "gamma", "media-patch.json"),
      {
        schemaVersion: 1,
        patches: [
          { source: "coverr", path: "coverr-1.webm" },
          { source: "coverr", path: "coverr-2.webm" },
        ],
      },
      "2026-01-03T00:00:00.000Z",
    );
    return outputDir;
  }

  it("bootstraps positive media counts from legacy artifacts, sorted by mtime", () => {
    const outputDir = fixture();
    const historyPath = join(tmp, "history", YIELD_HISTORY_FILE);
    const result = bootstrapYieldHistory({ outputDir, historyPath, before: BEFORE });

    expect(result).toEqual({ ok: true, bootstrapped: true, entries: 3 });
    const history = loadYieldHistory(historyPath);
    expect(history).toHaveLength(3);
    expect(history.map((entry) => entry.content)).toEqual(["alpha", "beta", "gamma"]);
    expect(history.map((entry) => entry.runAt)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
      "2026-01-03T00:00:00.000Z",
    ]);
    expect(history[0].sources).toEqual([{ source: "pexels", contributed: 2, status: "observed" }]);
    expect(history[1].sources).toEqual([
      { source: "pexels-video", contributed: 1, status: "observed" },
    ]);
    expect(history[2].sources).toEqual([{ source: "coverr", contributed: 2, status: "observed" }]);
  });

  it("counts assigned patch media nested under `media` (writer shape)", () => {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-bootstrap-"));
    const outputDir = join(tmp, "output");
    writeJson(
      join(outputDir, "alpha", "media-patch.json"),
      {
        schemaVersion: 1,
        patches: [
          {
            sceneId: 6,
            status: "assigned",
            source: "pexels",
            media: { type: "image", path: "assets/pexels-chart-01.jpg", source: "pexels" },
          },
          {
            sceneId: 7,
            status: "assigned",
            source: "pexels-video",
            media: { type: "video", path: "assets/pexels-clip.mp4", source: "pexels-video" },
          },
          { status: "unassigned", source: "searxng_image", assetScore: 82 },
        ],
      },
      "2026-01-01T00:00:00.000Z",
    );
    const historyPath = join(tmp, "history", YIELD_HISTORY_FILE);

    const result = bootstrapYieldHistory({ outputDir, historyPath, before: BEFORE });
    expect(result).toEqual({ ok: true, bootstrapped: true, entries: 1 });
    const history = loadYieldHistory(historyPath);
    expect(history[0].content).toBe("alpha");
    expect(history[0].sources).toEqual([
      { source: "pexels", contributed: 1, status: "observed" },
      { source: "pexels-video", contributed: 1, status: "observed" },
    ]);
  });

  it("does not double-count the run behind asset-report.json when its media-patch.json exists", () => {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-bootstrap-"));
    const outputDir = join(tmp, "output");
    writeJson(
      join(outputDir, "asset-report.json"),
      {
        content: "alpha",
        assets: [{ source: "pexels", type: "image", path: "a.jpg" }],
      },
      "2026-01-01T00:00:00.000Z",
    );
    writeJson(
      join(outputDir, "alpha", "media-patch.json"),
      [
        { source: "pexels", path: "a.jpg" },
        { source: "pexels", path: "b.jpg" },
      ],
      "2026-01-01T00:00:05.000Z",
    );
    writeJson(
      join(outputDir, "beta", "media-patch.json"),
      [{ source: "coverr", path: "c.webm" }],
      "2026-01-02T00:00:00.000Z",
    );
    const historyPath = join(tmp, "history", YIELD_HISTORY_FILE);

    const result = bootstrapYieldHistory({ outputDir, historyPath, before: BEFORE });
    expect(result).toEqual({ ok: true, bootstrapped: true, entries: 2 });
    const history = loadYieldHistory(historyPath);
    expect(history.map((entry) => entry.content)).toEqual(["alpha", "beta"]);
    expect(history[0].sources).toEqual([{ source: "pexels", contributed: 2, status: "observed" }]);
  });

  it("is a no-op when the history already has a valid entry", () => {
    const outputDir = fixture();
    const historyPath = join(tmp, YIELD_HISTORY_FILE);
    const existing = `${JSON.stringify(historyEntry("2025-12-01T00:00:00.000Z", { pexels: 9 }))}\n`;
    writeFileSync(historyPath, existing, "utf8");

    const result = bootstrapYieldHistory({ outputDir, historyPath, before: BEFORE });
    expect(result).toEqual({ ok: true, bootstrapped: false, entries: 0 });
    expect(readFileSync(historyPath, "utf8")).toBe(existing);
  });

  it("skips artifacts at or after the run cutoff", () => {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-bootstrap-"));
    const outputDir = join(tmp, "output");
    writeJson(
      join(outputDir, "beta", "media-patch.json"),
      [{ source: "pexels", path: "a.jpg" }],
      "2026-03-01T00:00:00.000Z",
    );
    const historyPath = join(tmp, YIELD_HISTORY_FILE);

    const result = bootstrapYieldHistory({ outputDir, historyPath, before: BEFORE });
    expect(result).toEqual({ ok: true, bootstrapped: false, entries: 0 });
    expect(existsSync(historyPath)).toBe(false);
  });

  it("ignores malformed artifacts and a missing output directory", () => {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-bootstrap-"));
    const outputDir = join(tmp, "output");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, "asset-report.json"), "{not json", "utf8");
    writeJson(join(outputDir, "beta", "media-patch.json"), {}, "2026-01-01T00:00:00.000Z");
    const historyPath = join(tmp, YIELD_HISTORY_FILE);

    expect(bootstrapYieldHistory({ outputDir, historyPath, before: BEFORE })).toEqual({
      ok: true,
      bootstrapped: false,
      entries: 0,
    });
    expect(
      bootstrapYieldHistory({
        outputDir: join(tmp, "nope"),
        historyPath,
        before: BEFORE,
      }),
    ).toEqual({ ok: true, bootstrapped: false, entries: 0 });
  });

  it("is deterministic for the same artifact set", () => {
    const outputDir = fixture();
    const firstPath = join(tmp, "first.jsonl");
    const secondPath = join(tmp, "second.jsonl");
    bootstrapYieldHistory({ outputDir, historyPath: firstPath, before: BEFORE });
    bootstrapYieldHistory({ outputDir, historyPath: secondPath, before: BEFORE });
    expect(readFileSync(firstPath, "utf8")).toBe(readFileSync(secondPath, "utf8"));
  });

  it("feeds a real drop assertion from historical artifacts", () => {
    const outputDir = fixture();
    const historyPath = join(tmp, YIELD_HISTORY_FILE);
    bootstrapYieldHistory({ outputDir, historyPath, before: BEFORE });

    const baselines = deriveBaselines(loadYieldHistory(historyPath), { before: BEFORE });
    expect(baselines).toMatchObject({ pexels: 2, "pexels-video": 1, coverr: 2 });

    const report = buildSourceYieldReport({
      contentSlug: "alpha",
      runAt: BEFORE,
      expectedSources: [
        expectedSource("pexels", ["image"]),
        expectedSource("pexels-video", ["video"]),
      ],
      assets: [{ source: "pexels", type: "image", path: "fresh.jpg" }],
      baselines,
    });
    expect(rowFor(report, "pexels-video")).toMatchObject({
      contributed: 0,
      baseline: 1,
      status: "drop",
    });
    expect(renderSourceYieldSummary(report)).toContain(
      "⚠️ [SOURCE-YIELD-DROP] pexels-video: actual 0 < baseline 1 — no candidates returned",
    );
  });
});

describe("strictYieldExitCode", () => {
  it("fails only when strict mode is requested and the report has drops", () => {
    const dropping = buildReport({ baselines: { pexels: 2 } });
    expect(dropping.drops).toHaveLength(1);
    expect(strictYieldExitCode(dropping, true)).toBe(1);
    expect(strictYieldExitCode(dropping, false)).toBe(0);
    expect(strictYieldExitCode({ drops: [] }, true)).toBe(0);
    expect(strictYieldExitCode(null, true)).toBe(0);
  });
});

describe("writeYieldReport", () => {
  let tmp = null;

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });

  it("writes the report as JSON with a trailing newline", () => {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-report-"));
    const filePath = join(tmp, "nested", YIELD_REPORT_FILE);
    expect(writeYieldReport(filePath, { schemaVersion: 1 })).toEqual({ ok: true });
    expect(readFileSync(filePath, "utf8")).toBe('{\n  "schemaVersion": 1\n}\n');
  });

  it("returns an error instead of throwing when the path is unwritable", () => {
    tmp = mkdtempSync(join(tmpdir(), "source-yield-report-"));
    const blocker = join(tmp, "blocker");
    writeFileSync(blocker, "x", "utf8");
    const result = writeYieldReport(join(blocker, YIELD_REPORT_FILE), {});
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
  });
});
