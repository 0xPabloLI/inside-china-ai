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
function installFakeGh(
  dir,
  { openPrCount = 0, mergedPr = null, openPrSequence = null, closedPrSequence = null } = {},
) {
  const p = join(dir, "gh"); // nosemgrep
  const mergedCase = mergedPr
    ? `  *"pr list"*"--state merged"*)\n    case "$*" in\n      *"--head ${mergedPr.branch}"*) printf '%s\\n' "${mergedPr.headRefOid}\t${mergedPr.mergeCommit}" ;;\n    esac\n    exit 0\n    ;;\n`
    : `  *"pr list"*"--state merged"*) exit 0 ;;\n`;
  // The open-PR count is read once per remote closeout and once again after
  // the delete. openPrSequence models a PR appearing in that window (or the
  // API failing mid-flight): successive calls return successive values, the
  // last one sticking. "err" makes that call fail.
  //
  // Deleting a head branch closes its PRs, so the post-delete open count is 0
  // whether or not a PR was closed. closedPrSequence models the
  // closed-unmerged snapshot the launcher compares instead: "none" prints
  // nothing (no such PR), a tab-separated "<number>\t<closedAt>" prints one,
  // "err" fails the query.
  //
  // Sequences live in newline-separated files rather than in the script text:
  // an entry holds a tab, and word splitting on `set --` would tear it apart.
  writeFileSync(
    join(dir, ".openpr-seq"),
    (openPrSequence ?? [String(openPrCount)]).join("\n") + "\n",
  );
  writeFileSync(join(dir, ".closedpr-seq"), (closedPrSequence ?? ["none"]).join("\n") + "\n");
  writeFileSync(
    p,
    `#!/bin/bash\ncase "$*" in\n${mergedCase}  *"pr list"*"--state closed"*)\n    d="$(dirname "$0")/.closedpr-seq"; f="$(dirname "$0")/.closedpr-calls"\n    n=0; [ -f "$f" ] && n=$(cat "$f")\n    n=$((n + 1)); printf '%s' "$n" > "$f"\n    v=$(sed -n "\${n}p" "$d"); [ -n "$v" ] || v=$(tail -n 1 "$d")\n    if [ "$v" = "err" ]; then echo "gh: api error" >&2; exit 1; fi\n    [ "$v" = "none" ] || printf '%s\\n' "$v"\n    exit 0\n    ;;\n  *"pr list"*)\n    d="$(dirname "$0")/.openpr-seq"; f="$(dirname "$0")/.openpr-calls"\n    n=0; [ -f "$f" ] && n=$(cat "$f")\n    n=$((n + 1)); printf '%s' "$n" > "$f"\n    v=$(sed -n "\${n}p" "$d"); [ -n "$v" ] || v=$(tail -n 1 "$d")\n    if [ "$v" = "err" ]; then echo "gh: api error" >&2; exit 1; fi\n    echo "$v"; exit 0\n    ;;\nesac\necho "fake gh: unhandled: $*" >&2\nexit 1\n`,
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
    git(repo, "init", "-q", "--initial-branch=main");
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

  // Delivery means origin/main, not merely the local main checkout: a branch
  // merged only locally keeps its ref (fail-closed) and says why, so work is
  // never dropped on the strength of an unpushed merge.
  it("keeps a branch merged into local main only, and says why", () => {
    const branch = "session/20260101-merged-abc123";
    const wtGitDir = makeWorktree(branch);
    writeFileSync(join(wt, "local.txt"), "merged locally only\n");
    git(wt, "add", ".");
    git(wt, "commit", "-q", "-m", "work");
    git(repo, "merge", "--no-ff", "-q", "-m", "merge " + branch, branch);

    const out = stop(wt);
    expect(existsSync(wt)).toBe(false);
    expect(
      existsSync(join(repo, ".git", "refs", "heads", "session", "20260101-merged-abc123")),
    ).toBe(true);
    expect(out).toContain("session branch kept (merged into local main only — not on origin/main");
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
    // The closeout did not run, so stop still points at the manual command.
    expect(out).toContain("closeout after the PR merges");
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

  // writeFakeGh <openPrCount> [mergedPr] [openPrSequence] [closedPrSequence]
  // — see installFakeGh.
  function writeFakeGh(
    openPrCount,
    mergedPr = null,
    openPrSequence = null,
    closedPrSequence = null,
  ) {
    installFakeGh(ghDir, { openPrCount, mergedPr, openPrSequence, closedPrSequence });
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
  // `file` lets several such branches coexist: byte identity is per-file, so
  // two branches sharing one path would un-deliver the earlier one.
  function squashMergedBranch(name, content, file = "feature.txt") {
    const wtPath = join(repo, "wt-" + name.replace(/[^a-z0-9]+/gi, "-"));
    git(repo, "worktree", "add", "-b", name, wtPath);
    writeFileSync(join(wtPath, file), content);
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "feature work");
    git(repo, "worktree", "remove", wtPath);
    writeFileSync(join(repo, file), content);
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

  // The same window exists inside gc's own loop: for-each-ref lists the
  // branch, then a parallel session's stop/gc deletes it before the
  // per-branch check runs. The first gh call of the loop (branch A's remote
  // twin) is where the delete lands. The branch was never kept — report it as
  // gone and count neither deleted nor kept; its remote twin, if any, is left
  // to the orphan pass.
  it("gc: a branch deleted mid-loop is reported gone, not kept", () => {
    const aBranch = "session/20260101-race-a-abc601";
    const bBranch = "session/20260101-race-b-abc602";
    squashMergedBranch(aBranch, "race-a\n", "race-a.txt");
    squashMergedBranch(bBranch, "race-b\n", "race-b.txt");
    git(repo, "push", "-q", "origin", aBranch);
    // gh deletes branch B on its first invocation (the open-PR check for A's
    // remote twin), then answers the normal queries.
    const p = join(ghDir, "gh");
    writeFileSync(
      p,
      `#!/bin/bash\ncase "$*" in\n  *"pr list"*"--state merged"*) exit 0 ;;\n  *"pr list"*"--state closed"*) exit 0 ;;\n  *"pr list"*)\n    f="$(dirname "$0")/.race-fired"\n    if [ ! -f "$f" ]; then\n      printf x > "$f"\n      git -C ${JSON.stringify(repo)} branch -D ${bBranch} >/dev/null 2>&1 || true\n    fi\n    echo 0; exit 0 ;;\nesac\necho "fake gh: unhandled: $*" >&2\nexit 1\n`,
    );
    execFileSync("chmod", ["+x", p]);

    const { status, out } = gc();
    expect(status).toBe(0);
    expect(out).toContain(`${bBranch} already gone (deleted concurrently)`);
    expect(out).not.toContain("not delivered");
    expect(out).toContain(`deleted ${aBranch}`);
    expect(out).toContain("kept 0 (remote 0)");
  });

  // The dry-run preview walks the same loop, so it has the same window: a
  // branch swept mid-preview must not be previewed as "kept" either.
  it("gc --dry-run: a branch deleted mid-loop is reported gone, not kept", () => {
    const aBranch = "session/20260101-race-dry-a-abc603";
    const bBranch = "session/20260101-race-dry-b-abc604";
    squashMergedBranch(aBranch, "dry-a\n", "dry-a.txt");
    squashMergedBranch(bBranch, "dry-b\n", "dry-b.txt");
    git(repo, "push", "-q", "origin", aBranch);
    const p = join(ghDir, "gh");
    writeFileSync(
      p,
      `#!/bin/bash\ncase "$*" in\n  *"pr list"*"--state merged"*) exit 0 ;;\n  *"pr list"*"--state closed"*) exit 0 ;;\n  *"pr list"*)\n    f="$(dirname "$0")/.race-fired"\n    if [ ! -f "$f" ]; then\n      printf x > "$f"\n      git -C ${JSON.stringify(repo)} branch -D ${bBranch} >/dev/null 2>&1 || true\n    fi\n    echo 0; exit 0 ;;\nesac\necho "fake gh: unhandled: $*" >&2\nexit 1\n`,
    );
    execFileSync("chmod", ["+x", p]);

    const { status, out } = gc("--dry-run");
    expect(status).toBe(0);
    expect(out).toContain(`${bBranch} already gone (deleted concurrently)`);
    expect(out).not.toContain("not delivered");
    expect(out).toContain(`would delete ${aBranch}`);
    expect(out).toContain("kept 0 (remote 0)");
  });

  // The namespace globs are word-split before `case` matches them, and word
  // splitting also ran pathname expansion: a checkout with a real `docs/`
  // directory expanded `docs/*` into that directory's file names, so the
  // `docs/*` pattern never matched a `docs/…` branch and gc silently skipped
  // it (2026-10-13: a delivered docs/ branch survived two gc runs and was
  // only cleaned with an explicit SESSION_GC_BRANCH_GLOBS). The fixture had
  // no docs/ directory, which is why nothing caught it.
  it("deletes a delivered docs/* branch when the checkout has a docs/ directory", () => {
    mkdirSync(join(repo, "docs"), { recursive: true });
    writeFileSync(join(repo, "docs", "guide.md"), "guide\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "add docs directory");
    git(repo, "push", "-q", "origin", "main");

    squashMergedBranch("docs/roadmap-closeout", "closeout\n");

    const { status, out } = gc();
    expect(status).toBe(0);
    expect(branchExists("docs/roadmap-closeout")).toBe(false);
    expect(out).toContain("deleted docs/roadmap-closeout");
  });

  it("honours SESSION_GC_BRANCH_GLOBS as a replacement set, split safely", () => {
    mkdirSync(join(repo, "docs"), { recursive: true });
    writeFileSync(join(repo, "docs", "guide.md"), "guide\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "add docs directory");
    git(repo, "push", "-q", "origin", "main");

    squashMergedBranch("personal/keep", "kept\n", "personal-keep.txt");
    squashMergedBranch("docs/keep", "docs kept\n", "docs-keep.txt");

    // The override replaces the default families: both branches match one of
    // its two patterns, and the second pattern is the one pathname expansion
    // used to eat.
    const { status, out } = gcWith({ SESSION_GC_BRANCH_GLOBS: "personal/* docs/*" });
    expect(status).toBe(0);
    expect(branchExists("personal/keep")).toBe(false);
    expect(branchExists("docs/keep")).toBe(false);
    expect(out).toContain("deleted personal/keep");
    expect(out).toContain("deleted docs/keep");
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

  // The open-PR check and the delete are two steps, so a PR opened between
  // them would be closed by the delete. gc re-checks after deleting and puts
  // the ref back exactly as verified when one appears — the branch is the only
  // reference to that work, and the delete is the one action that can lose it.
  it("restores a remote twin when an open PR appears during the delete window", () => {
    squashMergedBranch("session/20260101-racepr-abc204", "race\n");
    git(repo, "push", "-q", "origin", "session/20260101-racepr-abc204");
    const tip = git(repo, "rev-parse", "session/20260101-racepr-abc204").trim();
    writeFakeGh(0, null, ["0", "1"]); // pre-check 0, post-delete check 1

    const { out } = gc();
    expect(out).toContain("restored remote origin/session/20260101-racepr-abc204");
    expect(out).not.toContain("deleted remote origin/session/20260101-racepr-abc204");
    expect(remoteBranchExists("session/20260101-racepr-abc204")).toBe(true);
    expect(
      git(repo, "ls-remote", "origin", "refs/heads/session/20260101-racepr-abc204").trim(),
    ).toBe(`${tip}\trefs/heads/session/20260101-racepr-abc204`);
    expect(out).toContain("kept 0 (remote 1)");
  });

  it("restores a remote twin when the post-delete check cannot run (fail-closed)", () => {
    squashMergedBranch("session/20260101-raceerr-abc205", "race\n");
    git(repo, "push", "-q", "origin", "session/20260101-raceerr-abc205");
    writeFakeGh(0, null, ["0", "err"]); // the re-check fails after the delete

    const { out } = gc();
    expect(out).toContain("restored remote origin/session/20260101-raceerr-abc205");
    expect(remoteBranchExists("session/20260101-raceerr-abc205")).toBe(true);
  });

  // The restore push is deliberately not forced: when someone re-created the
  // ref inside the window, their tip wins and the recovery stays manual.
  // Clobbering a third party's commit would be the worse failure, so the
  // delete standing is reported loudly instead of silently repaired.
  it("never clobbers a ref re-created during the delete window (loud warning)", () => {
    const branch = "session/20260101-raceclob-abc206";
    squashMergedBranch(branch, "race\n");
    git(repo, "push", "-q", "origin", branch);
    const tip = git(repo, "rev-parse", branch).trim();

    // A third party's commit on top of the branch tip: pushing the verified
    // tip back would not be a fast-forward, so the restore must refuse.
    git(repo, "checkout", "-q", "-b", "third-party", tip);
    writeFileSync(join(repo, "third-party.txt"), "someone else\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "third-party work");
    const thirdTip = git(repo, "rev-parse", "third-party").trim();
    git(repo, "checkout", "-q", "main");
    // The commit must exist on the remote for the hook below to point a ref
    // at it (update-ref refuses unknown objects).
    git(repo, "push", "-q", "origin", "third-party");

    // Re-create the ref the moment the deletion lands, exactly as a
    // concurrent actor would. post-receive fires after the delete transaction.
    const hook = join(origin, "hooks", "post-receive");
    writeFileSync(hook, `#!/bin/bash\ngit update-ref refs/heads/${branch} ${thirdTip}\n`);
    execFileSync("chmod", ["+x", hook]);
    writeFakeGh(0, null, ["0", "1"]); // pre-check 0, post-delete check 1

    const { status, out } = gc();
    expect(status).toBe(0);
    expect(out).toContain(
      `WARNING: deleted remote origin/${branch} while an open PR appeared in the delete window; the remote moved on and was left untouched (never clobbered)`,
    );
    expect(out).toContain(`restore with: git push origin ${tip}:refs/heads/${branch}`);
    // The third party's tip is intact, and the outcome counts as kept.
    expect(git(repo, "ls-remote", "origin", `refs/heads/${branch}`).trim()).toBe(
      `${thirdTip}\trefs/heads/${branch}`,
    );
    expect(out).toContain("kept 0 (remote 1)");
  });

  // Deleting a head branch closes its PRs, so the post-delete open count reads
  // 0 whether or not the delete just closed one. The closed-unmerged snapshot
  // is the only evidence of a PR the delete itself closed.
  it("restores a remote twin when the delete itself closed a PR", () => {
    const branch = "session/20260101-raceclosed-abc207";
    squashMergedBranch(branch, "race\n");
    git(repo, "push", "-q", "origin", branch);
    const tip = git(repo, "rev-parse", branch).trim();
    // Both open checks read 0; only the closed snapshot gains an entry.
    writeFakeGh(0, null, ["0", "0"], ["none", "77\t2026-10-12T13:00:00Z"]);

    const { out } = gc();
    expect(out).toContain(
      `restored remote origin/${branch} after the delete — a PR was closed by this delete (fail-closed)`,
    );
    expect(remoteBranchExists(branch)).toBe(true);
    expect(git(repo, "ls-remote", "origin", `refs/heads/${branch}`).trim()).toBe(
      `${tip}\trefs/heads/${branch}`,
    );
    expect(out).toContain("kept 0 (remote 1)");
  });

  // A PR closed long before this delete is not evidence of a race: restoring
  // it would keep the branch alive on every run.
  it("deletes a remote twin whose only closed PR predates the delete", () => {
    const branch = "session/20260101-staleclosed-abc208";
    squashMergedBranch(branch, "race\n");
    git(repo, "push", "-q", "origin", branch);
    writeFakeGh(0, null, ["0", "0"], ["41\t2026-10-11T09:00:00Z", "41\t2026-10-11T09:00:00Z"]);

    const { out } = gc();
    expect(out).toContain(`deleted remote origin/${branch} (content merged)`);
    expect(out).not.toContain("restored remote");
    expect(remoteBranchExists(branch)).toBe(false);
  });

  // Without the snapshot a PR this delete closed cannot be told from a stale
  // one, so the delete does not happen at all.
  it("keeps a remote twin when the closed-PR history cannot be read", () => {
    const branch = "session/20260101-noclosedhist-abc209";
    squashMergedBranch(branch, "race\n");
    git(repo, "push", "-q", "origin", branch);
    writeFakeGh(0, null, ["0"], ["err"]);

    const { out } = gc();
    expect(out).toContain(
      `kept remote origin/${branch} (closed-PR history unavailable — fail-closed)`,
    );
    expect(remoteBranchExists(branch)).toBe(true);
  });

  // Ancestry is the strongest delivery proof: the commits themselves are on
  // origin/main. It also covers a branch whose files drifted after the merge
  // with no merged PR to point at (a local merge that reached main).
  it("deletes a branch merged into main by ancestry even after the files drifted", () => {
    const branch = "session/20260101-ancestry-abc206";
    const wtPath = join(repo, "wt-ancestry");
    git(repo, "worktree", "add", "-b", branch, wtPath);
    writeFileSync(join(wtPath, "feature.txt"), "ancestry\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "work");
    git(repo, "worktree", "remove", wtPath);
    git(repo, "merge", "--no-ff", "-q", "-m", "merge " + branch, branch);
    git(repo, "push", "-q", "origin", "main");
    git(repo, "push", "-q", "origin", branch);
    writeFileSync(join(repo, "feature.txt"), "drifted after the merge\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "drift");
    git(repo, "push", "-q", "origin", "main");

    const { out } = gc();
    expect(branchExists(branch)).toBe(false);
    expect(out).toContain(`deleted ${branch} (ancestry on origin/main)`);
    expect(remoteBranchExists(branch)).toBe(false);
    expect(out).toContain(`deleted remote origin/${branch} (ancestry on origin/main)`);
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

  // The routine case: the branch was merged into main and main was pushed.
  // Ancestry on origin/main is the strongest proof of delivery, and stop takes
  // the plain `git branch -d` path for it.
  it("stop deletes a branch merged into origin/main by ancestry", () => {
    const id = "20260101-ancstop-abc207";
    const branch = `session/${id}`;
    const wtPath = join(repo, "wt-ancstop");
    git(repo, "worktree", "add", "-b", branch, wtPath);
    const wtGitDir = git(wtPath, "rev-parse", "--absolute-git-dir").trim();
    mkdirSync(join(wtGitDir, "session-pilot"), { recursive: true });
    writeFileSync(join(wtGitDir, "session-pilot", "current-session"), id + "\n");
    writeFileSync(join(wtPath, "feature.txt"), "ancestry stop\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "work");
    git(repo, "merge", "--no-ff", "-q", "-m", "merge " + branch, branch);
    git(repo, "push", "-q", "origin", "main");

    const r = spawnSync("bash", [LAUNCHER, "stop", wtPath], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(branchExists(branch)).toBe(false);
    expect(r.stdout).toContain("merged session branch deleted (ancestry on origin/main)");
    expect(r.stdout).toContain("[session] post-delivery closeout:");
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

  // A parallel session's gc can sweep this session's branch while the worktree
  // sits on another branch — gc never touches a branch checked out in a
  // worktree, so checking out the closeout branch is what exposed it (#651,
  // measured 2026-10-14). stop must not report "kept (not delivered)" for a
  // branch that no longer exists — nothing was kept — and the closeout must
  // still run: gc only ever deletes delivered branches (fail-closed), and
  // merge → stop stays a single command.
  it("stop: session branch already swept by a parallel gc says so and still closes out", () => {
    const id = "20260101-swept-abc501";
    const branch = `session/${id}`;
    const wtPath = makeDeliveredSessionWorktree(id, "swept\n");
    // The worktree moved off the session branch (as closeout work does), which
    // is what let the parallel gc delete it; the remote twin survives.
    git(wtPath, "checkout", "-q", "--detach");
    git(repo, "branch", "-D", branch);

    const r = spawnSync("bash", [LAUNCHER, "stop", wtPath], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(existsSync(wtPath)).toBe(false);
    expect(r.stdout).toContain("session branch already gone (swept by an earlier gc or deleted)");
    expect(r.stdout).not.toContain("not delivered");
    expect(r.stdout).not.toContain("[session] session branch kept");
    expect(r.stdout).toContain("[session] post-delivery closeout:");
    expect(r.stdout).not.toContain("closeout after the PR merges");
    // The closeout's orphan pass sweeps the remote twin the parallel gc left.
    expect(remoteBranchExists(branch)).toBe(false);
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

  // Ancestry is checked against main, not against whatever branch the main
  // checkout happens to sit on: a side branch containing the session commits
  // (a local integration branch, say) is not a delivery to main.
  it("stop keeps a branch merged only into a side branch", () => {
    const id = "20260101-sidebranch-abc657";
    const branch = `session/${id}`;
    const wtPath = join(repo, "wt-sidebranch");
    git(repo, "worktree", "add", "-b", branch, wtPath);
    const wtGitDir = git(wtPath, "rev-parse", "--absolute-git-dir").trim();
    mkdirSync(join(wtGitDir, "session-pilot"), { recursive: true });
    writeFileSync(join(wtGitDir, "session-pilot", "current-session"), id + "\n");
    writeFileSync(join(wtPath, "wip.txt"), "side branch only\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "wip");
    git(wtPath, "push", "-q", "-u", "origin", branch);
    // The main checkout is parked on a side branch that contains the session
    // commits; main itself never saw them.
    git(repo, "checkout", "-q", "-b", "integration", branch);

    const r = spawnSync("bash", [LAUNCHER, "stop", wtPath], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(branchExists(branch)).toBe(true);
    expect(r.stdout).toContain("session branch kept (not delivered");
  });

  // The routine sequence is merge → stop with no intervening fetch. The
  // origin/main tracking ref then lags the remote, and the PR criterion needs
  // the merge commit to be reachable from the judged ref — so stop must
  // refresh origin/main before judging (non-fatal: offline stays fail-closed).
  it("stop refreshes origin/main before judging (merge → stop with no fetch)", () => {
    const id = "20260101-stale-main-abc658";
    const branch = `session/${id}`;
    const wtPath = join(repo, "wt-stalemain");
    git(repo, "worktree", "add", "-b", branch, wtPath);
    const wtGitDir = git(wtPath, "rev-parse", "--absolute-git-dir").trim();
    mkdirSync(join(wtGitDir, "session-pilot"), { recursive: true });
    writeFileSync(join(wtGitDir, "session-pilot", "current-session"), id + "\n");
    writeFileSync(join(wtPath, "feature.txt"), "stale main\n");
    git(wtPath, "add", ".");
    git(wtPath, "commit", "-q", "-m", "work");
    const tip = git(wtPath, "rev-parse", "HEAD").trim();
    git(wtPath, "push", "-q", "-u", "origin", branch);
    // The squash and a following drift commit land on origin/main from a
    // second clone, so the fixture's own origin/main tracking ref stays behind
    // and byte identity can no longer verify the branch.
    const other = mkdtempSync(join(tmpdir(), "launcher-stop-other-"));
    git(repo, "clone", "-q", origin, other);
    git(other, "config", "user.email", "test@example.com");
    git(other, "config", "user.name", "test");
    writeFileSync(join(other, "feature.txt"), "stale main\n");
    git(other, "add", ".");
    git(other, "commit", "-q", "-m", "squash merge");
    const mergeCommit = git(other, "rev-parse", "HEAD").trim();
    writeFileSync(join(other, "feature.txt"), "drifted\n");
    git(other, "add", ".");
    git(other, "commit", "-q", "-m", "release bump");
    git(other, "push", "-q", "origin", "main");
    rmSync(other, { recursive: true, force: true });
    writeFakeGh(0, { branch, mergeCommit, headRefOid: tip });

    const r = spawnSync("bash", [LAUNCHER, "stop", wtPath], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, GH_CMD: join(ghDir, "gh") },
    });
    expect(r.status).toBe(0);
    expect(branchExists(branch)).toBe(false);
    expect(r.stdout).toContain("PR-merged session branch deleted");
    expect(r.stdout).toContain("[session] post-delivery closeout:");
    expect(remoteBranchExists(branch)).toBe(false);
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

// ─── start: worktree provisioning ───────────────────────────────────────────
//
// `start` hands out a worktree; it must also make that worktree runnable.
// Without the provisioned artifacts the six `npx remotion still` suites fail
// on environment, not on the branch (no nested node_modules → `npm error
// could not determine executable to run`; no fixture media → `Could not load
// <CanvasImage>`), so the wiring is asserted here rather than discovered later.
describe("session-launcher start: provisioning wiring", () => {
  let origin;
  let repo;

  beforeEach(() => {
    origin = mkdtempSync(join(tmpdir(), "launcher-start-origin-"));
    git(origin, "init", "--bare", "-q", "--initial-branch=main");
    repo = mkdtempSync(join(tmpdir(), "launcher-start-repo-"));
    git(repo, "clone", "-q", origin, ".");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "test");
    // The launcher installs hooks when hooksPath is unset; this repo has no
    // installer, and hooks are not what this block is about.
    git(repo, "config", "core.hooksPath", ".githooks");
    mkdirSync(join(repo, "scripts"), { recursive: true });
    copyFileSync(
      join(import.meta.dirname, "..", "session-provision.sh"),
      join(repo, "scripts", "session-provision.sh"),
    );
    writeFileSync(join(repo, "README.md"), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");
    git(repo, "push", "-q", "-u", "origin", "main");
    // A main-checkout-only artifact, so provisioning has something to do.
    mkdirSync(join(repo, "scripts", "short-video", "voice-samples"), { recursive: true });
    writeFileSync(join(repo, "scripts", "short-video", "voice-samples", "ref.wav"), "wav");
  });

  afterEach(() => {
    rmSync(origin, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  function start(extraEnv = {}) {
    const wtpath = mkdtempSync(join(tmpdir(), "launcher-start-wt-")) + "/wt";
    const r = spawnSync("bash", [LAUNCHER, "start", "provision-wiring", wtpath], {
      encoding: "utf8",
      cwd: repo,
      env: { ...process.env, SESSION_NO_FETCH: "1", ...extraEnv },
    });
    return { r, wtpath };
  }

  it("provisions the new worktree before handing it over", () => {
    const { r, wtpath } = start();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("[provision]");
    expect(existsSync(join(wtpath, "scripts", "short-video", "voice-samples", "ref.wav"))).toBe(
      true,
    );
  });

  it("SESSION_NO_PROVISION=1 skips provisioning", () => {
    const { r, wtpath } = start({ SESSION_NO_PROVISION: "1" });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain("[provision]");
    expect(existsSync(join(wtpath, "scripts", "short-video", "voice-samples", "ref.wav"))).toBe(
      false,
    );
  });

  it("a missing session-provision.sh does not break start (older checkout)", () => {
    rmSync(join(repo, "scripts", "session-provision.sh"));
    const { r, wtpath } = start();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("session started");
    expect(existsSync(wtpath)).toBe(true);
  });
});
