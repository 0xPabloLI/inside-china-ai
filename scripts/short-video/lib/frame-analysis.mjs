/**
 * Frame Analysis — pure functions for pixel-based layout verification.
 *
 * Used by verify-remotion-frames.mjs to check rendered frames for:
 *   - Safe zone compliance (content not in TikTok UI / subtitle zones)
 *   - Content presence (frame is not empty)
 *   - Render integrity (frame is not all-black)
 *
 * All functions are pure: input → output, no IO, no side effects.
 * This makes them trivially testable with synthetic PixelBuffers.
 *
 * @module frame-analysis
 */

import { MEDIA_BAND, SUBTITLE_LANE_TOP } from "./safe-zones.mjs";

// ─── Constants ───

/**
 * Luminance threshold for "bright" (content) pixels.
 * Background #0a0a14 → luminance ≈ 10.
 * GridBg/Glow/Scanlines → luminance < 60.
 * Text/brand elements → luminance > 100.
 * 80 splits the difference: ignores background layers, catches content.
 */
export const BRIGHT_THRESHOLD = 80;

/**
 * Ratio of bright pixels in a safe-zone band that triggers a FAIL.
 * 5% = a few scattered bright pixels are tolerated (anti-aliasing edges,
 * subtle gradients), but a block of text/content is flagged.
 */
export const BRIGHT_RATIO_FAIL = 0.05;

/**
 * Pixel sampling step (px). Every Nth pixel is sampled in both x and y.
 * 1080×1920 → ~32K samples per frame (fast, representative).
 */
export const SAMPLE_STEP = 8;

/**
 * Luminance below this = "black" pixel. Used for all-black frame detection.
 * Background #0a0a14 (luminance ≈ 13) is NOT black.
 */
export const BLACK_THRESHOLD = 5;

/** Bright-pixel ratio below which the LAST frame counts as empty background. */
const FINAL_FRAME_BRIGHT_RATIO_FAIL = 0.01;

/**
 * Row-variance threshold separating flat background from picture.
 *
 * Row variance is the right signal, not mean luminance. A dark night shot has
 * a picture whose pixels sit near the background's brightness but are textured
 * (measured: 17-30 std), so a luminance-delta probe calls it background. The
 * canvas background is a smooth gradient, so its rows are flat (measured 2.6
 * std on real renders), while picture rows run 17-46.
 *
 * Measured on the real 2026-10-25 render, top of the media band:
 *   letterboxed (the defect)  2.6
 *   night picture            24.9
 *   daylight picture         44.7
 * 6 sits in the gap.
 *
 * A text row also has high variance, which is exactly why this probe reads the
 * TOP of the band — media-bottom-bar keeps its copy in the lower half.
 */
const PICTURE_ROW_VARIANCE = 6;

/**
 * Depth of the strip probed at the top of a media band.
 *
 * Must sit entirely inside the letterbox that `contain` produces, or the probe
 * averages picture rows in with the background and reads a false pass. For the
 * narrowest common case — a 16:9 source in the 1150px band — the letterbox is
 * 263px tall, so the flat strip above the picture is 51px (y 220-270). 40 stays
 * inside it. Measured with 56 instead, three of the six narrative scenes read
 * 10.8-19.8% non-background and wrongly passed.
 */
const MEDIA_BAND_PROBE_DEPTH = 40;

/**
 * Fraction of the probed rows that must carry picture.
 *
 * A cover-fitted band has every probed row textured; a letterboxed one has
 * none. 0.5 tolerates a scene whose very first rows are genuinely flat.
 */
const MEDIA_BAND_FILL_MIN_ROWS = 0.5;

// ─── Types (JSDoc) ───

/**
 * @typedef {Object} PixelBuffer
 * @property {Uint8Array} data - RGBA pixel data (4 bytes per pixel)
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} Region
 * @property {number} xStart
 * @property {number} xEnd
 * @property {number} yStart
 * @property {number} yEnd
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {"pass"|"warn"|"fail"} level
 * @property {string} check
 * @property {string} detail
 * @property {Record<string, number>} [metrics]
 */

