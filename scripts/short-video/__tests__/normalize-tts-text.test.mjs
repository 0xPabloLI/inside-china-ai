/**
 * Tests for normalize-tts-text.mjs dual-track contract.
 *
 * User decision 2026-09-09: TTS may read a rewritten spoken form, but the
 * DISPLAY track (voiceover → subtitles) must keep the original tokens.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeTtsText,
  splitDigitUnitToken,
  numberToWords,
  cardinalSpokenWords,
} from "../lib/normalize-tts-text.mjs";

describe("normalizeTtsText dual-track", () => {
  it("keeps voiceover untouched and writes ttsText + replacements", () => {
    const scenes = [{ id: 1, voiceover: "DeepSeek just dropped V4.1 Flash today." }];
    normalizeTtsText(scenes);

    expect(scenes[0].voiceover).toBe("DeepSeek just dropped V4.1 Flash today.");
    expect(scenes[0].ttsText).toBe("DeepSeek just dropped V four point one Flash today.");
    expect(scenes[0].ttsReplacements).toEqual([
      { original: "V4.1", spoken: ["V", "four", "point", "one"] },
    ]);
  });

  it("records decimals and context dates without swallowing keywords", () => {
    const scenes = [
      {
        id: 2,
        voiceover: "Pro costs 1.32 dollars. The model ID literally says expires on 0910.",
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
    const scenes = [{ id: 3, voiceover: "Follow China AI News for more." }];
    normalizeTtsText(scenes);
    expect(scenes[0].ttsText).toBeUndefined();
    expect(scenes[0].ttsReplacements).toBeUndefined();
  });

  it("records a hyphenated dotted version as ONE token so restore can map it", () => {
    // "GPT-5.6": the whole token is rewritten, not just "5.6". Recording only
    // the digits emitted "GPT-five point six" whose first token no longer
    // matched the spoken run, so restore left the spoken form in the timing
    // and Gate 1 failed against the display voiceover.
    const scenes = [{ id: 1, voiceover: "It beat GPT-5.6 on nine of eleven." }];
    normalizeTtsText(scenes);

    expect(scenes[0].ttsText).toBe("It beat GPT-five point six on nine of eleven.");
    expect(scenes[0].ttsReplacements).toEqual([
      { original: "GPT-5.6", spoken: ["GPT-five", "point", "six"] },
    ]);
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
        voiceover: "It hit 720p at 60 frames per second, and the Pro does 1080p.",
      },
    ];
    normalizeTtsText(scenes);

    expect(scenes[0].voiceover).toBe(
      "It hit 720p at 60 frames per second, and the Pro does 1080p.",
    );
    expect(scenes[0].ttsText).toBe(
      "It hit 720 P at sixty frames per second, and the Pro does 1080 P.",
    );
    expect(scenes[0].ttsReplacements).toEqual([
      // "60" is a bare cardinal (rule 8) and is expanded in the same pass;
      // "720p"/"1080p" stay whole for the digit+unit rule (rule 9).
      { original: "60", spoken: ["sixty"] },
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
        voiceover: "H100 and B200 run 0x12a hex kernels; the API costs $1.4B and usage grew 10x.",
      },
    ];
    normalizeTtsText(scenes);
    expect(scenes[0].ttsText).toBeUndefined();
    expect(scenes[0].ttsReplacements).toBeUndefined();
  });
});

// ─── Cardinal integers: the spoken track must be digit-free ───
// text-align.py aligns against scene.ttsText, and wav2vec2 has no digit
// tokens. A bare cardinal ("115,000") that survives into ttsText cannot be
// aligned: the aligner consumes what it can, stops short of the audio's real
// end, and the #232 tail guard then cuts the unmatched speech.
// Observed 2026-10-14: deepseek-flash-silent-update scene 3 said "That clip
// reached 100" in the rendered video, losing "115,000 views".
describe("normalizeTtsText cardinal integers (digit-free spoken track)", () => {
  it("expands a thousands-grouped integer so no digit token reaches the aligner", () => {
    const scenes = [{ id: 20, voiceover: "That clip reached 115,000 views." }];
    normalizeTtsText(scenes);

    expect(scenes[0].voiceover).toBe("That clip reached 115,000 views.");
    expect(scenes[0].ttsText).toBe("That clip reached one hundred fifteen thousand views.");
    expect(scenes[0].ttsReplacements).toEqual([
      { original: "115,000", spoken: ["one", "hundred", "fifteen", "thousand"] },
    ]);
  });

  it("expands bare integers in sentence-final position (the tail-cut risk zone)", () => {
    const scenes = [{ id: 21, voiceover: "Fable 5.1 managed 40." }];
    normalizeTtsText(scenes);

    expect(scenes[0].ttsText).toBe("Fable five point one managed forty.");
    expect(scenes[0].ttsReplacements).toEqual([
      { original: "5.1", spoken: ["five", "point", "one"] },
      { original: "40", spoken: ["forty"] },
    ]);
  });

  it("leaves currency-prefixed amounts to the currency step", () => {
    // "$20 million" must not become "$twenty million": the engine reads the
    // symbol and the amount together, and step 0.5 owns that pairing.
    const scenes = [{ id: 23, voiceover: "DeepSeek bought in for about $20 million." }];
    normalizeTtsText(scenes);

    expect(scenes[0].ttsText).toBeUndefined();
    expect(scenes[0].ttsReplacements).toBeUndefined();
  });

  it("leaves decimals, hex, digit+unit and letter-prefixed tokens to their own rules", () => {
    const scenes = [
      { id: 22, voiceover: "H100 and B200 run 0x12a; $1.4B with 10x growth at 720p." },
    ];
    normalizeTtsText(scenes);

    // "720p" is #239's seam (mirrored by the ASR alias side), everything else
    // must stay untouched — no digit gets expanded out of a larger token.
    expect(scenes[0].ttsText).toBe("H100 and B200 run 0x12a; $1.4B with 10x growth at 720 P.");
    expect(scenes[0].ttsReplacements).toEqual([{ original: "720p", spoken: ["720", "P"] }]);
  });

  it("leaves quadrillion-scale integers alone rather than drop their magnitude word", () => {
    // The scale table ends at trillion. Splicing a 6-group number through it
    // emitted only the leading group ("one" for 1e15) with no digits left for
    // the callers' digit guard to catch, so the spoken track silently lost
    // five orders of magnitude. Returning the digits keeps the pre-2026-10-14
    // fallback: the token stays as-is.
    expect(numberToWords(1e15)).toBe("1000000000000000");
    expect(numberToWords(999999999999999)).toBe(
      "nine hundred ninety nine trillion nine hundred ninety nine billion " +
        "nine hundred ninety nine million nine hundred ninety nine thousand " +
        "nine hundred ninety nine",
    );
    expect(cardinalSpokenWords("1000000000000000")).toEqual([]);

    const scenes = [{ id: 24, voiceover: "It cost 1000000000000000 tokens." }];
    normalizeTtsText(scenes);
    expect(scenes[0].ttsText).toBeUndefined();
    expect(scenes[0].ttsReplacements).toBeUndefined();
  });
});

// ─── #548: token-level projection of the same whitelist (ASR alias seam) ───
// quality-gate.mjs uses this to mirror the #239 split on the HEARD side
// ("720p" → "720" + "P"), so the alias can never drift from the spoken-split
// side: both regexes are built from one shared alternation.
describe("splitDigitUnitToken (#548)", () => {
  it("splits whitelisted tokens with the same rules as splitDigitUnits", () => {
    expect(splitDigitUnitToken("720p")).toEqual({ digits: "720", unit: "P" });
    expect(splitDigitUnitToken("16GB")).toEqual({ digits: "16", unit: "GB" });
    expect(splitDigitUnitToken("144Hz")).toEqual({ digits: "144", unit: "Hz" });
    expect(splitDigitUnitToken("32bit")).toEqual({ digits: "32", unit: "bit" });
  });

  it("returns null outside the curated whitelist", () => {
    for (const token of ["0x12a", "10x", "H100", "A100", "B200", "4b", "720p1", "x4k"]) {
      expect(splitDigitUnitToken(token)).toBeNull();
    }
  });
});
