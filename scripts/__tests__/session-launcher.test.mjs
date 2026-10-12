import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
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

// installFakeGh <dir> — writes a fake `gh` answering the two queries the
// launcher makes: the open-PR count for a head branch, and the merged-PR list.
// The merged record is emitted ONLY when the query's `--head` value matches
// mergedPr.branch, so a wrong branch argument (e.g. a ref path instead of a
// branch name) silently loses the record and fails the test instead of
// passing unnoticed. The record itself is the already-jq-processed TSV the
// launcher parses (`headRefOid\tmergeCommit`); the real `--jq` filter is
// exercised against the live API by the real-repo smoke, not here. Any other
// invocation fails loudly so new gh dependencies surface in tests.
function installFakeGh(dir, { openPrCount = 0, mergedPr = null } = {}) {
  const p = join(dir, "gh"); // nosemgrep
  const mergedCase = mergedPr
    ? `  *"pr list"*"--state merged"*)\n    case "$*" in\n      *"--head ${mergedPr.branch}"*) printf '%s\\n' "${mergedPr.headRefOid}\t${mergedPr.mergeCommit}" ;;\n    esac\n    exit 0\n    ;;\n`
    : `  *"pr list"*"--state merged"*) exit 0 ;;\n`;
  writeFileSync(
    p,
    `#!/bin/bash\ncase "$*" in\n${mergedCase}  *"pr list"*) echo "${openPrCount}"; exit 0 ;;\nesac\necho "fake gh: unhandled: $*" >&2\nexit 1\n`,
  );
  execFileSync("chmod", ["+x", p]);
}

