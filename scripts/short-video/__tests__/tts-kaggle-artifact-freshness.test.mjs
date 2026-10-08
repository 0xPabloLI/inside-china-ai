/**
 * #420 — Kaggle artifact freshness & run identity.
 *
 * The 2026-09-29 incident: `kaggle kernels output` reused a persistent target
 * directory; when a more recent local copy existed the CLI skipped the file, so
 * a kernel COMPLETE + "successful" download still handed the pipeline the
 * PREVIOUS run's audio (scene 9 kept the old 36Kr line) and the Quality Gate
 * self-heal loop re-downloaded the same stale take forever.
 *
 * Behaviour under test:
 *  - every generate() call downloads into its own per-call staging directory,
 *    so the CLI skip condition cannot trigger on a previous run's artifacts;
 *  - the kernel summary echoes the run identity embedded in the pushed script,
 *    and only a summary bound to THIS run's identity is accepted;
 *  - every requested scene must be covered, and every successful scene must
 *    have a complete wav BEFORE anything is promoted into the audio dir;
 *  - download failures, missing files, empty files and foreign/stale summaries
 *    all fail closed without touching existing audio;
 *  - the shared legacy `.kaggle-kernel/kaggle-output` directory is never used
 *    or cleaned as routine self-heal.
 *
 * The injected exec seam emulates the Kaggle CLI — including its "Skipping,
 * found more recently modified local copy" behaviour — with no real Kaggle
 * calls and no GPU.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  assertCompleteKernelWav,
  buildRunRequestId,
  createCosyVoice3KaggleCudaEngine,
  verifyKaggleRunSummary,
} from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";
import { truncatedWavBytes, wavBytes } from "./fixtures/wav-fixture.mjs";

// ── helpers ────────────────────────────────────────────────────────────────

const SCENES = [
  { id: 1, voiceover: "Hook line about a world model.", visualType: "hook" },
  { id: 2, voiceover: "Narrative body with 14 billion parameters.", visualType: "narrative" },
  { id: 3, voiceover: "It hit 720p at 60 frames per second.", visualType: "data" },
];

/**
 * Emulates the Kaggle CLI + kernel:
 *  - `kernels push` reads the generated kernel script and records the run
 *    identity the pushed kernel would echo (requestId + per-scene wav bytes);
 *  - `kernels output` reproduces the CLI's skip behaviour: when the target
 *    directory already holds a summary.json it downloads NOTHING (the exact
 *    mechanism behind #420).
 *
 * @param {object} [opts]
 * @param {(entry: object) => object} [opts.sceneResults] - per-scene result
 *   shaping: `{ error }` (inference failure), `{ dropFile }` (summary says
 *   success but the file is missing), `{ emptyFile }` (0-byte file),
 *   `{ omit }` (scene missing from the summary entirely).
 * @param {string} [opts.forceSummaryRequestId] - write a foreign requestId
 *   into the summary regardless of what the pushed script carried.
 */
