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
 *   f6-media-split-lock52                T10 F6: s5 copy in media-split at the
 *                                        shipped 52px → FAIL (clipped-text
 *                                        incident the old gate passed)
 *   unknown-field                        #32 typo'd texts key fails the render
 *   bad-highlight                        T8: highlight.text not a substring of
 *                                        its field fails validation
 *   unknown-visualtype                   #37 dispatch throws, no silent fallback
 *   empty-fields                         #34 empty strings/arrays → no false fail
 *   measure:<scene>                      T5 Ticket D: legal copy renders, then
 *                                         the probe emits each slot's measured
 *                                         constraint width via a TextFitError
 *                                         payload and cancels the render
 *
 * F1/F2/F3 hard-code the ORIGINAL s9 copy of the qwen4-preview pack (git
 * eb48293, decision 48) — the exact scene that shipped clipped text. T8 made
 * `highlight` structured ({ field, text }): only the named FRAGMENT gets the
 * rough-notation nowrap wrapper now. The old renderer wrapped the WHOLE field
 * in the annotation, and that whole-line nowrap is exactly what made width
 * overflow visible to Fit — so F1/F3/F6 replay the incident with the full
 * result line as the highlight fragment (a legal substring), preserving the
 * incident's geometry bit for bit. Partial fragments (the normal authoring
 * case, e.g. s9's "POINT") only nowrap their own span; the fitted baselines
 * and group-gate scenarios exercise that shape. The wrapping variant of
 * over-long copy failing on a FIXED-HEIGHT container has its own coverage in
 * the T4 render suite (container-overflow there).
 *
 * Baselines render through ShortVideo so dispatch + field validation are
 * exercised too; F1/F3 render NarrativeScene directly to use the fixture-only
 * gateOverrides seam.
 */
