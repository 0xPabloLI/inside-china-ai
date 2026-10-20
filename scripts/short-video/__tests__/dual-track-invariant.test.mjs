/**
 * Tests for the dual-track restoration invariant (#753).
 *
 * The pipeline must never burn a spoken form into the burned-in subtitles.
 * `restore-tokens` fails soft (unmatched runs keep their spoken words), so the
 * render boundary needs an explicit, fail-closed check.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  findUnrestorableReplacements,
  findLeakedSpokenRuns,
  findLeaksInTrack,
  findUnmappedSpokenScenes,
  assertDualTrackRestorable,
} from "../lib/subtitles/dual-track.mjs";
import { generateSubtitles } from "../lib/subtitles/generate.mjs";

const gluedScene = {
  id: 1,
  voiceover: "V3.2-Speciale shipped today.",
  // The pre-#753 rewrite: only "V3.2" was recorded, the spoken words are glued
  // to "-Speciale" and restore can never consume them.
  ttsText: "V three point two-Speciale shipped today.",
  ttsReplacements: [{ original: "V3.2", spoken: ["V", "three", "point", "two"] }],
};

const cleanScene = {
  id: 2,
  voiceover: "V3.2-Speciale shipped today.",
  ttsText: "V three point two-Speciale shipped today.",
  ttsReplacements: [{ original: "V3.2-Speciale", spoken: ["V", "three", "point", "two-Speciale"] }],
};

function timingFor(scene, words) {
  return [
    {
      sceneId: scene.id,
      segments: [
        {
          text: words.join(" "),
          start: 0,
          end: 1,
          words: words.map((text, i) => ({ text, start: i, end: i + 1 })),
        },
      ],
    },
  ];
}

describe("findLeaksInTrack", () => {
  it("flags a replacement whose spoken run is glued to unrewritten text", () => {
    expect(findLeaksInTrack(gluedScene.ttsText, gluedScene.ttsReplacements)).toEqual([
      { original: "V3.2", spoken: ["V", "three", "point", "two"] },
    ]);
  });

  it("accepts a replacement that covers whole whitespace tokens", () => {
    expect(findLeaksInTrack(cleanScene.ttsText, cleanScene.ttsReplacements)).toEqual([]);
  });

  it("treats a run that appears once as consumed even when the word repeats", () => {
    const reps = [{ original: "5.6", spoken: ["five", "point", "six"] }];
    const ttsText = "five point six, then five point six again";
    expect(findLeaksInTrack(ttsText, reps)).toEqual([]);
  });
});

describe("findUnrestorableReplacements", () => {
  it("reports the scene id and the offending track", () => {
    const leaks = findUnrestorableReplacements([cleanScene, gluedScene]);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toMatchObject({
      sceneId: 1,
      original: "V3.2",
      spoken: ["V", "three", "point", "two"],
      ttsText: gluedScene.ttsText,
    });
  });

  it("returns nothing for scenes without replacements", () => {
    expect(findUnrestorableReplacements([{ id: 3, voiceover: "No special tokens." }])).toEqual([]);
  });
});

describe("findLeakedSpokenRuns", () => {
  it("detects a spoken run that survived restoration", () => {
    const timing = timingFor(gluedScene, ["V", "three", "point", "two-Speciale", "shipped"]);
    const leaks = findLeakedSpokenRuns([gluedScene], timing);
    expect(leaks).toEqual([
      { sceneId: 1, original: "V3.2", spoken: ["V", "three", "point", "two"] },
    ]);
  });

  it("stays quiet once the display token is restored", () => {
    const timing = timingFor(cleanScene, ["V3.2-Speciale", "shipped"]);
    expect(findLeakedSpokenRuns([cleanScene], timing)).toEqual([]);
  });
});

describe("assertDualTrackRestorable", () => {
  it("throws with the offending token named", () => {
    expect(() => assertDualTrackRestorable({ scenes: [gluedScene] })).toThrow(
      /Dual-track restoration invariant violated/,
    );
    expect(() => assertDualTrackRestorable({ scenes: [gluedScene] })).toThrow(/V3\.2/);
  });

  it("accepts a fully restorable set", () => {
    expect(() =>
      assertDualTrackRestorable({
        scenes: [cleanScene],
        timingData: timingFor(cleanScene, ["V3.2-Speciale", "shipped"]),
      }),
    ).not.toThrow();
  });

  it("throws when the restored timing still carries the spoken run", () => {
    // Statically clean scene, but the timing on disk is the pre-restore track:
    // the dynamic check must catch what the static one cannot (restore already
    // ran and failed soft).
    expect(() =>
      assertDualTrackRestorable({
        scenes: [cleanScene],
        timingData: timingFor(cleanScene, ["V", "three", "point", "two-Speciale"]),
      }),
    ).toThrow(/survived restoration/);
  });
});

describe("generateSubtitles render boundary", () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dual-track-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to write an .ass carrying a spoken form", () => {
    const assPath = join(dir, "subtitles.ass");
    const timing = timingFor(gluedScene, ["V", "three", "point", "two-Speciale"]);
    expect(() =>
      generateSubtitles(timing, [{ sceneId: 1, duration: 3 }], assPath, {
        scenes: [gluedScene],
      }),
    ).toThrow(/refusing to burn spoken form/);
    expect(existsSync(assPath)).toBe(false);
  });

  it("refuses to write when the caller forgot the scene data", () => {
    // An optional guard is the same bug one layer up: a repaired Step 6 path
    // that forgets `scenes` used to bypass the check silently.
    const assPath = join(dir, "subtitles.ass");
    const timing = timingFor(cleanScene, ["V3.2-Speciale", "shipped", "today."]);
    expect(() => generateSubtitles(timing, [{ sceneId: 2, duration: 3 }], assPath)).toThrow(
      /requires `scenes`/,
    );
    expect(existsSync(assPath)).toBe(false);
  });

  it("writes the .ass once the invariant holds", () => {
    const assPath = join(dir, "subtitles.ass");
    const timing = timingFor(cleanScene, ["V3.2-Speciale", "shipped", "today."]);
    const result = generateSubtitles(timing, [{ sceneId: 2, duration: 3 }], assPath, {
      scenes: [cleanScene],
    });
    expect(result.cues.length).toBeGreaterThan(0);
    expect(existsSync(assPath)).toBe(true);
  });
});

describe("findUnmappedSpokenScenes", () => {
  it("flags an author-written spoken track with no replacement to undo it", () => {
    // The remaining hole after the static check: nothing maps, so nothing is
    // checked and the spoken form would be burned in as written.
    const scenes = [
      {
        id: 40,
        voiceover: "It beat GPT-5.6.",
        ttsText: "It beat GPT five point six.",
        ttsReplacements: [],
      },
    ];
    expect(findUnmappedSpokenScenes(scenes)).toEqual([
      { sceneId: 40, voiceover: "It beat GPT-5.6.", ttsText: "It beat GPT five point six." },
    ]);
  });

  it("ignores punctuation-only drift, which normalizes to the same words", () => {
    // No replacement here — the tracks match at the word level once punctuation
    // is stripped, so there is nothing to compensate for.
    const scenes = [
      {
        id: 41,
        voiceover: "Dropped Flash with a new architecture.",
        ttsText: "Dropped Flash, with a new architecture.",
        ttsReplacements: [],
      },
    ];
    expect(findUnmappedSpokenScenes(scenes)).toEqual([]);
  });

  it("stays quiet when a replacement explains the difference", () => {
    const scenes = [cleanScene];
    expect(findUnmappedSpokenScenes(scenes)).toEqual([]);
  });
});

describe("assertDualTrackRestorable unmapped warning", () => {
  it("warns instead of throwing — an unmapped line is a review item, not a leak", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scenes = [
      {
        id: 42,
        voiceover: "It beat GPT-5.6.",
        ttsText: "It beat GPT five point six.",
        ttsReplacements: [],
      },
    ];
    expect(() => assertDualTrackRestorable({ scenes })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no restore mapping"));
    warn.mockRestore();
  });
});
