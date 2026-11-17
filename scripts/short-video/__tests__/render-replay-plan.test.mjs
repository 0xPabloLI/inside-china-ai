/**
 * Replay planning — before `replay-render.mjs` spawns Remotion it must know
 * whether the inputs the manifest points at still exist, and say which ones
 * do not. The render door deletes its audio copies after a successful render,
 * so "missing" has to distinguish "re-copy from output/<id>/audio" from
 * "gone for good".
 *
 * A manifest is data on disk, so its paths and its recorded argv are treated as
 * untrusted: the plan refuses paths outside the manifest's own output tree and
 * rebuilds the command instead of executing the recorded one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REMOTION_BIN,
  assertReplayableCommand,
  buildRemotionRenderArgs,
  buildStillRenderArgs,
  planReplay,
  propsPathFor,
  renderArtifactDir,
  writeRenderArtifacts,
} from "../lib/render-manifest.mjs";
import { main } from "../replay-render.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "..", "..", "scripts", "short-video", "replay-render.mjs");

const PROPS = {
  scenes: [
    { id: 1, text: "one", media: { path: "assets/_staged/a.png" } },
    {
      id: 2,
      text: "two",
      media: { path: "assets/_staged/b.png", backdrop: { path: "assets/_staged/bg.mp4" } },
    },
  ],
  audioPaths: ["audio/scene-1.wav", "audio/scene-2.wav"],
  durations: [7, 8],
  contentDir: "/content/pack",
};

const FINALIZE = {
  assPath: null,
  bgmPath: null,
  deleteRawAfter: true,
  sceneDurations: [
    { sceneId: 1, duration: 7 },
    { sceneId: 2, duration: 8 },
  ],
  audioBasenames: ["scene-1.wav", "scene-2.wav"],
};

let root;
let outputDir;
let publicDir;
let audioDir;
let manifestPath;

function touch(path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "x");
}

/** A complete render's artifacts, all inside this test's output tree. */
function writeRender({ version = "v1", props = PROPS, ...overrides } = {}) {
  const rawPath = join(outputDir, `pack-${version}-raw.mp4`);
  const propsPath = propsPathFor(renderArtifactDir(outputDir, version));
  return writeRenderArtifacts({
    outputDir,
    version,
    props,
    pipelineId: "pack",
    contentDir: "/content/pack",
    audioDir,
    rawPath,
    finalPath: join(outputDir, `pack-${version}-short.mp4`),
    subtitlesPath: null,
    bgmPath: null,
    subject: null,
    command: buildRemotionRenderArgs({ rawPath, propsPath }),
    finalize: FINALIZE,
    ...overrides,
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "replay-plan-"));
  outputDir = join(root, "output", "pack");
  publicDir = join(root, "public");
  audioDir = join(outputDir, "audio");
  touch(join(publicDir, "assets/_staged/a.png"));
  touch(join(publicDir, "assets/_staged/b.png"));
  touch(join(publicDir, "assets/_staged/bg.mp4"));
  touch(join(publicDir, "audio/scene-1.wav"));
  touch(join(publicDir, "audio/scene-2.wav"));
  ({ manifestPath } = writeRender());
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("planReplay", () => {
  it("plans the rebuilt command when every artifact is present", () => {
    const plan = planReplay({ manifestPath, publicDir, remotionDir: "/remotion" });

    expect(plan.ok).toBe(true);
    expect(plan.blocking).toEqual([]);
    expect(plan.command).toEqual(
      buildRemotionRenderArgs({
        rawPath: join(outputDir, "pack-v1-raw.mp4"),
        propsPath: propsPathFor(renderArtifactDir(outputDir, "v1")),
      }),
    );
    expect(plan.cwd).toBe("/remotion");
    expect(plan.audioDir).toBe(audioDir);
  });

  it("blocks on a staged asset Remotion cannot rebuild", () => {
    rmSync(join(publicDir, "assets/_staged/b.png"));
    const plan = planReplay({ manifestPath, publicDir, remotionDir: "/remotion" });

    expect(plan.ok).toBe(false);
    expect(plan.blocking.join("\n")).toContain("assets/_staged/b.png");
  });

  it("blocks on a backdrop clip too", () => {
    rmSync(join(publicDir, "assets/_staged/bg.mp4"));
    const plan = planReplay({ manifestPath, publicDir, remotionDir: "/remotion" });

    expect(plan.blocking.join("\n")).toContain("assets/_staged/bg.mp4");
  });

  it("recovers audio from output/<id>/audio when the public copy is gone", () => {
    rmSync(join(publicDir, "audio/scene-1.wav"));
    touch(join(audioDir, "scene-1.wav"));

    const plan = planReplay({ manifestPath, publicDir, remotionDir: "/remotion" });

    expect(plan.ok).toBe(true);
    expect(plan.recoverable).toEqual([
      {
        rel: "audio/scene-1.wav",
        from: join(audioDir, "scene-1.wav"),
        to: join(publicDir, "audio/scene-1.wav"),
      },
    ]);
  });

  it("recovers from an audio dir the operator moved, and finalizes against it", () => {
    const moved = join(root, "moved-audio");
    rmSync(join(publicDir, "audio/scene-1.wav"));
    touch(join(moved, "scene-1.wav"));

    const plan = planReplay({ manifestPath, publicDir, remotionDir: "/remotion", audioDir: moved });

    expect(plan.ok).toBe(true);
    expect(plan.audioDir).toBe(moved);
    expect(plan.recoverable[0].from).toBe(join(moved, "scene-1.wav"));
  });

  it("blocks audio that exists nowhere, naming both places it looked", () => {
    rmSync(join(publicDir, "audio/scene-2.wav"));
    const plan = planReplay({ manifestPath, publicDir, remotionDir: "/remotion" });

    expect(plan.ok).toBe(false);
    const text = plan.blocking.join("\n");
    expect(text).toContain("audio/scene-2.wav");
    expect(text).toContain(join(audioDir, "scene-2.wav"));
  });

  it("blocks when a recorded subtitle is gone", () => {
    const { manifestPath: other } = writeRender({
      version: "v2",
      subtitlesPath: join(outputDir, "gone.ass"),
      finalize: { ...FINALIZE, assPath: join(outputDir, "gone.ass"), deleteRawAfter: false },
    });

    const plan = planReplay({ manifestPath: other, publicDir, remotionDir: "/remotion" });

    expect(plan.ok).toBe(false);
    expect(plan.blocking.join("\n")).toContain("subtitle missing");
    expect(plan.blocking.join("\n")).toContain("gone.ass");
  });

  it("blocks when a recorded BGM is gone", () => {
    const goneBgm = join(outputDir, "gone.mp3");
    const { manifestPath: other } = writeRender({
      version: "v3",
      bgmPath: goneBgm,
      finalize: { ...FINALIZE, bgmPath: goneBgm },
    });

    const plan = planReplay({ manifestPath: other, publicDir, remotionDir: "/remotion" });

    expect(plan.ok).toBe(false);
    expect(plan.blocking.join("\n")).toContain("bgm missing");
  });

  it("notes when no audio was recorded, because finalize then skips realign", () => {
    const { manifestPath: other } = writeRender({
      version: "v4",
      props: { scenes: [{ id: 1 }], audioPaths: [], durations: [3], contentDir: "/c" },
      finalize: { ...FINALIZE, audioBasenames: [] },
    });

    const plan = planReplay({ manifestPath: other, publicDir, remotionDir: "/remotion" });

    expect(plan.ok).toBe(true);
    expect(plan.notes.join("\n")).toContain("no audio recorded");
  });

  it("reports a still manifest as a still, not a video", () => {
    const out = join(outputDir, "render", "still-30", "frame-30.png");
    const { manifestPath: still } = writeRender({
      version: "still-30",
      props: { scenes: [{ id: 1 }], audioPaths: [], durations: [3], contentDir: "/c" },
      rawPath: out,
      finalPath: out,
      command: buildStillRenderArgs({
        out,
        frame: 30,
        propsPath: propsPathFor(renderArtifactDir(outputDir, "still-30")),
      }),
      kind: "still",
      finalize: null,
    });

    const plan = planReplay({ manifestPath: still, publicDir, remotionDir: "/remotion" });

    expect(plan.kind).toBe("still");
    expect(plan.ok).toBe(true);
  });

  it("fails readably when the manifest itself is missing", () => {
    expect(() =>
      planReplay({ manifestPath: join(root, "nope.json"), publicDir, remotionDir: "/remotion" }),
    ).toThrow(/manifest/i);
  });
});

describe("untrusted manifests", () => {
  it("refuses a recorded command that is not the one the manifest implies", () => {
    const manifest = { command: ["rm", "-rf", "/"], propsPath: "/x/props.json" };
    expect(() => assertReplayableCommand(manifest)).toThrow(/refusing to replay/);
  });

  it("refuses extra argv flags smuggled into the record", () => {
    const { manifest } = writeRender();
    const recorded = [...manifest.command, "--browser-executable=/tmp/evil"];
    expect(() => assertReplayableCommand({ ...manifest, command: recorded })).toThrow(
      /recorded command is not the one this manifest implies/,
    );
  });

  it("refuses a second --props that Remotion would honour over the verified one", () => {
    const { manifest } = writeRender();
    const recorded = [...manifest.command, "--props=/tmp/other.json"];
    expect(() => assertReplayableCommand({ ...manifest, command: recorded })).toThrow(
      /not the one this manifest implies/,
    );
  });

  it("refuses a still manifest carrying a render command", () => {
    const out = join(outputDir, "render", "still-30", "frame-30.png");
    const { manifest } = writeRender({
      version: "still-30",
      props: { scenes: [{ id: 1 }], audioPaths: [], durations: [3], contentDir: "/c" },
      rawPath: out,
      finalPath: out,
      kind: "still",
      finalize: null,
      command: buildStillRenderArgs({
        out,
        frame: 30,
        propsPath: propsPathFor(renderArtifactDir(outputDir, "still-30")),
      }),
    });
    const recorded = buildRemotionRenderArgs({
      rawPath: out,
      propsPath: manifest.propsPath,
    });

    expect(() => assertReplayableCommand({ ...manifest, command: recorded })).toThrow(
      /refusing to replay/,
    );
  });

  it("refuses a recorded output or final video outside the manifest's output tree", () => {
    const outside = writeRender({
      version: "v5",
      rawPath: join(root, "elsewhere-raw.mp4"),
      finalPath: join(root, "elsewhere-short.mp4"),
      command: buildRemotionRenderArgs({
        rawPath: join(root, "elsewhere-raw.mp4"),
        propsPath: propsPathFor(renderArtifactDir(outputDir, "v5")),
      }),
    });

    expect(() =>
      planReplay({ manifestPath: outside.manifestPath, publicDir, remotionDir: "/remotion" }),
    ).toThrow(/outside .*output\/pack/);
  });

  it("refuses a props file that was moved out of the manifest's directory", () => {
    const { manifestPath: other } = writeRender({ version: "v6" });
    const stray = join(root, "stray-props.json");
    const manifest = JSON.parse(readFileSync(other, "utf8"));
    writeFileSync(stray, readFileSync(manifest.propsPath, "utf8"));
    writeFileSync(other, JSON.stringify({ ...manifest, propsPath: stray }));

    expect(() => planReplay({ manifestPath: other, publicDir, remotionDir: "/remotion" })).toThrow(
      /props file .* is outside/,
    );
  });

  it("refuses an audio rel that would escape the public tree", () => {
    const { manifestPath: other } = writeRender({
      version: "v7",
      props: { ...PROPS, audioPaths: ["../../evil.wav"] },
    });

    expect(() => planReplay({ manifestPath: other, publicDir, remotionDir: "/remotion" })).toThrow(
      /recorded audio .* is outside/,
    );
  });

  it("refuses a staged asset rel that would escape the public tree", () => {
    const { manifestPath: other } = writeRender({
      version: "v8",
      props: {
        ...PROPS,
        scenes: [{ id: 1, media: { path: "../../etc/passwd" } }],
        audioPaths: [],
      },
      finalize: { ...FINALIZE, audioBasenames: [] },
    });

    expect(() => planReplay({ manifestPath: other, publicDir, remotionDir: "/remotion" })).toThrow(
      /recorded asset .* is outside/,
    );
  });
});

describe("replay-render CLI", () => {
  const capture = () => {
    const out = [];
    const err = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => out.push(a.join(" ")));
    const errSpy = vi.spyOn(console, "error").mockImplementation((...a) => err.push(a.join(" ")));
    return { out, err, restore: () => (logSpy.mockRestore(), errSpy.mockRestore()) };
  };

  it("prints the plan and returns 0 when artifacts are present", () => {
    const sink = capture();
    const code = main(["--manifest", manifestPath, "--plan", "--public-dir", publicDir]);
    sink.restore();

    expect(code).toBe(0);
    expect(sink.out.join("\n")).toContain("status:  ok");
    expect(sink.out.join("\n")).toContain("kind:    render");
    expect(sink.out.join("\n")).toContain("remotion render");
  });

  it("returns 1 and names the missing asset", () => {
    rmSync(join(publicDir, "assets/_staged/a.png"));
    const sink = capture();
    const code = main(["--manifest", manifestPath, "--plan", "--public-dir", publicDir]);
    sink.restore();

    expect(code).toBe(1);
    expect(`${sink.out.join("\n")}${sink.err.join("\n")}`).toContain("assets/_staged/a.png");
  });

  it("refuses a manifest that would write outside its tree, before spawning", () => {
    const outside = writeRender({
      version: "v9",
      rawPath: "/tmp/evil-raw.mp4",
      finalPath: "/tmp/evil-short.mp4",
      command: buildRemotionRenderArgs({
        rawPath: "/tmp/evil-raw.mp4",
        propsPath: propsPathFor(renderArtifactDir(outputDir, "v9")),
      }),
    });
    const sink = capture();
    const code = main(["--manifest", outside.manifestPath, "--public-dir", publicDir]);
    sink.restore();

    expect(code).toBe(1);
    expect(sink.err.join("\n")).toContain("outside");
  });

  it("refuses to run without --manifest", () => {
    const sink = capture();
    const code = main(["--plan"]);
    sink.restore();

    expect(code).toBe(1);
    expect(sink.err.join("\n")).toMatch(/--manifest/);
  });

  it("returns 1 for a manifest that is not on disk", () => {
    const sink = capture();
    const code = main(["--manifest", join(root, "nope.json"), "--plan"]);
    sink.restore();

    expect(code).toBe(1);
    expect(sink.err.join("\n")).toContain("manifest not found");
  });

  it("keeps the realpath CLI guard (import must not execute)", () => {
    // §12: a guard that compares resolved paths is the only spelling that does
    // not silently skip main() (and exit 0 with no output) through a symlink.
    const src = readFileSync(CLI, "utf8");
    expect(src).toContain("realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)");
  });
});
