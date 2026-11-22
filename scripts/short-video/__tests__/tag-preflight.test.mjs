import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReport, evaluatePreflight, runCli } from "../tag-preflight.mjs";

const NOW = Date.parse("2026-11-21T12:00:00.000Z");

function makePool(tags = [], overrides = {}) {
  return {
    version: 1,
    updatedAt: "2026-11-21",
    platform: "tiktok",
    region: "US",
    thresholds: {
      poolWarnDays: 45,
      poolFailDays: 90,
      snapshotWarnDays: 7,
      snapshotFailDays: 30,
      tagWarnDays: 60,
      tagFailDays: 120,
    },
    sources: [],
    tags,
    blacklist: ["#fyp", "#foryou"],
    evergreen: [],
    ...overrides,
  };
}

function makeTag(tag, extra = {}) {
  return {
    tag,
    kind: "traffic",
    views: 1000000,
    posts: 10000,
    avgViewsPerPost: 100,
    viewsText: "1M",
    postsText: "10K",
    status: "ok",
    grade: "B",
    sampledAt: "2026-11-21",
    source: null,
    url: null,
    notes: null,
    ...extra,
  };
}

function makeContent(hashtags, metaExtra = {}) {
  return {
    scenes: [{ voiceover: "China AI news today.", texts: {} }],
    metadata: { title: "China AI news" },
    meta: {
      hashtags,
      keyEntities: { companies: [], models: [] },
      topics: ["ai"],
      ...metaExtra,
    },
  };
}

const freshSnapshot = {
  path: "snap.json",
  snapshot: { snapshotDate: "2026-11-21", trendingTags: [], matchedTrendingTags: [] },
};

function runReport({
  pool,
  baseline,
  strict = false,
  snapshot = null,
  content,
  limits = { min: 3, max: 5 },
  now = NOW,
}) {
  return buildReport({
    slug: "test",
    platform: "tiktok",
    strict,
    pool,
    snapshot,
    baseline,
    limits,
    content: content ?? makeContent(baseline),
    now,
  });
}

const freshTags = () => [
  makeTag("#ainews"),
  makeTag("#chinaai", { kind: "brand" }),
  makeTag("#tencent", { kind: "entity" }),
];

describe("preflight clean pass", () => {
  it("PASSes a fresh, fully-pooled baseline with exit 0", () => {
    const report = runReport({
      pool: makePool(freshTags()),
      baseline: ["#ainews", "#chinaai", "#tencent"],
      snapshot: freshSnapshot,
    });
    expect(report.exitCode).toBe(0);
    expect(report.verdict).toBe("PASS");
    expect(report.findings).toEqual([]);
  });
});

describe("blocking checks (fail even without --strict)", () => {
  it("flags a blacklisted tag in default and strict mode", () => {
    const pool = makePool([makeTag("#ainews"), makeTag("#chinaai", { kind: "brand" })]);
    const baseline = ["#ainews", "#chinaai", "#fyp"];

    const def = runReport({ pool, baseline });
    expect(def.exitCode).toBe(1);
    expect(def.findings.some((f) => f.id === "blacklisted" && f.level === "fail")).toBe(true);

    const strict = runReport({ pool, baseline, strict: true });
    expect(strict.exitCode).toBe(1);
    expect(strict.findings.some((f) => f.id === "blacklisted" && f.level === "fail")).toBe(true);
  });

  it("fails when the tag count is below min or above max", () => {
    const pool = makePool(freshTags());

    const low = runReport({ pool, baseline: ["#ainews"] });
    expect(low.exitCode).toBe(1);
    expect(low.findings.some((f) => f.id === "count-out-of-range" && f.level === "fail")).toBe(
      true,
    );

    const high = runReport({
      pool,
      baseline: ["#ainews", "#chinaai", "#tencent", "#qwen", "#kimi", "#deepseek"],
    });
    expect(high.exitCode).toBe(1);
    expect(high.findings.some((f) => f.id === "count-out-of-range" && f.level === "fail")).toBe(
      true,
    );
  });
});

