import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// session-launcher stop flow (#195): a removed worktree means the session
// ended — the session branch is deleted when fully merged (`git branch -d`,
// never -D), and kept when the worktree was dirty (work never landed) or
// the branch holds unmerged commits.

const LAUNCHER = join(import.meta.dirname, "..", "session-launcher.sh");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] }).toString();
}

describe("session-launcher stop: session branch cleanup (#195)", () => {
  let repo;
  let wt;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "launcher-test-repo-"));
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "test");
    mkdirSync(join(repo, "docs"), { recursive: true });
    writeFileSync(join(repo, "docs", "a.md"), "a");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  function stop(wtpath) {
    // Production usage runs session:stop from inside the repo — the
    // launcher's git commands resolve against its cwd.
    const r = spawnSync("bash", [LAUNCHER, "stop", wtpath], { encoding: "utf-8", cwd: repo });
    expect(r.status).toBe(0); // stop never fails hard (#195: deletion is best-effort)
    return r.stdout;
  }

  function makeWorktree(branch) {
    wt = join(repo, "wt-" + branch);
    git(repo, "worktree", "add", "-b", branch, wt);
    const wtGitDir = git(wt, "rev-parse", "--absolute-git-dir").trim();
    mkdirSync(join(wtGitDir, "session-pilot"), { recursive: true });
    writeFileSync(
      join(wtGitDir, "session-pilot", "current-session"),
      branch.replace(/^session\//, "") + "\n",
    );
    return wtGitDir;
  }

  it("merged branch is deleted after stop (worktree removed, branch fully merged)", () => {
    const wtGitDir = makeWorktree("session/20260101-merged-abc123");
    const out = stop(wt);
    expect(existsSync(wt)).toBe(false);
    expect(
      existsSync(join(repo, ".git", "refs", "heads", "session", "20260101-merged-abc123")),
    ).toBe(false);
    expect(out).toContain("merged session branch deleted: session/20260101-merged-abc123");
  });

  it("unmerged branch is kept with a reason (git branch -d safely refuses)", () => {
    const wtGitDir = makeWorktree("session/20260101-unmerged-def456");
    // A commit only on the session branch — git branch -d must refuse
    writeFileSync(join(wt, "wip.txt"), "unmerged work");
    git(wt, "add", ".");
    git(wt, "commit", "-q", "-m", "wip on branch");
    const out = stop(wt);
    expect(existsSync(wt)).toBe(false); // worktree itself is clean → removed
    expect(
      existsSync(join(repo, ".git", "refs", "heads", "session", "20260101-unmerged-def456")),
    ).toBe(true);
    expect(out).toContain(
      "session branch kept (unmerged and content differs from origin/main): session/20260101-unmerged-def456",
    );
  });

  it("dirty worktree: worktree kept, branch not touched", () => {
    const wtGitDir = makeWorktree("session/20260101-dirty-789abc");
    writeFileSync(join(wt, "dirty.txt"), "uncommitted");
    const out = stop(wt);
    expect(existsSync(wt)).toBe(true);
    expect(
      existsSync(join(repo, ".git", "refs", "heads", "session", "20260101-dirty-789abc")),
    ).toBe(true);
    expect(out).toContain("worktree kept (dirty or locked)");
    expect(out).toContain("session branch kept (worktree dirty)");
  });
});

// ─── gc: post-delivery closeout ─────────────────────────────────────────────
//
// `gc` is the merge-closeout step: refresh origin, fast-forward the main
// checkout when it is clean, and delete local/remote branches whose content
// already landed on origin/main. Squash merges never satisfy `git branch -d`
// (no ancestry), so the deletion criterion is per-file byte identity against
// origin/main — and every failed verification keeps the branch.

