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
import { restoreTimingTokens } from "../lib/subtitles/restore-tokens.mjs";

/**
 * End-to-end simulation of the dual track: the aligner emits exactly the
 * whitespace tokens of ttsText, restore maps them back, and the result must
 * equal the display voiceover. A leak (spoken form in the output) is exactly
 * the #753 symptom — "GPT-five" burned into the video.
 */
function roundTrip(voiceover) {
  const scenes = [{ id: 1, voiceover }];
  normalizeTtsText(scenes);
  const ttsText = scenes[0].ttsText ?? voiceover;
  const words = ttsText
    .split(/\s+/)
    .filter(Boolean)
    .map((text, i) => ({ text, start: i, end: i + 1 }));
  const restored = restoreTimingTokens(
    [{ sceneId: 1, segments: [{ text: ttsText, words }] }],
    scenes,
  )[0].segments.flatMap((s) => s.words.map((w) => w.text));
  return { scenes: scenes[0], ttsText, restored: restored.join(" ") };
}

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

  it("records a 5+ letter hyphenated dotted version the same way", () => {
    // The rule first shipped with a 1-4 letter prefix cap, so "Claude-3.5"
    // fell through to rule 3, which consumed only "3.5" and left the same
    // unrecoverable spoken run. Real model names are longer than 4 letters.
    const scenes = [{ id: 1, voiceover: "Claude-3.5 is the closest rival." }];
    normalizeTtsText(scenes);

    expect(scenes[0].ttsText).toBe("Claude-three point five is the closest rival.");
    expect(scenes[0].ttsReplacements).toEqual([
      { original: "Claude-3.5", spoken: ["Claude-three", "point", "five"] },
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

// ─── #753: replacements must stay whitespace-token aligned ───
// restore-tokens matches whole whitespace tokens of the spoken track. A rule
// that rewrites only part of a token ("V3.2" inside "V3.2-Speciale", "2"
// inside "2-3x") glues the spoken words to the leftover text, restore cannot
// consume the run, and the spoken form is burned into the video — the defect
// that shipped "GPT-five" instead of "GPT-5.6".
describe("dual-track token boundary (#753)", () => {
  it("keeps a hyphenated suffix attached to the version token", () => {
    const { scenes, ttsText, restored } = roundTrip("V3.2-Speciale shipped today.");

    expect(ttsText).toBe("V three point two-Speciale shipped today.");
    expect(scenes.ttsReplacements).toEqual([
      { original: "V3.2-Speciale", spoken: ["V", "three", "point", "two-Speciale"] },
    ]);
    expect(restored).toBe("V3.2-Speciale shipped today.");
  });

  it("keeps a hyphenated suffix attached to a dotted model name", () => {
    const { scenes, ttsText, restored } = roundTrip("GPT-5.6-Speciale is new.");

    expect(ttsText).toBe("GPT-five point six-Speciale is new.");
    expect(scenes.ttsReplacements).toEqual([
      { original: "GPT-5.6-Speciale", spoken: ["GPT-five", "point", "six-Speciale"] },
    ]);
    expect(restored).toBe("GPT-5.6-Speciale is new.");
  });

  it("reads a numeric range with a multiplier as a range, not two tokens", () => {
    const { scenes, ttsText, restored } = roundTrip("That is a 2-3x speedup.");

    expect(ttsText).toBe("That is a two to three x speedup.");
    expect(scenes.ttsReplacements).toEqual([
      { original: "2-3x", spoken: ["two", "to", "three", "x"] },
    ]);
    expect(restored).toBe("That is a 2-3x speedup.");
  });

  it("reads a percentage range as a range instead of an MM-DD date", () => {
    const { scenes, ttsText, restored } = roundTrip("We saw 10-20% gain.");

    expect(ttsText).toBe("We saw ten to twenty percent gain.");
    expect(scenes.ttsReplacements).toEqual([
      { original: "10-20%", spoken: ["ten", "to", "twenty", "percent"] },
    ]);
    expect(restored).toBe("We saw 10-20% gain.");
  });

  it("never rewrites half of a token glued to CJK text", () => {
    // "涨价20%" is ONE whitespace token to the aligner. Expanding "20" alone
    // produced "涨价twenty%", which restore cannot match back (#753 family).
    const { ttsText, restored } = roundTrip("涨价20%就别买了。");

    expect(ttsText).toBe("涨价20%就别买了。");
    expect(restored).toBe("涨价20%就别买了。");
  });

  it("leaves a hyphenated version whose prefix is another word untouched", () => {
    // "old-V3.2" is one token; rewriting the "V3.2" half is the same leak.
    const { ttsText, restored } = roundTrip("The old-V3.2 build was retired.");

    expect(ttsText).toBe("The old-V3.2 build was retired.");
    expect(restored).toBe("The old-V3.2 build was retired.");
  });

  it("keeps the preposition of a bare MMDD date in the spoken track", () => {
    // The rule matched "by 0910" and emitted only the date, so "by" vanished
    // from ttsText. Every invariant stayed quiet — the run was consumable,
    // nothing leaked, and the scene had replacements — so the missing word
    // burned into the subtitle with no signal at all.
    const { scenes, ttsText, restored } = roundTrip("Submit by 0910.");

    expect(ttsText).toBe("Submit by September tenth.");
    expect(scenes.ttsReplacements).toEqual([{ original: "0910", spoken: ["September", "tenth"] }]);
    expect(restored).toBe("Submit by 0910.");
  });

  it("keeps an interior preposition when more of the sentence follows", () => {
    const { ttsText, restored } = roundTrip("Ship it on 0910 please.");

    expect(ttsText).toBe("Ship it on September tenth please.");
    expect(restored).toBe("Ship it on 0910 please.");
  });
});

// ─── #753: the author-written spoken track owns the expansion decision ───
describe("author-written voiceoverTts (#753)", () => {
  it("drops rule replacements the author deliberately left in display form", () => {
    // deepseek-harness-desktop scene 6 ships voiceoverTts identical to the
    // display line: the author wants "5 minutes 24 seconds" read as digits.
    // A rule-derived replacement for "5" is then absent from the track and
    // must be dropped instead of failing the line.
    const scenes = [
      { id: 30, voiceover: "5 minutes 24 seconds.", voiceoverTts: "5 minutes 24 seconds." },
    ];
    normalizeTtsText(scenes);

    expect(scenes[0].ttsText).toBe("5 minutes 24 seconds.");
    expect(scenes[0].ttsReplacements).toEqual([]);
  });

  it("keeps the replacements the author did apply", () => {
    const scenes = [
      {
        id: 31,
        voiceover: "On September 8, V4.1 ships.",
        voiceoverTts: "On September 8, V four point one ships.",
      },
    ];
    normalizeTtsText(scenes);

    expect(scenes[0].ttsReplacements).toEqual([
      { original: "V4.1", spoken: ["V", "four", "point", "one"] },
    ]);
  });

  it("restores a four-digit target when the same line also says a bare 2", () => {
    const { restored } = roundTrip(
      "It pays back in 3 years, maybe 2. 2030 target: 100 billion cloud.",
    );
    expect(restored).toBe("It pays back in 3 years, maybe 2. 2030 target: 100 billion cloud.");
  });
});
