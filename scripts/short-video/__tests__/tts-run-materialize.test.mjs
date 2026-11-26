/**
 * #1531: a run directory must be self-contained after the TTS stage.
 *
 * The bug this pins: #1432 materialized only the takes (`scene-*.wav`) into
 * `runs/<runId>/audio`, while the alignment pair and the scene sidecars stayed
 * in the shared cache. On a legitimate cache hit (LingSante
 * `r-20261124T045718-2ba2b0`) Step 4.5 found no `subtitle-timing.json` in the
 * run and failed closed — the operator hand-copied two files to ship.
 *
 * Pinned here:
 *
 *  - takes land in the run (hardlink when possible) and `result.audioPath`
 *    follows them;
 *  - `subtitle-timing.json` + `.meta.json` travel with the run, and the
 *    alignment signature still validates over the run copies;
 *  - scene sidecars land too, with `audioPath` re-bound to the run copy — a
 *    verbatim absolute cache path would be rejected by `isInsideAudioDir()`
 *    and silently degrade to extension probing;
 *  - run-local work (a repair realign writing into the run) is never replaced
 *    by an older cache copy — the resume path and the partial-retry path;
 *  - after the cache is gone the run still validates: the cache is an
 *    accelerator, not an input.
 */
import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { materializeRunAudio } from "../lib/tts-run-materialize.mjs";
import { alignmentCacheState, computeAlignmentSignature } from "../lib/tts/cache.mjs";

const SCENES = [
  { id: 1, voiceover: "the first line" },
  { id: 2, voiceover: "the second line" },
  { id: 3, voiceover: "the third line" },
];

function buildCache(root, { timing = true } = {}) {
  const cacheDir = join(root, "cache");
  mkdirSync(cacheDir, { recursive: true });
  const results = [];
  for (const scene of SCENES) {
    const wav = join(cacheDir, `scene-${scene.id}.wav`);
    writeFileSync(wav, `audio-bytes-${scene.id}`);
    writeFileSync(
      join(cacheDir, `scene-${scene.id}.tts-meta.json`),
      JSON.stringify({
        key: `key-${scene.id}`,
        duration: 2 + scene.id,
        engine: "fake-engine",
        audioPath: wav,
        status: "approved",
        metaVersion: 1,
        audioDigest: `digest-${scene.id}`,
      }),
    );
    results.push({ sceneId: scene.id, audioPath: wav, duration: 2 + scene.id });
  }
  if (timing) {
    const signature = computeAlignmentSignature(SCENES, results);
    writeFileSync(
      join(cacheDir, "subtitle-timing.json"),
      JSON.stringify({
        scenes: results.map((r) => ({
          sceneId: r.sceneId,
          words: [{ word: "x", start: 0, end: r.duration }],
        })),
      }),
    );
    writeFileSync(join(cacheDir, "subtitle-timing.meta.json"), JSON.stringify({ signature }));
  }
  return { cacheDir, results };
}

function freshRoot() {
  const root = mkdtempSync(join(tmpdir(), "tts-materialize-"));
  const audioDir = join(root, "runs", "r-test", "audio");
  mkdirSync(audioDir, { recursive: true });
  return { root, audioDir };
}

