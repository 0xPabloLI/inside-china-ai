import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  GAP_REASON,
  GAP_STATUS,
  GENERATION_ONLY_STRATEGIES,
  deriveGaps,
  formatGapLine,
  gapId,
  hasStockIntent,
  mergeGaps,
  normalizeNeed,
  parseLedger,
  queryGaps,
  satisfyGaps,
  serializeLedger,
} from "../lib/asset-gap-ledger.mjs";
import { runCli } from "../asset-gaps.mjs";
import { GENERATING_STRATEGIES } from "../lib/scene-rules.mjs";

let tmp = null;

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

const scene = (id, overrides = {}) => ({
  id,
  visualType: "narrative",
  mediaStrategy: "asset",
  assetNeed: `need ${id}`,
  ...overrides,
});

describe("hasStockIntent — what belongs in the ledger", () => {
  it("counts a scene that asked for stock and has no media", () => {
    expect(hasStockIntent(scene(1))).toBe(true);
  });

  it("skips scenes that already have media, generated media, or no need", () => {
    expect(hasStockIntent(scene(1, { media: { path: "assets/x.jpg" } }))).toBe(false);
    expect(hasStockIntent(scene(1, { mediaStrategy: "b-roll" }))).toBe(false);
    expect(hasStockIntent(scene(1, { mediaStrategy: "ai-image" }))).toBe(false);
    expect(hasStockIntent(scene(1, { visualType: "cta" }))).toBe(false);
    expect(hasStockIntent(scene(1, { visualType: "stat-reveal" }))).toBe(false);
    expect(hasStockIntent(scene(1, { assetNeed: "   " }))).toBe(false);
    expect(hasStockIntent(scene(1, { assetNeed: undefined }))).toBe(false);
  });

  it("treats an absent mediaStrategy as stock-first (the pipeline default)", () => {
    expect(hasStockIntent(scene(1, { mediaStrategy: undefined }))).toBe(true);
  });

  it("keeps a generation-only scene only when stock was already judged", () => {
    expect(hasStockIntent(scene(1, { mediaStrategy: "b-roll" }))).toBe(false);
    expect(hasStockIntent(scene(1, { mediaStrategy: "b-roll" }), { stockAttempted: true })).toBe(
      true,
    );
  });

  it("stays inside the scene-rules generating vocabulary (no silent drift)", () => {
    // The ledger's set is "generating strategies that never buy stock".
    // scene-rules.mjs owns the vocabulary; a new strategy must be classified
    // here on purpose, not inherited by accident.
    const expected = [...GENERATING_STRATEGIES]
      .filter((strategy) => !strategy.startsWith("asset-then-"))
      .sort();
    expect([...GENERATION_ONLY_STRATEGIES].sort()).toEqual(expected);
  });
});

describe("need identity", () => {
  it("normalizes case, whitespace and trailing punctuation", () => {
    expect(normalizeNeed("  Humanoid   ROBOT arm, ")).toBe("humanoid robot arm");
  });

  it("keeps one id per wording, stable across runs", () => {
    expect(gapId("Humanoid robot arm")).toBe(gapId("humanoid   robot arm"));
    expect(gapId("humanoid robot arm")).not.toBe(gapId("humanoid robot hand"));
    expect(gapId("")).toBe("");
  });
});

