import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("../visual-analyzer.mjs", () => ({
  analyzeAssetSemantics: vi.fn(),
  detectFocus: vi.fn(),
  closeFocusDetector: vi.fn(),
  closeVisualAnalyzer: vi.fn(),
  getVlmConcurrency: vi.fn(() => 2),
}));

import { analyzeAssets } from "../asset-sourcer.mjs";
import { analyzeAssetSemantics, detectFocus } from "../visual-analyzer.mjs";

function fakeSemantics(path) {
  const name = path.split("/").pop();
  return {
    description: `fake desc for ${name}`,
    subjects: [name],
    contentKind: "other",
    fit: "cover",
    criticalEdgeText: null,
    reason: "fake",
    relevance: null,
    relevanceReason: null,
  };
}

describe("analyzeAssets VLM cache + concurrency wiring (#189)", () => {
  let dir;
  let contentDir;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "vlm-wiring-test-"));
    contentDir = join(dir, "content");
    const assetsDir = join(contentDir, "assets");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, "one.png"), "one");
    writeFileSync(join(assetsDir, "two.png"), "two");
    writeFileSync(join(assetsDir, "three.png"), "three");
    detectFocus.mockResolvedValue({
      status: "degraded",
      errorCode: "test",
      frame: null,
      protectedRegions: [],
      saliency: { available: false, dispersion: 0, centroid: [0.5, 0.5] },
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function assets(n) {
    return Array.from({ length: n }, (_, i) => ({
      path: `assets/${["one", "two", "three"][i]}.png`,
      type: "image",
    }));
  }

  it("calls VLM once per asset on first run, then zero times on rerun (cache hit)", async () => {
    analyzeAssetSemantics.mockImplementation(async (p) => fakeSemantics(p));

    const opts = { outputDir: dir, contentDir, contentSlug: "s1" };
    await analyzeAssets(assets(3), opts);
    expect(analyzeAssetSemantics).toHaveBeenCalledTimes(3);

    analyzeAssetSemantics.mockClear();
    const report2 = await analyzeAssets(assets(3), opts);
    expect(analyzeAssetSemantics).toHaveBeenCalledTimes(0);
    expect(report2.every((r) => r.description.startsWith("fake desc for"))).toBe(true);
  });

  it("runs VLM calls concurrently and keeps report order stable", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    analyzeAssetSemantics.mockImplementation(async (p) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 120));
      inFlight--;
      const name = p.split("/").pop();
      // Complete out of order: earlier assets take longer
      if (name === "one.png") await new Promise((r) => setTimeout(r, 120));
      return fakeSemantics(p);
    });

    const report = await analyzeAssets(assets(3), {
      outputDir: dir,
      contentDir,
      contentSlug: "s2",
    });
    expect(maxInFlight).toBe(2);
    expect(report.map((r) => r.description)).toEqual([
      "fake desc for one.png",
      "fake desc for two.png",
      "fake desc for three.png",
    ]);
  });

  it("does not read or write cache when contentDir is missing", async () => {
    analyzeAssetSemantics.mockImplementation(async (p) => fakeSemantics(p));
    await analyzeAssets(assets(2), { outputDir: dir });
    expect(existsSync(join(dir, ".vlm-cache"))).toBe(false);
    expect(analyzeAssetSemantics).toHaveBeenCalledTimes(2);
  });

  it("stores escalated flag from VLM result in cache value", async () => {
    analyzeAssetSemantics.mockImplementation(async (p) => ({
      ...fakeSemantics(p),
      escalated: true,
    }));
    await analyzeAssets(assets(1), { outputDir: dir, contentDir, contentSlug: "s4" });
    const cacheDir = join(contentDir, ".vlm-cache");
    const file = readdirSync(cacheDir)[0];
    const value = JSON.parse(readFileSync(join(cacheDir, file), "utf-8"));
    expect(value.escalated).toBe(true);
  });
});
