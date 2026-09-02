/**
 * Pure text-geometry layer for the Fit/Assert gate (T4).
 *
 * Browser-independent maths over measurement inputs: ink overhang formulas,
 * annotation coordinate transforms and box containment. The DOM-facing
 * behaviour (fonts.ready timing, annotation mount, scroll/client metrics)
 * lives in the render layer (remotion/src/components/text-gate.tsx), which
 * consumes these functions (spec decision 13 of Further Notes, refinement
 * decisions 19–33).
 *
 * Spec: spec-text-overflow-hardening.md § T4 Implementation Refinement.
 */

/**
 * Shared sub-pixel tolerance. Layout metrics (getBBox, measureText, scale
 * division) all carry float noise in the 0.1–0.3px range; 0.5px absorbs it
 * while real clipping removes whole glyphs (>10px). Locked by unit test.
 */
export const EPS = 0.5;

/**
 * Machine-readable failure reasons shared by BOTH gate consumers — the
 * Remotion runtime (TextGate) and the HTML path (T6) must never drift on
 * spelling. Extend here when a new failure class appears.
 */
export const FIT_REASONS = {
  fitBottom: "fit-bottom",
  fontTimeout: "font-timeout",
  safeZoneBreach: "safe-zone-breach",
  annotationOutOfSlot: "annotation-out-of-slot",
  annotationMissing: "annotation-missing",
  annotationCollision: "annotation-collision",
  textOutOfSlot: "text-out-of-slot",
  containerOverflow: "container-overflow",
  groupOverflow: "group-overflow",
};

/**
 * Per-annotation-type drawn overdraw tolerance for the container assert
 * (decision 70: per-type, measured under ONE unified口径 — the settled
 * assert's own drawn-box measurement, not ad-hoc frame grabs).
 *
 * Basis (annotation-overdraw-probe, text-gate-fixture, 2026-09-02):
 *   - circle (rough-notation Circle, box="around", contract 240px): the
 *     ellipse pokes 61.9px above / 59.4px below the host box → 96 gives
 *     headroom for roughness random offsets and the legacy 91px claim that
 *     motivated the decision (a different, now-retired measurement口径).
 *   - default (underline / highlight): underline understroke measured 10.3px;
 *     highlight pad is 6px by config → 16.
 * Hook's bigNumber circle now draws box="inside" (~5px) — the circle entry is
 * sized by the DataScene stat circle, the widest remaining around-family user.
 * A genuinely oversized annotation still trips Fit (text ⊆ slot) or
 * container-overflow (gate box ⊆ container); only the ink bleed past the band
 * edge is tolerated here.
 */
export const ANNOTATION_OVERDRAW_BY_TYPE = {
  circle: 96,
  default: 16,
};

/**
 * Drawn-bound tolerance for one slot's annotation policy (decision 70):
 * the policy names the annotation family, the map carries the measured
 * bleed per family, unknown policies fall back to the conservative
 * `default`. Single source — TextGate's container assert and the unit
 * tests both read this function, so the fallback can never drift.
 * @param {string} policy - annotation policy of the slot (e.g. "circle",
 *   "underline", "highlight", "none")
 * @returns {number} tolerated drawn overdraw past the container box, px
 */
export function annotationOverdrawOf(policy) {
  return ANNOTATION_OVERDRAW_BY_TYPE[policy] ?? ANNOTATION_OVERDRAW_BY_TYPE.default;
}

/**
 * Machine-readable fit/assert failure.
 *
 * Remotion's cancelRender() surfaces only the message's FIRST LINE to the
 * renderStill caller (renderer reads getErrorStackWithMessage), so the JSON
 * payload lives there; the HTML path (T6) throws this class directly. Both
 * paths must output this exact structure (spec decision 10, refinement 28).
 */
