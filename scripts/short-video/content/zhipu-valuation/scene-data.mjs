/**
 * Scene definitions for "Zhipu Loses 85% in Five Months"
 * Single video, TikTok, content-driven length (~45s)
 *
 * Narrative type: Data reveal (price move -> one-day context -> read across)
 * Hook formula: P1 Result-First (from-peak-to-now anchor)
 * Hook family: result-first (#1289) — a two-price comparison, so the number is
 * a measured fall rather than a model name wearing 230px type.
 * Sources: HKEX close, Weibo finance accounts (nov 12), CLS
 *
 * The hook's K-line is a native candle chart since #1405: the daily series is
 * baked from Eastmoney (checked row by row against Tencent) into
 * `data/2513-daily.json`, so the render needs no chart-img call and no
 * watermark. The window ends 2026-11-12 on purpose: the narration's "454" is
 * that day's close, and extending to 11-13 would put 408.4 on screen against
 * the sentence.
 *
 * NOTE: the reported HK$4B buyback is deliberately NOT used. The scan paired it
 * with a different trading day's "up 8.5%" flash and the Reuters item could not
 * be verified on 2026-11-13, so this pack stays on arithmetic derived from the
 * two verified prices.
 */

import { readBakedCandleSeries } from "../../lib/candle-data.mjs";

/** Baked daily series for zhipu (see `npm run bake:quotes -- zhipu-valuation`).
 * The ticker lives in `config/chart-symbols.json` and is resolved there — the
 * scene names the entity, not a second copy of the instrument. */
