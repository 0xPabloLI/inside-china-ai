/**
 * TextGate fixture composition (T4).
 *
 * Dedicated entry point with its own registerRoot — Root.tsx is never
 * touched. Driven by __tests__/text-gate-render.test.mjs via `remotion still`
 * to prove the gate against a real Chromium render runtime:
 *
 *   pass               legal copy fits at preferred size
 *   fixed-overflow     F1 shape: lockFontSize bypasses Fit → FAIL
 *   fit-shrink         F2 shape: Fit shrinks the same copy → PASS
 *   floor-fail         F3 shape: copy too long even at minSize → FAIL
 *   annotation-overhang F4 shape: circle drawn bounds leave the slot → FAIL
 *   ink-overhang       layout fits, glyph ink overhangs → FAIL
 *   font-timeout       fonts never ready → FAIL (no silent fallback)
 *   entrance-breach    slot resting below the safe zone breaches it during
 *                      the entrance window → FAIL
 *   late-entrance      entrance translate still running at settledFrame with
 *                      a flush rest box → PASS (layout assert is motion-blind)
 *   container-overflow T5: text taller than its [data-text-container] → FAIL
 *   container-pass     T5: same copy, generous container → PASS
 *   official-seed-probe T12: surface the official layout-utils fit seed AND
 *                      the real-geometry ground truth through the
 *                      cancelRender payload channel (remotion still does not
 *                      forward page console). Proves the seeded walk lands on
 *                      the same size the pre-T12 full ladder chose, and pins
 *                      the official extrapolation error (decision 57).
 *
 * Spec: spec-text-overflow-hardening.md § T4 Implementation Refinement,
 * decisions 18, 36; § T5 Implementation Refinement, decisions 44, 49;
 * § T12 Implementation, decisions 57, 63.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cancelRender, Composition, delayRender, interpolate, registerRoot, useCurrentFrame } from "remotion";
import { Circle } from "@remotion/rough-notation";
import { BRAND_FONT_STACK, FPS } from "./components/shared";
import { TextGate } from "./components/text-gate";
import { predictGateSeeds } from "./components/official-fit";
import {
  fitCandidatesFromSeed,
  minContainerSeed,
  officialSeedSize,
} from "../../lib/official-fit-kernel.mjs";
import { fitCandidates } from "../../lib/text-slots.mjs";

const SLOT_ID = "narrative.media-overlay.result";
const SCENE_ID = "fixture";

/** Fits at preferred 56px within the 756px content box. */
const COPY_FIT = "QWEN3 RELEASED";
/** ~24 chars: overflows at 56px, fits after shrinking (≥ minSize 40). */
const COPY_SHRINK = "QWEN3 IS THE WHOLE POINT";
/** ~48 chars: still overflows at the 40px floor → hard fail. */
const COPY_FLOOR = "THAT'S THE WHOLE POINT OF THE ANNOUNCEMENT TODAY";
/** Italic string whose glyph ink overhangs the advance box in Times. */
const COPY_INK = "ffffff";
const INK_SIZE = 140;

/** ~80 chars: wraps to several lines at 48px in a 600px gate. */
const COPY_WRAP =
  "THE WHOLE POINT OF THE ANNOUNCEMENT IS THAT CAPACITY GROWS WHILE COMPUTE STAYS FLAT";

/** A promise that never settles — simulates fonts that never become ready. */
const NEVER_READY = new Promise<never>(() => {});

type FixtureProps = { scenario?: string; probe?: ProbeSpec };

/**
 * T12 probe scenario spec. The probe renders `text` inside a `boxWidth`-wide
 * band at `preferredSize`, asks the official layout-utils path for its seed,
 * then walks the candidate ladder on REAL Chromium geometry to find the size
 * the gate would actually choose. Both numbers leave the browser through the
 * cancelRender payload (remotion still forwards stdout, not page console).
 */
type ProbeSpec = {
  text: string;
  boxWidth: number;
  preferredSize: number;
  minSize: number;
  letterSpacing?: string;
  wrap?: boolean;
  maxLines?: number;
};

const PROBE_EPS = 0.5;

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Laid-out text advance/ink union width inside `box`, in box-local units —
 * the same Range technique the gate uses (textExtentLocal), minus the
 * annotation handling a bare probe does not need.
 */
function probeTextWidth(box: HTMLElement): number {
  const range = document.createRange();
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  let minX = Infinity;
  let maxX = -Infinity;
  let node: Node | null = walker.nextNode();
  while (node) {
    if ((node.textContent ?? "").trim().length > 0) {
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        minX = Math.min(minX, r.left);
        maxX = Math.max(maxX, r.right);
      }
    }
    node = walker.nextNode();
  }
  if (!Number.isFinite(minX)) return 0;
  const boxRect = box.getBoundingClientRect();
  const scale = box.offsetWidth > 0 ? boxRect.width / box.offsetWidth : 1;
  return (maxX - minX) / scale;
}