import React, { useEffect, useState } from "react";
import { Composition, cancelRender, delayRender, registerRoot } from "remotion";
import { SAFE_ZONES, CANVAS } from "../../lib/safe-zones.mjs";
import { SCENE_GATE_PHOTO } from "./fixture-media.mjs";
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
  highlight: { field: "result", text: "POINT" },
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
 * F1 shape (#29): the ORIGINAL s9 copy at the locked 56px it shipped with
 * (Fit off) — the incident replay. T8: the highlight fragment is the WHOLE
 * result line (a legal substring), so rough-notation's inline-block nowrap
 * keeps it on ONE line and the width overflow is visible to the gate. With a
 * partial fragment the plain runs would wrap and a locked 56px would be legal
 * (two lines inside the band) — that shape is the group-gate scenarios'.
 */
const F1_SCENE: SceneData = {
  ...S9_SCENE,
  texts: {
    ...S9_TEXTS,
    highlight: { field: "result", text: "THAT'S THE WHOLE POINT" },
  },
};

/**
 * F3 shape: same scene, but the result copy no longer fits at the 40px
 * floor — the highlight fragment is the WHOLE result line (T8 structured
 * form), so rough-notation's nowrap keeps the full width in one line, the
 * ladder exhausts itself and Fit fails structured at minSize.
 */
const F3_SCENE: SceneData = {
  ...S9_SCENE,
  texts: {
    ...S9_TEXTS,
    result:
      "THAT'S THE WHOLE POINT OF THE ENTIRE ANNOUNCEMENT AND EVERYTHING WE COVERED IN THIS BRIEFING",
    highlight: {
      field: "result",
      text: "THAT'S THE WHOLE POINT OF THE ENTIRE ANNOUNCEMENT AND EVERYTHING WE COVERED IN THIS BRIEFING",
    },
  },
};

/**
 * F6 shape (T10): qwen4-preview s5's original copy, verbatim. T8: the
 * highlight fragment is the WHOLE result line, so rough-notation's pre/nowrap
 * wrapper still holds it on ONE line. Rendered in the media-split layout the
 * pack used before its T7 relayout. At the locked 52px the old pipeline
 * shipped, the line is far wider than the 372px column — the historical
 * clipped-text incident. The scene-level gate must FAIL where the old world
 * silently clipped.
 */
const F6_SCENE: SceneData = {
  id: 5,
  name: "training-cost",
  visualType: "narrative",
  layout: "media-split",
  voiceover: "Here's the number that stings. Training cost just one ninth of Qwen3.7-Plus.",
  texts: {
    company: "THE COST",
    action: "TRAINING COMPUTE VS QWEN3.7-PLUS (397B)",
    result: "1/9 THE TRAINING COST",
    highlight: { field: "result", text: "1/9 THE TRAINING COST" },
    context: "AND STRONGER ON CODING AND OFFICE TASKS",
    source: "SOURCE: Qwen official blog, Aug 26, 2026",
  },
};

const CONTRAST_SCENE: SceneData = {
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
};

/**
 * #761: the same copy with a bound ambient image. Before the wiring,
 * ContrastScene dropped `scene.media` entirely (the template never rendered a
 * media layer), so this pair is the render-level regression guard.
 *
 * #1093: the picture is generated by `__tests__/fixture-media.mjs` at suite
 * start (see `fixture-media.mjs`). It used to be a scraped Pexels photo, which
 * `.gitignore` keeps out of the repo — a clean checkout rendered a 404 instead
 * of a frame, so neither this suite nor `scene-gate-render` could run in CI.
 */
const CONTRAST_MEDIA_SCENE: SceneData = {
  ...CONTRAST_SCENE,
  media: {
    type: "image",
    path: SCENE_GATE_PHOTO,
    animation: "none",
    source: "PEXELS",
  },
};

/**
 * Media-led contain scene, declared BEFORE the BASELINE_SCENES literal so the
 * cover variant can spread it (a self-reference inside the literal is a TDZ
 * error). See the baseline-hook-media-led entries below.
 */
const MEDIA_LED_CONTAIN_SCENE: SceneData = {
  id: 30,
  visualType: "hook",
  layout: "media-led",
  voiceover: "hook",
  // A media-led hook carries the claim, so it is evidence by definition. The
  // fixture declares the role rather than `evidence: true` because its picture
  // is a synthetic testsrc2 chart with no provenance record.
  mediaRole: "evidence",
  media: {
    type: "image",
    path: SCENE_GATE_PHOTO,
    fit: "contain",
    animation: "none",
    source: "FIXTURE",
  },
  texts: {
    badge: "BREAKING ANALYSIS",
    subject: "QWEN3.8 FLASH",
    bigNumber: "-80%",
  },
};

/**
 * Synthetic daily bars for the native candle baseline (#1405).
 *
 * Deterministic on purpose: the fixture renders in CI without network access
 * and without the pack's baked file, so the shape has to come from arithmetic.
 * Four months of a peak-then-decline series — the same story the zhipu pack
 * tells — with one bar carrying `highlight` so the amber marker path renders.
 */
function candleFixtureRows() {
  const bars: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];
  const start = new Date("2026-06-01T00:00:00.000Z");
  let close = 1200;
  for (let index = 0; index < 40; index++) {
    const date = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
    const open = close;
    const drift = index < 10 ? 60 : index < 18 ? -55 : -12;
    close = Math.max(300, close + drift + Math.sin(index * 1.7) * 30);
    bars.push({
      date,
      open,
      high: Math.max(open, close) + 45,
      low: Math.min(open, close) - 40,
      close,
      volume: 1000000 + index * 1000,
    });
  }
  return bars;
}

const CANDLE_FIXTURE_ROWS = candleFixtureRows();

/** Media-led hook whose protagonist is a native candle chart (#1405). */
const MEDIA_LED_CANDLE_SCENE: SceneData = {
  id: 32,
  visualType: "hook",
  layout: "media-led",
  voiceover: "hook",
  info: {
    relationship: "change-over-time",
    chart: "candle",
    data: CANDLE_FIXTURE_ROWS,
    unit: "HK$",
    symbol: "HKEX:2513",
    dataFile: "data/fixture-daily.json",
    time: { from: "2026-06-01", to: "2026-07-10" },
    highlight: "2026-06-11",
    credit: "HKEX CLOSE VIA EASTMONEY · JUL 10",
  },
  texts: {
    badge: "HKEX LISTING",
    subject: "ZHIPU",
    bigNumber: "-85%",
  },
};