// ─── Core pixel utilities ───

/**
 * Calculate luminance (BT.601 weighted).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number} 0-255
 */
export function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Read a single pixel from a PixelBuffer.
 * @param {PixelBuffer} buf
 * @param {number} x
 * @param {number} y
 * @returns {{r: number, g: number, b: number, a: number}}
 */
export function getPixel(buf, x, y) {
  const idx = (buf.width * y + x) * 4;
  return {
    r: buf.data[idx],
    g: buf.data[idx + 1],
    b: buf.data[idx + 2],
    a: buf.data[idx + 3],
  };
}

/**
 * Sample pixels in a region at the given step interval.
 * @param {PixelBuffer} buf
 * @param {Region} region
 * @param {number} step - Sample every N pixels
 * @returns {Array<{x: number, y: number, r: number, g: number, b: number, a: number}>}
 */
export function sampleRegion(buf, region, step) {
  const samples = [];
  for (let y = region.yStart; y < region.yEnd && y < buf.height; y += step) {
    for (let x = region.xStart; x < region.xEnd && x < buf.width; x += step) {
      samples.push({ x, y, ...getPixel(buf, x, y) });
    }
  }
  return samples;
}

/**
 * Count bright pixels in a region.
 * @param {PixelBuffer} buf
 * @param {Region} region
 * @param {number} threshold - Luminance above this = "bright"
 * @param {number} step - Sampling step
 * @returns {{bright: number, total: number, ratio: number}}
 */
/**
 * Check if (x, y) falls inside any of the exempt regions.
 * @param {number} x
 * @param {number} y
 * @param {Region[]} exemptRegions
 * @returns {boolean}
 */
function isExempt(x, y, exemptRegions) {
  for (const r of exemptRegions) {
    if (x >= r.xStart && x < r.xEnd && y >= r.yStart && y < r.yEnd) return true;
  }
  return false;
}

/**
 * Count bright pixels in a region, optionally excluding exempt sub-regions.
 * @param {PixelBuffer} buf
 * @param {Region} region
 * @param {number} threshold - Luminance above this = "bright"
 * @param {number} step - Sampling step
 * @param {Region[]} [exemptRegions=[]] - Sub-regions to skip (e.g. brand bar)
 * @returns {{bright: number, total: number, ratio: number}}
 */
export function countBrightPixels(buf, region, threshold, step, exemptRegions = []) {
  let bright = 0;
  let total = 0;
  for (let y = region.yStart; y < region.yEnd && y < buf.height; y += step) {
    for (let x = region.xStart; x < region.xEnd && x < buf.width; x += step) {
      if (isExempt(x, y, exemptRegions)) continue;
      const idx = (buf.width * y + x) * 4;
      const lum = luminance(buf.data[idx], buf.data[idx + 1], buf.data[idx + 2]);
      if (lum > threshold) bright++;
      total++;
    }
  }
  return { bright, total, ratio: total > 0 ? bright / total : 0 };
}

// ─── Check functions ───

/**
 * Check that the top safe zone (y < SAFE_ZONES.top) is clear of content.
 * TikTok top UI (tabs/search) occupies this band.
 *
 * @param {PixelBuffer} buf
 * @param {{top: number}} safeZones
 * @returns {AnalysisResult}
 */
/**
 * Brand bar exempt region — matches BrandBar component in visuals.tsx:
 *   top: 140, left: 60, right: 200 (→ xEnd = width - 200)
 *   Approximate height: 50px (logo 48px + padding)
 * This is the same exemption the retired verify-scene-dom.mjs DOM gate used
 * (EXEMPT_SELECTORS — archive removed 2026-09-20, see git history).
 */
const BRAND_BAR_REGION = {
  xStart: 60,
  xEnd: 880, // width - SAFE_ZONES.right
  yStart: 130,
  yEnd: 200, // top + ~60px for logo + text + badge
};

