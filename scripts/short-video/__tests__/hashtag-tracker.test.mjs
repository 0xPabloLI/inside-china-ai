import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseJsonl,
  serializeJsonl,
  normalizeObservation,
  upsertRecords,
  mapDetailsToObservations,
  summarizeTagStats,
} from "../lib/hashtag-tracker.mjs";

// ─── parseJsonl / serializeJsonl ───

describe("parseJsonl", () => {
  it("parses one record per line and skips blank lines", () => {
    const text = '{"videoId":"1"}\n\n{"videoId":"2"}\n';
    expect(parseJsonl(text).map((r) => r.videoId)).toEqual(["1", "2"]);
  });

  it("returns [] for empty text", () => {
    expect(parseJsonl("")).toEqual([]);
  });

  it("throws with the offending line number on invalid JSON", () => {
    expect(() => parseJsonl('{"videoId":"1"}\nnot json\n')).toThrow(/line 2/);
  });
});

describe("serializeJsonl", () => {
  it("emits one JSON object per line with a trailing newline", () => {
    const out = serializeJsonl([{ a: 1 }, { b: 2 }]);
    expect(out).toBe('{"a":1}\n{"b":2}\n');
  });

  it("returns empty string for an empty list", () => {
    expect(serializeJsonl([])).toBe("");
  });

  it("round-trips through parseJsonl", () => {
    const records = [
      { videoId: "1", views: 10 },
      { videoId: "2", views: null },
    ];
    expect(parseJsonl(serializeJsonl(records))).toEqual(records);
  });
});

// ─── normalizeObservation ───

describe("normalizeObservation", () => {
  it("rejects a missing videoId", () => {
    expect(() => normalizeObservation({ views: 1 })).toThrow(/videoId/);
  });

  it("rejects a numeric videoId (TikTok ids exceed Number precision)", () => {
    expect(() => normalizeObservation({ videoId: 7691045312206474517 })).toThrow(/videoId/);
  });

  it("defaults recordedAt to now and source to manual", () => {
    const rec = normalizeObservation({ videoId: "1" }, { now: new Date("2026-10-11T12:00:00Z") });
    expect(rec.recordedAt).toBe("2026-10-11T12:00:00.000Z");
    expect(rec.source).toBe("manual");
  });

  it("normalizes a date-only recordedAt to full ISO", () => {
    const rec = normalizeObservation({ videoId: "1", recordedAt: "2026-10-11" });
    expect(rec.recordedAt).toBe("2026-10-11T00:00:00.000Z");
  });

  it("rejects an unparsable recordedAt", () => {
    expect(() => normalizeObservation({ videoId: "1", recordedAt: "not-a-date" })).toThrow(
      /recordedAt/,
    );
  });

  it("keeps metric nulls and coerces present numbers", () => {
    const rec = normalizeObservation({ videoId: "1", views: "651", likes: null });
    expect(rec.views).toBe(651);
    expect(rec.likes).toBe(null);
    expect(rec.avgWatchTimeSec).toBe(null);
  });

  it("rejects non-finite metrics", () => {
    expect(() => normalizeObservation({ videoId: "1", views: "many" })).toThrow(/views/);
  });

  it("defaults list fields to empty arrays", () => {
    const rec = normalizeObservation({ videoId: "1" });
    expect(rec.hashtags).toEqual([]);
    expect(rec.searchQueries).toEqual([]);
  });
});

// ─── upsertRecords ───

const baseRecord = (over = {}) => ({
  videoId: "7691045312206474517",
  videoTitle: "DeepSeek's desktop app was sitting on its own download server",
  publishedAt: "2026-09-30T03:43:00+08:00",
  hashtags: ["#deepseek", "#chinaai", "#aiagents"],
  views: 651,
  likes: 18,
  comments: 0,
  searchQueries: [],
  fypPercent: 86.1,
  searchPercent: 13.2,
  avgWatchTimeSec: 10.72,
  watchedFullVideoPct: 4.1,
  recordedAt: "2026-10-01T00:00:00Z",
  source: "studio-analytics-detail",
  sources: ["2026-10-01T00:00:00Z studio-analytics-detail"],
  ...over,
});