/** The cover variant: the same generated photo with `fit` omitted. */
const MEDIA_LED_COVER_MEDIA: NonNullable<SceneData["media"]> = {
  type: "image",
  path: SCENE_GATE_PHOTO,
  animation: "none",
  source: "FIXTURE",
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
  // Media-led hook (2026-11-15): the picture is the protagonist and the text
  // rows render in the zones the picture does not own. Both baselines spread
  // MEDIA_LED_CONTAIN_SCENE, which is declared ABOVE this literal — a
  // self-reference inside an object literal is a TDZ error, so the
  // declaration must stay above it.
  //
  // The contain case binds the generated testsrc2 photo at the 16:9 shape a
  // third-party chart source arrives in; the scene-gate pixel probe below
  // samples the strip corner and the band's bottom third to prove the text
  // strip is NOT drawn over the picture and that the picture is not dimmed by
  // the frame-level lane scrim. The cover case is the full-bleed variant of
  // the same generated photo (`fit` omitted → cover) — a render-OK baseline
  // like the other media baselines.
  "baseline-hook-media-led": MEDIA_LED_CONTAIN_SCENE,
  "baseline-hook-media-led-full": {
    ...MEDIA_LED_CONTAIN_SCENE,
    id: 33,
    // #1559: an image opts into the full-width band explicitly; a video would
    // take it by default. The pixel probe below proves the 820 side margins
    // are gone without changing the legacy image baseline.
    media: {
      type: "image",
      path: SCENE_GATE_PHOTO,
      fit: "contain",
      animation: "none",
      source: "FIXTURE",
      fullWidth: true,
    },
  },
  "baseline-hook-media-led-candle": MEDIA_LED_CANDLE_SCENE,
  "baseline-hook-media-led-cover": {
    ...MEDIA_LED_CONTAIN_SCENE,
    id: 31,
    media: MEDIA_LED_COVER_MEDIA,
  },
  // #1215 topology scenarios: one legal-copy scene per new information
  // layout. These are the render evidence for the layout PR — the frame must
  // show the declared focal object (count-up number, year card, chart frame,
  // column pair, flow nodes, card array), not the hero-center fallback.
  "topology-set-piece": {
    id: 41,
    visualType: "stat-reveal",
    layout: "set-piece",
    voiceover: "Ninety-seven percent of China's public cloud runs on domestic silicon.",
    texts: {
      bigNumber: "97%",
      label: "MARKET SHARE",
      subtext: "OF CHINA'S PUBLIC CLOUD",
      source: "IDC, 2026",
    },
  },
  "topology-year-source": {
    id: 42,
    visualType: "data",
    layout: "year-source",
    voiceover: "The round closed in late September 2026.",
    texts: {
      stat: "2026",
      label: "THE ROUND",
      subtext: "DEEPSEEK CLOSED A 15B YUAN ROUND LED BY A STATE FUND",
      source: "LATE SEPTEMBER",
    },
  },
  "topology-chart-card": {
    id: 43,
    visualType: "data",
    layout: "chart-card",
    voiceover: "Revenue doubled for a third straight quarter.",
    media: { type: "image", path: SCENE_GATE_PHOTO, animation: "none", source: "FIXTURE" },
    texts: {
      label: "REVENUE, 2025–2026",
      subtext: "THREE CONSECUTIVE QUARTERS OF DOUBLING",
      source: "COMPANY FILINGS",
    },
  },
  "topology-split": {
    id: 44,
    visualType: "contrast",
    layout: "split",
    voiceover: "One path ships hardware. The other ships demos.",
    texts: {
      title: "TWO PATHS TO HUMANOIDS",
      vs: "VS",
      left: ["REAL ROBOT SHIPPING", "FULL STACK HARDWARE", "FACTORY FLOORS"],
      right: ["DEMO FIRST", "CONSUMER HYPE", "VIDEO-ONLY"],
      note: "SAME YEAR, DIFFERENT BET",
      noteHighlight: "DIFFERENT",
    },
  },
  "topology-flow": {
    id: 45,
    visualType: "context",
    layout: "flow",
    voiceover: "The report landed, the exchange asked for proof, and the filing followed.",
    texts: {
      badge: "CAUSE",
      title: "THE REPORT LANDED",
      context: "THE EXCHANGE ASKED FOR PROOF",
      detail: "THE FILING FOLLOWED",
    },
  },
  "topology-array": {
    id: 46,
    visualType: "info-card",
    layout: "array",
    voiceover: "Ten models shipped in the same quarter.",
    texts: {
      title: "TEN MODELS, ONE QUARTER",
      subtitle: "THE RELEASE WAVE",
      points: [
        "QWEN 4",
        "KIMI K3",
        "DEEPSEEK V4",
        "GLM-6",
        "ERNIE 6",
        "MINIMAX M3",
        "STEP 4",
        "HUNYUAN 3",
        "DOUBAO 2",
        "YI-LIGHTNING",
      ],
    },
  },
  // #1215 density edge: ≥12 points switch to the count matrix (ordinal cells,
  // no per-label gate), so long model names cannot overflow a 72px content box.
  "topology-array-dense": {
    id: 47,
    visualType: "info-card",
    layout: "array",
    voiceover: "Twelve models shipped in the same quarter.",
    texts: {
      title: "TWELVE MODELS, ONE QUARTER",
      subtitle: "THE RELEASE WAVE",
      points: [
        "QWEN 4",
        "KIMI K3",
        "DEEPSEEK V4",
        "GLM-6",
        "ERNIE 6",
        "MINIMAX M3",
        "STEP 4",
        "HUNYUAN 3",
        "DOUBAO 2",
        "YI-LIGHTNING",
        "BAICHUAN 5",
        "SENSETIME 6",
      ],
    },
  },
  // #1398 native chart baselines: one legal scene per native chart, plus a
  // deviation bar to pin its non-zero baseline. The grammar gate covers bad
  // data before the render; these scenes prove the panel, labels and highlight
  // survive the real Chromium gate at 1080×1920.
  "topology-chart-bar": {
    id: 48,
    visualType: "data",
    layout: "chart",
    voiceover: "Kimi leads the round at fifty billion dollars, followed by Zhipu and MiniMax.",
    texts: {
      label: "VALUATION, $B",
      subtext: "KIMI LEADS THE PRIVATE ROUND",
      source: "COMPANY FILINGS, Q3 2026",
    },
    info: {
      relationship: "magnitude",
      chart: "bar",
      data: [
        { label: "KIMI", value: 50 },
        { label: "ZHIPU", value: 35 },
        { label: "MINIMAX", value: 28 },
        { label: "DEEPSEEK", value: 20 },
      ],
      unit: "B",
      prefix: "$",
      highlight: "KIMI",
    },
  },
  "topology-chart-deviation": {
    id: 52,
    visualType: "data",
    layout: "chart",
    voiceover: "Q1 prints 96 against a 100 baseline; Q2 prints 104.",
    texts: {
      label: "DEVIATION VS 100",
      subtext: "Q1 / Q2, PERCENT OF BASELINE",
      source: "COMPANY FILINGS, Q3 2026",
    },
    info: {
      relationship: "deviation",
      chart: "bar",
      baseline: 100,
      data: [
        { label: "Q1", value: 96 },
        { label: "Q2", value: 104, highlight: true },
      ],
      unit: "%",
    },
  },
  "topology-chart-line": {
    id: 49,
    visualType: "data",
    layout: "chart",
    voiceover: "Valuation moved from thirty-five billion in January to fifty billion in October.",
    texts: {
      label: "VALUATION, $B",
      subtext: "SIX-MONTH REPRICING",
      source: "PENGPAI, OCTOBER 2026",
    },
    info: {
      relationship: "change-over-time",
      chart: "line",
      data: [
        { label: "JAN", value: 35 },
        { label: "APR", value: 41 },
        { label: "JUL", value: 47 },
        { label: "OCT", value: 50, highlight: true },
      ],
      unit: "B",
      prefix: "$",
      time: { from: "2026-01", to: "2026-10" },
    },
  },
  "topology-chart-slope": {
    id: 50,
    visualType: "data",
    layout: "chart",
    voiceover: "Kimi and Zhipu each slipped one place, while MiniMax moved up.",
    texts: {
      label: "RANK CHANGE",
      subtext: "PRIVATE VALUATION RANK, 2025 TO 2026",
      source: "COMPANY FILINGS",
    },
    info: {
      relationship: "ranking",
      chart: "slope",
      data: [
        { label: "KIMI", value: 2, value2: 3 },
        { label: "ZHIPU", value: 1, value2: 2 },
        { label: "MINIMAX", value: 3, value2: 1 },
      ],
      unit: "RANK",
      highlight: "MINIMAX",
      axisLabels: ["2025", "2026"],
    },
  },
  "topology-chart-proportion": {
    id: 51,
    visualType: "data",
    layout: "chart",
    voiceover:
      "Cloud is half the spend, models a quarter, chips fifteen percent, and the rest is other.",
    texts: {
      label: "WHERE THE BUDGET GOES",
      subtext: "SHARE OF 2026 AI SPEND",
      source: "IDC, 2026",
    },
    info: {
      relationship: "part-to-whole",
      chart: "proportion-bar",
      data: [
        { label: "CLOUD", value: 50, highlight: true },
        { label: "MODELS", value: 25 },
        { label: "CHIPS", value: 15 },
        { label: "OTHER", value: 10 },
      ],
      unit: "%",
    },
  },
  // #255 incident replay: deepseek-v41-flash-report's real hook shape —
  // two stat cards + a source line with lowercase DESCENDERS ("p" in
  // "DeepSeek"). The support band's bottom edge coincides with the content
  // safe-zone bottom (y=1150), so a flush-resting source gate + any ink
  // descent breached by a sub-pixel amount, regardless of text WIDTH.
  "hook-source-descender": {
    id: 1,
    visualType: "hook",
    layout: "hero-center",
    voiceover: "hook",
    texts: {
      badge: "BREAKING",
      subject: "DEEPSEEK",
      color: "amber",
      bigNumber: "74.2",
      numberLabel: "DEEPSWE v1.1",
      stats: [
        { num: "62.7", unit: "", label: "OLD PRO" },
        { num: "SEP 14", unit: "", label: "PRO API TO FLASH" },
      ],
      source: "SOURCE: DeepSeek official",
    },
  },
  // qwen4 s9's real shape since the T7 relayout: same texts, stacked-cards.
  // Exercises the badge slot end to end (decision 65).
  "baseline-narrative-stacked": { ...S9_SCENE, layout: "stacked-cards" },
  // #422: the logo row — `texts.subjectLogo` puts a 96px logo in the SAME flex
  // row as the subject gate. Before the fix the gate kept the band's full
  // 820px contract width, so the row measured 96+24+820 = 940 > the 820 band
  // and the safe-zone assert cancelled the render (which is why no published
  // package ever rendered its logo from `texts`). Number-led focal.
  "baseline-hook-logo-row": {
    id: 20,
    visualType: "hook",
    voiceover: "hook",
    texts: {
      badge: "BREAKING ANALYSIS",
      subject: "DEEPSEEK",
      subjectLogo: "deepseek-icon",
      color: "amber",
      bigNumber: "V4.1",
      numberLabel: "FLASH SHIPPED",
      numberHighlight: "FLASH",
      stats: [
        { num: "685B", unit: "TOTAL", label: "PARAMS" },
        { num: "37B", unit: "ACTIVE", label: "PER TOKEN" },
      ],
      source: "CHINA AI NEWS",
    },
  },
  // #422: same row with a subject long enough to WRAP — the gate must fit the
  // logo-reserved width (700), not the whole band, so the row never grows past
  // it. Number-led focal.
  "baseline-hook-logo-long": {
    id: 21,
    visualType: "hook",
    voiceover: "hook",
    texts: {
      badge: "EXCLUSIVE",
      subject: "DEEPSEEK QUANT DIVISION",
      subjectLogo: "deepseek-icon",
      color: "blue",
      bigNumber: "685B",
      numberLabel: "TOTAL PARAMS",
      numberHighlight: "PARAMS",
      stats: [{ num: "37B", unit: "ACTIVE", label: "PER TOKEN" }],
      source: "LIANG WENFENG INVESTOR MEETING",
    },
  },
  // #422: claim-led focal with the logo row. (No revealText here: at the
  // time, `revealText`'s lineHeight 1.05 sat below the font's natural leading
  // and failed Fit on its own — that defect was fixed in #576, whose
  // claim-reveal shapes below cover the combination.)
  "baseline-hook-logo-claim": {
    id: 22,
    visualType: "hook",
    voiceover: "hook",
    texts: {
      badge: "EXCLUSIVE",
      subject: "DEEPSEEK",
      subjectLogo: "deepseek-icon",
      color: "blue",
      hookText: "0 KPIs. 0 ORG CHARTS.",
      stats: [{ num: "4", unit: "HR", label: "LEAKED MEETING" }],
      source: "LIANG WENFENG INVESTOR MEETING",
    },
  },
  // #422: logo with no subject text — the row is the logo alone and must stay
  // centred in the band (no gate, no width to reserve).
  "baseline-hook-logo-only": {
    id: 23,
    visualType: "hook",
    voiceover: "hook",
    texts: {
      subjectLogo: "deepseek-icon",
      color: "amber",
      bigNumber: "51B",
      numberLabel: "EMBEDDINGS IN RAM",
      source: "HF MODEL CARD",
    },
  },
  // #576: claim-led focal WITH `revealText`. revealText shipped at lineHeight
  // 1.05 — below the font's natural ~1.1em leading — so at EVERY candidate
  // size the inline rect is taller than the gate's 1.05em content box and Fit
  // bottoms out at the 56px floor: claim-led hooks with a reveal line could
  // not render at all (reproduced on unmodified HEAD, frame 45). Three shapes
  // cover the ticket's edges: short reveal (fits at preferred), long
  // wrapping claim + long reveal (walks the floors), and the #573 logo-row
  // combination (the reveal must respect the 700px subject budget too).
  "baseline-hook-claim-reveal": {
    id: 24,
    visualType: "hook",
    voiceover: "hook",
    texts: {
      badge: "EXCLUSIVE",
      subject: "DEEPSEEK",
      color: "blue",
      hookText: "0 KPIs. 0 ORG CHARTS.",
      revealText: "4-HOUR LEAKED MEETING",
      stats: [{ num: "4", unit: "HR", label: "LEAKED MEETING" }],
      source: "LIANG WENFENG INVESTOR MEETING",
    },
  },
  // #576: long claim (wraps to two lines, walks its ladder to 70px) + long
  // reveal (two lines at the preferred 80px) — both render while the hero
  // band's 550px stack budget still holds (copy that wraps to three lines in
  // either slot is genuinely over the band and is fail-closed by the
  // subject's container assert — not a legal fixture).
  "baseline-hook-claim-reveal-long": {
    id: 25,
    visualType: "hook",
    voiceover: "hook",
    texts: {
      badge: "EXCLUSIVE",
      subject: "DEEPSEEK",
      color: "blue",
      hookText: "NO KPIS. NO ORG CHART. 4 HOURS.",
      revealText: "THE DIVISION RAN WITH ZERO KPIS",
      stats: [{ num: "4", unit: "HR", label: "LEAKED MEETING" }],
      source: "LIANG WENFENG INVESTOR MEETING",
    },
  },
  // #576: claim-led + the #422/#573 logo row with a reveal line — the subject
  // budget is 700px here, and the reveal must still render.
  "baseline-hook-logo-claim-reveal": {
    id: 26,
    visualType: "hook",
    voiceover: "hook",
    texts: {
      badge: "EXCLUSIVE",
      subject: "DEEPSEEK",
      subjectLogo: "deepseek-icon",
      color: "blue",
      hookText: "0 KPIs. 0 ORG CHARTS.",
      revealText: "4-HOUR LEAKED MEETING",
      stats: [{ num: "4", unit: "HR", label: "LEAKED MEETING" }],
      source: "LIANG WENFENG INVESTOR MEETING",
    },
  },
  // #576: the SHORT reveal — one line at the preferred 80px. The ticket's
  // "claim-led with short claim" edge, and the shape whose Range rect sits
  // flush inside its own box at the shipped line-height (measured 0px poke;
  // the pre-fix 1.05 poked 2px past each edge here). The wrapped reveals above
  // cover the multi-line case.
  "baseline-hook-claim-reveal-short": {
    id: 27,
    visualType: "hook",
    voiceover: "hook",
    texts: {
      badge: "EXCLUSIVE",
      subject: "DEEPSEEK",
      color: "blue",
      hookText: "0 KPIs. 0 ORG CHARTS.",
      revealText: "ZERO KPIS",
      stats: [{ num: "4", unit: "HR", label: "LEAKED MEETING" }],
      source: "LIANG WENFENG INVESTOR MEETING",
    },
  },
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
  "baseline-contrast": CONTRAST_SCENE,
  "baseline-contrast-media": CONTRAST_MEDIA_SCENE,
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
      path: SCENE_GATE_PHOTO,
      mode: "fullscreen",
      animation: "none",
      source: "PEXELS",
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
    highlight: { field: "result", text: "POINT" },
    context: "51B EMBEDDINGS SIT IN REGULAR RAM, NOT VRAM",
    source: "CHINA AI NEWS ANALYSIS",
  },
};

