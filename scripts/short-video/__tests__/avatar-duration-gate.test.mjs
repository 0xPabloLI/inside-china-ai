/**
 * Tests for the #272 avatar-clip ↔ voiceover duration gate.
 *
 * Behaviour under test (#272 + user verdict 2026-09-13, 方案 B):
 *  - a declared avatar clip SHORTER than its scene's current voiceover fails
 *    closed. The clip supplies the lip-sync the viewer sees, so shipping it
 *    against regenerated audio IS the defect: the real pilot shipped a 5.00s
 *    clip against a 7.24s voiceover and nothing in the pipeline reported it
 *    (#225/#272 实证) — the old checks only asked "does the file exist?";
 *  - the invariant is enforced at every seam that knows the voiceover duration:
 *    main.mjs after TTS (before render spend) and render staging, so
 *    render-only / rerender / realign runs get it too;
 *  - a clip that covers its voiceover passes, sub-frame rounding is tolerated,
 *    and scenes with no avatar declaration are untouched;
 *  - the pre-existing fail-closed matrix (pending generation / missing /
 *    corrupt) keeps its messages and its remediation hint.
 *
 * Real media via ffmpeg/ffprobe in a temp dir — no fs mocks (ffprobe is a hard
 * pipeline dependency; same convention as render-remotion-avatar.test.mjs).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";

import { stageAvatarVideos } from "../lib/render-remotion.mjs";
import { assertAvatarScene, assertAvatarVoiceovers } from "../lib/avatar-guard.mjs";

let contentDir;
let publicAssetsDir;

/** Minimal real H.264 video of the given length — a file ffprobe can measure. */
function makeRealVideo(dest, seconds) {
  execFileSync(
    "ffmpeg",
    ["-f", "lavfi", "-i", `color=c=red:s=64x64:d=${seconds}`, "-pix_fmt", "yuv420p", "-y", dest],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
}

beforeEach(() => {
  contentDir = mkdtempSync(join(tmpdir(), "avatar-gate-content-"));
  publicAssetsDir = mkdtempSync(join(tmpdir(), "avatar-gate-public-"));
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

/** The #272 field shape: a real clip plus the voiceover duration it must cover. */
function realClipCase({ clipSeconds, voiceoverSeconds }) {
  const rel = "assets/avatar/cta.mp4";
  makeRealVideo(join(contentDir, rel), clipSeconds);
  return {
    scene: sceneWith({ videoPath: rel, position: "right-card" }),
    voiceoverSeconds,
    rel,
  };
}

const catchError = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
};

describe("#272 avatar clip must cover its voiceover", () => {
  it("RED: the pilot shape (5.00s clip vs 7.24s voiceover) fails closed", () => {
    const { scene, voiceoverSeconds } = realClipCase({
      clipSeconds: 5,
      voiceoverSeconds: 7.24,
    });

    const err = catchError(() =>
      assertAvatarScene({ scene, voiceoverDurationSec: voiceoverSeconds, contentDir }),
    );

    expect(err, "a stale avatar clip must not pass the gate").toBeTruthy();
    expect(err.message).toContain("5.00s");
    expect(err.message).toContain("7.24s");
    // The fix is a REGENERATION, and a plain re-run would skip the scene
    // (stale-plan protection) — so the hint must name the FORCE path (#233),
    // otherwise the operator loops on a command that cannot change anything.
    expect(err.message).toContain("digital-human.mjs");
    expect(err.message).toContain("--force");
    expect(err.message).toContain("Remediation");
  });

  it("RED: render staging enforces the same invariant with the render's durations", () => {
    const { scene, rel } = realClipCase({ clipSeconds: 5, voiceoverSeconds: 7.24 });

    const err = catchError(() =>
      stageAvatarVideos({ scenes: [scene], durations: [7.24], contentDir, publicAssetsDir }),
    );

    expect(err, "stageAvatarVideos must reject a clip shorter than its voiceover").toBeTruthy();
    expect(err.message).toContain("7.24s");
    // nothing was relativized: scene-data stays as declared for a re-run
    expect(scene.avatar.videoPath).toBe(rel);
  });

  it("accepts a clip that covers the voiceover", () => {
    const { scene, voiceoverSeconds } = realClipCase({
      clipSeconds: 7.6,
      voiceoverSeconds: 7.24,
    });
    expect(
      catchError(() =>
        assertAvatarScene({ scene, voiceoverDurationSec: voiceoverSeconds, contentDir }),
      ),
    ).toBe(null);
  });

  it("accepts a clip exactly as long as the voiceover and one within sub-frame rounding", () => {
    for (const clipSeconds of [7.24, 7.22]) {
      const { scene, voiceoverSeconds, rel } = realClipCase({
        clipSeconds,
        voiceoverSeconds: 7.24,
      });
      expect(
        catchError(() =>
          assertAvatarScene({ scene, voiceoverDurationSec: voiceoverSeconds, contentDir }),
        ),
        `clip ${clipSeconds}s vs voiceover 7.24s`,
      ).toBe(null);
      expect(scene.avatar.videoPath).toBe(rel);
    }
  });

  it("rejects a clip that misses the voiceover by more than the rounding epsilon", () => {
    const { scene, voiceoverSeconds } = realClipCase({
      clipSeconds: 7.1,
      voiceoverSeconds: 7.24,
    });
    const err = catchError(() =>
      assertAvatarScene({ scene, voiceoverDurationSec: voiceoverSeconds, contentDir }),
    );
    expect(err).toBeTruthy();
  });

  it("enforces presence + readability even when no voiceover duration is known yet", () => {
    const { scene, voiceoverSeconds, rel } = realClipCase({
      clipSeconds: 5,
      voiceoverSeconds: 7.24,
    });
    // No duration (the pre-TTS pass): a short clip is not a duration violation
    // yet, because the pipeline does not know the voiceover length at that point.
    expect(catchError(() => assertAvatarScene({ scene, contentDir }))).toBe(null);
    expect(scene.avatar.videoPath).toBe(rel);

    const missing = sceneWith({ videoPath: "assets/avatar/nope.mp4" });
    expect(catchError(() => assertAvatarScene({ scene: missing, contentDir })).message).toContain(
      "avatar video not found: assets/avatar/nope.mp4",
    );
  });

  it("keeps the corrupt-file fail-closed message", () => {
    writeFileSync(join(contentDir, "assets", "avatar", "cta.mp4"), "this is not a video");
    const scene = sceneWith({ videoPath: "assets/avatar/cta.mp4" });
    const err = catchError(() => assertAvatarScene({ scene, voiceoverDurationSec: 3, contentDir }));
    expect(err.message).toContain("unreadable (ffprobe found no duration)");
    expect(err.message).toContain("Remediation");
  });

  it("keeps the pending-generation fail-closed message", () => {
    const scene = sceneWith({});
    const err = catchError(() => assertAvatarScene({ scene, voiceoverDurationSec: 3, contentDir }));
    expect(err.message).toContain("pending generation");
    expect(err.message).toContain("Remediation");
  });

  it("batch gate (the main.mjs seam) measures each declared clip against its own voiceover", () => {
    const hook = { rel: "assets/avatar/hook.mp4", seconds: 5 };
    const cta = { rel: "assets/avatar/cta.mp4", seconds: 2 };
    makeRealVideo(join(contentDir, hook.rel), hook.seconds);
    makeRealVideo(join(contentDir, cta.rel), cta.seconds);

    const scenes = [
      sceneWith({ videoPath: hook.rel }, 1),
      { id: 2, visualType: "narrative", voiceover: "No avatar here." },
      sceneWith({ videoPath: cta.rel }, 6),
    ];
    const voiceoverSecById = new Map([
      [1, 4.5], // clip 5s covers 4.5s
      [6, 7.24], // clip 2s does NOT cover 7.24s
    ]);

    const err = catchError(() => assertAvatarVoiceovers({ scenes, voiceoverSecById, contentDir }));
    expect(err).toBeTruthy();
    expect(err.message).toContain("Scene 6");
    expect(err.message).toContain("7.24s");

    // with the CTA voiceover shortened, both clips cover their scenes
    voiceoverSecById.set(6, 1.9);
    expect(catchError(() => assertAvatarVoiceovers({ scenes, voiceoverSecById, contentDir }))).toBe(
      null,
    );
  });

  it("touches nothing for scenes without an avatar declaration", () => {
    const bare = { id: 3, visualType: "narrative", voiceover: "plain" };
    expect(
      catchError(() => assertAvatarScene({ scene: bare, voiceoverDurationSec: 9, contentDir })),
    ).toBe(null);
    expect(stageAvatarVideos({ scenes: [bare], durations: [9], contentDir, publicAssetsDir })).toBe(
      0,
    );
  });
});
