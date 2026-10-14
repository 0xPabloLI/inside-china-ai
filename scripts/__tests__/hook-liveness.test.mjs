import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Hook liveness gate (#406). The failure it exists to catch: a hook that
// exists somewhere git never reads, so every check it performs silently does
// not happen. Two real instances shipped that way —
//   (a) `.githooks/` ignored by .gitignore, so post-checkout/post-commit/
//       post-merge reached no clone at all;
//   (b) hooks written into `.git/hooks/` while core.hooksPath pointed at
//       `.githooks/`, which is the path git stops reading entirely.
// Each fixture below reproduces one of those shapes in a throwaway repo.

const GATE = join(import.meta.dirname, "..", "check-hook-liveness.mjs");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] }).toString();
}

function runGate(repo) {
  const result = spawnSync(process.execPath, [GATE, "--repo", repo], { encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** A hook file with the exec bit, as the repo tracks them (100755). */
function writeHook(dir, name, body = "#!/bin/sh\nexit 0\n") {
  const path = join(dir, name);
  writeFileSync(path, body, { mode: 0o755 });
  return path;
}

describe("check-hook-liveness", () => {
  let repo;
  let hooksDir;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "hook-liveness-"));
    hooksDir = join(repo, ".githooks");
    mkdirSync(hooksDir, { recursive: true });
    git(repo, "init", "-q", "--initial-branch=main");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "test");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  /** The healthy shape: one tracked, executable hook, hooksPath activated. */
  function makeLiveRepo() {
    writeHook(hooksDir, "pre-commit");
    git(repo, "add", ".githooks/pre-commit");
    git(repo, "commit", "-q", "-m", "init");
    git(repo, "config", "core.hooksPath", ".githooks");
  }

  it("passes on a checkout whose hooks are tracked, activated and readable", () => {
    makeLiveRepo();
    const { status, output } = runGate(repo);
    expect(output).toMatch(/1 hook/i);
    expect(status).toBe(0);
  });

  it("fails when a hook is ignored and never reaches a clone (the .gitignore hole)", () => {
    writeHook(hooksDir, "pre-commit");
    writeHook(hooksDir, "post-commit"); // written but never added
    writeFileSync(join(repo, ".gitignore"), ".githooks/\n");
    git(repo, "add", ".gitignore");
    git(repo, "commit", "-q", "-m", "init");
    // Force-add models what the repo did before the rule was removed: the file
    // is present on disk in this checkout while the rule keeps it out of clones.
    git(repo, "add", "-f", ".githooks/pre-commit");
    git(repo, "commit", "-q", "-m", "add one hook");
    git(repo, "config", "core.hooksPath", ".githooks");

    const { status, output } = runGate(repo);
    expect(status).toBe(1);
    expect(output).toMatch(/post-commit/);
    expect(output).toMatch(/not tracked/i);
  });

  it("fails when core.hooksPath is unset — the hooks are on disk but git reads none", () => {
    writeHook(hooksDir, "pre-commit");
    git(repo, "add", ".githooks/pre-commit");
    git(repo, "commit", "-q", "-m", "init");

    const { status, output } = runGate(repo);
    expect(status).toBe(1);
    expect(output).toMatch(/core\.hooksPath/);
    expect(output).toMatch(/setup:hooks/);
  });

  it("fails on shadow hooks in the default dir, which git never reads once hooksPath is set", () => {
    makeLiveRepo();
    writeHook(join(repo, ".git", "hooks"), "pre-push");

    const { status, output } = runGate(repo);
    expect(status).toBe(1);
    expect(output).toMatch(/pre-push/);
    expect(output).toMatch(/never (be )?(read|run)|inert|shadow/i);
  });

  it("ignores .sample files in the default dir — git ships those", () => {
    makeLiveRepo();
    writeHook(join(repo, ".git", "hooks"), "pre-commit.sample");

    expect(runGate(repo).status).toBe(0);
  });

  it("fails when the activated dir is missing a tracked hook", () => {
    makeLiveRepo();
    writeHook(hooksDir, "commit-msg");
    git(repo, "add", ".githooks/commit-msg");
    git(repo, "commit", "-q", "-m", "add commit-msg");
    // The activation points at another directory that has only one of the two.
    const other = join(repo, "elsewhere");
    mkdirSync(other, { recursive: true });
    writeHook(other, "pre-commit");
    git(repo, "config", "core.hooksPath", "elsewhere");

    const { status, output } = runGate(repo);
    expect(status).toBe(1);
    expect(output).toMatch(/commit-msg/);
  });

  it("fails when a tracked hook lost its exec bit in the index", () => {
    writeHook(hooksDir, "pre-commit");
    git(repo, "add", ".githooks/pre-commit");
    git(repo, "update-index", "--chmod=-x", ".githooks/pre-commit");
    git(repo, "commit", "-q", "-m", "init");
    git(repo, "config", "core.hooksPath", ".githooks");

    const { status, output } = runGate(repo);
    expect(status).toBe(1);
    expect(output).toMatch(/exec/i);
    expect(output).toMatch(/pre-commit/);
  });

  it("fails when the hooks dir holds nothing to check (vacuous gate)", () => {
    writeFileSync(join(repo, ".gitignore"), "");
    git(repo, "add", ".gitignore");
    git(repo, "commit", "-q", "-m", "init");
    git(repo, "config", "core.hooksPath", ".githooks");

    const { status, output } = runGate(repo);
    expect(status).toBe(1);
    expect(output).toMatch(/no hooks|vacuous/i);
  });
});
