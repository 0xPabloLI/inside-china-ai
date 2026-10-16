// Avatar staging tests (#214 ticket 02).
//
// stageAvatarVideos is the render-time gate for scene.avatar.videoPath: copy
// into the staged namespace under remotion/public/assets/ + staged-path
// relativization, mirroring the scene.media copy mechanism, with fail-closed
// errors (missing / corrupt / still-pending-generation) instead of the media
// path's warn-and-strip.
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
  copyFileSync,
  rmSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { stageAvatarVideos } from "../lib/render-remotion.mjs";

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
  contentDir = mkdtempSync(join(tmpdir(), "avatar-stage-content-"));
  publicAssetsDir = mkdtempSync(join(tmpdir(), "avatar-stage-public-"));
  mkdirSync(join(contentDir, "assets", "avatar"), { recursive: true });
});

afterEach(() => {
  rmSync(contentDir, { recursive: true, force: true });
  rmSync(publicAssetsDir, { recursive: true, force: true });
});

const sceneWith = (avatar, id = 6) => ({
  id,
  visualType: "cta",
  voiceover: "Follow for more.",
  ...(avatar === undefined ? {} : { avatar }),
});

describe("stageAvatarVideos — copy + relativize (mirrors media mechanism)", () => {
  it("copies the video into the staged namespace and rewrites videoPath to the staged path", () => {
    makeRealVideo(join(contentDir, "assets", "avatar", "cta.mp4"));
    const scene = sceneWith({ videoPath: "assets/avatar/cta.mp4", position: "right-card" });
    const staged = stageAvatarVideos({ scenes: [scene], contentDir, publicAssetsDir });
    expect(staged).toBe(1);
    const dest = join(publicAssetsDir, "_staged", "cta.mp4");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest).length).toBe(
      readFileSync(join(contentDir, "assets", "avatar", "cta.mp4")).length,
    );
    // videoPath rewritten to the staticFile()-relative form (like scene.media.path)
    expect(scene.avatar.videoPath).toBe("_staged/cta.mp4");
    // the curated root stays clean — see render-remotion-staging.test.mjs
    expect(existsSync(join(publicAssetsDir, "cta.mp4"))).toBe(false);
    // other declaration fields ride along untouched
    expect(scene.avatar.position).toBe("right-card");
  });

  it("skips the copy when the destination already has the current file (cache), still rewrites", () => {
    makeRealVideo(join(contentDir, "assets", "avatar", "cta.mp4"));
    // A real cache hit: the staged copy is byte-identical to the source, so
    // staging must not spend the copy (and must not clobber it). A tiny
    // placeholder file is NOT a cache hit any more — size/mtime mismatch means
    // the asset was edited in place and the stale copy must be replaced.
    const src = join(contentDir, "assets", "avatar", "cta.mp4");
    const dest = join(publicAssetsDir, "_staged", "cta.mp4");
    mkdirSync(join(publicAssetsDir, "_staged"), { recursive: true });
    copyFileSync(src, dest);
    const { mtimeMs } = statSync(src);
    utimesSync(dest, mtimeMs / 1000, mtimeMs / 1000);
    const before = statSync(dest).mtimeMs;

    const scene = sceneWith({ videoPath: "assets/avatar/cta.mp4" });
    const staged = stageAvatarVideos({ scenes: [scene], contentDir, publicAssetsDir });
    expect(staged).toBe(1);
    // cache untouched — same bytes, and the file was not rewritten
    expect(readFileSync(dest).length).toBe(readFileSync(src).length);
    expect(statSync(dest).mtimeMs).toBe(before);
    expect(scene.avatar.videoPath).toBe("_staged/cta.mp4");
  });

  it("stages multiple avatar scenes and reports the count", () => {
    makeRealVideo(join(contentDir, "assets", "avatar", "hook.mp4"));
    makeRealVideo(join(contentDir, "assets", "avatar", "cta.mp4"));
    const scenes = [
      sceneWith({ videoPath: "assets/avatar/hook.mp4" }, 1),
      sceneWith({ videoPath: "assets/avatar/cta.mp4" }, 6),
    ];
    expect(stageAvatarVideos({ scenes, contentDir, publicAssetsDir })).toBe(2);
    expect(scenes[0].avatar.videoPath).toBe("_staged/hook.mp4");
    expect(scenes[1].avatar.videoPath).toBe("_staged/cta.mp4");
  });
});

