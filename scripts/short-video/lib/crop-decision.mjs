/**
 * Crop Decision — Deterministic 9:16 cover crop evaluation.
 *
 * Pure functions (no I/O, no side effects) that:
 *   1. resolveObjectPosition: normalized source-space focus → CSS object-position
 *   2. evaluateCropSafety: does a candidate crop rect contain all protected regions?
 *   3. selectBestCrop: generate candidates, evaluate, select best safe crop
 *
 * The contract is consumed by asset-sourcer.mjs Phase 3b and produces
 * CropDecision objects stored in asset-analysis.json for human review.
 *
 * @module crop-decision
 */

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
 * @property {{x: number, y: number} | null} cropFocus - Normalized [0,1]
 * @property {string} reason
 * @property {CropCandidate[]} candidates
 */

// ─── Constants ───

/** Saliency dispersion below this → low information → indeterminate */
const SALIENCY_LOW_THRESHOLD = 0.01;

// ─── resolveObjectPosition ───

/**
 * Convert a normalized source-space focus point into a CSS object-position string.
 *
 * When the source is wider than the target (r = sourceAspect / targetAspect > 1),
 * the visible fraction is 1/r of the source width. The CSS position p that keeps
 * a source-space focus point f visible is:
 *
 *   p = (f * r - 0.5 * (r - 1)) / (r - 1)  =  (f * r - 0.5) / (r - 1) + 0.5
 *
 * Simplified: p = (f * r) / (r - 1) - 0.5 / (r - 1) = (f * r - 0.5) / (r - 1)
 *
 * Wait, let me re-derive properly.
 *
 * CSS object-position p (0 = left, 0.5 = center, 1 = right) maps to source coordinate:
 * The source window visible is [p - 0.5/r, p + 0.5/r] mapped through the cover scale.
 * Actually, the correct derivation:
 *
 * When object-fit: cover scales source (S_w × S_h) into target (T_w × T_h):
 * - If source is wider: scale = T_h / S_h, visible source width = T_w / scale = T_w * S_h / T_h
 * - Visible fraction of source width = (T_w * S_h) / (T_h * S_w) = targetAspect / sourceAspect = 1/r
 *
 * The visible window in source space is centered at position p:
 *   window = [p - 1/(2r), p + 1/(2r)]  (in [0, 1] source space)
 *
 * To keep focus point f visible, we need:
 *   p - 1/(2r) ≤ f ≤ p + 1/(2r)
 *
 * To CENTER f in the visible window:
 *   p = f  →  but p must be in [1/(2r), 1 - 1/(2r)]
 *
 * Wait, that's too simple. Actually, when f is at the center of the window:
 *   f = p, so p = f. But p is constrained to [1/(2r), 1 - 1/(2r)].
 *   If f < 1/(2r) → p = 1/(2r) (clamped left)
 *   If f > 1 - 1/(2r) → p = 1 - 1/(2r) (clamped right)
 *
 * Hmm, but that means object-position percentage = p * 100, and the visible window
 * is centered on p. Let me verify:
 *
 * With object-position: 30%, the leftmost 30% of the source is pushed out of view
 * (when source is wider than target). So the visible window starts at 30% and extends
 * 1/r to the right. That means visible = [p, p + 1/r]? No...
 *
 * Actually, CSS object-position works differently. When p = 0%, the left edge of
 * the source aligns with the left edge of the container (showing the leftmost part).
 * When p = 100%, the right edge aligns (showing the rightmost part).
 * When p = 50%, center aligns.
 *
 * The visible source region is:
 *   [p * (1 - 1/r), p * (1 - 1/r) + 1/r]
 *
 * To keep focus f at the CENTER of the visible window:
 *   f = p * (1 - 1/r) + 1/(2r)
 *   p = (f - 1/(2r)) / (1 - 1/r)
 *
 * This is the correct formula. Let me verify:
 *   f = 0.5 (center) → p = (0.5 - 1/(2r)) / (1 - 1/r) = (0.5 - 1/(2r)) / ((r-1)/r)
 *   With r = 3.16: p = (0.5 - 0.158) / (2.16/3.16) = 0.342 / 0.684 = 0.5 ✓
 *
 *   f = 0.25 (left of center): p = (0.25 - 0.158) / 0.684 = 0.092 / 0.684 = 0.134 ✓
 *   f = 0.0 (far left): p = (0 - 0.158) / 0.684 = -0.231 → clamp to 0 ✓
 *   f = 1.0 (far right): p = (1 - 0.158) / 0.684 = 1.231 → clamp to 1 ✓
 *
 * @param {{sourceAspect: number, targetAspect: number, normalizedFocus: number[]}} opts
 * @returns {string} CSS object-position string like "50% 50%" or "center"
 */
export function resolveObjectPosition({ sourceAspect, targetAspect, normalizedFocus }) {
  const [fx, fy] = normalizedFocus;

  // Horizontal: source wider than target?
  const rH = sourceAspect / targetAspect;
  const needHCrop = rH > 1.001;

  // Vertical: source taller than target?
  // sourceAspect < targetAspect means source is narrower (taller per unit width)
  const rV = targetAspect / sourceAspect;
  const needVCrop = rV > 1.001;

  if (!needHCrop && !needVCrop) {
    return "center";
  }

  let xPct = 50;
  let yPct = 50;

  if (needHCrop) {
    // p = (f - 1/(2r)) / (1 - 1/r)  =  (f * r - 0.5) / (r - 1)
    const p = (fx * rH - 0.5) / (rH - 1);
    xPct = Math.round(Math.max(0, Math.min(1, p)) * 100);
  }

  if (needVCrop) {
    // Same formula for vertical axis
    const p = (fy * rV - 0.5) / (rV - 1);
    yPct = Math.round(Math.max(0, Math.min(1, p)) * 100);
  }

  return `${xPct}% ${yPct}%`;
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
    // Compute cropFocus from the selected crop rect
    // cropFocus is the center of the crop rect in source space
    const [cx] = selected.cropRect;
    const focusX = cx + visibleFraction / 2;
    const anchorLabel = selected.anchor;

    return {
      status: "safe",
      policy: "cover",
      cropFocus: { x: Math.round(focusX * 1000) / 1000, y: 0.5 },
      reason: `Safe crop at ${anchorLabel} anchor (focus [${focusX.toFixed(3)}, 0.5])`,
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
