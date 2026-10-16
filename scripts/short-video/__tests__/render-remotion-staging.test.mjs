// Render-time asset staging location.
//
// renderRemotion copies content media into remotion/public/assets/ before every
// render. That directory is a SYMLINK to the curated scripts/short-video/assets/
// (brand assets, catalog.yml, bgm/, dh-fixtures/), so a flat copy lands a staged
// file inside the curated namespace — indistinguishable from a hand-curated
// asset, and left behind as untracked noise after every render.
//
// Observed 2026-10-16: a render of content/deepseek-flash-silent-update left 8
// untracked files in the curated directory, 5 of them byte-identical copies of
// that package's own assets. The directory had accumulated 57 such copies in
// total (47 hidden by the source-prefix ignore rules, 5 committed to git).
//
// The contract this suite pins: a staged copy lives under `_staged/`, and the
// scene path handed to Remotion names that subdirectory. Both consumers prepend
// `assets/` to a path that does not already start with it (AvatarCard.tsx:91,
// MediaBackground.tsx:115 and :215), so `_staged/x.png` resolves to
// public/assets/_staged/x.png — a subdirectory of the curated dir, not a peer of
// its files.
//
// Real files in a temp dir — no fs mocks; ffprobe is a hard pipeline dep.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  statSync,
  utimesSync,
  rmSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { stageAsset, stagedAssetRelPath, stageAvatarVideos } from "../lib/render-remotion.mjs";

let contentDir;
let publicAssetsDir;

