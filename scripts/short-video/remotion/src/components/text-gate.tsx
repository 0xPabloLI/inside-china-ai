/**
 * TextGate — runtime layer of the Fit/Assert geometry gate (T4).
 *
 * Wraps one text slot and owns its whole measurement timing, so the nine
 * scene templates (T5) and the HTML path (T6) never re-implement it:
 *
 *   1. wait for `document.fonts.ready` (race against an injectable timeout —
 *      a timeout FAILs, it never silently measures with fallback metrics)
 *   2. wait for the annotation SVG to mount (rough-notation's Tracker),
 *      so geometry is never measured against an unmounted annotation
 *   3. Fit: walk `preferredSize → minSize` on REAL geometry — layout metrics
 *      plus glyph ink overhangs (Canvas formula A, per direction); the floor
 *      is hard (no ×0.9); hitting it cancels the render with a TextFitError
 *   4. Assert, every frame:
 *      - frame < settledFrame: the slot's transform-free LAYOUT box must stay
 *        in SAFE_ZONES (and inside its text container when checkContainer)
 *      - frame ≥ settledFrame: text AABB (ink-inflated) ∪ annotation drawn
 *        AABB (getBBox → getScreenCTM four corners → composition coords,
 *        plus stroke paint margin ONLY — random offsets are baked into the
 *        path `d`) must stay inside the slot content box
 *
 * Pure geometry lives in lib/text-geometry.mjs (shared with the HTML path);
 * this file is the browser-facing orchestration. Spec: spec-text-overflow-
 * hardening.md § T4 Implementation Refinement, decisions 28–35.
 *
 * Render-viewport contract: Remotion renders with the page viewport equal to
 * the composition size (root scale 1). The entrance-window asserts therefore
 * police transform-free LAYOUT boxes (entrance/scene transforms converge to
 * identity and cannot false-positive); after settling, the gate's own
 * rect/offsetWidth ratio recovers whatever scale applies to annotation
 * coordinates.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, useCurrentFrame } from "remotion";
import { getSlot, parseSlotId } from "../../../lib/text-slots.mjs";
import { fitCandidatesFromSeed, minContainerSeed } from "../../../lib/official-fit-kernel.mjs";
import { useTextGroup } from "./text-group-gate";
import { predictGateSeeds } from "./official-fit";
import {
  EPS,
  FIT_REASONS,
  TextFitError,
  annotationOverdrawOf,
  inkOverhangsOfRun,
  cornersFromBBox,
  transformCorner,
  bboxFromCorners,
  toCompositionCoords,
  boxWithin,
} from "../../../lib/text-geometry.mjs";
import { CANVAS, SAFE_ZONES } from "../../../lib/safe-zones.mjs";

/** Local geometry shapes (the .mjs layer is untyped at this boundary). */
export type Pad = { left: number; right: number; top: number; bottom: number };
export type Box = { x: number; y: number; width: number; height: number };

/** The slice of the slot contract the gate consumes. */
type SlotLike = {
  preferredSize: number;
  minSize: number;
  maxWidth: number;
  maxLines?: number;
  settledFrame: number;
  annotationPolicy: string;
};

const ZERO_PAD: Pad = { left: 0, right: 0, top: 0, bottom: 0 };
export { ZERO_PAD };

/**
 * Drawn-bound tolerance for the slot's annotation family (decision 70):
 * `annotationOverdrawOf` in lib/text-geometry.mjs is the single source —
 * rough-notation deliberately draws OUTSIDE its target box (ellipse vertical
 * range, underline understroke, highlight pad); a genuinely oversized
 * annotation still trips Fit (its text ⊆ slot) or container-overflow (gate
 * box ⊆ container) — only the ink bleed past the band edge is tolerated.
 */

/** Transform-free page position: the offset chain ignores CSS transforms. */
function layoutOffsetOf(el: HTMLElement): { left: number; top: number } {
  let left = 0;
  let top = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    left += n.offsetLeft;
    top += n.offsetTop;
  }
  return { left, top };
}

/**
 * Transform-free CONTENT box of a text container: layout position from the
 * offset chain plus clientWidth/clientHeight minus padding (the same content
 * box the settled container assert uses, but immune to scene-transition and
 * entrance transforms, which move the drawn rect without changing layout).
 * Border widths must be added: offsetLeft lands on the border box, and the
 * settled assert's `(rect + border + pad)` shape is the reference — e.g.
 * StatCard's 1px side / 5px top border fail containment by exactly that
 * amount if skipped.
 */
