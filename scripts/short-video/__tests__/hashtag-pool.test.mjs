import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_POOL_PATH,
  ageDays,
  freshnessLevel,
  ingestPool,
  loadPool,
  lookupTag,
  normalizeSourceMethod,
  normalizeTag,
  validatePool,
} from "../lib/hashtag-pool.mjs";
import { runCli } from "../tag-pool.mjs";

function basePool(overrides = {}) {
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
    tags: [],
    blacklist: ["#fyp"],
    evergreen: [],
    ...overrides,
  };
}

function tagEntry(tag, extra = {}) {
  return {
    tag,
    kind: "traffic",
    views: 1000,
    posts: 100,
    avgViewsPerPost: 10,
    viewsText: "1K",
    postsText: "100",
    status: "ok",
    grade: "B",
    sampledAt: "2026-11-21",
    source: null,
    url: null,
    notes: null,
    ...extra,
  };
}

describe("normalizeTag", () => {
  it("strips #, lowercases and canonicalizes", () => {
    expect(normalizeTag("#AINEWS")).toBe("#ainews");
    expect(normalizeTag("ai")).toBe("#ai");
    expect(normalizeTag("  #Qwen  ")).toBe("#qwen");
  });

  it("rejects invalid input", () => {
    expect(normalizeTag(null)).toBeNull();
    expect(normalizeTag(123)).toBeNull();
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("#ai news")).toBeNull();
    expect(normalizeTag(["#ai"])).toBeNull();
  });
});

describe("seed pool", () => {
  it("the committed SSOT validates with no schema errors", () => {
    const pool = loadPool(DEFAULT_POOL_PATH);
    const result = validatePool(pool);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("validatePool schema", () => {
  it("rejects an unknown kind", () => {
    const pool = basePool({ tags: [tagEntry("#x", { kind: "viral" })] });
    const result = validatePool(pool);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "tags[0].kind")).toBe(true);
  });

  it("rejects an unknown status and grade", () => {
    const statusBad = validatePool(basePool({ tags: [tagEntry("#x", { status: "huge" })] }));
    expect(statusBad.errors.some((e) => e.field === "tags[0].status")).toBe(true);
    const gradeBad = validatePool(basePool({ tags: [tagEntry("#x", { grade: "S" })] }));
    expect(gradeBad.errors.some((e) => e.field === "tags[0].grade")).toBe(true);
  });

  it("rejects duplicate tags", () => {
    const pool = basePool({ tags: [tagEntry("#dup"), tagEntry("#DUP")] });
    const result = validatePool(pool);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("duplicate"))).toBe(true);
  });

  it("rejects negative views and non-integer posts", () => {
    const neg = validatePool(basePool({ tags: [tagEntry("#x", { views: -5 })] }));
    expect(neg.errors.some((e) => e.field === "tags[0].views")).toBe(true);
    const frac = validatePool(
      basePool({ tags: [tagEntry("#x", { posts: 1.5, avgViewsPerPost: null })] }),
    );
    expect(frac.errors.some((e) => e.field === "tags[0].posts")).toBe(true);
  });

  it("rejects a missing updatedAt", () => {
    const pool = basePool();
    delete pool.updatedAt;
    const result = validatePool(pool);
    expect(result.errors.some((e) => e.field === "updatedAt")).toBe(true);
  });

  it("rejects an avgViewsPerPost that does not match views/posts", () => {
    const pool = basePool({ tags: [tagEntry("#x", { avgViewsPerPost: 99999 })] });
    const result = validatePool(pool);
    expect(result.errors.some((e) => e.field === "tags[0].avgViewsPerPost")).toBe(true);
  });
});

describe("lookupTag", () => {
  it("finds by canonical form and returns null otherwise", () => {
    const pool = basePool({ tags: [tagEntry("#ainews")] });
    expect(lookupTag(pool, "#AINEWS")?.tag).toBe("#ainews");
    expect(lookupTag(pool, "#missing")).toBeNull();
  });
});

describe("freshness", () => {
  it("bands against warn/fail thresholds", () => {
    expect(freshnessLevel(5, 7, 30)).toBe("ok");
    expect(freshnessLevel(10, 7, 30)).toBe("warn");
    expect(freshnessLevel(31, 7, 30)).toBe("fail");
    expect(freshnessLevel(null, 7, 30)).toBe("unknown");
  });

  it("ageDays parses date-only and ISO strings", () => {
    const now = Date.parse("2026-11-21T12:00:00.000Z");
    expect(ageDays("2026-11-14", now)).toBe(7);
    expect(ageDays("2026-11-14T00:00:00.000Z", now)).toBe(7);
    expect(ageDays(null, now)).toBeNull();
  });
});