const candle = readBakedCandleSeries(new URL("./data/2513-daily.json", import.meta.url), {
  entity: "zhipu",
});

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    // 2026-11-15 user ruling: the K-line IS the hook — the hero-center number
    // covered the June peak the voiceover narrates. media-led gives the chart
    // its own band (y 410-1029) and drops the number to the bottom strip at
    // 112px (see docs/content-pipeline.md → 8b-3).
    layout: "media-led",
    arcRole: "establisher",
    hookFamily: "result-first",
    voiceover:
      // "in June" leads the sentence: the currency dual-annotation makes the
      // amount cluster heavy ("$387 (2,980 Hong Kong dollars)"), and TTS
      // truncated a sentence-final "in June" on six consecutive takes
      // (TTS_ACOUSTIC_HARD_BLOCK x2). Front-loaded tokens survive truncation.
      "In June, Zhipu peaked at 2,980 Hong Kong dollars. Today it trades at 454.",
    // #1405: the chart-img pin is replaced by a native candle chart. The
    // baked series (Eastmoney primary, Tencent check) ends 2026-11-12, the
    // close the voiceover names; the June peak 2,980 is highlighted because
    // the hook says it out loud.
    info: {
      relationship: "change-over-time",
      chart: "candle",
      entity: "zhipu",
      dataFile: "data/2513-daily.json",
      data: candle.rows,
      unit: "HK$",
      time: { from: "2026-06-01", to: "2026-11-12" },
      highlight: "2026-06-22",
      credit: "HKEX CLOSE VIA EASTMONEY · NOV 12",
    },
    // 2026-11-14: hooks carry imagery (user ruling, PR #1342 opened sourcing
    // to the opening) — the old `media: null` CSS-only waiver is lifted and
    // the ambient background comes from the chain's derived visual clause.
    texts: {
      badge: "HKEX LISTING",
      subject: "ZHIPU",
      // #1394: one drawdown figure per pack. The two verified prices give
      // 1 - 454/2980 = 84.76%, so the hook rounds to 85% like scene 5 and
      // meta.dataPoints; the old -80% contradicted the same film's peak scene.
      bigNumber: "-85%",
      numberLabel: "SINCE JUNE PEAK",
      source: "HKEX CLOSE, NOV 12",
      color: "red",
    },
  },
  {
    id: 2,
    name: "close",
    visualType: "stat-reveal",
    layout: "hero-center",
    arcRole: "initial",
    voiceover:
      // #1394: 85 percent, matching the hook, scene 5 and meta.dataPoints.
      "That is 85 percent gone in five months for China's most watched AI listing, according to HKEX closes.",
    texts: {
      bigNumber: "454",
      subtext: "HKD CLOSE ON NOV 12, -9.05%",
      source: "SOURCE: HKEX, HK$454 CLOSE",
    },
  },
  {
    id: 3,
    name: "one-day",
    visualType: "data",
    layout: "chart",
    arcRole: "initial",
    voiceover:
      "On November 12 Hang Seng Tech fell 2.36 percent. Zhipu fell almost four times that.",
    texts: {
      label: "NOV 12 DECLINE",
      subtext: "HANG SENG TECH -2.36% · ZHIPU -9.05%",
      source: "SOURCE: HKEX CLOSE, NOV 12",
    },
    info: {
      relationship: "magnitude",
      chart: "column",
      data: [
        { label: "HSTECH", value: 2.36 },
        { label: "ZHIPU", value: 9.05 },
      ],
      unit: "%",
      baseline: 0,
      sort: "desc",
      highlight: "ZHIPU",
      decimals: 2,
    },
  },
  {
    id: 4,
    name: "two-markets",
    visualType: "context",
    layout: "flow",
    arcRole: "initial",
    voiceover:
      "Q3 filings confirmed public funds added to model leaders. In Hong Kong, the listed ones are marked down.",
    texts: {
      title: "TWO MARKETS",
      context: "FUNDS BUY, HONG KONG SELLS",
      badge: "SAME COMPANIES",
      detail: "PRIMARY HEAT, SECONDARY COLD",
    },
    // #1296: "funds buy, Hong Kong sells" reads as two towers in different light.
    assetNeed: "two glass office towers at dusk, one lit warm, one dark",
    searchHints: ["hong kong skyline dusk", "two glass towers night"],
    aiImage: {
      prompt:
        "Two glass office towers at dusk standing side by side, the left filled with warm amber interior light, the right dark and cold blue with only a few lit windows, wet stone plaza reflecting both, low upward angle, overcast sky, no signage or logos.",
    },
  },
  {
    id: 5,
    name: "per-share",
    visualType: "stat-reveal",
    layout: "hero-center",
    arcRole: "peak",
    voiceover: "From the peak, 2,526 Hong Kong dollars a share vanished. 85 percent of the value.",
    texts: {
      bigNumber: "2,526",
      subtext: "PER SHARE, PEAK 2,980 TO 454",
      source: "CALCULATED FROM HKEX PRICES",
    },
  },
  {
    id: 6,
    name: "multiple",
    visualType: "narrative",
    layout: "stacked-cards",
    arcRole: "initial",
    voiceover: "The market is repricing these companies like software. Not like AI narratives.",
    texts: {
      company: "SOFTWARE MULTIPLES",
      context: "NOT AI NARRATIVES",
      action: "THE MARKET IS",
      result: "REPRICING THEM",
      source: "ANALYSIS",
    },
  },
  {
    id: 7,
    name: "divergence",
    visualType: "context",
    layout: "flow",
    arcRole: "release",
    voiceover: "Private valuations and public prices have stopped agreeing. That gap is the story.",
    texts: {
      title: "PRIVATE VS PUBLIC",
      context: "THE PRICES DIVERGED",
      badge: "THE GAP",
      detail: "CHINA AI, REPRICED",
    },
    // #1296: "the prices diverged" has no photo — the gap itself is the image.
    assetNeed: "two platforms at different heights with a wide gap between them",
    searchHints: ["measuring gap between platforms", "concrete step gap closeup"],
    aiImage: {
      prompt:
        "Two polished concrete platforms at different heights separated by a wide dark gap, a bright glowing cube resting on the higher one, the lower one empty and dim, a thin measuring rule spanning the gap, top-down three-quarter view, cold grey palette with one warm accent, no text.",
    },
  },
  {
    id: 8,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    arcRole: "release",
    voiceover:
      "This is the template for every AI listing in China. Watch the next one. Follow for the numbers.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "ZHIPU",
    },
  },
];