describe("upsertRecords", () => {
  it("adds a new video as one record", () => {
    const { records, added } = upsertRecords(
      [],
      [{ videoId: "1", views: 10, recordedAt: "2026-10-01T00:00:00Z", source: "s" }],
    );
    expect(added).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0].views).toBe(10);
    expect(records[0].sources).toEqual(["2026-10-01T00:00:00.000Z s"]);
  });

  it("merges the same videoId instead of appending a second row", () => {
    const { records, added, updated } = upsertRecords(
      [baseRecord()],
      [
        {
          videoId: "7691045312206474517",
          views: 700,
          recordedAt: "2026-10-05T00:00:00Z",
          source: "s2",
        },
      ],
    );
    expect(added).toBe(0);
    expect(updated).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0].views).toBe(700);
  });

  it("lets a newer observation overwrite non-null fields but never wipe with null", () => {
    const { records } = upsertRecords(
      [baseRecord()],
      [
        {
          videoId: "7691045312206474517",
          views: 700,
          likes: 20,
          avgWatchTimeSec: null,
          fypPercent: null,
          recordedAt: "2026-10-05T00:00:00Z",
          source: "studio-analytics-content",
        },
      ],
    );
    expect(records[0].views).toBe(700);
    expect(records[0].likes).toBe(20);
    expect(records[0].avgWatchTimeSec).toBe(10.72); // null did not wipe
    expect(records[0].fypPercent).toBe(86.1); // null did not wipe
  });

  it("lets a stale observation fill nulls but not roll back fresher data", () => {
    const existing = [baseRecord({ views: 651, likes: null, avgWatchTimeSec: null })];
    const { records } = upsertRecords(existing, [
      {
        videoId: "7691045312206474517",
        views: 100,
        likes: 3,
        avgWatchTimeSec: 9.1,
        recordedAt: "2026-09-30T00:00:00Z",
        source: "older-import",
      },
    ]);
    expect(records[0].views).toBe(651); // no rollback
    expect(records[0].likes).toBe(3); // filled the gap
    expect(records[0].avgWatchTimeSec).toBe(9.1); // filled the gap
    expect(records[0].recordedAt).toBe("2026-10-01T00:00:00Z"); // freshness kept
  });

  it("keeps the tag set when an observation carries no hashtags at all", () => {
    // The per-video details file has no hashtags: "no information" must not
    // read as "no tags" and wipe a known set.
    const { records } = upsertRecords(
      [baseRecord()],
      [
        {
          videoId: "7691045312206474517",
          views: 700,
          recordedAt: "2026-10-05T00:00:00Z",
          source: "studio-analytics-detail",
        },
      ],
    );
    expect(records[0].hashtags).toEqual(["#deepseek", "#chinaai", "#aiagents"]);
    expect(records[0].hashtagHistory).toBeUndefined();
  });

  it("records a hashtag set change in hashtagHistory and ignores reordering", () => {
    const { records } = upsertRecords(
      [baseRecord()],
      [
        // same set, different order — must not count as a change
        {
          videoId: "7691045312206474517",
          hashtags: ["#aiagents", "#deepseek", "#chinaai"],
          recordedAt: "2026-10-05T00:00:00Z",
          source: "s2",
        },
        // real change
        {
          videoId: "7691045312206474517",
          hashtags: ["#deepseek", "#chinaai", "#creatorsearchinsights"],
          recordedAt: "2026-10-06T00:00:00Z",
          source: "s3",
        },
      ],
    );
    expect(records[0].hashtags).toEqual(["#deepseek", "#chinaai", "#creatorsearchinsights"]);
    expect(records[0].hashtagHistory).toHaveLength(1);
    expect(records[0].hashtagHistory[0].hashtags).toEqual(["#deepseek", "#chinaai", "#aiagents"]);
  });

  it("unions searchQueries and dedupes sources", () => {
    const { records } = upsertRecords(
      [baseRecord({ searchQueries: ["qwen"] })],
      [
        {
          videoId: "7691045312206474517",
          searchQueries: ["qwen", "deepseek desktop"],
          recordedAt: "2026-10-01T00:00:00Z",
          source: "studio-analytics-detail",
        },
      ],
    );
    expect(records[0].searchQueries).toEqual(["qwen", "deepseek desktop"]);
    expect(records[0].sources).toEqual(["2026-10-01T00:00:00Z studio-analytics-detail"]);
  });

  it("prefers the most informative identity values across truncations", () => {
    const { records } = upsertRecords(
      [baseRecord({ videoTitle: "Alibaba" })],
      [
        {
          videoId: "7691045312206474517",
          videoTitle: "OPEN SOURCE: China's 1.3 billion world model runs real-time | China AI",
          recordedAt: "2026-10-05T00:00:00Z",
          source: "s2",
        },
      ],
    );
    expect(records[0].videoTitle).toBe(
      "OPEN SOURCE: China's 1.3 billion world model runs real-time | China AI",
    );
  });

  it("preserves legacy records that have no videoId", () => {
    const legacy = {
      videoTitle: "A secret",
      views: 262,
      recordedAt: "2026-09-19T00:00:00Z",
      source: "studio-analytics-content",
    };
    const { records, legacy: legacyCount } = upsertRecords(
      [legacy],
      [{ videoId: "1", views: 10, recordedAt: "2026-10-01T00:00:00Z", source: "s" }],
    );
    expect(legacyCount).toBe(1);
    expect(records).toHaveLength(2);
    const kept = records.find((r) => r.videoTitle === "A secret");
    expect(kept.views).toBe(262);
  });

  it("sorts output by recordedAt descending", () => {
    const { records } = upsertRecords(
      [],
      [
        { videoId: "1", views: 1, recordedAt: "2026-09-01T00:00:00Z", source: "s" },
        { videoId: "2", views: 2, recordedAt: "2026-10-01T00:00:00Z", source: "s" },
      ],
    );
    expect(records.map((r) => r.videoId)).toEqual(["2", "1"]);
  });

  it("is idempotent — re-upserting the same observation changes nothing", () => {
    const observation = {
      videoId: "1",
      views: 10,
      recordedAt: "2026-10-01T00:00:00Z",
      source: "s",
    };
    const first = upsertRecords([], [observation]);
    const second = upsertRecords(first.records, [observation]);
    expect(second.added).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(1);
    expect(second.records).toEqual(first.records);
  });
});

