// Digital-human `plan` dry-run tests (#214 ticket 03).
//
// Covers: silence-boundary segmentation (word-gap + punctuation fallback),
// cost estimation, plan file content, quality-tier authorization refusal and
// the zero-write guarantee (scene-data + remote-tasks byte-identical before/
// after; the plan file is the ONLY artifact written). Mock layer is fs-only —
// no network anywhere.

import { describe, it, expect, afterEach, vi } from "vitest";
import { spawnSync } from "child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
  statSync,
} from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

import {
  MODEL_TIERS,
  PLAN_FILE_NAME,
  QUALITY_TIER_AUTH_FILE,
  buildWordGapBoundaries,
  buildTextPunctuationBoundaries,
  splitAudioAtBoundaries,
  resolveGenerationUnits,
  estimateCost,
  computeScenePlan,
  planDigitalHumanPackage,
  executePlan,
  planPathFor,
} from "../lib/digital-human.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "..", "digital-human.mjs");
const REMOTE_TASKS_JSON = join(__dirname, "..", "..", "cloud-gpu", "output", "remote-tasks.json");

let dirs = [];
const tmpDir = (prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};
const cleanup = () => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
};
const expectWithinCap = (segments, cap) => {
  for (const s of segments) {
    if (!s.hardCut) expect(s.duration).toBeLessThanOrEqual(cap + 1e-9);
  }
};

// Deterministic scene-1 alignment: gaps of 0.7s and 0.5s are the "real pauses"
// (post-silenceremove the TTS chain compresses pauses, see lib JSDoc).
const SCENE1_WORDS = [
  { text: "W1", start: 0.5, end: 1.0 },
  { text: "W2", start: 1.02, end: 2.0 },
  { text: "W3", start: 2.02, end: 2.8 },
  { text: "W4", start: 3.5, end: 4.3 },
  { text: "W5", start: 4.32, end: 5.0 },
  { text: "W6", start: 5.5, end: 6.3 },
];
const SCENE2_VOICEOVER = "First sentence here. Second one, with clause. Third.";

/** Synthetic package: 3 avatar scenes (align / fallback / generated) + 1 plain. */
function makePackage() {
  const contentRoot = tmpDir("dh-content-");
  const outputRoot = tmpDir("dh-output-");
  const pkg = join(contentRoot, "dh-plan-test");
  const audioDir = join(outputRoot, "dh-plan-test", "audio");
  mkdirSync(pkg, { recursive: true });
  mkdirSync(audioDir, { recursive: true });

  writeFileSync(
    join(pkg, "meta.mjs"),
    `export const meta = { pipelineId: "dh-plan-test", title: "plan test" };\n`,
  );
  const sceneData = `export const scenes = [
  { id: 1, voiceover: "W1 W2 W3 W4 W5 W6", avatar: {} },
  { id: 2, voiceover: ${JSON.stringify(SCENE2_VOICEOVER)}, avatar: { present: [{ from: 0, to: 2 }] } },
  { id: 3, voiceover: "Already generated.", avatar: { videoPath: "assets/avatar/s3.mp4" } },
  { id: 4, voiceover: "No avatar here." },
];\n`;
  writeFileSync(join(pkg, "scene-data.mjs"), sceneData);

  writeFileSync(join(audioDir, "scene-1.wav"), "RIFF....");
  writeFileSync(
    join(audioDir, "scene-1.tts-meta.json"),
    JSON.stringify({ key: "k1", duration: 6.5, engine: "test", audioPath: "scene-1.wav" }),
  );
  writeFileSync(join(audioDir, "scene-2.wav"), "RIFF....");
  writeFileSync(
    join(audioDir, "scene-durations.json"),
    JSON.stringify([{ sceneId: 2, duration: 5.0 }]),
  );
  writeFileSync(
    join(audioDir, "subtitle-timing.json"),
    JSON.stringify([{ sceneId: 1, segments: [{ text: "W1 W2 W3 W4 W5 W6", words: SCENE1_WORDS }] }]),
  );
  return { contentRoot, outputRoot, pkg, audioDir };
}

/** Recursive path→size map for zero-write tree comparisons. */
function treeSnapshot(root) {
  if (!existsSync(root)) return null;
  const map = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else map[relative(root, p)] = statSync(p).size;
    }
  };
  walk(root);
  return map;
}

