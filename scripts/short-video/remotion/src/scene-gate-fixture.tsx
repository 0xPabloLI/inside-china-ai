/**
 * Scene gate fixture composition (T5).
 *
 * Dedicated entry point with its own registerRoot — Root.tsx is never
 * touched. Driven by __tests__/scene-gate-render.test.mjs via `remotion
 * still` to prove the nine gated scene templates (plus fullscreen) against a
 * real Chromium render runtime.
 *
 * Scenarios (spec scenario matrix #29–#37):
 *   baseline-hook … baseline-fullscreen  #35 legal copy at contract sizes PASS
 *   baseline-narrative                   doubles as F2 (#30): s9 copy + Fit on
 *   f1-lock56                            #29 s9 copy + lockFontSize 56 → FAIL
 *   f3-floor                             #31 over-long copy FAILs at minSize
 *   unknown-field                        #32 typo'd texts key fails the render
 *   unknown-visualtype                   #37 dispatch throws, no silent fallback
 *   empty-fields                         #34 empty strings/arrays → no false fail
 *   measure:<scene>                      T5 Ticket D: legal copy renders, then
 *                                         the probe emits each slot's measured
 *                                         constraint width via a TextFitError
 *                                         payload and cancels the render
 *
 * F1/F2/F3 hard-code the ORIGINAL s9 copy of the qwen4-preview pack (git
 * eb48293, decision 48) — the exact scene that shipped clipped text. The
 * `highlight` field stays: rough-notation forces nowrap, which is what makes
 * width overflow visible to Fit (annotationPolicy of the result field). On
 * the auto-height media-overlay band that nowrap drives the ladder all the
 * way to the 40px floor, where Fit fails structured (F3). The wrapping
 * variant of over-long copy failing on a FIXED-HEIGHT container has its own
 * coverage in the T4 render suite (container-overflow there).
 *
 * Baselines render through ShortVideo so dispatch + field validation are
 * exercised too; F1/F3 render NarrativeScene directly to use the fixture-only
 * gateOverrides seam.
 */
import React, { useEffect, useState } from "react";
import { Composition, cancelRender, delayRender, registerRoot } from "remotion";
import { SAFE_ZONES, CANVAS } from "../../lib/safe-zones.mjs";
import { FPS } from "./components/shared";
import { ShortVideo } from "./ShortVideo";
import { NarrativeScene } from "./scenes/NarrativeScene";
import type { SceneData } from "./types";

/** s9 "loop-closure" texts, verbatim from qwen4-preview scene-data (eb48293). */
const S9_TEXTS = {
  badge: "LOOP CLOSURE",
  company: "REMEMBER 6B PARAMS?",
  action: "CAPACITY GROWTH, COMPUTE FLAT",
  result: "THAT'S THE WHOLE POINT",
  highlight: "POINT",
  context: "51B EMBEDDINGS SIT IN REGULAR RAM, NOT VRAM",
  source: "CHINA AI NEWS ANALYSIS",
};

const S9_SCENE: SceneData = {
  id: 9,
  name: "loop-closure",
  visualType: "narrative",
  layout: "media-overlay",
  voiceover:
    "Remember 6 billion? That tiny active footprint is the whole point. Capacity without the compute bill.",
  texts: S9_TEXTS,
};

/**
 * F3 shape: same scene, but the result copy no longer fits at the 40px
 * floor — the highlight's nowrap keeps the full width in one line, so the
 * ladder exhausts itself and Fit fails structured at minSize.
 */
const F3_SCENE: SceneData = {
  ...S9_SCENE,
  texts: {
    ...S9_TEXTS,
    result:
      "THAT'S THE WHOLE POINT OF THE ENTIRE ANNOUNCEMENT AND EVERYTHING WE COVERED IN THIS BRIEFING",
  },
};

