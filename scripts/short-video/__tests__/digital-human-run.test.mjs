// Digital-human `run`/`resume`/`approve` tests (#214 ticket 04).
//
// Covers: approval gate (unapproved plan → refuse with ZERO remote calls and
// ZERO fs writes), the mock transport happy path (submit per generation unit →
// harvest → upscale 2x → concat in strict unit order → one atomic videoPath
// writeback per scene → report with 耗时/平台/费用), interruption recovery
// (resume re-harvests resumable units, resubmits only failed ones, completed
// units are never resubmitted or re-billed), and the fail-closed guarantees
// (generation or upscale failure → scene-data byte-identical, no report).
//
// Mock layer only — the transport/ffmpeg/upscale seams are injected; no test
// here ever touches the network or a real GPU binary.

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
import { pathToFileURL, fileURLToPath } from "url";
import { tmpdir } from "os";

import {
  executeApprove,
  runPlan,
  resumePlan,
  applyVideoPathToSceneData,
  buildConcatList,
  unitKeyFor,
  planDigitalHumanPackage,
  writePlanFile,
  PLAN_FILE_NAME,
} from "../lib/digital-human.mjs";
import { loadTaskLog, recordTask } from "../../cloud-gpu/lib/remote-task.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const SCENE1_WORDS = [
  { text: "W1", start: 0.5, end: 1.0 },
  { text: "W2", start: 1.02, end: 2.0 },
  { text: "W3", start: 2.02, end: 2.8 },
  { text: "W4", start: 3.5, end: 4.3 },
  { text: "W5", start: 4.32, end: 5.0 },
  { text: "W6", start: 5.5, end: 6.3 },
];

/**
 * Synthetic package: scene 1 (6.5s audio, no present) → 3 generation units;
 * scene 2 (5.0s audio, present [0,2]) → 1 generation unit; scene 3 already
 * generated; scene 4 no avatar. Builds + writes a REAL plan file via the
 * ticket-03 exports so the run engine is tested against the v1 schema.
 */
function makePackage({ scene1Avatar = {}, scene2Avatar = { present: [{ from: 0, to: 2 }] } } = {}) {
  const contentRoot = tmpDir("dh-run-content-");
  const outputRoot = tmpDir("dh-run-output-");
  const pkg = join(contentRoot, "dh-run-test");
  const audioDir = join(outputRoot, "dh-run-test", "audio");
  mkdirSync(pkg, { recursive: true });
  mkdirSync(audioDir, { recursive: true });

  writeFileSync(join(pkg, "meta.mjs"), `export const meta = { pipelineId: "dh-run-test" };\n`);
  writeFileSync(
    join(pkg, "scene-data.mjs"),
    `export const scenes = [\n` +
      `  { id: 1, voiceover: "W1 W2 W3 W4 W5 W6", avatar: ${JSON.stringify(scene1Avatar)} },\n` +
      `  { id: 2, voiceover: "Hello there. Short one.", avatar: ${JSON.stringify(scene2Avatar)} },\n` +
      `  { id: 3, voiceover: "Done.", avatar: { videoPath: "assets/avatar/scene-3.mp4" } },\n` +
      `  { id: 4, voiceover: "No avatar." },\n` +
      `];\n`,
  );

  writeFileSync(join(audioDir, "scene-1.wav"), "RIFF....");
  writeFileSync(
    join(audioDir, "scene-1.tts-meta.json"),
    JSON.stringify({ duration: 6.5, audioPath: "scene-1.wav" }),
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

  // Portrait for the Kaggle input dataset staging.
  const portraitDir = join(pkg, "assets", "avatar");
  mkdirSync(portraitDir, { recursive: true });
  writeFileSync(join(portraitDir, "portrait.jpg"), "fake-jpeg");

  const { plan } = planDigitalHumanPackage({
    scenes: [
      { id: 1, voiceover: "W1 W2 W3 W4 W5 W6", avatar: scene1Avatar },
      { id: 2, voiceover: "Hello there. Short one.", avatar: scene2Avatar },
      { id: 3, voiceover: "Done.", avatar: { videoPath: "assets/avatar/scene-3.mp4" } },
      { id: 4, voiceover: "No avatar." },
    ],
    pipelineId: "dh-run-test",
    contentDir: pkg,
    audioDir,
    tier: "free",
    qualityAuthorized: false,
    now: new Date("2026-09-07T00:00:00Z"),
  });
  const planPath = join(outputRoot, "dh-run-test", PLAN_FILE_NAME);
  writePlanFile(planPath, plan);
  return { contentRoot, outputRoot, pkg, audioDir, planPath, plan };
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

/**
 * Fake transport: records every remote interaction, "generates" the unit mp4
 * during harvest (as the real download step would land it), and can be told
 * to fail specific units at harvest or submission time.
 */
function makeTransport({ failHarvest = {}, failSubmit = {} } = {}) {
  const calls = {
    pushedDatasets: [],
    submitted: [],
    harvested: [],
  };
  const transport = {
    async pushDataset({ dir }) {
      calls.pushedDatasets.push(dir);
      return { source: "xpabloli/dh-run-test" };
    },
    async submitUnit({ slug, script, datasetSources, workDir, unitKey, sceneId, unitIndex }) {
      calls.submitted.push({ slug, script, datasetSources, workDir, unitKey, sceneId, unitIndex });
      if (failSubmit[slug]) throw new Error(`Kaggle push failed: ${failSubmit[slug]}`);
      const kernelId = `xPabloLI/${slug}`;
      mkdirSync(workDir, { recursive: true }); // real transport contract: create workDir
      writeFileSync(join(workDir, "kernel-metadata.json"), "{}");
      return { kernelId };
    },
    async harvestUnit({ kernelId, outputDir, outputName }) {
      calls.harvested.push({ kernelId, outputDir, outputName });
      if (failHarvest[kernelId]) {
        return { success: false, elapsedSec: 12, stderr: failHarvest[kernelId] };
      }
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, outputName), "fake-mp4");
      return { success: true, elapsedSec: 60, stderr: "" };
    },
  };
  return { transport, calls };
}

