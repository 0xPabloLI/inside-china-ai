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
    writeFileSync(join(wtGitDir, "session-pilot", "current-session"), branch.replace(/^session\//, "") + "\n");
    return wtGitDir;
  }

  it("merged branch is deleted after stop (worktree removed, branch fully merged)", () => {
    const wtGitDir = makeWorktree("session/20260101-merged-abc123");
    const out = stop(wt);
    expect(existsSync(wt)).toBe(false);
    expect(existsSync(join(repo, ".git", "refs", "heads", "session", "20260101-merged-abc123"))).toBe(false);
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
    expect(existsSync(join(repo, ".git", "refs", "heads", "session", "20260101-unmerged-def456"))).toBe(true);
    expect(out).toContain(
      "session branch kept (branch -d refused: unmerged or already merged elsewhere): session/20260101-unmerged-def456",
    );
  });

  it("dirty worktree: worktree kept, branch not touched", () => {
    const wtGitDir = makeWorktree("session/20260101-dirty-789abc");
    writeFileSync(join(wt, "dirty.txt"), "uncommitted");
    const out = stop(wt);
    expect(existsSync(wt)).toBe(true);
    expect(existsSync(join(repo, ".git", "refs", "heads", "session", "20260101-dirty-789abc"))).toBe(true);
    expect(out).toContain("worktree kept (dirty or locked)");
    expect(out).toContain("session branch kept (worktree dirty)");
  });
});
