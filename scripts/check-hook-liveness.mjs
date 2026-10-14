#!/usr/bin/env node
/**
 * Hook liveness gate (#406).
 *
 * Why this exists: a hook that sits where git does not read it performs no
 * check, silently — and both failure shapes had already shipped here.
 *
 *   1. Distribution — `.gitignore` carried a `.githooks/` rule, so
 *      `post-checkout`, `post-commit` and `post-merge` were present in this
 *      checkout and reached no clone. A hook that only exists locally is a
 *      hook that only works locally.
 *   2. Shadowing — hooks written into `.git/hooks/` while `core.hooksPath`
 *      points at `.githooks/`. Git reads one directory or the other, never
 *      both, so those files are inert no matter how executable they look.
 *
 * The gate checks the whole chain, not one link:
 *   - every non-`.sample` file in the hooks directory is tracked by git
 *     (distribution) and carries the exec bit in the index (git only runs an
 *     executable hook);
 *   - `core.hooksPath` is set (activation — a clone does not inherit it);
 *   - the activated directory holds every tracked hook, executable on disk;
 *   - the default hooks directory carries no non-`.sample` file, i.e. nothing
 *     is shadowed.
 *
 * Non-vacuity is enforced, not assumed: an empty hooks directory fails the
 * gate, because "no hooks to check" is the one result that would look green
 * while checking nothing.
 *
 * Usage:
 *   node scripts/check-hook-liveness.mjs [--repo <path>]
 *
 * Exit: 0 = every hook is tracked, activated and reachable; 1 = otherwise.
 */

import { execFileSync } from "node:child_process";
import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const HOOKS_DIR_NAME = ".githooks";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

/** For queries whose empty answer is an answer (`git config --get` exits 1). */
function gitOrEmpty(cwd, ...args) {
  try {
    return git(cwd, ...args);
  } catch {
    return "";
  }
}

/** Git ships these as templates; they are not hooks anyone installed. */
function isHookFile(name) {
  return !name.endsWith(".sample") && !name.startsWith(".") && !name.endsWith(".md");
}

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} repo - checkout to inspect
 * @returns {string[]} one message per failed check (empty means live)
 */
export function findHookLivenessFindings(repo) {
  const findings = [];
  const hooksDir = join(repo, HOOKS_DIR_NAME);

  let present;
  try {
    present = readdirSync(hooksDir).filter(isHookFile).sort();
  } catch {
    return [`${HOOKS_DIR_NAME}/ is missing — no hook can be activated`];
  }
  if (present.length === 0) {
    return [`${HOOKS_DIR_NAME}/ holds no hooks — vacuous gate, refusing to report green`];
  }

  // Distribution: a hook git does not track never reaches another clone.
  const tracked = new Set(
    git(repo, "ls-files", "--", `${HOOKS_DIR_NAME}/`)
      .split("\n")
      .filter(Boolean)
      .map((path) => basename(path)),
  );
  for (const name of present) {
    if (!tracked.has(name)) {
      findings.push(
        `${HOOKS_DIR_NAME}/${name} is not tracked by git — it will not reach a clone ` +
          `(check .gitignore for a rule covering ${HOOKS_DIR_NAME}/)`,
      );
    }
  }

  // Git only runs an executable hook, and the bit lives in the index.
  for (const line of git(repo, "ls-files", "-s", "--", `${HOOKS_DIR_NAME}/`).split("\n")) {
    if (!line) continue;
    const [mode, , , path] = line.split(/\s+/);
    if (mode !== "100755") {
      findings.push(
        `${path} is mode ${mode} in the index — git only runs hooks with exec (100755)`,
      );
    }
  }

  // Activation: core.hooksPath is local config, so a fresh clone has none.
  const configured = gitOrEmpty(repo, "config", "--get", "core.hooksPath").trim();
  if (!configured) {
    findings.push(
      "core.hooksPath is unset — git reads none of these hooks; run `npm run setup:hooks`",
    );
    return findings;
  }

  const activeDir = resolve(repo, git(repo, "rev-parse", "--git-path", "hooks").trim());
  for (const name of present) {
    if (!tracked.has(name)) continue;
    const hookPath = join(activeDir, name);
    if (!statSync(hookPath, { throwIfNoEntry: false })?.isFile()) {
      findings.push(
        `core.hooksPath (${configured}) has no ${name} — the hook is tracked but not reachable`,
      );
    } else if (!isExecutable(hookPath)) {
      findings.push(`${hookPath} is not executable — git skips it`);
    }
  }

  // Shadowing: once hooksPath is set, the default directory is dead weight.
  const commonDir = resolve(repo, git(repo, "rev-parse", "--git-common-dir").trim());
  const defaultDir = join(commonDir, "hooks");
  if (activeDir !== defaultDir && statSync(defaultDir, { throwIfNoEntry: false })?.isDirectory()) {
    for (const name of readdirSync(defaultDir).filter(isHookFile).sort()) {
      findings.push(
        `${defaultDir}/${name} is inert — git reads ${configured}, never the default hooks ` +
          "directory; the file never runs (delete it, or move it into the tracked hooks directory)",
      );
    }
  }

  return findings;
}

function main(argv) {
  const flag = argv.indexOf("--repo");
  const repo = resolve(flag >= 0 && argv[flag + 1] ? argv[flag + 1] : process.cwd());

  let findings;
  try {
    findings = findHookLivenessFindings(repo);
  } catch (error) {
    console.error(`check-hook-liveness: ${repo}: ${error.message}`);
    return 1;
  }

  if (findings.length > 0) {
    console.error(`[hook-liveness] FAIL — ${findings.length} finding(s) in ${repo}`);
    for (const finding of findings) console.error(`  - ${finding}`);
    return 1;
  }

  const count = readdirSync(join(repo, HOOKS_DIR_NAME)).filter(isHookFile).length;
  console.log(`[hook-liveness] clean — ${count} hook(s) tracked, activated and reachable`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