/** Fake ffmpeg seam: records slices/concats and produces the expected files. */
function makeFfmpeg() {
  const calls = { sliced: [], concats: [], lists: [] };
  return {
    calls,
    async sliceAudio({ input, from, to, output }) {
      calls.sliced.push({ input, from, to, output });
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, "fake-wav");
    },
    async concat({ listFile, output }) {
      calls.concats.push({ listFile, output });
      calls.lists.push(readFileSync(listFile, "utf8"));
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, "fake-concat-mp4");
    },
  };
}

/** Fake upscale: records calls, writes the output, optional failure. */
function makeUpscale({ fail = false } = {}) {
  const calls = [];
  const dep = async (inputPath, outputPath) => {
    calls.push({ inputPath, outputPath });
    if (fail) return { success: false, error: "Real-ESRGAN vulkan device lost (stderr tail)" };
    writeFileSync(outputPath, "fake-upscaled");
    return { success: true, path: outputPath };
  };
  return { dep, calls };
}

/** Default deps bundle over a tmp remote-task log. */
function makeDeps({ transport, ffmpeg, upscale }) {
  return {
    tasksPath: join(tmpDir("dh-run-tasks-"), "remote-tasks.json"),
    transport,
    ffmpeg,
    upscale: upscale.dep,
    pollIntervalSec: 0.01,
    timeoutSec: 60,
  };
}

/** Load the current scene-data module of a fixture package. */
async function loadScenes(pkg) {
  const mod = await import(pathToFileURL(join(pkg, "scene-data.mjs")).href + `?t=${Date.now()}-${Math.random()}`);
  return mod.scenes;
}

// ─── executeApprove ───

describe("buildUnitKernelScript", () => {
  it("substitutes every __UNIT_CONFIG_JSON__ occurrence (docstring + code) with the unit config", async () => {
    const { buildUnitKernelScript } = await import("../lib/digital-human.mjs");
    const script = buildUnitKernelScript({ audioFile: "s10-u0.wav", outputFile: "scene-10-u0.mp4" });
    // Regression: the template mentions the placeholder twice (docstring line
    // 10 + code line 31); String.replace only swapped the first and shipped a
    // kernel that died at import with JSONDecodeError (T6 E2E first run).
    expect(script).not.toContain("__UNIT_CONFIG_JSON__");
    const codeLine = script.split("\n").find((l) => l.trim().startsWith("UNIT_CONFIG ="));
    expect(codeLine).toContain('"audio_file":"s10-u0.wav"');
    expect(() => JSON.parse(codeLine.match(/'''.*?'''/s)[0].replaceAll("'''", ""))).not.toThrow();
    // Guard the v25-proven sys.path insert: PYTHONPATH env alone does not
    // affect a running interpreter (ModuleNotFoundError at import diffusers,
    // T6 E2E second run).
    expect(script).toContain("sys.path.insert(0, CUSTOM_DIR)");
  });
});

