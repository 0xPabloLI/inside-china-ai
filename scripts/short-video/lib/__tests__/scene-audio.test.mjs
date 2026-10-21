/**
 * #421 review follow-up: scene audio resolution must prefer the take the
 * pipeline actually recorded.
 *
 * Legacy audio dirs hold scene-N.mp3 (retired edge-tts runs) and scene-N.wav
 * (current F5/MLX/Kaggle engines) side by side — several real content dirs do.
 * Plain extension probing then feeds the render AND the alignment-signature
 * check (#198) a stale take, so a legitimate re-render would fail closed with
 * a false "stale timing". The tts-meta sidecar records the real path; it wins
 * when it resolves, and extension probing stays as the fallback.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { resolveSceneAudioInfo, resolveSceneAudioPath } from "../scene-audio.mjs";

describe("resolveSceneAudioPath (#421)", () => {
  let dir;
  let audioDir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scene-audio-"));
    audioDir = join(dir, "audio");
    mkdirSync(audioDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeTake(name) {
    const p = join(audioDir, name);
    writeFileSync(p, `bytes:${name}`);
    return p;
  }

  it("prefers the path recorded in the tts-meta sidecar over extension probing", () => {
    const wav = writeTake("scene-1.wav");
    writeTake("scene-1.mp3");
    writeFileSync(
      join(audioDir, "scene-1.tts-meta.json"),
      JSON.stringify({ engine: "cosyvoice3-kaggle-cuda", audioPath: wav }),
    );
    expect(resolveSceneAudioPath(audioDir, 1)).toBe(wav);
  });

  it("falls back to extension probing (.mp3 first) when no sidecar exists", () => {
    const mp3 = writeTake("scene-1.mp3");
    writeTake("scene-1.wav");
    expect(resolveSceneAudioPath(audioDir, 1)).toBe(mp3);
  });

  it("falls back to probing when the sidecar points at a missing file", () => {
    const wav = writeTake("scene-1.wav");
    writeFileSync(
      join(audioDir, "scene-1.tts-meta.json"),
      JSON.stringify({ audioPath: join(audioDir, "gone.wav") }),
    );
    expect(resolveSceneAudioPath(audioDir, 1)).toBe(wav);
  });

  it("falls back to probing when the sidecar is not valid JSON", () => {
    const wav = writeTake("scene-1.wav");
    writeFileSync(join(audioDir, "scene-1.tts-meta.json"), "{ not json");
    expect(resolveSceneAudioPath(audioDir, 1)).toBe(wav);
  });

  it("refuses a sidecar path outside the audio dir and falls back to probing", () => {
    const wav = writeTake("scene-1.wav");
    const outside = join(dir, "evil.wav");
    writeFileSync(outside, "bytes:evil");
    writeFileSync(join(audioDir, "scene-1.tts-meta.json"), JSON.stringify({ audioPath: outside }));
    expect(resolveSceneAudioPath(audioDir, 1)).toBe(wav);
  });

  it("refuses a sidecar path climbing out of the audio dir via ..", () => {
    const wav = writeTake("scene-1.wav");
    writeFileSync(join(dir, "evil.wav"), "bytes:evil");
    writeFileSync(
      join(audioDir, "scene-1.tts-meta.json"),
      JSON.stringify({ audioPath: "../evil.wav" }),
    );
    expect(resolveSceneAudioPath(audioDir, 1)).toBe(wav);
  });

  it("returns null when no take exists at all", () => {
    expect(resolveSceneAudioPath(audioDir, 7)).toBeNull();
  });
});

/**
 * #566: digital-human's planning reader and the render entry points must share
 * ONE resolution contract (same sidecar chain, same containment, same extension
 * order). resolveSceneAudioInfo is that contract for the duration-bearing
 * consumer; resolveSceneAudioPath stays the path-only view used by renders.
 */
