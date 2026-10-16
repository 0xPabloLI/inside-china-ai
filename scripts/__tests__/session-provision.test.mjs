import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  lstatSync,
  realpathSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

// session-provision.sh: a bare `git worktree add` has no installed dependencies
// and none of the gitignored local artifacts (reference voice, fixture media),
// which is where the environment false failures come from — six
// `npx remotion still` suites failing with `npm error could not determine
// executable to run` / `Could not load <CanvasImage>` on a clean worktree.
//
// The tests below pin the two decisions that are not obvious:
//   - dependencies are SYMLINKED (one installed copy), the voice and the
//     fixture media are COPIED (a symlinked media file is a silent 404 through
//     the Remotion dev server, and a symlinked voice dir would show up as an
//     untracked entry that makes session:stop call the worktree dirty)
//   - the fixture-media list is DERIVED from the fixtures, so a docblock
//     mentioning `content/{slug}/assets/x.mp4` must not produce a bogus
//     `assets/x.mp4` reference

const PROVISION = join(import.meta.dirname, "..", "session-provision.sh");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] }).toString();
}

function provision(target, env = {}) {
  const r = spawnSync("bash", [PROVISION, target], {
    encoding: "utf8",
    cwd: target,
    env: { ...process.env, ...env },
  });
  return r;
}