/**
 * Watermark exempt region — top-left corner.
 * Matches Watermark component: top: 60, left: 60, 55×55px.
 */
const WATERMARK_REGION = {
  xStart: 55,
  xEnd: 125,
  yStart: 55,
  yEnd: 125,
};

/**
 * Frame glow exempt regions — decorative border + inset shadow on every frame edge.
 * 3px border + 40px inset boxShadow. The visible glow extends ~15px inward.
 * Exempt the outer 15px on all sides to avoid false positives from the border.
 */
function frameGlowExemptRegions(width, height) {
  const GLOW_BAND = 15;
  return [
    { xStart: 0, xEnd: width, yStart: 0, yEnd: GLOW_BAND }, // top
    { xStart: 0, xEnd: width, yStart: height - GLOW_BAND, yEnd: height }, // bottom
    { xStart: 0, xEnd: GLOW_BAND, yStart: 0, yEnd: height }, // left
    { xStart: width - GLOW_BAND, xEnd: width, yStart: 0, yEnd: height }, // right
  ];
}

export function checkSafeZoneTop(buf, safeZones) {
  const region = {
    xStart: 0,
    xEnd: buf.width,
    yStart: 0,
    yEnd: safeZones.top,
  };
  const exempt = [
    BRAND_BAR_REGION,
    WATERMARK_REGION,
    ...frameGlowExemptRegions(buf.width, buf.height),
  ];
  const { bright, total, ratio } = countBrightPixels(
    buf,
    region,
    BRIGHT_THRESHOLD,
    SAMPLE_STEP,
    exempt,
  );
  if (ratio > BRIGHT_RATIO_FAIL) {
    return {
      level: "warn",
      check: "Top safe zone clear",
      detail: `${bright}/${total} bright pixels (${(ratio * 100).toFixed(1)}%) in top band (y < ${safeZones.top}) — may include exempt design elements`,
      metrics: { bright, total, brightRatio: ratio },
    };
  }
  return {
    level: "pass",
    check: "Top safe zone clear",
    detail: `${bright}/${total} bright pixels (${(ratio * 100).toFixed(1)}%)`,
    metrics: { bright, total, brightRatio: ratio },
  };
}

/**
 * Check that the right safe zone (x > width - SAFE_ZONES.right) within the
 * action rail's vertical extent (y 640-1775) is clear of content.
 * The TikTok action rail (avatar/like/comment/share/music) occludes this area.
 *
 * @param {PixelBuffer} buf
 * @param {{right: number}} safeZones
 * @returns {AnalysisResult}
 */
export function checkSafeZoneRight(buf, safeZones) {
  const xStart = buf.width - safeZones.right;
  const region = {
    xStart,
    xEnd: buf.width,
    yStart: 640,
    yEnd: 1775,
  };
  const { bright, total, ratio } = countBrightPixels(buf, region, BRIGHT_THRESHOLD, SAMPLE_STEP);
  if (ratio > BRIGHT_RATIO_FAIL) {
    return {
      level: "fail",
      check: "Right safe zone clear (action rail)",
      detail: `${bright}/${total} bright pixels (${(ratio * 100).toFixed(1)}%) in right rail (x > ${xStart}, y 640-1775)`,
      metrics: { bright, total, brightRatio: ratio },
    };
  }
  return {
    level: "pass",
    check: "Right safe zone clear (action rail)",
    detail: `${bright}/${total} bright pixels (${(ratio * 100).toFixed(1)}%)`,
    metrics: { bright, total, brightRatio: ratio },
  };
}

/**
 * Check that the gap between the content area and the subtitle lane is clear.
 * Content ends at y=1150; subtitles start at SUBTITLE_LANE_TOP.
 *
 * The lane top is read from the constant rather than hardcoded, so moving the
 * lane (as on 2026-10-24, 1188 -> 1258) widens this check instead of leaving
 * it watching a band the subtitles no longer occupy.
 *
 * @param {PixelBuffer} buf
 * @param {{bottom: number}} safeZones
 * @returns {AnalysisResult}
 */