function layoutContentBoxOf(el: HTMLElement): Box {
  const style = getComputedStyle(el);
  const borderL = Number.parseFloat(style.borderLeftWidth) || 0;
  const borderT = Number.parseFloat(style.borderTopWidth) || 0;
  const padL = Number.parseFloat(style.paddingLeft) || 0;
  const padR = Number.parseFloat(style.paddingRight) || 0;
  const padT = Number.parseFloat(style.paddingTop) || 0;
  const padB = Number.parseFloat(style.paddingBottom) || 0;
  const pos = layoutOffsetOf(el);
  return {
    x: pos.left + borderL + padL,
    y: pos.top + borderT + padT,
    width: el.clientWidth - padL - padR,
    height: el.clientHeight - padT - padB,
  };
}

/** Transform-free layout box of a gate (offset chain + layout sizes). */
function layoutBoxOf(el: HTMLElement): Box {
  const pos = layoutOffsetOf(el);
  return { x: pos.left, y: pos.top, width: el.offsetWidth, height: el.offsetHeight };
}

/** Content region of the canvas that must never be covered by platform UI. */
const SAFE_BOX: Box = {
  x: SAFE_ZONES.left,
  y: SAFE_ZONES.top,
  width: CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right,
  height: CANVAS.height - SAFE_ZONES.top - SAFE_ZONES.bottom,
};

let sharedCtx: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!sharedCtx) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D unavailable — the text gate cannot measure ink");
    }
    sharedCtx = ctx;
  }
  return sharedCtx;
}

/** Mirror the element's computed typography onto the measurement context. */
function syncCtx(ctx: CanvasRenderingContext2D, style: CSSStyleDeclaration): void {
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  // Not all engines expose these; skip rather than crash — letter spacing is
  // the one that materially changes advance widths here.
  if ("letterSpacing" in ctx) {
    const ext = ctx as unknown as {
      letterSpacing: string;
      fontKerning: string;
      fontStretch: string;
    };
    ext.letterSpacing = style.letterSpacing;
    ext.fontKerning = style.fontKerning;
    ext.fontStretch = style.fontStretch;
  }
}

/**
 * Max glyph-ink overhang per direction across the element's text, measured
 * per RENDERED LINE per style run (spec decision 5, refinement 67b). The
 * pre-T10 implementation measured each text node as ONE `measureText()` call
 * — canvas collapses `\n` and the browser wraps text the same way — so a
 * wrapped node's interior line edges (e.g. an italic `f` opening line 2)
 * were invisible to it. Each text node is split into its rendered lines via
 * per-character Range rects (layout geometry; grouping tolerance absorbs
 * fractional tops), and each line's substring is measured under the host's
 * computed typography.
 */
export function collectInkOverhangs(el: HTMLElement): Pad {
  const ctx = measureCtx();
  const pad: Pad = { ...ZERO_PAD };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  /** Fractional-top noise between rects of the same rendered line. */
  const LINE_EPS = 2;
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    if (text.trim().length > 0) {
      const host = (node.parentElement ?? el) as HTMLElement;
      syncCtx(ctx, getComputedStyle(host));
      let lineStart = 0;
      let lineTop: number | null = null;
      const flushLine = (endExclusive: number) => {
        // Newline characters decide line grouping but carry no ink and no
        // on-line advance — including them in the measured substring changes
        // the canvas shaping (and thus the overhang) asymmetrically.
        const line = text.slice(lineStart, endExclusive).replace(/\n/g, "");
        if (line.trim().length > 0) {
          const run = inkOverhangsOfRun(ctx.measureText(line));
          pad.left = Math.max(pad.left, run.left);
          pad.right = Math.max(pad.right, run.right);
          pad.top = Math.max(pad.top, run.top);
          pad.bottom = Math.max(pad.bottom, run.bottom);
        }
      };
      for (let i = 0; i < text.length; i += 1) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getClientRects()[0];
        if (!rect) continue; // collapsed (never laid out)
        if (lineTop == null) lineTop = rect.top;
        if (rect.top > lineTop + LINE_EPS) {
          flushLine(i);
          lineStart = i;
          lineTop = rect.top;
        }
      }
      flushLine(text.length);
    }
    node = walker.nextNode();
  }
  return pad;
}

function inflate(box: Box, pad: Pad | number): Box {
  const p = typeof pad === "number" ? { left: pad, right: pad, top: pad, bottom: pad } : pad;
  return {
    x: box.x - p.left,
    y: box.y - p.top,
    width: box.width + p.left + p.right,
    height: box.height + p.top + p.bottom,
  };
}