// installShimGit <dir> <mode> — a PATH-first `git` wrapper.
//   "nofetch": every `git fetch` fails (pack transfer unreachable) while
//              ls-remote still works.
//   "race":    the first `push --delete` first advances that branch on origin
//              from a scratch clone (a commit landing between verification and
//              deletion), then runs the real push.
function installShimGit(dir, mode) {
  const p = join(dir, "git"); // nosemgrep
  const real = execFileSync("bash", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const body =
    mode === "nofetch"
      ? `for a in "$@"; do [ "$a" = fetch ] && exit 1; done\nexec "${real}" "$@"\n`
      : `del=""; prev=""\nfor a in "$@"; do\n  [ "$prev" = "--delete" ] && del="$a"\n  prev="$a"\ndone\nif [ -n "$del" ] && [ -n "\${GC_SHIM_RACE:-}" ] && [ ! -f "\${GC_SHIM_RACE}.once" ]; then\n  : > "\${GC_SHIM_RACE}.once"\n  url=$("${real}" config --get remote.origin.url)\n  tmp=$(mktemp -d)\n  "${real}" clone -q "$url" "$tmp" 2>/dev/null\n  "${real}" -C "$tmp" config user.email t@e.c\n  "${real}" -C "$tmp" config user.name t\n  "${real}" -C "$tmp" checkout -q "$del" 2>/dev/null\n  "${real}" -C "$tmp" commit -q --allow-empty -m "race commit"\n  "${real}" -C "$tmp" push -q origin "$del" 2>/dev/null\n  rm -rf "$tmp"\nfi\nexec "${real}" "$@"\n`;
  writeFileSync(p, `#!/bin/bash\n${body}`);
  execFileSync("chmod", ["+x", p]);
}

describe("session-launcher stop: session branch cleanup (#195)", () => {
  let repo;
  let wt;
  let ghDir;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "launcher-test-repo-"));
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "test");
    mkdirSync(join(repo, "docs"), { recursive: true });
    writeFileSync(join(repo, "docs", "a.md"), "a");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");
    ghDir = mkdtempSync(join(tmpdir(), "launcher-stop-gh-"));
    installFakeGh(ghDir); // no merged PR unless a test installs one
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(ghDir, { recursive: true, force: true });
  });

  function stop(wtpath) {
    // Production usage runs session:stop from inside the repo — the
    // launcher's git commands resolve against its cwd.
    const r = spawnSync("bash", [LAUNCHER, "stop", wtpath], {
      encoding: "utf-8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
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
      "session branch kept (not delivered: content differs from origin/main, no merged PR for this tip): session/20260101-unmerged-def456",
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

  // writeFakeGh <openPrCount> [mergedPr] — see installFakeGh.
  function writeFakeGh(openPrCount, mergedPr = null) {
    installFakeGh(ghDir, { openPrCount, mergedPr });
  }

  // writeFailingGh — every gh invocation errors (no auth / offline).
  function writeFailingGh() {
    const p = join(ghDir, "gh");
    writeFileSync(p, `#!/bin/bash\necho "gh: auth error" >&2\nexit 1\n`);
    execFileSync("chmod", ["+x", p]);
  }

  function gcWith(extraEnv, ...args) {
    const r = spawnSync("bash", [LAUNCHER, "gc", ...args], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh"), ...extraEnv },
    });
    return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  }

  function gc(...args) {
    return gcWith({}, ...args);
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

  // prMergedBranch — the shape byte identity can never re-verify: the branch
  // tip was merged into main (headRefOid / mergeCommit below), then main moved
  // on (a release bump), so the branch's content no longer matches. Only the
  // PR criterion can prove delivery here. Returns what a fake gh reports.
  function prMergedBranch(name, content, evolvedContent) {
    const wtPath = join(repo, "wt-" + name.replace(/[^a-z0-9]+/gi, "-"));
    git(repo, "worktree", "add", "-b", name, wtPath);
    writeFileSync(join(wtPath, "feature.txt"), content);
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "feature work");
    const tip = git(wtPath, "rev-parse", "HEAD").trim();
    git(repo, "worktree", "remove", wtPath);
    writeFileSync(join(repo, "feature.txt"), content);
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "squash merge of " + name);
    const mergeCommit = git(repo, "rev-parse", "HEAD").trim();
    git(repo, "push", "-q", "origin", "main");
    git(repo, "push", "-q", "origin", name);
    writeFileSync(join(repo, "feature.txt"), evolvedContent);
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "release bump after the merge");
    git(repo, "push", "-q", "origin", "main");
    return { branch: name, tip, mergeCommit };
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
    // The local loop already settled this remote; the orphan sweep must not
    // re-examine it in the same run (one gh query, one line).
    expect(out.split("kept remote origin/session/20260101-openpr-abc777").length - 1).toBe(1);

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
      "kept remote origin/session/20260101-orphanun-abc555 (not delivered: content differs from origin/main, no merged PR for this tip)",
    );
  });

  it("--dry-run previews remote-twin deletions without touching them", () => {
    squashMergedBranch("session/20260101-dryremote-abc666", "dryremote\n");
    git(repo, "push", "-q", "origin", "session/20260101-dryremote-abc666");

    const { out } = gc("--dry-run");
    expect(remoteBranchExists("session/20260101-dryremote-abc666")).toBe(true);
    expect(out).toContain("would delete remote origin/session/20260101-dryremote-abc666");
  });

  // The orphan sweep has its own dry gate; without this the sweep could delete
  // a live remote branch during --dry-run and every other test would still pass.
  it("--dry-run previews an orphaned remote twin without deleting it", () => {
    squashMergedBranch("session/20260101-dryorphan-abc999", "dryorphan\n");
    git(repo, "push", "-q", "origin", "session/20260101-dryorphan-abc999");
    git(repo, "branch", "-D", "session/20260101-dryorphan-abc999");

    const { out } = gc("--dry-run");
    expect(remoteBranchExists("session/20260101-dryorphan-abc999")).toBe(true);
    expect(out).toContain("would delete remote origin/session/20260101-dryorphan-abc999");
  });

  it("reports an unreachable origin instead of silently skipping remote checks", () => {
    squashMergedBranch("session/20260101-offline-abc000", "offline\n");
    git(repo, "push", "-q", "origin", "session/20260101-offline-abc000");
    git(repo, "remote", "set-url", "origin", join(tmpdir(), "launcher-gc-missing-origin"));

    const { status, out } = gc();
    expect(status).toBe(0);
    expect(out).toContain("kept remote origin/session/20260101-offline-abc000 (origin unreachable");
  });

  it("counts a failed remote delete as kept and says so", () => {
    squashMergedBranch("session/20260101-rmfail-abc111", "rmfail\n");
    git(repo, "push", "-q", "origin", "session/20260101-rmfail-abc111");
    git(origin, "config", "receive.denyDeletes", "true");

    const { out } = gc();
    expect(remoteBranchExists("session/20260101-rmfail-abc111")).toBe(true);
    expect(out).toContain("remote origin/session/20260101-rmfail-abc111 delete failed or refused");
    // The remote half of the summary must agree with the per-branch line.
    expect(out).toContain("kept 0 (remote 1)");
  });

  // The second deletion criterion: byte identity can never re-verify a branch
  // once main moves on after the merge (release bumps do this every cycle), so
  // a merged PR whose head is exactly the branch tip is delivery evidence too.
  it("deletes a PR-delivered branch whose content drifted after the merge", () => {
    const { branch, tip, mergeCommit } = prMergedBranch(
      "session/20260101-drift-abc101",
      "v1\n",
      "v2\n",
    );
    writeFakeGh(0, { branch, mergeCommit, headRefOid: tip });

    const { out } = gc();
    expect(branchExists("session/20260101-drift-abc101")).toBe(false);
    expect(remoteBranchExists("session/20260101-drift-abc101")).toBe(false);
    expect(out).toContain("deleted session/20260101-drift-abc101 (PR merged into main)");
  });

  it("keeps a branch with commits pushed after the merge", () => {
    const { branch, tip, mergeCommit } = prMergedBranch(
      "session/20260101-postmerge-abc102",
      "v1\n",
      "v2\n",
    );
    const wtPath = join(repo, "wt-postmerge");
    git(repo, "worktree", "add", wtPath, "session/20260101-postmerge-abc102");
    writeFileSync(join(wtPath, "later.txt"), "later\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "post-merge work");
    git(repo, "worktree", "remove", wtPath);
    writeFakeGh(0, { branch, mergeCommit, headRefOid: tip });

    const { out } = gc();
    expect(branchExists("session/20260101-postmerge-abc102")).toBe(true);
    expect(out).toContain("kept session/20260101-postmerge-abc102 (not delivered");
    expect(remoteBranchExists("session/20260101-postmerge-abc102")).toBe(true);
  });

  it("keeps a branch whose reported merge commit is not on origin/main", () => {
    const { branch, tip } = prMergedBranch("session/20260101-badmc-abc103", "v1\n", "v2\n");
    writeFakeGh(0, { branch, mergeCommit: tip, headRefOid: tip });

    const { out } = gc();
    expect(branchExists("session/20260101-badmc-abc103")).toBe(true);
    expect(out).toContain("kept session/20260101-badmc-abc103 (not delivered");
  });

  it("keeps a PR-delivered candidate when the merged-PR check fails (fail-closed)", () => {
    prMergedBranch("session/20260101-prfail-abc104", "v1\n", "v2\n");
    writeFailingGh();

    const { out } = gc();
    expect(branchExists("session/20260101-prfail-abc104")).toBe(true);
    // The check being unavailable is reported as such — not as a proven
    // absence of a merged PR.
    expect(out).toContain("kept session/20260101-prfail-abc104 (not verified");
    expect(out).not.toContain("kept session/20260101-prfail-abc104 (not delivered");
  });

  it("keeps a PR-delivered candidate when gh is unavailable", () => {
    prMergedBranch("session/20260101-nogh-abc105", "v1\n", "v2\n");
    const r = spawnSync("bash", [LAUNCHER, "gc"], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "definitely-missing") },
    });
    expect(r.status).toBe(0);
    expect(branchExists("session/20260101-nogh-abc105")).toBe(true);
  });

  it("--dry-run previews a PR-delivered deletion without deleting", () => {
    const { branch, tip, mergeCommit } = prMergedBranch(
      "session/20260101-drypr-abc106",
      "v1\n",
      "v2\n",
    );
    writeFakeGh(0, { branch, mergeCommit, headRefOid: tip });

    const { out } = gc("--dry-run");
    expect(branchExists("session/20260101-drypr-abc106")).toBe(true);
    expect(remoteBranchExists("session/20260101-drypr-abc106")).toBe(true);
    expect(out).toContain("would delete session/20260101-drypr-abc106 (PR merged into main)");
    expect(out).toContain(
      "would delete remote origin/session/20260101-drypr-abc106 (PR merged into main)",
    );
  });

  it("sweeps an orphaned remote twin that a merged PR covers", () => {
    const { branch, tip, mergeCommit } = prMergedBranch(
      "session/20260101-orphanpr-abc107",
      "v1\n",
      "v2\n",
    );
    git(repo, "branch", "-D", "session/20260101-orphanpr-abc107");
    writeFakeGh(0, { branch, mergeCommit, headRefOid: tip });

    const { out } = gc();
    expect(remoteBranchExists("session/20260101-orphanpr-abc107")).toBe(false);
    expect(out).toContain(
      "deleted remote origin/session/20260101-orphanpr-abc107 (PR merged into main)",
    );
  });

  // A failed fetch must not let the content criterion run against a stale
  // tracking ref: the stale ref can look byte-identical while the real remote
  // tip carries unmerged commits. Only the tip-bound PR criterion may
  // authorise a delete when the fetch failed.
  it("keeps the remote twin when the fetch fails (content unverifiable)", () => {
    squashMergedBranch("session/20260101-staleref-abc201", "v1\n");
    git(repo, "push", "-q", "origin", "session/20260101-staleref-abc201");
    git(repo, "fetch", "-q", "origin", "session/20260101-staleref-abc201");
    // Advance the remote branch from a scratch clone; the fixture's tracking
    // ref stays on the merged tip.
    const other = mkdtempSync(join(tmpdir(), "launcher-gc-stale-"));
    git(repo, "clone", "-q", origin, other);
    git(other, "config", "user.email", "test@example.com");
    git(other, "config", "user.name", "test");
    git(other, "checkout", "-q", "session/20260101-staleref-abc201");
    writeFileSync(join(other, "newer.txt"), "newer\n");
    git(other, "add", ".");
    git(other, "commit", "-q", "-m", "unmerged follow-up");
    git(other, "push", "-q", "origin", "session/20260101-staleref-abc201");
    rmSync(other, { recursive: true, force: true });

    installShimGit(ghDir, "nofetch");
    const { out } = gcWith({ PATH: `${ghDir}:${process.env.PATH}` });
    expect(remoteBranchExists("session/20260101-staleref-abc201")).toBe(true);
    // The PR check ran and found nothing — distinct from "could not check".
    expect(out).toContain(
      "kept remote origin/session/20260101-staleref-abc201 (not verified: fetch failed (content unverifiable) and no merged PR for this tip)",
    );
  });

  it("deletes a PR-delivered remote twin even when the fetch fails", () => {
    const { branch, tip, mergeCommit } = prMergedBranch(
      "session/20260101-prnofetch-abc202",
      "v1\n",
      "v2\n",
    );
    writeFakeGh(0, { branch, mergeCommit, headRefOid: tip });

    installShimGit(ghDir, "nofetch");
    const { out } = gcWith({ PATH: `${ghDir}:${process.env.PATH}` });
    // PR evidence needs no local objects, so the tip-bound criterion still
    // authorises the delete.
    expect(remoteBranchExists("session/20260101-prnofetch-abc202")).toBe(false);
    expect(out).toContain("deleted remote origin/session/20260101-prnofetch-abc202 (PR merged");
  });

  // The verification/deletion race: a commit lands on the remote branch after
  // verification but before the delete. --force-with-lease makes the delete
  // conditional on the verified tip, so the push is refused and the branch
  // (with its new commit) survives.
  it("keeps the remote twin when a commit lands between verification and delete", () => {
    squashMergedBranch("session/20260101-lease-abc203", "v1\n");
    git(repo, "push", "-q", "origin", "session/20260101-lease-abc203");

    installShimGit(ghDir, "race");
    const { out } = gcWith({
      PATH: `${ghDir}:${process.env.PATH}`,
      GC_SHIM_RACE: join(ghDir, "race-marker"),
    });
    expect(remoteBranchExists("session/20260101-lease-abc203")).toBe(true);
    expect(out).toContain(
      "remote origin/session/20260101-lease-abc203 delete failed or refused (remote moved after verification?)",
    );
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
    expect(out).toContain("kept session/20260101-unicode-abc222 (not delivered");
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

    const r = spawnSync("bash", [LAUNCHER, "stop", wtPath], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(branchExists(`session/${id}`)).toBe(false);
    expect(r.stdout).toContain("squash-merged session branch deleted");
  });

  // makeDeliveredSessionWorktree — a session worktree whose content already
  // landed on origin/main (squash shape), with its remote twin pushed.
  function makeDeliveredSessionWorktree(id, content) {
    const wtPath = join(repo, "wt-" + id); // nosemgrep
    git(repo, "worktree", "add", "-b", `session/${id}`, wtPath);
    const wtGitDir = git(wtPath, "rev-parse", "--absolute-git-dir").trim();
    mkdirSync(join(wtGitDir, "session-pilot"), { recursive: true }); // nosemgrep
    writeFileSync(join(wtGitDir, "session-pilot", "current-session"), id + "\n"); // nosemgrep
    writeFileSync(join(wtPath, "feature.txt"), content); // nosemgrep
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "work");
    writeFileSync(join(repo, "feature.txt"), content);
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "squash merge");
    git(repo, "push", "-q", "origin", "main");
    git(repo, "push", "-q", "origin", `session/${id}`);
    return wtPath;
  }

  // A delivered branch means the work landed: stop must not stop at deleting
  // the local branch — the remote twin and the main-checkout sync are the
  // closeout, and the merge → stop sequence should need no second command.
  it("stop runs the post-delivery closeout after deleting a delivered branch", () => {
    const id = "20260101-stopgc-abc401";
    const wtPath = makeDeliveredSessionWorktree(id, "stopgc\n");

    const r = spawnSync("bash", [LAUNCHER, "stop", wtPath], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(branchExists(`session/${id}`)).toBe(false);
    expect(r.stdout).toContain("[session] post-delivery closeout:");
    expect(remoteBranchExists(`session/${id}`)).toBe(false); // gc swept the twin
    // The closeout ran, so the "run it yourself after merging" hint must not
    // contradict what just happened.
    expect(r.stdout).not.toContain("closeout after the PR merges");
  });

  it("stop from inside the worktree still cleans up and closes out", () => {
    const id = "20260101-stopcwd-abc402";
    const wtPath = makeDeliveredSessionWorktree(id, "stopcwd\n");

    const r = spawnSync("bash", [LAUNCHER, "stop", "."], {
      encoding: "utf8",
      cwd: wtPath,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(branchExists(`session/${id}`)).toBe(false);
    expect(r.stdout).toContain("[session] post-delivery closeout:");
    expect(remoteBranchExists(`session/${id}`)).toBe(false);
  });

  // A remote twin is not a delivery proof: `git branch -d` also accepts a
  // branch "merged" to its own remote-tracking ref, so an unmerged PR's live
  // twin — or a stale twin whose remote head was deleted — would authorize
  // deleting work that never reached main.
  it("stop keeps a pushed but unmerged branch (a live twin is not delivery proof)", () => {
    const id = "20260101-pushed-unmerged-abc654";
    const wtPath = join(repo, "wt-pushed");
    git(repo, "worktree", "add", "-b", `session/${id}`, wtPath);
    const wtGitDir = git(wtPath, "rev-parse", "--absolute-git-dir").trim();
    mkdirSync(join(wtGitDir, "session-pilot"), { recursive: true });
    writeFileSync(join(wtGitDir, "session-pilot", "current-session"), id + "\n");
    writeFileSync(join(wtPath, "wip.txt"), "never merged\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "wip");
    git(wtPath, "push", "-q", "-u", "origin", `session/${id}`);

    const r = spawnSync("bash", [LAUNCHER, "stop", wtPath], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(branchExists(`session/${id}`)).toBe(true);
    expect(r.stdout).toContain("session branch kept (not delivered");
  });

  it("stop keeps a branch whose remote twin was deleted without a merge (stale ref)", () => {
    const id = "20260101-stale-twin-abc655";
    const wtPath = join(repo, "wt-staletwin");
    git(repo, "worktree", "add", "-b", `session/${id}`, wtPath);
    const wtGitDir = git(wtPath, "rev-parse", "--absolute-git-dir").trim();
    mkdirSync(join(wtGitDir, "session-pilot"), { recursive: true });
    writeFileSync(join(wtGitDir, "session-pilot", "current-session"), id + "\n");
    writeFileSync(join(wtPath, "wip.txt"), "never merged\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "wip");
    git(wtPath, "push", "-q", "-u", "origin", `session/${id}`);
    // The remote head disappears (e.g. a closed PR had it deleted); the local
    // tracking ref survives until a prune, and `git branch -d` reads it as
    // "merged to upstream".
    git(origin, "branch", "-D", `session/${id}`);

    const r = spawnSync("bash", [LAUNCHER, "stop", wtPath], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(branchExists(`session/${id}`)).toBe(true);
    expect(r.stdout).toContain("session branch kept (not delivered");
  });

  // stop may be invoked through the worktree's OWN launcher copy, from inside
  // that worktree: the script's path then dies with the worktree, and the
  // post-delivery closeout must fall back to the main checkout's copy instead
  // of silently skipping (and then printing the manual-closeout hint).
  it("stop through the worktree's own launcher copy still closes out", () => {
    const id = "20260101-selfcopy-abc656";
    const branch = `session/${id}`;
    const wtPath = join(repo, "wt-selfcopy");
    git(repo, "worktree", "add", "-b", branch, wtPath);
    const wtGitDir = git(wtPath, "rev-parse", "--absolute-git-dir").trim();
    mkdirSync(join(wtGitDir, "session-pilot"), { recursive: true });
    writeFileSync(join(wtGitDir, "session-pilot", "current-session"), id + "\n");
    // The session branch carries the launcher, as any session that touches it
    // does; the worktree's own copy is what stop is invoked through.
    mkdirSync(join(wtPath, "scripts"), { recursive: true });
    copyFileSync(LAUNCHER, join(wtPath, "scripts", "session-launcher.sh"));
    writeFileSync(join(wtPath, "feature.txt"), "selfcopy\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "work");
    git(wtPath, "push", "-q", "-u", "origin", branch);
    // Squash-merge the same content (launcher included) onto main.
    mkdirSync(join(repo, "scripts"), { recursive: true });
    copyFileSync(LAUNCHER, join(repo, "scripts", "session-launcher.sh"));
    writeFileSync(join(repo, "feature.txt"), "selfcopy\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "squash merge");
    git(repo, "push", "-q", "origin", "main");

    const r = spawnSync("bash", [join(wtPath, "scripts", "session-launcher.sh"), "stop", wtPath], {
      encoding: "utf8",
      cwd: wtPath,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(branchExists(branch)).toBe(false);
    expect(r.stdout).toContain("squash-merged session branch deleted");
    expect(r.stdout).toContain("[session] post-delivery closeout:");
    expect(remoteBranchExists(branch)).toBe(false); // twin swept in the same stop
    expect(r.stdout).not.toContain("closeout after the PR merges");
  });

  it("stop deletes a PR-delivered session branch after main moved on", () => {
    const id = "20260101-prstop-abc322";
    const wtPath = join(repo, "wt-prstop");
    git(repo, "worktree", "add", "-b", `session/${id}`, wtPath);
    const wtGitDir = git(wtPath, "rev-parse", "--absolute-git-dir").trim();
    mkdirSync(join(wtGitDir, "session-pilot"), { recursive: true });
    writeFileSync(join(wtGitDir, "session-pilot", "current-session"), id + "\n");
    writeFileSync(join(wtPath, "feature.txt"), "v1\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "work");
    const tip = git(wtPath, "rev-parse", "HEAD").trim();
    // squash-merge the same content, then let main move on (a release bump)
    writeFileSync(join(repo, "feature.txt"), "v1\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "squash");
    const mergeCommit = git(repo, "rev-parse", "HEAD").trim();
    git(repo, "push", "-q", "origin", "main");
    writeFileSync(join(repo, "feature.txt"), "v2\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "release bump");
    git(repo, "push", "-q", "origin", "main");
    writeFakeGh(0, { branch: `session/${id}`, mergeCommit, headRefOid: tip });

    const r = spawnSync("bash", [LAUNCHER, "stop", wtPath], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(branchExists(`session/${id}`)).toBe(false);
    expect(r.stdout).toContain("PR-merged session branch deleted");
  });
});