describe("deriveGaps — classification", () => {
  it("records a scene with no sourcing evidence as no-candidates", () => {
    const gaps = deriveGaps({ contentSlug: "pkg", scenes: [scene(1)] });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      contentSlug: "pkg",
      sceneId: 1,
      mediaStrategy: "asset",
      reason: GAP_REASON.NO_CANDIDATES,
    });
  });

  it("does not record a scene whose claim got assigned", () => {
    const gaps = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1)],
      patches: [{ status: "assigned", sceneId: 1, media: { path: "assets/a.jpg" } }],
    });
    expect(gaps).toEqual([]);
  });

  it("keeps a relevance rejection separate from a VLM tool failure", () => {
    const rejected = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1)],
      patches: [
        {
          status: "unassigned",
          claimSceneId: 1,
          relevanceBand: "low",
          relevanceScore: 20,
          reason: "VLM relevance 20 below threshold 60 (low)",
        },
      ],
    });
    expect(rejected[0].reason).toBe(GAP_REASON.RELEVANCE_REJECTED);

    const unavailable = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1)],
      patches: [
        {
          status: "unassigned",
          claimSceneId: 1,
          relevanceBand: "unavailable",
          reason: "VLM relevance unavailable",
        },
      ],
    });
    expect(unavailable[0].reason).toBe(GAP_REASON.VLM_UNAVAILABLE);
  });

  it("does not read another scene's rejection", () => {
    const gaps = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1), scene(2)],
      patches: [
        { status: "assigned", sceneId: 1, media: { path: "assets/a.jpg" } },
        { status: "unassigned", claimSceneId: 2, relevanceBand: "low" },
      ],
    });
    expect(gaps.map((gap) => gap.sceneId)).toEqual([2]);
    expect(gaps[0].reason).toBe(GAP_REASON.RELEVANCE_REJECTED);
  });

  it("lets the 8b relevance report override a silent patch", () => {
    const failed = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1)],
      report: { results: [{ sceneId: 1, status: "FAIL" }] },
    });
    expect(failed[0].reason).toBe(GAP_REASON.RELEVANCE_REJECTED);

    const missing = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1)],
      report: { results: [{ sceneId: 1, status: "UNAVAILABLE" }] },
    });
    expect(missing[0].reason).toBe(GAP_REASON.VLM_UNAVAILABLE);
  });

  it("uses the in-process candidate pool when the caller has it", () => {
    const none = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1)],
      assets: [],
    });
    expect(none[0].reason).toBe(GAP_REASON.NO_CANDIDATES);

    const noScore = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1)],
      assets: [{ claimSceneId: 1, path: "assets/a.jpg", relevanceScore: null }],
    });
    expect(noScore[0].reason).toBe(GAP_REASON.VLM_UNAVAILABLE);

    const scored = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1)],
      assets: [{ claimSceneId: 1, path: "assets/a.jpg", relevanceScore: 25 }],
    });
    expect(scored[0].reason).toBe(GAP_REASON.RELEVANCE_REJECTED);
  });

  it("does not claim 'no candidates' from a legacy patch that cannot attribute rejections", () => {
    const gaps = deriveGaps({
      contentSlug: "legacy-pkg",
      scenes: [scene(1)],
      patches: [{ status: "unassigned", reason: "VLM relevance 20 below threshold 60 (low)" }],
    });
    expect(gaps[0].reason).toBe(GAP_REASON.UNCLASSIFIED);
  });

  it("marks rejections without relevance evidence as unclassified, not as a content verdict", () => {
    const gaps = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1)],
      patches: [{ status: "unassigned", claimSceneId: 1, reason: "cross-content reuse cap" }],
    });
    expect(gaps[0].reason).toBe(GAP_REASON.UNCLASSIFIED);
  });

  it("records a fall-through to generation from the b-roll report", () => {
    const gaps = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1, { mediaStrategy: "asset-then-broll" })],
      brollReport: { scenes: { 1: { strategy: "asset-then-broll", status: "won" } } },
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].reason).toBe(GAP_REASON.FELL_THROUGH_TO_GENERATION);
  });

  it("keeps a gap whose strategy was switched to generation after an 8b judgement", () => {
    // The documented escape hatch changes mediaStrategy to "b-roll". The
    // report is the evidence that stock was tried, so the library miss
    // survives the switch.
    const gaps = deriveGaps({
      contentSlug: "pkg",
      scenes: [scene(1, { mediaStrategy: "b-roll" })],
      report: { results: [{ sceneId: 1, status: "FAIL" }] },
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].reason).toBe(GAP_REASON.RELEVANCE_REJECTED);
  });

  it("skips text-only and generation-only scenes entirely", () => {
    const gaps = deriveGaps({
      contentSlug: "pkg",
      scenes: [
        scene(1, { visualType: "cta" }),
        scene(2, { mediaStrategy: "b-roll" }),
        scene(3, { media: { path: "assets/x.jpg" } }),
      ],
    });
    expect(gaps).toEqual([]);
  });
});

