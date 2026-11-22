#!/usr/bin/env node
/**
 * Annotation legibility CLI (#733 S2 underline review).
 *
 * Prints the WCAG contrast and phone-scale stroke share for the shipped
 * underline and the candidate styles used by the 2026-11-22 still matrix. No
 * production token is changed here; the review decides.
 *
 * Usage:
 *   node scripts/short-video/annotation-legibility.mjs
 *   node scripts/short-video/annotation-legibility.mjs --color '#4d8bff' --stroke 3
 *   node scripts/short-video/annotation-legibility.mjs --json
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ANNOTATION_BACKGROUND,
  ANNOTATION_LEGIBILITY,
  evaluateUnderline,
} from "./lib/annotation-legibility.mjs";

const CANDIDATES = [
  { name: "current", color: "#4d8bff", strokePx: 3, note: "shipped token: Dispatch Blue, 3px" },
  { name: "brand-thick", color: "#4d8bff", strokePx: 5, note: "same hue, 5px" },
  { name: "amber", color: "#f59e0b", strokePx: 4, note: "marker-family amber, 4px" },
  { name: "white", color: "#f5f5f5", strokePx: 4, note: "text-family white, 4px" },
  { name: "cyan", color: "#22d3ee", strokePx: 4, note: "semantic cyan, 4px" },
];

function main(argv) {
  const args = argv.slice(2);
  const getArg = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };
  const json = args.includes("--json");
  const customColor = getArg("color");
  const customStroke = getArg("stroke");
  const canvasHeight = Number(getArg("height") ?? 1920);

  if (!Number.isFinite(canvasHeight) || canvasHeight <= 0) {
    console.error(`❌ --height must be a positive number, got ${JSON.stringify(getArg("height"))}`);
    process.exit(1);
  }

  const rows =
    customColor || customStroke
      ? [
          {
            name: "custom",
            color: customColor ?? "#4d8bff",
            strokePx: Number(customStroke ?? 3),
            note: "CLI override",
          },
        ]
      : CANDIDATES;

  for (const row of rows) {
    if (!Number.isFinite(row.strokePx) || row.strokePx <= 0) {
      console.error(
        `❌ stroke width must be a positive number, got ${JSON.stringify(row.strokePx)}`,
      );
      process.exit(1);
    }
  }

  const evaluated = rows.map((row) => ({
    ...row,
    ...evaluateUnderline({
      color: row.color,
      strokePx: row.strokePx,
      canvasHeightPx: canvasHeight,
      background: ANNOTATION_BACKGROUND,
    }),
  }));

  if (json) {
    console.log(
      JSON.stringify(
        {
          background: ANNOTATION_BACKGROUND,
          canvasHeightPx: canvasHeight,
          thresholds: ANNOTATION_LEGIBILITY,
          rows: evaluated,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `Annotation legibility — background ${ANNOTATION_BACKGROUND}, canvas ${canvasHeight}px`,
  );
  console.log(
    `floors: contrast ≥ ${ANNOTATION_LEGIBILITY.minContrast}:1, stroke ≥ ${(ANNOTATION_LEGIBILITY.minStrokeShare * 100).toFixed(1)}% of height (${(ANNOTATION_LEGIBILITY.minStrokeShare * canvasHeight).toFixed(2)}px)\n`,
  );
  console.log(`variant     colour   width contrast stroke% verdict`);
  console.log("---------------------------------------------------------------------");
  for (const row of evaluated) {
    const line =
      `${row.name.padEnd(11)} ${row.color.padEnd(8)} ${`${row.strokePx}px`.padEnd(4)} ` +
      `${`${row.contrastRatio.toFixed(2)}:1`.padEnd(7)} ${`${(row.strokeShare * 100).toFixed(3)}%`.padEnd(7)} ${row.verdict}`;
    console.log(line);
  }
  console.log("");
  for (const row of evaluated) console.log(`- ${row.name}: ${row.note}`);
}

// Entry guard per docs/agents/implementation-workflow.md §12: import.meta.url is
// realpath-resolved while argv[1] keeps the caller's spelling, so compare the
// realpath of argv[1]. Importing this module must stay side-effect free.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv);
}
