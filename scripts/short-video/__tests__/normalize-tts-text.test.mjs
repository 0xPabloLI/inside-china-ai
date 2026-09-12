/**
 * Tests for normalize-tts-text.mjs dual-track contract.
 *
 * User decision 2026-09-09: TTS may read a rewritten spoken form, but the
 * DISPLAY track (voiceover → subtitles) must keep the original tokens.
 */
import { describe, it, expect } from "vitest";
import { normalizeTtsText } from "../lib/normalize-tts-text.mjs";

describe("normalizeTtsText dual-track", () => {
  it("keeps voiceover untouched and writes ttsText + replacements", () => {
    const scenes = [
      { id: 1, voiceover: "DeepSeek just dropped V4.1 Flash today." },
    ];
    normalizeTtsText(scenes);

    expect(scenes[0].voiceover).toBe("DeepSeek just dropped V4.1 Flash today.");
    expect(scenes[0].ttsText).toBe(
      "DeepSeek just dropped V four point one Flash today.",
    );
    expect(scenes[0].ttsReplacements).toEqual([
      { original: "V4.1", spoken: ["V", "four", "point", "one"] },
    ]);
  });

  it("records decimals and context dates without swallowing keywords", () => {
    const scenes = [
      {
        id: 2,
        voiceover:
          "Pro costs 1.32 dollars. The model ID literally says expires on 0910.",
      },
    ];
    normalizeTtsText(scenes);

    expect(scenes[0].ttsText).toBe(
      "Pro costs one point three two dollars. The model ID literally says expires on September tenth.",
    );
    expect(scenes[0].ttsReplacements).toEqual([
      { original: "1.32", spoken: ["one", "point", "three", "two"] },
      // spoken covers ONLY the digits — "expires on" must survive for restore
      { original: "0910", spoken: ["September", "tenth"] },
    ]);
  });

  it("leaves scenes without special tokens untouched", () => {
    const scenes = [
      { id: 3, voiceover: "Follow China AI News for more." },
    ];
    normalizeTtsText(scenes);
    expect(scenes[0].ttsText).toBeUndefined();
    expect(scenes[0].ttsReplacements).toBeUndefined();
  });

  it("prefers author-authored voiceoverTts over regex rules", () => {
    const scenes = [
      {
        id: 4,
        voiceover: "The ID is expires on 0910.",
        voiceoverTts: "The ID is expires on September tenth.",
      },
    ];
    normalizeTtsText(scenes);
    expect(scenes[0].ttsText).toBe("The ID is expires on September tenth.");
    expect(scenes[0].ttsReplacements).toEqual([
      { original: "0910", spoken: ["September", "tenth"] },
    ]);
  });
});

describe("normalizeTtsText digit+unit splitting (#239)", () => {
  it("splits resolution tokens so TTS does not swallow the trailing letter", () => {
    const scenes = [
      {
        id: 10,
        voiceover:
          "It hit 720p at 60 frames per second, and the Pro does 1080p.",
      },
    ];
    normalizeTtsText(scenes);

    expect(scenes[0].voiceover).toBe(
      "It hit 720p at 60 frames per second, and the Pro does 1080p.",
    );
    expect(scenes[0].ttsText).toBe(
      "It hit 720 P at 60 frames per second, and the Pro does 1080 P.",
    );
    expect(scenes[0].ttsReplacements).toEqual([
      { original: "720p", spoken: ["720", "P"] },
      { original: "1080p", spoken: ["1080", "P"] },
    ]);
  });

  it("splits spec units: 4K, 16GB, 120fps, 5nm, 32bit, 2TB", () => {
    const scenes = [
      {
        id: 11,
        voiceover:
          "It renders 4K from 16GB of memory, pushes 120fps on 5nm silicon with 32bit color and 2TB storage.",
      },
    ];
    normalizeTtsText(scenes);
    expect(scenes[0].ttsText).toBe(
      "It renders 4 K from 16 GB of memory, pushes 120 FPS on 5 NM silicon with 32 bit color and 2 TB storage.",
    );
  });

  it("does not split chip codenames, hex, or B/X/letter-prefix tokens", () => {
    const scenes = [
      {
        id: 12,
        voiceover:
          "H100 and B200 run 0x12a hex kernels; the API costs $1.4B and usage grew 10x.",
      },
    ];
    normalizeTtsText(scenes);
    expect(scenes[0].ttsText).toBeUndefined();
    expect(scenes[0].ttsReplacements).toBeUndefined();
  });
});