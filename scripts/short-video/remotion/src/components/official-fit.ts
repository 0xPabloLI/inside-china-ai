/**
 * Official layout-utils fit seed for the TextGate (T12, spec decisions
 * 57/63/64).
 *
 * Replaces the TextGate candidate generation's blind linear step-down with a
 * walk seeded by the official `@remotion/layout-utils` measurement:
 *
 *   - single-line text (white-space nowrap/pre, e.g. rough-notation targets
 *     and nowrap rows): official `fitText` (100px linear extrapolation);
 *   - single-line text with a FIXED px letter-spacing (the templates' -10px
 *     focus numbers, 1-4px labels): px spacing does not scale with font size,
 *     which breaks fitText's linear model — measured twice via official
 *     `measureText` (with and without spacing) and solved exactly by the
 *     kernel's `solveSingleLinePxLetterSpacing`;
 *   - wrapping text: official `fitTextOnNLines` (greedy word-wrap simulation,
 *     line cap from the slot contract's maxLines).
 *
 * The official output is ONLY a seed. `fitCandidatesFromSeed` reorders — never
 * trims — the same candidate lattice the old linear ladder walked, so the
 * TextGate's real-geometry terminal validation (Range rects + ink) keeps
 * deciding: an inaccurate prediction costs probes, never correctness.
 *
 * Boundaries honoured (spec decision 57 research + decision 64):
 *   - `validateFontIsLoaded` is NOT enabled: the brand Times stack has the
 *     same metrics as the fallback, so the official heuristic misfires. The
 *     TextGate's `document.fonts.ready` + timeout FAIL gate stays authoritative.
 *   - Official functions never verify their own result; verification lives in
 *     the gate (decision 58 untouched).
 *   - fitTextOnNLines tokenizes on spaces — Chinese copy would misjudge
 *     (#165, decision 60; current copy is English).
 *
 * Known approximations (all absorbed by the reordered lattice + terminal
 * validation): composite text measured per block container with the block's
 * own computed typography; px letter-spacing inside wrapping simulation not
 * corrected; CSS text-transform / font-variant-numeric not modelled (unused
 * in the templates).
 */
import { fitText, fitTextOnNLines, measureText } from "@remotion/layout-utils";
import { solveSingleLinePxLetterSpacing } from "../../../lib/official-fit-kernel.mjs";

/** fitText's own sampling size (official linear-extrapolation anchor). */
const PROBE_SIZE = 100;

const BLOCK_DISPLAYS = new Set([
  "block",
  "flow-root",
  "flex",
  "grid",
  "list-item",
  "table",
  "table-row",
]);

function isBlockDisplay(el: Element): boolean {
  return BLOCK_DISPLAYS.has(getComputedStyle(el).display);
}

