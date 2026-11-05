/**
 * Crop Decision — Deterministic 9:16 cover crop evaluation.
 *
 * Pure functions (no I/O, no side effects) that:
 *   1. sourceFocusToObjectPosition: source-space focus → object-position ratio
 *   2. resolveObjectPosition: format that ratio as a CSS object-position string
 *   3. evaluateCropSafety: does a candidate crop rect contain all protected regions?
 *   4. selectBestCrop: generate candidates, evaluate, select best safe crop
 *   5. saliencyCropHint: Phase 3a VLM crop hint in the same ratio contract
 *
 * ## cropFocus contract (#1040)
 *
 * `cropFocus.{x,y}` is a normalized [0, 1] **CSS object-position ratio**, not
 * a source-space point: 0 = left/top-aligned, 0.5 = centred, 1 = right/bottom.
 * Both consumers read it that way — `MediaBackground.tsx:objectPositionFor`
 * emits `${cropFocus.x * 100}%`, and `vlm_analyzer.py:simulate_crop` computes
 * `left = (w - new_w) * focus_x`. Producers must therefore convert a
 * source-space focus f to p before writing; `sourceFocusToObjectPosition` is
 * the single source of truth for that conversion. 0 / 0.5 / 1 are fixed points
 * of f → p, so the hand-written scene-data declarations needed no migration.
 *
 * The contract is consumed by asset-sourcer.mjs Phase 3b and produces
 * CropDecision objects stored in asset-analysis.json for human review.
 *
 * @module crop-decision
 */

/**
 * The one owner of the 9:16 target ratio in JS. Phase 3a (crop hint) and
 * Phase 3b (crop decision) must use the same value or the VLM would preview
 * a different framing than the one selectBestCrop solves for.
 */
export const TARGET_ASPECT = 9 / 16;

// ─── Types (JSDoc) ───

/**
 * @typedef {Object} Region
 * @property {number[]} rect - Normalized [x, y, w, h] in [0, 1]
 * @property {string} kind - Region kind (e.g., "face")
 */

/**
 * @typedef {Object} Saliency
 * @property {boolean} available
 * @property {number} dispersion - 0 = uniform, 1 = focal point
 * @property {number[]} centroid - [cx, cy] in [0, 1]
 */

/**
 * @typedef {Object} CropCandidate
 * @property {string} anchor - "center" | "saliency" | "protected-N"
 * @property {number[]} cropRect - Normalized [x, y, w, h]
 * @property {boolean} safe
 * @property {Region[]} violatedRegions
 */

/**
 * @typedef {Object} CropDecision
 * @property {"safe"|"unsafe"|"indeterminate"} status
 * @property {"cover"|"contain"} policy
 * @property {{x: number, y: number} | null} cropFocus - Normalized [0,1] CSS
 *   object-position ratio (see module header); null when no safe crop
 * @property {string} reason
 * @property {CropCandidate[]} candidates
 */

// ─── Constants ───