// ─── Boundary extraction ───

describe("buildWordGapBoundaries", () => {
  it("cuts at gap midpoints with quality = gap width", () => {
    const cuts = buildWordGapBoundaries(SCENE1_WORDS);
    const at = cuts.map((c) => c.at);
    expect(at).toContain(3.15); // (2.8 + 3.5) / 2
    expect(at).toContain(5.25); // (5.0 + 5.5) / 2
    const big = cuts.find((c) => c.at === 3.15);
    expect(big.quality).toBeCloseTo(0.7);
  });
});

describe("buildTextPunctuationBoundaries (fallback)", () => {
  it("proposes cuts only after punctuation, sentences scoring higher", () => {
    const cuts = buildTextPunctuationBoundaries(SCENE2_VOICEOVER, 5.0);
    const afterSentence = cuts.find((c) => c.quality === 2);
    const afterClause = cuts.find((c) => c.quality === 1);
    expect(afterSentence.at).toBeCloseTo(1.875); // after "here." (3/8 tokens × 5.0)
    expect(afterClause.at).toBeCloseTo(3.125); // after "one," (5/8 × 5.0)
    expect(afterSentence.at).toBeLessThan(afterClause.at);
  });

  it("tokenizes CJK text per character", () => {
    const cuts = buildTextPunctuationBoundaries("你好。世界，再见。", 4.0);
    expect(cuts.length).toBeGreaterThan(0);
    expect(cuts.every((c) => c.at > 0 && c.at < 4.0)).toBe(true);
  });

  it("returns no cuts for punctuation-free text (hard cut will apply)", () => {
    expect(buildTextPunctuationBoundaries("no punctuation at all here", 4.0)).toEqual([]);
  });
});

// ─── Segmentation ───

describe("splitAudioAtBoundaries", () => {
  const CAP = MODEL_TIERS.free.segmentCapSeconds; // 3.24

  it("single segment when audio fits the cap", () => {
    const segs = splitAudioAtBoundaries({ durationSeconds: 3.0, cutPoints: [], capSeconds: CAP });
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ index: 0, from: 0, to: 3.0, hardCut: false });
  });

  it("splits at the largest pause inside the back-off window and respects the cap", () => {
    const cuts = buildWordGapBoundaries(SCENE1_WORDS);
    const segs = splitAudioAtBoundaries({ durationSeconds: 6.5, cutPoints: cuts, capSeconds: CAP });
    expect(segs.map((s) => s.to)).toEqual([3.15, 5.25, 6.5]);
    expect(segs.every((s) => !s.hardCut)).toBe(true);
    expectWithinCap(segs, CAP);
  });

  it("prefers a real pause over a later tiny gap", () => {
    const cuts = [
      { at: 2.5, quality: 0.7 }, // real pause, earlier
      { at: 3.2, quality: 0.025 }, // grid-gap, closer to the cap
    ];
    const segs = splitAudioAtBoundaries({ durationSeconds: 6.0, cutPoints: cuts, capSeconds: CAP });
    expect(segs[0].to).toBe(2.5);
  });

  it("hard-cuts at the cap edge when no boundary exists", () => {
    const segs = splitAudioAtBoundaries({ durationSeconds: 7.0, cutPoints: [], capSeconds: CAP });
    expect(segs).toHaveLength(3);
    expect(segs[0].to).toBeCloseTo(CAP);
    expect(segs[0].hardCut).toBe(true);
    expect(segs[1].to).toBeCloseTo(2 * CAP);
    expect(segs[1].hardCut).toBe(true);
  });

  it("merges a sliver tail into the previous segment (flagged over-cap)", () => {
    const cuts = [{ at: CAP - 0.2, quality: 1 }];
    const segs = splitAudioAtBoundaries({ durationSeconds: CAP + 0.25, cutPoints: cuts, capSeconds: CAP });
    // [0, 3.04] + sliver [3.04, 3.49] → merged into one over-cap segment
    expect(segs).toHaveLength(1);
    expect(segs[0].to).toBeCloseTo(CAP + 0.25);
    expect(segs[0].hardCut).toBe(true);
  });

  it("throws on non-positive duration (fail-closed)", () => {
    expect(() => splitAudioAtBoundaries({ durationSeconds: 0, cutPoints: [], capSeconds: CAP })).toThrow();
  });
});

