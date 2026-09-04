#!/usr/bin/env node
/**
 * verify-template-sync.mjs — Check that HookScene.tsx (React/Remotion) and
 * scene-templates.mjs (HTML template) have matching CSS values.
 *
 * The DOM verifier (verify-scene-dom.mjs) tests the HTML template, but the
 * actual video render uses the React component. If they drift apart, DOM
 * verification passes on wrong values.
 *
 * This script extracts key CSS properties from both sources and diffs them.
 * Run it after any HookScene visual change:
 *   node scripts/short-video/verify-template-sync.mjs
 *
 * Exit code 1 on any mismatch.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TSCENE = readFileSync(join(__dirname, "remotion/src/scenes/HookScene.tsx"), "utf8");
const TVISUALS = readFileSync(join(__dirname, "remotion/src/components/visuals.tsx"), "utf8");
const THTML = readFileSync(join(__dirname, "lib/scene-templates.mjs"), "utf8");

// ── Extract helper: find a numeric value after a key in a code string ──
function extractValue(code, pattern, group = 1) {
  const m = new RegExp(pattern).exec(code);
  return m ? m[group] : null;
}

// ── Define the key-value pairs to check ──
// Each entry: { name, reactPattern, reactFile, htmlPattern }
const CHECKS = [
  // Subject row gap
  {
    name: "subject-row gap",
    react: extractValue(TSCENE, /gap: (\d+), marginBottom: 32/),
    html: extractValue(THTML, /\.subject-row \{[^}]*gap: (\d+)px/),
  },
  // Subject logo size (width)
  {
    name: "subject-logo width",
    react: extractValue(TSCENE, /width: (\d+),\n\s*height: \d+,\n\s*filter:/),
    html: extractValue(THTML, /\.subject-logo \{ width: (\d+)px/),
  },
  // Subject name font-size
  {
    name: "subject-name font-size",
    react: extractValue(TSCENE, /fontSize: (\d+),\s*\n\s*fontWeight: 900,\s*\n\s*color: "#f5f5f5"/),
    html: extractValue(THTML, /\.subject-name \{ font-size: (\d+)px/),
  },
  // Focal number-label margin-top
  {
    name: "focal-number-label margin-top",
    react: extractValue(
      TSCENE,
      /letterSpacing: "3px",\s*\n\s*marginTop: (\d+),\s*\n\s*textAlign: "center"/,
    ),
    html: extractValue(THTML, /\.focal-number-label \{[^}]*margin-top: (\d+)px/),
  },
  // Stats row gap
  {
    name: "stats-row gap",
    react: extractValue(TSCENE, /display: "flex", gap: (\d+), justifyContent: "center"/),
    html: extractValue(THTML, /\.stats-row \{[^}]*gap: (\d+)px/),
  },
  // Source line margin-top
  {
    name: "source-line margin-top",
    react: extractValue(TSCENE, /marginTop: stats\.length > 0 \? (\d+) : 0/),
    html: extractValue(THTML, /\.source-line \{[^}]*margin-top: (\d+)px/),
  },
  // Source line line-height
  {
    name: "source-line line-height",
    react: TSCENE.includes("lineHeight: 1") ? "1" : null,
    html: extractValue(THTML, /\.source-line \{[^}]*line-height: (\d+)/),
  },
  // Stat card vertical padding
  {
    name: "stat-card vpadding",
    react: extractValue(TVISUALS, /borderRadius: 14,\s*\n\s*padding: "(\d+)px/),
    html: extractValue(THTML, /\.stat-card \{[^}]*padding: (\d+)px \d+px/),
  },
  // Stat card label margin-top
  {
    name: "stat-card label margin-top",
    react: extractValue(TVISUALS, /letterSpacing: "1px",\n\s*marginTop: (\d+),/),
    html: extractValue(THTML, /\.stat-label \{[^}]*margin-top: (\d+)px/),
  },
];

// ── Run checks ──
let mismatches = 0;
let missing = 0;

console.log("═".repeat(60));
console.log("Template Sync Check: HookScene.tsx ↔ scene-templates.mjs");
console.log("═".repeat(60));
console.log("");

for (const check of CHECKS) {
  const reactVal = check.react;
  const htmlVal = check.html;

  if (reactVal === null && htmlVal === null) {
    console.log(`  ⏭️  ${check.name}: skipped (not found in either)`);
  } else if (reactVal === null) {
    console.log(`  ⚠️  ${check.name}: not found in React (HTML=${htmlVal})`);
    missing++;
  } else if (htmlVal === null) {
    console.log(`  ⚠️  ${check.name}: not found in HTML (React=${reactVal})`);
    missing++;
  } else if (reactVal === htmlVal) {
    console.log(`  ✅ ${check.name}: ${reactVal}px (React=HTML)`);
  } else {
    console.log(`  ❌ ${check.name}: React=${reactVal}px vs HTML=${htmlVal}px`);
    mismatches++;
  }
}

console.log("");
if (mismatches > 0) {
  console.log(`❌ ${mismatches} mismatch(es) found — sync the HTML template!`);
} else if (missing > 0) {
  console.log(`⚠️  ${missing} value(s) not found — check if patterns need updating`);
} else {
  console.log("✅ All values in sync");
}
console.log("═".repeat(60));

process.exit(mismatches > 0 ? 1 : 0);