export class TextFitError extends Error {
  /**
   * @param {{
   *   reason?: string,
   *   sceneId: string,
   *   slotId: string,
   *   field: string,
   *   measured: {width: number, height: number|null},
   *   available: {width: number, height: number|null},
   *   fontSize: number,
   *   inkPad: {left: number, right: number, top: number, bottom: number},
   *   steps?: {slotId: string, fontSize: number}[],
   *   details?: Record<string, unknown>,
   * }} payload
   */
  constructor(payload) {
    super(`[TextFitError] ${JSON.stringify(payload)}`);
    this.name = "TextFitError";
    this.reason = payload.reason ?? null;
    this.sceneId = payload.sceneId;
    this.slotId = payload.slotId;
    this.field = payload.field;
    this.measured = payload.measured;
    this.available = payload.available;
    this.fontSize = payload.fontSize;
    this.inkPad = payload.inkPad;
    // Group-gate only (T9): the shrink walk's trace, present when the walk
    // exhausted the shrink order before failing.
    this.steps = payload.steps ?? null;
    // Reason-specific extras (T10 F7: collision ratios per target, maxRatio).
    this.details = payload.details ?? null;
  }
}

/**
 * Ink overhang of one measured text run, per direction (formula A).
 *
 * Canvas `measureText` reports the glyph ink box relative to the origin:
 * `actualBoundingBoxLeft` is the distance the ink reaches LEFT of the origin
 * (positive = overhang). The earlier `-actualBoundingBoxLeft` formula clamped
 * that to 0 and silently missed italic/serif overhang (F9 regression).
 *
 * Top/bottom compare against the font box; engines without fontBoundingBox*
 * report 0 there rather than NaN — vertical ink clipping has never been
 * observed in this pipeline and must not false-fail the gate.
 *
 * @param {{
 *   width: number,
 *   actualBoundingBoxLeft?: number,
 *   actualBoundingBoxRight?: number,
 *   actualBoundingBoxAscent?: number,
 *   actualBoundingBoxDescent?: number,
 *   fontBoundingBoxAscent?: number,
 *   fontBoundingBoxDescent?: number,
 * }} metrics
 * @returns {{left: number, right: number, top: number, bottom: number}}
 */
export function inkOverhangsOfRun(metrics) {
  const left = Math.max(0, metrics.actualBoundingBoxLeft ?? 0);
  const right = Math.max(0, (metrics.actualBoundingBoxRight ?? 0) - (metrics.width ?? 0));
  const top =
    typeof metrics.fontBoundingBoxAscent === "number"
      ? Math.max(0, (metrics.actualBoundingBoxAscent ?? 0) - metrics.fontBoundingBoxAscent)
      : 0;
  const bottom =
    typeof metrics.fontBoundingBoxDescent === "number"
      ? Math.max(0, (metrics.actualBoundingBoxDescent ?? 0) - metrics.fontBoundingBoxDescent)
      : 0;
  return { left, right, top, bottom };
}

/**
 * The four corners of a bbox (getBBox() shape), in local coords.
 * Order: TL, TR, BR, BL.
 *
 * @param {{x: number, y: number, width: number, height: number}} bbox
 * @returns {{x: number, y: number}[]}
 */
export function cornersFromBBox(bbox) {
  return [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
    { x: bbox.x, y: bbox.y + bbox.height },
  ];
}

/**
 * Apply a screen CTM (getScreenCTM() shape {a,b,c,d,e,f}) to one point.
 *
 * @param {{x: number, y: number}} p
 * @param {{a: number, b: number, c: number, d: number, e: number, f: number}} ctm
 * @returns {{x: number, y: number}}
 */
export function transformCorner(p, ctm) {
  return {
    x: ctm.a * p.x + ctm.c * p.y + ctm.e,
    y: ctm.b * p.x + ctm.d * p.y + ctm.f,
  };
}

/** Axis-aligned bbox enclosing a set of corners. */
export function bboxFromCorners(corners) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Screen-space corners → composition coords. Remotion scales the composition
 * to fit its container, so screen = composition × scale.
 *
 * @param {{x: number, y: number}[]} corners
 * @param {number} scale
 * @returns {{x: number, y: number}[]}
 */
export function toCompositionCoords(corners, scale) {
  return corners.map((c) => ({ x: c.x / scale, y: c.y / scale }));
}

/** Union of several boxes into one AABB. */
export function unionBox(boxes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * True when every edge of `inner` sits inside `outer`, within EPS.
 *
 * @param {{x: number, y: number, width: number, height: number}} inner
 * @param {{x: number, y: number, width: number, height: number}} outer
 * @param {number} [eps]
 * @returns {boolean}
 */
export function boxWithin(inner, outer, eps = EPS) {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.width <= outer.x + outer.width + eps &&
    inner.y + inner.height <= outer.y + outer.height + eps
  );
}
