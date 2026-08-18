/**
 * Tests for apply-media-patch.mjs — human review summary formatting.
 *
 * Spec §4.7: Output review summary as comments, NOT as copyable fields.
 * The media object keeps existing MediaField shape — no analysis or focusAnalysis.
 */
import { describe, it, expect } from "vitest";
import {
  formatFocusSummary,
  formatPatchEntry,
  formatMediaPatch,
} from "../lib/review-media-patch.mjs";

describe("formatFocusSummary", () => {
  it("formats ok status with protected regions and saliency", () => {
    const fa = {
      status: "ok",
      errorCode: null,
      frame: { width: 1920, height: 1080, orientation: "landscape", orientationNormalized: true },
      protectedRegions: [
        { rect: [0.1, 0.2, 0.3, 0.4], kind: "face", confidence: null, confidenceKind: "not_provided" },
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
      protectedRegions: [{ rect: [0.1, 0.2, 0.1, 0.2], kind: "face", confidence: null, confidenceKind: "not_provided" }],
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
    const fa = { status: "ok", errorCode: null, saliency: { available: true, dispersion: 0.05, centroid: [0.5, 0.5] } };
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
      media: { type: "image", path: "content/test/img.jpg", animation: "fade", overlay: 0.7, fit: "cover" },
      analysis: {
        focusAnalysis: {
          status: "ok",
          errorCode: null,
          protectedRegions: [{ rect: [0.1, 0.2, 0.3, 0.4], kind: "face", confidence: null, confidenceKind: "not_provided" }],
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
});

describe("formatMediaPatch — full output", () => {
  it("formats multiple assigned and unassigned entries", () => {
    const patches = [
      {
        sceneId: 1,
        sceneName: "Scene 1",
        visualType: "narrative",
        media: { type: "image", path: "img1.jpg", animation: "fade", overlay: 0.7 },
        analysis: { focusAnalysis: { status: "ok", protectedRegions: [], saliency: { available: true, dispersion: 0.05, centroid: [0.5, 0.5] } } },
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
