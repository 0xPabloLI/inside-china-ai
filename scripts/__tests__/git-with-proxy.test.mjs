/**
 * The resolver is only half the change: if the answer never reaches the git
 * process, every pure test above still passes and pushes still use the pinned
 * port. These cases therefore run the real CLI and read the answer back *out of
 * git* — once through `git config --get` (the `-c` arguments) and once through a
 * shell alias (the exported environment, which is what hooks inherit).
 *
 * `GIT_WITH_PROXY_PORT` is what makes this possible without a network: a port
 * number pins the answer, `none` makes the resolution fail, so both wiring and
 * refusal are testable. The pinned port is deliberately not the repo's configured
 * 7890 — a test that passes when the wrapper forwards nothing would prove
 * nothing.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scriptsDir = realpathSync(join(import.meta.dirname, ".."));
const cli = join(scriptsDir, "git-with-proxy.mjs");
const FORCED_PORT = 9999;
const FORCED_URL = `http://127.0.0.1:${FORCED_PORT}`;

function run(args, { forcedPort = String(FORCED_PORT) } = {}) {
  // Inherit as little as possible: `GITHUB_*`/`PR_*` and any pre-existing proxy
  // or git-config variable would make the case pass or fail by the caller's
  // environment.
  const base = { ...process.env };
  for (const key of Object.keys(base)) {
    if (/^(GITHUB_|PR_|GIT_CONFIG_)/.test(key)) delete base[key];
  }
  return spawnSync("node", [cli, ...args], {
    encoding: "utf8",
    env: { ...base, GIT_WITH_PROXY_PORT: forcedPort },
  });
}

describe("the resolved proxy reaches git", () => {
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
    // Both halves matter: a leaked `--direct` would make git fail on an unknown
    // option, so a clean exit says the flag was consumed; the URL coming back as
    // FORCED_URL says `--direct` did not detour around a proxy that did resolve.
    const result = run(["--direct", "--", "config", "--get", "http.proxy"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(FORCED_URL);
  });
});

describe("nothing resolved", () => {
  it("refuses to run git rather than quietly going direct", () => {
    // The failure mode worth preventing: the command succeeds or fails on git's
    // own connectivity while the caller believes it went through a proxy.
    const result = run(["--", "config", "--get", "http.proxy"], { forcedPort: "none" });

    expect(result.status).toBe(3);
    expect(result.stderr).toContain("refusing to guess");
    expect(result.stdout).toBe("");
  });

  it("runs direct only when asked, with the pinned proxy keys emptied", () => {
    // An empty value is git's "connect directly"; leaving `.git/config`'s 7890
    // in place would reproduce the very failure the wrapper exists to avoid.
    const result = run(["--direct", "--", "config", "--get", "http.proxy"], {
      forcedPort: "none",
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
    expect(result.stderr).toContain("--direct");
  });

  it("reports the same exit code from the resolution-only mode", () => {
    const result = run(["--print-url"], { forcedPort: "none" });

    expect(result.status).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("no port forwarded");
  });
});

describe("flags meant for git stay git's", () => {
  it("passes -h through instead of printing its own usage", () => {
    // Scanning the whole argv for `--help`/`-h` would answer `git log -h` with
    // the wrapper's usage and never run git — a silent divergence no caller
    // could see. Only leading flags are the wrapper's.
    const result = run(["--", "log", "-h"]);

    expect(result.stdout).toContain("usage: git log");
    expect(result.stdout).not.toContain("node scripts/git-with-proxy.mjs --print-url");
  });

  it("hands a leading option it does not know to git, not to itself", () => {
    // `-c key=value`, `-C <dir>`, `--exec-path` are git's own leading options;
    // consuming every leading flag would make `git -c …` unreachable through
    // the wrapper. An unknown token is therefore git's to reject.
    const result = run(["--nope"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--nope");
    expect(result.stderr).not.toContain("[git-proxy] unknown option");
  });
});

describe("resolution-only mode", () => {
  it("prints the URL alone, so a shell can capture it", () => {
    const result = run(["--print-url"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(FORCED_URL);
    expect(result.stderr).toBe("");
  });

  it("rejects a malformed forced value instead of guessing one", () => {
    const result = run(["--print-url"], { forcedPort: "not-a-port" });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("GIT_WITH_PROXY_PORT");
  });
});