// ─── mapDetailsToObservations ───

describe("mapDetailsToObservations", () => {
  it("maps the tiktok-video-details file shape onto tracker fields", () => {
    const details = {
      fetchedAt: "2026-10-11T09:22:25.374Z",
      videos: [
        {
          videoId: "7691045312206474517",
          title: "DeepSeek's desktop app",
          postedOn: "2026/9/30",
          videoViews: 651,
          avgWatchTimeSec: 10.72,
          watchedFullVideoPct: 4.1,
          trafficSource: { forYouPct: 86.1, searchPct: 13.2 },
        },
      ],
      failed: [],
    };
    const [obs] = mapDetailsToObservations(details);
    expect(obs).toMatchObject({
      videoId: "7691045312206474517",
      videoTitle: "DeepSeek's desktop app",
      publishedAt: "2026/9/30",
      views: 651,
      avgWatchTimeSec: 10.72,
      watchedFullVideoPct: 4.1,
      fypPercent: 86.1,
      searchPercent: 13.2,
      recordedAt: "2026-10-11T09:22:25.374Z",
      source: "studio-analytics-detail",
    });
  });

  it("returns [] for a details file with no videos", () => {
    expect(mapDetailsToObservations({ fetchedAt: "x", videos: [] })).toEqual([]);
  });
});

// ─── summarizeTagStats ───

describe("summarizeTagStats", () => {
  const rec = (videoId, views, hashtags) => ({ videoId, views, hashtags });

  it("averages only over records whose views are known", () => {
    // 100 and 300 are known; the null row must not count as 0, or the
    // average would read 133 instead of 200.
    const stats = summarizeTagStats([
      rec("1", 100, ["#ai"]),
      rec("2", null, ["#ai"]),
      rec("3", 300, ["#ai"]),
    ]);
    expect(stats.get("#ai")).toEqual({ n: 3, viewed: 2, views: 400 });
  });

  it("reports zero viewed when no record for a tag has views", () => {
    const stats = summarizeTagStats([rec("1", null, ["#ai"]), rec("2", null, ["#ai"])]);
    expect(stats.get("#ai")).toEqual({ n: 2, viewed: 0, views: 0 });
  });

  it("ignores legacy records without a videoId", () => {
    const stats = summarizeTagStats([
      { videoId: "", views: 9999, hashtags: ["#ai"] },
      { views: 9999, hashtags: ["#ai"] },
      rec("1", 100, ["#ai"]),
    ]);
    expect(stats.get("#ai")).toEqual({ n: 1, viewed: 1, views: 100 });
  });

  it("counts a video once per tag and handles a missing hashtags field", () => {
    const stats = summarizeTagStats([
      rec("1", 10, ["#ai", "#deepseek"]),
      { videoId: "2", views: 20 },
    ]);
    expect(stats.get("#ai")).toEqual({ n: 1, viewed: 1, views: 10 });
    expect(stats.get("#deepseek")).toEqual({ n: 1, viewed: 1, views: 10 });
    expect(stats.size).toBe(2);
  });
});

// ─── CLI ───

const CLI = fileURLToPath(new URL("../hashtag-effect-tracker.mjs", import.meta.url));

