/**
 * Cache side of incremental rendering (#228 ③, T3): which previous version is
 * safe to reuse, what gets pruned, and what "composition changed" means.
 * These are filesystem contracts, so each case builds a throwaway output tree.
 */
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import {
  findIncrementalBase,
  pruneRenderCache,
  sceneMediaSha256,
} from "../lib/render-remotion.mjs";
import { computeCompositionFingerprint } from "../lib/render-composition.mjs";
import { INCREMENTAL_SCHEMA } from "../lib/render-incremental.mjs";

const dirs = [];
afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function tmp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function writeManifest(outputDir, version, { fingerprint = "comp-a", segments, createdAt }) {
  const dir = join(outputDir, "render", version);
  mkdirSync(dir, { recursive: true });
  for (const segment of segments) {
    if (segment.path.startsWith("render/")) {
      const abs = join(outputDir, segment.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, "part");
    } else if (segment.path.endsWith("-raw.mp4")) {
      writeFileSync(join(outputDir, segment.path), "raw");
    }
  }
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      schema: 1,
      kind: "render",
      createdAt,
      pipelineId: "demo",
      version,
      rawPath: null,
      finalPath: join(outputDir, "demo-short.mp4"),
      propsPath: join(dir, "props.json"),
      audioDir: join(outputDir, "audio"),
      finalize: { deleteRawAfter: true, sceneDurations: [], audioBasenames: [] },
      command: ["npx"],
      incremental: {
        schema: INCREMENTAL_SCHEMA,
        fps: 30,
        totalFrames: 100,
        compositionFingerprint: fingerprint,
        segments,
      },
    }),
  );
  return dir;
}

describe("findIncrementalBase", () => {
  it("returns the newest matching cache and resolves relative segments", () => {
    const outputDir = tmp("inc-base-");
    writeManifest(outputDir, "v1", {
      segments: [{ path: "render/v1/part-000.mp4", startFrame: 0, endFrame: 100 }],
      createdAt: "2026-11-20T10:00:00.000Z",
    });
    writeManifest(outputDir, "v2", {
      fingerprint: "comp-b",
      segments: [{ path: "render/v2/part-000.mp4", startFrame: 0, endFrame: 100 }],
      createdAt: "2026-11-20T11:00:00.000Z",
    });
    const base = findIncrementalBase({
      outputDir,
      compositionFingerprint: "comp-a",
      fps: 30,
    });
    expect(base?.version).toBe("v1");
  });

  it("skips a newer cache whose part files are gone", () => {
    const outputDir = tmp("inc-missing-");
    writeManifest(outputDir, "v1", {
      segments: [{ path: "render/v1/part-000.mp4", startFrame: 0, endFrame: 100 }],
      createdAt: "2026-11-20T10:00:00.000Z",
    });
    const dir = writeManifest(outputDir, "v2", {
      segments: [{ path: "render/v2/part-000.mp4", startFrame: 0, endFrame: 100 }],
      createdAt: "2026-11-20T11:00:00.000Z",
    });
    rmSync(join(outputDir, "render", "v2", "part-000.mp4"), { force: true });
    const base = findIncrementalBase({ outputDir, compositionFingerprint: "comp-a" });
    expect(base?.version).toBe("v1");
    expect(dir).toBeTruthy();
  });

  it("ignores the version being rendered right now", () => {
    const outputDir = tmp("inc-exclude-");
    writeManifest(outputDir, "v1", {
      segments: [{ path: "render/v1/part-000.mp4", startFrame: 0, endFrame: 100 }],
    });
    expect(
      findIncrementalBase({
        outputDir,
        compositionFingerprint: "comp-a",
        excludeVersion: "v1",
      }),
    ).toBeNull();
  });
});

describe("pruneRenderCache", () => {
  it("keeps the newest two versions, drops the rest, and protects shared raw files", () => {
    const outputDir = tmp("inc-prune-");
    const raw = "demo-v1-raw.mp4";
    const v1 = writeManifest(outputDir, "v1", {
      segments: [
        { path: raw, startFrame: 0, endFrame: 100, generation: 0 },
        { path: "render/v1/part-000.mp4", startFrame: 0, endFrame: 100, generation: 1 },
      ],
      createdAt: "2026-11-20T10:00:00.000Z",
    });
    const v2 = writeManifest(outputDir, "v2", {
      segments: [{ path: raw, startFrame: 0, endFrame: 100, generation: 0 }],
      createdAt: "2026-11-20T11:00:00.000Z",
    });
    const v3 = writeManifest(outputDir, "v3", {
      segments: [{ path: "render/v3/part-000.mp4", startFrame: 0, endFrame: 100, generation: 1 }],
      createdAt: "2026-11-20T12:00:00.000Z",
    });

    const { removed } = pruneRenderCache({ outputDir, keep: 2, keepVersion: "v3" });
    // v1 is third-newest; its raw is still referenced by v2, so only its dir
    // and its own part file are removed.
    expect(removed).toContain(join("render", "v1", "part-000.mp4"));
    expect(removed).toContain(join("render", "v1"));
    expect(removed).not.toContain(raw);

    // The kept versions and the shared raw survive.
    expect(existsSync(v2)).toBe(true);
    expect(existsSync(v3)).toBe(true);
    expect(existsSync(join(outputDir, raw))).toBe(true);
    expect(existsSync(v1)).toBe(false);
  });
});

describe("computeCompositionFingerprint", () => {
  it("changes when a component changes and ignores fixtures", () => {
    const remotionDir = tmp("inc-comp-");
    mkdirSync(join(remotionDir, "src"), { recursive: true });
    writeFileSync(join(remotionDir, "package.json"), "{}");
    writeFileSync(join(remotionDir, "src", "ShortVideo.tsx"), "export const a = 1;");
    writeFileSync(join(remotionDir, "src", "media-offset-fixture.tsx"), "fixture 1");

    const first = computeCompositionFingerprint({ remotionDir });
    writeFileSync(join(remotionDir, "src", "media-offset-fixture.tsx"), "fixture 2");
    const fixtureOnly = computeCompositionFingerprint({ remotionDir });
    expect(fixtureOnly.fingerprint).toBe(first.fingerprint);

    writeFileSync(join(remotionDir, "src", "ShortVideo.tsx"), "export const a = 2;");
    const changed = computeCompositionFingerprint({ remotionDir });
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(changed.entries.map((e) => e.path)).toContain(join("src", "ShortVideo.tsx"));
  });
});

describe("sceneMediaSha256", () => {
  it("is stable for the same bytes and changes when a staged file changes", () => {
    const assets = tmp("inc-media-");
    mkdirSync(join(assets, "_staged"), { recursive: true });
    writeFileSync(join(assets, "_staged", "a.mp4"), "v1");
    const scene = { media: { path: "_staged/a.mp4" } };
    const first = sceneMediaSha256(scene, assets);
    expect(sceneMediaSha256(scene, assets)).toBe(first);
    writeFileSync(join(assets, "_staged", "a.mp4"), "v2");
    expect(sceneMediaSha256(scene, assets)).not.toBe(first);
    expect(sceneMediaSha256({}, assets)).toBeNull();
  });
});
