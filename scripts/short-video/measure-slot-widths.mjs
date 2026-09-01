#!/usr/bin/env node
/**
 * measure-slot-widths.mjs — Ticket D (spec decision 43).
 *
 * Measures the REAL content-box width each gated slot's container grants it,
 * and prints them next to the contract's MEASURED_MAX_WIDTH values. Contract
 * widths must be measured, never derived from padding (the T2 lesson) — this
 * script is the measuring instrument; re-run it whenever a scene template's
 * container layout changes and backfill lib/text-slots.mjs.
 *
 * How it works: for each measure scenario the fixture's MeasureProbe waits for
 * the scene to settle, then cancels the render with a TextFitError-shaped
 * payload ({ reason: "measurement", measuredWidths }) whose JSON rides the
 * error message's first line — the only channel remotion still exposes. We
 * parse that payload from stderr and aggregate.
 *
 * Usage: node scripts/short-video/measure-slot-widths.mjs
 */
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { MEASURED_MAX_WIDTH } from "./lib/text-slots.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REMOTION_DIR = resolve(__dirname, "remotion");
const ENTRY = "src/scene-gate-fixture.tsx";
const COMPOSITION = "SceneGateFixture";
/** ≥ every baseline's settled frame (baseline-quote settles at 66). */
const FRAME = 70;

const SCENES = [
  "hook",
  "narrative",
  "stat-reveal",
  "cta",
  "quote",
  "context",
  "contrast",
  "data",
  "info-card",
  "fullscreen",
  "narrative-media-bottom-bar",
  "narrative-media-split",
  "narrative-stacked-cards",
];

/** @returns {Record<string, number> | null} slotId → measured width */
function measureScene(name) {
  const out = join(mkdtempSync(join(tmpdir(), "t5-measure-")), "still.png");
  try {
    execFileSync(
      "npx",
      [
        "remotion",
        "still",
        ENTRY,
        COMPOSITION,
        out,
        "--props",
        JSON.stringify({ scenario: `measure:${name}` }),
        "--frame",
        String(FRAME),
      ],
      { cwd: REMOTION_DIR, stdio: "pipe", timeout: 240_000 },
    );
    return null; // the probe must cancel the render; success means it never ran
  } catch (err) {
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    const match = /\[TextFitError\] (\{.*\})/.exec(text);
    if (!match) {
      console.error(`\n✗ ${name}: no measurement payload — raw output:\n${text}`);
      return null;
    }
    const payload = JSON.parse(match[1]);
    if (payload.reason !== "measurement") {
      console.error(`\n✗ ${name}: the gate failed before the probe measured:`);
      console.error(JSON.stringify(payload, null, 2));
      return null;
    }
    return payload.measuredWidths;
  }
}

const totals = {};
for (const name of SCENES) {
  console.log(`… measuring ${name}`);
  const widths = measureScene(name);
  if (!widths) continue;
  Object.assign(totals, widths);
  console.log(`  ✓ ${Object.keys(widths).length} slots`);
}

console.log("\n┌────────────────────────────────────────────────────────────┐");
console.log("│ measured widths vs contract (MEASURED_MAX_WIDTH)           │");
console.log("└────────────────────────────────────────────────────────────┘");
const ids = [...new Set([...Object.keys(totals), ...Object.keys(MEASURED_MAX_WIDTH)])].sort();
let mismatches = 0;
/** Indexed slots (chip[0], statCard[1]) resolve through their base entry. */
const baseContract = (id) =>
  MEASURED_MAX_WIDTH[id] ?? MEASURED_MAX_WIDTH[id.replace(/\[\d+\]$/, "")];
for (const id of ids) {
  const measured = totals[id];
  const contract = baseContract(id);
  if (measured == null) {
    console.log(`  ${id.padEnd(44)} contract ${contract} — NOT MEASURED (no fixture scene)`);
    continue;
  }
  if (contract == null) {
    console.log(`  ${id.padEnd(44)} measured ${measured} — NOT IN CONTRACT`);
    continue;
  }
  const tag = measured === contract ? "ok" : `MISMATCH (contract ${contract})`;
  if (measured !== contract) mismatches += 1;
  console.log(`  ${id.padEnd(44)} ${String(measured).padStart(4)}  ${tag}`);
}
console.log(
  `\n${mismatches === 0 ? "✓" : `✗ ${mismatches}`} contract value(s) ${mismatches === 0 ? "match" : "need backfill"}.`,
);