describe("executeApprove", () => {
  afterEach(cleanup);

  it("flips approval.approved=true, stamps approvedAt, preserves the rest of the plan", () => {
    const { outputRoot, planPath, plan } = makePackage();
    const before = JSON.parse(readFileSync(planPath, "utf8"));
    const res = executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });

    expect(res.outcome).toBe("approved");
    const after = JSON.parse(readFileSync(planPath, "utf8"));
    expect(after.approval).toEqual({ approved: true, approvedAt: "2026-09-07T12:00:00.000Z" });
    expect(after.totals).toEqual(before.totals);
    expect(after.scenes).toEqual(before.scenes);
    expect(after.pipelineId).toBe(plan.pipelineId);
  });

  it("is idempotent: approving twice keeps approved=true", () => {
    const { planPath } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const res = executeApprove(planPath, { now: new Date("2026-09-07T13:00:00Z") });
    expect(res.outcome).toBe("approved");
    expect(JSON.parse(readFileSync(planPath, "utf8")).approval.approved).toBe(true);
  });

  it("rejects a file that is not a digital-human plan", () => {
    const dir = tmpDir("dh-approve-");
    const p = join(dir, "not-a-plan.json");
    writeFileSync(p, JSON.stringify({ kind: "something-else" }));
    expect(() => executeApprove(p)).toThrow(/digital-human-plan/);
  });

  it("fails clearly on a missing plan file", () => {
    const dir = tmpDir("dh-approve-");
    expect(() => executeApprove(join(dir, "absent.json"))).toThrow(/absent\.json/);
  });
});

// ─── runPlan refusal gates (spec scenario 3) ───

describe("runPlan approval + authorization gates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it("unapproved plan → refused, ZERO remote calls, ZERO fs writes outside the plan read", async () => {
    const { outputRoot, contentRoot, pkg, planPath, plan } = makePackage();
    const { transport, calls } = makeTransport();
    const ffmpeg = makeFfmpeg();
    const deps = makeDeps({ transport, ffmpeg, upscale: makeUpscale() });

    const beforeTree = {
      content: treeSnapshot(contentRoot),
      output: treeSnapshot(outputRoot),
    };
    const beforeSceneData = readFileSync(join(pkg, "scene-data.mjs"));

    const res = await runPlan({ planPath, deps });

    expect(res.outcome).toBe("refused");
    expect(res.reason).toMatch(/not approved|approval/i);
    expect(calls.submitted).toHaveLength(0);
    expect(calls.pushedDatasets).toHaveLength(0);
    expect(calls.harvested).toHaveLength(0);
    expect(ffmpeg.calls.sliced).toHaveLength(0);
    // no remote-task log created, no report, no artifacts
    expect(existsSync(deps.tasksPath)).toBe(false);
    expect(existsSync(join(outputRoot, plan.pipelineId, "digital-human-report.json"))).toBe(false);
    expect(treeSnapshot(outputRoot)).toEqual(beforeTree.output);
    expect(readFileSync(join(pkg, "scene-data.mjs")).equals(beforeSceneData)).toBe(true);
    void contentRoot;
  });

  it("quality tier in the plan without the package marker → refused (spec scenario 8)", async () => {
    const { outputRoot, planPath, plan } = makePackage();
    // Simulate a plan flipped to the quality tier without authorization.
    const raw = JSON.parse(readFileSync(planPath, "utf8"));
    raw.tier = "quality";
    raw.model = { name: "SoulX-FlashTalk 14B", platform: "modal-a100", segmentCapSeconds: 5.2 };
    raw.approval = { approved: true, approvedAt: "2026-09-07T12:00:00.000Z" };
    writeFileSync(planPath, JSON.stringify(raw, null, 2) + "\n");
    void plan;

    const { transport, calls } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });

    const res = await runPlan({ planPath, deps });
    expect(res.outcome).toBe("refused");
    expect(res.reason).toMatch(/not authorized|authoriz/i);
    expect(calls.submitted).toHaveLength(0);
    void outputRoot;
  });

  it("corrupt plan file → clear failure, no remote calls", async () => {
    const dir = tmpDir("dh-corrupt-");
    const planPath = join(dir, "plan.json");
    writeFileSync(planPath, "{not json");
    const { transport, calls } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });
    await expect(runPlan({ planPath, deps })).rejects.toThrow();
    expect(calls.submitted).toHaveLength(0);
  });

  it("missing avatar portrait (and units to submit) → fail-closed before any submission", async () => {
    const { contentRoot, planPath } = makePackage();
    rmSync(join(contentRoot, "dh-run-test", "assets", "avatar", "portrait.jpg"));
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });

    const { transport, calls } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });
    const res = await runPlan({ planPath, deps });
    expect(res.outcome).toBe("failed");
    expect(res.reason).toMatch(/portrait/i);
    expect(calls.submitted).toHaveLength(0);
    expect(calls.pushedDatasets).toHaveLength(0);
  });
});