describe("materializeRunAudio", () => {
  it("places takes, sidecars and the alignment pair in an empty run", () => {
    const { audioDir, root } = freshRoot();
    const { cacheDir, results } = buildCache(root);
    const lines = [];
    const summary = materializeRunAudio({
      results,
      cacheDir,
      audioDir,
      log: (line) => lines.push(line),
    });

    expect(summary.links + summary.copies).toBe(SCENES.length);
    expect(summary.sidecars).toBe(SCENES.length);
    expect(summary.timing).toEqual(["subtitle-timing.json", "subtitle-timing.meta.json"]);

    for (const scene of SCENES) {
      expect(existsSync(join(audioDir, `scene-${scene.id}.wav`))).toBe(true);
      const meta = JSON.parse(
        readFileSync(join(audioDir, `scene-${scene.id}.tts-meta.json`), "utf8"),
      );
      expect(meta.audioPath).toBe(`scene-${scene.id}.wav`);
      expect(meta.audioDigest).toBe(`digest-${scene.id}`);
      expect(meta.key).toBe(`key-${scene.id}`);
    }
    expect(existsSync(join(audioDir, "subtitle-timing.json"))).toBe(true);
    expect(existsSync(join(audioDir, "subtitle-timing.meta.json"))).toBe(true);

    // The rewritten path must be the run path, not the cache path.
    for (const result of results) {
      expect(result.audioPath.startsWith(audioDir)).toBe(true);
    }
    // Every placement is logged: "复制或硬链都要有显式日志" (#1531).
    expect(lines.filter((l) => l.includes("audio")).length).toBeGreaterThan(0);
  });

  it("still validates after the cache is deleted — the run is the contract", () => {
    const { audioDir, root } = freshRoot();
    const { cacheDir, results } = buildCache(root);
    materializeRunAudio({ results, cacheDir, audioDir });

    // Bytes are shared, so the signature the cache computed over its own paths
    // still matches the run copies (hardlink/copy preserves content).
    const signature = computeAlignmentSignature(SCENES, results);
    expect(alignmentCacheState(audioDir, signature)).toBe("valid");

    rmSync(cacheDir, { recursive: true, force: true });
    expect(alignmentCacheState(audioDir, signature)).toBe("valid");
    for (const scene of SCENES) {
      expect(existsSync(join(audioDir, `scene-${scene.id}.wav`))).toBe(true);
    }
  });

  it("never replaces run-local timing or takes (repair / resume path)", () => {
    const { audioDir, root } = freshRoot();
    const { cacheDir, results } = buildCache(root);
    // A repair realign already wrote this run's timing; scene 1 was re-rendered
    // into the run by a retry. Both must survive materialization.
    writeFileSync(join(audioDir, "subtitle-timing.json"), JSON.stringify({ repaired: true }));
    writeFileSync(
      join(audioDir, "subtitle-timing.meta.json"),
      JSON.stringify({ signature: "run" }),
    );
    writeFileSync(join(audioDir, "scene-1.wav"), "run-local-bytes");

    materializeRunAudio({ results, cacheDir, audioDir });

    expect(readFileSync(join(audioDir, "subtitle-timing.json"), "utf8")).toContain("repaired");
    expect(readFileSync(join(audioDir, "scene-1.wav"), "utf8")).toBe("run-local-bytes");
    // The take that was not in the run still arrives; its sidecar is rebound to
    // this run's copy, not to the cache.
    const meta = JSON.parse(readFileSync(join(audioDir, "scene-1.tts-meta.json"), "utf8"));
    expect(meta.audioPath).toBe("scene-1.wav");
  });

  it("completes a partial resume without duplicating work", () => {
    const { audioDir, root } = freshRoot();
    const { cacheDir, results } = buildCache(root);
    materializeRunAudio({ results: results.slice(0, 1), cacheDir, audioDir });
    const summary = materializeRunAudio({ results, cacheDir, audioDir });
    expect(summary.links + summary.copies).toBe(SCENES.length - 1);
    expect(summary.timing).toEqual([]);
    expect(existsSync(join(audioDir, "subtitle-timing.json"))).toBe(true);
  });

  it("tolerates a cache without timing (alignment skipped, no throw)", () => {
    const { audioDir, root } = freshRoot();
    const { cacheDir, results } = buildCache(root, { timing: false });
    const summary = materializeRunAudio({ results, cacheDir, audioDir });
    expect(summary.timing).toEqual([]);
    expect(existsSync(join(audioDir, "subtitle-timing.json"))).toBe(false);
  });

  it("leaves a visual-only run alone — no takes means no inherited timing", () => {
    const { audioDir, root } = freshRoot();
    const { cacheDir } = buildCache(root);
    const summary = materializeRunAudio({ results: [], cacheDir, audioDir });
    expect(summary).toEqual({ links: 0, copies: 0, sidecars: 0, timing: [] });
    expect(existsSync(join(audioDir, "subtitle-timing.json"))).toBe(false);
  });

  it("rebinds a candidate sidecar too (#423 unverified takes)", () => {
    const { audioDir, root } = freshRoot();
    const { cacheDir, results } = buildCache(root);
    writeFileSync(
      join(cacheDir, "scene-2.tts-candidate.json"),
      JSON.stringify({
        key: "cand-2",
        audioPath: join(cacheDir, "scene-2.wav"),
        status: "candidate",
      }),
    );
    materializeRunAudio({ results, cacheDir, audioDir });
    const candidate = JSON.parse(
      readFileSync(join(audioDir, "scene-2.tts-candidate.json"), "utf8"),
    );
    expect(candidate.audioPath).toBe("scene-2.wav");
    expect(candidate.status).toBe("candidate");
  });
});
