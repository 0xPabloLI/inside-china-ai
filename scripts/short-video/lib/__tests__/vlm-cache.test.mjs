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
  computeCacheKey,
  getCachedSemantics,
  writeCachedSemantics,
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
    await writeCachedSemantics(dir, key, value);
    const got = await getCachedSemantics(dir, key);
    expect(got).toEqual(value);
  });

  it("returns null for missing key or corrupted file", async () => {
    expect(await getCachedSemantics(dir, "f".repeat(64))).toBeNull();

    const key = await computeCacheKey({ filePath: imgA, model: "m1" });
    await writeCachedSemantics(dir, key, { description: "ok" });
    writeFileSync(join(dir, `${key}.json`), "{corrupted");
    expect(await getCachedSemantics(dir, key)).toBeNull();
  });

  it("writes atomically — only the final entry file remains", async () => {
    const cacheDir = join(dir, "cache");
    const key = await computeCacheKey({ filePath: imgA, model: "m1" });
    await writeCachedSemantics(cacheDir, key, { description: "ok" });
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