export function checkSafeZoneBottom(buf, safeZones) {
  // Content bottom edge = height - safeZones.bottom = 1920 - 770 = 1150
  const contentBottom = buf.height - safeZones.bottom;
  const subtitleLaneTop = SUBTITLE_LANE_TOP;
  const region = {
    xStart: 0,
    xEnd: buf.width,
    yStart: contentBottom,
    yEnd: subtitleLaneTop,
  };
  const { bright, total, ratio } = countBrightPixels(buf, region, BRIGHT_THRESHOLD, SAMPLE_STEP);
  if (ratio > BRIGHT_RATIO_FAIL) {
    return {
      level: "fail",
      check: "Bottom safe zone clear (subtitle gap)",
      detail: `${bright}/${total} bright pixels (${(ratio * 100).toFixed(1)}%) in gap (y ${contentBottom}-${subtitleLaneTop})`,
      metrics: { bright, total, brightRatio: ratio },
    };
  }
  return {
    level: "pass",
    check: "Bottom safe zone clear (subtitle gap)",
    detail: `${bright}/${total} bright pixels (${(ratio * 100).toFixed(1)}%)`,
    metrics: { bright, total, brightRatio: ratio },
  };
}

/**
 * Check that the content area has visible content (not all background).
 * Warns if the content area appears empty — may indicate a rendering issue.
 *
 * @param {PixelBuffer} buf
 * @param {{left: number, right: number, top: number, bottom: number}} safeZones
 * @returns {AnalysisResult}
 */
export function checkContentPresence(buf, safeZones) {
  const region = {
    xStart: safeZones.left,
    xEnd: buf.width - safeZones.right,
    yStart: safeZones.top,
    yEnd: buf.height - safeZones.bottom,
  };
  const { bright, total, ratio } = countBrightPixels(buf, region, BRIGHT_THRESHOLD, SAMPLE_STEP);
  if (ratio < 0.01) {
    return {
      level: "warn",
      check: "Content area has content",
      detail: `Only ${bright}/${total} bright pixels (${(ratio * 100).toFixed(1)}%) in content area — may be empty`,
      metrics: { bright, total, brightRatio: ratio },
    };
  }
  return {
    level: "pass",
    check: "Content area has content",
    detail: `${bright}/${total} bright pixels (${(ratio * 100).toFixed(1)}%)`,
    metrics: { bright, total, brightRatio: ratio },
  };
}

/**
 * Check that a full-bleed scene's picture actually starts at the top of its
 * declared media band.
 *
 * Why this exists: every other check in this file judges the RESULT of a
 * layout (is anything in the rail? is the gap clean?). None of them notices
 * when the picture is smaller than the box it was given, because a letterboxed
 * frame is perfectly safe — it just leaves a third of the frame empty.
 *
 * That is exactly what shipped on 2026-10-25: every scene declared
 * `fit: "cover"`, and @remotion/media's `<Video>` silently ignored the style
 * form of `objectFit` and rendered `contain`. A 16:9 source sat at canvas
 * y 263-887 inside the 1150px media band — 263px of dead space above AND below
 * the picture, in every narrative scene — and passed every gate, because a
 * frame with a 263px letterbox above the picture is still "safe".
 *
 * WHY IT PROBES THE TOP AND NOT THE BOTTOM: the bottom of a media-bottom-bar
 * band carries the scene's own text rows, and a text row looks like picture to
 * any pixel statistic — measured on the real render, a row of white type has
 * per-row variance 63-93 (picture: 17-46) while covering only 18-26% of the
 * width with non-background pixels (picture: 48-86%). Probing the bottom
 * therefore reported "picture reaches y=1100" and missed the real 263px
 * letterbox entirely. The top of the band carries no text, so the strip there
 * is unambiguous: with `contain` it is flat background, with `cover` it is
 * picture.
 *
 * The check is a WARN, not a FAIL. A source can legitimately start dark, and a
 * scene may deliberately declare `fit: "contain"`. The point is to name the
 * condition loudly enough that a human looks at it.
 *
 * FIT-AWARE (#952): the probe measures the frame against the scene's DECLARED
 * `fit`, in both directions. Under `fit: "cover"` a flat band top is the
 * letterbox defect. Under `fit: "contain"` a flat band top is the intent, so
 * that passes — but a band top that DOES carry picture is worth a human look.
 * Trusting the declaration (returning pass without sampling) would make the
 * check vacuous exactly where it claims to be strict, and hard-coding `cover`
 * would turn every deliberate contain into a false positive the moment a
 * layout starts using it (e.g. the 16:9 viewport work in #963).
 *
 * The contain branch cannot tell the two causes apart, because both put
 * picture at the band top: the runtime rendered `cover` despite the
 * declaration, or the letterboxed picture is simply top-aligned by
 * `focus: "top"` / a small `cropFocus.y`. Its detail names both and asks the
 * reader to check which — a claim about a cause the probe did not observe
 * would be worse than the warning itself.
 *
 * @param {PixelBuffer} buf
 * @param {{top: number, right: number, bottom: number, left: number}} safeZones
 * @param {number} bandBottom - canvas y the picture is expected to reach
 * @param {{fit?: "cover" | "contain"}} [options] - the scene's effective fit
 *   (`media.fit ?? "cover"`).
 * @returns {AnalysisResult}
 */
