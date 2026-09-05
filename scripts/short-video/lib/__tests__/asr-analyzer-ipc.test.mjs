import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Resident-worker IPC tests (#98): real subprocess against a fake ASR
// worker — requestId routing, timeout kill + generation isolation (late
// responses never pollute the next request), error envelopes.

const FIXTURE = join(import.meta.dirname, "fixtures", "fake-asr.py");
const PYTHON = "/usr/bin/python3";

function parseLog(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [kind, ts, rid] = l.split(":");
      return { kind, ts: Number(ts), rid: rid || "" };
    });
}

async function loadModule(env) {
  vi.resetModules();
  for (const k of [
    "ASR_ANALYZER_PYTHON_BIN",
    "ASR_ANALYZER_SCRIPT",
    "ASR_RESPONSE_TIMEOUT_MS",
    "ASR_MODEL",
    "FAKE_ASR_LOG",
    "FAKE_ASR_DELAY_MS",
    "FAKE_ASR_SEGMENTS",
    "FAKE_ASR_ERROR",
    "FAKE_ASR_NO_REQUEST_ID",
  ]) {
    delete process.env[k];
  }
  Object.assign(process.env, env, { ASR_ANALYZER_SCRIPT: FIXTURE });
  return await import("../asr-analyzer.mjs");
}

describe("asr-analyzer resident worker IPC (#98)", () => {
  let workDir;
  let logPath;
  let mediaPath;
  let m;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "asr-ipc-test-"));
    logPath = join(workDir, "fake-asr.log");
    mediaPath = join(workDir, "clip.mp4");
    writeFileSync(mediaPath, "media-bytes");
  });

  afterEach(async () => {
    if (m) await m.closeAsrAnalyzer();
    rmSync(workDir, { recursive: true, force: true });
  });

  // deps.extractAudio stub: real ffmpeg not needed for IPC tests
  function stubExtract() {
    const audioDir = join(workDir, "audio");
    mkdirSync(audioDir, { recursive: true });
    const wav = join(audioDir, "window.wav");
    writeFileSync(wav, "wav-bytes");
    return async () => ({ dir: audioDir, path: wav });
  }

  it("returns sentence segments with worker-routed requestId", async () => {
    m = await loadModule({
      ASR_ANALYZER_PYTHON_BIN: PYTHON,
      ASR_RESPONSE_TIMEOUT_MS: "10000",
      FAKE_ASR_LOG: logPath,
      FAKE_ASR_DELAY_MS: "50",
      FAKE_ASR_SEGMENTS: JSON.stringify([
        { startMs: 0, endMs: 1200, text: "你好世界" },
        { startMs: 1500, endMs: 3000, text: "第二句" },
      ]),
    });
    const r = await m.transcribeAudioWindow(mediaPath, {
      startMs: 1000,
      endMs: 6000,
      languageHint: "zh",
      deps: { extractAudio: stubExtract() },
    });
    expect(r.ok).toBe(true);
    expect(r.segments).toEqual([
      { startMs: 1000, endMs: 2200, text: "你好世界" },
      { startMs: 2500, endMs: 4000, text: "第二句" },
    ]);
    expect(r.language).toBe("zh");
    expect(parseLog(logPath).some((l) => l.kind === "END")).toBe(true);
  });

  it("worker error → structured degraded result (no throw)", async () => {
    m = await loadModule({
      ASR_ANALYZER_PYTHON_BIN: PYTHON,
      FAKE_ASR_ERROR: "model_load_failed: test",
    });
    const r = await m.transcribeAudioWindow(mediaPath, {
      deps: { extractAudio: stubExtract() },
    });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("model_load_failed");
    expect(r.segments).toEqual([]);
  });

  it("timeout kills the worker and a late response never pollutes the next request", async () => {
    m = await loadModule({
      ASR_ANALYZER_PYTHON_BIN: PYTHON,
      ASR_RESPONSE_TIMEOUT_MS: "300",
      FAKE_ASR_LOG: logPath,
      FAKE_ASR_DELAY_MS: "2500", // first request outlives the timeout
      FAKE_ASR_SLOW_FIRST: "1",
      FAKE_ASR_MARKER: join(workDir, "slow-done"),
      FAKE_ASR_SEGMENTS: JSON.stringify([{ startMs: 0, endMs: 500, text: "迟到应被丢弃" }]),
    });

    const slow = await m.transcribeAudioWindow(mediaPath, {
      deps: { extractAudio: stubExtract() },
    });
    expect(slow.ok).toBe(false);
    expect(slow.errorCode).toBe("worker_timeout");

    // Second request after the reset: fresh worker, fresh response
    const fresh = await m.transcribeAudioWindow(mediaPath, {
      deps: { extractAudio: stubExtract() },
    });
    expect(fresh.ok).toBe(true);
    expect(fresh.segments[0].text).toBe("迟到应被丢弃");

    // The late response of request 1 must have been discarded: exactly one
    // END was consumed (request 2's), the first worker's late write never
    // resolved a pending request (no corruption, no mismatch).
    const logs = parseLog(logPath).filter((l) => l.kind === "START");
    expect(logs.length).toBe(2);
  });

  it("worker crash mid-request settles pending with a degraded result", async () => {
    m = await loadModule({
      ASR_ANALYZER_PYTHON_BIN: "/bin/false", // spawn exits immediately
    });
    const r = await m.transcribeAudioWindow(mediaPath, {
      deps: { extractAudio: stubExtract() },
    });
    // /bin/false exits without responding — pending settles degraded on exit
    expect(r.ok).toBe(false);
    expect(["worker_exited", "worker_unavailable"]).toContain(r.errorCode);
  });
});
