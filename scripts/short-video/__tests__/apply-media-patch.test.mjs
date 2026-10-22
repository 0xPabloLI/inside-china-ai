/**
 * Tests for apply-media-patch.mjs — human review summary formatting.
 *
 * Spec §4.7: Output review summary as comments, NOT as copyable fields.
 * The media object keeps existing MediaField shape — no analysis or focusAnalysis.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import {
  formatFocusSummary,
  formatPatchEntry,
  formatMediaPatch,
} from "../lib/review-media-patch.mjs";
import { applyAssignedMedia } from "../lib/apply-media-patch.mjs";
import * as applyLib from "../lib/apply-media-patch.mjs";
import * as reviewLib from "../lib/review-media-patch.mjs";
import {
  applyPatchesToText,
  validatePatchEntry as validateCliPatchEntry,
} from "../apply-media-patch.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = join(__dirname, "..", "output");

describe("formatFocusSummary", () => {
  it("formats ok status with protected regions and saliency", () => {
    const fa = {
      status: "ok",
      errorCode: null,
      frame: { width: 1920, height: 1080, orientation: "landscape", orientationNormalized: true },
      protectedRegions: [
        {
          rect: [0.1, 0.2, 0.3, 0.4],
          kind: "face",
          confidence: null,
          confidenceKind: "not_provided",
        },
      ],
      saliency: { available: true, dispersion: 0.063, centroid: [0.5, 0.6] },
    };
    const result = formatFocusSummary(fa);
    expect(result).toContain("Focus Analysis: ok");
    expect(result).toContain("Protected Regions (1)");
    expect(result).toContain("face: [0.100, 0.200, 0.300, 0.400]");
    expect(result).toContain("Saliency: available");
    expect(result).toContain("dispersion: 0.063");
  });

  it("formats partial status (saliency unavailable but regions present)", () => {
    const fa = {
      status: "partial",
      errorCode: "saliency_compute_failed",
      protectedRegions: [
        {
          rect: [0.1, 0.2, 0.1, 0.2],
          kind: "face",
          confidence: null,
          confidenceKind: "not_provided",
        },
      ],
      saliency: { available: false, dispersion: 0.0, centroid: [0.5, 0.5] },
    };
    const result = formatFocusSummary(fa);
    expect(result).toContain("Focus Analysis: partial");
    expect(result).toContain("Protected Regions (1)");
    expect(result).toContain("Saliency: unavailable");
  });

  it("formats low_information status", () => {
    const fa = {
      status: "low_information",
      errorCode: null,
      protectedRegions: [],
      saliency: { available: true, dispersion: 0.005, centroid: [0.5, 0.5] },
    };
    const result = formatFocusSummary(fa);
    expect(result).toContain("low_information");
    expect(result).toContain("no protected regions");
  });

  it("formats degraded status with warning", () => {
    const fa = {
      status: "degraded",
      errorCode: "opencv_not_available",
      protectedRegions: [],
      saliency: { available: false, dispersion: 0.0, centroid: [0.5, 0.5] },
    };
    const result = formatFocusSummary(fa);
    expect(result).toContain("⚠️");
    expect(result).toContain("degraded");
    expect(result).toContain("opencv_not_available");
    expect(result).toContain("ignore focusAnalysis");
  });

  it("formats unsupported status for video assets", () => {
    const fa = {
      status: "unsupported",
      errorCode: "video_not_supported",
      protectedRegions: [],
      saliency: { available: false, dispersion: 0.0, centroid: [0.5, 0.5] },
    };
    const result = formatFocusSummary(fa);
    expect(result).toContain("unsupported");
    expect(result).toContain("video asset");
  });

  it("returns empty string for null input", () => {
    expect(formatFocusSummary(null)).toBe("");
    expect(formatFocusSummary(undefined)).toBe("");
  });

  it("handles missing protectedRegions gracefully", () => {
    const fa = {
      status: "ok",
      errorCode: null,
      saliency: { available: true, dispersion: 0.05, centroid: [0.5, 0.5] },
    };
    const result = formatFocusSummary(fa);
    expect(result).toContain("No protected regions detected");
  });
});

describe("formatPatchEntry — output boundary", () => {
  it("outputs media object WITHOUT analysis or focusAnalysis fields", () => {
    const entry = {
      sceneId: 3,
      sceneName: "Test Scene",
      visualType: "narrative",
      media: {
        type: "image",
        path: "content/test/img.jpg",
        animation: "fade",
        overlay: 0.7,
        fit: "cover",
      },
      analysis: {
        focusAnalysis: {
          status: "ok",
          errorCode: null,
          protectedRegions: [
            {
              rect: [0.1, 0.2, 0.3, 0.4],
              kind: "face",
              confidence: null,
              confidenceKind: "not_provided",
            },
          ],
          saliency: { available: true, dispersion: 0.05, centroid: [0.5, 0.5] },
        },
      },
      assetScore: 85,
      source: "pexels",
      status: "assigned",
    };
    const result = formatPatchEntry(entry);

    // Should contain focus summary as comments
    expect(result).toContain("// Focus Analysis: ok");
    expect(result).toContain("// Protected Regions");

    // Should contain copyable media object
    expect(result).toContain("media: {");
    expect(result).toContain('type: "image"');
    expect(result).toContain('path: "content/test/img.jpg"');

    // Should NOT contain analysis or focusAnalysis in the media block
    // (they should only appear as comments above the media block)
    const mediaBlock = result.substring(result.indexOf("media: {"));
    expect(mediaBlock).not.toContain("focusAnalysis");
    expect(mediaBlock).not.toContain("analysis");
    expect(mediaBlock).not.toContain("protectedRegions");
  });

  it("does not include deprecated focus field in media output", () => {
    const entry = {
      sceneId: 1,
      media: { type: "image", path: "test.jpg", fit: "cover" },
      status: "assigned",
    };
    const result = formatPatchEntry(entry);
    expect(result).not.toContain("focus:");
  });

  it("returns empty string for unassigned entries", () => {
    const entry = { status: "unassigned", assetScore: 50 };
    expect(formatPatchEntry(entry)).toBe("");
  });

  it("handles entries without analysis field", () => {
    const entry = {
      sceneId: 1,
      media: { type: "image", path: "test.jpg", animation: "fade" },
      status: "assigned",
    };
    const result = formatPatchEntry(entry);
    // Should still output the media block
    expect(result).toContain("media: {");
    expect(result).toContain('path: "test.jpg"');
    // No focus summary comments
    expect(result).not.toContain("// Focus Analysis");
  });

  // VC-15: cropFocus serialization in formatPatchEntry
  it("VC-15: includes cropFocus in media output when present", () => {
    const entry = {
      sceneId: 1,
      media: { type: "image", path: "test.jpg", fit: "cover", cropFocus: { x: 0.3, y: 0.5 } },
      status: "assigned",
    };
    const result = formatPatchEntry(entry);
    expect(result).toContain("cropFocus: { x: 0.3, y: 0.5 },");
  });

  it("does NOT include cropFocus line when absent", () => {
    const entry = {
      sceneId: 1,
      media: { type: "image", path: "test.jpg", fit: "cover" },
      status: "assigned",
    };
    const result = formatPatchEntry(entry);
    expect(result).not.toContain("cropFocus");
  });

  // VC-21: videoStartOffsetMs serialization in formatPatchEntry (third formatter
  // mirror — manual patch round-trip must not silently drop the offset, #360)
  it("VC-21: includes videoStartOffsetMs in media output when present", () => {
    const entry = {
      sceneId: 1,
      media: { type: "video", path: "test.mp4", fit: "cover", videoStartOffsetMs: 5000 },
      status: "assigned",
    };
    const result = formatPatchEntry(entry);
    expect(result).toContain("videoStartOffsetMs: 5000,");
  });

  it("VC-22: does NOT include videoStartOffsetMs line when absent", () => {
    const entry = {
      sceneId: 1,
      media: { type: "image", path: "test.jpg", fit: "cover" },
      status: "assigned",
    };
    const result = formatPatchEntry(entry);
    expect(result).not.toContain("videoStartOffsetMs");
  });

  // VC-17: crop decision in review summary
  it("VC-17: displays crop decision in semantics summary", () => {
    const entry = {
      sceneId: 1,
      media: { type: "image", path: "test.jpg", fit: "cover" },
      status: "assigned",
    };
    const analysisMap = new Map();
    analysisMap.set("test.jpg", {
      description: "A landscape photo.",
      subjects: ["landscape"],
      contentKind: "other",
      fit: "cover",
      criticalEdgeText: null,
      reason: null,
      cropDecision: {
        status: "safe",
        policy: "cover",
        cropFocus: { x: 0.3, y: 0.5 },
        reason: "Safe crop at saliency anchor",
        candidates: [],
      },
    });
    const result = formatPatchEntry(entry, analysisMap);
    expect(result).toContain("// Crop Decision: safe, cover, focus [0.3, 0.5]");
  });
});

describe("formatMediaPatch — full output", () => {
  it("formats multiple assigned and unassigned entries", () => {
    const patches = [
      {
        sceneId: 1,
        sceneName: "Scene 1",
        visualType: "narrative",
        media: { type: "image", path: "img1.jpg", animation: "fade", overlay: 0.7 },
        analysis: {
          focusAnalysis: {
            status: "ok",
            protectedRegions: [],
            saliency: { available: true, dispersion: 0.05, centroid: [0.5, 0.5] },
          },
        },
        assetScore: 90,
        source: "pexels",
        status: "assigned",
      },
      {
        sceneId: 2,
        sceneName: "Scene 2",
        visualType: "info-card",
        media: { type: "video", path: "clip1.mp4", animation: "zoom", overlay: 0.75 },
        assetScore: 70,
        source: "youtube",
        status: "assigned",
      },
      {
        assetScore: 30,
        source: "pexels",
        status: "unassigned",
      },
    ];
    const result = formatMediaPatch(patches);
    expect(result).toContain("Assigned (2)");
    expect(result).toContain("Unassigned (1)");
    expect(result).toContain("Scene 1: Scene 1");
    expect(result).toContain("Scene 2: Scene 2");
  });

  it("handles empty patch array", () => {
    const result = formatMediaPatch([]);
    expect(result).toContain("(empty patch file)");
  });

  it("handles null input", () => {
    const result = formatMediaPatch(null);
    expect(result).toContain("No patches to display");
  });
});

// Scenario #16: review-media-patch.mjs --content <slug> reads output/{slug}/asset-analysis.json
describe("review-media-patch CLI --content arg (Scenario #16)", () => {
  const slug = "test-content-slug-16";
  const slugDir = join(OUTPUT_DIR, slug);
  const patchPath = join(slugDir, "media-patch.json");
  const analysisPath = join(slugDir, "asset-analysis.json");
  const scriptPath = join(__dirname, "..", "lib", "review-media-patch.mjs");

  // Setup: create output/{slug}/ with test artifacts
  beforeAll(() => {
    mkdirSync(slugDir, { recursive: true });
    writeFileSync(
      patchPath,
      JSON.stringify([
        {
          sceneId: 1,
          sceneName: "Test",
          visualType: "narrative",
          media: { type: "image", path: "assets/img.jpg", animation: "fade" },
          assetScore: 80,
          source: "pexels",
          status: "assigned",
        },
      ]),
    );
    writeFileSync(
      analysisPath,
      JSON.stringify({
        version: 1,
        assets: [{ path: "assets/img.jpg", description: "A robot", subjects: ["unitree"] }],
      }),
    );
  });

  // Cleanup
  afterAll(() => {
    rmSync(slugDir, { recursive: true, force: true });
  });

  it("reads output/{slug}/media-patch.json and output/{slug}/asset-analysis.json when --content is passed", () => {
    // Run the script with --content flag
    const result = execSync(`node "${scriptPath}" --content ${slug}`, {
      encoding: "utf8",
      cwd: join(__dirname, ".."),
    });
    // Should contain VLM Description from asset-analysis.json
    expect(result).toContain("VLM Description: A robot");
    expect(result).toContain("Subjects: unitree");
    // Should contain media from media-patch.json
    expect(result).toContain("media: {");
    expect(result).toContain('path: "assets/img.jpg"');
  });

  it("falls back to flat output/ when --content is not passed (backward compat)", () => {
    // Without --content, it reads from output/media-patch.json (flat)
    // This test just verifies the arg parsing doesn't crash on missing --content
    // and uses the flat path (which won't exist in test env, so expect error)
    expect(() => {
      execSync(`node "${scriptPath}"`, {
        encoding: "utf8",
        cwd: join(__dirname, ".."),
        stdio: "pipe",
      });
    }).toThrow(); // Throws because output/media-patch.json doesn't exist
  });
});

// ─── #192: applyAssignedMedia — patch application with mediaReject lifecycle ───

describe("applyAssignedMedia (#192)", () => {
  const makeDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "apply-patch-"));
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", "new.jpg"), "x");
    return dir;
  };

  it("applies assigned media to scenes without media", () => {
    const dir = makeDir();
    const scenes = [{ id: 1, visualType: "narrative" }];
    const r = applyAssignedMedia(
      scenes,
      [{ sceneId: 1, status: "assigned", media: { type: "image", path: "assets/new.jpg" } }],
      dir,
    );
    expect(r.applied).toBe(1);
    expect(scenes[0].media.path).toBe("assets/new.jpg");
  });

  it("clears mediaReject on successful re-assignment", () => {
    const dir = makeDir();
    const scenes = [
      {
        id: 1,
        visualType: "narrative",
        mediaReject: { reason: "irrelevant", rejected: ["assets/old.jpg"] },
      },
    ];
    const r = applyAssignedMedia(
      scenes,
      [{ sceneId: 1, status: "assigned", media: { type: "image", path: "assets/new.jpg" } }],
      dir,
    );
    expect(r.applied).toBe(1);
    expect(r.clearedRejects).toEqual([1]);
    expect(scenes[0].mediaReject).toBeUndefined();
  });

  it("does not overwrite existing media", () => {
    const dir = makeDir();
    const scenes = [
      { id: 1, visualType: "narrative", media: { type: "image", path: "assets/keep.jpg" } },
    ];
    const r = applyAssignedMedia(
      scenes,
      [{ sceneId: 1, status: "assigned", media: { type: "image", path: "assets/new.jpg" } }],
      dir,
    );
    expect(r.applied).toBe(0);
    expect(scenes[0].media.path).toBe("assets/keep.jpg");
  });

  it("#299: does not overwrite an explicit media:null waiver", () => {
    // A stale media-patch entry must not resurrect media on a deliberate
    // CSS-only hook — `media?.path` is falsy for null, so this needs its own
    // guard ahead of the path check.
    const dir = makeDir();
    const scenes = [{ id: 1, visualType: "hook", media: null }];
    const r = applyAssignedMedia(
      scenes,
      [{ sceneId: 1, status: "assigned", media: { type: "image", path: "assets/new.jpg" } }],
      dir,
    );
    expect(scenes[0].media).toBeNull();
    expect(r.applied).toBe(0);
    expect(r.skipped).toEqual([{ sceneId: 1, reason: "explicit no-media waiver" }]);
  });

  it("missing file → entry skipped, not applied", () => {
    const dir = makeDir();
    const scenes = [{ id: 1, visualType: "narrative" }];
    const r = applyAssignedMedia(
      scenes,
      [{ sceneId: 1, status: "assigned", media: { type: "image", path: "assets/missing.jpg" } }],
      dir,
    );
    expect(r.applied).toBe(0);
    expect(r.skipped).toHaveLength(1);
  });

  it("exhausted mediaReject scene (still no media) produces a fallback warning", () => {
    const dir = makeDir();
    const scenes = [
      { id: 5, visualType: "narrative", mediaReject: { rejected: ["assets/old.jpg"] } },
      { id: 6, visualType: "narrative" },
    ];
    const r = applyAssignedMedia(scenes, [], dir);
    expect(r.exhausted).toEqual([5]);
  });
});

// ─── #360 videoStartOffsetMs — validatePatchEntry (S9) ───

describe("validatePatchEntry — videoStartOffsetMs (#360 S9)", () => {
  let validatePatchEntry;
  beforeAll(async () => {
    // Root apply-media-patch.mjs (the CLI applier), not the lib/ formatter.
    const mod = await import("../apply-media-patch.mjs");
    validatePatchEntry = mod.validatePatchEntry;
  });

  const SCENES = [{ id: 1, visualType: "narrative" }];
  const entry = (media) => ({ sceneId: 1, status: "assigned", media });

  it("accepts a patch with a valid integer offset ≥ 0", () => {
    const r = validatePatchEntry(
      entry({ type: "video", path: "assets/clip.mp4", videoStartOffsetMs: 5000 }),
      SCENES,
      "/fake/content",
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("accepts a patch without the offset field (absent = 0)", () => {
    const r = validatePatchEntry(
      entry({ type: "video", path: "assets/clip.mp4" }),
      SCENES,
      "/fake/content",
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects a negative offset", () => {
    const r = validatePatchEntry(
      entry({ type: "video", path: "assets/clip.mp4", videoStartOffsetMs: -1 }),
      SCENES,
      "/fake/content",
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("videoStartOffsetMs"))).toBe(true);
  });

  it("rejects a non-integer offset", () => {
    const r = validatePatchEntry(
      entry({ type: "video", path: "assets/clip.mp4", videoStartOffsetMs: 2.5 }),
      SCENES,
      "/fake/content",
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("videoStartOffsetMs"))).toBe(true);
  });

  it("rejects a non-number offset", () => {
    const r = validatePatchEntry(
      entry({ type: "video", path: "assets/clip.mp4", videoStartOffsetMs: "5000" }),
      SCENES,
      "/fake/content",
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("videoStartOffsetMs"))).toBe(true);
  });
  it("VC-23: rejects videoStartOffsetMs on image media (hard error, video-only)", () => {
    const r = validatePatchEntry(
      entry({ type: "image", path: "assets/clip.jpg", videoStartOffsetMs: 5000 }),
      SCENES,
      "/fake/content",
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("only video media supports videoStartOffsetMs"))).toBe(
      true,
    );
  });
  it("VC-24: accepts videoStartOffsetMs on video media without error", () => {
    const r = validatePatchEntry(
      entry({ type: "video", path: "assets/clip.mp4", videoStartOffsetMs: 5000 }),
      SCENES,
      "/fake/content",
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

// ─── #649: apply-media-patch ↔ review-media-patch 双实现漂移统一与 cropFocus ───

describe("#649 media patch formatting unification and cropFocus preservation", () => {
  it("exports identical formatting functions from both lib modules (single source of truth)", () => {
    expect(typeof applyLib.formatFocusSummary).toBe("function");
    expect(typeof applyLib.formatPatchEntry).toBe("function");
    expect(typeof applyLib.formatMediaPatch).toBe("function");
    expect(typeof applyLib.normalizeMediaPatch).toBe("function");

    // Both modules share the exact same underlying implementation
    expect(applyLib.formatFocusSummary).toBe(reviewLib.formatFocusSummary);
    expect(applyLib.formatPatchEntry).toBe(reviewLib.formatPatchEntry);
    expect(applyLib.formatMediaPatch).toBe(reviewLib.formatMediaPatch);
    expect(applyLib.normalizeMediaPatch).toBe(reviewLib.normalizeMediaPatch);
  });

  it("preserves cropFocus, fit, volume, and videoStartOffsetMs in formatted output", () => {
    const entry = {
      sceneId: 42,
      sceneName: "Robot Precision",
      visualType: "narrative",
      status: "assigned",
      media: {
        type: "video",
        path: "assets/robot.mp4",
        source: "unitree",
        animation: "fade",
        fit: "contain",
        cropFocus: { x: 0.42, y: 0.31 },
        volume: 0.8,
        videoStartOffsetMs: 1500,
      },
    };

    const formattedApply = applyLib.formatPatchEntry(entry);
    const formattedReview = reviewLib.formatPatchEntry(entry);

    expect(formattedApply).toBe(formattedReview);
    expect(formattedApply).toContain("cropFocus: { x: 0.42, y: 0.31 },");
    expect(formattedApply).toContain('fit: "contain",');
    expect(formattedApply).toContain("volume: 0.8,");
    expect(formattedApply).toContain("videoStartOffsetMs: 1500,");
  });

  it("produces identical review text across both entrypoints with or without asset-analysis", () => {
    const patches = [
      {
        sceneId: 1,
        sceneName: "Intro",
        visualType: "hook",
        status: "assigned",
        assetScore: 92,
        source: "pexels",
        media: {
          type: "image",
          path: "assets/intro.jpg",
          animation: "fade",
          fit: "cover",
          cropFocus: { x: 0.5, y: 0.5 },
        },
        analysis: {
          focusAnalysis: {
            status: "ok",
            protectedRegions: [{ rect: [0.2, 0.3, 0.4, 0.5], kind: "face", confidence: 0.95 }],
            saliency: { available: true, dispersion: 0.04, centroid: [0.5, 0.5] },
          },
        },
      },
      {
        sceneId: 2,
        sceneName: "Missing",
        status: "unassigned",
        assetScore: 10,
        source: "web",
      },
    ];

    // Case 1: without analysisMap (null / undefined) -> graceful degradation without VLM comments
    const textApplyNoMap = applyLib.formatMediaPatch(patches);
    const textReviewNoMap = reviewLib.formatMediaPatch(patches);
    expect(textApplyNoMap).toBe(textReviewNoMap);
    expect(textApplyNoMap).toContain("cropFocus: { x: 0.5, y: 0.5 },");
    expect(textApplyNoMap).toContain("Focus Analysis: ok");
    expect(textApplyNoMap).not.toContain("VLM Description");

    // Case 2: with analysisMap -> VLM comments included identically
    const analysisMap = new Map();
    analysisMap.set("assets/intro.jpg", {
      description: "Humanoid robot performing task",
      subjects: ["humanoid", "robot"],
      contentKind: "demo",
      fit: "contain",
      cropDecision: {
        status: "safe",
        policy: "contain",
        cropFocus: { x: 0.5, y: 0.5 },
        reason: "Centered subject",
      },
    });

    const textApplyWithMap = applyLib.formatMediaPatch(patches, analysisMap);
    const textReviewWithMap = reviewLib.formatMediaPatch(patches, analysisMap);
    expect(textApplyWithMap).toBe(textReviewWithMap);
    expect(textApplyWithMap).toContain("VLM Description: Humanoid robot performing task");
    expect(textApplyWithMap).toContain("Subjects: humanoid, robot");
    expect(textApplyWithMap).toContain("Crop Decision: safe, contain, focus [0.5, 0.5]");
  });

  it("produces byte-for-byte identical CLI stdout between apply-media-patch.mjs and review-media-patch.mjs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "media-patch-cli-test-"));
    try {
      const patchPath = join(tempDir, "media-patch.json");
      const analysisPath = join(tempDir, "asset-analysis.json");

      const patchData = {
        schemaVersion: "1.0",
        patches: [
          {
            sceneId: 3,
            sceneName: "Vision Model",
            visualType: "b-roll",
            status: "assigned",
            assetScore: 88,
            source: "local",
            media: {
              type: "image",
              path: "assets/vlm.png",
              animation: "zoom-in",
              fit: "cover",
              cropFocus: { x: 0.35, y: 0.65 },
            },
            analysis: {
              focusAnalysis: {
                status: "ok",
                protectedRegions: [{ rect: [0.1, 0.2, 0.3, 0.4], kind: "text", confidence: 0.88 }],
                saliency: { available: true, dispersion: 0.05, centroid: [0.35, 0.65] },
              },
            },
          },
        ],
      };

      const analysisData = {
        assets: [
          {
            path: "assets/vlm.png",
            description: "Neural net architecture diagram",
            subjects: ["diagram", "transformer"],
            contentKind: "architecture",
            cropDecision: {
              status: "safe",
              policy: "cover",
              cropFocus: { x: 0.35, y: 0.65 },
              reason: "Focused on core attention layers",
            },
          },
        ],
      };

      writeFileSync(patchPath, JSON.stringify(patchData, null, 2), "utf8");
      writeFileSync(analysisPath, JSON.stringify(analysisData, null, 2), "utf8");

      const applyScript = join(__dirname, "..", "lib", "apply-media-patch.mjs");
      const reviewScript = join(__dirname, "..", "lib", "review-media-patch.mjs");

      const outApply = execSync(
        `node "${applyScript}" --input "${patchPath}" --analysis "${analysisPath}"`,
        { encoding: "utf8" },
      );
      const outReview = execSync(
        `node "${reviewScript}" --input "${patchPath}" --analysis "${analysisPath}"`,
        { encoding: "utf8" },
      );

      expect(outApply).toBe(outReview);
      expect(outApply).toContain("cropFocus: { x: 0.35, y: 0.65 },");
      expect(outApply).toContain("VLM Description: Neural net architecture diagram");
      expect(outApply).toContain("Crop Decision: safe, cover, focus [0.35, 0.65]");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── #758: the writer must not silently drop evidence/provenance ───

describe("#758 evidence capture fields in media patches", () => {
  const provenance = (over = {}) => ({
    sourceUrl: "https://example.com/benchmark-table",
    selector: "table:nth-of-type(1)",
    rect: { x: 104, y: 923, w: 288, h: 144 },
    clip: { x: 88, y: 907, w: 320, h: 160 },
    scale: 2,
    ...over,
  });

  const media = () => ({
    type: "image",
    path: "assets/capture.png",
    evidence: true,
    provenance: provenance(),
  });

  it("formatPatchEntry emits evidence and a paste-ready provenance block", () => {
    const out = formatPatchEntry({ sceneId: 1, status: "assigned", media: media() });
    expect(out).toContain("    evidence: true,");
    expect(out).toContain("    provenance: {");
    expect(out).toContain('      sourceUrl: "https://example.com/benchmark-table",');
    expect(out).toContain('      selector: "table:nth-of-type(1)",');
    expect(out).toContain("      rect: { x: 104, y: 923, w: 288, h: 144 },");
    expect(out).toContain("      scale: 2,");
  });

  it("formatPatchEntry omits both fields when absent", () => {
    const out = formatPatchEntry({
      sceneId: 1,
      status: "assigned",
      media: { type: "image", path: "assets/plain.png" },
    });
    expect(out).not.toContain("provenance");
    expect(out).not.toContain("evidence");
  });

  it("applyPatchesToText writes both fields into scene data", () => {
    const text = [
      "export const scenes = [",
      "  {",
      "    id: 3,",
      '    visualType: "narrative",',
      '    voiceover: "hi",',
      "  },",
      "];",
      "",
    ].join("\n");
    const result = applyPatchesToText(text, [{ sceneId: 3, action: "add", media: media() }]);
    expect(result.errors).toEqual([]);
    expect(result.applied).toHaveLength(1);
    // The scene body is indented 4, so the media block's own indent is 4 and
    // its fields land at 6.
    expect(result.modifiedContent).toContain("      evidence: true,");
    expect(result.modifiedContent).toContain("      provenance: {");
    expect(result.modifiedContent).toContain('        selector: "table:nth-of-type(1)",');
    expect(result.modifiedContent).toContain("      },");
    expect(result.modifiedContent).toContain('    voiceover: "hi",');
  });

  it("replace round-trips a flat block and then a provenance block (--force re-apply)", () => {
    // The nested block is what this ticket adds; a regex that stops at the
    // first inner "}" used to leave the previous clip/scale tail behind.
    const text = [
      "export const scenes = [",
      "  {",
      "    id: 3,",
      '    visualType: "narrative",',
      "    media: {",
      '      type: "image",',
      '      path: "assets/old.png",',
      "    },",
      '    voiceover: "hi",',
      "  },",
      "];",
      "",
    ].join("\n");
    const first = applyPatchesToText(text, [{ sceneId: 3, action: "replace", media: media() }]);
    expect(first.errors).toEqual([]);
    expect(first.modifiedContent).not.toContain('path: "assets/old.png"');
    expect(first.modifiedContent).toContain("provenance: {");

    const second = applyPatchesToText(first.modifiedContent, [
      {
        sceneId: 3,
        action: "replace",
        media: { ...media(), provenance: provenance({ sourceUrl: "https://newer.example/y" }) },
      },
    ]);
    expect(second.errors).toEqual([]);
    expect(second.modifiedContent).not.toContain("https://example.com/benchmark-table");
    expect(second.modifiedContent).toContain('"https://newer.example/y"');
    expect(second.modifiedContent.match(/provenance: \{/g)).toHaveLength(1);
    expect(second.modifiedContent).toContain('    voiceover: "hi",');
    expect(second.modifiedContent.match(/\{/g)).toHaveLength(
      second.modifiedContent.match(/\}/g).length,
    );
  });

  it("rejects evidence:true without provenance", () => {
    const r = validateCliPatchEntry(
      {
        sceneId: 1,
        status: "assigned",
        media: { type: "image", path: "assets/capture.png", evidence: true },
      },
      [{ id: 1 }],
      "/fake/content",
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("provenance"))).toBe(true);
  });

  it("accepts evidence:true with a valid provenance", () => {
    const r = validateCliPatchEntry(
      { sceneId: 1, status: "assigned", media: media() },
      [{ id: 1 }],
      "/fake/content",
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it.each([
    ["string", "yes"],
    ["number", 1],
    ["object", {}],
  ])("rejects a %s evidence flag", (_label, evidence) => {
    const r = validateCliPatchEntry(
      { sceneId: 1, status: "assigned", media: { ...media(), evidence } },
      [{ id: 1 }],
      "/fake/content",
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("evidence"))).toBe(true);
  });

  it.each([
    ["null", null],
    ["false", false],
  ])("accepts evidence:%s as a non-evidence declaration", (_label, evidence) => {
    const r = validateCliPatchEntry(
      {
        sceneId: 1,
        status: "assigned",
        media: { type: "image", path: "assets/capture.png", evidence },
      },
      [{ id: 1 }],
      "/fake/content",
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects an invalid provenance shape", () => {
    const r = validateCliPatchEntry(
      {
        sceneId: 1,
        status: "assigned",
        media: { ...media(), provenance: provenance({ scale: 0 }) },
      },
      [{ id: 1 }],
      "/fake/content",
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("provenance.scale"))).toBe(true);
  });

  it("applyAssignedMedia preserves evidence and provenance when spreading the entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "apply-patch-758-"));
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", "capture.png"), "x");
    try {
      const scenes = [{ id: 1, visualType: "narrative" }];
      const r = applyAssignedMedia(
        scenes,
        [{ sceneId: 1, status: "assigned", media: media() }],
        dir,
      );
      expect(r.applied).toBe(1);
      expect(scenes[0].media.evidence).toBe(true);
      expect(scenes[0].media.provenance).toEqual(provenance());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