/**
 * Extent of the TEXT runs only, in the gate's local space.
 *
 * Range geometry over text nodes — not the wrapper's scroll metrics, which
 * also count the absolutely-positioned annotation SVG and would make Fit
 * fail on drawn bounds that Assert owns. Screen rects are divided by the
 * gate's rect/offset ratio so entrance transforms cancel out.
 */
function textExtentLocal(gate: HTMLElement): Box {
  const range = document.createRange();
  const walker = document.createTreeWalker(gate, NodeFilter.SHOW_TEXT);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let node: Node | null = walker.nextNode();
  while (node) {
    if ((node.textContent ?? "").trim().length > 0) {
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
      }
    }
    node = walker.nextNode();
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  const gateRect = gate.getBoundingClientRect();
  const scale = gate.offsetWidth > 0 ? gateRect.width / gate.offsetWidth : 1;
  return {
    x: (minX - gateRect.left) / scale,
    y: (minY - gateRect.top) / scale,
    width: (maxX - minX) / scale,
    height: (maxY - minY) / scale,
  };
}

/**
 * Rendered opacity of an element: the minimum computed opacity along its
 * ancestor chain (an ancestor's fade hides the element just as its own
 * would). Used to skip entrance asserts for frames where nothing is drawn.
 */
function effectiveOpacityOf(el: HTMLElement): number {
  let opacity = 1;
  let node: HTMLElement | null = el;
  while (node) {
    opacity = Math.min(opacity, Number.parseFloat(getComputedStyle(node).opacity) || 0);
    if (opacity <= 0) return 0;
    node = node.parentElement;
  }
  return opacity;
}

/**
 * Union of the gate's TEXT-run rects in composition coordinates — the same
 * geometry Fit measured, so Assert and Fit agree. Never the wrapper's rect:
 * a block wrapper spans the whole gate width, and with a centered layout that
 * box sits OFF-center (a full-width box under textAlign:center shifts right
 * by half the slack), failing slots whose text runs are actually inside.
 *
 * Exported for the scene-level AnnotationCollisionAssert (F7), which needs
 * the neighbour slots' TEXT boxes as collision denominators — the wrapper
 * box would inflate the denominator with dead space and dilute the ratio.
 */
export function textExtentComposition(gate: HTMLElement): Box {
  const range = document.createRange();
  const walker = document.createTreeWalker(gate, NodeFilter.SHOW_TEXT);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let node: Node | null = walker.nextNode();
  while (node) {
    if ((node.textContent ?? "").trim().length > 0) {
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
      }
    }
    node = walker.nextNode();
  }
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const gateRect = gate.getBoundingClientRect();
  const scale = gate.offsetWidth > 0 ? gateRect.width / gate.offsetWidth : 1;
  return {
    x: minX / scale,
    y: minY / scale,
    width: (maxX - minX) / scale,
    height: (maxY - minY) / scale,
  };
}

/**
 * Painted (stroked) bounds of an SVG in its OWN user space. Rough-notation
 * draws its families as stroked paths, and `getBBox()` reports the CENTERLINE
 * only — the paint is the stroke around it. Inflating the bbox by half the
 * stroke width in EVERY direction is truthful for closed shapes (the circle
 * family) but WRONG for the highlight/underline families: they are a thick
 * horizontal LINE (stroke-width = line height + padding — 62px on a 50px
 * scene line), and a butt-capped line's paint extends perpendicular to the
 * stroke only — along the line it ends at the centerline's endpoints (the
 * 6px config padding, baked into `d`). The all-directions inflation
 * overcounted the highlight's horizontal paint by (sw/2 − padding) ≈ 25px per
 * side, which the legacy flat 64px tolerance masked and decision 70's
 * measured 16px tolerance exposed as a false annotation-out-of-slot.
 *
 * So the paint is measured per SEGMENT of the centerline: each sampled
 * segment is inflated by half the stroke width along its own perpendicular
 * only (butt caps add nothing along the segment). For closed paths the
 * segments point in every direction and the union converges to the old
 * bbox+sw/2 box; for lines it stays tight to the true band.
 */
