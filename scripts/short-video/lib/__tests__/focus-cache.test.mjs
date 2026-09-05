import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  FOCUS_ANALYZER_VERSION,
  computeFocusCacheKey,
  getCachedFocusResult,
  writeCachedFocusResult,
} from "../focus-cache.mjs";

// ─── #100 P7: focus-detection result cache ───
//
// Focus analysis (OpenCV Haar + spectral residual) reruns on every pipeline
// pass for the same asset. This cache persists the focus result keyed by
// source content + analyzer version, reusing the #100 envelope protocol
// from vlm-cache.mjs.

describe("focus-cache (#100)", () => {
  let dir;
  let imgA;
  let imgB;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "focus-cache-test-"));
    imgA = join(dir, "a.png");
    imgB = join(dir, "b.png");
    writeFileSync(imgA, "image-a-bytes");
    writeFileSync(imgB, "image-b-bytes");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("analyzer version constant is exported", () => {
    expect(typeof FOCUS_ANALYZER_VERSION).toBe("string");
    expect(FOCUS_ANALYZER_VERSION.length).toBeGreaterThan(0);
  });

  it("produces a stable 64-hex key for identical content, distinct per file", async () => {
    const k1 = await computeFocusCacheKey({ filePath: imgA });
    const k2 = await computeFocusCacheKey({ filePath: imgA });
    const k3 = await computeFocusCacheKey({ filePath: imgB });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
    expect(k3).not.toBe(k1);
  });

  it("roundtrips through the unified envelope with analyzer version in meta", async () => {
    const key = await computeFocusCacheKey({ filePath: imgA });
    const data = {
      status: "ok",
      frame: { width: 100, height: 50 },
      protectedRegions: [],
      saliency: { available: true, dispersion: 0.4, centroid: [0.5, 0.5] },
    };
    writeCachedFocusResult(dir, key, { data, meta: { durationMs: 512 } });

    const atRest = JSON.parse(readFileSync(join(dir, `${key}.json`), "utf-8"));
    expect(atRest.ok).toBe(true);
    expect(atRest.error).toBeNull();
    expect(atRest.data).toEqual(data);
    expect(atRest.meta.analyzerVersion).toBe(FOCUS_ANALYZER_VERSION);
    expect(atRest.meta.durationMs).toBe(512);

    const got = getCachedFocusResult(dir, key);
    expect(got.data).toEqual(data);
    expect(got.meta.cacheHit).toBe(true);
  });

  it("returns null for missing key, corrupted file, or legacy raw entry", async () => {
    expect(getCachedFocusResult(dir, "a".repeat(64))).toBeNull();

    const key = await computeFocusCacheKey({ filePath: imgA });
    writeCachedFocusResult(dir, key, { data: { status: "ok" }, meta: {} });
    writeFileSync(join(dir, `${key}.json`), "{nope");
    expect(getCachedFocusResult(dir, key)).toBeNull();

    // Raw non-envelope entry (defensive parity with vlm-cache v2)
    const rawKey = await computeFocusCacheKey({ filePath: imgB });
    writeFileSync(join(dir, `${rawKey}.json`), JSON.stringify({ status: "ok" }), "utf-8");
    expect(getCachedFocusResult(dir, rawKey)).toBeNull();
  });

  it("refuses to persist a degraded result — rerun must retry detection", async () => {
    const key = await computeFocusCacheKey({ filePath: imgA });
    writeCachedFocusResult(dir, key, {
      data: { status: "degraded", errorCode: "cannot_read_image", frame: null },
      meta: {},
    });
    expect(getCachedFocusResult(dir, key)).toBeNull();
    expect(readdirSync(dir).filter((f) => f.endsWith(".json"))).toEqual([]);
  });

  it("writes atomically — only the final entry file remains", async () => {
    const cacheDir = join(dir, "cache");
    const key = await computeFocusCacheKey({ filePath: imgA });
    writeCachedFocusResult(cacheDir, key, { data: { status: "ok" }, meta: {} });
    expect(readdirSync(cacheDir)).toEqual([`${key}.json`]);
  });
});