function makeKaggleCliMock({ sceneResults, forceSummaryRequestId } = {}) {
  const commands = [];
  const pushes = [];
  const downloads = [];
  const remote = new Map(); // kernelId -> Map<filename, Buffer>
  return {
    commands,
    pushes,
    downloads,
    exec: async (cmd) => {
      commands.push(cmd);
      if (cmd.startsWith("kaggle --version")) return { stdout: "Kaggle CLI 2.2.4" };
      if (cmd.startsWith("kaggle kernels push")) {
        const dir = cmd.match(/-p "([^"]+)"/)[1];
        const meta = JSON.parse(readFileSync(join(dir, "kernel-metadata.json"), "utf8"));
        const script = readFileSync(join(dir, meta.code_file), "utf8");
        const requestId = (script.match(/REQUEST_ID = r'''(.*?)'''/s) || [])[1] ?? null;
        const manifestLine = script.split("\n").find((l) => l.startsWith("MANIFEST_JSON"));
        const manifest = JSON.parse(manifestLine.match(/r'''(.*)'''/)[1]);
        pushes.push({ kernelId: meta.id, requestId, manifest });

        const marker = `run-${requestId ?? "legacy"}`;
        const files = new Map();
        const segments = [];
        for (const m of manifest) {
          const shaped = sceneResults ? sceneResults(m) : {};
          if (shaped.omit) continue;
          if (shaped.error) {
            segments.push({ sceneId: m.sceneId, error: shaped.error });
            continue;
          }
          if (shaped.dropFile) {
            segments.push({ sceneId: m.sceneId, output: m.output, audioDuration: 3.0 });
            continue;
          }
          if (shaped.emptyFile) {
            files.set(m.output, Buffer.alloc(0));
          } else if (shaped.truncated) {
            // The partial-download shape (#394 class): the header declares the
            // full take, only `keptBytes` actually arrived.
            files.set(
              m.output,
              truncatedWavBytes(shaped.truncated.declaredBytes, shaped.truncated.keptBytes),
            );
          } else {
            files.set(m.output, wavBytes(`${marker}-scene-${m.sceneId}`));
          }
          segments.push({ sceneId: m.sceneId, output: m.output, audioDuration: 3.0 });
        }
        const summary = { engine: "CosyVoice3-Kaggle-CUDA", segments };
        if (forceSummaryRequestId) summary.requestId = forceSummaryRequestId;
        else if (requestId) summary.requestId = requestId;
        files.set("summary.json", Buffer.from(JSON.stringify(summary, null, 2)));
        remote.set(meta.id, files);
        return { stdout: "" };
      }
      if (cmd.startsWith("kaggle kernels output")) {
        const dir = cmd.match(/-p "([^"]+)"/)[1];
        const kernelId = cmd.match(/kernels output (\S+)/)[1];
        downloads.push({ dir, kernelId, cmd });
        // Real CLI semantics: a local copy blocks the download.
        if (existsSync(join(dir, "output", "summary.json"))) {
          return { stdout: "Skipping, found more recently modified local copy" };
        }
        const files = remote.get(kernelId);
        if (!files) throw new Error(`mock: no remote output registered for ${kernelId}`);
        mkdirSync(join(dir, "output"), { recursive: true });
        for (const [name, bytes] of files) writeFileSync(join(dir, "output", name), bytes);
        return { stdout: "" };
      }
      return { stdout: "" };
    },
  };
}