describe("ingestPool", () => {
  it("never overwrites a non-null value with null", () => {
    const pool = basePool({ tags: [tagEntry("#ainews")] });
    const incoming = [{ tag: "#ainews", views: null, posts: null, avgViewsPerPost: null }];
    const { pool: merged, changes } = ingestPool(pool, incoming, { today: "2026-11-21" });
    const entry = merged.tags.find((t) => t.tag === "#ainews");
    expect(entry.views).toBe(1000);
    expect(entry.posts).toBe(100);
    expect(entry.avgViewsPerPost).toBe(10);
    expect(changes.filter((c) => c.field === "views")).toEqual([]);
  });

  it("never invents numbers for a new tag", () => {
    const pool = basePool();
    const incoming = [{ tag: "#newtag", notes: "seen in research" }];
    const { pool: merged, addedTags } = ingestPool(pool, incoming, { today: "2026-11-21" });
    expect(addedTags).toEqual(["#newtag"]);
    const entry = merged.tags[0];
    expect(entry.views).toBeNull();
    expect(entry.posts).toBeNull();
    expect(entry.avgViewsPerPost).toBeNull();
    expect(entry.grade).toBe("C");
    expect(entry.status).toBe("unverified");
  });

  it("derives avgViewsPerPost only from real views/posts", () => {
    const pool = basePool();
    const incoming = [
      { tag: "#calc", views: 2000, posts: 100 },
      { tag: "#partial", views: 5000 },
    ];
    const { pool: merged } = ingestPool(pool, incoming, { today: "2026-11-21" });
    const calc = merged.tags.find((t) => t.tag === "#calc");
    const partial = merged.tags.find((t) => t.tag === "#partial");
    expect(calc.avgViewsPerPost).toBe(20);
    expect(partial.avgViewsPerPost).toBeNull();
  });

  it("updates pool.updatedAt and keeps existing text fields", () => {
    const pool = basePool({ tags: [tagEntry("#ainews", { notes: "keep me" })] });
    const incoming = [{ tag: "#ainews", views: 2000, posts: 200 }];
    const { pool: merged } = ingestPool(pool, incoming, { today: "2026-11-21" });
    expect(merged.updatedAt).toBe("2026-11-21");
    expect(merged.tags[0].notes).toBe("keep me");
    expect(merged.tags[0].avgViewsPerPost).toBe(10);
  });
});

describe("ingest enum sanitization", () => {
  it("maps kind 'blacklist' to status blacklisted + blacklist membership, and normalizes source.method", () => {
    const pool = basePool();
    const incoming = {
      tags: [
        {
          tag: "#fyp",
          kind: "blacklist",
          status: "blacklisted",
          views: 132303448975523,
          posts: 9545504279,
          grade: "A",
          source: "src-x",
        },
      ],
      sources: [
        { id: "src-x", label: "X", method: "cdp-browser (pre-login)", accessedAt: "2026-11-21" },
      ],
    };
    const { pool: merged } = ingestPool(pool, incoming, { today: "2026-11-21" });

    expect(validatePool(merged).valid).toBe(true);
    const entry = merged.tags.find((t) => t.tag === "#fyp");
    expect(entry.kind).toBe("niche");
    expect(entry.status).toBe("blacklisted");
    expect(merged.blacklist).toContain("#fyp");
    expect(merged.sources.find((s) => s.id === "src-x").method).toBe("browser");
  });

  it("keeps existing kind/status/grade on update when incoming enums are unknown", () => {
    const pool = basePool({ tags: [tagEntry("#ainews")] });
    const incoming = [
      { tag: "#ainews", kind: "weirdkind", status: "weirdstatus", grade: "weirdgrade" },
    ];
    const { pool: merged } = ingestPool(pool, incoming, { today: "2026-11-21" });
    const entry = merged.tags[0];
    expect(entry.kind).toBe("traffic");
    expect(entry.status).toBe("ok");
    expect(entry.grade).toBe("B");
  });

  it("new tag defaults to niche/unverified and derives grade from available metrics", () => {
    const withMetrics = ingestPool(
      basePool(),
      [{ tag: "#calc", views: 2000, posts: 100, kind: "nope", status: "nope", grade: "nope" }],
      { today: "2026-11-21" },
    ).pool;
    expect(withMetrics.tags[0].kind).toBe("niche");
    expect(withMetrics.tags[0].status).toBe("unverified");
    expect(withMetrics.tags[0].grade).toBe("A");

    const noMetrics = ingestPool(basePool(), [{ tag: "#ghost" }], { today: "2026-11-21" }).pool;
    expect(noMetrics.tags[0].grade).toBe("C");
  });

  it("normalizes source.method onto the frozen enum and keeps unrecognized originals on note", () => {
    const cases = [
      ["cdp-browser", "browser"],
      ["cdp-browser (pre-login)", "browser"],
      ["browser extension", "browser"],
      ["manual review", "manual"],
      ["curl https://example.com", "curl"],
      ["http fetch", "curl"],
      ["telnet debug", "manual"],
    ];
    for (const [input, expected] of cases) {
      expect(normalizeSourceMethod(input).method).toBe(expected);
    }
    expect(normalizeSourceMethod("telnet debug").note).toBe("telnet debug");
  });

  it("maps the research `note` alias onto `notes`", () => {
    const pool = basePool();
    const { pool: merged } = ingestPool(pool, [{ tag: "#alias", note: "research note text" }], {
      today: "2026-11-21",
    });
    expect(merged.tags[0].notes).toBe("research note text");
  });

  it("blacklist membership is idempotent (no duplicate entries)", () => {
    const pool = basePool({ blacklist: ["#fyp"] });
    const { pool: merged } = ingestPool(
      pool,
      [{ tag: "#fyp", kind: "blacklist", status: "blacklisted" }],
      { today: "2026-11-21" },
    );
    expect(merged.blacklist.filter((t) => t === "#fyp")).toHaveLength(1);
  });
});

