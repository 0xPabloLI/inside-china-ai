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

import { resolveSceneAudioPath } from "../scene-audio.mjs";

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