/**
 * T12 probe: is the official seed the size the gate really picks?
 *
 * Walks the candidate ladder twice against real geometry — once in the
 * pre-T12 order (preferredSize down to minSize) and once in the seeded order
 * — and cancels the render with both results plus the raw prediction. The
 * test asserts the two walks agree (the seed changes probe count, never the
 * outcome) and that the prediction sits within one ladder step of the truth
 * (drift guard if @remotion/layout-utils changes its extrapolation).
 */
const OfficialSeedProbe: React.FC<{ spec: ProbeSpec }> = ({ spec }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    delayRender("official-fit probe");

    void (async () => {
      const box = boxRef.current;
      const textEl = textRef.current;
      if (!box || !textEl) {
        cancelRender(new Error('[OfficialFitProbe] {"error":"refs-not-mounted"}'));
        return;
      }
      await document.fonts.ready;
      await nextFrame();

      const available = box.offsetWidth;
      const slot = { preferredSize: spec.preferredSize, minSize: spec.minSize };

      const rawSeeds = predictGateSeeds({
        textEl,
        maxWidth: available,
        preferredSize: spec.preferredSize,
        maxLines: spec.maxLines ?? 1,
      });
      const raw = minContainerSeed(rawSeeds);
      const seed = officialSeedSize(raw ?? spec.preferredSize, slot);

      const widthAt = async (size: number): Promise<number> => {
        textEl.style.fontSize = `${size}px`;
        await nextFrame();
        return probeTextWidth(box);
      };
      const walk = async (order: number[]): Promise<{ size: number | null; probes: number }> => {
        let probes = 0;
        for (const size of order) {
          probes += 1;
          if ((await widthAt(size)) <= available + PROBE_EPS) return { size, probes };
        }
        return { size: null, probes };
      };

      // Old ladder first: it is the pre-T12 ground truth.
      const full = await walk(fitCandidates(slot));
      const seeded = await walk(fitCandidatesFromSeed(slot, seed));
      const widthAtSeed = await widthAt(seed);
      const widthAtTruth = full.size == null ? null : await widthAt(full.size);

      const payload = {
        text: spec.text,
        available,
        preferredSize: spec.preferredSize,
        minSize: spec.minSize,
        rawSeeds,
        seed,
        truth: full.size,
        truthProbes: full.probes,
        seeded: seeded.size,
        seededProbes: seeded.probes,
        widthAtSeed,
        widthAtTruth,
      };
      cancelRender(new Error(`[OfficialFitProbe] ${JSON.stringify(payload)}`));
    })();
  }, [spec]);

  return (
    <Stage>
      <div ref={boxRef} style={{ width: spec.boxWidth, position: "relative" }}>
        <div
          ref={textRef}
          style={{
            fontSize: spec.preferredSize,
            fontWeight: 900,
            fontFamily: BRAND_FONT_STACK,
            letterSpacing: spec.letterSpacing ?? "normal",
            whiteSpace: spec.wrap ? "normal" : "pre",
            color: "#fff",
          }}
        >
          {spec.text}
        </div>
      </div>
    </Stage>
  );
};

function textNode(fontSize: number, copy: string, italic = false): React.ReactNode {
  return (
    <div
      style={{
        fontSize,
        fontStyle: italic ? "italic" : "normal",
        fontWeight: 900,
        fontFamily: BRAND_FONT_STACK,
        whiteSpace: "pre",
        color: "#fff",
      }}
    >
      {copy}
    </div>
  );
}

/**
 * Centered stage inside the safe zones, brand background. `offsetY` shifts
 * the whole stage down through LAYOUT (top) — entrance-breach uses it to
 * rest a slot BELOW the safe-zone bottom. The entrance assert polices
 * transform-free layout boxes (entrance/scene transforms all converge to
 * identity and are exempt), so a bad REST position must be expressed in
 * layout to be caught during the entrance window.
 */
const Stage: React.FC<{
  children: React.ReactNode;
  offsetY?: number;
}> = ({ children, offsetY = 0 }) => (
  <div style={{ position: "absolute", inset: 0, background: "#101014" }}>
    <div
      style={{
        position: "absolute",
        left: 160,
        top: 700 + offsetY,
      }}
    >
      {children}
    </div>
  </div>
);

