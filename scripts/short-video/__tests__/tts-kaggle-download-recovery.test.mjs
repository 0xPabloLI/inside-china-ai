/**
 * Tests for the Kaggle output download seam (#581).
 *
 * Behaviour under test:
 *  - `kaggle kernels output` is all-or-nothing at the PROCESS level: one SSL
 *    EOF while streaming the next artifact exits non-zero and voids the takes
 *    that already landed (2026-09-27: 7 of 8 CosyVoice3 wavs were on disk when
 *    the run was discarded). The exit code cannot distinguish "nothing
 *    arrived" from "7 of 8 arrived", so the seam validates what is local and
 *    re-fetches only the remainder per file (`--file-pattern`);
 *  - a half-written file (truncated RIFF or 0 bytes) must be REMOVED, so this
 *    seam's own bookkeeping stops counting it as staged and the completeness
 *    gate never has to re-discover it downstream (the CLI would normally
 *    re-download it: `download_needed()` returns True while the local file is
 *    smaller than the remote);
 *  - recovery is bounded (attempts + backoff) and fail-closed with an explicit
 *    missing-file list; it never relaxes the #420 identity/coverage/integrity
 *    gates, and a scene the kernel itself reported as errored is not required
 *    (the kernel writes no wav for it; the registry's self-heal owns that
 *    scene) — which is why the summary, the artifact that carries those
 *    verdicts, is fetched before the takes.
 *  - recovery is bounded (attempts + backoff) and fail-closed with an explicit
 *    missing-file list; it never relaxes the #420 identity/coverage/integrity
 *    gates, and a scene the kernel itself reported as errored is not required
 *    (the kernel writes no wav for it; the registry's self-heal owns that
 *    scene).
 *
 * All tests use injected seams — no real `kaggle` CLI calls, no GPU.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import {
  assertCompleteKernelWav,
  buildKernelFilePattern,
  createCosyVoice3KaggleCudaEngine,
  downloadKernelOutput,
} from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";
import { truncatedWavBytes, wavBytes } from "./fixtures/wav-fixture.mjs";

/** Every staging dir a test creates — removed even when an assertion fails. */
const tempDirs = [];
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

/** The 2026-09-27 failure shape: the CLI dies mid-transfer with an SSL EOF. */
const SSL_CUT_ERROR = new Error(
  "Command failed: kaggle kernels output u/k -p /tmp/x --force 2>&1\n" +
    "requests.exceptions.SSLError: HTTPSConnectionPool(host='api.kaggle.com', port=443): " +
    "Max retries exceeded with url: /api/v1/kernels/output (Caused by SSLError(" +
    "SSLEOFError(8, 'UNEXPECTED_EOF_WHILE_READING')))",
);

function tempStaging(label) {
  const dir = join(
    tmpdir(),
    `kaggle-recovery-${label}-${process.pid}-${Date.now()}-${Math.random()}`,
  );
  mkdirSync(join(dir, "output"), { recursive: true });
  tempDirs.push(dir);
  return dir;
}

/** Kernel summary shape (kaggle/cosyvoice3_cuda_kernel.py writes it). */
function writeSummary(dir, sceneIds, { errored = [], requestId = "req-1" } = {}) {
  writeFileSync(
    join(dir, "output", "summary.json"),
    JSON.stringify({
      engine: "CosyVoice3-Kaggle-CUDA",
      requestId,
      segments: sceneIds.map((id) =>
        errored.includes(id)
          ? { sceneId: id, error: "boom" }
          : { sceneId: id, output: `scene-${id}.wav` },
      ),
    }),
  );
}

const wavPath = (dir, id) => join(dir, "output", `scene-${id}.wav`);
const readWav = (dir, id) => readFileSync(wavPath(dir, id));

describe("buildKernelFilePattern — anchored against the CLI's re.search semantics", () => {
  it("matches the artifact's relative path, not a neighbouring scene's", () => {
    const re = new RegExp(buildKernelFilePattern(["scene-1.wav"]));
    expect(re.test("output/scene-1.wav")).toBe(true);
    expect(re.test("scene-1.wav")).toBe(true);
    // `scene-1.wav` must never select scene-11.wav's bytes.
    expect(re.test("output/scene-11.wav")).toBe(false);
    expect(re.test("output/scene-1.wav.bak")).toBe(false);
  });

  it("escapes regex metacharacters in file names", () => {
    const re = new RegExp(buildKernelFilePattern(["summary.json"]));
    expect(re.test("output/summary.json")).toBe(true);
    expect(re.test("output/summaryXjson")).toBe(false);
  });
});