export function checkMediaBandFill(buf, safeZones, bandBottom = MEDIA_BAND.bottom, options = {}) {
  const { fit = "cover" } = options;
  const bandTop = safeZones.top;
  const xStart = safeZones.left;
  const xEnd = buf.width - safeZones.right;
  const probeDepth = Math.min(MEDIA_BAND_PROBE_DEPTH, Math.max(0, bandBottom - bandTop));

  if (probeDepth < SAMPLE_STEP * 2) {
    return {
      level: "pass",
      check: "Media band is filled",
      detail: "media band is too short to probe",
      // ratio: null — not measured, so it cannot be mistaken for a measurement.
      metrics: { bandTop, bandBottom, probeDepth, fit, ratio: null },
    };
  }

  let pictureRows = 0;
  let totalRows = 0;
  const rowVariances = [];
  for (let y = bandTop; y < bandTop + probeDepth; y += SAMPLE_STEP) {
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let x = xStart; x < xEnd; x += SAMPLE_STEP) {
      const idx = (buf.width * y + x) * 4;
      const lum = luminance(buf.data[idx], buf.data[idx + 1], buf.data[idx + 2]);
      sum += lum;
      sumSq += lum * lum;
      n++;
    }
    totalRows++;
    if (n === 0) continue;
    const mean = sum / n;
    const variance = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    rowVariances.push(Math.round(variance));
    if (variance > PICTURE_ROW_VARIANCE) pictureRows++;
  }

  const ratio = totalRows === 0 ? 0 : pictureRows / totalRows;
  const metrics = {
    bandTop,
    bandBottom,
    probeDepth,
    fit,
    pictureRows,
    totalRows,
    ratio,
    rowVariances,
  };

  if (totalRows === 0) {
    return {
      level: "pass",
      check: "Media band is filled",
      detail: "no sampleable rows in the media band (safe zones leave no probe width)",
      metrics,
    };
  }

  if (fit === "contain") {
    // The scene asked to show the whole frame. A flat band top is that
    // intent; picture at the band top means either the runtime ignored the
    // declaration or the letterbox is top-aligned. Both are worth a look, and
    // the probe cannot tell them apart.
    if (ratio >= MEDIA_BAND_FILL_MIN_ROWS) {
      return {
        level: "warn",
        check: "Media band is filled",
        detail:
          `scene declares fit: "contain", but the top ${probeDepth}px of the media band ` +
          `(y ${bandTop}-${bandTop + probeDepth}) carries picture ` +
          `(${pictureRows}/${totalRows} rows, row std ${JSON.stringify(rowVariances)}) — either the runtime ` +
          `filled the band instead of letterboxing (fit not honoured), or the letterbox is top-aligned by ` +
          `focus: "top" / a small cropFocus.y. Check which.`,
        metrics,
      };
    }
    return {
      level: "pass",
      check: "Media band is filled",
      detail:
        `fit: "contain" as declared — the band top is flat background ` +
        `(${pictureRows}/${totalRows} rows carry picture), which is the letterbox the scene asked for`,
      metrics,
    };
  }

  if (ratio < MEDIA_BAND_FILL_MIN_ROWS) {
    return {
      level: "warn",
      check: "Media band is filled",
      detail:
        `the top ${probeDepth}px of the media band (y ${bandTop}-${bandTop + probeDepth}) is flat background ` +
        `(${pictureRows}/${totalRows} rows carry picture, row std ${JSON.stringify(rowVariances)}) — the picture ` +
        `does not reach the band top, so it is letterboxed rather than filling the band. ` +
        `Check the objectFit PROP (not style) on <Video>.`,
      metrics,
    };
  }

  return {
    level: "pass",
    check: "Media band is filled",
    detail: `band top carries picture (${pictureRows}/${totalRows} rows, row std ${JSON.stringify(rowVariances)})`,
    metrics,
  };
}

