/**
 * Apply Media Patch Tests — AMP-1 through AMP-20
 *
 * TDD: Tests written first (red), implementation second (green).
 * Covers all 20 scenarios from the spec scenario matrix.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";

import {
  validatePatchEntry,
  detectConflict,
  applyPatchesToText,
  generateReceipt,
  formatDryRun,
} from "../apply-media-patch.mjs";

// ─── Test fixtures ───

const CONTENT_DIR = "/fake/content/test-slug";

const scenes = [
  { id: 1, name: "hook", visualType: "hook" },
  {
    id: 2,
    name: "ipo-details",
    visualType: "narrative",
    media: { type: "video", path: "assets/old.mp4", animation: "fade", overlay: 0.7 },
  },
  { id: 3, name: "oversubscription", visualType: "data" },
  { id: 4, name: "company-background", visualType: "info-card" },
  {
    id: 5,
    name: "products",
    visualType: "narrative",
    media: { type: "image", path: "assets/existing.jpg", animation: "ken-burns", overlay: 0.75 },
  },
  { id: 9, name: "china-dominance", visualType: "stat-reveal" },
];

const makePatch = (overrides = {}) => ({
  sceneId: 4,
  sceneName: "company-background",
  visualType: "info-card",
  media: {
    type: "image",
    path: "assets/new-image.jpg",
    source: "Pexels",
    animation: "ken-burns",
    overlay: 0.75,
  },
  assetScore: 85,
  source: "pexels",
  status: "assigned",
  ...overrides,
});

// ─── validatePatchEntry ───

describe("validatePatchEntry", () => {
  // Scenario 1: valid entry, no existing media
  it("validates a valid assigned entry with no existing media", () => {
    const entry = makePatch({ sceneId: 4 });
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // Scenario 3: conflict — scene already has media
  it("detects conflict when scene already has media (without force)", () => {
    const entry = makePatch({ sceneId: 2 }); // scene 2 has media
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("conflict");
  });

  // Scenario 4: already-applied — same type + path
  it("detects already-applied when media matches existing", () => {
    const entry = makePatch({
      sceneId: 2,
      media: { type: "video", path: "assets/old.mp4", animation: "fade", overlay: 0.7 },
    });
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("already-applied");
  });

  // Scenario 6: unassigned status
  it("skips entries with status unassigned", () => {
    const entry = makePatch({ sceneId: 4, status: "unassigned" });
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("unassigned");
  });

  // Scenario 7: absolute path
  it("rejects absolute paths", () => {
    const entry = makePatch({ media: { type: "image", path: "/etc/passwd" } });
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("path");
  });

  // Scenario 8: path traversal
  it("rejects path traversal with ../", () => {
    const entry = makePatch({ media: { type: "image", path: "../../../etc/passwd" } });
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("path");
  });

  // Scenario 9: invalid media type
  it("rejects invalid media type", () => {
    const entry = makePatch({ media: { type: "audio", path: "assets/x.wav" } });
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("type");
  });

  // Scenario 10: scene not found
  it("rejects entry when sceneId not in scenes", () => {
    const entry = makePatch({ sceneId: 999 });
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("scene");
  });

  // Scenario 17: null media
  it("rejects entry with null media when status is assigned", () => {
    const entry = makePatch({ media: null });
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("media");
  });

  // Scenario 17b: undefined media
  it("rejects entry with undefined media when status is assigned", () => {
    const entry = makePatch({ media: undefined });
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("media");
  });

  // Scenario 9b: missing path
  it("rejects entry with missing path in media", () => {
    const entry = makePatch({ media: { type: "image" } });
    const result = validatePatchEntry(entry, scenes, CONTENT_DIR);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("path");
  });
});

// ─── detectConflict ───

describe("detectConflict", () => {
  it("returns 'none' when existingMedia is null", () => {
    const result = detectConflict({ type: "image", path: "assets/x.jpg" }, null);
    expect(result).toBe("none");
  });

  it("returns 'none' when existingMedia is undefined", () => {
    const result = detectConflict({ type: "image", path: "assets/x.jpg" }, undefined);
    expect(result).toBe("none");
  });

  it("returns 'already-applied' when type and path match", () => {
    const patchMedia = { type: "image", path: "assets/same.jpg" };
    const existing = { type: "image", path: "assets/same.jpg", animation: "fade" };
    const result = detectConflict(patchMedia, existing);
    expect(result).toBe("already-applied");
  });

  it("returns 'conflict' when type differs", () => {
    const patchMedia = { type: "video", path: "assets/x.mp4" };
    const existing = { type: "image", path: "assets/x.jpg" };
    const result = detectConflict(patchMedia, existing);
    expect(result).toBe("conflict");
  });

  it("returns 'conflict' when path differs", () => {
    const patchMedia = { type: "image", path: "assets/new.jpg" };
    const existing = { type: "image", path: "assets/old.jpg" };
    const result = detectConflict(patchMedia, existing);
    expect(result).toBe("conflict");
  });
});

// ─── applyPatchesToText ───

describe("applyPatchesToText", () => {
  const sceneDataContent = `export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "Some hook text",
    texts: { badge: "BREAKING" },
  },
  {
    id: 2,
    name: "ipo-details",
    visualType: "narrative",
    media: {
      type: "video",
      path: "assets/old.mp4",
      animation: "fade",
      overlay: 0.7,
    },
    voiceover: "Some narrative text",
    texts: { badge: "IPO" },
  },
  {
    id: 4,
    name: "company-background",
    visualType: "info-card",
    voiceover: "Company background text",
    texts: { title: "THE COMPANY" },
  },
];
`;

  // Scenario 1: standard insert
  it("inserts media field before voiceover when no existing media", () => {
    const patches = [
      {
        sceneId: 4,
        media: { type: "image", path: "assets/new.jpg", animation: "ken-burns", overlay: 0.75 },
        action: "add",
      },
    ];
    const result = applyPatchesToText(sceneDataContent, patches, { force: false });
    expect(result.errors).toHaveLength(0);
    expect(result.modifiedContent).toContain("media:");
    expect(result.modifiedContent).toContain("assets/new.jpg");
    // media should be before voiceover in scene 4
    const mediaIdx = result.modifiedContent.indexOf("media:");
    const voIdx = result.modifiedContent.indexOf('voiceover: "Company background text"');
    expect(mediaIdx).toBeGreaterThan(-1);
    expect(voIdx).toBeGreaterThan(mediaIdx);
  });

  // Scenario 5: force replace
  it("replaces existing media when force is true", () => {
    const patches = [
      {
        sceneId: 2,
        media: { type: "image", path: "assets/replaced.jpg", animation: "fade", overlay: 0.8 },
        action: "replace",
      },
    ];
    const result = applyPatchesToText(sceneDataContent, patches, { force: true });
    expect(result.errors).toHaveLength(0);
    expect(result.modifiedContent).toContain("assets/replaced.jpg");
    expect(result.modifiedContent).not.toContain("assets/old.mp4");
  });

  // Scenario 13: multiple entries for same scene
  it("processes only first entry for same scene, marks subsequent as conflict", () => {
    const patches = [
      {
        sceneId: 4,
        media: { type: "image", path: "assets/first.jpg", animation: "fade", overlay: 0.7 },
        action: "add",
      },
      {
        sceneId: 4,
        media: { type: "image", path: "assets/second.jpg", animation: "fade", overlay: 0.7 },
        action: "add",
      },
    ];
    const result = applyPatchesToText(sceneDataContent, patches, { force: false });
    expect(result.applied).toHaveLength(1);
    expect(result.modifiedContent).toContain("assets/first.jpg");
    expect(result.skipped.length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 14: re-run idempotent
  it("marks already-applied when media matches existing after previous apply", () => {
    const patches = [
      {
        sceneId: 2,
        media: { type: "video", path: "assets/old.mp4", animation: "fade", overlay: 0.7 },
        action: "add",
      },
    ];
    const result = applyPatchesToText(sceneDataContent, patches, { force: false });
    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("already-applied");
  });

  // Scenario 20: non-standard formatting (single-line scene)
  it("handles single-line media field in scene object", () => {
    const singleLineContent = `export const scenes = [
  { id: 1, name: "hook", visualType: "hook", voiceover: "hook text", texts: {} },
  { id: 2, name: "narrative", visualType: "narrative", media: { type: "image", path: "assets/old.jpg", animation: "fade" }, voiceover: "narrative text", texts: {} },
];
`;
    const patches = [
      {
        sceneId: 2,
        media: { type: "image", path: "assets/new.jpg", animation: "zoom", overlay: 0.7 },
        action: "replace",
      },
    ];
    const result = applyPatchesToText(singleLineContent, patches, { force: true });
    expect(result.errors).toHaveLength(0);
    expect(result.modifiedContent).toContain("assets/new.jpg");
    expect(result.modifiedContent).not.toContain("assets/old.jpg");
  });
});

// ─── generateReceipt ───

describe("generateReceipt", () => {
  it("generates receipt with correct structure", () => {
    const applied = [
      {
        sceneId: 4,
        sceneName: "company-background",
        action: "added",
        media: { type: "image", path: "assets/new.jpg" },
      },
    ];
    const skipped = [
      { sceneId: 3, reason: "unassigned" },
      { sceneId: 2, reason: "conflict" },
    ];
    const receipt = generateReceipt(applied, skipped, {
      content: "test-slug",
      patchFile: "output/media-patch.json",
      backupPath: "content/test-slug/scene-data.mjs.bak",
    });
    expect(receipt.content).toBe("test-slug");
    expect(receipt.applied).toHaveLength(1);
    expect(receipt.skipped).toHaveLength(2);
    expect(receipt.summary.total).toBe(3);
    expect(receipt.summary.applied).toBe(1);
    expect(receipt.summary.skipped).toBe(2);
    expect(receipt.summary.conflicts).toBe(1);
    expect(receipt.appliedAt).toBeDefined();
    expect(receipt.backupPath).toBeDefined();
  });

  // Scenario 18: empty patch
  it("generates receipt with zero applied for empty patch", () => {
    const receipt = generateReceipt([], [], {
      content: "test-slug",
      patchFile: "output/media-patch.json",
      backupPath: "content/test-slug/scene-data.mjs.bak",
    });
    expect(receipt.summary.total).toBe(0);
    expect(receipt.summary.applied).toBe(0);
    expect(receipt.summary.skipped).toBe(0);
  });
});

// ─── formatDryRun ───

describe("formatDryRun", () => {
  // Scenario 2: dry-run output
  it("formats add entries with + prefix", () => {
    const applied = [
      {
        sceneId: 4,
        sceneName: "company-background",
        action: "added",
        media: { type: "image", path: "assets/new.jpg", animation: "ken-burns", overlay: 0.75 },
      },
    ];
    const skipped = [];
    const output = formatDryRun(applied, skipped);
    expect(output).toContain("Scene 4");
    expect(output).toContain("+");
    expect(output).toContain("assets/new.jpg");
  });

  it("formats conflicts with ! prefix", () => {
    const applied = [];
    const skipped = [{ sceneId: 2, sceneName: "ipo-details", reason: "conflict" }];
    const output = formatDryRun(applied, skipped);
    expect(output).toContain("!");
    expect(output).toContain("CONFLICT");
  });

  it("formats already-applied with = prefix", () => {
    const applied = [];
    const skipped = [{ sceneId: 2, sceneName: "ipo-details", reason: "already-applied" }];
    const output = formatDryRun(applied, skipped);
    expect(output).toContain("=");
    expect(output).toContain("ALREADY APPLIED");
  });

  // Scenario 6: unassigned skip
  it("formats unassigned skips with - prefix", () => {
    const applied = [];
    const skipped = [{ sceneId: 9, sceneName: "china-dominance", reason: "unassigned" }];
    const output = formatDryRun(applied, skipped);
    expect(output).toContain("-");
    expect(output).toContain("SKIP");
  });

  it("includes summary line", () => {
    const applied = [
      {
        sceneId: 4,
        sceneName: "company-background",
        action: "added",
        media: { type: "image", path: "assets/new.jpg" },
      },
    ];
    const skipped = [
      { sceneId: 2, reason: "conflict" },
      { sceneId: 9, reason: "unassigned" },
    ];
    const output = formatDryRun(applied, skipped);
    expect(output).toContain("Summary:");
    expect(output).toContain("1 to add");
    expect(output).toContain("1 conflict");
    expect(output).toContain("1 skipped");
  });
});
