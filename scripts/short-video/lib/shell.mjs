/**
 * The one seam for shell command construction (#1598).
 *
 * Two ways to run a child process, in order of preference:
 *
 * 1. `execFile(bin, args)` / `execFileSync(bin, args)` — no shell, so a path or
 *    a URL can never become syntax. Use this whenever the command is a binary
 *    plus arguments.
 * 2. `execShell(sh`...`)` — for commands that genuinely need shell syntax
 *    (`source`, redirections, `&&`). Every interpolation MUST go through the
 *    `sh` tag, which quotes the value with `shellQuote` and makes it data.
 *
 * `execShell` is the only export in the pipeline that imports `exec`; the
 * `no-shell-interpolation` test fails if another production module imports
 * `exec`/`execSync` or hands an untagged template to a shell runner. That is
 * what keeps the boundary from drifting back: the safe pattern is the only
 * pattern the guard can see.
 *
 * @module shell
 */

import { exec } from "child_process";
import { promisify } from "util";
import { shellQuote } from "./shell-quote.mjs";

export { shellQuote };

/**
 * Tagged template: every `${value}` becomes one quoted shell word.
 *
 * Only single values may be interpolated. A fragment that is already a shell
 * expression (e.g. `offlineEnvPrefix()` assignments) must be composed outside
 * the template — quoting it would turn the fragment into one literal word.
 *
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {string}
 */
export function sh(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += shellQuote(values[i]) + strings[i + 1];
  }
  return out;
}

/** Promisified `exec`; callers pass a command built with `sh` or literals. */
export const execShell = promisify(exec);