// ─── CLI ───

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "hashtag-pool-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writePool(name, pool) {
  const path = join(tmpDir, name);
  writeFileSync(path, JSON.stringify(pool), "utf8");
  return path;
}

describe("tag-pool CLI", () => {
  it("validate exits 2 when the pool file is missing", async () => {
    const code = await runCli(["validate", "--pool", join(tmpDir, "nope.json")]);
    expect(code).toBe(2);
  });

  it("validate exits 1 on an invalid pool", async () => {
    const path = writePool("bad.json", basePool({ tags: [tagEntry("#x", { kind: "nope" })] }));
    const code = await runCli(["validate", "--pool", path]);
    expect(code).toBe(1);
  });

  it("show exits 1 when the tag is absent", async () => {
    const path = writePool("pool.json", basePool({ tags: [tagEntry("#ainews")] }));
    const code = await runCli(["show", "--tag", "#ghost", "--pool", path]);
    expect(code).toBe(1);
  });

  it("ingest --dry-run does not write the pool file", async () => {
    const path = writePool("pool.json", basePool({ tags: [tagEntry("#ainews")] }));
    const research = join(tmpDir, "research.json");
    writeFileSync(research, JSON.stringify([{ tag: "#ainews", views: 999 }]), "utf8");

    const code = await runCli(["ingest", "--from", research, "--dry-run", "--pool", path]);
    expect(code).toBe(0);

    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    expect(onDisk.tags[0].views).toBe(1000);
  });

  it("ingest merges metrics and writes the pool without --dry-run", async () => {
    const path = writePool("pool.json", basePool({ tags: [tagEntry("#ainews")] }));
    const research = join(tmpDir, "research.json");
    writeFileSync(research, JSON.stringify([{ tag: "#ainews", views: 2000, posts: 100 }]), "utf8");

    const code = await runCli(["ingest", "--from", research, "--pool", path]);
    expect(code).toBe(0);

    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    expect(onDisk.tags[0].views).toBe(2000);
    expect(onDisk.tags[0].avgViewsPerPost).toBe(20);
  });

  it("ingest exits 2 when the research file is missing", async () => {
    const path = writePool("pool.json", basePool());
    const code = await runCli([
      "ingest",
      "--from",
      join(tmpDir, "no-research.json"),
      "--pool",
      path,
    ]);
    expect(code).toBe(2);
  });

  it("validate --json reports the machine-readable shape", async () => {
    const path = writePool("pool.json", basePool({ tags: [tagEntry("#ainews")] }));
    const code = await runCli(["validate", "--pool", path, "--json"]);
    expect(code).toBe(0);
    expect(existsSync(path)).toBe(true);
  });
});
