/**
 * Candidate vs approved trust boundary for the scene TTS cache (#423).
 *
 * Contract (2026-10-04 review + 2026-10-09 prerequisite):
 *  - an approved meta must bind the EXACT audio bytes it blessed: a hit needs
 *    status "approved" + the current metaVersion + a sha256 digest matching
 *    the file on disk;
 *  - a legacy meta (pre-#423 shape: no status/version/digest) is NOT a hit —
 *    it is a candidate awaiting re-verification;
 *  - a candidate sidecar (scene-{id}.tts-candidate.json) is surfaced for
 *    re-verification with its recorded reason and never satisfies a hit;
 *  - promotion (writeSceneMeta) is atomic, refuses missing audio, and clears
 *    the candidate sidecar;
 *  - byte replacement invalidates the approved entry (digest mismatch);
 *  - the alignment tail-cut refresh re-binds a trusted entry to the cut bytes.
 */
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  SCENE_META_VERSION,
  computeAudioDigest,
  computeSceneKey,
  planTtsScenes,
  refreshApprovedSceneMeta,
  writeCandidateSceneMeta,
  writeSceneMeta,
} from "../lib/tts/cache.mjs";

const engine = { name: "f5-mlx", info: "F5-TTS-MLX (candidate/approved test)" };

let dir;
function freshDir() {
  dir = mkdtempSync(join(tmpdir(), "tts-cache-approved-"));
  return dir;
}
function writeAudio(id, content = `wav-bytes-${id}`) {
  const p = join(dir, `scene-${id}.wav`);
  writeFileSync(p, content);
  return p;
}
function readMeta(id) {
  return JSON.parse(readFileSync(join(dir, `scene-${id}.tts-meta.json`), "utf8"));
}
function candidatePath(id) {
  return join(dir, `scene-${id}.tts-candidate.json`);
}