/** Legal-copy baselines, one scene per template (#35). */
const BASELINE_SCENES: Record<string, SceneData> = {
  "baseline-hook": {
    id: 1,
    visualType: "hook",
    voiceover: "hook",
    texts: {
      badge: "BREAKING ANALYSIS",
      subject: "QWEN3.8 FLASH",
      color: "amber",
      bigNumber: "6B",
      numberLabel: "ACTIVE PARAMS",
      numberHighlight: "PARAMS",
      stats: [
        { num: "51B", unit: "EMBD", label: "IN RAM" },
        { num: "6B", unit: "ACTIVE", label: "PARAMS" },
        { num: "480B", unit: "TOTAL", label: "DENSE" },
      ],
      source: "CHINA AI NEWS",
    },
  },
  "baseline-narrative": S9_SCENE,
  // qwen4 s9's real shape since the T7 relayout: same texts, stacked-cards.
  // Exercises the badge slot end to end (decision 65).
  "baseline-narrative-stacked": { ...S9_SCENE, layout: "stacked-cards" },
  "baseline-stat-reveal": {
    id: 3,
    visualType: "stat-reveal",
    voiceover: "stat reveal",
    texts: {
      bigNumber: "51B",
      label: "EMBEDDINGS IN RAM",
      subtext: "NOT VRAM",
      source: "HF MODEL CARD",
    },
  },
  "baseline-cta": {
    id: 4,
    visualType: "cta",
    voiceover: "cta",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "THE SIGNAL IN THE NOISE",
      action: "FOLLOW FOR THE NEXT DROP",
      topic: "QWEN4 WATCH",
    },
  },
  "baseline-quote": {
    id: 5,
    visualType: "quote",
    voiceover: "quote",
    texts: {
      quote: "CAPACITY WITHOUT THE COMPUTE BILL",
      source: "FILING ANALYSIS",
      verified: "VERIFIED SOURCE",
    },
  },
  "baseline-context": {
    id: 6,
    visualType: "context",
    voiceover: "context",
    texts: {
      badge: "CONTEXT",
      title: "DEEPSEEK ",
      titleHighlight: "TENCENT CLOUD",
      context: "51B EMBEDDINGS IN REGULAR RAM",
      detail: "NO VRAM REQUIRED FOR INFERENCE",
    },
  },
  "baseline-contrast": {
    id: 7,
    visualType: "contrast",
    voiceover: "contrast",
    texts: {
      title: "TWO PATHS TO HUMANOIDS",
      vs: "VS",
      left: ["REAL ROBOT SHIPPING", "FULL STACK HARDWARE"],
      right: ["DEMO FIRST ENERGY", "CONSUMER HYPE CYCLE"],
      note: "SAME YEAR, DIFFERENT BET",
      noteHighlight: "DIFFERENT",
    },
  },
  "baseline-data": {
    id: 8,
    visualType: "data",
    voiceover: "data",
    texts: {
      stat: "8,288×",
      statLabel: "OVERSUBSCRIBED",
      subtext: "IPO DEMAND VS SUPPLY",
      source: "EXCHANGE FILINGS",
    },
  },
  "baseline-info-card": {
    id: 9,
    visualType: "info-card",
    voiceover: "info card",
    texts: {
      title: "UNITREE IN NUMBERS",
      subtitle: "THE SCALE BEHIND THE DEMO",
      points: ["8,288 TIMES OVERSUBSCRIBED", "51B EMBEDDINGS IN RAM", "6B ACTIVE PARAMS"],
    },
  },
  "baseline-fullscreen": {
    id: 10,
    visualType: "fullscreen",
    voiceover: "fullscreen",
    media: {
      type: "image",
      path: "assets/ai-robot-hand.jpg",
      mode: "fullscreen",
      animation: "none",
      source: "PEXELS / MART PRODUCTION",
    },
  },
};

/** #32: a typo'd texts key must fail the render, not silently drop. */
const UNKNOWN_FIELD_SCENE: SceneData = {
  ...S9_SCENE,
  texts: { ...S9_TEXTS, compny: "TYPO FIELD" },
};

/**
 * Rendered-field contract (T9): a scene whose rendered fields are absent
 * fails validation instead of shipping a hollow template. stacked-cards
 * promises company/context/action/result; company is missing here.
 */
const MISSING_RENDERED_SCENE: SceneData = {
  ...S9_SCENE,
  layout: "stacked-cards",
  texts: {
    badge: "LOOP CLOSURE",
    action: "CAPACITY GROWTH, COMPUTE FLAT",
    result: "THAT'S THE WHOLE POINT",
    highlight: "POINT",
    context: "51B EMBEDDINGS SIT IN REGULAR RAM, NOT VRAM",
    source: "CHINA AI NEWS ANALYSIS",
  },
};

/** #37: an unregistered visualType must throw at dispatch. */
const UNKNOWN_TYPE_SCENE: SceneData = {
  id: 1,
  visualType: "mystery",
  voiceover: "unknown",
  texts: { title: "HELLO" },
};

/** #34: empty optional values render nothing and must not false-positive. */
const EMPTY_FIELDS_SCENE: SceneData = {
  id: 1,
  visualType: "contrast",
  voiceover: "empty",
  texts: { title: "PICK YOUR SIDE", vs: "", left: [], right: [] },
};

