/**
 * Tests for the shared final-media gate (T7).
 *
 * The gate runs AFTER asset sourcing, not at preflight: preflight sits before
 * Step 1.5, so failing there would block the very mechanism (auto search) that
 * can supply the missing media.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  MEDIA_DEPENDENT_LAYOUTS,
  NO_MEDIA_TYPES,
  checkFinalMedia,
} from "../lib/final-media-gate.mjs";

/** Build a throwaway content dir with the media files the scenes reference. */
function makeContentDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "media-gate-"));
  const assets = join(dir, "assets");
  mkdirSync(assets, { recursive: true });
  for (const file of files) {
    writeFileSync(join(assets, file), "fake");
  }
  return dir;
}

const withMedia = (over = {}) => ({ type: "image", path: "assets/present.jpg", ...over });

describe("layout classification", () => {
  it("treats the text-over-media layouts as media dependent", () => {
    expect([...MEDIA_DEPENDENT_LAYOUTS].sort()).toEqual([
      "media-bottom-bar",
      "media-overlay",
      "media-split",
    ]);
  });

  it("never requires media for scene types that render none", () => {
    expect(NO_MEDIA_TYPES.has("cta")).toBe(true);
  });
});

describe("checkFinalMedia", () => {
  it("FAILS a media-dependent layout with no media and no opt-out", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 1, visualType: "narrative", layout: "media-overlay" }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatchObject({ sceneId: 1, reason: "missing-media" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS immediately when a media-dependent layout also opts out", () => {
    // A layout whose typography is built around a media layer cannot declare
    // "no media, on purpose" — that combination is a contradiction, not a gap
    // that sourcing could fix.
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 2, visualType: "narrative", layout: "media-split", mediaOptOut: true }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("opt-out-on-media-layout");
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES a CSS-only layout that opts out, with no warning", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 3, visualType: "narrative", layout: "stacked-cards", mediaOptOut: true }],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("FAILS when media is declared but the file is still absent after sourcing", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [{ id: 4, visualType: "narrative", layout: "stacked-cards", media: withMedia({ path: "assets/gone.jpg" }) }],
      contentDir: dir,
    });
    expect(result.pass).toBe(false);
    expect(result.failures[0].reason).toBe("missing-media");
    expect(result.failures[0].path).toBe("assets/gone.jpg");
    rmSync(dir, { recursive: true, force: true });
  });

  it("PASSES when every declared media file exists", () => {
    const dir = makeContentDir(["present.jpg"]);
    const result = checkFinalMedia({
      scenes: [{ id: 5, visualType: "narrative", layout: "media-overlay", media: withMedia() }],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips scene types that never render media", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [
        { id: 6, visualType: "cta" },
        { id: 7, visualType: "data" },
        { id: 8, visualType: "stat-reveal" },
      ],
      contentDir: dir,
    });
    expect(result.pass).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports every offending scene, not just the first", () => {
    const dir = makeContentDir([]);
    const result = checkFinalMedia({
      scenes: [
        { id: 9, visualType: "narrative", layout: "media-overlay" },
        { id: 10, visualType: "narrative", layout: "media-bottom-bar" },
      ],
      contentDir: dir,
    });
    expect(result.failures.map((f) => f.sceneId)).toEqual([9, 10]);
    rmSync(dir, { recursive: true, force: true });
  });
});