describe("mergeGaps — the ledger grows, it does not restart", () => {
  it("creates an open entry on first sight", () => {
    const ledger = mergeGaps(null, [
      {
        id: "gap-aaaa1111",
        need: "humanoid robot",
        contentSlug: "a",
        sceneId: 2,
        reason: "no-candidates",
      },
    ]);
    expect(ledger.gaps).toHaveLength(1);
    expect(ledger.gaps[0]).toMatchObject({
      status: GAP_STATUS.OPEN,
      seenCount: 1,
      occurrences: [{ content: "a", sceneId: 2 }],
    });
  });

  it("counts a repeat and keeps every package that needed it", () => {
    let ledger = mergeGaps(null, [
      {
        id: "gap-aaaa1111",
        need: "humanoid robot",
        contentSlug: "a",
        sceneId: 2,
        reason: "no-candidates",
      },
    ]);
    ledger = mergeGaps(ledger, [
      {
        id: "gap-aaaa1111",
        need: "humanoid robot",
        contentSlug: "b",
        sceneId: 5,
        reason: "relevance-rejected",
      },
    ]);
    expect(ledger.gaps[0].seenCount).toBe(2);
    expect(ledger.gaps[0].reason).toBe("relevance-rejected");
    expect(ledger.gaps[0].occurrences.map((o) => o.content)).toEqual(["a", "b"]);
  });

  it("reopens a satisfied gap that misses again", () => {
    let ledger = mergeGaps(null, [
      { id: "gap-aaaa1111", need: "humanoid robot", contentSlug: "a", sceneId: 2 },
    ]);
    ledger = satisfyGaps(ledger, "gap-aaaa1111", { by: "assets/robot.jpg" }).ledger;
    expect(ledger.gaps[0].status).toBe(GAP_STATUS.SATISFIED);
    expect(ledger.gaps[0].satisfiedBy).toBe("assets/robot.jpg");

    ledger = mergeGaps(ledger, [
      { id: "gap-aaaa1111", need: "humanoid robot", contentSlug: "c", sceneId: 1 },
    ]);
    expect(ledger.gaps[0].status).toBe(GAP_STATUS.OPEN);
    expect(ledger.gaps[0].satisfiedAt).toBeUndefined();
    expect(ledger.gaps[0].reopenedAt).toBeTruthy();
  });

  it("bounds occurrences so the file cannot grow without limit", () => {
    const at = (minute) => new Date(Date.UTC(2026, 0, 1, 0, minute));
    let ledger = mergeGaps(
      null,
      [{ id: "gap-aaaa1111", need: "humanoid robot", contentSlug: "pkg-0", sceneId: 1 }],
      { now: at(0) },
    );
    for (let i = 1; i <= 25; i += 1) {
      ledger = mergeGaps(
        ledger,
        [{ id: "gap-aaaa1111", need: "humanoid robot", contentSlug: `pkg-${i}`, sceneId: 1 }],
        { now: at(i) },
      );
    }
    expect(ledger.gaps[0].seenCount).toBe(26);
    expect(ledger.gaps[0].occurrences).toHaveLength(20);
    const kept = ledger.gaps[0].occurrences.map((occurrence) => occurrence.content);
    // Oldest six retired, newest twenty kept — the bound is by last-seen
    // time, not by string order.
    expect(kept).not.toContain("pkg-0");
    expect(kept).toContain("pkg-6");
    expect(kept).toContain("pkg-25");
  });
});

describe("ledger IO", () => {
  it("treats a missing or corrupt ledger as empty instead of crashing", () => {
    expect(parseLedger(null).gaps).toEqual([]);
    expect(parseLedger("").gaps).toEqual([]);
    expect(parseLedger("{not json").gaps).toEqual([]);
    expect(parseLedger(JSON.stringify({ schemaVersion: 1 })).gaps).toEqual([]);
  });

  it("round-trips deterministically", () => {
    const ledger = mergeGaps(null, [
      { id: "gap-aaaa1111", need: "humanoid robot", contentSlug: "a", sceneId: 2 },
    ]);
    expect(parseLedger(serializeLedger(ledger))).toEqual(ledger);
  });
});

describe("queryGaps — Stage 0 shortlist", () => {
  const ledger = mergeGaps(null, [
    { id: "gap-aaaa1111", need: "humanoid robot arm in a kitchen", contentSlug: "a", sceneId: 1 },
    { id: "gap-bbbb2222", need: "Unitree warehouse floor", contentSlug: "b", sceneId: 2 },
    { id: "gap-cccc3333", need: "humanoid robot hand close-up", contentSlug: "c", sceneId: 3 },
  ]);

  it("matches terms as normalized substrings across the need", () => {
    const hits = queryGaps(ledger, "humanoid,robot");
    expect(hits.map((gap) => gap.id)).toEqual(["gap-aaaa1111", "gap-cccc3333"]);
  });

  it("returns everything open when no terms are given, and honours the limit", () => {
    expect(queryGaps(ledger, "").length).toBe(3);
    expect(queryGaps(ledger, "", { limit: 2 })).toHaveLength(2);
  });

  it("filters by status", () => {
    const satisfied = satisfyGaps(ledger, "unitree").ledger;
    expect(queryGaps(satisfied, "").map((gap) => gap.id)).not.toContain("gap-bbbb2222");
    expect(queryGaps(satisfied, "", { status: GAP_STATUS.SATISFIED }).map((gap) => gap.id)).toEqual(
      ["gap-bbbb2222"],
    );
  });
});

