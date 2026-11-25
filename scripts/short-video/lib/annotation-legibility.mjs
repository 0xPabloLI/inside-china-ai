/**
 * Annotation legibility — objective floor for the hook underline (#733 S2).
 *
 * The underline is a non-text graphical object: WCAG 2.2 SC 1.4.11 asks for at
 * least 3:1 against the adjacent background, and a vertical-video stroke also
 * has to survive downscaling to a phone. This module turns both into pure
 * functions so the still review and any future pre-render advisory consume the
 * same numbers instead of arguing from screenshots.
 *
 * Thresholds are deliberately separate:
 *   - contrast: 3:1, the WCAG non-text floor (hard, external standard);
 *   - stroke:   0.2% of canvas height, a phone-scale project floor (soft, ours).
 * A 1080×1920 canvas at 0.2% is 3.84 px, about 1.4 CSS px when the clip is
 * displayed at 720 px tall. Below that the line quantises to a hairline on
 * most phones, which is what the 2026-11-22 still review saw.
 *
 * No Remotion or Node-only imports: this is importable from tests and from the
 * CLI without pulling the render stack in.
 */

/** Canvas ground used by the video surface (remotion/src/tokens.ts COLOR.canvas). */
export const ANNOTATION_BACKGROUND = "#0a0a14";

/** Project legibility floor for underline annotations. */
export const ANNOTATION_LEGIBILITY = {
  /** WCAG 2.2 SC 1.4.11 non-text contrast minimum. */
  minContrast: 3,
  /** Phone-scale stroke floor, expressed as a share of canvas height. */
  minStrokeShare: 0.002,
};

/**
 * Parse a CSS colour this module accepts: `#rgb`, `#rrggbb`, `rgb(...)`,
 * `rgba(...)`. Returns 8-bit channels plus alpha; throws on anything else so a
 * typo cannot silently evaluate as black.
 *
 * @param {string} input
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function parseColor(input) {
  if (typeof input !== "string")
    throw new TypeError(`colour must be a string, got ${typeof input}`);
  const value = input.trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const body = hex[1];
    const full =
      body.length === 3
        ? body
            .split("")
            .map((c) => c + c)
            .join("")
        : body;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = value.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i,
  );
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (channels.some((c) => !Number.isFinite(c) || c < 0 || c > 255)) {
      throw new RangeError(`RGB channel out of range in ${input}`);
    }
    const a = rgb[4] === undefined ? 1 : Number(rgb[4]);
    if (!Number.isFinite(a) || a < 0 || a > 1)
      throw new RangeError(`alpha out of range in ${input}`);
    return { r: channels[0], g: channels[1], b: channels[2], a };
  }
  throw new TypeError(`unsupported colour: ${input}`);
}

/** Composite a possibly translucent colour over an opaque background. */
export function compositeOver(fg, bg) {
  const alpha = fg.a;
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1,
  };
}

/** WCAG relative luminance for an opaque or translucent colour over a background. */
export function relativeLuminance(color, background = ANNOTATION_BACKGROUND) {
  const bg = typeof background === "string" ? parseColor(background) : background;
  const fg = typeof color === "string" ? parseColor(color) : color;
  const solid = fg.a < 1 ? compositeOver(fg, bg) : fg;
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(solid.r) + 0.7152 * channel(solid.g) + 0.0722 * channel(solid.b);
}

/**
 * WCAG contrast ratio between a foreground and an opaque background.
 * Accepts hex/rgb strings or parsed colours.
 */
export function contrastRatio(foreground, background = ANNOTATION_BACKGROUND) {
  const fg = typeof foreground === "string" ? parseColor(foreground) : foreground;
  const bg = typeof background === "string" ? parseColor(background) : background;
  const fgLum = relativeLuminance(fg, background);
  const bgLum = relativeLuminance(bg, background);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Stroke width as a share of canvas height. */
export function strokeShare(strokePx, canvasHeightPx = 1920) {
  if (!Number.isFinite(strokePx) || strokePx <= 0)
    throw new RangeError(`strokePx must be > 0, got ${strokePx}`);
  if (!Number.isFinite(canvasHeightPx) || canvasHeightPx <= 0) {
    throw new RangeError(`canvasHeightPx must be > 0, got ${canvasHeightPx}`);
  }
  return strokePx / canvasHeightPx;
}

/**
 * Evaluate one underline style against both floors.
 *
 * @param {{ color: string, strokePx: number, canvasHeightPx?: number, background?: string }} input
 * @returns {{
 *   contrastRatio: number,
 *   strokeShare: number,
 *   minStrokePx: number,
 *   passContrast: boolean,
 *   passStroke: boolean,
 *   verdict: "pass" | "contrast" | "stroke" | "contrast+stroke",
 * }}
 */
export function evaluateUnderline({
  color,
  strokePx,
  canvasHeightPx = 1920,
  background = ANNOTATION_BACKGROUND,
}) {
  const ratio = contrastRatio(color, background);
  const share = strokeShare(strokePx, canvasHeightPx);
  const minStrokePx = ANNOTATION_LEGIBILITY.minStrokeShare * canvasHeightPx;
  const passContrast = ratio >= ANNOTATION_LEGIBILITY.minContrast;
  const passStroke = share >= ANNOTATION_LEGIBILITY.minStrokeShare;
  const failures = [];
  if (!passContrast) failures.push("contrast");
  if (!passStroke) failures.push("stroke");
  return {
    contrastRatio: Number(ratio.toFixed(3)),
    strokeShare: Number(share.toFixed(5)),
    minStrokePx: Number(minStrokePx.toFixed(2)),
    passContrast,
    passStroke,
    verdict: failures.length ? failures.join("+") : "pass",
  };
}
