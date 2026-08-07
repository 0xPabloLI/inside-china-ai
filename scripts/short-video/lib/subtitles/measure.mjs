/**
 * Pixel width measurement for subtitle chunking (spec D2).
 *
 * Approximates Helvetica Neue Bold advance widths using the Adobe
 * Helvetica-Bold AFM table (widths per 1000-em). measureWidth() scales the
 * sums by the subtitle font size, so chunking can guarantee single-line cues
 * against SUBTITLE_LANE.maxWidth (720px) in the normal case.
 *
 * This is intentionally an approximation: rendering devices may substitute
 * fonts and shape differently. The two-line reserved subtitle lane
 * (SUBTITLE_LANE, T1) is the safety net for any overage — a worst-case wrap
 * lands inside the lane, never on scene content.
 */

import { SUBTITLE_LANE } from "../safe-zones.mjs";

/** Unknown-character fallback (digit advance, the most common wide glyph). */
export const DEFAULT_WIDTH_UNITS = 556;

/**
 * Advance widths per 1000-em — Adobe Helvetica-Bold AFM.
 * Keys are single characters; anything absent falls back to
 * DEFAULT_WIDTH_UNITS.
 */
const WIDTH_UNITS = {
  " ": 278,
  "!": 333,
  '"': 474,
  "#": 556,
  $: 556,
  "%": 889,
  "&": 722,
  "'": 278,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 556,
  0: 556,
  1: 556,
  2: 556,
  3: 556,
  4: 556,
  5: 556,
  6: 556,
  7: 556,
  8: 556,
  9: 556,
  ":": 278,
  ";": 278,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 611,
  "@": 975,
  A: 722,
  B: 722,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 556,
  K: 722,
  L: 611,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  "[": 333,
  "\\": 556,
  "]": 333,
  "^": 584,
  _: 556,
  "`": 333,
  a: 556,
  b: 611,
  c: 556,
  d: 611,
  e: 556,
  f: 333,
  g: 611,
  h: 611,
  i: 278,
  j: 278,
  k: 556,
  l: 278,
  m: 889,
  n: 611,
  o: 611,
  p: 611,
  q: 611,
  r: 389,
  s: 556,
  t: 333,
  u: 611,
  v: 556,
  w: 778,
  x: 556,
  y: 556,
  z: 500,
  "{": 389,
  "|": 280,
  "}": 389,
  "~": 584,
};

/**
 * Measured width of a string in actual pixels at the subtitle font size.
 *
 * @param {string} text
 * @returns {number} width in px
 */
export function measureWidth(text) {
  let units = 0;
  for (const ch of String(text ?? "")) {
    units += WIDTH_UNITS[ch] ?? DEFAULT_WIDTH_UNITS;
  }
  return (units / 1000) * SUBTITLE_LANE.fontSize;
}
