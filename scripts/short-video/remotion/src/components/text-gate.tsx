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
  inkOverhangsOfRun,
  cornersFromBBox,
  transformCorner,
  bboxFromCorners,
  toCompositionCoords,
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
  maxLines?: number;
  settledFrame: number;
  annotationPolicy: string;
};

const ZERO_PAD: Pad = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * Drawn-bound tolerance for rough-notation inside scene containers.
 * Measured from the T5 render runs: the Circle ellipse overdraws ~48px past
 * the Slot band edge at fontSize 240, the DataScene circle ~91px, and the
 * NarrativeScene highlight pad pushes ~6px past a band's clip edge. 64px
 * covers the ellipse family with margin for rough-notation's random
 * roughness offsets; a genuinely oversized annotation still trips
 * Fit (its text ⊆ slot) or container-overflow (gate box ⊆ container).
 */
const ANNOTATION_OVERDRAW = 64;

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
 */
function textExtentComposition(gate: HTMLElement): Box {
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
      if (wantsAnnotation) {
        let tries = 0;
        while (!gate.querySelector("svg") && tries < 30) {
          await nextFrame();
          tries += 1;
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
    let annotationBox: Box | null = null;
    if (svg && typeof svg.getBBox === "function") {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const corners = toCompositionCoords(
          cornersFromBBox(svg.getBBox()).map((c) => transformCorner(c, ctm)),
          scale,
        );
        annotationBox = inflate(bboxFromCorners(corners), strokePaintMarginOf(svg));
      }
    }

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
        // Annotation bounds: the content box plus the overdraw tolerance.
        // rough-notation deliberately draws outside its target box (ellipse
        // extent, highlight pad), and even a clipping container lets the ink
        // bleed into its padding before overflow:hidden cuts — a few px of
        // highlight fading at a band edge is cosmetic, while a genuinely
        // oversized annotation still fails Fit or container-overflow.
        const annotationBounds = inflate(containerBox, ANNOTATION_OVERDRAW);
        if (annotationBox && !boxWithin(annotationBox, annotationBounds, EPS)) {
          fail(
            FIT_REASONS.annotationOutOfSlot,
            { width: annotationBox.width, height: annotationBox.height },
            { width: annotationBounds.width, height: annotationBounds.height },
            fontSize,
            ink,
          );
        }
      }
    }
    // Annotation fallback: with no container ancestor the slot box is the only
    // bound on record, so the drawn annotation must stay inside it there.
    if (!containerEl && annotationBox && !boxWithin(annotationBox, contentBox, EPS)) {
      fail(
        FIT_REASONS.annotationOutOfSlot,
        { width: annotationBox.width, height: annotationBox.height },
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
      // display:block + auto margins: a full-width inline-block under
      // textAlign:center shifts right by half the parent's slack and
      // overflows its container (seen on quote.hero-center.verified).
      style={{ width: contentWidth, position: "relative", display: "block", margin: "0 auto" }}
    >
      {children(fontSize)}
    </div>
  );
};
