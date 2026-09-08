/**
 * Tests for the extracted media track (#225 optimization 1).
 *
 * The media track (sourcing → media-patch → upscale → B-roll) used to run
 * serially before TTS. It only touches scene media fields, never scene
 * text, so it now runs as its own track concurrent with the voice track.
 * The track preserves the original failure semantics: every stage is
 * non-blocking (failure → warn → continue), and the final media gate is
 * NOT part of the track (main.mjs runs it after both tracks join).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { runMediaTrack } from "../lib/media-track.mjs";

describe("media-track", () => {
  let tmp;
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = null;
    vi.restoreAllMocks();
  });

  function makeCtx({ scenes, broll, deps } = {}) {
    tmp = mkdtempSync("media-track-test-");
    const contentDir = "c";
    mkdirSync(join(tmp, "content", contentDir), { recursive: true });
    return {
      ctx: { scenes: scenes ?? [], contentDir, baseDir: tmp, broll: broll ?? null, deps },
      contentDir,
    };
  }

  /** Broll stub that passes the sourcing filter; generation stubs go in overrides. */
  function brollStub(overrides = {}) {
    return {
      shouldSourceStock: () => true,
      scenesRequiringGeneration: () => [],
      runBrollStage: async () => ({ counts: { generated: 0 } }),
      ...overrides,
    };
  }

  /**
   * Default DI seams. NOTE: runBrollStage is intentionally NOT here — the
   * module prefers deps.runBrollStage over the broll module's own, and the
   * stage-under-test must come from the broll stub to be observable.
   */
  function baseDeps(over = {}) {
    return {
      sourcerMain: async () => {},
      autoUpscaleIfNeeded: () => ({ upscaled: false }),
      closeVisualAnalyzer: async () => {},
      ...over,
    };
  }

  /** Scene pair: A triggers sourcing (no media field), B triggers upscale (media file exists). */
  function scenePair() {
    return [{ id: 1, voiceover: "v" }, { id: 2, voiceover: "w", media: { path: "exists.png" } }];
  }

  function writeSceneMedia() {
    writeFileSync(join(tmp, "content", "c", "exists.png"), "x");
  }

  it("runs stages in order: sourcing → patch → upscale → broll", async () => {
    const order = [];
    const scenes = scenePair();
    const { ctx } = makeCtx({
      scenes,
      broll: brollStub({
        scenesRequiringGeneration: () => [scenes[0]],
        runBrollStage: async () => {
          order.push("broll");
          return { counts: { generated: 1 } };
        },
      }),
      deps: baseDeps({
        sourcerMain: async () => {
          order.push("sourcing");
        },
        autoUpscaleIfNeeded: () => {
          order.push("upscale");
          return { upscaled: false };
        },
      }),
    });
    writeSceneMedia();
    await runMediaTrack(ctx);
    expect(order).toEqual(["sourcing", "upscale", "broll"]);
  });

  it("a sourcing failure is contained: later stages still run, no throw", async () => {
    const order = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scenes = scenePair();
    const { ctx } = makeCtx({
      scenes,
      broll: brollStub({
        scenesRequiringGeneration: () => [scenes[0]],
        runBrollStage: async () => {
          order.push("broll");
          return { counts: {} };
        },
      }),
      deps: baseDeps({
        sourcerMain: async () => {
          throw new Error("search exploded");
        },
        autoUpscaleIfNeeded: () => {
          order.push("upscale");
          return { upscaled: false };
        },
      }),
    });
    writeSceneMedia();
    await expect(runMediaTrack(ctx)).resolves.toBeUndefined();
    expect(order).toContain("upscale");
    expect(order).toContain("broll");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Asset sourcing skipped"));
  });

  it("an upscale failure is contained: broll still runs", async () => {
    const ran = { broll: false };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const scene = { id: 1, voiceover: "v", media: { path: "exists.png" } };
    const { ctx } = makeCtx({
      scenes: [scene],
      broll: brollStub({
        scenesRequiringGeneration: () => [scene],
        runBrollStage: async () => {
          ran.broll = true;
          return { counts: {} };
        },
      }),
      deps: baseDeps({
        autoUpscaleIfNeeded: () => {
          throw new Error("realesrgan missing");
        },
      }),
    });
    // Media path must exist for the upscale stage to engage — create it.
    writeFileSync(join(tmp, "content", "c", "exists.png"), "x");
    await expect(runMediaTrack(ctx)).resolves.toBeUndefined();
    expect(ran.broll).toBe(true);
  });

  it("a broll stage failure is contained", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const scene = { id: 1, voiceover: "v" };
    const { ctx } = makeCtx({
      scenes: [scene],
      broll: brollStub({
        scenesRequiringGeneration: () => [scene],
        runBrollStage: async () => {
          throw new Error("gpu offline");
        },
      }),
      deps: baseDeps(),
    });
    await expect(runMediaTrack(ctx)).resolves.toBeUndefined();
  });

  it("skips sourcing when no scene needs media", async () => {
    const calls = { sourcer: 0 };
    // Explicit media:null → skipsMediaSourcing() → not in scenesNeedingMedia.
    const scene = { id: 1, voiceover: "v", media: null };
    const { ctx } = makeCtx({
      scenes: [scene],
      broll: brollStub(),
      deps: baseDeps({
        sourcerMain: async () => {
          calls.sourcer++;
        },
      }),
    });
    await runMediaTrack(ctx);
    expect(calls.sourcer).toBe(0);
  });

  it("upscale result rewrites scene.media.path in memory", async () => {
    const scene = { id: 1, voiceover: "v", media: { path: "small.png" } };
    const { ctx } = makeCtx({
      scenes: [scene],
      broll: null,
      deps: baseDeps({
        autoUpscaleIfNeeded: () => ({ upscaled: true, path: join(tmp, "content", "c", "big.png") }),
      }),
    });
    writeFileSync(join(tmp, "content", "c", "small.png"), "x");
    writeFileSync(join(tmp, "content", "c", "big.png"), "x");
    await runMediaTrack(ctx);
    expect(scene.media.path).toBe("big.png");
  });

  it("broll.depsError is reported as a warning, scenes untouched", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scene = { id: 1, voiceover: "v" };
    const { ctx } = makeCtx({
      scenes: [scene],
      broll: brollStub({
        scenesRequiringGeneration: () => [scene],
        runBrollStage: async () => ({ depsError: "no gpu tier" }),
      }),
      deps: baseDeps(),
    });
    await expect(runMediaTrack(ctx)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("B-roll skipped"));
    expect(scene.brollPath).toBeUndefined();
  });

  it("applies an assigned media patch to scenes lacking media", async () => {
    // applyAssignedMedia only fills scenes WITHOUT existing media (original
    // semantics: patches never replace authored media).
    const scene = { id: 2, voiceover: "v" };
    const { ctx, contentDir } = makeCtx({ scenes: [scene], broll: null, deps: baseDeps() });
    // Real patch file at the documented location.
    const patchDir = join(tmp, "output", contentDir);
    mkdirSync(patchDir, { recursive: true });
    writeFileSync(
      join(patchDir, "media-patch.json"),
      JSON.stringify({
        schemaVersion: 1,
        patches: [{ sceneId: 2, status: "assigned", media: { path: "found.png" } }],
      }),
    );
    writeFileSync(join(tmp, "content", "c", "found.png"), "x");
    await runMediaTrack(ctx);
    expect(scene.media.path).toBe("found.png");
  });
});