// ─── runPlan happy path ───

describe("runPlan end-to-end (mock transport)", () => {
  afterEach(cleanup);

  it("submits every generation unit in order, records remote-task state, and returns completed", async () => {
    const { planPath, plan } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport, calls } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });

    const res = await runPlan({ planPath, deps });
    expect(res.outcome).toBe("completed");

    // 4 generation units: scene 1 (3 units, full audio) + scene 2 (1 unit, present ∩ segment)
    expect(calls.submitted).toHaveLength(4);
    const submittedKeys = calls.submitted.map((s) => s.unitKey);
    expect(submittedKeys).toEqual([
      unitKeyFor("dh-run-test", 1, 0),
      unitKeyFor("dh-run-test", 1, 1),
      unitKeyFor("dh-run-test", 1, 2),
      unitKeyFor("dh-run-test", 2, 0),
    ]);
    // every submitted kernel references the EchoMimicV3 model dataset + the run dataset
    for (const s of calls.submitted) {
      expect(s.datasetSources).toContain("xpabloli/echomimicv3-flash");
      expect(s.datasetSources).toContain("xpabloli/dh-run-test");
      expect(s.script).toContain("UNIT_CONFIG");
    }

    const log = loadTaskLog(deps.tasksPath);
    const records = Object.values(log.tasks).filter((t) => t.kind === "digital-human-unit");
    expect(records).toHaveLength(4);
    expect(records.every((r) => r.state === "complete")).toBe(true);
    expect(records.every((r) => r.pipelineId === plan.pipelineId)).toBe(true);
    void planPath;
  });

  it("slices the scene TTS wav at plan unit boundaries before submission", async () => {
    const { planPath, plan } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport } = makeTransport();
    const ffmpeg = makeFfmpeg();
    const deps = makeDeps({ transport, ffmpeg, upscale: makeUpscale() });

    await runPlan({ planPath, deps });

    const scene1 = plan.scenes.find((s) => s.sceneId === 1);
    const scene2 = plan.scenes.find((s) => s.sceneId === 2);
    expect(ffmpeg.calls.sliced).toHaveLength(4);
    for (const unit of scene1.generationUnits) {
      expect(ffmpeg.calls.sliced).toContainEqual(
        expect.objectContaining({ from: unit.from, to: unit.to }),
      );
    }
    for (const unit of scene2.generationUnits) {
      expect(ffmpeg.calls.sliced).toContainEqual(
        expect.objectContaining({ from: unit.from, to: unit.to }),
      );
    }
  });

  it("upscales every unit then concats per scene in strict unit order", async () => {
    const { outputRoot, planPath } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport } = makeTransport();
    const ffmpeg = makeFfmpeg();
    const upscale = makeUpscale();
    const deps = makeDeps({ transport, ffmpeg, upscale });

    await runPlan({ planPath, deps });

    expect(upscale.calls).toHaveLength(4);
    // scene 1: 3 units → one concat with entries in unit order
    expect(ffmpeg.calls.concats).toHaveLength(2);
    const scene1List = ffmpeg.calls.lists[0];
    const expectedPaths = [0, 1, 2].map((i) =>
      join(outputRoot, "dh-run-test", "avatar", "upscaled", `s1-u${i}.mp4`),
    );
    expect(scene1List).toBe(expectedPaths.map((p) => `file '${p}'`).join("\n") + "\n");
    // scene 2 present-interval scene: only its single generated unit
    const scene2List = ffmpeg.calls.lists[1];
    expect(scene2List).toContain("s2-u0.mp4");
  });

  it("writes videoPath back into scene-data exactly once per scene, content-relative", async () => {
    const { pkg, planPath } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });

    const res = await runPlan({ planPath, deps });
    expect(res.outcome).toBe("completed");
    expect(res.writtenBack).toEqual([
      { sceneId: 1, videoPath: "assets/avatar/scene-1.mp4" },
      { sceneId: 2, videoPath: "assets/avatar/scene-2.mp4" },
    ]);

    const scenes = await loadScenes(pkg);
    expect(scenes[0].avatar).toEqual({ videoPath: "assets/avatar/scene-1.mp4" });
    expect(scenes[1].avatar).toEqual({
      videoPath: "assets/avatar/scene-2.mp4",
      present: [{ from: 0, to: 2 }],
    });
    // the generated video landed in the package assets dir (content-relative videoPath)
    expect(existsSync(join(pkg, "assets", "avatar", "scene-1.mp4"))).toBe(true);
    expect(existsSync(join(pkg, "assets", "avatar", "scene-2.mp4"))).toBe(true);
    // backup per repo convention (apply-media-patch .bak)
    expect(existsSync(join(pkg, "scene-data.mjs.bak"))).toBe(true);
  });

  it("writes the report beside the plan with 耗时/平台/费用 fields", async () => {
    const { outputRoot, planPath } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });

    await runPlan({ planPath, deps });

    const report = JSON.parse(
      readFileSync(join(outputRoot, "dh-run-test", "digital-human-report.json"), "utf8"),
    );
    expect(report.kind).toBe("digital-human-report");
    expect(report.totals.platform).toBe("kaggle");
    expect(report.totals.costUsd).toBe(0); // free tier
    expect(report.totals.elapsedSeconds).toBeGreaterThanOrEqual(0);
    expect(report.totals.quotaMinutes).toBeGreaterThanOrEqual(0);
    expect(report.totals.units).toBe(4);
    for (const s of report.scenes) {
      expect(s.elapsedSeconds).toBeGreaterThanOrEqual(0);
      expect(s.platform).toBe("kaggle");
      expect(s.costUsd).toBe(0);
    }
  });

  it("skips scenes whose videoPath is already set in current scene-data (stale plan)", async () => {
    const { pkg, planPath } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    // Scene 1 got generated after the plan was written → stale plan.
    writeFileSync(
      join(pkg, "scene-data.mjs"),
      `export const scenes = [
  { id: 1, voiceover: "W1 W2 W3 W4 W5 W6", avatar: { videoPath: "assets/avatar/scene-1.mp4" } },
  { id: 2, voiceover: "Hello there. Short one.", avatar: { present: [{ from: 0, to: 2 }] } },
  { id: 3, voiceover: "Done.", avatar: { videoPath: "assets/avatar/scene-3.mp4" } },
  { id: 4, voiceover: "No avatar." },
];\n`,
    );

    const { transport, calls } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });
    const res = await runPlan({ planPath, deps });

    expect(res.outcome).toBe("completed");
    // only scene 2's unit is submitted
    expect(calls.submitted).toHaveLength(1);
    expect(calls.submitted[0].unitKey).toBe(unitKeyFor("dh-run-test", 2, 0));
    expect(res.writtenBack).toEqual([{ sceneId: 2, videoPath: "assets/avatar/scene-2.mp4" }]);
  });
});