function hasDirectText(el: HTMLElement): boolean {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * The block boxes whose text the gate sizes: block descendants that own text
 * directly (a gate may lay out several — statCard's nowrap number row above
 * its wrapping label), or the element itself when the text lives only in
 * inline wrappers (plain text, or rough-notation's inline-block pre span).
 */
function textContainers(root: HTMLElement): HTMLElement[] {
  const collect = (el: HTMLElement): HTMLElement[] => {
    if (hasDirectText(el)) return [el];
    const out: HTMLElement[] = [];
    for (const child of Array.from(el.children)) {
      if (isBlockDisplay(child)) out.push(...collect(child as HTMLElement));
    }
    return out;
  };
  const found = collect(root);
  if (found.length > 0) return found;
  return (root.textContent ?? "").trim().length > 0 ? [root] : [];
}

/**
 * Whether the container's text actually wraps. A container whose own text
 * nodes sit under inline `white-space: pre/nowrap` wrappers (rough-notation
 * wraps its target in one) is effectively single-line even though the
 * container's computed white-space is normal.
 */
function containerWraps(el: HTMLElement): boolean {
  const own = getComputedStyle(el).whiteSpace;
  if (own === "nowrap" || own === "pre") return false;
  if (hasDirectText(el)) return true;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const inner = node as HTMLElement;
    if (inner !== el && !isBlockDisplay(inner) && hasDirectText(inner)) {
      const ws = getComputedStyle(inner).whiteSpace;
      if (ws === "nowrap" || ws === "pre") return false;
    }
    node = walker.nextNode();
  }
  return true;
}

/** The container's horizontal decoration, subtracted from the slot width. */
function containerHorizontalDecoration(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const num = (v: string): number => Number.parseFloat(v) || 0;
  return (
    num(style.paddingLeft) +
    num(style.paddingRight) +
    num(style.borderLeftWidth) +
    num(style.borderRightWidth)
  );
}

/** Typography the official measurement must reproduce (probe-size agnostic). */
function typographyOf(el: HTMLElement): {
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  letterSpacing: string;
} {
  const style = getComputedStyle(el);
  return {
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    // Computed letter-spacing is always resolved px (or "normal").
    letterSpacing: style.letterSpacing === "normal" ? "0px" : style.letterSpacing,
  };
}

/**
 * Official prediction for ONE container, in the container's own font-size
 * units (convert to gate units by dividing by the container's font-size
 * ratio). Returns null when the container has no measurable text or the
 * model is degenerate — the caller then simply has one seed less.
 */
function predictContainer(
  el: HTMLElement,
  args: { maxWidth: number; preferredGateSize: number; fontRatio: number; maxLines: number },
): number | null {
  const text = (el.textContent ?? "").trim();
  if (!text) return null;
  const decoration = containerHorizontalDecoration(el);
  const maxWidth = args.maxWidth - decoration;
  if (!(maxWidth > 0)) return null;
  const typo = typographyOf(el);
  const common = {
    text,
    fontFamily: typo.fontFamily,
    fontWeight: typo.fontWeight,
    ...(typo.fontStyle !== "normal" ? { additionalStyles: { fontStyle: typo.fontStyle } } : {}),
  };

  if (!containerWraps(el)) {
    const lsPx = Number.parseFloat(typo.letterSpacing) || 0;
    if (lsPx !== 0) {
      // Fixed px spacing breaks the linear model (see module docstring):
      // measure the advance without spacing plus the spacing contribution,
      // and solve width(size) = advance(100)·size/100 + spacing exactly.
      const advance = measureText({ ...common, fontSize: PROBE_SIZE, letterSpacing: "0px" });
      const withSpacing = measureText({
        ...common,
        fontSize: PROBE_SIZE,
        letterSpacing: typo.letterSpacing,
      });
      return solveSingleLinePxLetterSpacing({
        adv100: advance.width,
        letterSpacingTotal: withSpacing.width - advance.width,
        maxWidth,
      });
    }
    // Verbatim official single-line fit (linear extrapolation from 100px).
    return fitText({ ...common, withinWidth: maxWidth, letterSpacing: typo.letterSpacing })
      .fontSize;
  }

  // Wrapping text: official greedy word-wrap simulation, capped at the
  // contract's line budget and at the contract's preferred size (the
  // official docs' "caller clamps" pattern).
  const fitted = fitTextOnNLines({
    text,
    maxLines: args.maxLines,
    maxBoxWidth: maxWidth,
    fontFamily: typo.fontFamily,
    fontWeight: typo.fontWeight,
    letterSpacing: typo.letterSpacing,
    maxFontSize: Math.max(1, args.preferredGateSize * args.fontRatio),
  });
  return fitted.fontSize;
}

/**
 * Official per-container predictions for one gate, in GATE font-size units
 * (what the TextGate ladder walks). The TextGate renders its initial
 * `preferredSize` before Fit runs, so a container's computed font-size over
 * the preferred size is exactly its scaling ratio — em-based sub-elements
 * (statCard's 0.5em unit, 0.36em label) convert correctly.
 *
 * An empty result means "no model" — the caller falls back to the unseeded
 * full ladder, which is byte-for-byte the pre-T12 behaviour.
 */
export function predictGateSeeds(args: {
  textEl: HTMLElement;
  maxWidth: number;
  preferredSize: number;
  maxLines: number;
}): number[] {
  const seeds: number[] = [];
  for (const el of textContainers(args.textEl)) {
    const fontSize = Number.parseFloat(getComputedStyle(el).fontSize);
    if (!Number.isFinite(fontSize) || fontSize <= 0) continue;
    const fontRatio = fontSize / args.preferredSize;
    if (!Number.isFinite(fontRatio) || fontRatio <= 0) continue;
    const predicted = predictContainer(el, {
      maxWidth: args.maxWidth,
      preferredGateSize: args.preferredSize,
      fontRatio,
      maxLines: args.maxLines,
    });
    if (predicted == null || !Number.isFinite(predicted) || predicted <= 0) continue;
    seeds.push(predicted / fontRatio);
  }
  return seeds;
}