function paintedBoxOfSvg(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  svg.querySelectorAll("path").forEach((path) => {
    const sw = Number.parseFloat(path.getAttribute("stroke-width") ?? "0") || 0;
    const half = sw / 2;
    let len = 0;
    try {
      len = path.getTotalLength();
    } catch {
      return; // not rendered — nothing painted
    }
    if (len <= 0) return;
    const steps = Math.max(2, Math.min(64, Math.ceil(len / 12)));
    let prev = path.getPointAtLength(0);
    for (let i = 1; i <= steps; i += 1) {
      const p = path.getPointAtLength((len * i) / steps);
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const segLen = Math.hypot(dx, dy) || 1;
      // Perpendicular unit of this segment; the stroke band around the
      // segment is the segment's endpoints offset ±half along it.
      const nx = (-dy / segLen) * half;
      const ny = (dx / segLen) * half;
      include(prev.x + nx, prev.y + ny);
      include(prev.x - nx, prev.y - ny);
      include(p.x + nx, p.y + ny);
      include(p.x - nx, p.y - ny);
      prev = p;
    }
  });
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
export { nextFrame };

/**
 * Shared stability poll (T10): read a geometry value frame by frame until its
 * key has been unchanged for `stableFrames` consecutive frames or `tries`
 * frames have elapsed. The helper only decides WHEN the geometry may be
 * judged — callers own the verdict (assert / fail / release handles).
 *
 * Consumers: TextGate's settled annotation assert (30 tries / 3 stable —
 * rough-notation's ResizeObserver lands its SVG resize a frame AFTER the
 * text relayouts) and AnnotationCollisionAssert (90 / 5 — the source gate's
 * Fit ladder moves the ellipse and neighbour boxes together frame by frame).
 * A null read is keyed like any value, so "never appeared" can stabilize
 * early instead of always burning the whole window.
 */
export async function pollUntilStable<T>(
  read: () => T,
  keyOf: (value: T) => string,
  opts: { tries: number; stableFrames: number; isCancelled?: () => boolean },
): Promise<T> {
  let prev: string | null = null;
  let stable = 0;
  let value = read();
  for (let tries = 0; tries < opts.tries; tries += 1) {
    if (opts.isCancelled?.()) return value;
    const key = keyOf(value);
    stable = key === prev ? stable + 1 : 0;
    prev = key;
    if (stable >= opts.stableFrames) break;
    await nextFrame();
    value = read();
  }
  return value;
}

/**
 * Drawn bounds of the gate's annotation SVG in composition coordinates:
 * painted stroke geometry (see paintedBoxOfSvg) → getScreenCTM four-corner
 * transform into composition units. Null when the gate has no mounted
 * annotation (or the annotation has painted nothing yet). Exported for the
 * scene-level AnnotationCollisionAssert (F7), which reuses the exact
 * geometry the gate's own settled assert polices.
 */
export function annotationDrawnBox(gate: HTMLElement): Box | null {
  const svg = gate.querySelector("svg") as SVGSVGElement | null;
  if (!svg || typeof svg.getBBox !== "function") return null;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const painted = paintedBoxOfSvg(svg);
  if (!painted) return null; // nothing painted yet — no drawn bounds on record
  const rect = gate.getBoundingClientRect();
  const scale = gate.offsetWidth > 0 ? rect.width / gate.offsetWidth : 1;
  const corners = toCompositionCoords(
    cornersFromBBox(painted).map((c) => transformCorner(c, ctm)),
    scale,
  );
  return bboxFromCorners(corners);
}

export type TextGateProps = {
  /** Scene identifier carried into TextFitError. */
  sceneId: string;
  /** Slot contract id, e.g. "narrative.media-overlay.result". */
  slotId: string;
  /** Bypass Fit and render at exactly this size (still gated). */
  lockFontSize?: number;
  /** Fonts-ready race timeout; injectable for tests. Default 10s. */
  fontTimeoutMs?: number;
  /** Extra promise that must also settle before measurement (test seam). */
  extraFontsReady?: Promise<unknown>;
  /** Frame by which entrance/annotations have settled. Default: contract. */
  settledFrame?: number;
  /** Slot content-box width. Default: the contract's measured maxWidth. */
  slotWidth?: number;
  /** Force annotation-mount waiting even when the contract says "none". */
  expectAnnotation?: boolean;
  /**
   * Assert the gate's drawn box stays inside the nearest [data-text-container]
   * ancestor once settled (vertical clipping that overflow:hidden would hide).
   * Skipped when no container ancestor exists. Default true.
   */
  checkContainer?: boolean;
  /** Render prop: receives the gate's chosen font size. */
  children: (fontSize: number) => React.ReactNode;
};

/**
 * Wraps a text slot's content box and gates its geometry. The wrapper div IS
 * the slot content box; `children(fontSize)` renders the text (and any
 * annotation) inside it.
 */
export const TextGate: React.FC<TextGateProps> = ({
  sceneId,
  slotId,
  lockFontSize,
  fontTimeoutMs = 10_000,
  extraFontsReady,
  settledFrame,
  slotWidth,
  expectAnnotation,
  checkContainer = true,
  children,
}) => {
  const slot = getSlot(slotId) as unknown as SlotLike;
  const field = parseSlotId(slotId).field;
  const contentWidth = slotWidth ?? slot.maxWidth;
  const settledAt = settledFrame ?? slot.settledFrame;
  const wantsAnnotation = expectAnnotation ?? slot.annotationPolicy !== "none";

  const gateRef = useRef<HTMLDivElement>(null);
  const frame = useCurrentFrame();
  // T9: when mounted inside a TextGroupGate band, the group owns the vertical
  // budget — this gate registers with it instead of releasing the render.
  const group = useTextGroup();
  const [fontSize, setFontSize] = useState(lockFontSize ?? slot.preferredSize);
  const [ready, setReady] = useState(false);
  const inkRef = useRef<Pad>({ ...ZERO_PAD });
  const fitStartedRef = useRef(false);
  // T10: the settled annotation assert is stability-polled on first
  // evaluation (and after every font-size change) — see the settled branch.
  // One delayRender handle per verdict; `size` keys the verdict to the size
  // whose geometry it validated.
  const annotationAssertRef = useRef<{ size: number; settled: boolean; handle: number } | null>(
    null,
  );

  const fail = (
    reason: string,
    measured: { width: number; height: number | null },
    available: { width: number; height: number | null },
    size: number,
    inkPad: Pad,
  ): never => {
    throw cancelRender(
      new TextFitError({
        reason,
        sceneId,
        slotId,
        field,
        measured,
        available,
        fontSize: size,
        inkPad,
      }),
    );
  };

  // Fit once after mount: fonts → annotation mount → size ladder. Registered
  // with delayRender so Remotion never captures a frame mid-fit. Inside a
  // group the handle stays open until the group's vertical check approves.
  useEffect(() => {
    if (fitStartedRef.current) return;
    fitStartedRef.current = true;
    const handle = delayRender(`text-gate fit for ${slotId}`);
    // Group registration happens synchronously in the effect body, before
    // any await: the parent group's mount effect runs after all children's
    // effects and relies on the expected set being complete there.
    if (group) group.expect(slotId, handle);

    (async () => {
      const gate = gateRef.current;
      if (!gate) {
        continueRender(handle);
        return;
      }
      const textEl = (gate.firstElementChild as HTMLElement | null) ?? gate;
      const contentLocal: Box = {
        x: 0,
        y: 0,
        width: gate.offsetWidth,
        height: gate.offsetHeight,
      };

      // 1. Fonts. Timeout FAILs — silent fallback metrics are forbidden.
      const fonts = Promise.all([document.fonts.ready, extraFontsReady ?? Promise.resolve()]);
      let timedOut = false;
      await Promise.race([
        fonts,
        new Promise<void>((resolve) =>
          setTimeout(() => {
            timedOut = true;
            resolve();
          }, fontTimeoutMs),
        ),
      ]);
      if (timedOut) {
        fail(
          FIT_REASONS.fontTimeout,
          { width: 0, height: null },
          { width: contentLocal.width, height: contentLocal.height },
          fontSize,
          ZERO_PAD,
        );
      }
      await nextFrame();

      // 2. Annotation mount: never measure before the Tracker's SVG exists.
      // Decision 67a: exhaustion is a FAIL, not fail-open — measuring without
      // the annotation would validate an incomplete render and the settled
      // assert would then police nothing (no SVG, no bounds).
      if (wantsAnnotation) {
        let tries = 0;
        while (!gate.querySelector("svg") && tries < 30) {
          await nextFrame();
          tries += 1;
        }
        if (!gate.querySelector("svg")) {
          fail(
            FIT_REASONS.annotationMissing,
            { width: 0, height: null },
            { width: contentLocal.width, height: contentLocal.height },
            fontSize,
            ZERO_PAD,
          );
        }
      }

      // 3. Fit ladder on real geometry: layout box + glyph ink.
      // T12 (decisions 57/63): the candidate walk is seeded by the official
      // layout-utils measurement (fitText / fitTextOnNLines, px-letterSpacing
      // corrected). fitCandidatesFromSeed reorders — never trims — the same
      // lattice the old linear ladder walked, so the terminal validation
      // below keeps deciding: a bad official prediction costs probes, never
      // correctness. If the official path cannot model the gate it returns
      // nothing and the seed defaults to preferredSize, i.e. exactly the
      // pre-T12 full ladder.
      let seed: number | null = null;
      if (lockFontSize == null) {
        try {
          seed = minContainerSeed(
            predictGateSeeds({
              textEl,
              maxWidth: contentLocal.width,
              preferredSize: slot.preferredSize,
              maxLines: slot.maxLines ?? 2,
            }),
          );
        } catch {
          seed = null; // official measurement is an optimization, not a gate
        }
      }
      const candidates =
        lockFontSize != null
          ? [lockFontSize]
          : fitCandidatesFromSeed(slot, seed ?? slot.preferredSize);
      let chosen: number | null = null;
      let lastInk: Pad = { ...ZERO_PAD };
      let lastBox: Box = { ...contentLocal };
      for (const size of candidates) {
        textEl.style.fontSize = `${size}px`;
        await nextFrame();
        const ink = collectInkOverhangs(textEl);
        const inflated = inflate(textExtentLocal(gate), ink);
        lastInk = ink;
        lastBox = inflated;
        if (boxWithin(inflated, contentLocal, EPS)) {
          chosen = size;
          break;
        }
      }
      if (chosen == null) {
        fail(
          FIT_REASONS.fitBottom,
          { width: lastBox.width, height: lastBox.height },
          { width: contentLocal.width, height: contentLocal.height },
          candidates[candidates.length - 1],
          lastInk,
        );
        return; // unreachable: fail() throws via cancelRender
      }
      inkRef.current = lastInk;
      setFontSize(chosen);
      setReady(true);
      if (group) {
        // The group gate owns the vertical budget: hand over the chosen size
        // and let IT release the render after the band-height check (T9).
        group.report(slotId, {
          size: chosen,
          apply: async (size: number) => {
            setFontSize(size);
            await nextFrame();
          },
        });
        return;
      }
      await nextFrame();
      continueRender(handle);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Settled annotation containment (shared by the container and fallback
   * branches). STABILITY-POLLED whenever the governing font size changes
   * (T10): rough-notation resizes its SVG via ResizeObserver, which lands a
   * frame AFTER the text relayouts — a synchronous check at the ready-commit
   * measures the PREVIOUS size's drawn box (baseline-narrative regression:
   * the Highlight SVG still carried the pre-shrink 56px width, ~40px off,
   * and the per-type tolerance of decision 70 no longer absorbs such drift).
   * The first evaluation for a size holds the render open (delayRender) and
   * polls the drawn box across frames until it has been unchanged for 3
   * consecutive frames — the same discipline AnnotationCollisionAssert uses
   * — then asserts and caches the verdict for that size; later frames re-
   * assert synchronously on live geometry (static once stable).
   */
  const assertAnnotation = (box: Box, bounds: Box): void => {
    const verdict = annotationAssertRef.current;
    if (verdict != null && verdict.size === fontSize) {
      // This size's verdict is already in force (or being polled): assert on
      // the live box without re-polling.
      if (verdict.settled && !boxWithin(box, bounds, EPS)) {
        fail(
          FIT_REASONS.annotationOutOfSlot,
          { width: box.width, height: box.height },
          { width: bounds.width, height: bounds.height },
          fontSize,
          inkRef.current,
        );
      }
      return;
    }
    if (verdict != null) {
      // Superseded poll for an older size — release its handle; its verdict
      // never mattered once the size moved on.
      continueRender(verdict.handle);
    }
    const handle = delayRender(`text-gate annotation settle ${slotId}@${fontSize}`);
    annotationAssertRef.current = { size: fontSize, settled: false, handle };
    void (async () => {
      // remotion blocks frame advance while `handle` is open, so this poll
      // cannot race a re-render; no cancellation bookkeeping is needed.
      await pollUntilStable(
        () => {
          const gate = gateRef.current;
          return gate ? annotationDrawnBox(gate) : null;
        },
        (next) =>
          next == null
            ? "none"
            : `${next.x.toFixed(2)},${next.y.toFixed(2)},${next.width.toFixed(2)},${next.height.toFixed(2)}`,
        { tries: 30, stableFrames: 3 },
      );
      // A newer font size superseded this poll (group shrink walk) — it owns
      // the verdict; this one must not assert on geometry it watched change
      // mid-walk.
      if (annotationAssertRef.current?.handle !== handle) return;
      const gate = gateRef.current;
      const stableBox = gate ? annotationDrawnBox(gate) : null;
      if (!stableBox) {
        // assertAnnotation is only called with a drawn box on record (the
        // call site guards on annotationBox != null), and within one poll
        // there is no remount (a size change supersedes the poll) — so a
        // null box after 30 frames, whether never-appeared or seen-then-
        // vanished, means the captured frame has no measurable annotation.
        // Same fail-open decision 67a closed for the mount wait.
        fail(
          FIT_REASONS.annotationMissing,
          { width: 0, height: null },
          { width: bounds.width, height: bounds.height },
          fontSize,
          inkRef.current,
        );
      } else if (!boxWithin(stableBox, bounds, EPS)) {
        fail(
          FIT_REASONS.annotationOutOfSlot,
          { width: stableBox.width, height: stableBox.height },
          { width: bounds.width, height: bounds.height },
          fontSize,
          inkRef.current,
        );
      }
      if (annotationAssertRef.current?.handle === handle) {
        annotationAssertRef.current.settled = true;
      }
      continueRender(handle);
    })().catch((err) => {
      // fail() unwinds via cancelRender's throw; release the handle first so
      // the render can never wedge on this path, then re-propagate.
      continueRender(handle);
      throw cancelRender(err instanceof Error ? err : new Error(String(err)));
    });
  };

  // Assert every frame once fit has settled.
  useLayoutEffect(() => {
    const gate = gateRef.current;
    if (!gate || !ready) return;

    if (frame < settledAt) {
      // Entrance window: police the REST geometry on transform-free layout
      // boxes. During this window the drawn rect is unreliable — StampIn
      // shrinks 2→1 (transiently oversized until the scale reaches 1),
      // slide/wipe scene transitions translate the whole scene for the
      // overlap window, and chip entrances move within their band — none of
      // which changes layout. Rest geometry is what the contract covers; the
      // settled asserts (frame ≥ settledAt) police the same thing on drawn
      // rects once all motion has ended.
      if (effectiveOpacityOf(gate) <= 0) {
        return; // the entrance hasn't started, nothing is drawn
      }
      const gateBox = layoutBoxOf(gate);
      if (!boxWithin(gateBox, SAFE_BOX, EPS)) {
        fail(
          FIT_REASONS.safeZoneBreach,
          { width: gateBox.width, height: gateBox.height },
          { width: SAFE_BOX.width, height: SAFE_BOX.height },
          fontSize,
          inkRef.current,
        );
      }
      // Container assert (same duty as the settled check): catch a gate that
      // does not fit its band — vertical clipping that overflow:hidden hides.
      // Both boxes are transform-free layout boxes, so entrance and scene
      // motion cannot false-positive; a resting position outside the band is
      // still caught here and (once motion ends) by the settled drawn check.
      if (checkContainer) {
        const entranceContainer = gate.closest("[data-text-container]") as HTMLElement | null;
        if (entranceContainer) {
          const containerBox = layoutContentBoxOf(entranceContainer);
          if (!boxWithin(gateBox, containerBox, EPS)) {
            fail(
              FIT_REASONS.containerOverflow,
              { width: gateBox.width, height: gateBox.height },
              { width: containerBox.width, height: containerBox.height },
              fontSize,
              inkRef.current,
            );
          }
        }
      }
      return;
    }

    // Settled: text (ink-inflated) ⊆ content box. The annotation's drawn
    // bounds are checked against the scene container below — rough-notation
    // deliberately draws OUTSIDE the text's line box (ellipse vertical range,
    // underline understroke), so requiring union ⊆ content box would fail
    // every annotated slot whose line-height tracks the text alone.
    const rect = gate.getBoundingClientRect();
    const scale = gate.offsetWidth > 0 ? rect.width / gate.offsetWidth : 1;
    const contentBox: Box = {
      x: rect.left / scale,
      y: rect.top / scale,
      width: gate.offsetWidth,
      height: gate.offsetHeight,
    };
    const ink = inkRef.current;
    // Text-run extent (what Fit sized against), not the wrapper rect — see
    // textExtentComposition.
    const textBox = inflate(textExtentComposition(gate), ink);
    if (!boxWithin(textBox, contentBox, EPS)) {
      fail(
        FIT_REASONS.textOutOfSlot,
        { width: textBox.width, height: textBox.height },
        { width: contentBox.width, height: contentBox.height },
        fontSize,
        ink,
      );
    }
    const svg = gate.querySelector("svg") as SVGSVGElement | null;
    // The drawn box comes from the shared helper (getBBox → screen CTM →
    // composition coords + stroke paint margin) — the same geometry the
    // scene-level AnnotationCollisionAssert polices.
    const annotationBox = svg ? annotationDrawnBox(gate) : null;

    // Container assert, three duties:
    //  1. a scene's text region can be shorter than the slot it hands the gate
    //     (fixed-height band + overflow:hidden) — Fit never sees it, the gate's
    //     own box grows with the text, so clipping would hide here;
    //  2. gated cards (flex:1, variable width) catch a gate wider than their
    //     actual content box;
    //  3. annotations must stay inside the container even though they may
    //     overdraw the slot box.
    // The gate check uses layout boxes (see below); the annotation check
    // needs the DRAWN content box (its bounds come from the SVG's screen
    // CTM), which is also why border/padding are parsed here.
    let containerEl: HTMLElement | null = null;
    if (checkContainer) {
      containerEl = gate.closest("[data-text-container]") as HTMLElement | null;
      if (containerEl) {
        const cRect = containerEl.getBoundingClientRect();
        const cScale = containerEl.offsetWidth > 0 ? cRect.width / containerEl.offsetWidth : 1;
        const cStyle = getComputedStyle(containerEl);
        const borderL = Number.parseFloat(cStyle.borderLeftWidth) || 0;
        const borderT = Number.parseFloat(cStyle.borderTopWidth) || 0;
        const padL = Number.parseFloat(cStyle.paddingLeft) || 0;
        const padR = Number.parseFloat(cStyle.paddingRight) || 0;
        const padT = Number.parseFloat(cStyle.paddingTop) || 0;
        const padB = Number.parseFloat(cStyle.paddingBottom) || 0;
        const containerBox: Box = {
          x: (cRect.left + borderL + padL) / cScale,
          y: (cRect.top + borderT + padT) / cScale,
          width: containerEl.clientWidth - padL - padR,
          height: containerEl.clientHeight - padT - padB,
        };
        // Gate ⊆ container polices transform-free LAYOUT boxes, the same
        // geometry the entrance window uses: entrance translates can still be
        // running at settledFrame (contrast chips' SlideUp ends ~frame 43
        // with a rest bottom flush on the container bottom — pipeline
        // regression contrast-6 right[1]), and scene transitions move drawn
        // rects afterwards. Rest geometry is what the contract covers; a
        // resting overflow still fails here because layout never lies about
        // it.
        const containerLayout = layoutContentBoxOf(containerEl);
        const gateLayoutBox = layoutBoxOf(gate);
        if (!boxWithin(gateLayoutBox, containerLayout, EPS)) {
          fail(
            FIT_REASONS.containerOverflow,
            { width: gateLayoutBox.width, height: gateLayoutBox.height },
            { width: containerLayout.width, height: containerLayout.height },
            fontSize,
            ink,
          );
        }
        // Annotation bounds: the content box plus the annotation family's
        // measured overdraw tolerance (decision 70) — stability-polled, see
        // assertAnnotation below.
        const annotationBounds = inflate(containerBox, annotationOverdrawOf(slot.annotationPolicy));
        if (annotationBox) {
          assertAnnotation(annotationBox, annotationBounds);
        }
      }
    }
    // Annotation fallback: with no container ancestor the slot box is the only
    // bound on record, so the drawn annotation must stay inside it there.
    if (!containerEl && annotationBox) {
      assertAnnotation(annotationBox, contentBox);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, ready, fontSize]);

  return (
    <div
      ref={gateRef}
      data-text-slot={slotId}
      data-text-field={field}
      // display:block + auto margins: a full-width inline-block under
      // textAlign:center shifts right by half the parent's slack and
      // overflows its container (seen on quote.hero-center.verified).
      style={{ width: contentWidth, position: "relative", display: "block", margin: "0 auto" }}
    >
      {/*
        Keyed by the governing font size. The gate's Fit walk mutates
        textEl.style.fontSize DIRECTLY (no React re-render), so when the size
        is chosen (or the group walk steps it down) the children re-render
        around an unchanged annotation DOM — and @remotion/rough-notation only
        redraws its SVG when its `size` state changes (ResizeObserver → React
        state) or `frame` advances. In VIDEO renders the per-frame redraw keeps
        the SVG on the live geometry; in still renders (fixtures, probes)
        neither trigger fires while the render is held open — the RO event is
        delivered but the library's state commit never lands, so the SVG
        freezes at the MOUNT size (measured regression: the baseline result
        Highlight stayed at the 56px mount box, ~72px off the settled 50px
        text, forever). Remounting on every size change re-runs the library's
        own initial measurement against the CURRENT layout, so the drawn box
        is correct in both render modes; same frame, same seed, same progress
        → the redrawn paths are visually identical.
      */}
      <React.Fragment key={fontSize}>{children(fontSize)}</React.Fragment>
    </div>
  );
};
