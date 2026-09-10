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