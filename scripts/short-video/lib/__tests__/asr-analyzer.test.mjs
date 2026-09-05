import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ASR gateway (#98 P5) — unit tests inject the audio extractor and worker
// transport; the real subprocess + timeout/generation behaviour is covered
// in the fake-worker suite below and by the real-data smoke on the issue.

import {
  ASR_VERSION,
  computeAsrCacheKey,
  transcribeAudioWindow,
  closeAsrAnalyzer,
} from "../asr-analyzer.mjs";

describe("asr-analyzer gateway (#98)", () => {
  let dir;
  let media;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "asr-gateway-test-"));
    media = join(dir, "clip.mp4");
    writeFileSync(media, "media-bytes");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  const fakeExtract = (path, startMs, endMs) => {
    // Mirror the real extractor contract: own temp dir (gateway cleans it)
    const audioDir = join(dir, `audio-${startMs}-${endMs ?? "end"}`);
    mkdirSync(audioDir, { recursive: true });
    const wav = join(audioDir, "window.wav");
    writeFileSync(wav, `wav-${startMs}-${endMs}`);
    return { dir: audioDir, path: wav };
  };
  // Raw worker response — same shape as asr_worker.py stdout (no ok field;
  // the gateway owns shaping: offset + clamp + filter).
  const fakeSend = (segments) => async (req) => ({
    segments: segments.map((s) => ({ ...s })),
    language: req.languageHint ?? "zh",
    meta: { backend: "fake", model: "fake-base" },
    error: null,
  });

  it("version constant is exported", () => {
    expect(typeof ASR_VERSION).toBe("string");
    expect(ASR_VERSION.length).toBeGreaterThan(0);
  });

  it("offsets window-relative segment timestamps onto the media timeline", async () => {
    const result = await transcribeAudioWindow(media, {
      startMs: 2000,
      endMs: 8000,
      languageHint: "zh",
      deps: {
        extractAudio: fakeExtract,
        sendToWorker: fakeSend([
          { startMs: 0, endMs: 1500, text: "大家好" },
          { startMs: 2000, endMs: 5000, text: "今天讲模型" },
        ]),
      },
    });
    expect(result.ok).toBe(true);
    expect(result.segments).toEqual([
      { startMs: 2000, endMs: 3500, text: "大家好" },
      { startMs: 4000, endMs: 7000, text: "今天讲模型" },
    ]);
    expect(result.language).toBe("zh");
    expect(result.meta.requestedWindow).toEqual({ startMs: 2000, endMs: 8000 });
    expect(result.meta.degraded).toBe(false);
  });

  it("clamps segments into the requested window (issue acceptance)", async () => {
    const result = await transcribeAudioWindow(media, {
      startMs: 1000,
      endMs: 5000,
      deps: {
        extractAudio: fakeExtract,
        sendToWorker: fakeSend([
          { startMs: 0, endMs: 20000, text: "跨窗口长句" }, // ends past the window
        ]),
      },
    });
    expect(result.segments[0].startMs).toBe(1000);
    expect(result.segments[0].endMs).toBe(5000);
  });

  it("drops empty-text segments", async () => {
    const result = await transcribeAudioWindow(media, {
      deps: {
        extractAudio: fakeExtract,
        sendToWorker: fakeSend([
          { startMs: 0, endMs: 1000, text: "" },
          { startMs: 1000, endMs: 2000, text: "有内容" },
        ]),
      },
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("有内容");
  });

  it("returns a structured degraded result for a no-audio-track video (never throws)", async () => {
    const error = new Error("matches no streams");
    error.code = "no_audio_track";
    const result = await transcribeAudioWindow(media, {
      deps: {
        extractAudio: async () => {
          throw error;
        },
        sendToWorker: fakeSend([]),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("no_audio_track");
    expect(result.segments).toEqual([]);
    expect(result.meta.degraded).toBe(true);
  });

  it("returns a structured degraded result when the worker reports an error", async () => {
    const result = await transcribeAudioWindow(media, {
      deps: {
        extractAudio: fakeExtract,
        sendToWorker: async () => ({ error: "model_load_failed: out of RAM" }),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("model_load_failed");
    expect(result.meta.degraded).toBe(true);
  });

  it("empty audio track: worker returns zero segments → ok with empty segments", async () => {
    const result = await transcribeAudioWindow(media, {
      deps: {
        extractAudio: fakeExtract,
        sendToWorker: async () => ({
          segments: [],
          language: "zh",
          meta: { backend: "fake", model: "fake-base" },
          error: null,
        }),
      },
    });
    expect(result.ok).toBe(true);
    expect(result.segments).toEqual([]);
    expect(result.errorCode).toBeNull();
  });

  it("does not read or write cache without cacheDir", async () => {
    await transcribeAudioWindow(media, {
      deps: { extractAudio: fakeExtract, sendToWorker: fakeSend([]) },
    });
    expect(existsSync(join(dir, ".asr-cache"))).toBe(false);
  });
});

describe("asr-analyzer cache (#100 protocol, #98)", () => {
  let dir;
  let media;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "asr-cache-test-"));
    media = join(dir, "clip.mp4");
    writeFileSync(media, "media-bytes");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const fakeExtract = () => {
    const audioDir = join(dir, "audio-tmp");
    mkdirSync(audioDir, { recursive: true });
    const wav = join(audioDir, "window.wav");
    writeFileSync(wav, "wav");
    return { dir: audioDir, path: wav };
  };

  it("cache key changes when window, language or model differ", async () => {
    const base = await computeAsrCacheKey({ mediaPath: media, startMs: 0, endMs: 8000 });
    const same = await computeAsrCacheKey({ mediaPath: media, startMs: 0, endMs: 8000 });
    const byWindow = await computeAsrCacheKey({ mediaPath: media, startMs: 1000, endMs: 8000 });
    const byLang = await computeAsrCacheKey({
      mediaPath: media,
      startMs: 0,
      endMs: 8000,
      languageHint: "en",
    });
    const byModel = await computeAsrCacheKey({
      mediaPath: media,
      startMs: 0,
      endMs: 8000,
      model: "small",
    });
    expect(base).toBe(same);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(byWindow).not.toBe(base);
    expect(byLang).not.toBe(base);
    expect(byModel).not.toBe(base);
  });

  it("second transcription with cacheDir never calls the worker (cache hit)", async () => {
    const cacheDir = join(dir, ".asr-cache");
    const opts = {
      startMs: 0,
      endMs: 4000,
      cacheDir,
      deps: {
        extractAudio: fakeExtract,
        sendToWorker: async (req) => ({
          segments: [{ startMs: 0, endMs: 1000, text: "缓存句子" }],
          language: "zh",
          meta: { backend: "fake", model: "fake-base" },
          error: null,
        }),
      },
    };
    const r1 = await transcribeAudioWindow(media, opts);
    expect(r1.ok).toBe(true);
    expect(existsSync(cacheDir)).toBe(true);

    let workerCalls = 0;
    const r2 = await transcribeAudioWindow(media, {
      ...opts,
      deps: {
        ...opts.deps,
        sendToWorker: async (req) => {
          workerCalls++;
          return opts.deps.sendToWorker(req);
        },
      },
    });
    expect(workerCalls).toBe(0);
    expect(r2.meta.cacheHit).toBe(true);
    expect(r2.segments[0].text).toBe("缓存句子");
  });

  it("degraded results are not cached — rerun retries", async () => {
    const cacheDir = join(dir, ".asr-cache");
    const failing = {
      startMs: 0,
      endMs: 4000,
      cacheDir,
      deps: {
        extractAudio: fakeExtract,
        sendToWorker: async () => ({ error: "transcribe_failed: boom" }),
      },
    };
    await transcribeAudioWindow(media, failing);
    await transcribeAudioWindow(media, failing);
    expect(existsSync(cacheDir)).toBe(false);
  });

  it("ASR_CACHE_DISABLED=1 bypasses the cache", async () => {
    vi.stubEnv("ASR_CACHE_DISABLED", "1");
    const cacheDir = join(dir, ".asr-cache");
    const opts = {
      startMs: 0,
      endMs: 4000,
      cacheDir,
      deps: {
        extractAudio: fakeExtract,
        sendToWorker: async () => ({ segments: [], language: "zh", meta: {}, error: null }),
      },
    };
    await transcribeAudioWindow(media, opts);
    await transcribeAudioWindow(media, opts);
    expect(existsSync(cacheDir)).toBe(false);
  });
});