/**
 * Check that the frame is not entirely black (rendering failure).
 * Background #0a0a14 (luminance ≈ 13) is NOT black.
 *
 * @param {PixelBuffer} buf
 * @returns {AnalysisResult}
 */
export function checkNotAllBlack(buf) {
  // Sample the full frame at a coarser step for speed
  const coarseStep = SAMPLE_STEP * 2;
  let blackCount = 0;
  let total = 0;
  for (let y = 0; y < buf.height; y += coarseStep) {
    for (let x = 0; x < buf.width; x += coarseStep) {
      const idx = (buf.width * y + x) * 4;
      const lum = luminance(buf.data[idx], buf.data[idx + 1], buf.data[idx + 2]);
      if (lum < BLACK_THRESHOLD) blackCount++;
      total++;
    }
  }
  if (blackCount === total) {
    return {
      level: "fail",
      check: "Frame not all black",
      detail: `All ${total} sampled pixels are black (luminance < ${BLACK_THRESHOLD})`,
      metrics: { blackCount, total },
    };
  }
  return {
    level: "pass",
    check: "Frame not all black",
    detail: `${blackCount}/${total} black pixels`,
    metrics: { blackCount, total },
  };
}

/**
 * Check that the LAST frame of the video still shows scene content.
 *
 * The CTA must hold to the final frame. A tail of plain background with
 * subtitles still burning in is a FAIL, not a warn: it means the composition is
 * longer than the rendered content (see timeline option A2 in lib/timeline.mjs).
 *
 * `checkNotAllBlack` cannot catch this — the #0a0a14 background has luminance
 * ≈ 13, well above BLACK_THRESHOLD — and `checkContentPresence` only warns.
 *
 * @param {PixelBuffer} buf
 * @param {{left: number, right: number, top: number, bottom: number}} safeZones
 * @returns {AnalysisResult}
 */
export function checkFinalFrameHasContent(buf, safeZones) {
  const region = {
    xStart: safeZones.left,
    xEnd: buf.width - safeZones.right,
    yStart: safeZones.top,
    yEnd: buf.height - safeZones.bottom,
  };
  const { bright, total, ratio } = countBrightPixels(buf, region, BRIGHT_THRESHOLD, SAMPLE_STEP);

  if (ratio < FINAL_FRAME_BRIGHT_RATIO_FAIL) {
    return {
      level: "fail",
      check: "Last frame has scene content",
      detail:
        `Only ${bright}/${total} bright pixels (${(ratio * 100).toFixed(1)}%) in the content area — ` +
        "the video ends on empty background; the CTA must hold to the last frame",
      metrics: { bright, total, brightRatio: ratio },
    };
  }

  return {
    level: "pass",
    check: "Last frame has scene content",
    detail: `${bright}/${total} bright pixels (${(ratio * 100).toFixed(1)}%)`,
    metrics: { bright, total, brightRatio: ratio },
  };
}

