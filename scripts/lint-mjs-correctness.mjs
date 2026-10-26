#!/usr/bin/env node
/**
 * Full-repo `.mjs` correctness gate (#447).
 *
 * Why this exists: `eslint.config.js` used to match **no** correctness rule
 * for the .mjs glob, so every tracked script was "lint-clean" by construction.
 * Adding the rules to the config fixes new work going forward, but CI's lint
 * job is a *ratchet* — it only scans files a PR touched, so the ~527
 * first-party `.mjs` files already in the tree would stay unverified, and a
 * config-only PR would scan nothing at all. This gate is the full scan:
 * every tracked first-party `.mjs`, every run.
 *
 * Formatting is out of scope on purpose: `prettier/prettier` is disabled for
 * this scan so the full-repo pass does not have to also retire the pre-existing
 * format debt that the incremental ratchet deliberately leaves alone.
 *
 * Non-vacuity is enforced, not assumed — a gate that scans zero files or runs
 * with its rules switched off is worse than no gate, because it reports green:
 *   1. at least one non-ignored target must be scanned;
 *   2. every rule in MJS_CORRECTNESS_RULES must resolve to severity `error`
 *      for a real `.mjs` path (checked through ESLint's own
 *      `calculateConfigForFile`, not by re-reading the config file).
 * Both failures exit 1.
 *
 * Usage:
 *   node scripts/lint-mjs-correctness.mjs              # all tracked .mjs
 *   node scripts/lint-mjs-correctness.mjs <file ...>   # explicit targets
 *
 * Exit: 0 = clean, 1 = findings / vacuous gate.
 */

import { realpathSync } from "node:fs";
import { ESLint } from "eslint";
import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MJS_CORRECTNESS_RULE_NAMES } from "./mjs-correctness-rules.mjs";

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Formatting is the incremental ratchet's job; this scan is correctness-only.
const CORRECTNESS_ONLY_OVERRIDES = [{ rules: { "prettier/prettier": "off" } }];

/** Tracked `.mjs` files (first-party: `git ls-files` never lists submodule contents). */
export function trackedMjsFiles(cwd = PROJECT_ROOT) {
  const listed = execFileSync("git", ["ls-files", "-z", "--", "*.mjs"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return listed
    .split("\0")
    .filter(Boolean)
    .map((relative) => join(cwd, relative));
}

function severityOf(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

function isErrorSeverity(value) {
  return value === "error" || value === 2;
}

/**
 * Run the correctness scan.
 *
 * @param {{ files?: string[], cwd?: string, overrides?: object[] }} options
 *   explicit targets (tests) default to every tracked first-party `.mjs`;
 *   `overrides` are extra flat-config blocks applied last — used by the tests
 *   to prove the vacuity guard really fires when a rule is switched off.
 */
export async function runCorrectnessGate({ files, cwd = PROJECT_ROOT, overrides = [] } = {}) {
  const requested = files?.length
    ? files.map((file) => (isAbsolute(file) ? file : resolve(cwd, file)))
    : trackedMjsFiles(cwd);

  if (requested.length === 0) {
    return { ok: false, reason: "no-targets", scanned: 0, errorCount: 0, output: "" };
  }

  const eslint = new ESLint({
    cwd,
    overrideConfig: [...CORRECTNESS_ONLY_OVERRIDES, ...overrides],
  });

  const targets = [];
  const ignored = [];
  for (const file of requested) {
    if (await eslint.isPathIgnored(file)) ignored.push(file);
    else targets.push(file);
  }

  if (targets.length === 0) {
    return {
      ok: false,
      reason: "all-targets-ignored",
      scanned: 0,
      ignored: ignored.length,
      errorCount: 0,
      output: "",
    };
  }

  // Guard 2: the rules must actually be on for a .mjs path, or a green run
  // means nothing.
  const resolved = await eslint.calculateConfigForFile(targets[0]);
  const disabled = MJS_CORRECTNESS_RULE_NAMES.filter(
    (name) => !isErrorSeverity(severityOf(resolved?.rules?.[name])),
  );

  const results = await eslint.lintFiles(targets);
  const errorCount = results.reduce((total, result) => total + result.errorCount, 0);
  const formatter = await eslint.loadFormatter("stylish");
  const output = await formatter.format(results);

  return {
    ok: errorCount === 0 && disabled.length === 0,
    reason: disabled.length ? "rules-not-enabled" : errorCount ? "findings" : null,
    scanned: targets.length,
    ignored: ignored.length,
    disabled,
    errorCount,
    output,
  };
}

async function main() {
  const explicit = process.argv.slice(2);
  const report = await runCorrectnessGate(explicit.length ? { files: explicit } : {});

  const scope = explicit.length
    ? `${explicit.length} explicit file(s)`
    : "tracked first-party .mjs";
  const ignored = report.ignored ? `, ${report.ignored} ignored by eslint config` : "";

  if (report.reason === "no-targets") {
    console.error("✗ mjs correctness gate: no .mjs files to scan — gate would be vacuous");
    process.exit(1);
  }
  if (report.reason === "all-targets-ignored") {
    console.error(
      `✗ mjs correctness gate: every target is ignored by the eslint config (${report.ignored}) — gate would be vacuous`,
    );
    process.exit(1);
  }
  if (report.reason === "rules-not-enabled") {
    console.error(
      `✗ mjs correctness gate: rules not enabled for .mjs — ${report.disabled.join(", ")}. ` +
        "A green scan with them off proves nothing; add them to eslint.config.js.",
    );
    process.exit(1);
  }

  if (report.output) process.stdout.write(report.output);

  if (!report.ok) {
    console.error(
      `✗ mjs correctness gate: ${report.errorCount} error(s) across ${report.scanned} file(s) (${scope}${ignored})`,
    );
    process.exit(1);
  }

  console.log(
    `✓ mjs correctness gate: ${report.scanned} file(s) clean (${scope}${ignored}) — rules: ${MJS_CORRECTNESS_RULE_NAMES.join(", ")}`,
  );
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
