/**
 * Every gate script here is also a library: `check-product-view.mjs` is imported
 * by the ledger, the ledger by the renderer. So each one carries an entry guard,
 * and the guard is the only thing that makes `node scripts/<gate>.mjs` do any
 * work at all. Nothing tested it, and the obvious form of it is wrong:
 *
 *   import.meta.url === pathToFileURL(process.argv[1]).href
 *
 * `import.meta.url` is realpath-resolved; `argv[1]` keeps the link it was typed
 * as. On macOS `/tmp` and `/var` are symlinks, as is any worktree reached
 * through one, so under those paths the comparison says "this file was imported"
 * and the process exits 0 having done nothing. A gate that reports success
 * without judging is worse than one that fails, and the symptom — exit 0, no
 * output — is indistinguishable from a gate with nothing to say.
 *
 * The contract pinned here is the one an agent depends on: **the path you invoke
 * by does not change what the CLI does**. Each case runs the script twice, once
 * by its real path and once through a symlinked directory, and requires the two
 * runs to be identical.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const scriptsDir = realpathSync(join(import.meta.dirname, ".."));
const root = mkdtempSync(join(tmpdir(), "cli-entry-guard-"));
// One link for the whole file: `node <link>/<script>` is exactly what an agent
// does when its checkout sits behind a symlink.
const linkedDir = join(root, "scripts-link");
symlinkSync(scriptsDir, linkedDir, "dir");
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * The environment a case gets: the ambient one minus every `GITHUB_*` / `PR_*`
 * variable. Actions sets `GITHUB_EVENT_NAME` on every step, so inheriting it
 * would make these cases pass or fail by which event triggered the run — on
 * `push` to main the gate is exempt (`eventName !== "pull_request"`), the
 * assertion flips, and the suite goes red only after merge. Each case declares
 * the context it means to test instead.
 */
function baseEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GITHUB_") || key.startsWith("PR_")) delete env[key];
  }
  return env;
}

/** Both spellings of the same file, so a case can be run through each. */
function runBoth(script, args, { env = {}, input } = {}) {
  const run = (path) =>
    spawnSync("node", [path, ...args], {
      encoding: "utf8",
      input,
      env: { ...baseEnv(), ...env },
    });
  const direct = run(join(scriptsDir, script));
  const linked = run(join(linkedDir, script));
  return { direct, linked };
}

describe("a gate CLI does the same thing whichever path invoked it", () => {
  it("check-product-view judges the body it was given", () => {
    // No section in the body, so the gate must fail: exit 1 plus the prompts.
    // A no-op exit 0 would read as "the body is fine" to every caller.
    const { direct, linked } = runBoth("check-product-view.mjs", [], {
      env: {
        GITHUB_EVENT_NAME: "pull_request",
        PR_BODY: "## Summary\n\nno product view here",
        PR_AUTHOR: "octocat",
      },
    });

    expect(direct.status).toBe(1);
    expect(direct.stdout).toContain("产品视角");
    expect(linked.status, "the symlinked invocation did nothing").toBe(direct.status);
    expect(linked.stdout).toBe(direct.stdout);
    expect(linked.stderr).toBe(direct.stderr);
  });

  it("issue-tracker-ledger answers --config", () => {
    const { direct, linked } = runBoth("issue-tracker-ledger.mjs", [
      "--config",
      "--owner",
      "octocat",
    ]);

    expect(direct.status).toBe(0);
    const config = JSON.parse(direct.stdout);
    expect(Object.keys(config).length).toBeGreaterThan(0);
    expect(linked.status).toBe(direct.status);
    expect(linked.stdout).toBe(direct.stdout);
  });

  it("product-view-section rejects a malformed command line with exit 2", () => {
    // Exit 2 before touching `gh`, so the case needs no network and no stub:
    // a broken guard exits 0 with no output, which is the tell.
    const { direct, linked } = runBoth("product-view-section.mjs", ["810", "--repo"]);

    expect(direct.status).toBe(2);
    expect(direct.stderr).toContain("usage:");
    expect(linked.status, "the symlinked invocation did nothing").toBe(direct.status);
    expect(linked.stdout).toBe(direct.stdout);
    expect(linked.stderr).toBe(direct.stderr);
  });
});