const FixtureScene: React.FC<FixtureProps> = ({ scenario = "pass", probe }) => {
  const frame = useCurrentFrame();

  if (scenario === "annotation-overhang") {
    const progress = interpolate(frame, [0, 30], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return (
      <Stage>
        <TextGate sceneId={SCENE_ID} slotId={SLOT_ID} expectAnnotation>
          {(fontSize) => (
            <Circle
              color="#f59e0b"
              strokeWidth={8}
              padding={{ left: 220, right: 220, top: 220, bottom: 220 }}
              progress={progress}
            >
              {textNode(fontSize, COPY_FIT)}
            </Circle>
          )}
        </TextGate>
      </Stage>
    );
  }

  if (scenario === "entrance-breach") {
    // The stage rests 400px too low (via layout, not transform): every
    // entrance-window frame lays the slot below SAFE_ZONES.bottom, which the
    // transform-free entrance assert must catch. Real entrance animations
    // only move through transforms that converge to identity — exempt — so a
    // layout-expressed bad rest position is the true failure shape.
    const progress = interpolate(frame, [0, 30], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return (
      <Stage offsetY={400 + progress * 40}>
        <TextGate sceneId={SCENE_ID} slotId={SLOT_ID}>
          {(fontSize) => textNode(fontSize, COPY_FIT)}
        </TextGate>
      </Stage>
    );
  }

  if (scenario === "font-timeout") {
    return (
      <Stage>
        <TextGate
          sceneId={SCENE_ID}
          slotId={SLOT_ID}
          fontTimeoutMs={300}
          extraFontsReady={NEVER_READY}
        >
          {(fontSize) => textNode(fontSize, COPY_FIT)}
        </TextGate>
      </Stage>
    );
  }

  if (scenario === "ink-overhang") {
    return <InkScenario />;
  }

  if (scenario === "official-seed-probe") {
    return (
      <OfficialSeedProbe
        spec={
          probe ?? {
            text: COPY_FIT,
            boxWidth: 756,
            preferredSize: 56,
            minSize: 40,
          }
        }
      />
    );
  }

  if (scenario === "late-entrance") {
    // Regression from the _gate-smoke pipeline run (contrast-6 right[1]): a
    // gate whose REST box sits flush inside its container while its entrance
    // translate (30→0 over 60 frames) is still running at settledFrame 40.
    // The drawn assert fires mid-motion (a false positive); the layout-based
    // settled assert sees the rest geometry and stays green.
    const slide = interpolate(frame, [0, 60], [30, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return (
      <Stage>
        <div data-text-container style={{ width: 600, height: 200, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              translate: `0 ${slide}px`,
            }}
          >
            <TextGate sceneId={SCENE_ID} slotId={SLOT_ID} slotWidth={600}>
              {(fontSize) => textNode(fontSize, COPY_FIT)}
            </TextGate>
          </div>
        </div>
      </Stage>
    );
  }

  if (scenario === "container-overflow" || scenario === "container-pass") {
    // Wrapping copy inside a fixed-height container: Fit only sees the gate's
    // own box (which grows with the text), so ONLY the container assert can
    // catch the vertical clipping that overflow:hidden would hide.
    const containerHeight = scenario === "container-overflow" ? 90 : 500;
    return (
      <Stage>
        <div
          data-text-container
          style={{ width: 600, height: containerHeight, overflow: "hidden" }}
        >
          <TextGate sceneId={SCENE_ID} slotId={SLOT_ID} slotWidth={600}>
            {(fontSize) => (
              <div
                style={{
                  fontSize,
                  fontWeight: 900,
                  fontFamily: BRAND_FONT_STACK,
                  whiteSpace: "normal",
                  color: "#fff",
                }}
              >
                {COPY_WRAP}
              </div>
            )}
          </TextGate>
        </div>
      </Stage>
    );
  }

  const copy =
    scenario === "pass" ? COPY_FIT : scenario === "fit-shrink" ? COPY_SHRINK : COPY_FLOOR;
  const lock = scenario === "fixed-overflow" ? 56 : undefined;
  return (
    <Stage>
      <TextGate sceneId={SCENE_ID} slotId={SLOT_ID} lockFontSize={lock}>
        {(fontSize) => textNode(fontSize, scenario === "fixed-overflow" ? COPY_FLOOR : copy)}
      </TextGate>
    </Stage>
  );
};

/**
 * Ink scenario: size the slot content box to EXACTLY the text's advance
 * width (measured via a hidden probe), so layout metrics pass while glyph
 * ink — italic Times `f` — still overhangs the box edges.
 */
const InkScenario: React.FC = () => {
  const probeRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (boxWidth == null && probeRef.current) {
      setBoxWidth(probeRef.current.scrollWidth);
    }
  }, [boxWidth]);

  if (boxWidth == null) {
    return (
      <div
        ref={probeRef}
        style={{
          position: "absolute",
          top: -9999,
          fontSize: INK_SIZE,
          fontStyle: "italic",
          fontWeight: 900,
          fontFamily: BRAND_FONT_STACK,
          whiteSpace: "pre",
        }}
      >
        {COPY_INK}
      </div>
    );
  }

  return (
    <Stage>
      <TextGate sceneId={SCENE_ID} slotId={SLOT_ID} lockFontSize={INK_SIZE} slotWidth={boxWidth}>
        {(fontSize) => textNode(fontSize, COPY_INK, true)}
      </TextGate>
    </Stage>
  );
};

export const TextGateFixtureRoot: React.FC = () => (
  <Composition
    id="TextGateFixture"
    component={FixtureScene as unknown as React.FC<Record<string, unknown>>}
    durationInFrames={60}
    fps={FPS}
    width={1080}
    height={1920}
    defaultProps={{ scenario: "pass" }}
  />
);

registerRoot(TextGateFixtureRoot);