const tempDirs = [];
function makeOutDir(label) {
  const dir = join(tmpdir(), `tts-kaggle-freshness-${label}-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

async function makeEngine(mock, { postProcess } = {}) {
  process.env.COSYVOICE3_KAGGLE_USER = "test-kaggle-user";
  return createCosyVoice3KaggleCudaEngine({
    exec: mock.exec,
    poll: async () => ({ queuedMs: 0, runningMs: 0 }),
    postProcess: postProcess ?? (async () => 3.0),
  });
}

function promotedBytes(outDir, sceneId = 1) {
  return readFileSync(join(outDir, `scene-${sceneId}.wav`), "utf8");
}

function downloadTargets(mock) {
  return mock.downloads.map((d) => d.dir);
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("#420 — reruns never promote the previous run's audio", () => {
  it("changed text on rerun: downloads fresh artifacts and promotes THIS run's bytes", async () => {
    const outDir = makeOutDir("changed-text");
    const mock = makeKaggleCliMock();
    const engine = await makeEngine(mock);

    await engine.generate(SCENES, outDir);
    const firstBytes = promotedBytes(outDir);
    const firstRunId = mock.pushes.at(-1).requestId;

    const rewritten = SCENES.map((s) =>
      s.id === 3 ? { ...s, voiceover: "Completely rewritten line without 36Kr." } : s,
    );
    await engine.generate(rewritten, outDir);
    const secondBytes = promotedBytes(outDir);
    const secondRunId = mock.pushes.at(-1).requestId;

    expect(secondRunId).not.toBe(firstRunId);
    // Placeholder replacement really happened (#420): "<manifest-digest>-<uuid>".
    expect(secondRunId).toMatch(/^[0-9a-f]{16}-[0-9a-f-]{36}$/);
    expect(firstBytes).toContain(`run-${firstRunId}-scene-1`);
    expect(secondBytes).toContain(`run-${secondRunId}-scene-1`);
    expect(secondBytes).not.toBe(firstBytes);

    // Every call gets its own staging dir, and the legacy shared download dir
    // is never used as the download target.
    const targets = downloadTargets(mock);
    expect(targets).toHaveLength(2);
    expect(targets[0]).not.toBe(targets[1]);
    expect(targets.some((d) => d.endsWith(join(".kaggle-kernel", "kaggle-output")))).toBe(false);
    expect(
      mock.commands
        .filter((c) => c.includes("kaggle kernels output"))
        .every((c) => c.includes("--force")),
    ).toBe(true);
  });

  it("single-scene reroll with identical text still gets that run's take (freshness per call)", async () => {
    const outDir = makeOutDir("reroll-same-text");
    const mock = makeKaggleCliMock();
    const engine = await makeEngine(mock);
    const scene9 = [{ id: 9, voiceover: "Same words, new take.", visualType: "narrative" }];

    await engine.generate(scene9, outDir);
    const firstBytes = promotedBytes(outDir, 9);
    await engine.generate(scene9, outDir);
    const secondBytes = promotedBytes(outDir, 9);

    const firstRunId = mock.pushes.at(-2).requestId;
    const secondRunId = mock.pushes.at(-1).requestId;
    expect(secondRunId).not.toBe(firstRunId);
    expect(firstBytes).toContain(`run-${firstRunId}-scene-9`);
    expect(secondBytes).toContain(`run-${secondRunId}-scene-9`);
  });
});

describe("#420 — foreign or stale summaries fail closed", () => {
  it("rejects a summary whose requestId does not belong to this run, promoting nothing", async () => {
    const outDir = makeOutDir("foreign-id");
    const mock = makeKaggleCliMock({ forceSummaryRequestId: "stale-previous-run" });
    const postProcessCalls = [];
    const engine = await makeEngine(mock, {
      postProcess: async (p) => {
        postProcessCalls.push(p);
        return 3.0;
      },
    });

    await expect(engine.generate(SCENES, outDir)).rejects.toThrow(/requestId|stale|belong/i);
    expect(postProcessCalls).toHaveLength(0);
    expect(existsSync(join(outDir, "scene-1.wav"))).toBe(false);
    expect(existsSync(join(outDir, "scene-2.wav"))).toBe(false);
    expect(existsSync(join(outDir, "scene-3.wav"))).toBe(false);
  });

  it("leaves already-approved audio untouched when the summary is foreign (same-slug interference)", async () => {
    const outDir = makeOutDir("existing-audio-foreign");
    const approvedBytes = wavBytes("APPROVED-PREVIOUS-TAKE");
    writeFileSync(join(outDir, "scene-1.wav"), approvedBytes);
    const mock = makeKaggleCliMock({ forceSummaryRequestId: "some-other-runs-kernel-build" });
    const engine = await makeEngine(mock);

    await expect(engine.generate(SCENES, outDir)).rejects.toThrow(/requestId|belong|stale/i);
    // The existing approved take is byte-identical — no partial overwrite.
    expect(readFileSync(join(outDir, "scene-1.wav")).equals(approvedBytes)).toBe(true);
    expect(existsSync(join(outDir, "scene-2.wav"))).toBe(false);
  });

  it("keeps the shared legacy kaggle-output dir untouched and still promotes correct bytes", async () => {
    const outDir = makeOutDir("legacy-untouched");
    const mock = makeKaggleCliMock();
    const engine = await makeEngine(mock);

    // A stale summary + stale wav left in the legacy shared dir (what the 2026-09
    // recovery deleted by hand before every run).
    const legacyDir = join(outDir, ".kaggle-kernel", "kaggle-output", "output");
    mkdirSync(legacyDir, { recursive: true });
    const staleSummary = join(legacyDir, "summary.json");
    writeFileSync(
      staleSummary,
      JSON.stringify({
        segments: [
          { sceneId: 1, output: "scene-1.wav", audioDuration: 3.0 },
          { sceneId: 2, output: "scene-2.wav", audioDuration: 3.0 },
          { sceneId: 3, output: "scene-3.wav", audioDuration: 3.0 },
        ],
      }),
    );
    writeFileSync(join(legacyDir, "scene-1.wav"), wavBytes("STALE-LEGACY-AUDIO"));

    await engine.generate(SCENES, outDir);
    const runId = mock.pushes.at(-1).requestId;

    expect(promotedBytes(outDir, 1)).toContain(`run-${runId}-scene-1`);
    expect(promotedBytes(outDir, 1)).not.toContain("STALE-LEGACY-AUDIO");
    // The shared dir is evidence, not scratch space: never cleaned as self-heal.
    expect(readFileSync(staleSummary, "utf8")).toBe(
      JSON.stringify({
        segments: [
          { sceneId: 1, output: "scene-1.wav", audioDuration: 3.0 },
          { sceneId: 2, output: "scene-2.wav", audioDuration: 3.0 },
          { sceneId: 3, output: "scene-3.wav", audioDuration: 3.0 },
        ],
      }),
    );
    expect(readFileSync(join(legacyDir, "scene-1.wav"), "utf8")).toContain("STALE-LEGACY-AUDIO");
  });
});

describe("#420 — incomplete artifacts fail closed before promotion", () => {
  it("rejects when a successful scene's file is missing, promoting nothing", async () => {
    const outDir = makeOutDir("missing-file");
    const mock = makeKaggleCliMock({
      sceneResults: (m) => (m.sceneId === 2 ? { dropFile: true } : {}),
    });
    const postProcessCalls = [];
    const engine = await makeEngine(mock, {
      postProcess: async (p) => {
        postProcessCalls.push(p);
        return 3.0;
      },
    });

    await expect(engine.generate(SCENES, outDir)).rejects.toThrow(/missing|incomplete/i);
    expect(postProcessCalls).toHaveLength(0);
    expect(existsSync(join(outDir, "scene-1.wav"))).toBe(false);
    expect(existsSync(join(outDir, "scene-3.wav"))).toBe(false);
  });

  it("rejects an empty (0-byte) downloaded wav instead of promoting garbage", async () => {
    const outDir = makeOutDir("empty-file");
    const mock = makeKaggleCliMock({
      sceneResults: (m) => (m.sceneId === 1 ? { emptyFile: true } : {}),
    });
    const engine = await makeEngine(mock);

    await expect(engine.generate(SCENES, outDir)).rejects.toThrow(
      /missing|incomplete|invalid|empty/i,
    );
    expect(existsSync(join(outDir, "scene-1.wav"))).toBe(false);
    expect(existsSync(join(outDir, "scene-2.wav"))).toBe(false);
  });

  it("rejects a summary that does not cover every requested scene", async () => {
    const outDir = makeOutDir("summary-coverage");
    const mock = makeKaggleCliMock({
      sceneResults: (m) => (m.sceneId === 2 ? { omit: true } : {}),
    });
    const engine = await makeEngine(mock);

    await expect(engine.generate(SCENES, outDir)).rejects.toThrow(/missing|cover|incomplete/i);
    expect(existsSync(join(outDir, "scene-1.wav"))).toBe(false);
  });

  it("rejects a truncated download (header declares more audio than arrived)", async () => {
    const outDir = makeOutDir("truncated-file");
    const mock = makeKaggleCliMock({
      sceneResults: (m) =>
        m.sceneId === 3 ? { truncated: { declaredBytes: 240000, keptBytes: 456 } } : {},
    });
    const postProcessCalls = [];
    const engine = await makeEngine(mock, {
      postProcess: async (p) => {
        postProcessCalls.push(p);
        return 3.0;
      },
    });

    await expect(engine.generate(SCENES, outDir)).rejects.toThrow(/truncated|partial/i);
    expect(postProcessCalls).toHaveLength(0);
    expect(existsSync(join(outDir, "scene-1.wav"))).toBe(false);
    expect(existsSync(join(outDir, "scene-3.wav"))).toBe(false);
  });

  it("propagates a non-zero download exit as a failed run (no partial promotion)", async () => {
    const outDir = makeOutDir("download-exit");
    const mock = makeKaggleCliMock();
    const failingExec = async (cmd) => {
      if (cmd.includes("kaggle kernels output")) {
        const e = new Error("Command failed: network reset");
        e.stdout = "";
        throw e;
      }
      return mock.exec(cmd);
    };
    process.env.COSYVOICE3_KAGGLE_USER = "test-kaggle-user";
    const engine = await createCosyVoice3KaggleCudaEngine({
      exec: failingExec,
      poll: async () => ({ queuedMs: 0, runningMs: 0 }),
      postProcess: async () => 3.0,
    });

    await expect(engine.generate(SCENES, outDir)).rejects.toThrow(/Failed to download/i);
    expect(existsSync(join(outDir, "scene-1.wav"))).toBe(false);
  });
});

describe("#420 — inference failures keep the reroll contract", () => {
  it("failed segments stay excluded, successful scenes promote, run resolves", async () => {
    const outDir = makeOutDir("partial-inference");
    const mock = makeKaggleCliMock({
      sceneResults: (m) => (m.sceneId === 2 ? { error: "synthesis blew up" } : {}),
    });
    const engine = await makeEngine(mock);

    const results = await engine.generate(SCENES, outDir);
    expect(results.map((r) => r.sceneId)).toEqual([1, 3]);
    expect(existsSync(join(outDir, "scene-2.wav"))).toBe(false);
    expect(promotedBytes(outDir, 1)).toContain("scene-1");
  });
});

describe("#420 — concurrent runs keep their own staging", () => {
  it("two concurrent runs use distinct staging dirs and each promotes its own bytes", async () => {
    const outDirA = makeOutDir("concurrent-a");
    const outDirB = makeOutDir("concurrent-b");
    const mock = makeKaggleCliMock();
    const engine = await makeEngine(mock);

    const scenesA = [{ id: 1, voiceover: "Alpha line.", visualType: "narrative" }];
    const scenesB = [{ id: 1, voiceover: "Beta line.", visualType: "narrative" }];
    const [resA, resB] = await Promise.all([
      engine.generate(scenesA, outDirA),
      engine.generate(scenesB, outDirB),
    ]);

    expect(resA).toHaveLength(1);
    expect(resB).toHaveLength(1);
    const runIdA = mock.pushes.find((p) => p.manifest[0].text.includes("Alpha")).requestId;
    const runIdB = mock.pushes.find((p) => p.manifest[0].text.includes("Beta")).requestId;
    expect(promotedBytes(outDirA)).toContain(`run-${runIdA}-scene-1`);
    expect(promotedBytes(outDirB)).toContain(`run-${runIdB}-scene-1`);

    const targets = downloadTargets(mock);
    expect(new Set(targets).size).toBe(2);
  });
});

describe("#420 — verifyKaggleRunSummary contract", () => {
  const REQUEST_ID = "abcd1234-0000-0000-0000-000000000001";
  const scenes = [{ id: 1 }, { id: 2 }];
  const validSummary = () => ({
    requestId: REQUEST_ID,
    segments: [
      { sceneId: 1, output: "scene-1.wav" },
      { sceneId: 2, output: "scene-2.wav" },
    ],
  });

  it("accepts a summary bound to this run with full coverage", () => {
    expect(verifyKaggleRunSummary(validSummary(), { requestId: REQUEST_ID, scenes })).toBeTruthy();
  });

  it("rejects a summary with a different or missing requestId", () => {
    expect(() =>
      verifyKaggleRunSummary(
        { ...validSummary(), requestId: "old-run" },
        { requestId: REQUEST_ID, scenes },
      ),
    ).toThrow(/does not belong|requestId/);
    const { requestId: _omitted, ...noId } = validSummary();
    expect(() => verifyKaggleRunSummary(noId, { requestId: REQUEST_ID, scenes })).toThrow(
      /requestId/,
    );
  });

  it("rejects duplicate, extra and missing scene entries", () => {
    expect(() =>
      verifyKaggleRunSummary(
        {
          requestId: REQUEST_ID,
          segments: [validSummary().segments[0], validSummary().segments[0]],
        },
        { requestId: REQUEST_ID, scenes },
      ),
    ).toThrow(/twice|missing/);
    expect(() =>
      verifyKaggleRunSummary(
        {
          requestId: REQUEST_ID,
          segments: [...validSummary().segments, { sceneId: 99, output: "scene-99.wav" }],
        },
        { requestId: REQUEST_ID, scenes },
      ),
    ).toThrow(/not requested/);
    expect(() =>
      verifyKaggleRunSummary(
        { requestId: REQUEST_ID, segments: [validSummary().segments[0]] },
        { requestId: REQUEST_ID, scenes },
      ),
    ).toThrow(/missing/);
  });

  it("rejects an output name that does not match its scene", () => {
    expect(() =>
      verifyKaggleRunSummary(
        {
          requestId: REQUEST_ID,
          segments: [validSummary().segments[0], { sceneId: 2, output: "scene-1.wav" }],
        },
        { requestId: REQUEST_ID, scenes },
      ),
    ).toThrow(/expected "scene-2.wav"/);
  });

  it("accepts failed segments (error) so the reroll path still works", () => {
    expect(
      verifyKaggleRunSummary(
        {
          requestId: REQUEST_ID,
          segments: [{ sceneId: 1, error: "boom" }, validSummary().segments[1]],
        },
        { requestId: REQUEST_ID, scenes },
      ),
    ).toBeTruthy();
  });
});

describe("#420 — buildRunRequestId binds manifest + call", () => {
  it("changes with the manifest, with the call, and is stable for the same inputs", () => {
    const a1 = buildRunRequestId('{"manifest":1}', { uuid: "u-1" });
    const a2 = buildRunRequestId('{"manifest":1}', { uuid: "u-2" });
    const b1 = buildRunRequestId('{"manifest":2}', { uuid: "u-1" });
    expect(a1).not.toBe(a2);
    expect(a1).not.toBe(b1);
    expect(a1).toBe(buildRunRequestId('{"manifest":1}', { uuid: "u-1" }));
  });
});

describe("#420 — assertCompleteKernelWav", () => {
  it("accepts a complete wav and rejects missing/truncated/invalid files", () => {
    const dir = makeOutDir("wav-check");
    const okPath = join(dir, "scene-1.wav");
    writeFileSync(okPath, wavBytes("ok"));
    expect(assertCompleteKernelWav(okPath, 1)).toBe(okPath);

    expect(() => assertCompleteKernelWav(join(dir, "scene-2.wav"), 2)).toThrow(/missing/);

    const emptyPath = join(dir, "scene-3.wav");
    writeFileSync(emptyPath, Buffer.alloc(0));
    expect(() => assertCompleteKernelWav(emptyPath, 3)).toThrow(/incomplete/);

    const junkPath = join(dir, "scene-4.wav");
    writeFileSync(junkPath, Buffer.alloc(200, 0x41));
    expect(() => assertCompleteKernelWav(junkPath, 4)).toThrow(/RIFF\/WAVE/);

    // Partial download: header declares a full take, only 456 bytes arrived.
    const truncatedPath = join(dir, "scene-5.wav");
    writeFileSync(truncatedPath, truncatedWavBytes(240000, 456));
    expect(() => assertCompleteKernelWav(truncatedPath, 5)).toThrow(/truncated|partial/);

    // Header-only file with no data chunk at all.
    const noDataPath = join(dir, "scene-6.wav");
    const noData = wavBytes("x");
    noData.write("junk", 36, "ascii"); // rename the data chunk id
    writeFileSync(noDataPath, noData);
    expect(() => assertCompleteKernelWav(noDataPath, 6)).toThrow(/no non-empty data chunk/);

    // A declared-but-empty data chunk is a silent take, not a promotable one.
    const zeroDataPath = join(dir, "scene-7.wav");
    const zeroData = wavBytes("x");
    zeroData.writeUInt32LE(0, 40);
    writeFileSync(zeroDataPath, zeroData);
    expect(() => assertCompleteKernelWav(zeroDataPath, 7)).toThrow(/no non-empty data chunk/);
  });
});

describe("#420 — generated kernel script stays valid Python (cross-process contract)", () => {
  const hasPython3 = (() => {
    try {
      execFileSync("python3", ["--version"], { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasPython3)(
    "the substituted kernel script (manifest + request id) compiles with py_compile",
    async () => {
      const outDir = makeOutDir("py-compile");
      const mock = makeKaggleCliMock();
      const engine = await makeEngine(mock);
      await engine.generate(SCENES, outDir);

      const scriptPath = join(outDir, ".kaggle-kernel", "cosyvoice3_cuda_kernel.py");
      const script = readFileSync(scriptPath, "utf8");
      // No unsubstituted placeholders may survive into the pushed script.
      expect(script).not.toContain("__MANIFEST_JSON__");
      expect(script).not.toContain("__REQUEST_ID__");
      execFileSync("python3", ["-m", "py_compile", scriptPath], { stdio: "pipe" });
    },
  );
});