/**
 * Check that bright pixel spans in each content row do not exceed the
 * safe-zone content width. Detects text that overflows its container
 * *within* the safe zone — something the boundary-band checks cannot catch.
 *
 * For each sampled row in the content area (y ∈ [safeZones.top, height - safeZones.bottom]),
 * finds the leftmost and rightmost bright (non-exempt) pixel. If the span
 * (rightmost − leftmost) exceeds the theoretical content width
 * (width − safeZones.left − safeZones.right), reports a warn.
 *
 * @param {PixelBuffer} buf
 * @param {{left: number, right: number, top: number, bottom: number}} safeZones
 * @returns {AnalysisResult}
 */
export function checkTextOverflow(buf, safeZones) {
  const contentLeft = safeZones.left;
  const contentRight = buf.width - safeZones.right;
  const contentWidth = contentRight - contentLeft;
  const yStart = safeZones.top;
  const yEnd = buf.height - safeZones.bottom;

  const exempt = [
    BRAND_BAR_REGION,
    WATERMARK_REGION,
    ...frameGlowExemptRegions(buf.width, buf.height),
  ];

  let maxOverflow = 0;
  let overflowRow = -1;

  for (let y = yStart; y < yEnd && y < buf.height; y += SAMPLE_STEP) {
    let leftmost = -1;
    let rightmost = -1;
    for (let x = 0; x < buf.width; x += SAMPLE_STEP) {
      if (isExempt(x, y, exempt)) continue;
      const idx = (buf.width * y + x) * 4;
      const lum = luminance(buf.data[idx], buf.data[idx + 1], buf.data[idx + 2]);
      if (lum > BRIGHT_THRESHOLD) {
        if (leftmost === -1) leftmost = x;
        rightmost = x;
      }
    }
    if (leftmost !== -1) {
      const span = rightmost - leftmost;
      if (span > contentWidth) {
        const overflow = span - contentWidth;
        if (overflow > maxOverflow) {
          maxOverflow = overflow;
          overflowRow = y;
        }
      }
    }
  }

  if (maxOverflow > 0) {
    return {
      level: "warn",
      check: "Text overflow within safe zone",
      detail: `Bright pixel span exceeds content width (${contentWidth}px) by ${maxOverflow}px at row y=${overflowRow}`,
      metrics: { maxOverflow, overflowRow, contentWidth },
    };
  }

  return {
    level: "pass",
    check: "Text overflow within safe zone",
    detail: `No row exceeds content width (${contentWidth}px)`,
    metrics: { contentWidth },
  };
}

// ─── Clipped text heuristic ───

// Overflow-hidden containers clip oversized text at the content-band edge,
// which is invisible to brightness-based zone checks (clipping REMOVES bright
// pixels from forbidden zones). Observed on qwen4-preview v1: "1/9 THE TRAIN…"
// and "MICRO-BLOC…" cut hard at x=880. This heuristic flags a sustained run of
// rows where bright pixels sit flush against the right boundary with darkness
// immediately beyond it — the signature of text cut mid-glyph. WARN-level:
// right-aligned text can false-positive, so the width budget in scene-rules
// remains the primary prevention.
const CUT_PROBE_STRIP = 20; // px band left of the boundary treated as "at edge"
const CUT_BEYOND_STRIP = 30; // px band right of the boundary that must be dark
const CUT_WINDOW = 15; // sampled rows per sliding window (~120px tall)
// A 52px text line spans only ~6 sampled rows at SAMPLE_STEP=8, so a single
// clipped line yields ~4-6 cut rows (measured on qwen4-preview v1: 5 and 4).
// Measured negatives (street/photo/stat/CTA frames) all have 0.
const CUT_MIN_ROWS_IN_WINDOW = 4;

