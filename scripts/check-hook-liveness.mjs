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
 *   --repo <path>  inspect exactly this checkout (session:start asserts the
 *                  worktree it just created this way)
 *   (no flag)      inspect every worktree of the repo the cwd belongs to — a
 *                  linked worktree carries its own per-worktree
 *                  `core.hooksPath`, and one that points at a deleted checkout
 *                  runs no hook at all while git reports no error (#864)
 *
 * Exit: 0 = every hook is tracked, activated and reachable; 1 = otherwise.
 */

import { execFileSync } from "node:child_process";
import { accessSync, constants, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * A name git would run as a hook, filtered the way `setup:hooks` filters when
 * it chmods: a real file (symlinks followed), not a `.sample` template, not a
 * dotfile, not notes. The two must agree, or the gate judges files the
 * installer never touched.
 */
function isInstalledHook(dir, name) {
  if (name.endsWith(".sample") || name.startsWith(".") || name.endsWith(".md")) return false;
  return statSync(join(dir, name), { throwIfNoEntry: false })?.isFile() === true;
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
 * @returns {{ hooks: string[], findings: string[] }} the hooks found, and one
 *   message per failed check (no findings means live)
 */
function findHookLivenessFindings(repo) {
  const findings = [];
  const hooksDir = join(repo, HOOKS_DIR_NAME);

  let present;
  try {
    present = readdirSync(hooksDir)
      .filter((name) => isInstalledHook(hooksDir, name))
      .sort();
  } catch {
    return { hooks: [], findings: [`${HOOKS_DIR_NAME}/ is missing — no hook can be activated`] };
  }
  if (present.length === 0) {
    return {
      hooks: [],
      findings: [`${HOOKS_DIR_NAME}/ holds no hooks — vacuous gate, refusing to report green`],
    };
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
    if (!isInstalledHook(hooksDir, basename(path))) continue;
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
    return { hooks: present, findings };
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
    for (const name of readdirSync(defaultDir)
      .filter((entry) => isInstalledHook(defaultDir, entry))
      .sort()) {
      findings.push(
        `${defaultDir}/${name} is inert — git reads ${configured}, never the default hooks ` +
          "directory; the file never runs (delete it, or move it into the tracked hooks directory)",
      );
    }
  }

  return { hooks: present, findings };
}

/**
 * Every non-bare worktree of the repo `cwd` belongs to. `git worktree list` is
 * shared state, so this answers the same from any of them; a bare repo has no
 * checkout to judge and is dropped. Porcelain paths are raw, never quoted.
 *
 * @param {string} cwd
 * @returns {string[]} existing worktree roots
 */
function listWorktrees(cwd) {
  const entries = [];
  let current = null;
  for (const line of git(cwd, "worktree", "list", "--porcelain").split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length), bare: false };
      entries.push(current);
    } else if (line === "bare" && current) {
      current.bare = true;
    }
  }
  return entries
    .filter(
      (entry) =>
        !entry.bare && statSync(entry.path, { throwIfNoEntry: false })?.isDirectory() === true,
    )
    .map((entry) => entry.path);
}

function main(argv) {
  const flag = argv.indexOf("--repo");

  // One checkout on request — session:start passes the worktree it just made.
  if (flag >= 0) return reportSingle(resolve(argv[flag + 1] || process.cwd()));

  // Default: every worktree. A linked worktree's per-worktree core.hooksPath is
  // invisible to the main checkout's own check, and a dangling one means that
  // worktree's commits run no gate while git reports no error (#864).
  let worktrees;
  try {
    worktrees = listWorktrees(process.cwd());
  } catch (error) {
    console.error(`check-hook-liveness: ${process.cwd()}: ${error.message}`);
    return 1;
  }
  // Non-vacuity, same as the single-checkout mode: a bare repo has no checkout
  // to judge, and "nothing to check" must never read as green.
  if (worktrees.length === 0) {
    console.error(
      `check-hook-liveness: ${process.cwd()}: no worktree to check — refusing a vacuous pass`,
    );
    return 1;
  }

  const failed = [];
  for (const wt of worktrees) {
    let findings;
    try {
      ({ findings } = findHookLivenessFindings(wt));
    } catch (error) {
      findings = [error.message];
    }
    if (findings.length > 0) failed.push({ wt, findings });
  }

  if (failed.length > 0) {
    console.error(
      `[hook-liveness] FAIL — ${failed.length} of ${worktrees.length} worktree(s) have findings`,
    );
    for (const { wt, findings } of failed) {
      console.error(`${wt}:`);
      for (const finding of findings) console.error(`  - ${finding}`);
    }
    return 1;
  }

  console.log(
    `[hook-liveness] clean — ${worktrees.length} worktree(s) checked, hooks tracked, activated and reachable`,
  );
  return 0;
}

function reportSingle(repo) {
  let hooks;
  let findings;
  try {
    ({ hooks, findings } = findHookLivenessFindings(repo));
  } catch (error) {
    console.error(`check-hook-liveness: ${repo}: ${error.message}`);
    return 1;
  }

  if (findings.length > 0) {
    console.error(`[hook-liveness] FAIL — ${findings.length} finding(s) in ${repo}`);
    for (const finding of findings) console.error(`  - ${finding}`);
    return 1;
  }

  console.log(`[hook-liveness] clean — ${hooks.length} hook(s) tracked, activated and reachable`);
  return 0;
}

// Run main() only on direct execution, not when imported. Comparing file
// paths (not URL strings) keeps this true when the path needs URL encoding,
// and realpathSync keeps it true through a symlink.
const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === thisFile) {
  process.exit(main(process.argv.slice(2)));
}