describe("approved meta trust boundary (#423)", () => {
  it("a matching version + digest entry is an approved hit", () => {
    freshDir();
    writeAudio(1);
    const scene = { id: 1, voiceover: "第一句" };
    expect(
      writeSceneMeta(dir, 1, {
        key: computeSceneKey(engine, scene.voiceover),
        duration: 3.2,
        engine: engine.name,
      }),
    ).toBe(true);

    const meta = readMeta(1);
    expect(meta.status).toBe("approved");
    expect(meta.metaVersion).toBe(SCENE_META_VERSION);
    expect(meta.audioDigest).toBe(computeAudioDigest(join(dir, "scene-1.wav")));

    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.approved).toHaveLength(1);
    expect(plan.candidates).toHaveLength(0);
    expect(plan.pending).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("byte replacement invalidates the approved entry (digest mismatch → candidate)", () => {
    freshDir();
    writeAudio(1, "take-one");
    const scene = { id: 1, voiceover: "第一句" };
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, scene.voiceover),
      duration: 3,
      engine: engine.name,
    });

    // Some other writer replaced the bytes (failed reroll, manual copy, ...).
    writeAudio(1, "take-two");

    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.approved).toHaveLength(0);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]).toMatchObject({
      sceneId: 1,
      audioPath: join(dir, "scene-1.wav"),
      reason: "audio-bytes-changed",
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("a legacy meta (no status/version/digest) is a candidate, never an approved hit", () => {
    freshDir();
    writeAudio(1, "legacy-take");
    const scene = { id: 1, voiceover: "第一句" };
    // Pre-#423 on-disk shape, written raw (the old writer had no digest).
    writeFileSync(
      join(dir, "scene-1.tts-meta.json"),
      JSON.stringify({
        key: computeSceneKey(engine, scene.voiceover),
        duration: 2.5,
        engine: engine.name,
        audioPath: join(dir, "scene-1.wav"),
      }),
    );

    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.approved).toHaveLength(0);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0].reason).toBe("unapproved-meta");

    // Re-verification passed → promoting upgrades the legacy entry in place.
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, scene.voiceover),
      duration: 2.5,
      engine: engine.name,
      audioPath: join(dir, "scene-1.wav"),
    });
    const reparsed = planTtsScenes(dir, [scene], engine);
    expect(reparsed.approved).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("a stale verification version is a candidate, not a hit", () => {
    freshDir();
    const audioPath = writeAudio(1);
    const scene = { id: 1, voiceover: "第一句" };
    // A meta written by an older verification pipeline: same shape, older
    // version number. The take must be re-verified under the current rules.
    writeFileSync(
      join(dir, "scene-1.tts-meta.json"),
      JSON.stringify({
        status: "approved",
        metaVersion: SCENE_META_VERSION + 1,
        audioDigest: computeAudioDigest(audioPath),
        key: computeSceneKey(engine, scene.voiceover),
        duration: 2.5,
        engine: engine.name,
        audioPath,
      }),
    );

    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.approved).toHaveLength(0);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0].reason).toBe("verification-version-changed");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("candidate sidecars (#423)", () => {
  it("a candidate sidecar is surfaced with its recorded reason", () => {
    freshDir();
    writeAudio(1);
    const scene = { id: 1, voiceover: "第一句" };
    expect(
      writeCandidateSceneMeta(dir, 1, {
        key: computeSceneKey(engine, scene.voiceover),
        duration: 2.5,
        engine: engine.name,
        reason: "gate-failed:pacing",
      }),
    ).toBe(true);

    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.approved).toHaveLength(0);
    expect(plan.pending).toHaveLength(0);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0].reason).toBe("gate-failed:pacing");
    rmSync(dir, { recursive: true, force: true });
  });

  it("promotion clears the candidate sidecar", () => {
    freshDir();
    writeAudio(1);
    const scene = { id: 1, voiceover: "第一句" };
    writeCandidateSceneMeta(dir, 1, {
      key: computeSceneKey(engine, scene.voiceover),
      duration: 2.5,
      engine: engine.name,
      reason: "gate-failed:acoustic",
    });
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, scene.voiceover),
      duration: 2.5,
      engine: engine.name,
    });
    expect(existsSync(candidatePath(1))).toBe(false);

    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.approved).toHaveLength(1);
    expect(plan.candidates).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("an unreadable candidate sidecar and a missing audio file both fall back to pending", () => {
    freshDir();
    const scene = { id: 1, voiceover: "第一句" };
    writeFileSync(candidatePath(1), "{not json");
    let plan = planTtsScenes(dir, [scene], engine);
    expect(plan.pending).toHaveLength(1);

    // Sidecar recorded but the audio file is gone → nothing to re-verify.
    rmSync(candidatePath(1));
    writeCandidateSceneMeta(dir, 1, {
      key: computeSceneKey(engine, scene.voiceover),
      duration: 2.5,
      engine: engine.name,
    });
    plan = planTtsScenes(dir, [scene], engine);
    expect(plan.pending).toHaveLength(1);
    expect(plan.candidates).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("promotion refuses to bless a missing audio file", () => {
    freshDir();
    const ok = writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, "第一句"),
      duration: 2.5,
      engine: engine.name,
    });
    expect(ok).toBe(false);
    expect(existsSync(join(dir, "scene-1.tts-meta.json"))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("alignment tail-cut refresh (#423)", () => {
  it("re-binds a trusted entry to the cut bytes and duration", () => {
    freshDir();
    const audioPath = writeAudio(1, "pre-cut-bytes");
    const scene = { id: 1, voiceover: "第一句" };
    writeSceneMeta(dir, 1, {
      key: computeSceneKey(engine, scene.voiceover),
      duration: 3.0,
      engine: engine.name,
      audioPath,
    });

    // Guard trimmed the tail in place — the bytes changed under the meta.
    writeFileSync(audioPath, "post-cut-bytes");
    expect(planTtsScenes(dir, [scene], engine).candidates).toHaveLength(1);

    expect(refreshApprovedSceneMeta(dir, 1, { duration: 2.4 })).toBe(true);
    const plan = planTtsScenes(dir, [scene], engine);
    expect(plan.approved).toHaveLength(1);
    expect(plan.approved[0].duration).toBe(2.4);
    expect(readMeta(1).audioDigest).toBe(computeAudioDigest(audioPath));
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not invent trust for a scene without a current approved entry", () => {
    freshDir();
    writeAudio(1, "unverified-take");
    expect(refreshApprovedSceneMeta(dir, 1, { duration: 2 })).toBe(false);
    expect(existsSync(join(dir, "scene-1.tts-meta.json"))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