describe("resolveSceneAudioInfo (#566 unified resolution)", () => {
  let dir;
  let audioDir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scene-audio-info-"));
    audioDir = join(dir, "audio");
    mkdirSync(audioDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeTake(name) {
    const p = join(audioDir, name);
    writeFileSync(p, `bytes:${name}`);
    return p;
  }

  function writeSidecar(name, value) {
    writeFileSync(join(audioDir, name), JSON.stringify(value));
  }

  it("prefers the approved tts-meta sidecar and reports its source", () => {
    const wav = writeTake("scene-1.wav");
    writeTake("scene-1.mp3");
    writeSidecar("scene-1.tts-meta.json", { duration: 4.25, audioPath: "scene-1.wav" });
    expect(resolveSceneAudioInfo(audioDir, 1)).toEqual({
      audioPath: wav,
      duration: 4.25,
      durationSource: "tts-meta",
    });
  });

  it("defaults to scene-<id>.wav when the approved sidecar records no audioPath", () => {
    const wav = writeTake("scene-1.wav");
    writeSidecar("scene-1.tts-meta.json", { duration: 3 });
    expect(resolveSceneAudioInfo(audioDir, 1)).toEqual({
      audioPath: wav,
      duration: 3,
      durationSource: "tts-meta",
    });
  });

  it("reads the candidate sidecar when only that record exists (#423)", () => {
    const wav = writeTake("scene-1.wav");
    writeSidecar("scene-1.tts-candidate.json", { duration: 6.5, status: "candidate" });
    expect(resolveSceneAudioInfo(audioDir, 1)).toEqual({
      audioPath: wav,
      duration: 6.5,
      durationSource: "tts-candidate",
    });
  });

  it("prefers an approved tts-meta over a candidate sidecar", () => {
    writeTake("scene-1.wav");
    writeSidecar("scene-1.tts-meta.json", { duration: 4, audioPath: "scene-1.wav" });
    writeSidecar("scene-1.tts-candidate.json", { duration: 9.9 });
    expect(resolveSceneAudioInfo(audioDir, 1).durationSource).toBe("tts-meta");
    expect(resolveSceneAudioInfo(audioDir, 1).duration).toBe(4);
  });

  it("falls through a corrupt sidecar to the next source", () => {
    writeTake("scene-1.wav");
    writeFileSync(join(audioDir, "scene-1.tts-meta.json"), "{ not json");
    writeSidecar("scene-1.tts-candidate.json", { duration: 2.5 });
    expect(resolveSceneAudioInfo(audioDir, 1)).toEqual({
      audioPath: join(audioDir, "scene-1.wav"),
      duration: 2.5,
      durationSource: "tts-candidate",
    });
  });

  it("reads legacy scene-durations.json and probes .mp3 before .wav (the shared render order)", () => {
    const mp3 = writeTake("scene-1.mp3");
    writeTake("scene-1.wav");
    writeSidecar("scene-durations.json", [{ sceneId: 1, duration: 5.686667 }]);
    expect(resolveSceneAudioInfo(audioDir, 1)).toEqual({
      audioPath: mp3,
      duration: 5.686667,
      durationSource: "scene-durations",
    });
  });

  it("accepts the {scenes:[...]} shape of legacy scene-durations.json", () => {
    writeTake("scene-2.mp3");
    writeSidecar("scene-durations.json", { scenes: [{ sceneId: 2, duration: 7 }] });
    expect(resolveSceneAudioInfo(audioDir, 2)).toEqual({
      audioPath: join(audioDir, "scene-2.mp3"),
      duration: 7,
      durationSource: "scene-durations",
    });
  });

  it("refuses a recorded path outside the audio dir and defaults to the in-dir take", () => {
    const wav = writeTake("scene-1.wav");
    const outside = join(dir, "evil.wav");
    writeFileSync(outside, "bytes:evil");
    writeSidecar("scene-1.tts-meta.json", { duration: 4, audioPath: outside });
    expect(resolveSceneAudioInfo(audioDir, 1)).toEqual({
      audioPath: wav,
      duration: 4,
      durationSource: "tts-meta",
    });
  });

  it("returns null when neither sidecar nor scene-durations.json has the scene", () => {
    expect(resolveSceneAudioInfo(audioDir, 7)).toBeNull();
  });
});