/** Saliency dispersion below this → low information → indeterminate */
const SALIENCY_LOW_THRESHOLD = 0.01;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Phase 3b writes cropFocus at this precision; Phase 3a hints match it (#1040). */
const roundFocus = (v) => Math.round(v * 1000) / 1000;

// ─── sourceFocusToObjectPosition ───

/**
 * Convert a normalized source-space focus point into a CSS object-position
 * ratio — the single source of truth for the cropFocus contract (#1040).
 *
 * object-fit: cover shows 1/r of the source along the cropped axis, where
 * r = sourceAspect / targetAspect. CSS object-position p slides that window:
 * the visible window is [p·(1 − 1/r), p·(1 − 1/r) + 1/r]. Centring a
 * source-space focus f in it gives
 *
 *   f = p·(1 − 1/r) + 1/(2r)  ⇒  p = (f·r − 0.5) / (r − 1)
 *
 * The vertical axis uses the inverted ratio (rV = targetAspect/sourceAspect).
 * An axis that needs no crop (r ≤ 1.001) stays centred at 0.5.
 *
 * @param {number[]} focus - [fx, fy] in normalized [0, 1] source space
 * @param {number} sourceAspect - source width / height
 * @param {number} targetAspect - target width / height
 * @returns {{x: number, y: number}} normalized [0, 1] object-position ratios
 */
export function sourceFocusToObjectPosition(focus, sourceAspect, targetAspect) {
  const [fx, fy] = focus;
  const rH = sourceAspect / targetAspect;
  const rV = targetAspect / sourceAspect;
  const ratioFor = (f, r) => (r > 1.001 ? clamp01((f * r - 0.5) / (r - 1)) : 0.5);
  return { x: ratioFor(fx, rH), y: ratioFor(fy, rV) };
}

// ─── resolveObjectPosition ───

/**
 * Format a source-space focus point as a CSS object-position string.
 * Geometry lives in sourceFocusToObjectPosition(); this is its string form.
 *
 * @param {{sourceAspect: number, targetAspect: number, normalizedFocus: number[]}} opts
 * @returns {string} CSS object-position string like "50% 50%" or "center"
 */
export function resolveObjectPosition({ sourceAspect, targetAspect, normalizedFocus }) {
  const rH = sourceAspect / targetAspect;
  const rV = targetAspect / sourceAspect;
  if (rH <= 1.001 && rV <= 1.001) return "center";

  const pos = sourceFocusToObjectPosition(normalizedFocus, sourceAspect, targetAspect);
  return `${Math.round(pos.x * 100)}% ${Math.round(pos.y * 100)}%`;
}

// ─── evaluateCropSafety ───

/**
 * Test whether a candidate crop rectangle fully contains all protected regions.
 *
 * A protected region [rx, ry, rw, rh] is "contained" in crop rect [cx, cy, cw, ch]
 * if: rx >= cx && ry >= cy && (rx + rw) <= (cx + cw) && (ry + rh) <= (cy + ch)
 *
 * @param {{protectedRegions: Region[], cropRect: number[]}} opts
 * @returns {{safe: boolean, violatedRegions: Region[]}}
 */
export function evaluateCropSafety({ protectedRegions, cropRect }) {
  const [cx, cy, cw, ch] = cropRect;
  const cRight = cx + cw;
  const cBottom = cy + ch;

  const violated = [];

  for (const region of protectedRegions) {
    const [rx, ry, rw, rh] = region.rect;
    const rRight = rx + rw;
    const rBottom = ry + rh;

    // Region must be fully inside crop rect
    const fullyInside =
      rx >= cx &&
      ry >= cy &&
      rRight <= cRight + 1e-9 && // epsilon for float comparison
      rBottom <= cBottom + 1e-9;

    if (!fullyInside) {
      violated.push(region);
    }
  }

  return {
    safe: violated.length === 0,
    violatedRegions: violated,
  };
}

// ─── selectBestCrop ───

/**
 * Generate candidate 9:16 crops, evaluate each, and select the best safe crop.
 *
 * Candidate generation:
 *   1. Center crop (focus at [0.5, 0.5])
 *   2. Saliency-anchored crop (focus at saliency centroid, if available)
 *   3. One per protected region (focus at region center)
 *
 * Selection priority:
 *   - Protected-region-anchored safe crops (in order)
 *   - Saliency-anchored safe crop
 *   - Center crop (if safe)
 *   - If none safe → unsafe, policy = contain
 *   - If no saliency + no protected regions → indeterminate
 *
 * @param {{sourceAspect: number, targetAspect: number, protectedRegions: Region[],
 *   saliency: Saliency, frame: {width: number, height: number}}} opts
 * @returns {CropDecision}
 */
export function selectBestCrop({ sourceAspect, targetAspect, protectedRegions, saliency, frame }) {
  const r = sourceAspect / targetAspect;
  const needHCrop = r > 1.001;

  // Portrait or same-ratio source → no horizontal crop needed → indeterminate
  if (!needHCrop) {
    return {
      status: "indeterminate",
      policy: "cover",
      cropFocus: null,
      reason: "Source aspect ratio does not require horizontal 9:16 crop",
      candidates: [],
    };
  }

  // Visible fraction of source width
  const visibleFraction = 1 / r;

  // Check if we have enough signal to make a decision
  const hasProtected = protectedRegions.length > 0;
  const hasSaliency = saliency?.available && saliency.dispersion >= SALIENCY_LOW_THRESHOLD;

  if (!hasProtected && !hasSaliency) {
    return {
      status: "indeterminate",
      policy: "cover",
      cropFocus: null,
      reason: "No protected regions and saliency unavailable or low information",
      candidates: [],
    };
  }

  // ── Generate candidates ──

  const candidates = [];

  // Helper: compute crop rect from a focus point
  function cropRectFromFocus(focusX) {
    const x = Math.max(0, Math.min(1 - visibleFraction, focusX - visibleFraction / 2));
    return [x, 0, visibleFraction, 1];
  }

  // Helper: evaluate and add a candidate
  function addCandidate(anchor, focusX) {
    const cropRect = cropRectFromFocus(focusX);
    const safety = evaluateCropSafety({ protectedRegions, cropRect });
    candidates.push({
      anchor,
      cropRect,
      safe: safety.safe,
      violatedRegions: safety.violatedRegions,
    });
  }

  // 1. Center crop
  addCandidate("center", 0.5);

  // 2. Saliency-anchored crop
  if (hasSaliency) {
    addCandidate("saliency", saliency.centroid[0]);
  }

  // 3. Protected-region-anchored crops
  for (let i = 0; i < protectedRegions.length; i++) {
    const region = protectedRegions[i];
    const [rx, ry, rw] = region.rect;
    // Focus at the center of the protected region
    addCandidate(`protected-${i}`, rx + rw / 2);
  }

  // ── Select best safe candidate ──
  // Priority: protected-region anchors first, then saliency, then center
  const priorityOrder = ["protected", "saliency", "center"];

  let selected = null;
  for (const prefix of priorityOrder) {
    const matches = candidates.filter((c) => c.anchor.startsWith(prefix) && c.safe);
    if (matches.length > 0) {
      selected = matches[0];
      break;
    }
  }

  if (selected) {
    // The crop rect lives in source space; cropFocus is a CSS object-position
    // ratio (#1040). Convert through the same seam the renderer's string form
    // uses, so the decision, the VLM crop simulation and the render agree.
    const [cx] = selected.cropRect;
    const sourceFocusX = cx + visibleFraction / 2;
    const { x: posX } = sourceFocusToObjectPosition(
      [sourceFocusX, 0.5],
      sourceAspect,
      targetAspect,
    );
    const anchorLabel = selected.anchor;

    return {
      status: "safe",
      policy: "cover",
      cropFocus: { x: roundFocus(posX), y: 0.5 },
      reason: `Safe crop at ${anchorLabel} anchor (source focus [${sourceFocusX.toFixed(3)}, 0.5] → object-position ${posX.toFixed(3)})`,
      candidates,
    };
  }

  // No safe candidate found
  return {
    status: "unsafe",
    policy: "contain",
    cropFocus: null,
    reason: `No safe 9:16 cover crop found — ${candidates.length} candidates evaluated, all violated protected regions`,
    candidates,
  };
}

// ─── saliencyCropHint ───

/**
 * Derive a crop-focus hint from Phase 2 focus analysis for the VLM's crop
 * simulation (#198 Item 3).
 *
 * Uses the SAME saliency threshold as selectBestCrop: when the saliency map
 * would anchor the Phase 3b crop, the VLM must judge fit/criticalEdgeText on
 * that same saliency-anchored view, not a center crop.
 *
 * #1040: `simulate_crop` consumes the hint as an object-position ratio while
 * `saliency.centroid` is a source-space point. The conversion needs the source
 * geometry — without a usable `frame` this returns null (centre crop) rather
 * than pass a coordinate whose semantics are known to be wrong. The hint is
 * rounded to the same 3 decimals Phase 3b writes, so both paths agree.
 *
 * @param {{frame?: {width: number, height: number} | null, saliency?: {available: boolean, dispersion: number, centroid: number[]} | null} | null} focusAnalysis
 * @returns {{x: number, y: number} | null}
 */
export function saliencyCropHint(focusAnalysis) {
  const sal = focusAnalysis?.saliency;
  if (!(
    sal?.available &&
    sal.dispersion >= SALIENCY_LOW_THRESHOLD &&
    Array.isArray(sal.centroid) &&
    sal.centroid.length === 2 &&
    sal.centroid.every((v) => typeof v === "number" && Number.isFinite(v))
  )) {
    return null;
  }

  const { width, height } = focusAnalysis?.frame ?? {};
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  const pos = sourceFocusToObjectPosition(
    [clamp01(sal.centroid[0]), clamp01(sal.centroid[1])],
    width / height,
    TARGET_ASPECT,
  );
  return { x: roundFocus(pos.x), y: roundFocus(pos.y) };
}
