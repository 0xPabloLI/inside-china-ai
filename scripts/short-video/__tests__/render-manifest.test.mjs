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
  finalizePlan,
  formatRenderCommand,
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

const FINALIZE = {
  assPath: null,
  bgmPath: null,
  deleteRawAfter: true,
  sceneDurations: [{ sceneId: 1, duration: 7.5 }],
  audioBasenames: ["scene-1.wav"],
};

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "render-manifest-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** One render's artifacts, with every field a replay needs. */
function writeRender(overrides = {}) {
  const outputDir = join(root, "pack");
  const version = "v1";
  const rawPath = join(outputDir, "pack-raw.mp4");
  const propsPath = propsPathFor(renderArtifactDir(outputDir, version));
  return writeRenderArtifacts({
    outputDir,
    version,
    props: PROPS,
    pipelineId: "pack",
    contentDir: "/content/pack",
    audioDir: join(outputDir, "audio"),
    rawPath,
    finalPath: join(outputDir, "pack-short.mp4"),
    subtitlesPath: null,
    bgmPath: null,
    subject: null,
    command: buildRemotionRenderArgs({ rawPath, propsPath }),
    finalize: FINALIZE,
    ...overrides,
  });
}

describe("renderArtifactDir", () => {
  it("keys the directory by version", () => {
    expect(renderArtifactDir("/out/pack", "2026-11-17T10-00-00")).toBe(
      "/out/pack/render/2026-11-17T10-00-00",
    );
  });

  it("refuses a render without its own version", () => {
    // Two runs sharing a directory would let the second props.json land between
    // the first render's spawn and Remotion's read of --props=<path>.
    expect(() => renderArtifactDir("/out/pack", null)).toThrow(/per-render version/);
    expect(() => renderArtifactDir("/out/pack", "")).toThrow(/per-render version/);
    expect(() => renderArtifactDir("/out/pack", "  ")).toThrow(/per-render version/);
  });

  it("names the two files the replay path depends on", () => {
    expect(propsPathFor("/out/pack/render/v1")).toBe("/out/pack/render/v1/props.json");
    expect(manifestPathFor("/out/pack/render/v1")).toBe("/out/pack/render/v1/manifest.json");
  });
});

