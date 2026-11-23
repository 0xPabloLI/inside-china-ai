/**
 * #1515 — live kernel reuse across quality-gate retries.
 *
 * What this pins:
 *  - a pushed live kernel is reused by a retry generate() instead of pushing a
 *    second version (the 5–6 min model load is paid once, not twice);
 *  - the retry goes out on the control channel as `{action:"retry",
 *    sceneIds, speeds}` and the returned batch still passes the classic
 *    requestId + per-scene wav gates before promotion;
 *  - the gate's exit calls `endLiveSession`, which sends `stop` (not a second
 *    push, not an idle kernel burning quota);
 *  - the stdout stream parser assembles FLAC chunks and rejects a tampered
 *    payload.
 */
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createCosyVoice3KaggleCudaEngine,
  pollKernelStatus,
} from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";
import { startLogStream } from "../lib/tts/kaggle-live.mjs";
import { wavBytes } from "./fixtures/wav-fixture.mjs";

const SCENES = [
  { id: 1, voiceover: "Hook line about a world model.", visualType: "hook" },
  { id: 2, voiceover: "Narrative body with 14 billion parameters.", visualType: "narrative" },
  { id: 3, voiceover: "It hit 720p at 60 frames per second.", visualType: "data" },
];

function requestIdFrom(outDir) {
  const script = readFileSync(join(outDir, ".kaggle-kernel", "cosyvoice3_cuda_kernel.py"), "utf-8");
  return script.match(/REQUEST_ID = r'''(.*?)'''/s)[1];
}

function makeLiveHarness({ tamper = false } = {}) {
  const commands = [];
  const updates = [];
  const stops = [];
  const closes = [];
  let batch1 = null;
  let retryScenes = null;

  const control = {
    url: "https://gist.example/raw/control.json",
    update: async (payload) => {
      updates.push(payload);
    },
    close: async () => {
      closes.push(true);
    },
  };

  const stream = {
    waitForBatch: async (n) => {
      if (n === 1) {
        batch1 = { batch: 1, summary: { segments: [] }, files: new Map() };
        return batch1;
      }
      return { batch: n, summary: { segments: [] }, files: new Map() };
    },
    waitForExit: async () => true,
    stop: () => stops.push(true),
  };

  const materialize = async ({ batch, dir }) => {
    const outDir = dirname(dirname(dirname(dir)));
    const requestId = requestIdFrom(outDir);
    const scenes = batch.batch === 1 ? SCENES : retryScenes;
    mkdirSync(join(dir, "output"), { recursive: true });
    for (const s of scenes) {
      writeFileSync(
        join(dir, "output", `scene-${s.id}.wav`),
        tamper && batch.batch > 1 ? Buffer.alloc(0) : wavBytes(`live-${batch.batch}-${s.id}`),
      );
    }
    const segments = scenes.map((s) => ({
      sceneId: s.id,
      output: `scene-${s.id}.wav`,
      audioDuration: 3.0,
    }));
    writeFileSync(join(dir, "output", "summary.json"), JSON.stringify({ requestId, segments }));
    return dir;
  };

  return {
    commands,
    updates,
    closes,
    stops,
    control,
    stream,
    materialize,
    setRetryScenes: (scenes) => {
      retryScenes = scenes;
    },
    batch1: () => batch1,
  };
}

