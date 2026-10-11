/**
 * #421 render-boundary guard: a voiced run must not render without valid
 * subtitle timing.
 *
 * The bug class this closes: every entry point (main.mjs after TTS,
 * render-only.mjs, rerender-full.mjs, realign-render.mjs) tolerated a missing
 * or stale subtitle-timing.json and went on to render an un-subtitled video.
 * `assertSubtitleTiming` is the single shared contract enforced immediately
 * before renderRemotion():
 *
 *  - voiceover present + timing file missing → refuse (alignment never ran);
 *  - unreadable/corrupt timing → refuse;
 *  - no signature meta, or a signature that does not match the current scene
 *    text + audio bytes → refuse (stale timing);
 *  - timing that yields zero cues → refuse (nothing to burn in);
 *  - no voiceover at all (visual-only run) → not applicable, returns null.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { assertSubtitleTiming } from "../lib/subtitles/generate.mjs";
import { computeAlignmentSignature, writeAlignmentMeta } from "../lib/tts/cache.mjs";

const TIMING_OK = [
  {
    sceneId: 1,
    segments: [
      {
        text: "Hello world",
        start: 0,
        end: 1,
        words: [
          { text: "Hello", start: 0, end: 0.5 },
          { text: "world", start: 0.5, end: 1 },
        ],
      },
    ],
  },
];

describe("assertSubtitleTiming (#421)", () => {
  let dir;
  let scenes;
  let ttsResults;

  function setup({ timing = TIMING_OK, meta = "valid", scenesOverride = null } = {}) {
    dir = mkdtempSync(join(tmpdir(), "sub-guard-"));
    const audioDir = join(dir, "audio");
    mkdirSync(audioDir, { recursive: true });
    scenes = scenesOverride ?? [{ id: 1, voiceover: "Hello world", ttsText: "Hello world" }];
    const audioPath = join(audioDir, "scene-1.wav");
    writeFileSync(audioPath, "audio-bytes");
    ttsResults = [{ sceneId: 1, audioPath, duration: 4 }];
    if (timing !== null) {
      writeFileSync(
        join(audioDir, "subtitle-timing.json"),
        typeof timing === "string" ? timing : JSON.stringify(timing),
      );
    }
    if (meta === "valid")
      writeAlignmentMeta(audioDir, computeAlignmentSignature(scenes, ttsResults));
    if (meta === "stale") {
      writeFileSync(
        join(audioDir, "subtitle-timing.meta.json"),
        JSON.stringify({ signature: "deadbeef" }),
      );
    }
    return { audioDir };
  }

  beforeEach(() => {
    dir = null;
  });
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("accepts valid timing with a matching signature and returns cues", () => {
    setup();
    const result = assertSubtitleTiming({ scenes, ttsResults, outputDir: dir });
    expect(result).not.toBeNull();
    expect(result.cues.length).toBeGreaterThan(0);
    expect(result.timingData).toEqual(TIMING_OK);
  });

  it("refuses a voiced run with no subtitle-timing.json", () => {
    setup({ timing: null });
    expect(() => assertSubtitleTiming({ scenes, ttsResults, outputDir: dir })).toThrow(
      /subtitle-timing\.json is missing/i,
    );
  });

  it("refuses corrupt timing JSON", () => {
    setup({ timing: "{ not json" });
    expect(() => assertSubtitleTiming({ scenes, ttsResults, outputDir: dir })).toThrow(
      /unreadable|corrupt/i,
    );
  });

  it("refuses timing with no signature meta (freshness cannot be proven)", () => {
    setup({ meta: "none" });
    expect(() => assertSubtitleTiming({ scenes, ttsResults, outputDir: dir })).toThrow(
      /stale|signature/i,
    );
  });

  it("refuses stale timing whose signature does not match the current text/audio", () => {
    setup({ meta: "stale" });
    expect(() => assertSubtitleTiming({ scenes, ttsResults, outputDir: dir })).toThrow(/stale/i);
  });

  it("refuses timing that yields zero cues", () => {
    setup({ timing: [{ sceneId: 1, segments: [] }] });
    expect(() => assertSubtitleTiming({ scenes, ttsResults, outputDir: dir })).toThrow(
      /zero cues|no cues/i,
    );
  });

  it("is not applicable when the run has no voiceover", () => {
    setup({ timing: null, scenesOverride: [{ id: 1, voiceover: "" }] });
    expect(assertSubtitleTiming({ scenes, ttsResults, outputDir: dir })).toBeNull();
  });

  it("still guards a scene that carries only the spoken form (ttsText)", () => {
    setup({ timing: null, scenesOverride: [{ id: 1, ttsText: "Hello world" }] });
    expect(() => assertSubtitleTiming({ scenes, ttsResults, outputDir: dir })).toThrow(
      /subtitle-timing\.json is missing/i,
    );
  });
});
