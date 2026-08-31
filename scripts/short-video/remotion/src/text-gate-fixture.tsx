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
 *   entrance-breach    2× entrance scale at frame 0 leaves SAFE_ZONES → FAIL
 *
 * Spec: spec-text-overflow-hardening.md § T4 Implementation Refinement,
 * decisions 18, 36.
 */
import React, { useLayoutEffect, useRef, useState } from "react";
import { Composition, interpolate, registerRoot, useCurrentFrame } from "remotion";
import { Circle } from "@remotion/rough-notation";
import { BRAND_FONT_STACK, FPS } from "./components/shared";
import { TextGate } from "./components/text-gate";

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

/** A promise that never settles — simulates fonts that never become ready. */
const NEVER_READY = new Promise<never>(() => {});

type FixtureProps = { scenario?: string };

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

/** Centered stage inside the safe zones, brand background. */
const Stage: React.FC<{
  children: React.ReactNode;
  scale?: number;
}> = ({ children, scale = 1 }) => (
  <div style={{ position: "absolute", inset: 0, background: "#101014" }}>
    <div
      style={{
        position: "absolute",
        left: 160,
        top: 700,
        transform: `scale(${scale})`,
        transformOrigin: "center",
      }}
    >
      {children}
    </div>
  </div>
);

const FixtureScene: React.FC<FixtureProps> = ({ scenario = "pass" }) => {
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
    const scale = interpolate(frame, [0, 30], [2, 1], { extrapolateRight: "clamp" });
    return (
      <Stage scale={scale}>
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
