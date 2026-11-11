/**
 * Subtitle visual token contract (#747).
 *
 * The tokens are data, so the assertions pin the values independently of the
 * module under test: the style row below is the exact row shipped before the
 * refactor. If a token changes, this test is where that change has to be
 * declared — the cue's look cannot drift as a side effect of editing the
 * serialiser.
 */
import { describe, it, expect } from "vitest";
import { SUBTITLE_STYLE, toAssColor } from "../lib/subtitles/style-tokens.mjs";
import { SUBTITLE_LANE } from "../lib/safe-zones.mjs";
import { VIDEO_PALETTE } from "../lib/video-palette.mjs";
import { renderAss } from "../lib/subtitles/ass.mjs";
import { COLOR } from "../remotion/src/tokens.ts";

const styleRow = (overrides) =>
  renderAss([], overrides)
    .split("\n")
    .find((line) => line.startsWith("Style: "));

describe("toAssColor", () => {
  it("serialises the video palette as ASS inverted-alpha BGR words", () => {
    // #4d8bff is Dispatch Blue; ASS stores BGR, so FF 8B 4D.
    expect(toAssColor({ hex: "#4d8bff", alpha: 0x00 })).toBe("&H00FF8B4D");
    expect(toAssColor({ hex: "#f5f5f5", alpha: 0x00 })).toBe("&H00F5F5F5");
    // 0x66 is 40% transparent in ASS's inverted alpha channel.
    expect(toAssColor({ hex: "#000000", alpha: 0x66 })).toBe("&H66000000");
  });

  it("accepts lowercase hex and emits uppercase", () => {
    expect(toAssColor({ hex: "#4d8bff", alpha: 0x00 })).toBe(
      toAssColor({ hex: "#4D8BFF", alpha: 0x00 }),
    );
  });

  it("fails closed on malformed colours instead of emitting a wrong cue", () => {
    // A 3-digit hex, a missing hash, a bad digit and an out-of-range alpha all
    // have to throw: libass would otherwise render something nobody checked.
    expect(() => toAssColor({ hex: "#fff", alpha: 0 })).toThrow(/hex/i);
    expect(() => toAssColor({ hex: "4d8bff", alpha: 0 })).toThrow(/hex/i);
    expect(() => toAssColor({ hex: "#4d8bgg", alpha: 0 })).toThrow(/hex/i);
    expect(() => toAssColor({ hex: "#4d8bff", alpha: 0x100 })).toThrow(/alpha/i);
    expect(() => toAssColor({ hex: "#4d8bff", alpha: 1.5 })).toThrow(/alpha/i);
    expect(() => toAssColor({ hex: "#4d8bff" })).toThrow(/alpha/i);
  });
});

describe("shared video palette", () => {
  it("declares the brand accent and primary text once, for both surfaces", () => {
    // Pinned literals: lib/video-palette.mjs is the one declaration. Moving a
    // value means changing it here, and both consumers are asserted to read
    // that module rather than carry a second hardcoded copy.
    expect(VIDEO_PALETTE.brand).toBe("#4d8bff");
    expect(VIDEO_PALETTE.text).toBe("#f5f5f5");
    expect(SUBTITLE_STYLE.color.spoken.hex).toBe(VIDEO_PALETTE.brand);
    expect(SUBTITLE_STYLE.color.unspoken.hex).toBe(VIDEO_PALETTE.text);
    expect(COLOR.brand).toBe(VIDEO_PALETTE.brand);
    expect(COLOR.text).toBe(VIDEO_PALETTE.text);
  });

  it("keeps the family the width table was built for", () => {
    // lib/subtitles/measure.mjs approximates Adobe Helvetica-Bold advance
    // widths to keep cues inside maxWidth. A family or weight change
    // invalidates that table, so it has to happen in the same change.
    expect(SUBTITLE_STYLE.font.family).toBe("Helvetica Neue");
    expect(SUBTITLE_STYLE.font.bold).toBe(true);
  });
});

describe("renderAss style row", () => {
  it("emits the shipped style row byte for byte", () => {
    // Pre-#747 output, pinned literally:
    //   family / size / spoken / unspoken / outline / back / Bold … margins
    const expected =
      "Style: Default,Helvetica Neue,60," +
      "&H00FF8B4D,&H00F5F5F5,&H66000000,&H66000000," +
      "-1,0,0,0,100,100,0,0,1,3,1,2," +
      "110,250,500,1";
    expect(styleRow()).toBe(expected);
  });

  it("reads lane position values instead of carrying its own copy", () => {
    // If ass.mjs stops reading the lane (and hardcodes a stale value), this
    // fails; that is the seam guard, not a tautology — the lane values are
    // imported here, the serialiser has to agree with them.
    const row = styleRow();
    expect(row).toContain(
      `,${SUBTITLE_LANE.alignment},${SUBTITLE_LANE.marginL},${SUBTITLE_LANE.marginR},${SUBTITLE_LANE.marginV},1`,
    );
    expect(row).toContain(
      `Style: Default,${SUBTITLE_STYLE.font.family},${SUBTITLE_LANE.fontSize},`,
    );
  });

  it("routes every look token through the override surface", () => {
    // styleOverrides used to reach the style row directly for some fields and
    // silently miss `bold`; all look fields now flow through DEFAULT_STYLE.
    const row = styleRow({
      bold: false,
      scaleX: 90,
      scaleY: 110,
      letterSpacing: 2,
      angle: 5,
      borderStyle: 3,
      outline: 4,
      shadow: 2,
      alignment: 5,
    });
    expect(row).toBe(
      "Style: Default,Helvetica Neue,60," +
        "&H00FF8B4D,&H00F5F5F5,&H66000000,&H66000000," +
        "0,0,0,0,90,110,2,5,3,4,2,5," +
        "110,250,500,1",
    );
  });
});
