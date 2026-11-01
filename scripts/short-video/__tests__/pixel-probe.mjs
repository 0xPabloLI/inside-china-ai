/**
 * Pixel-probe helpers for the render suites that assert WHICH part of a source
 * landed in a frame.
 *
 * Why this module exists (#1084): `media-focus-render` spent 2026-10-30..11-01
 * red on main, and nothing in CI could see it, because the suite is in
 * `CI_SKIPPED_MACHINE_BOUND` (it shells out to `npx remotion still`, so it ran
 * nowhere in CI until the `pixel-render` job took it on — #1087) and its
 * sampling arithmetic was private to that file. The arithmetic now lives here,
 * with `pixel-probe.test.mjs` next to it running in CI — so a broken read is a
 * red CI test, and "render a real frame" is covered too, by the `pixel-render`
 * job that runs six of the eight render suites (#1087).
 *
 * It sits in `__tests__/` rather than `lib/frame-analysis.mjs` because every
 * consumer is a test: `lib/frame-analysis.mjs` keeps the pixel helpers that
 * production gates actually call (`sampleRegion`, the safe-zone checks), and
 * this module borrows `sampleRegion` instead of walking the stride again.
 *
 * What went wrong, concretely, and why each guard below exists:
 *
 *   - The patch was centred on `CARD_CENTRE.y` = 648.5 (EVIDENCE_CARD.height is
 *     odd). `getPixel` indexes `data[(width * y + x) * 4]`, so with an even
 *     width `width * 648.5` stays INTEGRAL and the half pixel is swallowed into
 *     the offset: a 60x60 patch that should read x 440-498 read x 980-1038 —
 *     outside the 820px card, i.e. frame background. Hence the rounding, and
 *     hence the refusal to sample outside the frame (a silently clamped patch
 *     would reproduce the bug one edge over).
 *   - The classifier picked the nearest palette entry with no distance ceiling.
 *     Pure black is 65025 (squared) from red, lime AND blue — exactly equal —
 *     so an unrendered frame resolved to whichever entry came first: "expected
 *     red to be blue" on the case that failed, and a green test on the case
 *     that happened to expect red, both while sampling nothing. Hence a `null`
 *     return, and hence validating both sides: "the read was broken" and "no
 *     band here" are the two answers this module exists to keep apart.
 */
import { sampleRegion } from "../lib/frame-analysis.mjs";

/**
 * Side length (px) of the `meanColourInPatch` square.
 *
 * Large enough that h264 / canvas colour noise averages out, small enough to
 * stay inside a single colour band of a fixture source.
 */
const PATCH_SIZE = 60;

/** Sampling stride inside that patch (every 2nd pixel on both axes). */
const PATCH_STEP = 2;

/**
 * Max RGB distance at which a colour still counts as a palette entry.
 *
 * Bands are saturated primaries, so a real hit lands within a few units of its
 * entry (measured: 252/0/0 for pure red after the h264 round-trip, distance 3).
 * Everything beyond 96 is a colour a fixture never painted: the blend halfway
 * between two primaries is ~180 out, the #0a0a14 card background ~235 from
 * blue, the frame's #000 255 on every channel (65025 once squared).
 *
 * The comparison is strict, so a colour exactly 96 out does not match. That
 * bound is what keeps the three-way tie of an unrendered frame unresolvable —
 * the frame background must never come back as a band name (#1084).
 */
const MAX_DISTANCE = 96;

/**
 * Mean RGB of a PATCH_SIZE square centred on (x, y).
 *
 * A half-pixel centre is not addressable, so either neighbouring row is equally
 * correct; what matters is that the read is one of them (see the module header).
 *
 * @param {{data: Uint8Array, width: number, height: number}} buf
 * @param {{x: number, y: number}} options
 * @returns {{r: number, g: number, b: number}}
 */
export function meanColourInPatch(buf, { x, y }) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`meanColourInPatch: centre must be finite, got (${x}, ${y})`);
  }
  const half = Math.floor(PATCH_SIZE / 2);
  const xStart = Math.round(x) - half;
  const yStart = Math.round(y) - half;
  const xEnd = xStart + PATCH_SIZE;
  const yEnd = yStart + PATCH_SIZE;
  if (xStart < 0 || yStart < 0 || xEnd > buf.width || yEnd > buf.height) {
    throw new Error(
      `meanColourInPatch: ${PATCH_SIZE}x${PATCH_SIZE} patch at ` +
        `(${Math.round(x)}, ${Math.round(y)}) spans x ${xStart}-${xEnd - 1}, ` +
        `y ${yStart}-${yEnd - 1} — outside the ${buf.width}x${buf.height} frame`,
    );
  }
  const patch = sampleRegion(buf, { xStart, xEnd, yStart, yEnd }, PATCH_STEP);
  let r = 0;
  let g = 0;
  let b = 0;
  for (const sample of patch) {
    r += sample.r;
    g += sample.g;
    b += sample.b;
  }
  return {
    r: Math.round(r / patch.length),
    g: Math.round(g / patch.length),
    b: Math.round(b / patch.length),
  };
}

/**
 * Nearest named colour, or `null` when nothing in the palette is close enough.
 *
 * The `null` is load-bearing (#1084): pure black sits 65025 (squared) from red,
 * lime AND blue — exactly equal — so a "closest wins" classifier with no
 * distance ceiling resolves an unrendered frame to whichever entry it iterates
 * first and reports a confident band. "Nothing was drawn" must not be
 * expressible as a palette name.
 *
 * A tie INSIDE the ceiling cannot happen for saturated primaries: two of them
 * are 255 apart on one channel, so their midpoint sits ~180 out and already
 * fails the ceiling. That is why the ceiling is a constant and not an option —
 * an earlier revision let callers widen it, which re-opened the tie.
 *
 * @param {{r: number, g: number, b: number}} rgb
 * @param {Record<string, {r: number, g: number, b: number}>} palette
 * @returns {string|null}
 */
export function nearestPaletteColour(rgb, palette) {
  for (const channel of ["r", "g", "b"]) {
    if (!Number.isFinite(rgb?.[channel])) {
      throw new Error(`nearestPaletteColour: ${channel} must be finite, got ${rgb?.[channel]}`);
    }
  }
  let best = null;
  let bestDist = MAX_DISTANCE ** 2;
  for (const [name, entry] of Object.entries(palette)) {
    for (const channel of ["r", "g", "b"]) {
      if (!Number.isFinite(entry?.[channel])) {
        throw new Error(
          `nearestPaletteColour: palette.${name}.${channel} must be finite, got ${entry?.[channel]}`,
        );
      }
    }
    const d = (rgb.r - entry.r) ** 2 + (rgb.g - entry.g) ** 2 + (rgb.b - entry.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}
