/**
 * Render-layer integration tests for the TextGate (T4).
 *
 * Vitest runs in a node environment with no access to the remotion workspace's
 * node_modules, so these tests drive the real render runtime the way the
 * pipeline does: the still driver (`remotion-still.mjs`) against a dedicated fixture entry
 * (remotion/src/text-gate-fixture.tsx, its own registerRoot — Root.tsx is
 * never touched). FAIL scenarios assert the TextFitError JSON payload that
 * cancelRender surfaces on the message's first line; PASS scenarios assert a
 * clean exit.
 *
 * Scenario forms (spec refinement decision 36): pass baseline, fixed-size
 * overflow (F1 shape), Fit shrink (F2 shape), minSize floor (F3 shape),
 * annotation drawn-bound overflow (F4 shape), ink-only overflow (F9 runtime
 * shape), font-load timeout (#24/#27), #576 reveal line-box geometry
 * (hook-reveal-geometry-probe).
 */
import { renderStill } from "./remotion-still.mjs";
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { ANNOTATION_OVERDRAW_BY_TYPE } from "../lib/text-geometry.mjs";
import { SLOT_FIELDS } from "../lib/text-slots.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REMOTION_DIR = resolve(__dirname, "..", "remotion");
const ENTRY = "src/text-gate-fixture.tsx";
const COMPOSITION = "TextGateFixture";

/**
 * Run one still render of the fixture with the given scenario props.
 * Returns { ok, payload } — payload is the parsed TextFitError JSON when the
 * gate cancelled the render, otherwise null. Settled-frame asserts need a
 * frame ≥ settledFrame (40); entrance asserts run at frame 0.
 */
async function renderFixture(props, frame = 45) {
  const out = join(mkdtempSync(join(tmpdir(), "t4-gate-")), "still.png");
  try {
    await renderStill({
      entry: ENTRY,
      composition: COMPOSITION,
      output: out,
      props: props,
      frame,
      timeout: 240_000,
    });
    return { ok: true, payload: null };
  } catch (err) {
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    const match = /\[TextFitError\] (\{.*\})/.exec(text);
    return { ok: false, payload: match ? JSON.parse(match[1]) : null, raw: text };
  }
}

/**
 * Probe variant: fixture scenarios that cancelRender with a custom
 * `[Tag] {json}` payload instead of a TextFitError.
 */
async function renderProbe(props, tag, frame = 45) {
  const out = join(mkdtempSync(join(tmpdir(), "t4-gate-")), "still.png");
  try {
    await renderStill({
      entry: ENTRY,
      composition: COMPOSITION,
      output: out,
      props: props,
      frame,
      timeout: 240_000,
    });
    return { ok: true, payload: null, raw: "" };
  } catch (err) {
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    const match = new RegExp(`\\[${tag}\\] (\\{.*\\})`).exec(text);
    return { ok: false, payload: match ? JSON.parse(match[1]) : null, raw: text };
  }
}

// One bundle + browser startup per still adds up; keep the file patient.
const GATE_TIMEOUT = 300_000;