/**
 * T8: a highlight fragment that is not a substring of its field fails the
 * render at validation — the author must quote the field verbatim.
 */
const BAD_HIGHLIGHT_SCENE: SceneData = {
  ...S9_SCENE,
  texts: {
    ...S9_TEXTS,
    highlight: { field: "result", text: "ABSENT FRAGMENT" },
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

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Union of a gate's text run rects — the ink extent the gate's Fit walks
 * against, as the browser actually laid it out (#422 probe: the subject
 * row's real ink vs its container).
 */
function inkBoxOf(gate: HTMLElement): Record<string, number> | null {
  const range = document.createRange();
  range.selectNodeContents(gate);
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) return null;
  let left = Infinity;
  let right = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  }
  return { left: round2(left), right: round2(right), width: round2(right - left) };
}

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
        //
        // EXCEPT for a group gate's shrink walk: it steps font sizes without
        // moving the gates' widths, so a width-only signal can fire mid-walk
        // and the payload then carries the un-shrunk sizes (or no
        // `data-group-fit` at all — that is how `group-shrink-measure` failed
        // on the CI runner the first time it ever ran there, #1093). A group
        // writes `data-group-fit` when it approves, so that attribute is the
        // group's own settle signal; scenes without groups are unaffected.
        const groups = Array.from(document.querySelectorAll("[data-text-group]")) as HTMLElement[];
        if (!groups.every((g) => g.dataset.groupFit)) continue;
        const settled = gates.every((g) => g.offsetWidth > 0);
        if (!settled) continue;
        // T10 F7: when the scene mounts collision asserts, wait for them to
        // record — the ratios only exist after the settled-frame evaluation.
        const collisionHosts = Array.from(
          document.querySelectorAll("[data-annotation-collision-source]"),
        ) as HTMLElement[];
        if (!collisionHosts.every((h) => h.dataset.annotationCollision)) continue;
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
    // What the gate's SURROUNDINGS grant it (a container's content box minus
    // the crossed layers' decoration). It does NOT account for a sibling that
    // already spent part of that box — in the hook logo row the container still
    // grants 820 while the gate renders 700 because the logo took 120. Row
    // geometry is `measuredBoxes`; gate+ink reality is `measuredGates` /
    // `measuredInk`.
    const measuredWidths: Record<string, number> = {};
    for (const gate of gates) {
      measuredWidths[gate.dataset.textSlot ?? "unknown"] = availableWidthFor(gate);
    }
    // T9: group bands mirror their final state onto data-group-fit (JSON:
    // shrunk / maxHeight / contentHeight / sizes) once the vertical check has
    // approved — surfaced here for the group-gate tests.
    const measuredGroupFits: Record<string, unknown> = {};
    for (const el of Array.from(document.querySelectorAll("[data-text-group]")) as HTMLElement[]) {
      if (el.dataset.groupFit && el.dataset.textGroup) {
        measuredGroupFits[el.dataset.textGroup] = JSON.parse(el.dataset.groupFit);
      }
    }
    // T10 F7: AnnotationCollisionAssert mirrors its per-target overlap ratios
    // onto data-annotation-collision once it has evaluated the settled frame —
    // surfaced here so the hook-circle ratios can be pinned by tests.
    const measuredCollisionRatios: Record<string, unknown> = {};
    for (const el of Array.from(
      document.querySelectorAll("[data-annotation-collision-source]"),
    ) as HTMLElement[]) {
      const source = el.dataset.annotationCollisionSource;
      if (source && el.dataset.annotationCollision) {
        measuredCollisionRatios[source] = JSON.parse(el.dataset.annotationCollision);
      }
    }
    // #422: layout boxes of the non-gate participants of a row (the hook
    // subject row and its logo). The row is not a gate, so `measuredWidths`
    // cannot see it — this is the channel that proves the ROW (not just the
    // gate) stays inside the band.
    const measuredBoxes: Record<string, Record<string, number>> = {};
    const measureBoxEls = Array.from(
      document.querySelectorAll("[data-measure-box]"),
    ) as HTMLElement[];
    for (const el of measureBoxEls) {
      const name = el.dataset.measureBox;
      if (!name) continue;
      const r = el.getBoundingClientRect();
      measuredBoxes[name] = {
        left: round2(r.left),
        right: round2(r.right),
        top: round2(r.top),
        bottom: round2(r.bottom),
        width: round2(r.width),
      };
    }
    const measuredInk: Record<string, Record<string, number>> = {};
    const measuredGates: Record<string, Record<string, number>> = {};
    for (const gate of gates) {
      const slot = gate.dataset.textSlot;
      if (!slot) continue;
      const ink = inkBoxOf(gate);
      if (ink) measuredInk[slot] = ink;
      const r = gate.getBoundingClientRect();
      measuredGates[slot] = {
        left: round2(r.left),
        right: round2(r.right),
        top: round2(r.top),
        bottom: round2(r.bottom),
        width: round2(r.width),
      };
    }
    // Same first-line JSON shape as TextFitError (cancelRender only surfaces
    // the message's first line); `measuredWidths` is the measurement channel.
    throw cancelRender(
      new Error(
        `[TextFitError] ${JSON.stringify({
          reason: "measurement",
          measuredWidths,
          measuredGroupFits,
          measuredCollisionRatios,
          measuredBoxes,
          measuredInk,
          measuredGates,
        })}`,
      ),
    );
  }

  return <>{children}</>;
};

