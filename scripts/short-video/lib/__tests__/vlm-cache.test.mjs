import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  utimesSync,
  statSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  VLM_CACHE_PROMPT_VERSION,
  VLM_CACHE_PIPELINE_VERSION,
  computeCacheKey,
  getCachedResult,
  writeCachedResult,
} from "../vlm-cache.mjs";

describe("vlm-cache (#189)", () => {
  let dir;
  let imgA;
  let imgB;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vlm-cache-test-"));
    imgA = join(dir, "a.png");
    imgB = join(dir, "b.png");
    writeFileSync(imgA, "image-a-bytes");
    writeFileSync(imgB, "image-b-bytes");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("prompt version constant is exported", () => {
    expect(typeof VLM_CACHE_PROMPT_VERSION).toBe("string");
    expect(VLM_CACHE_PROMPT_VERSION.length).toBeGreaterThan(0);
  });

  it("produces a stable key for identical inputs", async () => {
    const k1 = await computeCacheKey({ filePath: imgA, model: "m1" });
    const k2 = await computeCacheKey({ filePath: imgA, model: "m1" });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes key when file, model, window or claim differ", async () => {
    const base = await computeCacheKey({ filePath: imgA, model: "m1" });
    const byFile = await computeCacheKey({ filePath: imgB, model: "m1" });
    const byModel = await computeCacheKey({ filePath: imgA, model: "m2" });
    const byWindow = await computeCacheKey({
      filePath: imgA,
      model: "m1",
      window: { startMs: 0, endMs: 8000, sampleFps: 1 },
    });
    const byClaim = await computeCacheKey({
      filePath: imgA,
      model: "m1",
      claim: { voiceover: "v", assetNeed: "n" },
    });
    expect(byFile).not.toBe(base);
    expect(byModel).not.toBe(base);
    expect(byWindow).not.toBe(base);
    expect(byClaim).not.toBe(base);
  });

  it("roundtrips value through cache", async () => {
    const key = await computeCacheKey({ filePath: imgA, model: "m1" });
    const value = { description: "cached desc", subjects: ["x"], escalated: false };
    writeCachedResult(dir, key, { data: value, meta: { model: "m1", durationMs: 10 } });
    const got = getCachedResult(dir, key);
    expect(got.data).toEqual(value);
    expect(got.meta.cacheHit).toBe(true);
  });

  it("returns null for missing key or corrupted file", async () => {
    expect(getCachedResult(dir, "f".repeat(64))).toBeNull();

    const key = await computeCacheKey({ filePath: imgA, model: "m1" });
    writeCachedResult(dir, key, { data: { description: "ok" }, meta: {} });
    writeFileSync(join(dir, `${key}.json`), "{corrupted");
    expect(getCachedResult(dir, key)).toBeNull();
  });

  it("writes atomically — only the final entry file remains", async () => {
    const cacheDir = join(dir, "cache");
    const key = await computeCacheKey({ filePath: imgA, model: "m1" });
    writeCachedResult(cacheDir, key, { data: { description: "ok" }, meta: {} });
    expect(readdirSync(cacheDir)).toEqual([`${key}.json`]);
  });

  it("uses size+mtime fingerprint for large files (skip full hash)", async () => {
    const big = join(dir, "big.mp4");
    writeFileSync(big, Buffer.alloc(20 * 1024 * 1024, 0)); // 20MB > 16MB threshold
    const k1 = await computeCacheKey({ filePath: big, model: "m1" });
    const k2 = await computeCacheKey({ filePath: big, model: "m1" });
    expect(k1).toBe(k2);

    // Same size, different mtime → different key (no false hit on re-download)
    const st = statSync(big);
    utimesSync(big, st.atime, new Date(st.mtimeMs + 5000));
    const k3 = await computeCacheKey({ filePath: big, model: "m1" });
    expect(k3).not.toBe(k1);
  });
});

// ─── #100 P7: unified envelope {ok, data, error, meta} ───

describe("vlm-cache envelope v2 (#100)", () => {
  let dir;
  let imgA;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vlm-envelope-test-"));
    imgA = join(dir, "a.png");
    writeFileSync(imgA, "image-a-bytes");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("pipeline version constant is exported", () => {
    expect(typeof VLM_CACHE_PIPELINE_VERSION).toBe("string");
    expect(VLM_CACHE_PIPELINE_VERSION.length).toBeGreaterThan(0);
  });

  it("writeCachedResult persists the {ok, data, error, meta} envelope with versions and timestamp", async () => {
    const key = await computeCacheKey({ filePath: imgA, model: "m1" });
    const data = { description: "ok desc", escalated: false };
    writeCachedResult(dir, key, {
      data,
      meta: { model: "m1", durationMs: 23456 },
    });
    const file = JSON.parse(readFileSync(join(dir, `${key}.json`), "utf-8"));
    expect(file.ok).toBe(true);
    expect(file.error).toBeNull();
    expect(file.data).toEqual(data);
    expect(file.meta.model).toBe("m1");
    expect(file.meta.durationMs).toBe(23456);
    expect(file.meta.promptVersion).toBe(VLM_CACHE_PROMPT_VERSION);
    expect(file.meta.pipelineVersion).toBe(VLM_CACHE_PIPELINE_VERSION);
    expect(typeof file.meta.generatedAt).toBe("string");
    expect(new Date(file.meta.generatedAt).getTime()).not.toBeNaN();
  });

  it("getCachedResult returns {data, meta} with cacheHit=true on hit", async () => {
    const key = await computeCacheKey({ filePath: imgA, model: "m1" });
    const data = { description: "cached desc", subjects: ["x"] };
    writeCachedResult(dir, key, { data, meta: { model: "m1", durationMs: 100 } });
    const got = getCachedResult(dir, key);
    expect(got.data).toEqual(data);
    expect(got.meta.cacheHit).toBe(true);
    expect(got.meta.model).toBe("m1");
  });

  it("treats a legacy raw-semantics entry (no envelope) as a miss", async () => {
    const key = await computeCacheKey({ filePath: imgA, model: "m1" });
    // #189-era entry: raw semantics object with no envelope wrapper
    writeFileSync(
      join(dir, `${key}.json`),
      JSON.stringify({ description: "legacy", subjects: [] }),
      "utf-8",
    );
    expect(getCachedResult(dir, key)).toBeNull();
  });

  it("returns null for missing key or corrupted envelope", async () => {
    expect(getCachedResult(dir, "f".repeat(64))).toBeNull();
    const key = await computeCacheKey({ filePath: imgA, model: "m1" });
    writeCachedResult(dir, key, { data: { description: "ok" }, meta: {} });
    writeFileSync(join(dir, `${key}.json`), "{corrupted");
    expect(getCachedResult(dir, key)).toBeNull();
  });

  it("refuses to persist an error envelope — failed results never become success hits", async () => {
    const key = await computeCacheKey({ filePath: imgA, model: "m1" });
    expect(() => writeCachedResult(dir, key, { ok: false, error: "boom" })).toThrow(
      /refusing to cache a failed analysis/,
    );
    expect(getCachedResult(dir, key)).toBeNull();
  });

  it("pipeline version participates in the cache key (bump invalidates everything)", async () => {
    // Key composition includes pipelineVersion. The optional override is a
    // test seam — callers default to the VLM_CACHE_PIPELINE_VERSION constant.
    const k1 = await computeCacheKey({ filePath: imgA, model: "m1" });
    const k2 = await computeCacheKey({ filePath: imgA, model: "m1", pipelineVersion: "zzz" });
    expect(k2).not.toBe(k1);
  });
});