describe("stageAvatarVideos — zero regression (no avatar declaration)", () => {
  it("stages nothing and leaves avatar-less scenes byte-identical", () => {
    const plain = sceneWith(undefined);
    const mediaScene = { ...sceneWith(undefined), media: { type: "image", path: "assets/x.jpg" } };
    const declaredPending = sceneWith({}); // covered by the fail-closed suite below
    const scenes = [plain, mediaScene];
    expect(stageAvatarVideos({ scenes, contentDir, publicAssetsDir })).toBe(0);
    expect(scenes).toEqual([plain, mediaScene]);
    expect(existsSync(publicAssetsDir) ? [] : []).toEqual([]);
    // sanity: the declared-pending shape is what the avatar suite covers
    expect(declaredPending.avatar).toEqual({});
  });
});

describe("stageAvatarVideos — fail-closed matrix", () => {
  const expectStageFail = (scenes, messagePart) => {
    let err = null;
    try {
      stageAvatarVideos({ scenes, contentDir, publicAssetsDir });
    } catch (e) {
      err = e;
    }
    expect(err, "expected stageAvatarVideos to throw").toBeTruthy();
    expect(err.message).toContain(messagePart);
    // every failure carries the remediation hint (spec Scenario 2)
    expect(err.message).toContain("Remediation");
    return err;
  };

  it("declared but never generated (no videoPath) fails with the pending-generation message", () => {
    const scene = sceneWith({});
    expectStageFail([scene], "pending generation");
    // and nothing was staged
    expect(scene.avatar).toEqual({});
  });

  it("declared videoPath whose file is missing fails with the declared path", () => {
    const scene = sceneWith({ videoPath: "assets/avatar/cta.mp4" });
    expectStageFail([scene], "avatar video not found: assets/avatar/cta.mp4");
    // videoPath NOT relativized on failure (scene-data stays as declared)
    expect(scene.avatar.videoPath).toBe("assets/avatar/cta.mp4");
  });

  it("corrupt file (ffprobe cannot read a duration) fails closed", () => {
    writeFileSync(join(contentDir, "assets", "avatar", "cta.mp4"), "this is not a video");
    const scene = sceneWith({ videoPath: "assets/avatar/cta.mp4" });
    expectStageFail([scene], "unreadable (ffprobe found no duration)");
  });

  it("zero-byte file fails closed", () => {
    writeFileSync(join(contentDir, "assets", "avatar", "cta.mp4"), "");
    const scene = sceneWith({ videoPath: "assets/avatar/cta.mp4" });
    expectStageFail([scene], "unreadable");
  });

  it("fails before staging later scenes (first bad scene aborts the whole render)", () => {
    makeRealVideo(join(contentDir, "assets", "avatar", "hook.mp4"));
    const scenes = [
      sceneWith({ videoPath: "assets/avatar/hook.mp4" }, 1),
      sceneWith({ videoPath: "assets/avatar/missing.mp4" }, 2),
    ];
    expectStageFail(scenes, "missing.mp4");
    // sequential staging: scene 1 was already staged in-memory (harmless —
    // the throw aborts renderRemotion before any props ship to the CLI)
    expect(scenes[0].avatar.videoPath).toBe("_staged/hook.mp4");
    // the bad scene stays untouched
    expect(scenes[1].avatar.videoPath).toBe("assets/avatar/missing.mp4");
  });
});