describe("resolveGenerationUnits (present intervals)", () => {
  const segs = [
    { index: 0, from: 0, to: 3.15, duration: 3.15 },
    { index: 1, from: 3.15, to: 5.25, duration: 2.1 },
    { index: 2, from: 5.25, to: 6.5, duration: 1.25 },
  ];

  it("all segments when present is omitted (full scene on-screen)", () => {
    expect(resolveGenerationUnits(segs, null)).toHaveLength(3);
    expect(resolveGenerationUnits(segs, undefined)).toHaveLength(3);
  });

  it("only overlapping spans when present intervals are declared", () => {
    const units = resolveGenerationUnits(segs, [{ from: 0, to: 2 }]);
    expect(units).toEqual([{ segmentIndex: 0, from: 0, to: 2, duration: 2 }]);
  });

  it("one segment overlapping two intervals yields two units", () => {
    const units = resolveGenerationUnits(segs, [
      { from: 1, to: 1.5 },
      { from: 2, to: 2.5 },
    ]);
    expect(units).toHaveLength(2);
    expect(units.map((u) => u.segmentIndex)).toEqual([0, 0]);
  });

  it("ignores intervals that do not overlap any segment span", () => {
    const units = resolveGenerationUnits(segs, [{ from: 5.9, to: 6.45 }]);
    expect(units).toEqual([{ segmentIndex: 2, from: 5.9, to: 6.45, duration: 0.55 }]);
  });
});

// ─── Cost model ───

describe("estimateCost", () => {
  it("free tier: $0 on Kaggle, ~14 min per segment", () => {
    const c = estimateCost(3, MODEL_TIERS.free);
    expect(c.costUsd).toBe(0);
    expect(c.platform).toBe("kaggle-free-t4");
    expect(c.model).toContain("EchoMimicV3");
    expect(c.estimatedMinutes).toBe(42); // 3 × 840s
    expect(c.quota).toContain("30h/week");
  });

  it("quality tier: $0.20 per 5.2s segment on Modal", () => {
    const c = estimateCost(4, MODEL_TIERS.quality);
    expect(c.costUsd).toBeCloseTo(0.8);
    expect(c.platform).toBe("modal-a100");
    expect(c.model).toContain("SoulX-FlashTalk");
    expect(c.estimatedMinutes).toBeCloseTo(23.3); // 4 × 350s
  });
});

// ─── Scene plan ───

describe("computeScenePlan", () => {
  const scene = (avatar, voiceover = "W1 W2 W3 W4 W5 W6") => ({ id: 9, voiceover, avatar });

  it("uses word-alignment boundaries when timing words exist", () => {
    const entry = computeScenePlan({
      scene: scene({}),
      audioDuration: 6.5,
      durationSource: "tts-meta",
      words: SCENE1_WORDS,
      tier: MODEL_TIERS.free,
    });
    expect(entry.boundarySource).toBe("word-alignment");
    expect(entry.segmentCount).toBe(3);
    expect(entry.durationSeconds).toBe(6.5);
  });

  it("falls back to text-punctuation boundaries without alignment", () => {
    const entry = computeScenePlan({
      scene: scene({}, SCENE2_VOICEOVER),
      audioDuration: 5.0,
      durationSource: "scene-durations",
      words: null,
      tier: MODEL_TIERS.free,
    });
    expect(entry.boundarySource).toBe("text-punctuation-estimate");
    expect(entry.segmentCount).toBe(2);
    expectWithinCap(entry.segments, MODEL_TIERS.free.segmentCapSeconds);
  });

  it("present intervals restrict generation units but not the split", () => {
    const entry = computeScenePlan({
      scene: scene({ present: [{ from: 0, to: 2 }] }),
      audioDuration: 6.5,
      durationSource: "tts-meta",
      words: SCENE1_WORDS,
      tier: MODEL_TIERS.free,
    });
    expect(entry.segmentCount).toBe(3);
    expect(entry.unitCount).toBe(1);
    expect(entry.generationUnits[0]).toMatchObject({ from: 0, to: 2, duration: 2 });
  });

  it("already-generated scenes carry no segments and no cost", () => {
    const entry = computeScenePlan({
      scene: scene({ videoPath: "assets/avatar/x.mp4" }),
      audioDuration: 0,
      durationSource: "tts-meta",
      words: null,
      tier: MODEL_TIERS.free,
      alreadyGenerated: true,
    });
    expect(entry.status).toBe("already-generated");
    expect(entry.segments).toEqual([]);
    expect(entry.unitCount).toBe(0);
  });

  it("throws fail-closed when audio duration is unknown", () => {
    expect(() =>
      computeScenePlan({
        scene: scene({}),
        audioDuration: 0,
        durationSource: "tts-meta",
        words: null,
        tier: MODEL_TIERS.free,
      }),
    ).toThrow(/run the TTS pipeline/);
  });
});

