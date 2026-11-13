/**
 * Media-density gate (#1296).
 *
 * A pack whose every media-capable scene renders text-only is not a style
 * choice — it is the failure mode that shipped three all-text videos on
 * 2026-11-13: 17 of 37 packs carried zero media and nothing stopped them.
 *
 * The gate is deliberately narrow: `data` / `stat-reveal` / `cta` can never
 * draw media (NO_MEDIA_TYPES) and `hook` is manually curated, so those scenes
 * are not "capable" and an all-text pack made of them is legitimate.
 */
import { describe, it, expect } from "vitest";
import { checkMediaDensity } from "../lib/scene-rules.mjs";

const scene = (id, visualType, extra = {}) => ({
  id,
  visualType,
  layout: "hero-center",
  voiceover: `Scene ${id} voiceover.`,
  texts: { title: `S${id}` },
  ...extra,
});

const withMedia = (id, visualType = "context") =>
  scene(id, visualType, { media: { type: "image", path: "assets/x.jpg", mode: "fullscreen" } });

const level = (scenes, opts) => checkMediaDensity(scenes, opts)[0].level;

describe("checkMediaDensity", () => {
  it("fails when four media-capable scenes carry no media", () => {
    const scenes = [
      scene(1, "hook", { media: null }),
      scene(2, "context"),
      scene(3, "context"),
      scene(4, "context"),
      scene(5, "context"),
      scene(6, "cta"),
    ];
    const [result] = checkMediaDensity(scenes);
    expect(result.level).toBe("fail");
    expect(result.category).toBe("Media");
    expect(result.detail).toContain("2,3,4,5");
  });

  it("fails with a single media scene when two are required", () => {
    const scenes = [scene(1, "hook", { media: null }), withMedia(2), scene(3, "context")];
    expect(level(scenes)).toBe("fail");
  });

  it("passes at the two-scene floor", () => {
    const scenes = [scene(1, "hook", { media: null }), withMedia(2), withMedia(3), scene(4, "cta")];
    expect(level(scenes)).toBe("pass");
  });

  it("requires one when only one scene is capable", () => {
    const scenes = [scene(1, "hook", { media: null }), scene(2, "context"), scene(3, "cta")];
    expect(level(scenes)).toBe("fail");
    expect(level([scenes[0], withMedia(2), scenes[2]])).toBe("pass");
  });

  it("does not demand media from a pack that cannot draw any", () => {
    const scenes = [
      scene(1, "hook", { media: null }),
      scene(2, "data"),
      scene(3, "stat-reveal"),
      scene(4, "cta"),
    ];
    const [result] = checkMediaDensity(scenes);
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("无可承载画面");
  });

  it("never counts the hook as capable — it is manually curated", () => {
    const scenes = [scene(1, "hook", { media: null }), scene(2, "cta")];
    expect(level(scenes)).toBe("pass");
  });

  it("honours meta.mediaDensityExempt with the reason on the row", () => {
    const scenes = [scene(1, "hook", { media: null }), scene(2, "context"), scene(3, "context")];
    const [result] = checkMediaDensity(scenes, {
      meta: { mediaDensityExempt: "classroom explainer: every frame is a diagram" },
    });
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("classroom explainer");
  });

  it("treats an empty-string exemption as absent", () => {
    const scenes = [scene(1, "hook", { media: null }), scene(2, "context"), scene(3, "context")];
    expect(level(scenes, { meta: { mediaDensityExempt: "   " } })).toBe("fail");
  });

  it("points at the source-page step and the generation fallback in its fix text", () => {
    const scenes = [scene(1, "hook", { media: null }), scene(2, "context"), scene(3, "context")];
    const [result] = checkMediaDensity(scenes);
    expect(result.fix).toContain("extract-media.mjs");
    expect(result.fix).toContain("默认开启");
    expect(result.fix).toContain("--no-auto-generate");
  });
});