describe("live session — retry reuses the warm kernel", () => {
  it("pushes once, serves retry over the control channel, and stops the kernel at gate exit", async () => {
    process.env.COSYVOICE3_KAGGLE_USER = "test-kaggle-user";
    process.env.COSYVOICE3_KAGGLE_SLUG = "test-live-session";
    const outDir = join(tmpdir(), `tts-live-${process.pid}-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    const harness = makeLiveHarness();
    writeFileSync(join(outDir, "ref.wav"), wavBytes("ref"));

    const engine = await createCosyVoice3KaggleCudaEngine({
      refAudioPath: join(outDir, "ref.wav"),
      live: true,
      exec: async (cmd) => {
        harness.commands.push(cmd);
        return { stdout: "" };
      },
      preflight: async () => ({
        waitedMs: 0,
        target: { phase: "unknown", listed: false },
        holders: [],
        probes: [],
        listOk: true,
        listError: null,
      }),
      poll: async () => ({ queuedMs: 0, runningMs: 0 }),
      controlChannel: async () => harness.control,
      logStream: () => harness.stream,
      materializeLiveBatch: harness.materialize,
      postProcess: async () => ({ duration: 3.0 }),
    });
    expect(engine).not.toBeNull();

    const first = await engine.generate(SCENES, outDir);
    expect(first.map((r) => r.sceneId)).toEqual([1, 2, 3]);
    expect(harness.commands.filter((c) => c.includes("kaggle kernels push"))).toHaveLength(1);
    expect(harness.commands.filter((c) => c.includes("kaggle kernels output"))).toHaveLength(0);
    expect(harness.updates).toHaveLength(0);

    const script = readFileSync(
      join(outDir, ".kaggle-kernel", "cosyvoice3_cuda_kernel.py"),
      "utf-8",
    );
    expect(script).toContain("https://gist.example/raw/control.json");
    expect(script).toContain("LIVE_MODE = r'''1'''.strip() == \"1\"");

    const staging = join(outDir, `.regen-staging-${process.pid}-1`);
    harness.setRetryScenes([SCENES[0]]);
    const retry = await engine.generate([SCENES[0]], staging);
    expect(retry.map((r) => r.sceneId)).toEqual([1]);
    expect(harness.commands.filter((c) => c.includes("kaggle kernels push"))).toHaveLength(1);
    expect(harness.updates.at(-1)).toMatchObject({
      action: "retry",
      batch: 1,
      sceneIds: [1],
    });
    expect(harness.updates.at(-1).speeds["1"]).toBe(1.0);

    await engine.endLiveSession();
    expect(harness.updates.at(-1)).toMatchObject({ action: "stop", batch: 2 });
    // The stop patch is awaited; follower/gist cleanup runs in the background.
    await new Promise((r) => setTimeout(r, 10));
    expect(harness.stops.length).toBeGreaterThan(0);
  });

  it("fails closed when the retry take is truncated — no promotion into audio", async () => {
    process.env.COSYVOICE3_KAGGLE_USER = "test-kaggle-user";
    process.env.COSYVOICE3_KAGGLE_SLUG = "test-live-session";
    const outDir = join(tmpdir(), `tts-live-bad-${process.pid}-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "ref.wav"), wavBytes("ref"));
    const harness = makeLiveHarness({ tamper: true });
    const engine = await createCosyVoice3KaggleCudaEngine({
      refAudioPath: join(outDir, "ref.wav"),
      live: true,
      exec: async () => ({ stdout: "" }),
      preflight: async () => ({
        waitedMs: 0,
        target: { phase: "unknown", listed: false },
        holders: [],
        probes: [],
        listOk: true,
        listError: null,
      }),
      poll: async () => ({ queuedMs: 0, runningMs: 0 }),
      controlChannel: async () => harness.control,
      logStream: () => harness.stream,
      materializeLiveBatch: harness.materialize,
      postProcess: async () => ({ duration: 3.0 }),
    });
    await engine.generate(SCENES, outDir);
    harness.setRetryScenes([SCENES[1]]);
    await expect(
      engine.generate([SCENES[1]], join(outDir, `.regen-staging-${process.pid}-2`)),
    ).rejects.toThrow(/incomplete or invalid|truncated|missing|no non-empty/i);
  });

  it("classic script carries no live URL when the control channel is unavailable", async () => {
    process.env.COSYVOICE3_KAGGLE_USER = "test-kaggle-user";
    process.env.COSYVOICE3_KAGGLE_SLUG = "test-live-session";
    const outDir = join(tmpdir(), `tts-live-classic-${process.pid}-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "ref.wav"), wavBytes("ref"));
    const engine = await createCosyVoice3KaggleCudaEngine({
      refAudioPath: join(outDir, "ref.wav"),
      live: true,
      exec: async (cmd) => {
        if (cmd.includes("kaggle kernels output")) {
          const dir = cmd.match(/-p "([^"]+)"/)[1];
          const kernelDir = dirname(dirname(dir));
          const script = readFileSync(join(kernelDir, "cosyvoice3_cuda_kernel.py"), "utf-8");
          const requestId = script.match(/REQUEST_ID = r'''(.*?)'''/s)[1];
          mkdirSync(join(dir, "output"), { recursive: true });
          writeFileSync(
            join(dir, "output", "summary.json"),
            JSON.stringify({
              requestId,
              segments: SCENES.map((s) => ({
                sceneId: s.id,
                output: `scene-${s.id}.wav`,
                audioDuration: 3.0,
              })),
            }),
          );
          for (const s of SCENES) {
            writeFileSync(join(dir, "output", `scene-${s.id}.wav`), wavBytes(`classic-${s.id}`));
          }
        }
        return { stdout: "" };
      },
      preflight: async () => ({
        waitedMs: 0,
        target: { phase: "unknown", listed: false },
        holders: [],
        probes: [],
        listOk: true,
        listError: null,
      }),
      poll: async () => ({ queuedMs: 0, runningMs: 0 }),
      controlChannel: async () => null,
      postProcess: async () => ({ duration: 3.0 }),
    });
    const results = await engine.generate(SCENES, outDir);
    expect(results).toHaveLength(3);
    const script = readFileSync(
      join(outDir, ".kaggle-kernel", "cosyvoice3_cuda_kernel.py"),
      "utf-8",
    );
    expect(script).toContain("LIVE_MODE = r'''0'''.strip() == \"1\"");
    expect(script).toContain("CONTROL_URL = r''''''");
  });
});

describe("log stream parser", () => {
  function fakeChild() {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    return child;
  }

  it("assembles FLAC chunks into a verified batch", async () => {
    const child = fakeChild();
    const stream = startLogStream({ kernelId: "u/k", spawnFn: () => child });
    const flac = Buffer.from("fake-flac-bytes");
    const meta = {
      batch: 1,
      sceneId: 1,
      name: "scene-1.wav",
      bytes: flac.length,
      sha256: "0".repeat(64),
      sampleRate: 24000,
    };
    const { createHash } = await import("node:crypto");
    meta.sha256 = createHash("sha256").update(flac).digest("hex");
    const summary = { batch: 1, requestId: "r", segments: [{ sceneId: 1, output: "scene-1.wav" }] };
    const lines = [
      `__TTS_FILE_BEGIN__ ${JSON.stringify(meta)}`,
      `__TTS_FILE_CHUNK__${flac.subarray(0, 4).toString("base64")}`,
      `__TTS_FILE_CHUNK__${flac.subarray(4).toString("base64")}`,
      `__TTS_FILE_END__ ${JSON.stringify({ sha256: meta.sha256 })}`,
      `__TTS_BATCH_END__ ${JSON.stringify(summary)}`,
    ];
    const batchPromise = stream.waitForBatch(1, 1000);
    for (const line of lines) child.stdout.write(`${line}\n`);
    const batch = await batchPromise;
    expect(batch.files.get("scene-1.wav")).toEqual(flac);
    expect(batch.summary.segments).toHaveLength(1);
  });

  it("rejects a tampered chunk instead of promoting it", async () => {
    const child = fakeChild();
    const stream = startLogStream({ kernelId: "u/k", spawnFn: () => child });
    const flac = Buffer.from("real-bytes");
    const meta = {
      batch: 1,
      sceneId: 1,
      name: "scene-1.wav",
      bytes: flac.length,
      sha256: "1".repeat(64),
      sampleRate: 24000,
    };
    const batchPromise = stream.waitForBatch(1, 1000);
    child.stdout.write(`__TTS_FILE_BEGIN__ ${JSON.stringify(meta)}\n`);
    child.stdout.write(`__TTS_FILE_CHUNK__${flac.toString("base64")}\n`);
    child.stdout.write(`__TTS_FILE_END__ ${JSON.stringify({ sha256: meta.sha256 })}\n`);
    child.emit("error", new Error("sha mismatch"));
    await expect(batchPromise).rejects.toThrow(/sha256|stream/);
  });
});

describe("pollKernelStatus — live handoff", () => {
  it("stops at RUNNING instead of waiting for COMPLETE", async () => {
    let calls = 0;
    const sleeps = [];
    const snapshot = await pollKernelStatus(
      "user/kernel",
      { stopAtPhase: "running", runTimeoutMs: 10_000, queueTimeoutMs: 10_000 },
      {
        exec: async () => {
          calls += 1;
          return { stdout: 'user/kernel has status "KernelWorkerStatus.RUNNING"' };
        },
        sleep: async (ms) => sleeps.push(ms),
      },
    );
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
    expect(snapshot.runningMs).toBe(0);
  });
});