// ─── Package plan ───

describe("planDigitalHumanPackage", () => {
  it("plans avatar scenes with both duration sources and excludes generated ones", () => {
    const { outputRoot, audioDir } = makePackage();
    const scenes = [
      { id: 1, voiceover: "W1 W2 W3 W4 W5 W6", avatar: {} },
      { id: 2, voiceover: SCENE2_VOICEOVER, avatar: { present: [{ from: 0, to: 2 }] } },
      { id: 3, voiceover: "Done.", avatar: { videoPath: "assets/avatar/s3.mp4" } },
      { id: 4, voiceover: "No avatar." },
    ];
    const { plan } = planDigitalHumanPackage({
      scenes,
      pipelineId: "dh-plan-test",
      contentDir: join(outputRoot, "..", "content"),
      audioDir,
      tier: "free",
      qualityAuthorized: false,
      now: new Date("2026-09-07T00:00:00Z"),
    });

    expect(plan.schemaVersion).toBe(1);
    expect(plan.kind).toBe("digital-human-plan");
    expect(plan.tier).toBe("free");
    expect(plan.model).toMatchObject({ platform: "kaggle-free-t4", segmentCapSeconds: 3.24 });
    expect(plan.approval).toEqual({ approved: false, approvedAt: null });
    expect(plan.qualityTier.authorized).toBe(false);
    expect(plan.qualityTier.switch).toContain(QUALITY_TIER_AUTH_FILE);
    expect(plan.createdAt).toBe("2026-09-07T00:00:00.000Z");

    expect(plan.scenes.map((s) => s.sceneId)).toEqual([1, 2, 3]);
    const [s1, s2, s3] = plan.scenes;
    expect(s1.status).toBe("needs-generation");
    expect(s1.durationSource).toBe("tts-meta");
    expect(s1.boundarySource).toBe("word-alignment");
    expect(s2.durationSource).toBe("scene-durations");
    expect(s2.boundarySource).toBe("text-punctuation-estimate");
    expect(s2.unitCount).toBe(1);
    expect(s3.status).toBe("already-generated");

    // totals: scenes 1+2 → 5 segments, units 3 (scene1: 3, scene2: 1)…
    expect(plan.totals.scenesNeedingGeneration).toBe(2);
    expect(plan.totals.segments).toBe(5);
    expect(plan.totals.generationUnits).toBe(4); // scene1 full = 3 units, scene2 present = 1
    expect(plan.totals.generatedSeconds).toBeCloseTo(2 + 6.5); // scene2 unit 2s + scene1 full 6.5s
    expect(plan.totals.costUsd).toBe(0);
    expect(plan.totals.platform).toBe("kaggle-free-t4");
  });

  it("returns null plan for a package without avatar (无需生成)", () => {
    const { plan, avatarSceneCount } = planDigitalHumanPackage({
      scenes: [{ id: 1, voiceover: "x" }],
      pipelineId: "p",
      contentDir: "c",
      audioDir: "a",
      tier: "free",
      qualityAuthorized: false,
    });
    expect(plan).toBeNull();
    expect(avatarSceneCount).toBe(0);
  });

  it("throws on non-object avatar (fail-closed mirror of scene-rules)", () => {
    expect(() =>
      planDigitalHumanPackage({
        scenes: [{ id: 1, voiceover: "x", avatar: null }],
        pipelineId: "p",
        contentDir: "c",
        audioDir: "a",
        tier: "free",
        qualityAuthorized: false,
      }),
    ).toThrow(/avatar must be an object/);
  });

  it("throws on unknown tier", () => {
    expect(() =>
      planDigitalHumanPackage({
        scenes: [{ id: 1, voiceover: "x", avatar: {} }],
        pipelineId: "p",
        contentDir: "c",
        audioDir: "a",
        tier: "turbo",
        qualityAuthorized: false,
      }),
    ).toThrow(/Unknown tier/);
  });
});