/** Minimal real H.264 video (color bars, 0.5s) — a file ffprobe can read. */
function makeRealVideo(dest) {
  execFileSync(
    "ffmpeg",
    [
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=64x64:d=0.5",
      "-frames:v",
      "15",
      "-pix_fmt",
      "yuv420p",
      "-y",
      dest,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
}

beforeEach(() => {
  contentDir = mkdtempSync(join(tmpdir(), "staging-content-"));
  publicAssetsDir = mkdtempSync(join(tmpdir(), "staging-public-"));
  mkdirSync(join(contentDir, "assets"), { recursive: true });
});

afterEach(() => {
  rmSync(contentDir, { recursive: true, force: true });
  rmSync(publicAssetsDir, { recursive: true, force: true });
});

describe("stagedAssetRelPath — the staged path form", () => {
  it("names the _staged subdirectory, not the curated root", () => {
    expect(stagedAssetRelPath("chart.png")).toBe("_staged/chart.png");
  });
});

describe("stageAsset — copy destination", () => {
  it("copies into _staged/ and leaves the curated root untouched", () => {
    const src = join(contentDir, "assets", "chart.png");
    writeFileSync(src, "chart-bytes");

    const rel = stageAsset({ srcPath: src, publicAssetsDir, label: "📸 Copied media" });

    expect(rel).toBe("_staged/chart.png");
    expect(readFileSync(join(publicAssetsDir, "_staged", "chart.png"), "utf8")).toBe("chart-bytes");
    // The load-bearing assertion: the curated root stays clean. This is the
    // regression the flat copy produced — the file that used to appear as
    // untracked noise in scripts/short-video/assets/.
    expect(existsSync(join(publicAssetsDir, "chart.png"))).toBe(false);
  });

  it("creates _staged/ when the public assets dir does not have it yet", () => {
    const src = join(contentDir, "assets", "fresh.png");
    writeFileSync(src, "fresh-bytes");

    expect(() =>
      stageAsset({ srcPath: src, publicAssetsDir, label: "📸 Copied media" }),
    ).not.toThrow();
    expect(statSync(join(publicAssetsDir, "_staged")).isDirectory()).toBe(true);
  });

  it("keeps the curated root clean for a nested source (backdrop shape)", () => {
    const src = join(contentDir, "assets", "b-roll", "scene-8-seed7777.mp4");
    mkdirSync(join(contentDir, "assets", "b-roll"), { recursive: true });
    writeFileSync(src, "clip-bytes");

    const rel = stageAsset({ srcPath: src, publicAssetsDir, label: "📸 Copied backdrop" });

    expect(rel).toBe("_staged/scene-8-seed7777.mp4");
    expect(existsSync(join(publicAssetsDir, "scene-8-seed7777.mp4"))).toBe(false);
  });

  it("returns the staged path on a cache hit without rewriting the file", () => {
    const src = join(contentDir, "assets", "cached.png");
    writeFileSync(src, "same-bytes");
    const first = stageAsset({ srcPath: src, publicAssetsDir, label: "📸 Copied media" });
    const stagedPath = join(publicAssetsDir, "_staged", "cached.png");
    // Pin the staged copy to the source timestamp — the cache-hit shape.
    const { mtimeMs: srcMtime } = statSync(src);
    utimesSync(stagedPath, srcMtime / 1000, srcMtime / 1000);
    const before = statSync(stagedPath).mtimeMs;

    const second = stageAsset({ srcPath: src, publicAssetsDir, label: "📸 Copied media" });

    expect(first).toBe("_staged/cached.png");
    expect(second).toBe("_staged/cached.png");
    expect(statSync(stagedPath).mtimeMs).toBe(before);
  });

  it("re-copies into _staged/ when the staged copy is stale", () => {
    const src = join(contentDir, "assets", "edited.png");
    writeFileSync(src, "old-bytes");
    stageAsset({ srcPath: src, publicAssetsDir, label: "📸 Copied media" });

    writeFileSync(src, "new-bytes-longer");
    stageAsset({ srcPath: src, publicAssetsDir, label: "📸 Copied media" });

    expect(readFileSync(join(publicAssetsDir, "_staged", "edited.png"), "utf8")).toBe(
      "new-bytes-longer",
    );
  });
});

describe("stageAsset — containment", () => {
  it("derives the destination name from basename(srcPath), so a walking source cannot escape _staged/", () => {
    // A scene-data `path` is authored text. The staged name must come from
    // basename(), never from the authored path — that flattening is the whole
    // reason a traversal-shaped `path` cannot write outside the staged dir.
    const nested = join(contentDir, "assets", "b-roll", "deep.png");
    mkdirSync(join(contentDir, "assets", "b-roll"), { recursive: true });
    writeFileSync(nested, "deep-bytes");

    // A path that walks up and back down, resolving to the real file.
    const walking = join(contentDir, "assets", "b-roll", "..", "b-roll", "deep.png");
    const rel = stageAsset({ srcPath: walking, publicAssetsDir, label: "📸 Copied media" });

    expect(rel).toBe("_staged/deep.png");
    expect(readFileSync(join(publicAssetsDir, "_staged", "deep.png"), "utf8")).toBe("deep-bytes");
    // One level deep, and nothing beside or above it.
    expect(existsSync(join(publicAssetsDir, "deep.png"))).toBe(false);
    expect(existsSync(join(publicAssetsDir, "..", "deep.png"))).toBe(false);
  });

  it("flattens an absolute source path to its basename", () => {
    const abs = join(contentDir, "assets", "absolute.png");
    writeFileSync(abs, "abs-bytes");

    const rel = stageAsset({ srcPath: abs, publicAssetsDir, label: "📸 Copied media" });

    expect(rel).toBe("_staged/absolute.png");
    expect(readFileSync(join(publicAssetsDir, "_staged", "absolute.png"), "utf8")).toBe(
      "abs-bytes",
    );
  });
});

describe("stageAvatarVideos — staged path handed to Remotion", () => {
  it("rewrites videoPath to the _staged form and copies under _staged/", () => {
    mkdirSync(join(contentDir, "assets", "avatar"), { recursive: true });
    makeRealVideo(join(contentDir, "assets", "avatar", "cta.mp4"));
    const scene = {
      id: 6,
      visualType: "cta",
      voiceover: "Follow for more.",
      avatar: { videoPath: "assets/avatar/cta.mp4", position: "right-card" },
    };

    const staged = stageAvatarVideos({ scenes: [scene], contentDir, publicAssetsDir });

    expect(staged).toBe(1);
    expect(scene.avatar.videoPath).toBe("_staged/cta.mp4");
    expect(existsSync(join(publicAssetsDir, "_staged", "cta.mp4"))).toBe(true);
    expect(existsSync(join(publicAssetsDir, "cta.mp4"))).toBe(false);
    expect(scene.avatar.position).toBe("right-card");
  });
});
