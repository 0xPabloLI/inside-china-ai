/**
 * The resolver is only half the change: if the answer never reaches the git
 * process, every pure test above still passes and pushes still use the pinned
 * port. These cases therefore run the real CLI and read the answer back *out of
 * git* — once through `git config --get` (the `-c` arguments) and once through a
 * shell alias (the exported environment, which is what hooks inherit).
 *
 * `GIT_WITH_PROXY_PORT` is what makes this possible without a network: it skips
 * probing and pins the port, so the assertions are about wiring only. The port
 * is deliberately not the repo's configured 7890 — a test that passes when the
 * wrapper forwards nothing would prove nothing.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scriptsDir = realpathSync(join(import.meta.dirname, ".."));
const cli = join(scriptsDir, "git-with-proxy.mjs");
const FORCED_PORT = 9999;
const FORCED_URL = `http://127.0.0.1:${FORCED_PORT}`;

function run(args, { env = {} } = {}) {
  // Inherit as little as possible: `GITHUB_*`/`PR_*` and any pre-existing proxy
  // variable would make the case pass or fail by the caller's environment.
  const base = { ...process.env };
  for (const key of Object.keys(base)) {
    if (/^(GITHUB_|PR_|GIT_CONFIG_)/.test(key)) delete base[key];
  }
  return spawnSync("node", [cli, ...args], {
    encoding: "utf8",
    env: { ...base, GIT_WITH_PROXY_PORT: String(FORCED_PORT), ...env },
  });
}

describe("the resolved URL reaches git", () => {
  it("pins http.proxy over whatever .git/config already says", () => {
    const result = run(["--", "config", "--get", "http.proxy"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(FORCED_URL);
  });

  it("exports the URL to the processes git spawns", () => {
    // Hooks (semgrep, osv-scanner) and `--exec` children read the environment,
    // not git's config, so this is the leg that keeps pre-push working.
    const result = run(["-c", "alias.dumpenv=!printenv HTTP_PROXY", "dumpenv"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(FORCED_URL);
  });

  it("keeps its own flags out of the git command line", () => {
    // A leaked `--direct` would make git fail on an unknown option, so a clean
    // exit here is the assertion.
    const result = run(["--direct", "--", "config", "--get", "http.proxy"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(FORCED_URL);
  });

  it("prints the port alone for callers that only want the answer", () => {
    const result = run(["--print-port"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(FORCED_URL);
    expect(result.stderr).toBe("");
  });

  it("rejects a malformed forced port instead of guessing one", () => {
    const result = run(["--print-port"], { env: { GIT_WITH_PROXY_PORT: "not-a-port" } });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("GIT_WITH_PROXY_PORT");
  });
});