describe("session-provision.sh: worktree provisioning", () => {
  let repo;
  let wt;

  beforeEach(() => {
    // realpath: on macOS tmpdir() is /var/folders/... while a shell that cd's
    // there reports /private/var/folders/..., and the script prints the latter.
    // The space is deliberate: `git worktree list --porcelain` emits paths raw,
    // so every test below also guards the main-worktree resolution against
    // field splitting.
    repo = realpathSync(mkdtempSync(join(tmpdir(), "provision test-")));
    git(repo, "init", "-q", "--initial-branch=main");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "test");
    // The real .gitignore patterns the script relies on being in place.
    writeFileSync(
      join(repo, ".gitignore"),
      [
        "node_modules",
        "scripts/short-video/voice-samples/",
        "scripts/short-video/assets/pexels-*",
      ].join("\n") + "\n",
    );
    mkdirSync(join(repo, "scripts", "short-video", "remotion", "src"), { recursive: true });
    // Both fixture shapes are committed up front so the worktree starts with
    // them tracked: the media ref the script must copy, and a docblock path
    // that mentions content/{slug}/assets/... and must NOT be mistaken for one.
    writeFileSync(
      join(repo, "scripts", "short-video", "remotion", "src", "scene-gate-fixture.tsx"),
      'path: "assets/pexels-ai-chip.jpg",\n',
    );
    writeFileSync(
      join(repo, "scripts", "short-video", "remotion", "src", "media-zoom-fixture.tsx"),
      " * (content/unitree/assets/unitree-superman-demo.mp4 — 640x360 source)\n",
    );
    writeFileSync(join(repo, "README.md"), "x");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");

    // Main-checkout-only artifacts: installed deps + gitignored local files.
    mkdirSync(join(repo, "node_modules"), { recursive: true });
    writeFileSync(join(repo, "node_modules", ".package-lock.json"), "{}");
    mkdirSync(join(repo, "scripts", "short-video", "node_modules"), { recursive: true });
    writeFileSync(join(repo, "scripts", "short-video", "node_modules", "x.js"), "x");
    mkdirSync(join(repo, "scripts", "short-video", "remotion", "node_modules"), {
      recursive: true,
    });
    writeFileSync(join(repo, "scripts", "short-video", "remotion", "node_modules", "y.js"), "y");
    mkdirSync(join(repo, "scripts", "short-video", "voice-samples"), { recursive: true });
    writeFileSync(
      join(repo, "scripts", "short-video", "voice-samples", "voice-sample-24k.wav"),
      "wav",
    );
    mkdirSync(join(repo, "scripts", "short-video", "assets"), { recursive: true });
    writeFileSync(join(repo, "scripts", "short-video", "assets", "pexels-ai-chip.jpg"), "jpg");

    wt = join(repo, "wt-provision");
    git(repo, "worktree", "add", "-b", "session/20260101-provision-abc123", wt);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("symlinks the three node_modules and copies voice-samples + fixture media", () => {
    const r = provision(wt);
    expect(r.status).toBe(0);

    // Dependencies: symlink to the single installed copy.
    const probe = {
      node_modules: ".package-lock.json",
      "scripts/short-video/node_modules": "x.js",
      "scripts/short-video/remotion/node_modules": "y.js",
    };
    for (const [rel, file] of Object.entries(probe)) {
      const p = join(wt, rel);
      expect(existsSync(p)).toBe(true);
      expect(lstatSync(p).isSymbolicLink()).toBe(true);
      expect(existsSync(join(p, file))).toBe(true);
    }

    // Voice + media: real files, not symlinks.
    const voice = join(wt, "scripts", "short-video", "voice-samples");
    expect(lstatSync(voice).isSymbolicLink()).toBe(false);
    expect(existsSync(join(voice, "voice-sample-24k.wav"))).toBe(true);
    const media = join(wt, "scripts", "short-video", "assets", "pexels-ai-chip.jpg");
    expect(lstatSync(media).isSymbolicLink()).toBe(false);
    expect(readFileSync(media, "utf8")).toBe("jpg");
  });

  it("leaves the worktree clean — nothing provisioned shows up as untracked", () => {
    provision(wt);
    expect(git(wt, "status", "--porcelain").trim()).toBe("");
  });

  it("derives media from fixtures only — a content/ docblock path is not a public asset", () => {
    const r = provision(wt);
    expect(r.status).toBe(0);
    // The bogus ref must not be reported as a missing main-checkout file...
    expect(r.stderr).not.toContain("unitree-superman-demo.mp4");
    // ...and no such file is invented.
    expect(
      existsSync(join(wt, "scripts", "short-video", "assets", "unitree-superman-demo.mp4")),
    ).toBe(false);
  });

  it("is idempotent and never overwrites a file the worktree already has", () => {
    provision(wt);
    // A worktree-local edit to a provisioned copy survives the second run.
    writeFileSync(join(wt, "scripts", "short-video", "assets", "pexels-ai-chip.jpg"), "edited");
    const r = provision(wt);
    expect(r.status).toBe(0);
    expect(
      readFileSync(join(wt, "scripts", "short-video", "assets", "pexels-ai-chip.jpg"), "utf8"),
    ).toBe("edited");
    expect(r.stdout).toContain("already present");
  });

  it("warns and still exits 0 when an artifact is missing from the main checkout", () => {
    rmSync(join(repo, "scripts", "short-video", "voice-samples"), { recursive: true, force: true });
    rmSync(join(repo, "scripts", "short-video", "remotion", "node_modules"), {
      recursive: true,
      force: true,
    });
    const r = provision(wt);
    expect(r.status).toBe(0); // fail-open: a worktree must still boot
    expect(r.stderr).toContain(
      "not installed in the main checkout, skipped: scripts/short-video/remotion/node_modules",
    );
    expect(r.stderr).toContain(
      "absent in the main checkout, skipped: scripts/short-video/voice-samples",
    );
    expect(existsSync(join(wt, "scripts", "short-video", "voice-samples"))).toBe(false);
  });

  it("defaults to the current toplevel and no-ops on the main worktree itself", () => {
    const r = spawnSync("bash", [PROVISION], { encoding: "utf8", cwd: wt });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`[provision] target: ${wt}`);

    const onMain = spawnSync("bash", [PROVISION], { encoding: "utf8", cwd: repo });
    expect(onMain.status).toBe(0);
    expect(onMain.stdout).toContain("is the main worktree — nothing to do");
  });

  it("rejects a path that is not a directory", () => {
    const r = spawnSync("bash", [PROVISION, join(repo, "nope")], { encoding: "utf8", cwd: repo });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not a directory");
  });
});