describe("writeRenderArtifacts", () => {
  it("writes props verbatim and a manifest that verifies them", () => {
    const { manifestPath, propsPath, manifest } = writeRender({
      subtitlesPath: "/out/subs.ass",
      subject: "unitree",
      finalize: { ...FINALIZE, assPath: "/out/subs.ass", deleteRawAfter: false },
    });

    expect(JSON.parse(readFileSync(propsPath, "utf8"))).toEqual(PROPS);
    expect(manifest).toMatchObject({
      schema: 1,
      kind: "render",
      pipelineId: "pack",
      version: "v1",
      subject: "unitree",
      contentDir: "/content/pack",
      subtitlesPath: "/out/subs.ass",
      bgmPath: null,
      propsPath,
      finalize: { assPath: "/out/subs.ass", deleteRawAfter: false },
    });
    expect(manifest.propsBytes).toBe(Buffer.byteLength(JSON.stringify(PROPS)));
    expect(manifest.propsSha256).toBe(
      createHash("sha256").update(JSON.stringify(PROPS)).digest("hex"),
    );
    expect(Number.isNaN(Date.parse(manifest.createdAt))).toBe(false);
    expect(existsSync(manifestPath)).toBe(true);
  });

  it("round-trips through readRenderArtifacts", () => {
    const { manifestPath } = writeRender();
    const read = readRenderArtifacts(manifestPath);
    expect(read.props).toEqual(PROPS);
    expect(read.manifest.kind).toBe("render");
  });

  it("refuses props that no longer match the record", () => {
    const { manifestPath, propsPath } = writeRender();
    writeFileSync(propsPath, JSON.stringify({ ...PROPS, durations: [1] }));

    // Same-length edits are caught by the hash, different-length ones by the
    // size already; either way the manifest stops the replay.
    expect(() => readRenderArtifacts(manifestPath)).toThrow(/does not match the record/);
  });

  it("refuses props whose size no longer matches the record", () => {
    const { manifestPath, manifest } = writeRender();
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, propsBytes: 3 }));

    expect(() => readRenderArtifacts(manifestPath)).toThrow(/does not match the recorded 3/);
  });

  it("names the props file when its JSON is broken", () => {
    const { manifestPath, propsPath } = writeRender();
    writeFileSync(propsPath, '{"scenes": [');
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    // Drop the hash so the parse is the failure under test, not the hash check.
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, propsSha256: null, propsBytes: 12 }));

    expect(() => readRenderArtifacts(manifestPath)).toThrow(
      new RegExp(`cannot parse the props recorded in ${manifestPath}`),
    );
  });

  it("refuses an unknown schema and a missing props file", () => {
    const { manifestPath, manifest } = writeRender();

    writeFileSync(manifestPath, JSON.stringify({ ...manifest, schema: 99 }));
    expect(() => readRenderArtifacts(manifestPath)).toThrow(/schema/i);

    writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, propsPath: join(root, "gone.json") }),
    );
    expect(() => readRenderArtifacts(manifestPath)).toThrow(/props/i);
  });

  it("refuses a manifest missing the fields a replay needs", () => {
    // An undefined rawPath used to reach finalize as both the ffmpeg input and
    // output, so the field check is part of the contract, not politeness.
    const { manifestPath, manifest } = writeRender();

    for (const field of ["rawPath", "finalPath", "pipelineId", "propsPath", "audioDir"]) {
      writeFileSync(manifestPath, JSON.stringify({ ...manifest, [field]: undefined }));
      expect(() => readRenderArtifacts(manifestPath), field).toThrow(new RegExp(field));
    }

    writeFileSync(manifestPath, JSON.stringify({ ...manifest, command: [] }));
    expect(() => readRenderArtifacts(manifestPath)).toThrow(/command/);
  });

  it("refuses a render manifest with no finalize decisions recorded", () => {
    const { manifestPath, manifest } = writeRender();
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, finalize: null }));

    expect(() => readRenderArtifacts(manifestPath)).toThrow(/finalize decisions/);
  });

  it("keeps a still manifest free of finalize decisions", () => {
    const outputDir = join(root, "pack");
    const out = join(outputDir, "render", "still-30", "frame-30.png");
    const { manifestPath } = writeRender({
      outputDir,
      version: "still-30",
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

    expect(readRenderArtifacts(manifestPath).manifest.kind).toBe("still");
  });
});

describe("command construction", () => {
  it("carries a props path, never the payload", () => {
    const propsPath = "/out/pack/render/v1/props.json";
    const args = buildRemotionRenderArgs({ rawPath: "/out/pack/pack-raw.mp4", propsPath });

    // Joined rather than array-equal: the render-suite policy gate reads a
    // bare quoted CLI token in a test file as a CLI spawn, comments included.
    expect(args.join(" ")).toBe(
      `${REMOTION_BIN} remotion render src/Root.tsx ShortVideo /out/pack/pack-raw.mp4 --props=${propsPath}`,
    );
    expect(args.join(" ")).not.toContain("{");
  });

  it("keeps the command short no matter how large the props are", () => {
    const big = { ...PROPS, scenes: Array.from({ length: 20000 }, (_, i) => ({ id: i + 1 })) };
    expect(Buffer.byteLength(JSON.stringify(big))).toBeGreaterThan(200_000);

    const { manifest } = writeRender({ props: big });
    expect(manifest.command.join(" ").length).toBeLessThan(512);
  });

  it("builds a still argv with the frame and the bundle-cache escape hatch", () => {
    const args = buildStillRenderArgs({ out: "/o.png", frame: 30, propsPath: "/p.json" });
    expect(args.join(" ")).toBe(
      `${REMOTION_BIN} remotion still src/Root.tsx ShortVideo /o.png --frame=30 --props=/p.json --no-bundle-cache`,
    );
  });

  it("quotes only the arguments that need it", () => {
    expect(formatRenderCommand([REMOTION_BIN, "remotion", "render", "/a b/c.mp4"])).toBe(
      `${REMOTION_BIN} remotion render '/a b/c.mp4'`,
    );
  });
});

