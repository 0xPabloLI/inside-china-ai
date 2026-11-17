/**
 * Render artifacts — a render's props and the record of how it was produced.
 *
 * The command used to inline the whole props JSON, so a failed render left
 * nothing to replay: the props lived only in memory and the error truncated
 * the command to 200 characters. These tests pin the replacement contract:
 * props go to disk, the command only carries a path, and the manifest alone
 * is enough to replay a render.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

import {
  REMOTION_BIN,
  buildRemotionRenderArgs,
  buildStillRenderArgs,
  describeRenderFailure,
  formatRenderCommand,
  planFinalize,
  manifestPathFor,
  propsPathFor,
  readRenderArtifacts,
  renderArtifactDir,
  replayInstruction,
  writeRenderArtifacts,
} from "../lib/render-manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const PROPS = {
  scenes: [{ id: 1, text: "第一场", media: { path: "assets/_staged/a.png" } }],
  audioPaths: ["audio/scene-1.wav"],
  durations: [7.5],
  contentDir: "/content/pack",
};

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "render-manifest-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("renderArtifactDir", () => {
  it("keys the directory by version and falls back to latest", () => {
    expect(renderArtifactDir("/out/pack", "2026-11-17T10-00-00")).toBe(
      "/out/pack/render/2026-11-17T10-00-00",
    );
    expect(renderArtifactDir("/out/pack", null)).toBe("/out/pack/render/latest");
    expect(renderArtifactDir("/out/pack", "")).toBe("/out/pack/render/latest");
  });

  it("names the two files the replay path depends on", () => {
    expect(propsPathFor("/out/pack/render/v1")).toBe("/out/pack/render/v1/props.json");
    expect(manifestPathFor("/out/pack/render/v1")).toBe("/out/pack/render/v1/manifest.json");
  });
});

describe("writeRenderArtifacts", () => {
  it("writes props verbatim and a manifest that verifies them", () => {
    const { manifestPath, propsPath, manifest } = writeRenderArtifacts({
      outputDir: join(root, "pack"),
      version: "v1",
      props: PROPS,
      pipelineId: "pack",
      contentDir: "/content/pack",
      rawPath: "/out/pack-raw.mp4",
      finalPath: "/out/pack-short.mp4",
      subtitlesPath: "/out/subs.ass",
      bgmPath: null,
      subject: "unitree",
      command: [REMOTION_BIN, "remotion", "render", "x"],
    });

    expect(JSON.parse(readFileSync(propsPath, "utf8"))).toEqual(PROPS);
    expect(manifest).toMatchObject({
      schema: 1,
      pipelineId: "pack",
      version: "v1",
      subject: "unitree",
      contentDir: "/content/pack",
      rawPath: "/out/pack-raw.mp4",
      finalPath: "/out/pack-short.mp4",
      subtitlesPath: "/out/subs.ass",
      bgmPath: null,
      propsPath,
      command: [REMOTION_BIN, "remotion", "render", "x"],
    });
    expect(manifest.propsBytes).toBe(Buffer.byteLength(JSON.stringify(PROPS)));
    expect(manifest.propsSha256).toBe(
      createHash("sha256").update(JSON.stringify(PROPS)).digest("hex"),
    );
    expect(Number.isNaN(Date.parse(manifest.createdAt))).toBe(false);
    expect(existsSync(manifestPath)).toBe(true);
  });

  it("round-trips through readRenderArtifacts", () => {
    const { manifestPath, propsPath } = writeRenderArtifacts({
      outputDir: join(root, "pack"),
      version: null,
      props: PROPS,
      pipelineId: "pack",
      contentDir: "/content/pack",
      rawPath: "/out/pack-raw.mp4",
      finalPath: "/out/pack-short.mp4",
      subtitlesPath: null,
      bgmPath: null,
      subject: null,
      command: [REMOTION_BIN],
    });

    const read = readRenderArtifacts(manifestPath);
    expect(read.props).toEqual(PROPS);
    expect(read.manifest.propsPath).toBe(propsPath);
  });

  it("refuses a manifest whose props were edited after the write", () => {
    const { manifestPath, propsPath } = writeRenderArtifacts({
      outputDir: join(root, "pack"),
      version: "v1",
      props: PROPS,
      pipelineId: "pack",
      contentDir: "/content/pack",
      rawPath: "/out/raw.mp4",
      finalPath: "/out/final.mp4",
      subtitlesPath: null,
      bgmPath: null,
      subject: null,
      command: [REMOTION_BIN],
    });
    writeFileSync(propsPath, JSON.stringify({ ...PROPS, durations: [1] }));

    expect(() => readRenderArtifacts(manifestPath)).toThrow(/sha256/i);
  });

  it("refuses an unknown schema and a missing props file", () => {
    const { manifestPath, manifest } = writeRenderArtifacts({
      outputDir: join(root, "pack"),
      version: "v1",
      props: PROPS,
      pipelineId: "pack",
      contentDir: "/content/pack",
      rawPath: "/out/raw.mp4",
      finalPath: "/out/final.mp4",
      subtitlesPath: null,
      bgmPath: null,
      subject: null,
      command: [REMOTION_BIN],
    });

    writeFileSync(manifestPath, JSON.stringify({ ...manifest, schema: 99 }));
    expect(() => readRenderArtifacts(manifestPath)).toThrow(/schema/i);

    writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, propsPath: join(root, "gone.json") }),
    );
    expect(() => readRenderArtifacts(manifestPath)).toThrow(/props/i);
  });
});

describe("render command", () => {
  it("carries a props path instead of the payload", () => {
    const args = buildRemotionRenderArgs({
      rawPath: "/out/subj-pipe-raw.mp4",
      propsPath: "/out/subj-pipe/render/v1/props.json",
    });
    expect(args).toEqual([
      REMOTION_BIN,
      "remotion",
      "render",
      "src/Root.tsx",
      "ShortVideo",
      "/out/subj-pipe-raw.mp4",
      "--props=/out/subj-pipe/render/v1/props.json",
    ]);
    expect(formatRenderCommand(args)).toBe(
      `npx remotion render src/Root.tsx ShortVideo /out/subj-pipe-raw.mp4 --props=/out/subj-pipe/render/v1/props.json`,
    );
  });

  it("quotes both paths so spaces and quotes stay one argument", () => {
    const line = formatRenderCommand(
      buildRemotionRenderArgs({
        rawPath: "/out/it's raw.mp4",
        propsPath: "/out/pack dir/render/v1/props.json",
      }),
    );
    expect(line).toContain(`'/out/it'\\''s raw.mp4'`);
    expect(line).toContain(`'--props=/out/pack dir/render/v1/props.json'`);
  });

  it("stays short no matter how large the props are", () => {
    const huge = {
      ...PROPS,
      scenes: Array.from({ length: 400 }, (_, i) => ({
        id: i + 1,
        text: "长文本".repeat(120),
        info: { chart: "bar", values: Array.from({ length: 12 }, (_, k) => k) },
      })),
    };
    const { propsPath } = writeRenderArtifacts({
      outputDir: join(root, "pack"),
      version: "v1",
      props: huge,
      pipelineId: "pack",
      contentDir: "/content/pack",
      rawPath: "/out/raw.mp4",
      finalPath: "/out/final.mp4",
      subtitlesPath: null,
      bgmPath: null,
      subject: null,
      command: [REMOTION_BIN],
    });
    const line = formatRenderCommand(
      buildRemotionRenderArgs({ rawPath: "/out/raw.mp4", propsPath }),
    );
    expect(Buffer.byteLength(JSON.stringify(huge))).toBeGreaterThan(200_000);
    expect(line.length).toBeLessThan(512);
    expect(line).not.toContain('"scenes"');
  });
});

describe("still command", () => {
  it("passes the props file and keeps the bundle cache off", () => {
    const args = buildStillRenderArgs({
      out: "/tmp/still.png",
      frame: 450,
      propsPath: "/out/pack/render/still-450/props.json",
    });
    expect(args[0]).toBe(REMOTION_BIN);
    expect(args.slice(1).join(" ")).toBe(
      "remotion still src/Root.tsx ShortVideo /tmp/still.png --frame=450 --props=/out/pack/render/still-450/props.json --no-bundle-cache",
    );
  });
});

describe("describeRenderFailure", () => {
  it("names the manifest and a replay command instead of dumping the payload", () => {
    const manifestPath = join(root, "pack", "render", "v1", "manifest.json");
    mkdirSync(join(root, "pack", "render", "v1"), { recursive: true });
    writeFileSync(manifestPath, "{}");

    const text = describeRenderFailure({
      detail: 'line one\n[TextFitError] {"scene":3}\nnoise',
      commandLine: "npx remotion render src/Root.tsx ShortVideo /out/raw.mp4 --props=/p.json",
      manifestPath,
    });

    expect(text).toContain("--props=");
    expect(text).toContain(manifestPath);
    expect(text).toContain("replay-render.mjs --manifest");
    expect(text).toContain("[TextFitError]");
    expect(text).not.toContain('"scenes"');
  });

  it("keeps the instruction usable when no manifest was written", () => {
    const text = describeRenderFailure({
      detail: "boom",
      commandLine: "npx x",
      manifestPath: null,
    });
    expect(text).toContain("boom");
    expect(text).toContain("no manifest");
    expect(text).not.toContain("replay-render.mjs");
  });
});

describe("planFinalize", () => {
  const manifest = {
    rawPath: "/out/pack/pack-raw.mp4",
    finalPath: "/out/pack/pack-short.mp4",
    subtitlesPath: "/out/subs.ass",
    bgmPath: "/out/bgm.mp3",
    audioDir: "/out/pack/audio",
  };
  const props = { scenes: [{ id: 1 }, { id: 2 }], audioPaths: ["audio/a.wav"], durations: [4, 5] };

  it("finalizes with subtitles and keeps the raw file", () => {
    const plan = planFinalize({ manifest, props, exists: () => true });
    expect(plan.assPath).toBe("/out/subs.ass");
    expect(plan.bgmPath).toBe("/out/bgm.mp3");
    expect(plan.deleteRawAfter).toBe(false);
    expect(plan.realign.audioPaths).toEqual(["/out/pack/audio/a.wav"]);
    expect(plan.realign.sceneDurations).toEqual([
      { sceneId: 1, duration: 4 },
      { sceneId: 2, duration: 5 },
    ]);
  });

  it("still finalizes when nothing but the video was recorded", () => {
    const plan = planFinalize({
      manifest: { ...manifest, subtitlesPath: null, bgmPath: null },
      props,
      exists: () => true,
    });
    expect(plan.assPath).toBeNull();
    expect(plan.bgmPath).toBeNull();
    expect(plan.outputPath).toBe("/out/pack/pack-short.mp4");
    // The render door removes the raw file when no subtitles were burned, so a
    // replay that kept it would leave a different artifact behind.
    expect(plan.deleteRawAfter).toBe(true);
  });

  it("drops realign when the source audio is gone", () => {
    const plan = planFinalize({
      manifest,
      props,
      exists: (path) => !path.endsWith("a.wav"),
    });
    expect(plan.realign).toBeNull();
  });
});

describe("replayInstruction", () => {
  it("quotes the manifest path into one runnable command", () => {
    expect(replayInstruction("/out/pack dir/manifest.json")).toBe(
      `node scripts/short-video/replay-render.mjs --manifest '/out/pack dir/manifest.json'`,
    );
  });
});

describe("render doors share the writer", () => {
  const read = (rel) => readFileSync(join(HERE, "..", rel), "utf8");

  it("still-frame wires the shared writer instead of its own file", () => {
    const src = read("still-frame.mjs");
    expect(src).toContain("writeRenderArtifacts");
    expect(src).toContain("buildStillRenderArgs");
    // No inline payload: re-inlining props would put the JSON back in argv.
    expect(src).not.toContain("JSON.stringify(props)");
  });

  it("the video door never puts props back into the command", () => {
    const src = read("lib/render-remotion.mjs");
    expect(src).toContain("writeRenderArtifacts");
    expect(src).toContain("buildRemotionRenderArgs");
    expect(src).not.toContain("JSON.stringify(props)");
  });
});
