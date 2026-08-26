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
 * This is the same exemption as EXEMPT_SELECTORS in verify-scene-dom.mjs.
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
 * Check that the gap between content area and subtitle lane (y 1150-1188)
 * is clear. Content should end at y=1150; subtitles start at y≈1188.
 *
 * @param {PixelBuffer} buf
 * @param {{bottom: number}} safeZones
 * @returns {AnalysisResult}
 */
export function checkSafeZoneBottom(buf, safeZones) {
  // Content bottom edge = height - safeZones.bottom = 1920 - 770 = 1150
  // Subtitle lane top ≈ 1188 (SUBTITLE_LANE_TOP)
  // Check the narrow gap: y ∈ [1150, 1188]
  const contentBottom = buf.height - safeZones.bottom;
  const subtitleLaneTop = 1188; // matches SUBTITLE_LANE_TOP calculation
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

// ─── Aggregate runner ───

/**
 * Run all frame analysis checks and return results.
 * @param {PixelBuffer} buf
 * @param {{top: number, right: number, bottom: number, left: number}} safeZones
 * @returns {AnalysisResult[]}
 */
export function runFrameAnalysis(buf, safeZones) {
  return [
    checkNotAllBlack(buf),
    checkSafeZoneTop(buf, safeZones),
    checkSafeZoneRight(buf, safeZones),
    checkSafeZoneBottom(buf, safeZones),
    checkContentPresence(buf, safeZones),
    checkTextOverflow(buf, safeZones),
  ];
}
