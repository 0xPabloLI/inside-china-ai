/**
 * `scripts/lib/proxy-env.sh` is the leg that reaches scripts which are not the
 * wrapper: `session-launcher.sh` sources it so its `fetch`, `ls-remote` and
 * `push --delete` stop depending on whatever `.git/config` pinned months ago.
 *
 * Two cases, because they fail differently. The functional one proves the helper
 * exports something git actually reads. The static one catches the regression
 * that the functional one cannot see: deleting the `source` line from the
 * launcher leaves the helper working and every other test green, while the
 * closeout quietly goes back to the stale port.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = realpathSync(join(import.meta.dirname, "..", ".."));
const helper = "scripts/lib/proxy-env.sh";
const FORCED_PORT = 9999;
const FORCED_URL = `http://127.0.0.1:${FORCED_PORT}`;

function source(subshell, { forcedPort } = {}) {
  const base = { ...process.env };
  for (const key of Object.keys(base)) {
    if (/^(GITHUB_|PR_|GIT_CONFIG_)/.test(key)) delete base[key];
  }
  return spawnSync("bash", ["-c", subshell], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...base, GIT_WITH_PROXY_PORT: forcedPort ?? String(FORCED_PORT) },
  });
}

describe("proxy-env.sh", () => {
  it("injects the resolved proxy through GIT_CONFIG_*, which git reads like `-c`", () => {
    const result = source(`. ${helper}; git config --get http.proxy`);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(FORCED_URL);
  });

  it("warns instead of going quiet when nothing resolves", () => {
    // Fail-open keeps the closeout runnable, but silence would make "the proxy
    // moved" indistinguishable from "there is no proxy".
    const result = source(`. ${helper}; git config --get http.proxy || true`, {
      forcedPort: "none",
    });

    expect(result.stderr).toContain("[proxy-env] no local proxy resolved");
    expect(result.stdout).not.toContain(String(FORCED_PORT));
  });
});

describe("session-launcher.sh", () => {
  it("sources the helper, so its network git calls get the same answer", () => {
    // Static on purpose: the launcher's output never shows which proxy its git
    // calls used, so there is nothing to assert at runtime. This catches the one
    // regression that matters — the source line disappearing.
    const launcher = readFileSync(join(repoRoot, "scripts/session-launcher.sh"), "utf8");

    expect(launcher).toMatch(/^\s*\.\s+"\$ROOT\/scripts\/lib\/proxy-env\.sh"\s*$/m);
  });
});
