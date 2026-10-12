import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ESLint } from "eslint";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "node:url";
import { MJS_CORRECTNESS_RULE_NAMES } from "../mjs-correctness-rules.mjs";
import { runCorrectnessGate, trackedMjsFiles } from "../lint-mjs-correctness.mjs";

// #447: .mjs scripts were matched by no JS correctness rule, so `npx eslint`
// returned 0 for them no matter what they contained. These tests pin three
// things that must stay true:
//   1. the rules really resolve to `error` for a .mjs path (config truth, via
//      ESLint's own calculateConfigForFile — not by re-reading the file);
//   2. each rule actually fires on a crash-class snippet (lintText);
//   3. the full-repo gate fails loudly instead of going quietly empty
//      (no targets / everything ignored / rules switched off).

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE = join(PROJECT_ROOT, "scripts", "lint-mjs-correctness.mjs");
// A real tracked .mjs — used as the "which config applies here?" probe.
const REAL_MJS = join(PROJECT_ROOT, "scripts", "lint-todos.mjs");
// Tracked but ignored by eslint.config.js (a markdown file wearing .mjs).
const IGNORED_MJS = join(PROJECT_ROOT, "docs", "archive", "spec-text-overflow-verify.mjs");

// Snippets that must be flagged. Each is the smallest thing the rule exists to
// catch; if one of these stops firing, the gate below is green for the wrong
// reason.
const CRASH_FIXTURES = {
  "no-const-assign": "const A = 1;\nA = 2;\nexport default A;\n",
  "no-dupe-keys": "export default { a: 1, a: 2 };\n",
  "no-unreachable": "function f() {\n  return 1;\n  console.log(2);\n}\nexport default f;\n",
  // Parses as (!key) in obj — the trap the rule exists to catch. !('a' in obj)
  // with the explicit parens is correct code and must NOT fire.
  "no-unsafe-negation": "const key = 'a';\nconst obj = {};\nexport default !key in obj;\n",
  "no-unsafe-finally":
    "function f() {\n  try {\n    return 1;\n  } finally {\n    return 2;\n  }\n}\nexport default f;\n",
  // `maybe?.b.c` is safe (the short circuit spans the whole chain) — the rule
  // fires when the chain's result is used outside it.
  "no-unsafe-optional-chaining": "const maybe = null;\nexport default (maybe?.b).c;\n",
};

let fixtureDir;

beforeAll(() => {
  mkdirSync(join(PROJECT_ROOT, ".scratch"), { recursive: true });
  fixtureDir = mkdtempSync(join(PROJECT_ROOT, ".scratch", "mjs-gate-"));
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

function writeFixture(name, source) {
  const path = join(fixtureDir, `${name}.mjs`);
  writeFileSync(path, source);
  return path;
}

describe("eslint config resolves correctness rules for .mjs (#447)", () => {
  it("enables every correctness rule at error severity for a real .mjs path", async () => {
    const eslint = new ESLint({ cwd: PROJECT_ROOT });
    const config = await eslint.calculateConfigForFile(REAL_MJS);

    for (const name of MJS_CORRECTNESS_RULE_NAMES) {
      // calculateConfigForFile normalizes severity to a number (2 = error).
      const entry = config.rules?.[name];
      const severity = Array.isArray(entry) ? entry[0] : entry;
      expect([2, "error"], `${name} must be an error for .mjs`).toContain(severity);
    }
  });

  it("leaves no-undef / no-unused-vars off for .mjs (deliberate, see mjs-correctness-rules.mjs)", async () => {
    const eslint = new ESLint({ cwd: PROJECT_ROOT });
    const config = await eslint.calculateConfigForFile(REAL_MJS);

    for (const name of ["no-undef", "no-unused-vars"]) {
      const entry = config.rules?.[name];
      const severity = Array.isArray(entry) ? entry[0] : entry;
      expect(severity, `${name} must not be an error for .mjs`).not.toBe("error");
    }
  });

  it.each(MJS_CORRECTNESS_RULE_NAMES)("flags crash-class code: %s", async (rule) => {
    const eslint = new ESLint({ cwd: PROJECT_ROOT });
    const [result] = await eslint.lintText(CRASH_FIXTURES[rule], { filePath: REAL_MJS });

    const ids = result.messages.map((message) => message.ruleId);
    expect(ids, `expected ${rule} to fire on:\n${CRASH_FIXTURES[rule]}`).toContain(rule);
  });
});

describe("mjs correctness gate", () => {
  it("enumerates the tracked first-party .mjs files", () => {
    const files = trackedMjsFiles(PROJECT_ROOT);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((file) => file.endsWith(".mjs"))).toBe(true);
  });

  it("passes a clean file", async () => {
    const path = writeFixture("clean", "export const A = 1;\nexport default A + 1;\n");
    const report = await runCorrectnessGate({ files: [path], cwd: PROJECT_ROOT });

    expect(report.ok).toBe(true);
    expect(report.scanned).toBe(1);
  });

  it.each(MJS_CORRECTNESS_RULE_NAMES)("fails on crash-class code: %s", async (rule) => {
    const path = writeFixture(rule.replace(/[^a-z-]/g, ""), CRASH_FIXTURES[rule]);
    const report = await runCorrectnessGate({ files: [path], cwd: PROJECT_ROOT });

    expect(report.ok).toBe(false);
    expect(report.reason).toBe("findings");
    expect(report.output).toContain(rule);
  });

  it("fails instead of passing when the rules are switched off (vacuity guard)", async () => {
    const path = writeFixture("clean-for-vacuity", "export default 1;\n");
    const report = await runCorrectnessGate({
      files: [path],
      cwd: PROJECT_ROOT,
      overrides: [{ rules: { "no-const-assign": "off" } }],
    });

    expect(report.ok).toBe(false);
    expect(report.reason).toBe("rules-not-enabled");
    expect(report.disabled).toContain("no-const-assign");
  });

  it("fails instead of passing when every target is ignored by the config", async () => {
    const report = await runCorrectnessGate({ files: [IGNORED_MJS], cwd: PROJECT_ROOT });

    expect(report.ok).toBe(false);
    expect(report.reason).toBe("all-targets-ignored");
  });
});