describe("satisfyGaps — closing the loop", () => {
  it("matches by id and by need substring", () => {
    let ledger = mergeGaps(null, [
      { id: "gap-aaaa1111", need: "humanoid robot arm", contentSlug: "a", sceneId: 1 },
      { id: "gap-bbbb2222", need: "unitree warehouse", contentSlug: "b", sceneId: 2 },
    ]);
    expect(satisfyGaps(ledger, "gap-aaaa1111").matched).toHaveLength(1);
    const byTerm = satisfyGaps(ledger, "UNITREE");
    expect(byTerm.matched.map((gap) => gap.id)).toEqual(["gap-bbbb2222"]);
    ledger = byTerm.ledger;
    expect(ledger.gaps.find((gap) => gap.id === "gap-bbbb2222").status).toBe(GAP_STATUS.SATISFIED);
  });

  it("reports no match for an unknown selector", () => {
    const ledger = mergeGaps(null, [
      { id: "gap-aaaa1111", need: "humanoid robot arm", contentSlug: "a", sceneId: 1 },
    ]);
    expect(satisfyGaps(ledger, "quantum chip").matched).toEqual([]);
  });
});

describe("formatGapLine", () => {
  it("names the id, count, reason, need and latest package", () => {
    const ledger = mergeGaps(null, [
      {
        id: "gap-aaaa1111",
        need: "humanoid robot",
        contentSlug: "pkg",
        sceneId: 7,
        reason: "no-candidates",
      },
    ]);
    const line = formatGapLine(ledger.gaps[0]);
    expect(line).toContain("gap-aaaa1111");
    expect(line).toContain("no-candidates");
    expect(line).toContain("humanoid robot");
    expect(line).toContain("pkg#7");
  });
});

