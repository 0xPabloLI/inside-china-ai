#!/usr/bin/env node
/**
 * A/B Test Tracker (ISSUE-12)
 *
 * Tracks A/B test variables and results for video optimization.
 * Each test changes one variable (Hook / length / publish time / caption).
 *
 * Usage:
 *   node scripts/short-video/ab-test-tracker.mjs add --variable hook --variant A --description "Question hook"
 *   node scripts/short-video/ab-test-tracker.mjs result --id <id> --views 5000 --completion 0.45 --shares 120 --saves 80
 *   node scripts/short-video/ab-test-tracker.mjs report
 *
 * Output: output/ab-test-results.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const RESULTS_PATH = join(OUTPUT_DIR, "ab-test-results.json");

function loadResults() {
  if (existsSync(RESULTS_PATH)) {
    return JSON.parse(readFileSync(RESULTS_PATH, "utf8"));
  }
  return { tests: [], lastUpdated: new Date().toISOString() };
}

function saveResults(data) {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  data.lastUpdated = new Date().toISOString();
  writeFileSync(RESULTS_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

const args = process.argv.slice(2);
const command = args[0];

function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

if (command === "add") {
  const results = loadResults();
  const id = `ab-${String(results.tests.length + 1).padStart(3, "0")}`;
  const test = {
    id,
    variable: getArg("variable") || "unknown",
    variant: getArg("variant") || "A",
    description: getArg("description") || "",
    createdAt: new Date().toISOString(),
    result: null,
  };
  results.tests.push(test);
  saveResults(results);
  console.log(`✅ Added: ${id} — ${test.variable}/${test.variant}: ${test.description}`);
} else if (command === "result") {
  const id = getArg("id");
  const results = loadResults();
  const test = results.tests.find((t) => t.id === id);
  if (!test) {
    console.error(`❌ Test ${id} not found`);
    process.exit(1);
  }
  test.result = {
    views: parseInt(getArg("views") || "0"),
    completion: parseFloat(getArg("completion") || "0"),
    shares: parseInt(getArg("shares") || "0"),
    saves: parseInt(getArg("saves") || "0"),
    comments: parseInt(getArg("comments") || "0"),
    recordedAt: new Date().toISOString(),
  };
  saveResults(results);
  console.log(`✅ Recorded results for ${id}`);
} else if (command === "report") {
  const results = loadResults();
  console.log("\n📊 A/B Test Report");
  console.log("=".repeat(60));

  // Group by variable
  const byVar = {};
  for (const t of results.tests) {
    if (!byVar[t.variable]) byVar[t.variable] = [];
    byVar[t.variable].push(t);
  }

  for (const [variable, tests] of Object.entries(byVar)) {
    console.log(`\n📌 ${variable.toUpperCase()}`);
    const completed = tests.filter((t) => t.result);
    if (completed.length < 2) {
      console.log("  Need at least 2 variants with results to compare.");
      continue;
    }
    const best = completed.reduce((a, b) =>
      b.result.completion * b.result.views > a.result.completion * a.result.views ? b : a,
    );
    for (const t of completed) {
      const score = (t.result.completion * t.result.views).toFixed(0);
      const marker = t.id === best.id ? " 🏆" : "";
      console.log(
        `  ${t.variant}: ${t.result.views} views, ${(t.result.completion * 100).toFixed(0)}% completion, ${t.result.shares} shares — score ${score}${marker} — ${t.description}`,
      );
    }
  }
  console.log(`\n📁 ${RESULTS_PATH}`);
} else {
  console.log("Usage: ab-test-tracker.mjs [add|result|report] [options]");
  console.log('  add --variable <hook|length|time|caption> --variant A --description "..."');
  console.log("  result --id ab-001 --views 5000 --completion 0.45 --shares 120 --saves 80");
  console.log("  report");
}
