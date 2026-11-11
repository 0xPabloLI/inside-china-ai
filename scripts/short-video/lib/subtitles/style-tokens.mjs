/**
 * Subtitle visual tokens — the single source for how a burned-in cue looks.
 *
 * The ASS style row was assembled from literals scattered through `ass.mjs`:
 * the two karaoke colours, the family, the outline/shadow widths, the glyph
 * spacing. Changing the cue's look meant editing the serialiser, and no gate
 * could tell a deliberate change from a typo. This module owns those decisions
 * as data; `ass.mjs` only serialises them.
 *
 * Naming: "tokens" here means VISUAL tokens. `restore-tokens.mjs` in the same
 * directory uses the word for ASR display tokens; this file is deliberately
 * `style-tokens.mjs` so the two never read as the same concept.
 *
 * Two seams are deliberate:
 *
 * - **Position stays in `lib/safe-zones.mjs`.** `SUBTITLE_LANE` owns font size,
 *   the three margins and the bottom-centre alignment, because
 *   `SUBTITLE_LANE_TOP/BOTTOM` are derived from them and the content band is
 *   laid out against that box. Copying them here would create the drift this
 *   refactor is removing. The style row reads them from the lane.
 * - **Colour is the video palette.** `spoken` is Dispatch Blue and
 *   `unspoken` is the primary text colour. Both values come from
 *   `lib/video-palette.mjs`, which `remotion/src/tokens.ts` also imports for
 *   its `COLOR` object — one declaration, two surfaces. Values here are sRGB
 *   hex because that is what `toAssColor` consumes; the ASS word itself
 *   (`&HAABBGGRR`) is derived, never authored by hand.
 *
 * Scope (#747 HITL ruling A, 2026-11-09): pure refactor. Current values only,
 * zero visual change. New emphasis techniques (scale / glow / underline / pill)
 * are a separate brand decision and must extend this object rather than return
 * to literals in the serialiser.
 */

import { VIDEO_PALETTE } from "../video-palette.mjs";

/**
 * One ASS colour: `hex` is the sRGB value, `alpha` is ASS's inverted alpha
 * channel (`0x00` opaque, `0xFF` transparent) because that is what the burn
 * format consumes — keeping the inversion explicit stops a 40%-transparent
 * outline from being read as "40% opacity".
 *
 * @typedef {{ hex: string, alpha: number }} ColorToken
 */

/** The one black the cue uses for both the outline and the shadow fallback. */
const STROKE_INK = { hex: "#000000", alpha: 0x66 };

/**
 * Look tokens for the burned-in cue. Everything here reaches libass through
 * the style row; nothing here moves the cue.
 *
 * - `font.family` is the shipped burn face. It is NOT `BRAND_FONT_STACK`
 *   (the composition's serif): subtitles are rasterised by libass, the
 *   composition by the browser. `lib/subtitles/measure.mjs` approximates this
 *   face's advance widths (Adobe Helvetica-Bold AFM), so the contract test
 *   pins family + weight to that assumption.
 * - `font.bold` serialises to ASS `Bold: -1` (the format's true).
 * - `color.spoken` / `color.unspoken` are the karaoke pair: primary colour
 *   fills a word as it is spoken, secondary colour is what it was before.
 *   `outline` and `back` share one ink — ASS needs both fields, the cue uses
 *   the same 40% black in each, so they reference one object.
 * - `stroke.outlineWidth` / `stroke.shadowOffset` are libass px at the ASS
 *   script resolution (1080×1920), not CSS px. `borderStyle: 1` is the
 *   outline-and-shadow box (no opaque box behind the text).
 * - `glyph.*` is how the glyphs are laid out inside the cue: letter spacing
 *   (ASS `Spacing`), horizontal/vertical scale and rotation, all at their
 *   neutral values today. They live here because changing any of them is a
 *   look change, not an override in the serialiser.
 *
 * @type {{
 *   font: { family: string, bold: boolean },
 *   color: {
 *     unspoken: ColorToken,
 *     spoken: ColorToken,
 *     outline: ColorToken,
 *     back: ColorToken,
 *   },
 *   stroke: { outlineWidth: number, shadowOffset: number, borderStyle: number },
 *   glyph: { letterSpacing: number, scaleX: number, scaleY: number, angle: number },
 * }}
 */
export const SUBTITLE_STYLE = {
  font: {
    family: "Helvetica Neue",
    bold: true,
  },
  color: {
    /** Unspoken words (SecondaryColour) — near-white, legible on the dark stage. */
    unspoken: { hex: VIDEO_PALETTE.text, alpha: 0x00 },
    /** Spoken words (PrimaryColour) — Dispatch Blue, DESIGN.md's progress marker. */
    spoken: { hex: VIDEO_PALETTE.brand, alpha: 0x00 },
    /** Outline (OutlineColour) — 40% transparent black. */
    outline: STROKE_INK,
    /** Back colour (BackColour) — the shadow fallback, same ink as the outline. */
    back: STROKE_INK,
  },
  stroke: {
    outlineWidth: 3,
    shadowOffset: 1,
    borderStyle: 1,
  },
  glyph: {
    letterSpacing: 0,
    scaleX: 100,
    scaleY: 100,
    angle: 0,
  },
};

/**
 * Serialise a token as an ASS colour (`&HAABBGGRR`).
 *
 * ASS stores colours as an inverted-alpha + BGR hex word. Deriving it instead
 * of writing the word by hand is the point: `#4d8bff` reads as the brand blue,
 * `&H00FF8B4D` does not.
 *
 * Fails closed on malformed input rather than emitting a colour that libass
 * would silently read as something else (a bad hex string would otherwise
 * produce a black cue that only shows up in the finished video).
 *
 * @param {ColorToken} token
 * @returns {string}
 */
export function toAssColor({ hex, alpha }) {
  if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`toAssColor: expected a #rrggbb hex colour, got ${JSON.stringify(hex)}`);
  }
  if (!Number.isInteger(alpha) || alpha < 0x00 || alpha > 0xff) {
    throw new Error(
      `toAssColor: expected an integer alpha 0x00-0xff, got ${JSON.stringify(alpha)}`,
    );
  }
  const alphaHex = alpha.toString(16).padStart(2, "0");
  const blue = hex.slice(5, 7);
  const green = hex.slice(3, 5);
  const red = hex.slice(1, 3);
  return `&H${alphaHex}${blue}${green}${red}`.toUpperCase();
}