// ─── wrapAnalyzerWithCache (#198 Item 4): b-roll gate VLM caching ───
//
// The b-roll gate called analyzeAssetSemantics directly, so escalated reruns
// re-paid 20-120s of VLM inference for the same file+claim. The wrapper gives
// any analyzer the asset-sourcer cache semantics: keyed by file+model+
// window+claim+cropFocus, successful results cached, degraded results not.

describe("wrapAnalyzerWithCache (#198)", () => {
  let dir;
  let img;
  let calls;
  let fakeAnalyzer;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vlm-wrap-test-"));
    img = join(dir, "clip.mp4");
    writeFileSync(img, "clip-bytes");
    calls = 0;
    fakeAnalyzer = async (filePath, opts) => {
      calls += 1;
      if (opts?.claim?.fail) throw new Error("analyzer exploded");
      return {
        description: opts?.claim?.degraded ? "" : `desc for ${opts?.claim?.voiceover ?? ""}`,
        subjects: [],
        contentKind: null,
        fit: null,
        criticalEdgeText: null,
        relevance: 80,
        relevanceReason: "ok",
      };
    };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("caches a successful analysis and skips the second underlying call", async () => {
    const { wrapAnalyzerWithCache } = await import("../vlm-cache.mjs");
    const wrapped = wrapAnalyzerWithCache(fakeAnalyzer, {
      cacheDir: join(dir, ".vlm-cache"),
      model: "test-model",
    });
    const claim = { voiceover: "v", assetNeed: "n" };

    const first = await wrapped(img, { claim });
    expect(calls).toBe(1);
    const second = await wrapped(img, { claim });
    expect(calls).toBe(1); // cache hit
    expect(second).toEqual(first);
    expect(second.description).toBe("desc for v");
  });

  it("does not cache degraded (empty description) or failing analyses", async () => {
    const { wrapAnalyzerWithCache } = await import("../vlm-cache.mjs");
    const wrapped = wrapAnalyzerWithCache(fakeAnalyzer, {
      cacheDir: join(dir, ".vlm-cache"),
      model: "test-model",
    });
    const degradedClaim = { voiceover: "v", degraded: true };

    await wrapped(img, { claim: degradedClaim });
    expect(calls).toBe(1);
    await wrapped(img, { claim: degradedClaim });
    expect(calls).toBe(2); // retry on every call — never pinned

    const failClaim = { voiceover: "v", fail: true };
    await expect(wrapped(img, { claim: failClaim })).rejects.toThrow("analyzer exploded");
    expect(calls).toBe(3);
  });

  it("treats different window/claim/cropFocus as different keys", async () => {
    const { wrapAnalyzerWithCache } = await import("../vlm-cache.mjs");
    const wrapped = wrapAnalyzerWithCache(fakeAnalyzer, {
      cacheDir: join(dir, ".vlm-cache"),
      model: "test-model",
    });
    const claim = { voiceover: "v", assetNeed: "n" };

    await wrapped(img, { claim });
    await wrapped(img, { claim, window: { startMs: 0, endMs: 5000, sampleFps: 1 } });
    await wrapped(img, { claim, cropFocus: { x: 0.3, y: 0.5 } });
    expect(calls).toBe(3);
  });

  it("passes through untouched when the cache is disabled or absent", async () => {
    const { wrapAnalyzerWithCache } = await import("../vlm-cache.mjs");
    const claim = { voiceover: "v", assetNeed: "n" };

    const noDir = wrapAnalyzerWithCache(fakeAnalyzer, { cacheDir: null, model: "m" });
    await noDir(img, { claim });
    await noDir(img, { claim });
    expect(calls).toBe(2);

    const disabled = wrapAnalyzerWithCache(fakeAnalyzer, {
      cacheDir: join(dir, ".vlm-cache"),
      model: "m",
      disabled: true,
    });
    await disabled(img, { claim });
    await disabled(img, { claim });
    expect(calls).toBe(4);
  });
});
