import { execFileSync } from "node:child_process";

/**
 * Shared thin wrapper around `gh` CLI for canary and health-alert scripts.
 */
export function runGh(args, inputEnv = {}) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, ...inputEnv },
  }).trim();
}