describe(
  "TextGate render-layer behaviour (real Chromium via remotion still)",
  { timeout: GATE_TIMEOUT },
  () => {
    it("PASS baseline: legal copy fits at preferred size", async () => {
      const { ok, raw } = await renderFixture({ scenario: "pass" });
      expect(ok, raw).toBe(true);
    });

    it("F1 shape: fixed size bypassing Fit + overflowing copy FAILs (old gate would PASS)", async () => {
      const { ok, payload, raw } = await renderFixture({ scenario: "fixed-overflow" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("fit-bottom");
      expect(payload.slotId).toBe("narrative.media-overlay.result");
      expect(payload.field).toBe("result");
      expect(payload.fontSize).toBe(56);
      expect(payload.measured.width).toBeGreaterThan(payload.available.width);
    });

    it("F2 shape: same copy with Fit enabled shrinks to fit and renders", async () => {
      const { ok, raw } = await renderFixture({ scenario: "fit-shrink" });
      expect(ok, raw).toBe(true);
    });

    it("F3 shape: copy too long even at minSize FAILs with structured error, no ×0.9 escape", async () => {
      const { ok, payload, raw } = await renderFixture({ scenario: "floor-fail" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("fit-bottom");
      // #688 raised the result floor 40 -> 46; read it from the contract so
      // the next size change cannot leave a stale value pinned here.
      expect(payload.fontSize).toBe(SLOT_FIELDS.result.minSize);
    });

    it("F4 shape: annotation drawn bounds beyond the slot content box FAILs", async () => {
      const { ok, payload, raw } = await renderFixture({ scenario: "annotation-overhang" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("annotation-out-of-slot");
    });

    it("decision 67a: expectAnnotation gate whose SVG never mounts FAILs (no fail-open)", async () => {
      const { ok, payload, raw } = await renderFixture({ scenario: "annotation-missing" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("annotation-missing");
    });

    it("ink-only overflow: layout metrics pass but glyph ink extends outside → FAIL", async () => {
      const { ok, payload, raw } = await renderFixture({ scenario: "ink-overhang" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("fit-bottom");
      // Ink is what trips it: the layout box itself fit.
      const inkTotal =
        payload.inkPad.left + payload.inkPad.right + payload.inkPad.top + payload.inkPad.bottom;
      expect(inkTotal).toBeGreaterThan(0);
    });

    it("decision 67b: multiline node is measured per rendered line, not as one string", async () => {
      // Counterproof shape: `HHHHHHHHHH\nffffff` (italic, pre-line). The OLD
      // whole-node measureText() collapsed the node to a single canvas line,
      // so line 2's LEADING italic-f overhang was invisible (left ≈ 0 — this
      // test was red against it). The per-line implementation reports it.
      const { payload, raw } = await renderProbe({ scenario: "ink-line-probe" }, "InkLineProbe");
      expect(payload, raw).toBeTruthy();
      expect(payload.multiline.perLine.left, raw).toBeGreaterThan(3);
      // Live counterproof pin: the whole-node formula shipped alongside still
      // collapses the node to one canvas line — it must keep reporting ≈0
      // left overhang, proving the test discriminates the two implementations.
      expect(payload.multiline.wholeNode.left, raw).toBeLessThan(payload.multiline.perLine.left);
      // The trailing line's right overhang stays detected (both eras saw it).
      expect(payload.multiline.perLine.right, raw).toBeGreaterThan(0);
    });

    it("decision 67b: mixed-span line measures each style run's ink", async () => {
      // "WWW" (normal) + "ffffff" (italic) on ONE line, separate spans →
      // separate style runs. The italic f run's right overhang must surface
      // through the union across runs.
      const { payload, raw } = await renderProbe({ scenario: "ink-line-probe" }, "InkLineProbe");
      expect(payload, raw).toBeTruthy();
      expect(payload.mixedSpan.perLine.right, raw).toBeGreaterThan(0);
    });

    it("T10 F9: italic T's right ink overhang is detected", async () => {
      // Second F9 glyph shape (spec row #10: "Times italic f / T"): the
      // italic T's top arm reaches past the advance width — measured 7.9px
      // at 96px. The old clamping formula only missed LEFT overhangs; this
      // pins the right-edge detection stays live for the T shape.
      const { payload, raw } = await renderProbe({ scenario: "ink-line-probe" }, "InkLineProbe");
      expect(payload, raw).toBeTruthy();
      expect(payload.italicT.perLine.right, raw).toBeGreaterThan(5);
    });

    it("T10 F9: letter-spaced run reports no phantom ink overhang", async () => {
      // Trailing letter-space is advance, not ink: the synced measurement
      // must report 0 on every edge. This goes red if a future change makes
      // the canvas measurement double-count the spacing (false FAILs on
      // every letter-spaced slot).
      const { payload, raw } = await renderProbe({ scenario: "ink-line-probe" }, "InkLineProbe");
      expect(payload, raw).toBeTruthy();
      for (const edge of ["left", "right", "top", "bottom"]) {
        expect(payload.letterSpacing.perLine[edge], `letterSpacing.${edge}`).toBe(0);
      }
    });

    it("T10 F7: circle covering a neighbour slot FAILs structured (annotation-collision, ratio recorded)", async () => {
      // Pre-T10 Hook shape (Circle box="around") with the subject gate resting
      // inside the ellipse's lower half. The scene-level assert must FAIL —
      // Fit never shrinks to dodge a collision — and record WHICH target and
      // HOW MUCH of its text the circle covers (decision 7: per-target ratio,
      // no merged denominators).
      const { ok, payload, raw } = await renderFixture({ scenario: "f7-collision-fail" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("annotation-collision");
      expect(payload.details.targetSlotId).toBe("hook.hero-center.subject");
      expect(payload.details.ratio).toBeGreaterThan(0.02);
      expect(payload.details.ratios["hook.hero-center.subject"]).toBe(payload.details.ratio);
    });

    it("T10 decision 70: per-type overdraw measured under the unified口径 stays within the tolerance map", async () => {
      // The probe measures every annotation family with the SAME geometry the
      // settled assert uses (annotationDrawnBox), against the host box. The
      // per-type tolerance map must cover the measured maxima — the circle
      // entry is load-bearing (the ellipse really pokes out), the default
      // covers underline/highlight.
      const { payload, raw } = await renderProbe(
        { scenario: "annotation-overdraw-probe" },
        "AnnotationOverdrawProbe",
      );
      expect(payload, raw).toBeTruthy();
      for (const [key, sample] of Object.entries(payload)) {
        if (!sample.overdraw) continue; // e.g. highlight (fill-only paths, bbox 0)
        const tolerance = key.startsWith("circle")
          ? ANNOTATION_OVERDRAW_BY_TYPE.circle
          : ANNOTATION_OVERDRAW_BY_TYPE.default;
        for (const edge of ["left", "top", "right", "bottom"]) {
          expect(
            sample.overdraw[edge],
            `${key}.${edge}: ${sample.overdraw[edge]} > ${tolerance}`,
          ).toBeLessThanOrEqual(tolerance);
        }
      }
      // The measured overdraw is real, not vacuously inside the tolerance.
      expect(payload.circleAround.overdraw.top, raw).toBeGreaterThan(40);
      expect(payload.circleInside.overdraw.top, raw).toBeLessThanOrEqual(
        ANNOTATION_OVERDRAW_BY_TYPE.default,
      );
    });

    it("font timeout: fonts never ready → FAIL with reason font-timeout (no silent fallback)", async () => {
      const { ok, payload, raw } = await renderFixture({ scenario: "font-timeout" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("font-timeout");
    });

    it("entrance window: a slot resting below the safe zone breaches it at frame 0 → FAIL", async () => {
      // A bad REST position expressed in layout is the breach shape: entrance
      // transforms (StampIn/slide) converge to identity and are exempt, but
      // a slot whose layout rest sits below the safe zone must FAIL during
      // the entrance window — the settled drawn check owns it from settledFrame.
      const { ok, payload, raw } = await renderFixture({ scenario: "entrance-breach" }, 0);
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("safe-zone-breach");
    });

    it("late entrance: a flush rest box still translating at settledFrame does not false-positive", async () => {
      // Regression from the _gate-smoke pipeline run (contrast-6 right[1]):
      // the chip's SlideUp translate (30→0 over 60 frames) is still running
      // when the settled assert takes over at frame 40, and its rest bottom
      // is flush with the container bottom — any mid-motion frame overflows
      // the DRAWN container box while the REST geometry is legal. The settled
      // container assert polices layout boxes, so motion is invisible to it.
      const { ok, payload, raw } = await renderFixture({ scenario: "late-entrance" });
      expect(ok, raw).toBe(true);
      expect(payload).toBeNull();
    });

    it("T5: wrapping copy taller than its [data-text-container] FAILs (no hidden clipping)", async () => {
      const { ok, payload, raw } = await renderFixture({ scenario: "container-overflow" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("container-overflow");
      expect(payload.measured.height).toBeGreaterThan(payload.available.height);
    });

    it("T5: same copy inside a generous container still PASSes", async () => {
      const { ok, raw } = await renderFixture({ scenario: "container-pass" });
      expect(ok, raw).toBe(true);
    });

    it("#576: the claim reveal's Range rect sits inside its line box at the shipped line-height", async () => {
      // The ticket's defect was per-EDGE geometry: the Range rect (the font's
      // natural line box, ~1.107em) against the box the element's own
      // line-height lays out. Fit rejects a candidate when ANY edge pokes past
      // that box by more than EPS (0.5px), so both line-heights are pinned at
      // the preferred 80px — the only size the gate ever compares against,
      // since its content box is captured once at mount (the initial font size
      // is preferredSize, never a shrunk candidate).
      const at = async (lineHeight, copy, fontSize = 80) => {
        const { payload, raw } = await renderProbe(
          {
            scenario: "hook-reveal-geometry-probe",
            revealLineHeight: lineHeight,
            revealFontSize: fontSize,
            revealCopy: copy,
          },
          "HookRevealGeometryProbe",
        );
        expect(payload, raw).toBeTruthy();
        return payload;
      };

      // Shipped 1.1: zero poke on every edge, for the one-line and the wrapped
      // shape alike — the geometry behind the scene baselines' green renders,
      // and the constant this ticket changed (box = lines × 1.1 × 80px).
      for (const [copy, lines] of [
        ["ZERO KPIS", 1],
        ["4-HOUR LEAKED MEETING", 2],
      ]) {
        const probe = await at(1.1, copy);
        expect(probe.lineHeight, copy).toBe(1.1);
        expect(probe.box.height, copy).toBe(88 * lines);
        for (const edge of ["left", "right", "top", "bottom"]) {
          expect(probe.poke[edge], `${copy}.${edge}`).toBeLessThanOrEqual(0);
        }
        expect(probe.fits, copy).toBe(true);
      }

      // Pre-fix 1.05 at the same size: 2px of poke per vertical edge — above
      // EPS, so boxWithin rejected every candidate size and Fit bottomed out
      // at the 56px floor with the ticket's `fit-bottom` payload.
      const tight = await at(1.05, "ZERO KPIS");
      expect(tight.fits).toBe(false);
      expect(tight.poke.top).toBeGreaterThan(tight.eps);
      expect(tight.poke.bottom).toBeGreaterThan(tight.eps);

      // Boundary record: the 56px floor itself. The pipeline never measures
      // there (a wrapping reveal only ever shrinks for WIDTH, and the box it
      // is compared against stays the preferred-size one), but the engine
      // snaps the rect a whole pixel above a line box shorter than the
      // natural box — which EPS cannot absorb. Recorded so the floor is never
      // claimed clean, and so a future change to EPS or the line-height shows
      // up here as a number, not a surprise.
      const floor = await at(1.1, "ZERO KPIS", 56);
      expect(floor.fits).toBe(false);
      expect(floor.poke.top).toBe(1);
    });
  },
);
