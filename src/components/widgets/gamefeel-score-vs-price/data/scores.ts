// GameFeel Bench v1.4 — overall score vs price per task (#1189 item 1).
//
// Source: github.com/kodasdream/gamefeel-benchmark, data/gamefeelbench.csv,
// read at commit c1e14546 (2026-11-08 13:18 UTC) — the snapshot
// articles/qwen4-gamefeel.md cites row by row.
//
// The maintainer updates that CSV in place: by 2026-11-14 the same four rows
// read 48.7 / 46.0 / 43.2 / 43.1. The article's prose quotes the Nov 8
// numbers, so the widget pins the same snapshot instead of silently
// disagreeing with the page it renders on. Two facts keep this honest:
// `AS_OF` is printed in the widget, and the footer says the CSV is revised in
// place.
//
// `avg` is the average of the seven subcategories on a 100-point scale
// (coding create, coding bugfix, gamefeel, ideas, visuals, audio,
// reverse-evaluation). `pricePerTaskUsd` is the benchmark's own cost-per-task
// column, not a rate-card price.

export interface GameFeelRow {
  id: string;
  model: string;
  effort: string;
  vendor: "Alibaba" | "Anthropic";
  /** Unreleased early checkpoint whose identity the vendor has not confirmed. */
  earlyCheckpoint: boolean;
  /** Average of the seven subcategories, 100-point scale. */
  score: number;
  /** Benchmark-reported cost per task, USD. */
  pricePerTaskUsd: number;
}

export const AS_OF = "Nov 8, 2026";

/**
 * Bars are drawn on this window, not on 0–100. The four scores span 5.3 points;
 * scaled to a full axis the ordering would be invisible. Both bounds are
 * printed in the widget, so the missing zero is stated rather than implied.
 */
export const AXIS_MIN = 40;
export const AXIS_MAX = 50;

/** Ordered by score, highest first — the widget never re-sorts at render time. */
export const ROWS: GameFeelRow[] = [
  {
    id: "qwen4-flash-early",
    model: "Qwen-4-Flash-Early",
    effort: "Max",
    vendor: "Alibaba",
    earlyCheckpoint: true,
    score: 49.9,
    pricePerTaskUsd: 0.4,
  },
  {
    id: "opus-55-xhigh",
    model: "Claude Opus 5.5",
    effort: "XHigh",
    vendor: "Anthropic",
    earlyCheckpoint: false,
    score: 47.2,
    pricePerTaskUsd: 2.6,
  },
  {
    id: "sonnet-55-max",
    model: "Claude Sonnet 5.5",
    effort: "Max",
    vendor: "Anthropic",
    earlyCheckpoint: false,
    score: 45.0,
    pricePerTaskUsd: 7.8,
  },
  {
    id: "qwen4-27b-early",
    model: "Qwen-4-27B-Early",
    effort: "XHigh",
    vendor: "Alibaba",
    earlyCheckpoint: true,
    score: 44.6,
    pricePerTaskUsd: 0.16,
  },
];
