/**
 * Media-density gate (#1296).
 *
 * A pack whose every media-capable scene renders text-only is not a style
 * choice — it is the failure mode that shipped three all-text videos on
 * 2026-11-13: 17 of 37 packs carried zero media and nothing stopped them.
 *
 * The gate is deliberately narrow: `data` / `cta` can never draw media
 * (NO_MEDIA_TYPES) and a hook with an explicit `media: null` waiver opted out,
 * so an all-text pack made of those is legitimate. Hooks without a waiver
 * count as capable since 2026-11-14 (auto-sourcing covers the opening).
 */
import { describe, it, expect } from "vitest";
import { checkMediaDensity, checkMediaDensityPreflight } from "../lib/scene-rules.mjs";

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
    const scenes = [scene(1, "hook", { media: null }), scene(2, "data"), scene(3, "cta")];
    const [result] = checkMediaDensity(scenes);
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("无可承载画面");
  });

  it("stat-reveal counts as capable since it renders ambient media (2026-11-14)", () => {
    // A pack made only of hook + stat-reveal now has a drawable scene, so the
    // floor applies to it instead of passing as "nothing capable".
    const scenes = [scene(1, "hook", { media: null }), scene(2, "stat-reveal")];
    expect(level(scenes)).toBe("fail");
    expect(level([scenes[0], withMedia(2, "stat-reveal")])).toBe("pass");
  });

  it("counts an unwaived hook as capable; a media:null waiver still opts the opening out", () => {
    // 2026-11-14: hooks enter auto-sourcing, so an opening without a waiver
    // must carry media like any other capable scene; `media: null` remains the
    // deliberate CSS-only opening.
    expect(level([scene(1, "hook"), scene(2, "cta")])).toBe("fail");
    expect(level([scene(1, "hook", { media: null }), scene(2, "cta")])).toBe("pass");
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

describe("checkMediaDensityPreflight", () => {
  // Preflight runs before Step 1.5, and the media it asks about is produced
  // inside the run — a hard row there is a deadlock, so it reports and does not
  // block. The teeth live at Step 1.6 (main.mjs / render-only.mjs).
  const empty = [scene(1, "hook", { media: null }), scene(2, "context"), scene(3, "context")];

  it("downgrades the fail to a warning", () => {
    const [result] = checkMediaDensityPreflight(empty);
    expect(result.level).toBe("warn");
    expect(result.check).toBe("Media density (pre-generation)");
  });

  it("names the step that will actually block", () => {
    const [result] = checkMediaDensityPreflight(empty);
    expect(result.detail).toContain("Step 1.6");
    expect(result.detail).toContain("Step 1.5d");
  });

  it("leaves a satisfied pack as a pass", () => {
    const scenes = [scene(1, "hook", { media: null }), withMedia(2), withMedia(3)];
    expect(checkMediaDensityPreflight(scenes)[0].level).toBe("pass");
  });

  it("keeps the exemption path working", () => {
    expect(
      checkMediaDensityPreflight(empty, { meta: { mediaDensityExempt: "diagram-only" } })[0].level,
    ).toBe("pass");
  });
});