describe("#581 — whole-batch download failure recovers per file", () => {
  it("keeps the takes that landed, removes half-files, and fetches only the remainder", async () => {
    const dir = tempStaging("partial");
    // The cut transfer: scene-1 completed, scene-2 never started writing,
    // scene-3 is a truncated RIFF, scene-4 is a 0-byte download.
    writeFileSync(wavPath(dir, 1), wavBytes("scene-1"));
    writeFileSync(wavPath(dir, 3), truncatedWavBytes(40000, 128));
    writeFileSync(wavPath(dir, 4), Buffer.alloc(0));
    writeSummary(dir, [1, 2, 3, 4]);

    const calls = [];
    const fetched = [];
    const runCmd = async (cmd) => {
      calls.push(cmd);
      if (!cmd.includes("--file-pattern")) throw SSL_CUT_ERROR;
      const pattern = cmd.match(/--file-pattern "([^"]+)"/)[1];
      const re = new RegExp(pattern);
      for (const id of [2, 3, 4]) {
        if (re.test(`output/scene-${id}.wav`)) {
          writeFileSync(wavPath(dir, id), wavBytes(`scene-${id}`));
          fetched.push(`output/scene-${id}.wav`);
        }
      }
      return { stdout: "" };
    };
    const sleeps = [];

    const result = await downloadKernelOutput({
      kernelId: "u/k",
      downloadDir: dir,
      expectedScenes: [1, 2, 3, 4],
      runCmd,
      sleep: async (ms) => sleeps.push(ms),
      log: () => {},
    });

    expect(result.batchFailed).toBe(true);
    expect(result.removed).toEqual(["output/scene-3.wav", "output/scene-4.wav"]);
    expect(fetched).toEqual(["output/scene-2.wav", "output/scene-3.wav", "output/scene-4.wav"]);
    expect(result.recovered).toEqual(fetched);
    expect(sleeps).toEqual([2000]); // one bounded retry, first backoff step

    // The intact take that landed before the cut is untouched (no re-download).
    expect(readWav(dir, 1).equals(wavBytes("scene-1"))).toBe(true);
    // Every recovered file satisfies the same completeness gate as promotion.
    for (const id of [1, 2, 3, 4]) {
      expect(() => assertCompleteKernelWav(wavPath(dir, id), id)).not.toThrow();
      expect(readWav(dir, id).equals(wavBytes(`scene-${id}`))).toBe(true);
    }

    // The fetch command asks for exactly the files the batch left behind.
    const fetchCmd = calls.filter((c) => c.includes("--file-pattern")).at(-1);
    const pattern = new RegExp(fetchCmd.match(/--file-pattern "([^"]+)"/)[1]);
    expect(pattern.test("output/scene-1.wav")).toBe(false);
    expect(fetchCmd).toContain("--force");

    rmSync(dir, { recursive: true, force: true });
  });

  it("does not require a wav for a scene the kernel itself reported as errored", async () => {
    const dir = tempStaging("kernel-error");
    writeFileSync(wavPath(dir, 1), wavBytes("scene-1"));
    // Kernel summary: scene 3 failed inside the kernel (no wav exists for it).
    writeSummary(dir, [1, 2, 3], { errored: [3] });

    const patternCmds = [];
    const runCmd = async (cmd) => {
      if (!cmd.includes("--file-pattern")) throw SSL_CUT_ERROR;
      patternCmds.push(cmd);
      const re = new RegExp(cmd.match(/--file-pattern "([^"]+)"/)[1]);
      if (re.test("output/scene-2.wav")) writeFileSync(wavPath(dir, 2), wavBytes("scene-2"));
      return { stdout: "" };
    };

    const result = await downloadKernelOutput({
      kernelId: "u/k",
      downloadDir: dir,
      expectedScenes: [1, 2, 3],
      runCmd,
      sleep: async () => {},
      log: () => {},
    });

    expect(result.recovered).toEqual(["output/scene-2.wav"]);
    const pattern = new RegExp(patternCmds.at(-1).match(/--file-pattern "([^"]+)"/)[1]);
    expect(pattern.test("output/scene-3.wav")).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it("fetches the cut summary first so a kernel-errored scene is never demanded", async () => {
    // The batch was cut before anything landed AND the kernel errored on scene
    // 3 (no wav exists for it upstream). Only the summary knows that, and the
    // kernel writes it last — so it is both the most cut-prone artifact and the
    // one that must arrive first. Fetching summary+takes in one alternation
    // would keep asking for scene-3.wav and fail this legitimate partial batch.
    const dir = tempStaging("summary-first");
    const patternCmds = [];
    const runCmd = async (cmd) => {
      if (!cmd.includes("--file-pattern")) throw SSL_CUT_ERROR;
      patternCmds.push(cmd);
      const re = new RegExp(cmd.match(/--file-pattern "([^"]+)"/)[1]);
      if (re.test("output/summary.json")) writeSummary(dir, [1, 2, 3], { errored: [3] });
      for (const id of [1, 2]) {
        if (re.test(`output/scene-${id}.wav`)) writeFileSync(wavPath(dir, id), wavBytes(`s${id}`));
      }
      return { stdout: "" };
    };

    const result = await downloadKernelOutput({
      kernelId: "u/k",
      downloadDir: dir,
      expectedScenes: [1, 2, 3],
      runCmd,
      sleep: async () => {},
      log: () => {},
    });

    const patternOf = (cmd) => new RegExp(cmd.match(/--file-pattern "([^"]+)"/)[1]);
    expect(patternCmds).toHaveLength(2);
    expect(patternOf(patternCmds[0]).test("output/summary.json")).toBe(true);
    expect(patternOf(patternCmds[0]).test("output/scene-1.wav")).toBe(false);
    expect(patternOf(patternCmds[1]).test("output/scene-3.wav")).toBe(false);
    expect(result.recovered).toEqual([
      "output/summary.json",
      "output/scene-1.wav",
      "output/scene-2.wav",
    ]);
    expect(existsSync(wavPath(dir, 3))).toBe(false);
  });

  it("does not report a take the kernel never produced as 'recovered'", async () => {
    // Real-API shape (2026-10-15 probe): the batch was cut before ANY artifact
    // landed, so the pre-summary required set included scene 1 — but the
    // kernel only produced scenes 2 and 3, and the fetched summary narrows the
    // set to those. Scene 1 was never fetched and must not be listed.
    const dir = tempStaging("narrowed");
    const runCmd = async (cmd) => {
      if (!cmd.includes("--file-pattern")) throw SSL_CUT_ERROR;
      const re = new RegExp(cmd.match(/--file-pattern "([^"]+)"/)[1]);
      if (re.test("output/summary.json")) writeSummary(dir, [2, 3]);
      for (const id of [2, 3]) {
        if (re.test(`output/scene-${id}.wav`)) writeFileSync(wavPath(dir, id), wavBytes(`s${id}`));
      }
      return { stdout: "" };
    };

    const result = await downloadKernelOutput({
      kernelId: "u/k",
      downloadDir: dir,
      expectedScenes: [1, 2, 3],
      runCmd,
      sleep: async () => {},
      log: () => {},
    });

    expect(result.recovered).toEqual([
      "output/summary.json",
      "output/scene-2.wav",
      "output/scene-3.wav",
    ]);
    expect(existsSync(wavPath(dir, 1))).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it("fails closed with an explicit missing list — bounded attempts, growing backoff", async () => {
    const dir = tempStaging("exhausted");
    writeSummary(dir, [1, 2]);
    const calls = [];
    const runCmd = async (cmd) => {
      calls.push(cmd);
      throw SSL_CUT_ERROR;
    };
    const sleeps = [];

    await expect(
      downloadKernelOutput({
        kernelId: "u/k",
        downloadDir: dir,
        expectedScenes: [1, 2],
        runCmd,
        sleep: async (ms) => sleeps.push(ms),
        log: () => {},
      }),
    ).rejects.toThrow(/output\/scene-1\.wav \(not present\), output\/scene-2\.wav \(not present\)/);

    // 1 whole-batch call + 3 bounded per-file attempts, never unbounded.
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([2000, 4000, 8000]);

    // A second run over the same staging dir still reports the original cause.
    await expect(
      downloadKernelOutput({
        kernelId: "u/k",
        downloadDir: dir,
        expectedScenes: [1, 2],
        runCmd: async () => {
          throw SSL_CUT_ERROR;
        },
        sleep: async () => {},
        log: () => {},
      }),
    ).rejects.toThrow(/SSLEOFError/);

    rmSync(dir, { recursive: true, force: true });
  });

  it("names a half-written file as incomplete, not as never-arrived", async () => {
    const dir = tempStaging("corrupt-only");
    writeSummary(dir, [1]);
    writeFileSync(wavPath(dir, 1), truncatedWavBytes(40000, 64));
    // Recovery keeps landing the same truncated copy: the fetch itself is fine.
    const runCmd = async (cmd) => {
      if (!cmd.includes("--file-pattern")) throw SSL_CUT_ERROR;
      writeFileSync(wavPath(dir, 1), truncatedWavBytes(40000, 64));
      return { stdout: "" };
    };

    await expect(
      downloadKernelOutput({
        kernelId: "u/k",
        downloadDir: dir,
        expectedScenes: [1],
        runCmd,
        sleep: async () => {},
        log: () => {},
      }),
    ).rejects.toThrow(/output\/scene-1\.wav \(incomplete\/truncated\)/);

    rmSync(dir, { recursive: true, force: true });
  });

  it("counts a take discarded in two passes once, not twice", async () => {
    const dir = tempStaging("removed-dedupe");
    writeSummary(dir, [1]);
    // Truncated on arrival, and the first recovery round lands another
    // truncated copy: the same file is discarded in the initial salvage pass
    // AND in the pass after round 1. The report must not read as two files.
    writeFileSync(wavPath(dir, 1), truncatedWavBytes(40000, 64));
    let round = 0;
    const runCmd = async (cmd) => {
      if (!cmd.includes("--file-pattern")) throw SSL_CUT_ERROR;
      const re = new RegExp(cmd.match(/--file-pattern "([^"]+)"/)[1]);
      expect(re.test("output/scene-1.wav")).toBe(true);
      round++;
      writeFileSync(
        wavPath(dir, 1),
        round === 1 ? truncatedWavBytes(40000, 64) : wavBytes("scene-1"),
      );
      return { stdout: "" };
    };

    const result = await downloadKernelOutput({
      kernelId: "u/k",
      downloadDir: dir,
      expectedScenes: [1],
      runCmd,
      sleep: async () => {},
      log: () => {},
    });

    expect(round).toBe(2);
    expect(result.removed).toEqual(["output/scene-1.wav"]);
    expect(result.recovered).toEqual(["output/scene-1.wav"]);
  });

  it("fetches a corrupt summary.json back instead of letting the gap surface later", async () => {
    const dir = tempStaging("summary-cut");
    // The cut landed mid-summary: unreadable JSON.
    writeFileSync(join(dir, "output", "summary.json"), '{"requestId": "req-1", "segments": [');
    writeFileSync(wavPath(dir, 1), wavBytes("scene-1"));
    writeFileSync(wavPath(dir, 2), wavBytes("scene-2"));

    const runCmd = async (cmd) => {
      if (!cmd.includes("--file-pattern")) throw SSL_CUT_ERROR;
      const re = new RegExp(cmd.match(/--file-pattern "([^"]+)"/)[1]);
      expect(re.test("output/summary.json")).toBe(true);
      writeSummary(dir, [1, 2]);
      return { stdout: "" };
    };

    const result = await downloadKernelOutput({
      kernelId: "u/k",
      downloadDir: dir,
      expectedScenes: [1, 2],
      runCmd,
      sleep: async () => {},
      log: () => {},
    });

    expect(result.removed).toEqual(["output/summary.json"]);
    expect(result.recovered).toEqual(["output/summary.json"]);
    expect(
      JSON.parse(readFileSync(join(dir, "output", "summary.json"), "utf-8")).segments,
    ).toHaveLength(2);

    rmSync(dir, { recursive: true, force: true });
  });
});

// ── Engine integration: recovery feeds the unchanged #420 gates ──

const SCENES = [
  { id: 1, voiceover: "Hook line about a world model.", visualType: "hook" },
  { id: 2, voiceover: "Narrative body with 14 billion parameters.", visualType: "narrative" },
  { id: 3, voiceover: "It hit 720p at 60 frames per second.", visualType: "data" },
];

/**
 * Exec mock whose whole-batch download is cut by the SSL error after the first
 * take lands; the per-file fetch then answers whatever the pattern asks for.
 * `recovery({ pattern, dir, write })` decides what the fetch actually writes.
 */
function makeCutDownloadExecMock({ summaryRequestId, presentWavs }) {
  const commands = [];
  const exec = async (cmd) => {
    commands.push(cmd);
    if (!cmd.includes("kaggle kernels output")) return { stdout: "" };
    const dir = cmd.match(/-p "([^"]+)"/)[1];
    const kernelDir = dirname(dirname(dir)); // <tempDir>/downloads/<requestId>
    const requestId =
      summaryRequestId ??
      readFileSync(join(kernelDir, "cosyvoice3_cuda_kernel.py"), "utf-8").match(
        /REQUEST_ID = r'''(.*?)'''/s,
      )[1];

    if (!cmd.includes("--file-pattern")) {
      // The cut: scene-1 finished, the connection died on the next artifact.
      mkdirSync(join(dir, "output"), { recursive: true });
      writeFileSync(join(dir, "output", "scene-1.wav"), wavBytes("scene-1"));
      throw SSL_CUT_ERROR;
    }

    const re = new RegExp(cmd.match(/--file-pattern "([^"]+)"/)[1]);
    mkdirSync(join(dir, "output"), { recursive: true });
    if (re.test("output/summary.json")) {
      writeFileSync(
        join(dir, "output", "summary.json"),
        JSON.stringify({
          engine: "CosyVoice3-Kaggle-CUDA",
          requestId,
          segments: SCENES.map((s) => ({
            sceneId: s.id,
            output: `scene-${s.id}.wav`,
            error: null,
          })),
        }),
      );
    }
    for (const id of presentWavs) {
      if (re.test(`output/scene-${id}.wav`)) {
        writeFileSync(join(dir, "output", `scene-${id}.wav`), wavBytes(`scene-${id}`));
      }
    }
    return { stdout: "" };
  };
  return { commands, exec };
}

async function makeEngineProbeDir(label) {
  const dir = join(
    tmpdir(),
    `kaggle-engine-${label}-${process.pid}-${Date.now()}-${Math.random()}`,
  );
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  const refAudio = join(dir, "voice-sample-24k.wav");
  writeFileSync(refAudio, wavBytes("ref"));
  process.env.COSYVOICE3_KAGGLE_USER = "test-kaggle-user";
  return { dir, refAudio };
}

describe("#581 — the cut batch is recovered and the takes are promoted", () => {
  it("promotes every recovered scene, then runs the unchanged identity gate", async () => {
    const { dir: outDir, refAudio } = await makeEngineProbeDir("promote");
    const { commands, exec } = makeCutDownloadExecMock({ presentWavs: [1, 2, 3] });
    const engine = await createCosyVoice3KaggleCudaEngine({
      exec,
      refAudioPath: refAudio,
      poll: async () => ({ queuedMs: 0, runningMs: 0 }),
      postProcess: async () => 3.0,
      sleep: async () => {},
    });
    expect(engine).not.toBeNull();

    const results = await engine.generate(SCENES, outDir);

    expect(results.map((r) => r.sceneId)).toEqual([1, 2, 3]);
    const downloads = commands.filter((c) => c.includes("kaggle kernels output"));
    // The cut batch, then the summary (which decides what is required), then
    // the takes its verdicts ask for — all bounded to one recovery round.
    expect(downloads).toHaveLength(3);
    expect(downloads[1]).toContain("--file-pattern");
    expect(downloads[2]).toContain("--file-pattern");
    for (const s of SCENES) {
      expect(
        readFileSync(join(outDir, `scene-${s.id}.wav`)).equals(wavBytes(`scene-${s.id}`)),
      ).toBe(true);
    }

    rmSync(outDir, { recursive: true, force: true });
  });

  it("still refuses a summary from a foreign run after recovery (#420 gate intact)", async () => {
    const { dir: outDir, refAudio } = await makeEngineProbeDir("stale");
    const { exec } = makeCutDownloadExecMock({
      summaryRequestId: "deadbeefdeadbeef-not-this-run",
      presentWavs: [1, 2, 3],
    });
    const engine = await createCosyVoice3KaggleCudaEngine({
      exec,
      refAudioPath: refAudio,
      poll: async () => ({ queuedMs: 0, runningMs: 0 }),
      postProcess: async () => 3.0,
      sleep: async () => {},
    });

    await expect(engine.generate(SCENES, outDir)).rejects.toThrow(/does not belong to this run/);
    expect(() => readFileSync(join(outDir, "scene-1.wav"))).toThrow();

    rmSync(outDir, { recursive: true, force: true });
  });

  it("cannot be promoted as a complete batch when a take never arrives", async () => {
    const { dir: outDir, refAudio } = await makeEngineProbeDir("incomplete");
    const { exec } = makeCutDownloadExecMock({ presentWavs: [1] }); // scene-2/3 never land
    const engine = await createCosyVoice3KaggleCudaEngine({
      exec,
      refAudioPath: refAudio,
      poll: async () => ({ queuedMs: 0, runningMs: 0 }),
      postProcess: async () => 3.0,
      sleep: async () => {},
    });

    await expect(engine.generate(SCENES, outDir)).rejects.toThrow(
      /output\/scene-2\.wav \(not present\), output\/scene-3\.wav \(not present\)/,
    );
    // Nothing reached the audio dir: a partial recovery is not a batch.
    expect(() => readFileSync(join(outDir, "scene-1.wav"))).toThrow();

    rmSync(outDir, { recursive: true, force: true });
  });
});
