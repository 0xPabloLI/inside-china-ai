import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { cpSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
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

function runGate(repo, script = GATE) {
  const result = spawnSync(process.execPath, [script, "--repo", repo], { encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** Default mode: inspect every worktree of the repo the cwd belongs to. */
function runGateAll(repo) {
  const result = spawnSync(process.execPath, [GATE], { cwd: repo, encoding: "utf8" });
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
  let extraDirs;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "hook-liveness-"));
    hooksDir = join(repo, ".githooks");
    mkdirSync(hooksDir, { recursive: true });
    git(repo, "init", "-q", "--initial-branch=main");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "test");
    extraDirs = [];
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    for (const dir of extraDirs) rmSync(dir, { recursive: true, force: true });
  });

  /** A linked worktree of `repo`, as `session:start` creates them. */
  function addWorktree() {
    const dir = mkdtempSync(join(tmpdir(), "hook-liveness-wt-"));
    extraDirs.push(dir);
    git(repo, "worktree", "add", "-q", "-b", `session/wt${extraDirs.length}`, dir, "HEAD");
    return dir;
  }

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

  it("runs when the script path needs URL encoding (a space in the path)", () => {
    makeLiveRepo();
    const dir = mkdtempSync(join(tmpdir(), "gate path "));
    const script = join(dir, "check-hook-liveness.mjs");
    cpSync(GATE, script);

    const { status, output } = runGate(repo, script);
    expect(output).toMatch(/1 hook/i);
    expect(status).toBe(0);
  });

  it("ignores tracked non-hook files in the hooks dir (a README is not a hook)", () => {
    makeLiveRepo();
    writeFileSync(join(hooksDir, "README.md"), "hooks live here\n", { mode: 0o644 });
    git(repo, "add", ".githooks/README.md");
    git(repo, "commit", "-q", "-m", "add notes");

    expect(runGate(repo).status).toBe(0);
  });

  it("ignores dotfiles in the hooks dir (the installer skips them too)", () => {
    makeLiveRepo();
    writeFileSync(join(hooksDir, ".DS_Store"), "");

    expect(runGate(repo).status).toBe(0);
  });

  it("ignores a directory that merely shares a hook's name", () => {
    makeLiveRepo();
    mkdirSync(join(hooksDir, "post-checkout"));

    expect(runGate(repo).status).toBe(0);
  });

  // The launcher's self-check covers the worktree it just created; this default
  // mode covers every other one — a per-worktree `core.hooksPath` pointing at a
  // deleted checkout leaves a worktree whose commits run no gate at all, and
  // nothing else reports it (#864).
  it("default mode checks every worktree and passes when all are live", () => {
    makeLiveRepo();
    addWorktree();

    const { status, output } = runGateAll(repo);
    expect(output).toMatch(/2 worktree/i);
    expect(status).toBe(0);
  });

  it("default mode fails and names a worktree whose per-worktree hooksPath dangles", () => {
    makeLiveRepo();
    const wt = addWorktree();
    const gone = join(wt, "deleted-outer-worktree", ".githooks");
    git(repo, "config", "extensions.worktreeConfig", "true");
    git(wt, "config", "--worktree", "core.hooksPath", gone);

    const { status, output } = runGateAll(repo);
    expect(status).toBe(1);
    expect(output).toContain(wt);
    expect(output).toMatch(/core\.hooksPath/);
    expect(output).toMatch(/pre-commit/);
  });

  it("default mode refuses a vacuous pass when there is no worktree to check", () => {
    const bare = mkdtempSync(join(tmpdir(), "hook-liveness-bare-"));
    extraDirs.push(bare);
    git(bare, "init", "-q", "--bare");

    const { status, output } = runGateAll(bare);
    expect(status).toBe(1);
    expect(output).toMatch(/no worktree to check/);
  });
});
