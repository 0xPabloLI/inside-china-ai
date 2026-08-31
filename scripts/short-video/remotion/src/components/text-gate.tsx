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
 *      - frame < settledFrame: the drawn slot box must stay in SAFE_ZONES
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
 * the composition size (root scale 1). The entrance-window safe-zone assert
 * therefore uses the drawn rect directly; after settling, the gate's own
 * rect/offsetWidth ratio recovers whatever scale applies to annotation
 * coordinates.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, useCurrentFrame } from "remotion";
import { fitCandidates, getSlot, parseSlotId } from "../../../lib/text-slots.mjs";
import {
  EPS,
  FIT_REASONS,
  TextFitError,
  inkOverhangsOfRun,
  cornersFromBBox,
  transformCorner,
  bboxFromCorners,
  toCompositionCoords,
  unionBox,
  boxWithin,
} from "../../../lib/text-geometry.mjs";
import { CANVAS, SAFE_ZONES } from "../../../lib/safe-zones.mjs";

/** Local geometry shapes (the .mjs layer is untyped at this boundary). */
type Pad = { left: number; right: number; top: number; bottom: number };
type Box = { x: number; y: number; width: number; height: number };

/** The slice of the slot contract the gate consumes. */
type SlotLike = {
  preferredSize: number;
  minSize: number;
  maxWidth: number;
  settledFrame: number;
  annotationPolicy: string;
};

const ZERO_PAD: Pad = { left: 0, right: 0, top: 0, bottom: 0 };

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
 * Max glyph-ink overhang per direction across the element's text runs.
 * Each text node is measured as its own run under its own element's computed
 * style (spec: "每个渲染行、每个样式 text run 单独测量").
 */
function collectInkOverhangs(el: HTMLElement): Pad {
  const ctx = measureCtx();
  const pad: Pad = { ...ZERO_PAD };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    if (text.trim().length > 0) {
      const host = (node.parentElement ?? el) as HTMLElement;
      syncCtx(ctx, getComputedStyle(host));
      const run = inkOverhangsOfRun(ctx.measureText(text));
      pad.left = Math.max(pad.left, run.left);
      pad.right = Math.max(pad.right, run.right);
      pad.top = Math.max(pad.top, run.top);
      pad.bottom = Math.max(pad.bottom, run.bottom);
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
 * Stroke paint margin of a rough-notation SVG: half the widest path stroke.
 * The random roughness offsets are already baked into the path `d`, so this
 * is the ONLY extra margin the assert may add (spec refinement decision B3).
 */
function strokePaintMarginOf(svg: SVGSVGElement): number {
  let max = 0;
  svg.querySelectorAll("path").forEach((path) => {
    const w = Number.parseFloat(path.getAttribute("stroke-width") ?? "0");
    if (Number.isFinite(w)) max = Math.max(max, w);
  });
  return max / 2;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
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
  children,
}) => {
  const slot = getSlot(slotId) as unknown as SlotLike;
  const field = parseSlotId(slotId).field;
  const contentWidth = slotWidth ?? slot.maxWidth;
  const settledAt = settledFrame ?? slot.settledFrame;
  const wantsAnnotation = expectAnnotation ?? slot.annotationPolicy !== "none";

  const gateRef = useRef<HTMLDivElement>(null);
  const frame = useCurrentFrame();
  const [fontSize, setFontSize] = useState(lockFontSize ?? slot.preferredSize);
  const [ready, setReady] = useState(false);
  const inkRef = useRef<Pad>({ ...ZERO_PAD });
  const fitStartedRef = useRef(false);

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
  // with delayRender so Remotion never captures a frame mid-fit.
  useEffect(() => {
    if (fitStartedRef.current) return;
    fitStartedRef.current = true;
    const handle = delayRender(`text-gate fit for ${slotId}`);

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
      if (wantsAnnotation) {
        let tries = 0;
        while (!gate.querySelector("svg") && tries < 30) {
          await nextFrame();
          tries += 1;
        }
      }

      // 3. Fit ladder on real geometry: layout box + glyph ink.
      const candidates = lockFontSize != null ? [lockFontSize] : fitCandidates(slot);
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
      await nextFrame();
      continueRender(handle);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Assert every frame once fit has settled.
  useLayoutEffect(() => {
    const gate = gateRef.current;
    if (!gate || !ready) return;
    const textEl = (gate.firstElementChild as HTMLElement | null) ?? gate;

    if (frame < settledAt) {
      // Entrance window: the drawn box (entrance transforms included) must
      // stay inside the safe zones. Render-viewport contract: viewport ==
      // composition, so the rect is already in composition coordinates.
      const rect = gate.getBoundingClientRect();
      const drawn: Box = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      if (!boxWithin(drawn, SAFE_BOX, EPS)) {
        fail(
          FIT_REASONS.safeZoneBreach,
          { width: drawn.width, height: drawn.height },
          { width: SAFE_BOX.width, height: SAFE_BOX.height },
          fontSize,
          inkRef.current,
        );
      }
      return;
    }

    // Settled: text (ink-inflated) ∪ annotation drawn bounds ⊆ content box.
    const rect = gate.getBoundingClientRect();
    const scale = gate.offsetWidth > 0 ? rect.width / gate.offsetWidth : 1;
    const contentBox: Box = {
      x: rect.left / scale,
      y: rect.top / scale,
      width: gate.offsetWidth,
      height: gate.offsetHeight,
    };
    const ink = inkRef.current;
    const tr = textEl.getBoundingClientRect();
    const textBox = inflate(
      { x: tr.left / scale, y: tr.top / scale, width: tr.width / scale, height: tr.height / scale },
      ink,
    );
    const boxes: Box[] = [textBox];
    const svg = gate.querySelector("svg") as SVGSVGElement | null;
    if (svg && typeof svg.getBBox === "function") {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const corners = toCompositionCoords(
          cornersFromBBox(svg.getBBox()).map((c) => transformCorner(c, ctm)),
          scale,
        );
        boxes.push(inflate(bboxFromCorners(corners), strokePaintMarginOf(svg)));
      }
    }
    const union = unionBox(boxes);
    if (!boxWithin(union, contentBox, EPS)) {
      fail(
        boxWithin(textBox, contentBox, EPS)
          ? FIT_REASONS.annotationOutOfSlot
          : FIT_REASONS.textOutOfSlot,
        { width: union.width, height: union.height },
        { width: contentBox.width, height: contentBox.height },
        fontSize,
        ink,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, ready, fontSize]);

  return (
    <div
      ref={gateRef}
      data-text-slot={slotId}
      data-text-field={field}
      style={{ width: contentWidth, position: "relative" }}
    >
      {children(fontSize)}
    </div>
  );
};