describe("strict vs default severity", () => {
  it("traffic/niche grade C warns by default but fails strict", () => {
    const cTraffic = makeTag("#ai", {
      kind: "traffic",
      grade: "C",
      views: null,
      posts: null,
      avgViewsPerPost: null,
      viewsText: null,
      postsText: null,
    });
    const pool = makePool([cTraffic, makeTag("#ainews"), makeTag("#chinaai", { kind: "brand" })]);
    const baseline = ["#ai", "#ainews", "#chinaai"];

    const def = runReport({ pool, baseline, snapshot: freshSnapshot });
    expect(def.exitCode).toBe(0);
    expect(def.findings.some((f) => f.id === "grade-c-traffic" && f.level === "warn")).toBe(true);

    const strict = runReport({ pool, baseline, strict: true, snapshot: freshSnapshot });
    expect(strict.exitCode).toBe(1);
    expect(strict.findings.some((f) => f.id === "grade-c-traffic" && f.level === "fail")).toBe(
      true,
    );
  });

  it("entity/brand grade C stays a warning even in strict mode", () => {
    const cEntity = makeTag("#tencent", {
      kind: "entity",
      grade: "C",
      views: null,
      posts: null,
      avgViewsPerPost: null,
      viewsText: null,
      postsText: null,
    });
    const pool = makePool([makeTag("#ainews"), makeTag("#chinaai", { kind: "brand" }), cEntity]);
    const strict = runReport({
      pool,
      baseline: ["#ainews", "#chinaai", "#tencent"],
      strict: true,
      snapshot: freshSnapshot,
    });
    expect(strict.exitCode).toBe(0);
    expect(strict.findings.some((f) => f.id === "grade-c-entity" && f.level === "warn")).toBe(true);
  });

  it("pool past poolFailDays warns by default and fails strict", () => {
    const pool = makePool(freshTags(), { updatedAt: "2026-08-01" });
    const baseline = ["#ainews", "#chinaai", "#tencent"];

    const def = runReport({ pool, baseline, snapshot: freshSnapshot });
    expect(def.exitCode).toBe(0);
    expect(def.findings.some((f) => f.id === "pool-age-fail" && f.level === "warn")).toBe(true);

    const strict = runReport({ pool, baseline, strict: true, snapshot: freshSnapshot });
    expect(strict.exitCode).toBe(1);
    expect(strict.findings.some((f) => f.id === "pool-age-fail" && f.level === "fail")).toBe(true);
  });

  it("missing snapshot warns in both modes and continues pool-only", () => {
    const pool = makePool(freshTags());
    const def = runReport({ pool, baseline: ["#ainews", "#chinaai", "#tencent"], snapshot: null });
    expect(def.exitCode).toBe(0);
    expect(def.findings.some((f) => f.id === "snapshot-missing" && f.level === "warn")).toBe(true);

    const strict = runReport({
      pool,
      baseline: ["#ainews", "#chinaai", "#tencent"],
      strict: true,
      snapshot: null,
    });
    expect(strict.exitCode).toBe(0);
  });

  it("snapshot past snapshotFailDays warns by default and fails strict", () => {
    const oldSnapshot = {
      path: "snap.json",
      snapshot: { snapshotDate: "2026-10-01", trendingTags: [], matchedTrendingTags: [] },
    };
    const pool = makePool(freshTags());
    const baseline = ["#ainews", "#chinaai", "#tencent"];

    const def = runReport({ pool, baseline, snapshot: oldSnapshot });
    expect(def.exitCode).toBe(0);
    expect(def.findings.some((f) => f.id === "snapshot-age-fail" && f.level === "warn")).toBe(true);

    const strict = runReport({ pool, baseline, strict: true, snapshot: oldSnapshot });
    expect(strict.exitCode).toBe(1);
    expect(strict.findings.some((f) => f.id === "snapshot-age-fail" && f.level === "fail")).toBe(
      true,
    );
  });

  it("tag absent from pool warns by default and fails strict, naming the fix", () => {
    const pool = makePool([makeTag("#ainews"), makeTag("#chinaai", { kind: "brand" })]);
    const baseline = ["#ainews", "#chinaai", "#hy4"];

    const def = runReport({ pool, baseline, snapshot: freshSnapshot });
    expect(def.exitCode).toBe(0);
    const absent = def.findings.find((f) => f.id === "tag-absent");
    expect(absent.level).toBe("warn");
    expect(absent.message).toContain("research-hashtags.mjs");

    const strict = runReport({ pool, baseline, strict: true, snapshot: freshSnapshot });
    expect(strict.exitCode).toBe(1);
    expect(strict.findings.some((f) => f.id === "tag-absent" && f.level === "fail")).toBe(true);
  });

  it("flags a matched trending tag missing from the baseline as a warning", () => {
    const snapshot = {
      path: "snap.json",
      snapshot: {
        snapshotDate: "2026-11-21",
        trendingTags: [{ name: "#aidaily", views: "10M", posts: "1K" }],
        matchedTrendingTags: [],
      },
    };
    const pool = makePool(freshTags());
    const report = runReport({ pool, baseline: ["#ainews", "#chinaai", "#tencent"], snapshot });
    expect(report.findings.some((f) => f.id === "trending-unmatched" && f.level === "warn")).toBe(
      true,
    );
    expect(report.exitCode).toBe(0);
  });
});

describe("evaluatePreflight integration", () => {
  it("derives the manual-override baseline and accepts a fully-pooled set", () => {
    const tags = ["#chinaai", "#tencent", "#hy4", "#openweights", "#ainews"].map((tag) =>
      makeTag(tag, tag === "#chinaai" ? { kind: "brand" } : {}),
    );
    const pool = makePool(tags);
    const content = makeContent(["#chinaai", "#tencent", "#hy4", "#openweights", "#ainews"]);

    const report = evaluatePreflight({
      slug: "test-pack",
      platform: "tiktok",
      strict: false,
      pool,
      snapshot: freshSnapshot,
      content,
      now: NOW,
    });

    expect(report.baseline).toEqual(["#chinaai", "#tencent", "#hy4", "#openweights", "#ainews"]);
    expect(report.limits).toEqual({ min: 3, max: 5 });
    expect(report.exitCode).toBe(0);
  });
});

describe("tag-preflight CLI hard errors (exit 2)", () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "tag-preflight-test-"));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits 2 when the pool file is missing", async () => {
    const code = await runCli(["--content", "tencent-hy4"], {
      poolPath: join(tmpDir, "no-pool.json"),
    });
    expect(code).toBe(2);
  });

  it("exits 2 when the content slug is missing", async () => {
    const code = await runCli(["--content", "no-such-slug-xyz"]);
    expect(code).toBe(2);
  });

  it("exits 2 on an unknown platform", async () => {
    const code = await runCli(["--content", "tencent-hy4", "--platform", "vine"]);
    expect(code).toBe(2);
  });
});
