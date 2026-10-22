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
import { join, resolve } from "path";
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
      runEvidenceCaptures: async () => ({ manifest: false, captured: [], skipped: [] }),
      autoUpscaleIfNeeded: () => ({ upscaled: false }),
      closeVisualAnalyzer: async () => {},
      ...over,
    };
  }

  /** Scene pair: A triggers sourcing (no media field), B triggers upscale (media file exists). */
  function scenePair() {
    return [
      { id: 1, voiceover: "v" },
      { id: 2, voiceover: "w", media: { path: "exists.png" } },
    ];
  }

  function writeSceneMedia() {
    writeFileSync(join(tmp, "content", "c", "exists.png"), "x");
  }

  it("runs stages in order: capture → sourcing → patch → upscale → broll", async () => {
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
        runEvidenceCaptures: async () => {
          order.push("capture");
          return { manifest: true, captured: [], skipped: [] };
        },
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
    expect(order).toEqual(["capture", "sourcing", "upscale", "broll"]);
  });

  it("never stock-sources an evidence scene, even when the capture stage throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sourcer = vi.fn();
    const scene = {
      id: 1,
      voiceover: "v",
      media: {
        type: "image",
        path: "assets/table.png",
        evidence: true,
        provenance: {
          sourceUrl: "https://example.com/changelog",
          selector: "table",
          rect: { x: 0, y: 200, w: 900, h: 400 },
          clip: { x: 0, y: 184, w: 932, h: 432 },
          scale: 2,
        },
      },
    };
    const { ctx } = makeCtx({
      scenes: [scene],
      broll: brollStub(),
      deps: baseDeps({
        runEvidenceCaptures: async () => {
          throw new Error("browser missing");
        },
        sourcerMain: sourcer,
      }),
    });
    await expect(runMediaTrack(ctx)).resolves.toBeUndefined();
    expect(sourcer).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Evidence capture skipped"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("browser missing"));
  });

  it("a successful capture leaves the scene out of stock sourcing", async () => {
    const sourcer = vi.fn();
    const scene = {
      id: 1,
      voiceover: "v",
      media: { type: "image", path: "assets/table.png", evidence: true, provenance: {} },
    };
    const { ctx } = makeCtx({
      scenes: [scene],
      broll: brollStub(),
      deps: baseDeps({
        runEvidenceCaptures: async ({ contentDirAbs }) => {
          mkdirSync(join(contentDirAbs, "assets"), { recursive: true });
          writeFileSync(join(contentDirAbs, "assets/table.png"), "png");
          return {
            manifest: true,
            captured: [{ sceneId: 1, path: "assets/table.png", provenance: {} }],
            skipped: [],
          };
        },
        sourcerMain: sourcer,
      }),
    });
    await runMediaTrack(ctx);
    expect(sourcer).not.toHaveBeenCalled();
  });

  it("a capture failure warns and later stages still run", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const order = [];
    const scene = {
      id: 1,
      voiceover: "v",
      media: { type: "image", path: "assets/table.png", evidence: true, provenance: {} },
    };
    const { ctx } = makeCtx({
      scenes: [scene],
      broll: brollStub({
        scenesRequiringGeneration: () => [scene],
        runBrollStage: async () => {
          order.push("broll");
          return { counts: {} };
        },
      }),
      deps: baseDeps({
        runEvidenceCaptures: async () => {
          throw new Error("selector matched 0 elements");
        },
        autoUpscaleIfNeeded: () => {
          order.push("upscale");
          return { upscaled: false };
        },
      }),
    });
    await expect(runMediaTrack(ctx)).resolves.toBeUndefined();
    expect(order).toEqual(["upscale", "broll"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Evidence capture skipped"));
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

  it("skips upscale when scene.media.upscale is explicitly false (#425)", async () => {
    const calls = [];
    const scene = { id: 1, voiceover: "v", media: { path: "small.png", upscale: false } };
    const { ctx } = makeCtx({
      scenes: [scene],
      broll: null,
      deps: baseDeps({
        autoUpscaleIfNeeded: (p) => {
          calls.push(p);
          return { upscaled: true, path: join(tmp, "content", "c", "big.png") };
        },
      }),
    });
    writeFileSync(join(tmp, "content", "c", "small.png"), "x");
    await runMediaTrack(ctx);
    expect(calls).toEqual([]);
    expect(scene.media.path).toBe("small.png");
    expect(scene.media.upscale).toBe(false);
  });

  it("handles mixed upscale flags: false is skipped, true/absent are upscaled (#425)", async () => {
    const calls = [];
    const scenes = [
      { id: 1, voiceover: "v1", media: { path: "s1-optout.png", upscale: false } },
      { id: 2, voiceover: "v2", media: { path: "s2-default.png" } },
      { id: 3, voiceover: "v3", media: { path: "s3-explicit-true.png", upscale: true } },
    ];
    const { ctx } = makeCtx({
      scenes,
      broll: null,
      deps: baseDeps({
        autoUpscaleIfNeeded: (p) => {
          calls.push(p);
          const fname = p.split("/").pop();
          return { upscaled: true, path: join(tmp, "content", "c", `upscaled-${fname}`) };
        },
      }),
    });
    writeFileSync(join(tmp, "content", "c", "s1-optout.png"), "x");
    writeFileSync(join(tmp, "content", "c", "s2-default.png"), "x");
    writeFileSync(join(tmp, "content", "c", "s3-explicit-true.png"), "x");

    await runMediaTrack(ctx);

    // s1 is never passed to autoUpscaleIfNeeded
    expect(calls).toEqual([
      resolve(tmp, "content", "c", "s2-default.png"),
      resolve(tmp, "content", "c", "s3-explicit-true.png"),
    ]);
    expect(scenes[0].media.path).toBe("s1-optout.png");
    expect(scenes[0].media.upscale).toBe(false);
    expect(scenes[1].media.path).toBe("upscaled-s2-default.png");
    expect(scenes[2].media.path).toBe("upscaled-s3-explicit-true.png");
  });

  it("respects upscale: false from applied media patch (#425)", async () => {
    const calls = [];
    const scene = { id: 2, voiceover: "v" };
    const { ctx, contentDir } = makeCtx({
      scenes: [scene],
      broll: null,
      deps: baseDeps({
        autoUpscaleIfNeeded: (p) => {
          calls.push(p);
          return { upscaled: true, path: join(tmp, "content", "c", "patched-upscaled.png") };
        },
      }),
    });
    const patchDir = join(tmp, "output", contentDir);
    mkdirSync(patchDir, { recursive: true });
    writeFileSync(
      join(patchDir, "media-patch.json"),
      JSON.stringify({
        schemaVersion: 1,
        patches: [
          { sceneId: 2, status: "assigned", media: { path: "patched.png", upscale: false } },
        ],
      }),
    );
    writeFileSync(join(tmp, "content", "c", "patched.png"), "x");

    await runMediaTrack(ctx);

    expect(calls).toEqual([]);
    expect(scene.media.path).toBe("patched.png");
    expect(scene.media.upscale).toBe(false);
  });
});