describe("session-launcher gc: post-delivery closeout", () => {
  let origin;
  let repo;
  let ghDir;

  beforeEach(() => {
    origin = mkdtempSync(join(tmpdir(), "launcher-gc-origin-"));
    git(origin, "init", "--bare", "-q", "--initial-branch=main");
    repo = mkdtempSync(join(tmpdir(), "launcher-gc-repo-"));
    git(repo, "clone", "-q", origin, ".");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "test");
    writeFileSync(join(repo, "a.txt"), "a\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");
    git(repo, "push", "-q", "-u", "origin", "main");
    ghDir = mkdtempSync(join(tmpdir(), "launcher-gc-gh-"));
    writeFakeGh(0);
  });

  afterEach(() => {
    rmSync(origin, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
    rmSync(ghDir, { recursive: true, force: true });
  });

  // writeFakeGh <openPrCount> — fake `gh` answering the open-PR probe; any
  // other invocation fails loudly so new gh dependencies surface in tests.
  function writeFakeGh(openPrCount) {
    const p = join(ghDir, "gh");
    writeFileSync(
      p,
      `#!/bin/bash\ncase "$*" in\n  *"pr list"*) echo "${openPrCount}"; exit 0 ;;\nesac\necho "fake gh: unhandled: $*" >&2\nexit 1\n`,
    );
    execFileSync("chmod", ["+x", p]);
  }

  // writeFailingGh — the open-PR probe itself errors (no auth / offline).
  function writeFailingGh() {
    const p = join(ghDir, "gh");
    writeFileSync(p, `#!/bin/bash\necho "gh: auth error" >&2\nexit 1\n`);
    execFileSync("chmod", ["+x", p]);
  }

  function gc(...args) {
    const r = spawnSync("bash", [LAUNCHER, "gc", ...args], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  }

  function branchExists(name) {
    return (
      spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`], { cwd: repo })
        .status === 0
    );
  }

  function remoteBranchExists(name) {
    return (
      spawnSync("git", ["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${name}`], {
        cwd: repo,
      }).status === 0
    );
  }

  // advanceOrigin pushes a new commit to origin/main from a second clone, so
  // the fixture's main checkout is strictly behind.
  function advanceOrigin() {
    const other = mkdtempSync(join(tmpdir(), "launcher-gc-other-"));
    git(repo, "clone", "-q", origin, other);
    git(other, "config", "user.email", "test@example.com");
    git(other, "config", "user.name", "test");
    writeFileSync(join(other, "b.txt"), "b\n");
    git(other, "add", ".");
    git(other, "commit", "-q", "-m", "advance origin");
    git(other, "push", "-q", "origin", "main");
    rmSync(other, { recursive: true, force: true });
  }

  // squashMergedBranch creates `name` with one commit, then lands the same
  // content on main as a separate commit and pushes — the exact shape a
  // squash merge leaves behind (content on main, no ancestry relation).
  function squashMergedBranch(name, content) {
    const wtPath = join(repo, "wt-" + name.replace(/[^a-z0-9]+/gi, "-"));
    git(repo, "worktree", "add", "-b", name, wtPath);
    writeFileSync(join(wtPath, "feature.txt"), content);
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "feature work");
    git(repo, "worktree", "remove", wtPath);
    writeFileSync(join(repo, "feature.txt"), content);
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "squash merge of " + name);
    git(repo, "push", "-q", "origin", "main");
  }

  it("deletes a squash-merged branch locally and on the remote", () => {
    squashMergedBranch("session/20260101-merged-abc123", "merged\n");
    git(repo, "push", "-q", "origin", "session/20260101-merged-abc123");

    const { status, out } = gc();
    expect(status).toBe(0);
    expect(branchExists("session/20260101-merged-abc123")).toBe(false);
    expect(remoteBranchExists("session/20260101-merged-abc123")).toBe(false);
    expect(out).toContain("deleted session/20260101-merged-abc123");
  });

  it("keeps a branch whose content is not on origin/main", () => {
    const wtPath = join(repo, "wt-unmerged");
    git(repo, "worktree", "add", "-b", "session/20260101-unmerged-def456", wtPath);
    writeFileSync(join(wtPath, "wip.txt"), "unmerged\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "wip");
    git(repo, "worktree", "remove", wtPath);
    git(repo, "push", "-q", "origin", "session/20260101-unmerged-def456");

    const { status, out } = gc();
    expect(status).toBe(0);
    expect(branchExists("session/20260101-unmerged-def456")).toBe(true);
    // A kept local branch pins its remote twin: the remote-only sweep must not
    // touch a remote whose local counterpart still holds unmerged work.
    expect(remoteBranchExists("session/20260101-unmerged-def456")).toBe(true);
    expect(out).toContain("kept session/20260101-unmerged-def456");
  });

  it("keeps a branch that is checked out in a worktree", () => {
    const wtPath = join(repo, "wt-live");
    git(repo, "worktree", "add", "-b", "session/20260101-live-aaa111", wtPath);

    const { out } = gc();
    expect(branchExists("session/20260101-live-aaa111")).toBe(true);
    expect(out).toContain("kept session/20260101-live-aaa111 (checked out in");
  });

  it("leaves branches outside the session namespace untouched", () => {
    git(repo, "branch", "personal-keep");

    const { out } = gc();
    expect(branchExists("personal-keep")).toBe(true);
    expect(out).not.toContain("personal-keep");
  });

  it("fast-forwards a clean main checkout that is behind origin/main", () => {
    advanceOrigin();
    const { status, out } = gc();
    expect(status).toBe(0);
    expect(git(repo, "rev-parse", "main").trim()).toBe(
      git(repo, "rev-parse", "refs/remotes/origin/main").trim(),
    );
    expect(out).toContain("main fast-forwarded");
  });

  it("skips the sync when the main checkout has tracked changes, and says so", () => {
    advanceOrigin();
    writeFileSync(join(repo, "a.txt"), "dirty\n");
    const before = git(repo, "rev-parse", "main").trim();

    const { out } = gc();
    expect(git(repo, "rev-parse", "main").trim()).toBe(before);
    expect(out).toContain("sync skipped");
  });

  it("--dry-run reports candidates without changing refs", () => {
    squashMergedBranch("session/20260101-dry-abc999", "dry\n");
    git(repo, "push", "-q", "origin", "session/20260101-dry-abc999");

    const { out } = gc("--dry-run");
    expect(branchExists("session/20260101-dry-abc999")).toBe(true);
    expect(remoteBranchExists("session/20260101-dry-abc999")).toBe(true);
    expect(out).toContain("would delete session/20260101-dry-abc999");
  });

  it("--dry-run never advances the origin/main tracking ref", () => {
    advanceOrigin();
    const stale = git(repo, "rev-parse", "refs/remotes/origin/main").trim();

    const { out } = gc("--dry-run");
    expect(git(repo, "rev-parse", "refs/remotes/origin/main").trim()).toBe(stale);
    // Zero writes means no fetch — the preview says so instead of pretending.
    expect(out).toContain("dry-run does not fetch");
  });

  it("keeps the remote branch when an open PR would be closed by deletion", () => {
    squashMergedBranch("session/20260101-openpr-abc777", "openpr\n");
    git(repo, "push", "-q", "origin", "session/20260101-openpr-abc777");
    writeFakeGh(1);

    const { out } = gc();
    expect(branchExists("session/20260101-openpr-abc777")).toBe(false); // local still cleaned
    expect(remoteBranchExists("session/20260101-openpr-abc777")).toBe(true);
    expect(out).toContain("kept remote origin/session/20260101-openpr-abc777 (open PR");

    // The local branch is now gone, so the remote is re-examined as an orphan
    // on the next run — and the open PR still blocks it.
    const second = gc();
    expect(remoteBranchExists("session/20260101-openpr-abc777")).toBe(true);
    expect(second.out).toContain("kept remote origin/session/20260101-openpr-abc777 (open PR");
  });

  it("keeps the remote branch when the open-PR check fails (fail-closed)", () => {
    squashMergedBranch("session/20260101-ghfail-abc888", "ghfail\n");
    git(repo, "push", "-q", "origin", "session/20260101-ghfail-abc888");
    writeFailingGh();

    const { out } = gc();
    expect(remoteBranchExists("session/20260101-ghfail-abc888")).toBe(true);
    expect(out).toContain("open-PR check failed — fail-closed");
  });

  // session:stop deletes the local branch right after a merge, so by the time
  // gc runs the remote twin often has no local counterpart at all. Without a
  // remote-only sweep it would linger on origin forever.
  it("sweeps a remote twin whose local branch is already gone", () => {
    squashMergedBranch("session/20260101-orphan-abc444", "orphan\n");
    git(repo, "push", "-q", "origin", "session/20260101-orphan-abc444");
    git(repo, "branch", "-D", "session/20260101-orphan-abc444");

    const { out } = gc();
    expect(remoteBranchExists("session/20260101-orphan-abc444")).toBe(false);
    expect(out).toContain("deleted remote origin/session/20260101-orphan-abc444");
  });

  it("keeps an orphaned remote twin whose content is not on origin/main", () => {
    const wtPath = join(repo, "wt-orphan-unmerged");
    git(repo, "worktree", "add", "-b", "session/20260101-orphanun-abc555", wtPath);
    writeFileSync(join(wtPath, "wip.txt"), "unmerged\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "wip");
    git(repo, "worktree", "remove", wtPath);
    git(repo, "push", "-q", "origin", "session/20260101-orphanun-abc555");
    git(repo, "branch", "-D", "session/20260101-orphanun-abc555");

    const { out } = gc();
    expect(remoteBranchExists("session/20260101-orphanun-abc555")).toBe(true);
    expect(out).toContain(
      "kept remote origin/session/20260101-orphanun-abc555 (content not verified merged)",
    );
  });

  it("--dry-run previews remote-twin deletions without touching them", () => {
    squashMergedBranch("session/20260101-dryremote-abc666", "dryremote\n");
    git(repo, "push", "-q", "origin", "session/20260101-dryremote-abc666");

    const { out } = gc("--dry-run");
    expect(remoteBranchExists("session/20260101-dryremote-abc666")).toBe(true);
    expect(out).toContain("would delete remote origin/session/20260101-dryremote-abc666");
  });

  it("deletes a branch whose change is a deletion that also landed on main", () => {
    const wtPath = join(repo, "wt-del");
    git(repo, "worktree", "add", "-b", "session/20260101-del-abc654", wtPath);
    git(wtPath, "rm", "a.txt");
    git(wtPath, "commit", "-q", "-m", "remove a");
    git(repo, "worktree", "remove", wtPath);
    git(repo, "rm", "a.txt");
    git(repo, "commit", "-q", "-m", "remove a on main");
    git(repo, "push", "-q", "origin", "main");

    const { out } = gc();
    expect(branchExists("session/20260101-del-abc654")).toBe(false);
    expect(out).toContain("deleted session/20260101-del-abc654");
  });

  it("leaves a divergent main checkout untouched", () => {
    writeFileSync(join(repo, "local.txt"), "local\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "local commit not on origin");
    advanceOrigin();

    const { out } = gc();
    expect(out).toContain("local commits not on origin/main");
    expect(branchExists("main")).toBe(true);
  });

  // core.quotePath c-quotes non-ASCII paths in `git diff --name-only`; the
  // quoted literal fed back as a pathspec matches nothing, and a diff over an
  // empty pathspec exits 0 — a fail-open that would delete unmerged work.
  it("keeps a branch with a non-ASCII filename whose content differs", () => {
    const wtPath = join(repo, "wt-unicode");
    git(repo, "worktree", "add", "-b", "session/20260101-unicode-abc222", wtPath);
    writeFileSync(join(wtPath, "中文测试.txt"), "branch content\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "unicode file");
    git(repo, "worktree", "remove", wtPath);

    const { out } = gc();
    expect(branchExists("session/20260101-unicode-abc222")).toBe(true);
    expect(out).toContain("kept session/20260101-unicode-abc222 (content not verified");
  });

  it("deletes a squash-merged branch whose file has a non-ASCII name", () => {
    const wtPath = join(repo, "wt-unicode-merged");
    git(repo, "worktree", "add", "-b", "session/20260101-unicode-ok-abc333", wtPath);
    writeFileSync(join(wtPath, "中文测试.txt"), "same content\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "unicode file");
    git(repo, "worktree", "remove", wtPath);
    writeFileSync(join(repo, "中文测试.txt"), "same content\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "squash unicode");
    git(repo, "push", "-q", "origin", "main");

    const { out } = gc();
    expect(branchExists("session/20260101-unicode-ok-abc333")).toBe(false);
    expect(out).toContain("deleted session/20260101-unicode-ok-abc333");
  });

  it("stop deletes a squash-merged session branch (content-verified -D)", () => {
    const id = "20260101-squash-stop-abc321";
    const wtPath = join(repo, "wt-stop");
    git(repo, "worktree", "add", "-b", `session/${id}`, wtPath);
    const wtGitDir = git(wtPath, "rev-parse", "--absolute-git-dir").trim();
    mkdirSync(join(wtGitDir, "session-pilot"), { recursive: true });
    writeFileSync(join(wtGitDir, "session-pilot", "current-session"), id + "\n");
    writeFileSync(join(wtPath, "feature.txt"), "stop-merged\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "work");
    // squash-merge the same content onto main and push
    writeFileSync(join(repo, "feature.txt"), "stop-merged\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "squash");
    git(repo, "push", "-q", "origin", "main");

    const r = spawnSync("bash", [LAUNCHER, "stop", wtPath], { encoding: "utf8", cwd: repo });
    expect(r.status).toBe(0);
    expect(branchExists(`session/${id}`)).toBe(false);
    expect(r.stdout).toContain("squash-merged session branch deleted");
  });
});