// ─── executePlan (fs-level orchestration) ───

describe("executePlan", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it("writes ONLY the plan file; scene-data and remote-tasks stay byte-identical", async () => {
    const { contentRoot, outputRoot, pkg } = makePackage();
    const sceneDataPath = join(pkg, "scene-data.mjs");
    const beforeSceneData = readFileSync(sceneDataPath);
    const beforeRemoteTasks = existsSync(REMOTE_TASKS_JSON) ? readFileSync(REMOTE_TASKS_JSON) : null;
    const beforeTree = { content: treeSnapshot(contentRoot), output: treeSnapshot(outputRoot) };

    const result = await executePlan({
      contentSlug: "dh-plan-test",
      contentRoot,
      outputRoot,
      tier: "free",
      now: new Date("2026-09-07T00:00:00Z"),
    });

    expect(result.outcome).toBe("written");
    // exactly one new file: the plan
    const afterTree = { content: treeSnapshot(contentRoot), output: treeSnapshot(outputRoot) };
    expect(Object.keys(afterTree.content)).toEqual(Object.keys(beforeTree.content)); // content tree unchanged
    const newFiles = Object.keys(afterTree.output).filter((f) => !(f in beforeTree.output));
    expect(newFiles).toEqual([join("dh-plan-test", PLAN_FILE_NAME)]);
    // scene-data byte-identical
    expect(readFileSync(sceneDataPath).equals(beforeSceneData)).toBe(true);
    // remote-task state byte-identical (file must not appear either)
    const afterRemoteTasks = existsSync(REMOTE_TASKS_JSON) ? readFileSync(REMOTE_TASKS_JSON) : null;
    if (beforeRemoteTasks === null) expect(afterRemoteTasks).toBeNull();
    else expect(afterRemoteTasks.equals(beforeRemoteTasks)).toBe(true);

    // plan content sanity
    const written = JSON.parse(readFileSync(result.planPath, "utf8"));
    expect(written.kind).toBe("digital-human-plan");
    expect(written.approval.approved).toBe(false);
    expect(written.scenes).toHaveLength(3);
  });

  it("no-avatar package → no-avatar outcome and NOTHING written", async () => {
    const contentRoot = tmpDir("dh-content-");
    const outputRoot = tmpDir("dh-output-");
    const pkg = join(contentRoot, "plain-pkg");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "meta.mjs"), `export const meta = { pipelineId: "plain-pkg" };\n`);
    writeFileSync(join(pkg, "scene-data.mjs"), `export const scenes = [{ id: 1, voiceover: "x" }];\n`);

    const result = await executePlan({ contentSlug: "plain-pkg", contentRoot, outputRoot });
    expect(result.outcome).toBe("no-avatar");
    expect(existsSync(join(outputRoot, "plain-pkg"))).toBe(false);
    expect(existsSync(planPathFor(outputRoot, "plain-pkg"))).toBe(false);
  });

  it("quality tier without authorization → refused, nothing written (scenario 8)", async () => {
    vi.stubEnv("DIGITAL_HUMAN_QUALITY_AUTHORIZED", "");
    const { contentRoot, outputRoot, pkg } = makePackage();
    const result = await executePlan({
      contentSlug: "dh-plan-test",
      contentRoot,
      outputRoot,
      tier: "quality",
    });
    expect(result.outcome).toBe("refused");
    expect(result.reason).toContain("not authorized");
    expect(result.authSwitch).toContain(QUALITY_TIER_AUTH_FILE);
    expect(existsSync(planPathFor(outputRoot, "dh-plan-test"))).toBe(false);
  });

  it("quality tier authorized via package marker file → plan written and marked", async () => {
    vi.stubEnv("DIGITAL_HUMAN_QUALITY_AUTHORIZED", "");
    const { contentRoot, outputRoot, pkg } = makePackage();
    writeFileSync(join(pkg, QUALITY_TIER_AUTH_FILE), "");
    const result = await executePlan({
      contentSlug: "dh-plan-test",
      contentRoot,
      outputRoot,
      tier: "quality",
    });
    expect(result.outcome).toBe("written");
    expect(result.plan.tier).toBe("quality");
    expect(result.plan.qualityTier.authorized).toBe(true);
    expect(result.plan.totals.platform).toBe("modal-a100");
  });

  it("quality tier authorized via single-run env override", async () => {
    vi.stubEnv("DIGITAL_HUMAN_QUALITY_AUTHORIZED", "1");
    const { contentRoot, outputRoot, pkg } = makePackage();
    const result = await executePlan({
      contentSlug: "dh-plan-test",
      contentRoot,
      outputRoot,
      tier: "quality",
    });
    expect(result.outcome).toBe("written");
    expect(result.plan.qualityTier.authorized).toBe(true);
    void pkg;
  });

  it("throws fail-closed when TTS artifacts are missing", async () => {
    const contentRoot = tmpDir("dh-content-");
    const outputRoot = tmpDir("dh-output-");
    const pkg = join(contentRoot, "no-tts");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "meta.mjs"), `export const meta = { pipelineId: "no-tts" };\n`);
    writeFileSync(join(pkg, "scene-data.mjs"), `export const scenes = [{ id: 1, voiceover: "x", avatar: {} }];\n`);
    await expect(
      executePlan({ contentSlug: "no-tts", contentRoot, outputRoot }),
    ).rejects.toThrow(/run the TTS pipeline/);
  });
});

