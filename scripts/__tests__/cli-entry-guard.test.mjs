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
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const scriptsDir = realpathSync(join(import.meta.dirname, ".."));
const repoRoot = realpathSync(join(scriptsDir, ".."));
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

describe("no script reintroduces a guard the symlink defeats", () => {
  /**
   * The three CLIs above are pinned by running them. The rest cannot be: most
   * reach the network, a CDP browser or a paid API as their first act, so "did
   * it run" has to be read off the source instead. Each banned shape compares
   * two strings that resolve differently — `import.meta.url` is realpath-
   * resolved, `argv[1]` is not — so each reads a symlinked path as an import and
   * turns the CLI into a silent no-op.
   */
  const BANNED = [
    {
      name: "the `file://` template guard",
      // Breaks twice over: a space in the path is not URL-encoded, and no
      // symlink is ever resolved.
      test: (line) => line.includes("`file://${process.argv[1]}`"),
    },
    {
      name: "comparing pathToFileURL(argv[1]) to import.meta.url",
      // pathToFileURL does not resolve symlinks, so the two sides can never
      // match for a path that contains one.
      test: (line) => line.includes("pathToFileURL(process.argv[1])"),
    },
    {
      name: "comparing resolve(argv[1]) to import.meta.url",
      // path.resolve normalizes `..` but keeps symlinks. `\b` rather than a
      // boundary character, so the qualified `path.resolve(...)` spelling — the
      // one `searxng/lifecycle.mjs` carried — is covered too.
      test: (line, source) =>
        /\bresolve\(process\.argv\[1\]\)/.test(line) &&
        !line.includes("realpathSync") &&
        source.includes("fileURLToPath(import.meta.url)"),
    },
    {
      name: "matching the script's basename",
      // `.endsWith` and `.includes` on the invoked path accept any file with
      // that name anywhere on disk, which is how a guard fires on the wrong
      // process — `snapshot-trending.mjs` carried both spellings.
      test: (line) =>
        line.includes("process.argv[1].endsWith(") || line.includes("process.argv[1].includes("),
    },
  ];

  /**
   * Every first-party CLI-shaped script, minus tests and vendored trees. Walked
   * with `readdir` rather than shelling out to `rg`: a gate that depends on an
   * external binary being on PATH fails open wherever it is not.
   */
  function cliScripts() {
    const found = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          walk(join(dir, entry.name));
        } else if (entry.name.endsWith(".mjs")) {
          const path = join(dir, entry.name);
          if (readFileSync(path, "utf8").includes("process.argv[1]")) {
            found.push(relative(repoRoot, path));
          }
        }
      }
    };
    walk(scriptsDir);
    return found.sort();
  }

  it("scans a directory that actually contains the scripts", () => {
    // A glob that silently matches nothing is how this kind of gate stops
    // working without anyone noticing.
    const found = cliScripts();
    expect(found.length).toBeGreaterThan(25);
    expect(found).toContain("scripts/product-view-section.mjs");
  });

  it.each(BANNED)("rejects $name", ({ test }) => {
    const offenders = [];
    for (const file of cliScripts()) {
      const source = readFileSync(join(repoRoot, file), "utf8");
      source.split("\n").forEach((line, i) => {
        if (test(line, source)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, "use realpathSync(argv[1]) === fileURLToPath(import.meta.url)").toEqual([]);
  });

  /**
   * The bans above only catch a shape somebody thought of. These cases feed the
   * shapes this repository actually shipped to the rule set, so a future edit
   * that narrows a rule fails here even if no file in the tree carries it.
   */
  it.each([
    ["path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)", "resolve(argv[1])"],
    [
      "const isMain = resolve(process.argv[1]) === fileURLToPath(import.meta.url);",
      "resolve(argv[1])",
    ],
    ['if (process.argv[1].includes("snapshot-trending")) {', "basename"],
    [
      'const isMainModule = process.argv[1] && process.argv[1].endsWith("asset-sourcer.mjs");',
      "basename",
    ],
    ["if (import.meta.url === `file://${process.argv[1]}`) {", "`file://`"],
    [
      "if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {",
      "pathToFileURL",
    ],
  ])("flags %s", (line, expectedName) => {
    const hits = BANNED.filter((rule) =>
      rule.test(
        line,
        "import { fileURLToPath } from 'node:url'; // fileURLToPath(import.meta.url)",
      ),
    ).map((rule) => rule.name);
    expect(hits.join(" | ")).toContain(expectedName);
  });

  it("leaves the accepted guard alone", () => {
    // The positive target, so the rule set is checked for false positives too.
    const line =
      "if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {";
    expect(BANNED.filter((rule) => rule.test(line, line))).toEqual([]);
  });
});
