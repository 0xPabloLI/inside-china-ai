import { execFileSync } from "node:child_process";

/**
 * Shared thin wrapper around `gh` CLI for the repo's scripts that shell out to
 * it (selector-health, pool-canary, the product-view renderer).
 */
export function runGh(args, inputEnv = {}) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, ...inputEnv },
  }).trim();
}