// ─── CLI contract ───

describe("digital-human.mjs CLI (plan)", () => {
  afterEach(cleanup);

  it("plan on a fixture package: exit 0, plan file under --output-root", () => {
    const outputRoot = tmpDir("dh-cli-");
    const audioDir = join(outputRoot, "avatar-declarations-fixture", "audio");
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, "scene-6.wav"), "RIFF....");
    writeFileSync(join(audioDir, "scene-durations.json"), JSON.stringify([{ sceneId: 6, duration: 4.0 }]));
    const fixtureSceneData = join(__dirname, "..", "content", "_test-fixtures", "avatar-declarations", "scene-data.mjs");
    const beforeSceneData = readFileSync(fixtureSceneData);

    const res = spawnSync(
      process.execPath,
      [CLI, "plan", "--content", "_test-fixtures/avatar-declarations", "--output-root", outputRoot],
      { encoding: "utf8" },
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Plan written");
    const planPath = planPathFor(outputRoot, "avatar-declarations-fixture");
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    expect(plan.pipelineId).toBe("avatar-declarations-fixture");
    expect(plan.approval.approved).toBe(false);
    expect(plan.totals.scenesNeedingGeneration).toBe(1);
    // scene-data untouched
    expect(readFileSync(fixtureSceneData).equals(beforeSceneData)).toBe(true);
  });

  it("plan on a package without avatar: prints 无需生成, writes nothing", () => {
    const outputRoot = tmpDir("dh-cli-");
    const res = spawnSync(
      process.execPath,
      [CLI, "plan", "--content", "qwen4-preview", "--output-root", outputRoot],
      { encoding: "utf8" },
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("无需生成");
    expect(existsSync(join(outputRoot, "qwen4-preview"))).toBe(false);
  });

  it("plan --tier quality without authorization: exit 1, prints the switch, no plan file", () => {
    const outputRoot = tmpDir("dh-cli-");
    const audioDir = join(outputRoot, "avatar-declarations-fixture", "audio");
    mkdirSync(audioDir, { recursive: true });
    writeFileSync(join(audioDir, "scene-6.wav"), "RIFF....");
    writeFileSync(join(audioDir, "scene-durations.json"), JSON.stringify([{ sceneId: 6, duration: 4.0 }]));
    const env = { ...process.env };
    delete env.DIGITAL_HUMAN_QUALITY_AUTHORIZED;

    const res = spawnSync(
      process.execPath,
      [
        CLI,
        "plan",
        "--content",
        "_test-fixtures/avatar-declarations",
        "--tier",
        "quality",
        "--output-root",
        outputRoot,
      ],
      { encoding: "utf8", env },
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("not authorized");
    expect(res.stderr).toContain(QUALITY_TIER_AUTH_FILE);
    expect(existsSync(planPathFor(outputRoot, "avatar-declarations-fixture"))).toBe(false);
  });

  it("run subcommand is not implemented yet (ticket 04)", () => {
    const res = spawnSync(process.execPath, [CLI, "run"], { encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("ticket 04");
  });
});
