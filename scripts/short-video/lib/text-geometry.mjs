/**
 * Pure text-geometry layer for the Fit/Assert gate (T4).
 *
 * Browser-independent maths over measurement inputs: ink overhang formulas,
 * annotation coordinate transforms, box containment and the multi-field shrink
 * orchestration. The DOM-facing behaviour (fonts.ready timing, annotation
 * mount, scroll/client metrics) lives in the render layer
 * (remotion/src/components/text-gate.tsx) and the HTML path (T6) — both
 * consume these functions so the two paths can never drift (spec decision 13
 * of Further Notes, refinement decisions 19–33).
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
  textOutOfSlot: "text-out-of-slot",
};

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

/**
 * Multi-field shrink orchestration (spec decision 17): per-field width fit,
 * then total-height fit shrinking lowest shrinkPriority first, then a
 * proportional pass — stopping dead at each field's minSize (no ×0.9).
 *
 * `field.measure(fontSize)` must return the laid-out `{width, height}` of the
 * field at that size; keeping this an injected oracle keeps the algorithm
 * browser-independent and testable (refinement decision 20).
 *
 * @param {{
 *   fields: Array<{
 *     slotId: string,
 *     field: string,
 *     preferredSize: number,
 *     minSize: number,
 *     shrinkPriority: number,
 *     measure: (fontSize: number) => {width: number, height: number},
 *   }>,
 *   maxWidth: number,
 *   maxHeight: number|null,
 *   sceneId: string,
 *   step?: number,
 * }} params
 * @returns {{fontSizes: Record<string, number>, boxes: Record<string, {width: number, height: number}>}}
 */
export function fitGroup({ fields, maxWidth, maxHeight, sceneId, step = 2 }) {
  const active = fields.filter((f) => f.preferredSize > 0 && f.minSize > 0);
  const sizes = new Map(active.map((f) => [f.slotId, f.preferredSize]));
  const boxOf = (f, size) => f.measure(size);

  const fail = (f, measured, available, reason) => {
    throw new TextFitError({
      reason,
      sceneId,
      slotId: f.slotId,
      field: f.field,
      measured,
      available,
      fontSize: sizes.get(f.slotId),
      inkPad: { left: 0, right: 0, top: 0, bottom: 0 },
    });
  };

  // Phase 1 — each field must fit its own width ladder (preferred → min).
  for (const f of active) {
    let size = f.preferredSize;
    let box = boxOf(f, size);
    while (box.width > maxWidth + EPS && size > f.minSize) {
      size = Math.max(f.minSize, size - step);
      box = boxOf(f, size);
      sizes.set(f.slotId, size);
    }
    if (box.width > maxWidth + EPS) {
      fail(f, box, { width: maxWidth, height: maxHeight }, FIT_REASONS.fitBottom);
    }
  }

  if (maxHeight === null || active.length === 0) {
    return exportResult(active, sizes);
  }

  // Phase 2 — total height: shrink the lowest shrinkPriority field first,
  // each down to its own floor before touching the next one.
  const byPriority = [...active].sort((a, b) => a.shrinkPriority - b.shrinkPriority);
  const totalHeight = () =>
    active.reduce((sum, f) => sum + boxOf(f, sizes.get(f.slotId)).height, 0);

  for (const f of byPriority) {
    if (totalHeight() <= maxHeight + EPS) break;
    let size = sizes.get(f.slotId);
    while (totalHeight() > maxHeight + EPS && size > f.minSize) {
      size = Math.max(f.minSize, size - step);
      sizes.set(f.slotId, size);
    }
  }

  // Phase 3 — everyone at floor and still too tall: shrink proportionally,
  // never below any floor; if the floors themselves do not suffice, fail.
  while (totalHeight() > maxHeight + EPS) {
    let moved = false;
    for (const f of active) {
      if (totalHeight() <= maxHeight + EPS) break;
      const size = sizes.get(f.slotId);
      if (size > f.minSize) {
        sizes.set(f.slotId, Math.max(f.minSize, size - step));
        moved = true;
      }
    }
    if (!moved) {
      const worst = byPriority.find((f) => boxOf(f, sizes.get(f.slotId)).height > 0) ?? active[0];
      fail(
        worst,
        { width: maxWidth, height: totalHeight() },
        { width: maxWidth, height: maxHeight },
        FIT_REASONS.fitBottom,
      );
    }
  }

  return exportResult(active, sizes);

  function exportResult(list, sizeMap) {
    const fontSizes = {};
    const boxes = {};
    for (const f of list) {
      fontSizes[f.slotId] = sizeMap.get(f.slotId);
      boxes[f.slotId] = boxOf(f, sizeMap.get(f.slotId));
    }
    // Empty / zero-size fields keep their preferred size untouched.
    for (const f of fields) {
      if (!list.includes(f)) fontSizes[f.slotId] = f.preferredSize;
    }
    return { fontSizes, boxes };
  }
}