function runCli(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

function detailsFixture(dir) {
  const path = join(dir, "tiktok-video-details-2026-10-11.json");
  writeFileSync(
    path,
    JSON.stringify({
      fetchedAt: "2026-10-11T09:22:25.374Z",
      videos: [
        {
          videoId: "7691045312206474517",
          title: "DeepSeek's desktop app",
          postedOn: "2026/9/30",
          videoViews: 651,
          avgWatchTimeSec: 10.72,
          watchedFullVideoPct: 4.1,
          trafficSource: { forYouPct: 86.1, searchPct: 13.2 },
        },
      ],
    }),
    "utf8",
  );
  return path;
}

describe("hashtag-effect-tracker CLI", () => {
  it("creates the tracker's parent directory on a first write", () => {
    // `scripts/short-video/output/` is gitignored, so a fresh clone has no
    // directory there; the first documented upsert must not die on ENOENT.
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const tracker = join(dir, "output", "hashtag-effect-tracker.jsonl");
    const details = detailsFixture(dir);

    const out = runCli([
      "upsert",
      "--from-details",
      details,
      "--tags",
      "#ai,#deepseek",
      "--tracker",
      tracker,
    ]);

    expect(out).toContain("added 1");
    expect(existsSync(tracker)).toBe(true);
    const [rec] = parseJsonl(readFileSync(tracker, "utf8"));
    expect(rec.videoId).toBe("7691045312206474517");
    expect(rec.hashtags).toEqual(["#ai", "#deepseek"]);
    expect(rec.views).toBe(651);
  });

  it("re-running the same details file leaves the tracker byte-identical", () => {
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const tracker = join(dir, "output", "hashtag-effect-tracker.jsonl");
    const details = detailsFixture(dir);
    const args = ["upsert", "--from-details", details, "--tags", "#ai", "--tracker", tracker];

    runCli(args);
    const first = readFileSync(tracker, "utf8");
    const second = runCli(args);
    expect(second).toContain("unchanged 1");
    expect(readFileSync(tracker, "utf8")).toBe(first);
  });

  it("--dry-run merges but writes nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const tracker = join(dir, "output", "hashtag-effect-tracker.jsonl");
    const details = detailsFixture(dir);

    const out = runCli([
      "upsert",
      "--from-details",
      details,
      "--tags",
      "#ai",
      "--dry-run",
      "--tracker",
      tracker,
    ]);

    expect(out).toContain("dry-run");
    expect(existsSync(tracker)).toBe(false);
  });

  it("report says views n/a instead of averaging nulls as zero", () => {
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const tracker = join(dir, "tracker.jsonl");
    writeFileSync(
      tracker,
      serializeJsonl([
        { videoId: "1", views: null, hashtags: ["#ai"], recordedAt: "2026-10-11T00:00:00.000Z" },
        { videoId: "2", views: 300, hashtags: ["#ai"], recordedAt: "2026-10-11T00:00:00.000Z" },
      ]),
      "utf8",
    );

    const out = runCli(["report", "--tracker", tracker]);
    expect(out).toContain("avg 300 views (1 of 2 with views)");

    writeFileSync(
      tracker,
      serializeJsonl([{ videoId: "1", views: null, hashtags: ["#ai"] }]),
      "utf8",
    );
    expect(runCli(["report", "--tracker", tracker])).toContain("avg views n/a");
  });

  it("reports the default tracker path when the file does not exist yet", () => {
    // A fresh clone has no tracker at all; report is a read, so it must
    // degrade to an empty table rather than throw.
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const out = runCli(["report", "--tracker", join(dir, "missing.jsonl")]);
    expect(out).toContain("0 records");
  });
});

// ─── CLI tag-source guards (#1179) ───

function detailsWithIds(dir, ids, fetchedAt = "2026-10-11T09:22:25.374Z") {
  const path = join(dir, "tiktok-video-details.json");
  writeFileSync(
    path,
    JSON.stringify({
      fetchedAt,
      videos: ids.map((videoId) => ({
        videoId,
        title: `Video ${videoId}`,
        postedOn: "2026/9/30",
        videoViews: 100,
      })),
    }),
    "utf8",
  );
  return path;
}

function captionFixture(dir, hashtags) {
  const pkg = join(dir, "publish-package");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "tiktok-metadata.json"), JSON.stringify({ hashtags }), "utf8");
  return pkg;
}

function failingCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