describe("asset-gaps CLI", () => {
  const seedRepo = ({ scenes, patches, report, brollReport }) => {
    tmp = mkdtempSync(join(tmpdir(), "asset-gaps-"));
    const contentDir = join(tmp, "scripts", "short-video", "content", "demo");
    const outputDir = join(tmp, "scripts", "short-video", "output", "demo");
    mkdirSync(contentDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      join(contentDir, "scene-data.mjs"),
      `export const scenes = ${JSON.stringify(scenes, null, 2)};\n`,
    );
    if (patches) {
      writeFileSync(
        join(outputDir, "media-patch.json"),
        JSON.stringify({ schemaVersion: 1, patches }, null, 2),
      );
    }
    if (report) {
      writeFileSync(join(contentDir, "stock-relevance-report.json"), JSON.stringify(report));
    }
    if (brollReport) {
      writeFileSync(join(outputDir, "b-roll-report.json"), JSON.stringify(brollReport));
    }
    return { ledgerPath: join(tmp, "knowledge", "asset-gaps.json") };
  };

  const collect = () => {
    const lines = [];
    return { lines, stdout: (line) => lines.push(line) };
  };

  it("records gaps from a package's own artifacts and lists them", async () => {
    const { ledgerPath } = seedRepo({
      scenes: [
        { id: 1, visualType: "narrative", mediaStrategy: "asset", assetNeed: "humanoid robot" },
      ],
      patches: [{ status: "unassigned", claimSceneId: 1, relevanceBand: "low", relevanceScore: 0 }],
    });
    const first = collect();
    const code = await runCli(["--record", "--content", "demo"], {
      repoRoot: tmp,
      ledgerPath,
      ...first,
    });
    expect(code).toBe(0);
    expect(first.lines.join("\n")).toContain("Recorded 1 gap");

    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    expect(ledger.gaps).toHaveLength(1);
    expect(ledger.gaps[0]).toMatchObject({
      need: "humanoid robot",
      reason: GAP_REASON.RELEVANCE_REJECTED,
      status: GAP_STATUS.OPEN,
    });

    const list = collect();
    await runCli(["--query", "robot"], { repoRoot: tmp, ledgerPath, ...list });
    expect(list.lines.join("\n")).toContain("gap-");
  });

  it("prints JSON for machine consumers", async () => {
    const { ledgerPath } = seedRepo({
      scenes: [
        { id: 1, visualType: "narrative", mediaStrategy: "asset", assetNeed: "humanoid robot" },
      ],
    });
    const out = collect();
    await runCli(["--record", "--content", "demo", "--json"], {
      repoRoot: tmp,
      ledgerPath,
      ...out,
    });
    const payload = JSON.parse(out.lines.join("\n"));
    expect(payload).toMatchObject({ content: "demo", recorded: 1, open: 1 });
  });

  it("satisfies a gap with a real library path and refuses an unknown selector", async () => {
    const { ledgerPath } = seedRepo({
      scenes: [
        { id: 1, visualType: "narrative", mediaStrategy: "asset", assetNeed: "humanoid robot" },
      ],
    });
    await runCli(["--record", "--content", "demo"], { repoRoot: tmp, ledgerPath, ...collect() });

    const catalogPath = join(tmp, "scripts", "short-video", "assets", "robot.jpg");
    mkdirSync(dirname(catalogPath), { recursive: true });
    writeFileSync(catalogPath, "not-a-real-image");

    const ok = collect();
    const okCode = await runCli(["--satisfy", "humanoid robot", "--by", catalogPath], {
      repoRoot: tmp,
      ledgerPath,
      ...ok,
    });
    expect(okCode).toBe(0);
    expect(JSON.parse(readFileSync(ledgerPath, "utf8")).gaps[0].status).toBe(GAP_STATUS.SATISFIED);

    const bad = collect();
    const badCode = await runCli(["--satisfy", "quantum chip"], {
      repoRoot: tmp,
      ledgerPath,
      ...bad,
      stderr: () => {},
    });
    expect(badCode).toBe(1);
  });

  it("refuses a --by path that does not exist (the claim would be false)", async () => {
    const { ledgerPath } = seedRepo({
      scenes: [
        { id: 1, visualType: "narrative", mediaStrategy: "asset", assetNeed: "humanoid robot" },
      ],
    });
    await runCli(["--record", "--content", "demo"], { repoRoot: tmp, ledgerPath, ...collect() });
    const err = collect();
    const code = await runCli(["--satisfy", "humanoid robot", "--by", join(tmp, "nope.jpg")], {
      repoRoot: tmp,
      ledgerPath,
      ...err,
      stderr: err.stdout,
    });
    expect(code).toBe(1);
    expect(err.lines.join("\n")).toContain("does not exist");
    expect(JSON.parse(readFileSync(ledgerPath, "utf8")).gaps[0].status).toBe(GAP_STATUS.OPEN);
  });

  it("rejects an unknown --status instead of silently listing nothing", async () => {
    const { ledgerPath } = seedRepo({
      scenes: [
        { id: 1, visualType: "narrative", mediaStrategy: "asset", assetNeed: "humanoid robot" },
      ],
    });
    await runCli(["--record", "--content", "demo"], { repoRoot: tmp, ledgerPath, ...collect() });
    const err = collect();
    const code = await runCli(["--list", "--status", "opne"], {
      repoRoot: tmp,
      ledgerPath,
      ...err,
      stderr: err.stdout,
    });
    expect(code).toBe(1);
    expect(err.lines.join("\n")).toContain("--status must be one of");
  });

  it("records the fall-through reason from the b-roll report", async () => {
    const { ledgerPath } = seedRepo({
      scenes: [
        {
          id: 1,
          visualType: "narrative",
          mediaStrategy: "asset-then-broll",
          assetNeed: "humanoid robot",
        },
      ],
      brollReport: { scenes: { 1: { strategy: "asset-then-broll", status: "won" } } },
    });
    const out = collect();
    await runCli(["--record", "--content", "demo"], { repoRoot: tmp, ledgerPath, ...out });
    expect(JSON.parse(readFileSync(ledgerPath, "utf8")).gaps[0].reason).toBe(
      GAP_REASON.FELL_THROUGH_TO_GENERATION,
    );
  });

  it("fails cleanly on a missing scene-data instead of writing a ledger", async () => {
    tmp = mkdtempSync(join(tmpdir(), "asset-gaps-"));
    const ledgerPath = join(tmp, "knowledge", "asset-gaps.json");
    const err = collect();
    const code = await runCli(["--record", "--content", "ghost"], {
      repoRoot: tmp,
      ledgerPath,
      ...err,
      stderr: err.stdout,
    });
    expect(code).toBe(1);
    expect(err.lines.join("\n")).toContain("scene-data.mjs not found");
  });
});