/**
 * Ticket D (decision 43): short legal copy, no highlights — every slot fits at
 * its preferred size in the NARROWEST layout (media-split's column), so the
 * gates never fail while the probe collects the constraint widths. Field
 * sets mirror each layout's declared contract fields: no `badge` outside
 * media-overlay, no `context` in media-bottom-bar (it never renders there).
 */
const MEASURE_NARRATIVE_TEXTS = {
  company: "ACME LABS",
  action: "SHIPS IT",
  result: "IT WORKS",
  context: "SMALL CONTEXT",
  source: "SOURCE",
};

/** Narrative layout variants the baselines never render. */
const MEASURE_LAYOUT_SCENES: Record<string, SceneData> = {
  "narrative-media-bottom-bar": {
    id: 11,
    visualType: "narrative",
    layout: "media-bottom-bar",
    voiceover: "measure",
    texts: {
      company: MEASURE_NARRATIVE_TEXTS.company,
      action: MEASURE_NARRATIVE_TEXTS.action,
      result: MEASURE_NARRATIVE_TEXTS.result,
      source: MEASURE_NARRATIVE_TEXTS.source,
    },
  },
  "narrative-media-split": {
    id: 12,
    visualType: "narrative",
    layout: "media-split",
    voiceover: "measure",
    texts: MEASURE_NARRATIVE_TEXTS,
  },
  "narrative-stacked-cards": {
    id: 13,
    visualType: "narrative",
    layout: "stacked-cards",
    voiceover: "measure",
    texts: { ...MEASURE_NARRATIVE_TEXTS, badge: "MEASURE" },
  },
};

/** measure:<key> → the scene whose slots it measures. */
const MEASURE_SCENES: Record<string, SceneData> = {
  ...Object.fromEntries(
    Object.entries(BASELINE_SCENES).map(([key, scene]) => [key.replace(/^baseline-/, ""), scene]),
  ),
  ...MEASURE_LAYOUT_SCENES,
};

/**
 * Width a slot's surroundings actually grant it. Walks from the gate up
 * through the ancestors, accumulating every layer's horizontal decoration
 * (padding + border + margin — even non-container layers like cards and
 * entrance wrappers take width away from the gate). A [data-text-container]
 * whose content box fits the gate PLUS what the crossed layers consume is an
 * independent constraint (available = its content width minus that). The
 * comparison must be ≥, not >: a gate whose contract width exactly equals
 * its band's content box (the media-overlay bottom band) IS constrained by
 * it. No constraining container → the SAFE-band width (1080 − 60 − 200)
 * minus the decorations. Content-box semantics match the gate's container
 * assert (clientWidth minus padding).
 */
function availableWidthFor(gate: HTMLElement): number {
  const fallback = CANVAS.width - SAFE_ZONES.left - SAFE_ZONES.right;
  const gateWidth = gate.offsetWidth;
  let spent = 0;
  let node = gate.parentElement;
  while (node instanceof HTMLElement) {
    const style = getComputedStyle(node);
    const padL = Number.parseFloat(style.paddingLeft) || 0;
    const padR = Number.parseFloat(style.paddingRight) || 0;
    const decoration =
      padL +
      padR +
      (Number.parseFloat(style.borderLeftWidth) || 0) +
      (Number.parseFloat(style.borderRightWidth) || 0) +
      (Number.parseFloat(style.marginLeft) || 0) +
      (Number.parseFloat(style.marginRight) || 0);
    if (
      node.hasAttribute("data-text-container") &&
      node.clientWidth - padL - padR >= gateWidth + spent
    ) {
      return Math.round(node.clientWidth - padL - padR - spent);
    }
    spent += decoration;
    node = node.parentElement;
  }
  return Math.round(fallback - spent);
}

/**
 * Measurement harness (Ticket D). Waits until every gate has settled (fonts
 * ready, annotation SVGs mounted, widths stable across three samples), then
 * emits each slot's constraint width. remotion still has no page-evaluate
 * channel, so the data rides out on the verified TextFitError payload: the
 * probe throws one with reason "measurement" and cancels the render; the
 * driver script parses the JSON from stderr.
 */