type FixtureProps = { scenario?: string };

const FixtureScene: React.FC<FixtureProps> = ({ scenario = "baseline-narrative" }) => {
  // F1 shape: the incident replay — original copy at a locked 56px (Fit off),
  // with the whole result line as the highlight fragment (see F1_SCENE).
  if (scenario === "f1-lock56") {
    return (
      <NarrativeScene
        scene={F1_SCENE}
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
  // F6 shape: s5's original copy in media-split, locked at the shipped 52px
  // (Fit off) — the assert must fail where the old gate clipped silently.
  if (scenario === "f6-media-split-lock52") {
    return (
      <NarrativeScene
        scene={F6_SCENE}
        duration={4}
        contentDir=""
        gateOverrides={{ "narrative.media-split.result": { lockFontSize: 52 } }}
      />
    );
  }
  // T9 group-gate scenarios: NarrativeScene rendered directly so the fixture
  // can squeeze the bottom band's vertical budget via the groupMaxHeight
  // override. group-shrink-measure wraps the scene in the measurement probe
  // (the walk's final sizes ride out on data-group-fit); group-overflow-fail
  // relies on the group's own structured group-overflow TextFitError.
  // The 200 budget sits between the #688 floors' measured height (182: source
  // 29 + context 35 wrapping to two lines + result 46) and the measured
  // initial content height (321: result 64, context 48, source 40), so the walk
  // must exhaust source and context and then step result 64 → 62 → … → 50,
  // where the copy collapses to ONE line and the band settles at 187 ≤ 200.
  if (scenario === "group-shrink-measure") {
    return (
      <MeasureProbe>
        <NarrativeScene
          scene={S9_SCENE}
          duration={4}
          contentDir=""
          gateOverrides={{ "narrative.media-overlay.bottom-band": { groupMaxHeight: 200 } }}
        />
      </MeasureProbe>
    );
  }
  if (scenario === "group-overflow-fail") {
    return (
      <NarrativeScene
        scene={S9_SCENE}
        duration={4}
        contentDir=""
        gateOverrides={{ "narrative.media-overlay.bottom-band": { groupMaxHeight: 60 } }}
      />
    );
  }
  if (scenario === "unknown-field") {
    return <ShortVideo scenes={[UNKNOWN_FIELD_SCENE]} audioPaths={[]} durations={[4]} />;
  }
  if (scenario === "missing-rendered") {
    return <ShortVideo scenes={[MISSING_RENDERED_SCENE]} audioPaths={[]} durations={[4]} />;
  }
  if (scenario === "bad-highlight") {
    return <ShortVideo scenes={[BAD_HIGHLIGHT_SCENE]} audioPaths={[]} durations={[4]} />;
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