export function checkClippedText(buf, safeZones) {
  const contentRight = buf.width - safeZones.right;
  const yStart = safeZones.top;
  const yEnd = buf.height - safeZones.bottom;
  const exempt = [
    BRAND_BAR_REGION,
    WATERMARK_REGION,
    ...frameGlowExemptRegions(buf.width, buf.height),
  ];

  const rowIsCut = (y) => {
    let brightAtEdge = false;
    for (let x = contentRight - CUT_PROBE_STRIP; x < contentRight; x += 4) {
      if (x < 0) continue;
      if (isExempt(x, y, exempt)) continue;
      const idx = (buf.width * y + x) * 4;
      if (luminance(buf.data[idx], buf.data[idx + 1], buf.data[idx + 2]) > BRIGHT_THRESHOLD) {
        brightAtEdge = true;
        break;
      }
    }
    if (!brightAtEdge) return false;
    for (let x = contentRight + 4; x < contentRight + CUT_BEYOND_STRIP; x += 4) {
      if (x >= buf.width) continue;
      const idx = (buf.width * y + x) * 4;
      if (luminance(buf.data[idx], buf.data[idx + 1], buf.data[idx + 2]) > BRIGHT_THRESHOLD) {
        return false;
      }
    }
    return true;
  };

  // Sliding window over sampled rows: glyph gaps break per-row runs, so count
  // cut rows within a window instead of requiring strict consecutiveness.
  let bestCount = 0;
  let bestStartY = -1;
  const windowRows = [];
  for (let y = yStart; y < yEnd && y < buf.height; y += SAMPLE_STEP) {
    windowRows.push({ y, cut: rowIsCut(y) });
    if (windowRows.length > CUT_WINDOW) windowRows.shift();
    const cuts = windowRows.filter((r) => r.cut);
    if (cuts.length > bestCount) {
      bestCount = cuts.length;
      bestStartY = windowRows[0].y;
    }
  }

  if (bestCount >= CUT_MIN_ROWS_IN_WINDOW) {
    return {
      level: "warn",
      check: "Possible clipped text at right boundary",
      detail: `${bestCount} rows with bright pixels cut hard at x=${contentRight} within a ${CUT_WINDOW}-row window starting y=${bestStartY}`,
      metrics: { rows: bestCount, startY: bestStartY, contentRight },
    };
  }
  return {
    level: "pass",
    check: "Possible clipped text at right boundary",
    detail: "No hard bright-to-dark cut at the content edge",
  };
}

// ─── Aggregate runner ───

/**
 * Run all frame analysis checks and return results.
 *
 * @param {PixelBuffer} buf
 * @param {{top: number, right: number, bottom: number, left: number}} safeZones
 * @param {{mediaBandBottom?: number|null, mediaBandFit?: "cover"|"contain"}} [options]
 *   - `mediaBandBottom` is the canvas y this scene's full-bleed media is
 *   expected to reach. Pass it for media-bottom-bar scenes, whose band top
 *   carries no text and can be probed unambiguously. Omit or pass null for
 *   scenes with no full-bleed media, and for the hook — its media is
 *   full-frame, so its band top is covered by the brand bar and badge and the
 *   probe cannot tell picture from chrome. `mediaBandFit` is the scene's
 *   effective fit (`media.fit ?? "cover"`); `"contain"` makes the band check
 *   pass by declaration (#952).
 * @returns {AnalysisResult[]}
 */
export function runFrameAnalysis(buf, safeZones, options = {}) {
  const { mediaBandBottom = null, mediaBandFit = "cover" } = options;
  const results = [
    checkNotAllBlack(buf),
    checkSafeZoneTop(buf, safeZones),
    checkSafeZoneRight(buf, safeZones),
    checkSafeZoneBottom(buf, safeZones),
    checkContentPresence(buf, safeZones),
    checkTextOverflow(buf, safeZones),
    checkClippedText(buf, safeZones),
  ];
  if (mediaBandBottom !== null) {
    results.push(checkMediaBandFill(buf, safeZones, mediaBandBottom, { fit: mediaBandFit }));
  }
  return results;
}