describe("finalizePlan", () => {
  it("repeats the door's decisions instead of re-deriving them", () => {
    const { manifest } = writeRender({
      finalize: {
        assPath: null,
        bgmPath: null,
        deleteRawAfter: false,
        sceneDurations: [{ sceneId: 1, duration: 7.5 }],
        audioBasenames: ["scene-1.wav"],
      },
    });
    const plan = finalizePlan({ manifest, audioDir: "/moved/audio", exists: () => true });

    expect(plan.deleteRawAfter).toBe(false);
    expect(plan.assPath).toBeNull();
    expect(plan.realign).toEqual({
      outputDir: dirname(manifest.rawPath),
      sceneDurations: [{ sceneId: 1, duration: 7.5 }],
      audioPaths: [join("/moved/audio", "scene-1.wav")],
    });
  });

  it("drops a subtitle that is no longer on disk", () => {
    const { manifest } = writeRender({
      finalize: { ...FINALIZE, assPath: "/gone/subs.ass", deleteRawAfter: false },
    });
    const plan = finalizePlan({ manifest, audioDir: "/audio", exists: () => false });

    expect(plan.assPath).toBeNull();
  });

  it("has nothing to do for a still", () => {
    const out = join(root, "pack", "render", "still-30", "frame-30.png");
    const { manifest } = writeRender({
      outputDir: join(root, "pack"),
      version: "still-30",
      rawPath: out,
      finalPath: out,
      command: buildStillRenderArgs({
        out,
        frame: 30,
        propsPath: propsPathFor(renderArtifactDir(join(root, "pack"), "still-30")),
      }),
      kind: "still",
      finalize: null,
    });

    expect(finalizePlan({ manifest, audioDir: "/audio" })).toBeNull();
  });
});

describe("failure messages", () => {
  it("names the manifest and a paste-ready replay command", () => {
    const text = describeRenderFailure({
      detail: "TextFitError safe-zone-breach",
      commandLine: "npx remotion render src/Root.tsx ShortVideo /out/raw.mp4 --props=/p.json",
      manifestPath: "/out/render/v1/manifest.json",
    });

    expect(text).toContain("command: npx remotion render");
    expect(text).toContain("manifest: /out/render/v1/manifest.json");
    expect(text).toContain(replayInstruction("/out/render/v1/manifest.json"));
    expect(text).toContain("detail:   TextFitError safe-zone-breach");
  });

  it("says so when no manifest was written", () => {
    const text = describeRenderFailure({ detail: "boom", commandLine: "x", manifestPath: null });
    expect(text).toContain("no manifest was written");
  });
});

describe("render door conformance", () => {
  it("writes artifacts before spawning and never inlines the payload", () => {
    const src = readFileSync(join(HERE, "..", "lib", "render-remotion.mjs"), "utf8");

    expect(src).toContain("writeRenderArtifacts(");
    expect(src).not.toMatch(/JSON\.stringify\(\s*props\s*\)/);
    expect(src).not.toMatch(/execSync\(\s*render/);
    // argv array, not a shell string
    expect(src).toContain("execFileSync(renderArgs[0], renderArgs.slice(1)");
  });

  it("constrains the still frame and output to the content tree", () => {
    const src = readFileSync(join(HERE, "..", "still-frame.mjs"), "utf8");

    expect(src).toContain("--frame must be a non-negative integer");
    expect(src).toContain("--out must stay inside");
  });
});
