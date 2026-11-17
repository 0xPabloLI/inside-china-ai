/**
 * Replay planning — before `replay-render.mjs` spawns Remotion it must know
 * whether the inputs the manifest points at still exist, and say which ones
 * do not. The render door deletes its audio copies after a successful render,
 * so "missing" has to distinguish "re-copy from output/<id>/audio" from
 * "gone for good".
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

let root;
let publicDir;
let audioDir;
let manifestPath;

function touch(path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "x");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "replay-plan-"));
  publicDir = join(root, "public");
  audioDir = join(root, "output", "pack", "audio");
  touch(join(publicDir, "assets/_staged/a.png"));
  touch(join(publicDir, "assets/_staged/b.png"));
  touch(join(publicDir, "assets/_staged/bg.mp4"));
  touch(join(publicDir, "audio/scene-1.wav"));
  touch(join(publicDir, "audio/scene-2.wav"));

  const outputDir = join(root, "output", "pack");
  const rawPath = join(outputDir, "pack-raw.mp4");
  const recordedPropsPath = propsPathFor(renderArtifactDir(outputDir, "v1"));
  ({ manifestPath } = writeRenderArtifacts({
    outputDir,
    version: "v1",
    props: PROPS,
    pipelineId: "pack",
    contentDir: "/content/pack",
    audioDir,
    rawPath,
    finalPath: join(outputDir, "pack-short.mp4"),
    subtitlesPath: null,
    bgmPath: null,
    subject: null,
    command: buildRemotionRenderArgs({ rawPath, propsPath: recordedPropsPath }),
  }));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("planReplay", () => {
  it("plans the exact recorded command when every artifact is present", () => {
    const plan = planReplay({ manifestPath, publicDir, remotionDir: "/remotion" });
    expect(plan.ok).toBe(true);
    expect(plan.blocking).toEqual([]);
    expect(plan.command).toEqual([
      REMOTION_BIN,
      "remotion",
      "render",
      "src/Root.tsx",
      "ShortVideo",
      join(root, "output", "pack", "pack-raw.mp4"),
      `--props=${propsPathFor(renderArtifactDir(join(root, "output", "pack"), "v1"))}`,
    ]);
    expect(plan.cwd).toBe("/remotion");
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

  it("blocks audio that exists nowhere, naming both places it looked", () => {
    rmSync(join(publicDir, "audio/scene-2.wav"));
    const plan = planReplay({ manifestPath, publicDir, remotionDir: "/remotion" });
    expect(plan.ok).toBe(false);
    const text = plan.blocking.join("\n");
    expect(text).toContain("audio/scene-2.wav");
    expect(text).toContain(join(audioDir, "scene-2.wav"));
  });

  it("blocks when a recorded subtitle is gone", () => {
    const outputDir = join(root, "output", "pack");
    const propsPath = propsPathFor(renderArtifactDir(outputDir, "v2"));
    const { manifestPath: other } = writeRenderArtifacts({
      outputDir,
      version: "v2",
      props: PROPS,
      pipelineId: "pack",
      contentDir: "/content/pack",
      audioDir,
      rawPath: join(root, "raw.mp4"),
      finalPath: join(root, "final.mp4"),
      subtitlesPath: join(root, "gone.ass"),
      bgmPath: null,
      subject: null,
      command: buildRemotionRenderArgs({ rawPath: join(root, "raw.mp4"), propsPath }),
    });
    const plan = planReplay({ manifestPath: other, publicDir, remotionDir: "/remotion" });
    expect(plan.ok).toBe(false);
    expect(plan.blocking.join("\n")).toContain("subtitle missing");
    expect(plan.blocking.join("\n")).toContain("gone.ass");
  });

  it("notes when no audio was recorded, because finalize then skips realign", () => {
    const outputDir = join(root, "output", "pack");
    const propsPath = propsPathFor(renderArtifactDir(outputDir, "v3"));
    const rawPath = join(root, "raw.mp4");
    const { manifestPath: other } = writeRenderArtifacts({
      outputDir,
      version: "v3",
      props: { scenes: [{ id: 1 }], audioPaths: [], durations: [3], contentDir: "/c" },
      pipelineId: "pack",
      contentDir: "/c",
      audioDir,
      rawPath,
      finalPath: join(root, "final.mp4"),
      subtitlesPath: null,
      bgmPath: null,
      subject: null,
      command: buildRemotionRenderArgs({ rawPath, propsPath }),
    });
    const plan = planReplay({ manifestPath: other, publicDir, remotionDir: "/remotion" });
    expect(plan.ok).toBe(true);
    expect(plan.notes.join("\n")).toContain("no audio recorded");
  });

  it("reports a still manifest as a still, not a video", () => {
    const outputDir = join(root, "output", "pack");
    const propsPath = propsPathFor(renderArtifactDir(outputDir, "still-30"));
    const { manifestPath: still } = writeRenderArtifacts({
      outputDir,
      version: "still-30",
      props: { scenes: [{ id: 1 }], audioPaths: [], durations: [3], contentDir: "/c" },
      pipelineId: "pack",
      contentDir: "/c",
      audioDir,
      rawPath: "/tmp/still.png",
      finalPath: "/tmp/still.png",
      subtitlesPath: null,
      bgmPath: null,
      subject: null,
      command: buildStillRenderArgs({ out: "/tmp/still.png", frame: 30, propsPath }),
      kind: "still",
    });
    const plan = planReplay({ manifestPath: still, publicDir, remotionDir: "/remotion" });
    expect(plan.kind).toBe("still");
    expect(plan.ok).toBe(true);
  });

  it("refuses a recorded command that is not a render", () => {
    const manifest = { command: ["rm", "-rf", "/"], propsPath: "/x/props.json" };
    expect(() => assertReplayableCommand(manifest)).toThrow(/refusing to replay/);
  });

  it("refuses a command whose --props path is not the manifest's file", () => {
    const manifest = {
      command: [
        REMOTION_BIN,
        "remotion",
        "render",
        "src/Root.tsx",
        "ShortVideo",
        "/o.mp4",
        "--props=/elsewhere.json",
      ],
      propsPath: "/x/props.json",
      rawPath: "/o.mp4",
    };
    expect(() => assertReplayableCommand(manifest)).toThrow(/does not match/);
  });

  it("refuses a command that renders another composition or output", () => {
    const propsPath = "/x/props.json";
    const base = [REMOTION_BIN, "remotion", "render", "src/Root.tsx"];
    expect(() =>
      assertReplayableCommand({
        command: [...base, "Other", "/o.mp4", `--props=${propsPath}`],
        propsPath,
        rawPath: "/o.mp4",
      }),
    ).toThrow(/not src\/Root.tsx ShortVideo/);
    expect(() =>
      assertReplayableCommand({
        command: [...base, "ShortVideo", "/elsewhere.mp4", `--props=${propsPath}`],
        propsPath,
        rawPath: "/o.mp4",
      }),
    ).toThrow(/recorded output/);
  });

  it("refuses a still without a numeric frame", () => {
    const propsPath = "/x/props.json";
    const command = buildStillRenderArgs({ out: "/tmp/x.png", frame: 30, propsPath }).map((arg) =>
      arg === "--frame=30" ? "--frame=../.." : arg,
    );
    expect(() => assertReplayableCommand({ command, propsPath, rawPath: "/tmp/x.png" })).toThrow(
      /numeric --frame/,
    );
  });

  it("fails readably when the manifest itself is missing", () => {
    expect(() =>
      planReplay({ manifestPath: join(root, "nope.json"), publicDir, remotionDir: "/remotion" }),
    ).toThrow(/manifest/i);
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
