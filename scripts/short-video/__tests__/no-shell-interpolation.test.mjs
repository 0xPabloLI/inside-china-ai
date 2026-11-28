/**
 * Static guard for the shell boundary (#1598).
 *
 * The runtime fix is `execFile(argv)` or `execShell(sh`...`)`; this test keeps
 * the next call site from drifting back to a raw, interpolated command string.
 *
 * Rules over production files in scripts/short-video:
 * 1. Only lib/shell.mjs may import `exec`/`execSync` from child_process.
 * 2. No `exec(...)`/`execSync(...)`/`execAsync(...)`/`execShell(...)` call
 *    may start with an untagged template literal (backtick) or a `+`
 *    concatenation. `sh` is the only tag allowed to build a command.
 *
 * Test scripts (test-*.mjs) and fixtures are not production and are skipped.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, relative, sep } from "path";
import { fileURLToPath } from "url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHELL_SEAM = join("lib", "shell.mjs");
const SKIP_DIRS = new Set(["__tests__", "node_modules", "output", "bench", ".git"]);
const SKIP_FILE = /^test-[^/]+\.mjs$/;

function productionFiles(dir = ROOT) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".scratch")) continue;
      files.push(...productionFiles(path));
      continue;
    }
    if (!entry.name.endsWith(".mjs")) continue;
    if (SKIP_FILE.test(entry.name)) continue;
    files.push(path);
  }
  return files;
}

const files = productionFiles();

/** Strip `//` and block-comment lines so a prose mention is not a call site. */
function codeLines(source) {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

describe("shell boundary guard", () => {
  it("finds the production tree", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("only lib/shell.mjs imports exec/execSync", () => {
    const offenders = [];
    for (const file of files) {
      const rel = relative(ROOT, file).split(sep).join("/");
      if (rel === SHELL_SEAM.split(sep).join("/")) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*["'](?:node:)?child_process["']/g,
      )) {
        const names = match[1].split(",").map((name) => name.trim().split(/\s+as\s+/)[0]);
        if (names.includes("exec") || names.includes("execSync")) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never hands an untagged template or concatenation to a shell runner", () => {
    const offenders = [];
    const call = /\b(?:execSync|execAsync|execShell|exec)\(\s*([`+])/g;
    for (const file of files) {
      const rel = relative(ROOT, file).split(sep).join("/");
      const code = codeLines(readFileSync(file, "utf8"));
      for (const match of code.matchAll(call)) {
        // shell.mjs's own execShell export is a promisify wrapper, not a call
        // with a template; if it ever appears here, the guard should see it.
        offenders.push(`${rel}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
