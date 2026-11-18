import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../wip-snapshot.mjs", import.meta.url));

let root;
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).replace(/\n$/, "");
const run = (args = []) =>
  execFileSync(process.execPath, [SCRIPT, "--repo", root, ...args], { encoding: "utf8" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "wip-snapshot-"));
  git(["init", "-q", "-b", "main"]);
  git([
    "-c",
    "user.email=t@example.com",
    "-c",
    "user.name=t",
    "commit",
    "--allow-empty",
    "-m",
    "base",
  ]);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const refs = () =>
  git(["for-each-ref", "--format=%(refname)", "refs/wip"]).split("\n").filter(Boolean);

const latest = () => refs().at(-1);

describe("wip-snapshot", () => {
  it("reports a clean tree and creates no ref", () => {
    const out = run();
    expect(out).toMatch(/clean — nothing to snapshot/);
    expect(refs()).toEqual([]);
  });

  it("captures tracked edits and untracked files without touching the worktree or index", () => {
    writeFileSync(join(root, "tracked.txt"), "before\n");
    git(["add", "tracked.txt"]);
    git(["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-m", "add tracked"]);

    writeFileSync(join(root, "tracked.txt"), "after\n");
    writeFileSync(join(root, "notes.txt"), "untracked body\n");

    const out = run(["--label", "start"]);
    expect(out).toMatch(/refs\/wip\//);
    expect(refs()).toHaveLength(1);

    const ref = latest();
    expect(git(["show", `${ref}:notes.txt`])).toBe("untracked body");
    expect(git(["show", `${ref}:tracked.txt`])).toBe("after");

    // The snapshot is a copy, not a stash: the real index stays empty and the
    // working tree keeps both the edit and the untracked file.
    expect(git(["diff", "--cached", "--name-only"])).toBe("");
    expect(git(["status", "--porcelain", "--untracked-files=all"]).split("\n").sort()).toEqual([
      " M tracked.txt",
      "?? notes.txt",
    ]);
    expect(readFileSync(join(root, "notes.txt"), "utf8")).toBe("untracked body\n");
  });

  it("dry-run reports the path count and writes no ref", () => {
    writeFileSync(join(root, "scratch.txt"), "x\n");
    const out = run(["--dry-run"]);
    expect(out).toMatch(/dry-run: 1 path/);
    expect(refs()).toEqual([]);
  });

  it("keeps at most --keep refs, newest first", () => {
    writeFileSync(join(root, "scratch.txt"), "x\n");
    run(["--label", "a", "--keep", "2"]);
    run(["--label", "b", "--keep", "2"]);
    run(["--label", "c", "--keep", "2"]);

    const kept = refs();
    expect(kept).toHaveLength(2);
    expect(kept.some((r) => r.endsWith("-a"))).toBe(false);
    expect(kept.some((r) => r.endsWith("-b"))).toBe(true);
    expect(kept.some((r) => r.endsWith("-c"))).toBe(true);
  });

  it("exits 1 outside a git repository", () => {
    const plain = mkdtempSync(join(tmpdir(), "wip-plain-"));
    try {
      expect(() =>
        execFileSync(process.execPath, [SCRIPT, "--repo", plain], {
          encoding: "utf8",
          stdio: "pipe",
        }),
      ).toThrow(/not a git repository/);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