const MeasureProbe: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collecting, setCollecting] = useState(false);
  const [handle] = useState(() => delayRender("measure probe"));

  useEffect(() => {
    if (collecting) return;
    let cancelled = false;
    (async () => {
      await document.fonts.ready;
      const deadline = Date.now() + 10_000;
      const recent: number[] = [];
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const gates = Array.from(document.querySelectorAll("[data-text-slot]")) as HTMLElement[];
        if (gates.length === 0) continue;
        // Constraint widths depend only on the containers + the gates' fixed
        // content widths, so three stable samples (post fonts.ready) are the
        // settle signal — annotation SVGs and font sizes do not move layout.
        const settled = gates.every((g) => g.offsetWidth > 0);
        if (!settled) continue;
        recent.push(gates.reduce((sum, g) => sum + g.offsetWidth, 0));
        if (recent.length > 3) recent.shift();
        if (recent.length === 3 && recent.every((w) => w === recent[0])) {
          // The render must stay pending until the collecting render throws —
          // without the handle remotion captures the still before the timer
          // fires and the payload never leaves the page.
          setCollecting(true);
          return;
        }
      }
      throw cancelRender(new Error("measure probe: gates never settled within 10s"));
    })().catch((err) => {
      if (!cancelled) throw cancelRender(err instanceof Error ? err : new Error(String(err)));
    });
    return () => {
      cancelled = true;
    };
  }, [collecting]);

  if (collecting) {
    const gates = Array.from(document.querySelectorAll("[data-text-slot]")) as HTMLElement[];
    const measuredWidths: Record<string, number> = {};
    for (const gate of gates) {
      measuredWidths[gate.dataset.textSlot ?? "unknown"] = availableWidthFor(gate);
    }
    // Same first-line JSON shape as TextFitError (cancelRender only surfaces
    // the message's first line); `measuredWidths` is the measurement channel.
    throw cancelRender(
      new Error(`[TextFitError] ${JSON.stringify({ reason: "measurement", measuredWidths })}`),
    );
  }

  return <>{children}</>;
};

type FixtureProps = { scenario?: string };

const FixtureScene: React.FC<FixtureProps> = ({ scenario = "baseline-narrative" }) => {
  // F1 shape: the incident replay — original copy at a locked 56px (Fit off).
  if (scenario === "f1-lock56") {
    return (
      <NarrativeScene
        scene={S9_SCENE}
        duration={4}
        contentDir=""
        gateOverrides={{ "narrative.media-overlay.result": { lockFontSize: 56 } }}
      />
    );
  }
  // F3 shape: copy that cannot fit even at the 40px floor.
  if (scenario === "f3-floor") {
    return <NarrativeScene scene={F3_SCENE} duration={4} contentDir="" />;
  }
  if (scenario === "unknown-field") {
    return <ShortVideo scenes={[UNKNOWN_FIELD_SCENE]} audioPaths={[]} durations={[4]} />;
  }
  if (scenario === "missing-rendered") {
    return <ShortVideo scenes={[MISSING_RENDERED_SCENE]} audioPaths={[]} durations={[4]} />;
  }
  if (scenario === "unknown-visualtype") {
    return <ShortVideo scenes={[UNKNOWN_TYPE_SCENE]} audioPaths={[]} durations={[4]} />;
  }
  if (scenario === "empty-fields") {
    return <ShortVideo scenes={[EMPTY_FIELDS_SCENE]} audioPaths={[]} durations={[4]} />;
  }
  // Two-scene composition: hook → narrative uses slide(from-right), so during
  // the 10-frame overlap the entering scene is translated. Exercises the
  // entrance assert's scene-motion exemption (real pipeline false-positive).
  if (scenario === "transition-slide") {
    return (
      <ShortVideo
        scenes={[BASELINE_SCENES["baseline-hook"], S9_SCENE]}
        audioPaths={[]}
        durations={[0.6, 4]}
      />
    );
  }
  if (scenario.startsWith("measure:")) {
    const scene = MEASURE_SCENES[scenario.slice("measure:".length)];
    if (!scene) {
      throw new Error(`Unknown measure scene: ${scenario.slice("measure:".length)}`);
    }
    return (
      <MeasureProbe>
        <ShortVideo scenes={[scene]} audioPaths={[]} durations={[4]} />
      </MeasureProbe>
    );
  }
  const scene = BASELINE_SCENES[scenario];
  if (!scene) {
    throw new Error(`Unknown scene-gate fixture scenario: ${scenario}`);
  }
  return <ShortVideo scenes={[scene]} audioPaths={[]} durations={[4]} />;
};

export const SceneGateFixtureRoot: React.FC = () => (
  <Composition
    id="SceneGateFixture"
    component={FixtureScene as unknown as React.FC<Record<string, unknown>>}
    durationInFrames={150}
    fps={FPS}
    width={1080}
    height={1920}
    defaultProps={{ scenario: "baseline-narrative" }}
  />
);

registerRoot(SceneGateFixtureRoot);
