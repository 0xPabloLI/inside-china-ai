/**
 * Video-surface palette — the colour values the composition and the burn path
 * share.
 *
 * `remotion/src/tokens.ts` re-exports these inside its `COLOR` object for the
 * on-canvas composition; `lib/subtitles/style-tokens.mjs` consumes the same
 * values for the libass burn. The two surfaces must never disagree on what
 * Dispatch Blue is, and Node cannot import the TS token module, so the hexes
 * live here — a dependency-free `.mjs`, the same pattern as
 * `lib/type-scale.mjs` (#739) — and both sides import them.
 *
 * This is not the whole brand palette: `COLOR` in tokens.ts still owns the
 * surface-only values (canvas, muted text, semantic colours). Only the two
 * values with a second consumer live here.
 */

/** Colour tokens shared by the composition and the burn path. */
export const VIDEO_PALETTE = {
  /** Dispatch Blue — DESIGN.md §2, the single brand accent. */
  brand: "#4d8bff",
  /** Primary on-canvas text (and the unspoken-word colour of the cue). */
  text: "#f5f5f5",
};