describe("hashtag-effect-tracker CLI — tag-source guards (#1179)", () => {
  it("refuses to broadcast one caption's hashtags across several videos", () => {
    // --from-caption reads a single publish package, but --from-details can
    // carry a whole week of videos. Letting one caption's tags fan out would
    // silently rewrite every record and mix tag sets in the report.
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const tracker = join(dir, "output", "tracker.jsonl");
    const details = detailsWithIds(dir, ["1111111111111111111", "2222222222222222222"]);
    const pkg = captionFixture(dir, ["#chinaai"]);

    const res = failingCli([
      "upsert",
      "--from-details",
      details,
      "--from-caption",
      pkg,
      "--tracker",
      tracker,
    ]);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("2 videos");
    expect(res.stderr).toContain("--assume-same-tags");
    expect(existsSync(tracker)).toBe(false);
  });

  it("refuses to broadcast --tags across several videos too", () => {
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const tracker = join(dir, "output", "tracker.jsonl");
    const details = detailsWithIds(dir, ["1111111111111111111", "2222222222222222222"]);

    const res = failingCli([
      "upsert",
      "--from-details",
      details,
      "--tags",
      "#chinaai",
      "--tracker",
      tracker,
    ]);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("--assume-same-tags");
    expect(existsSync(tracker)).toBe(false);
  });

  it("--assume-same-tags broadcasts deliberately and names every videoId", () => {
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const tracker = join(dir, "output", "tracker.jsonl");
    const ids = ["1111111111111111111", "2222222222222222222"];
    const details = detailsWithIds(dir, ids);
    const pkg = captionFixture(dir, ["#chinaai"]);

    const out = runCli([
      "upsert",
      "--from-details",
      details,
      "--from-caption",
      pkg,
      "--assume-same-tags",
      "--tracker",
      tracker,
    ]);

    expect(out).toContain("--assume-same-tags");
    for (const id of ids) expect(out).toContain(id);
    const records = parseJsonl(readFileSync(tracker, "utf8"));
    expect(records.map((r) => r.hashtags)).toEqual([["#chinaai"], ["#chinaai"]]);
  });

  it("refuses to rewrite an existing tag set without --overwrite-tags", () => {
    // A single video is not automatically safe: pointing --from-caption at
    // the wrong package rewrites that record's attribution just as silently.
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const tracker = join(dir, "output", "tracker.jsonl");
    mkdirSync(join(dir, "output"), { recursive: true });
    const videoId = "1111111111111111111";
    const seeded = serializeJsonl([
      { videoId, views: 100, hashtags: ["#old"], recordedAt: "2026-10-01T00:00:00.000Z" },
    ]);
    writeFileSync(tracker, seeded, "utf8");
    const details = detailsWithIds(dir, [videoId]);

    const res = failingCli([
      "upsert",
      "--from-details",
      details,
      "--tags",
      "#new",
      "--tracker",
      tracker,
    ]);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain(videoId);
    expect(res.stderr).toContain("#old");
    expect(res.stderr).toContain("#new");
    expect(res.stderr).toContain("--overwrite-tags");
    expect(readFileSync(tracker, "utf8")).toBe(seeded);
  });

  it("--overwrite-tags allows the rewrite and keeps the old set as history", () => {
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const tracker = join(dir, "output", "tracker.jsonl");
    mkdirSync(join(dir, "output"), { recursive: true });
    const videoId = "1111111111111111111";
    writeFileSync(
      tracker,
      serializeJsonl([
        { videoId, views: 100, hashtags: ["#old"], recordedAt: "2026-10-01T00:00:00.000Z" },
      ]),
      "utf8",
    );
    const details = detailsWithIds(dir, [videoId]);

    runCli([
      "upsert",
      "--from-details",
      details,
      "--tags",
      "#new",
      "--overwrite-tags",
      "--tracker",
      tracker,
    ]);

    const [rec] = parseJsonl(readFileSync(tracker, "utf8"));
    expect(rec.hashtags).toEqual(["#new"]);
    expect(rec.hashtagHistory[0].hashtags).toEqual(["#old"]);
  });

  it("treats a reordered tag set as the same set (no --overwrite-tags needed)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tracker-cli-"));
    const tracker = join(dir, "output", "tracker.jsonl");
    mkdirSync(join(dir, "output"), { recursive: true });
    const videoId = "1111111111111111111";
    writeFileSync(
      tracker,
      serializeJsonl([
        {
          videoId,
          views: 100,
          hashtags: ["#a", "#b"],
          recordedAt: "2026-10-01T00:00:00.000Z",
        },
      ]),
      "utf8",
    );
    const details = detailsWithIds(dir, [videoId]);

    const out = runCli([
      "upsert",
      "--from-details",
      details,
      "--tags",
      "#b,#a",
      "--tracker",
      tracker,
    ]);

    expect(out).toContain("added 0");
    const [rec] = parseJsonl(readFileSync(tracker, "utf8"));
    expect(rec.hashtags).toEqual(["#a", "#b"]);
    expect(rec.hashtagHistory).toBeUndefined();
  });
});