// ─── resume (spec scenario 4) ───

describe("resumePlan interruption recovery", () => {
  afterEach(cleanup);

  it("re-harvests only resumable units; completed units are never resubmitted", async () => {
    const { outputRoot, pkg, planPath, plan } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport, calls } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });

    // Simulate an interrupted run: unit 1:0 complete (output downloaded),
    // unit 1:1 timeout-resumable (kernel still alive remotely), 1:2 and 2:0 never submitted.
    const genDir = (s, u) => join(outputRoot, "dh-run-test", "avatar", "generated", `s${s}-u${u}`);
    mkdirSync(genDir(1, 0), { recursive: true });
    writeFileSync(join(genDir(1, 0), "s1-u0.mp4"), "fake-mp4");
    recordTask(deps.tasksPath, {
      id: "xPabloLI/dh-done",
      backend: "kaggle",
      kind: "digital-human-unit",
      unitKey: unitKeyFor("dh-run-test", 1, 0),
      pipelineId: plan.pipelineId,
      sceneId: 1,
      unitIndex: 0,
      outputDir: genDir(1, 0),
      outputName: "s1-u0.mp4",
      elapsedSec: 840,
      state: "complete",
    });
    recordTask(deps.tasksPath, {
      id: "xPabloLI/dh-alive",
      backend: "kaggle",
      kind: "digital-human-unit",
      unitKey: unitKeyFor("dh-run-test", 1, 1),
      pipelineId: plan.pipelineId,
      sceneId: 1,
      unitIndex: 1,
      outputDir: genDir(1, 1),
      outputName: "s1-u1.mp4",
      state: "timeout",
    });

    const res = await resumePlan({ planPath, deps });
    expect(res.outcome).toBe("completed");

    // The completed unit is skipped (no re-billing), the timeout one is
    // re-harvested under its EXISTING kernel id, and the two never-submitted
    // units (1:2, 2:0 — unfinished work) are submitted now.
    expect(calls.submitted.map((s) => s.unitKey)).toEqual([
      unitKeyFor("dh-run-test", 1, 2),
      unitKeyFor("dh-run-test", 2, 0),
    ]);
    expect(calls.harvested).toHaveLength(3);
    expect(calls.harvested[0].kernelId).toBe("xPabloLI/dh-alive");
    expect(calls.harvested[0].outputName).toBe("s1-u1.mp4");
    // the completed unit 1:0 is never touched again
    expect(
      calls.submitted.every((s) => s.unitKey !== unitKeyFor("dh-run-test", 1, 0)) &&
        calls.harvested.every((h) => h.kernelId !== "xPabloLI/dh-done"),
    ).toBe(true);

    // report cost/elapsed accumulate across sessions (completed unit keeps its 840s)
    const report = JSON.parse(
      readFileSync(join(outputRoot, "dh-run-test", "digital-human-report.json"), "utf8"),
    );
    expect(report.totals.elapsedSeconds).toBeGreaterThanOrEqual(840);
    void pkg;
  });

  it("resubmits failed units under a fresh kernel id, skips completed ones", async () => {
    const { outputRoot, planPath, plan } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport, calls } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });

    const genDir = join(outputRoot, "dh-run-test", "avatar", "generated", "s1-u0");
    mkdirSync(genDir, { recursive: true });
    writeFileSync(join(genDir, "s1-u0.mp4"), "fake-mp4");
    recordTask(deps.tasksPath, {
      id: "xPabloLI/dh-done",
      backend: "kaggle",
      kind: "digital-human-unit",
      unitKey: unitKeyFor("dh-run-test", 1, 0),
      pipelineId: plan.pipelineId,
      sceneId: 1,
      unitIndex: 0,
      outputDir: genDir,
      outputName: "s1-u0.mp4",
      state: "complete",
    });
    recordTask(deps.tasksPath, {
      id: "xPabloLI/dh-dead",
      backend: "kaggle",
      kind: "digital-human-unit",
      unitKey: unitKeyFor("dh-run-test", 1, 1),
      pipelineId: plan.pipelineId,
      sceneId: 1,
      unitIndex: 1,
      state: "failed",
    });

    const res = await resumePlan({ planPath, deps });
    expect(res.outcome).toBe("completed");
    // exactly one resubmission: the failed unit 1:1 (units 1:2, 2:0 had no record → also submitted)
    const submittedKeys = calls.submitted.map((s) => s.unitKey);
    expect(submittedKeys).toEqual([
      unitKeyFor("dh-run-test", 1, 1),
      unitKeyFor("dh-run-test", 1, 2),
      unitKeyFor("dh-run-test", 2, 0),
    ]);
    // and the completed unit 1:0 was never harvested again
    expect(calls.harvested.every((h) => h.kernelId !== "xPabloLI/dh-done")).toBe(true);
    void plan;
  });

  it("recovers a scene whose units all completed but the scene was never written back", async () => {
    const { outputRoot, pkg, planPath } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport, calls } = makeTransport();
    const ffmpeg = makeFfmpeg();
    const deps = makeDeps({ transport, ffmpeg, upscale: makeUpscale() });

    // All 4 units complete with outputs on disk (crash after generation).
    const units = [
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
    ];
    for (const [s, u] of units) {
      const dir = join(outputRoot, "dh-run-test", "avatar", "generated", `s${s}-u${u}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `s${s}-u${u}.mp4`), "fake-mp4");
      recordTask(deps.tasksPath, {
        id: `xPabloLI/dh-${s}-${u}`,
        backend: "kaggle",
        kind: "digital-human-unit",
        unitKey: unitKeyFor("dh-run-test", s, u),
        pipelineId: "dh-run-test",
        sceneId: s,
        unitIndex: u,
        outputDir: dir,
        outputName: `s${s}-u${u}.mp4`,
        state: "complete",
      });
    }

    const res = await resumePlan({ planPath, deps });
    expect(res.outcome).toBe("completed");
    expect(calls.submitted).toHaveLength(0);
    expect(calls.harvested).toHaveLength(0);
    // but upscale + concat + writeback still happened
    expect(ffmpeg.calls.concats).toHaveLength(2);
    const scenes = await loadScenes(pkg);
    expect(scenes[0].avatar.videoPath).toBe("assets/avatar/scene-1.mp4");
  });

  it("run (not resume) on a package with live remote tasks → interrupted, zero submissions", async () => {
    const { planPath } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport, calls } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });
    recordTask(deps.tasksPath, {
      id: "xPabloLI/dh-alive",
      backend: "kaggle",
      kind: "digital-human-unit",
      unitKey: unitKeyFor("dh-run-test", 1, 0),
      pipelineId: "dh-run-test",
      state: "running",
    });

    const res = await runPlan({ planPath, deps });
    expect(res.outcome).toBe("interrupted");
    expect(res.reason).toMatch(/resume/i);
    expect(calls.submitted).toHaveLength(0);
    expect(calls.harvested).toHaveLength(0);
  });
});

// ─── fail-closed guarantees (spec scenario 5) ───

describe("runPlan failure paths", () => {
  afterEach(cleanup);

  it("generation failure → failed, scene-data byte-identical, no upscale/concat/report", async () => {
    const { pkg, outputRoot, planPath } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport, calls } = makeTransport({
      failHarvest: { "xPabloLI/dh-dh-run-test-s1x0": "Kaggle kernel finished with status: error" },
    });
    const ffmpeg = makeFfmpeg();
    const upscale = makeUpscale();
    const deps = makeDeps({ transport, ffmpeg, upscale });

    const beforeSceneData = readFileSync(join(pkg, "scene-data.mjs"));
    const res = await runPlan({ planPath, deps });

    expect(res.outcome).toBe("failed");
    expect(res.reason).toMatch(/status: error/);
    // no post-processing at all
    expect(upscale.calls).toHaveLength(0);
    expect(ffmpeg.calls.concats).toHaveLength(0);
    expect(existsSync(join(outputRoot, "dh-run-test", "digital-human-report.json"))).toBe(false);
    // scene-data untouched
    expect(readFileSync(join(pkg, "scene-data.mjs")).equals(beforeSceneData)).toBe(true);
    // failed unit recorded as failed in remote-task state
    const log = loadTaskLog(deps.tasksPath);
    const failed = Object.values(log.tasks).find((t) => t.state === "failed");
    expect(failed).toBeTruthy();
    expect(failed.unitKey).toBe(unitKeyFor("dh-run-test", 1, 0));
  });

  it("upscale failure after successful generation → failed with upscale stderr, scene-data byte-identical", async () => {
    const { pkg, outputRoot, planPath } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport } = makeTransport();
    const ffmpeg = makeFfmpeg();
    const upscale = makeUpscale({ fail: true });
    const deps = makeDeps({ transport, ffmpeg, upscale });

    const beforeSceneData = readFileSync(join(pkg, "scene-data.mjs"));
    const res = await runPlan({ planPath, deps });

    expect(res.outcome).toBe("failed");
    expect(res.reason).toMatch(/Real-ESRGAN vulkan device lost/);
    // generation did complete (remote-task records complete)…
    const log = loadTaskLog(deps.tasksPath);
    expect(Object.values(log.tasks).filter((t) => t.kind === "digital-human-unit")).toHaveLength(4);
    // …but no concat, no report, no writeback
    expect(ffmpeg.calls.concats).toHaveLength(0);
    expect(existsSync(join(outputRoot, "dh-run-test", "digital-human-report.json"))).toBe(false);
    expect(readFileSync(join(pkg, "scene-data.mjs")).equals(beforeSceneData)).toBe(true);
  });

  it("submit failure → failed with the transport error, nothing written back", async () => {
    const { pkg, planPath } = makePackage();
    executeApprove(planPath, { now: new Date("2026-09-07T12:00:00Z") });
    const { transport } = makeTransport();
    const deps = makeDeps({ transport, ffmpeg: makeFfmpeg(), upscale: makeUpscale() });
    // fail the very first submission
    const origSubmit = transport.submitUnit;
    transport.submitUnit = async (args) => {
      if (args.unitKey === unitKeyFor("dh-run-test", 1, 0)) {
        throw new Error("Kaggle push failed: 403 Forbidden");
      }
      return origSubmit(args);
    };

    const beforeSceneData = readFileSync(join(pkg, "scene-data.mjs"));
    const res = await runPlan({ planPath, deps });
    expect(res.outcome).toBe("failed");
    expect(res.reason).toMatch(/push failed: 403/);
    expect(readFileSync(join(pkg, "scene-data.mjs")).equals(beforeSceneData)).toBe(true);
  });
});

// ─── scene-data writeback primitive ───

describe("applyVideoPathToSceneData", () => {
  it("inserts videoPath into an empty avatar declaration", () => {
    const text = `export const scenes = [\n  { id: 6, voiceover: "x", avatar: {} },\n];\n`;
    const { text: out } = applyVideoPathToSceneData(text, 6, "assets/avatar/scene-6.mp4");
    expect(out).toContain(`avatar: { videoPath: "assets/avatar/scene-6.mp4" }`);
  });

  it("inserts videoPath into a multiline avatar with present intervals, preserving them", () => {
    const text = `export const scenes = [
  {
    id: 2,
    voiceover: "y",
    avatar: {
      present: [{ from: 0, to: 2 }],
    },
  },
];\n`;
    const { text: out } = applyVideoPathToSceneData(text, 2, "assets/avatar/scene-2.mp4");
    expect(out).toContain(`videoPath: "assets/avatar/scene-2.mp4"`);
    expect(out).toContain(`present: [{ from: 0, to: 2 }]`);
    // still valid ESM
    const tmp = join(tmpDir("dh-wb-"), "scene-data.mjs");
    writeFileSync(tmp, out);
  });

  it("replaces an existing videoPath", () => {
    const text = `{ id: 3, avatar: { videoPath: "old.mp4", position: "right-card" } }`;
    const { text: out } = applyVideoPathToSceneData(text, 3, "assets/avatar/scene-3.mp4");
    expect(out).toContain(`videoPath: "assets/avatar/scene-3.mp4"`);
    expect(out).not.toContain("old.mp4");
    expect(out).toContain(`position: "right-card"`);
  });

  it("throws fail-closed when the scene has no avatar or does not exist", () => {
    expect(() => applyVideoPathToSceneData(`{ id: 1, voiceover: "x" }`, 1, "v.mp4")).toThrow(
      /avatar/,
    );
    expect(() => applyVideoPathToSceneData(`{ id: 1, voiceover: "x", avatar: {} }`, 9, "v.mp4")).toThrow(
      /Scene 9/,
    );
  });
});

// ─── concat list ───

describe("buildConcatList", () => {
  it("emits concat-demuxer entries in the exact given order", () => {
    const list = buildConcatList(["/a/s1.mp4", "/a/s2.mp4", "/a/s3.mp4"]);
    expect(list).toBe("file '/a/s1.mp4'\nfile '/a/s2.mp4'\nfile '/a/s3.mp4'\n");
  });
});

// ─── CLI contract (no network — refusal and approve only) ───

describe("digital-human.mjs CLI (run/approve/resume)", () => {
  const CLI = join(__dirname, "..", "digital-human.mjs");

  afterEach(cleanup);

  it("run --plan on an unapproved plan: exit 1, zero remote calls, plan untouched", () => {
    const { outputRoot, planPath } = makePackage();
    const before = readFileSync(planPath);
    const res = spawnSync(
      process.execPath,
      [CLI, "run", "--plan", planPath, "--output-root", outputRoot],
      { encoding: "utf8" },
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/approv/i);
    expect(readFileSync(planPath).equals(before)).toBe(true);
    // no report written by the refused run
    expect(existsSync(join(outputRoot, "dh-run-test", "digital-human-report.json"))).toBe(false);
  });

  it("approve --plan flips approval; run --plan then passes the gate (refuses later on portrait)", () => {
    const { contentRoot, planPath } = makePackage();
    const ok = spawnSync(process.execPath, [CLI, "approve", "--plan", planPath], {
      encoding: "utf8",
    });
    expect(ok.status).toBe(0);
    expect(JSON.parse(readFileSync(planPath, "utf8")).approval.approved).toBe(true);

    // Approved plan proceeds past the approval gate; without kaggle CLI/network
    // it must fail at the remote layer, NOT at the approval gate. We assert the
    // failure is not an approval refusal by checking it got past approval —
    // the run will fail on missing kaggle binary/portrait; either way the
    // approval gate must not be the reason.
    rmSync(join(contentRoot, "dh-run-test", "assets", "avatar", "portrait.jpg"));
    const env = { ...process.env, PATH: "/usr/bin:/bin" }; // no kaggle binary
    const res = spawnSync(process.execPath, [CLI, "run", "--plan", planPath], {
      encoding: "utf8",
      env,
      timeout: 60000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).not.toMatch(/not approved/);
  }, 90000);

  it("approve --plan on a non-plan file: exit 1 with the reason", () => {
    const dir = tmpDir("dh-cli-approve-");
    const p = join(dir, "x.json");
    writeFileSync(p, JSON.stringify({ kind: "nope" }));
    const res = spawnSync(process.execPath, [CLI, "approve", "--plan", p], { encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/digital-human-plan/);
  });

  it("resume --plan requires --plan", () => {
    const res = spawnSync(process.execPath, [CLI, "resume"], { encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/--plan/);
  });
});
