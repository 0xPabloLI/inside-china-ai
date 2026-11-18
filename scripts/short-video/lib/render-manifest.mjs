/**
 * Render artifacts — the props a render consumed, plus the record of how it
 * was produced.
 *
 * Why this exists: the render command used to inline the whole props JSON
 * (`--props='{"scenes":[…]}'`). For `ant-lingbot-world-13b` that is 8.4KB on
 * one line, and the failure path kept only 200 characters of it, so a failed
 * render could not be replayed without re-running TTS and alignment. Props are
 * data, not command-line text: they belong in a file, and the file belongs
 * next to the output it produced.
 *
 * Layout, one directory per render:
 *
 *   output/<pipelineId>/render/<version>/
 *     props.json      exactly what Remotion reads via --props=<path>
 *     manifest.json   paths, hashes and the exact argv used
 *
 * `props.json` is verbatim (no wrapper) so `--props` keeps pointing at a plain
 * props object. The manifest is what a human or `replay-render.mjs` needs: the
 * command array, the outputs, the subtitle/BGM inputs, and the props sha256 so
 * a replay cannot silently consume edited props.
 *
 * Nothing here spawns a process; `render-remotion.mjs`, `still-frame.mjs` and
 * `replay-render.mjs` own execution.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { shellQuote } from "./shell-quote.mjs";

/** Bump only with a migration path for older manifests. */
const RENDER_MANIFEST_SCHEMA = 1;

/**
 * The executable both command builders start with. Exported so the replay
 * allowlist and the tests agree on one definition of it.
 */
export const REMOTION_BIN = "npx";

/**
 * Directory holding one render's artifacts.
 *
 * The version has to be per-render: two runs sharing a directory would have the
 * second `props.json` land between the first render's spawn and Remotion's read
 * of `--props=<path>`, so the first render would consume the other run's props.
 *
 * @param {string} outputDir
 * @param {string|null} version
 * @returns {string}
 */
export function renderArtifactDir(outputDir, version) {
  const name = version == null ? "" : String(version).trim();
  if (name.length === 0) {
    throw new Error("render artifacts need a per-render version, got " + JSON.stringify(version));
  }
  return join(outputDir, "render", name);
}

/** @param {string} dir */
export function propsPathFor(dir) {
  return join(dir, "props.json");
}

/** @param {string} dir */
export function manifestPathFor(dir) {
  return join(dir, "manifest.json");
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Write props.json + manifest.json for one render.
 *
 * @param {object} input
 * @param {string} input.outputDir
 * @param {string|null} input.version
 * @param {Record<string, unknown>} input.props
 * @param {string} input.pipelineId
 * @param {string} [input.contentDir]
 * @param {string} [input.audioDir] - where the pipeline keeps the source audio
 * @param {string} input.rawPath
 * @param {string} input.finalPath
 * @param {string|null} input.subtitlesPath
 * @param {string|null} input.bgmPath
 * @param {string|null} input.subject
 * @param {string[]} input.command - exact argv, no shell quoting
 * @param {"render"|"still"} [input.kind] - a still has no finalize pass
 * @param {object|null} [input.finalize] - the door's finalize decisions (see finalizePlan)
 * @returns {{dir: string, propsPath: string, manifestPath: string, manifest: object}}
 */
export function writeRenderArtifacts({
  outputDir,
  version,
  props,
  pipelineId,
  contentDir = "",
  audioDir = "",
  rawPath,
  finalPath,
  subtitlesPath = null,
  bgmPath = null,
  subject = null,
  command,
  kind = "render",
  finalize = null,
}) {
  const dir = renderArtifactDir(outputDir, version);
  mkdirSync(dir, { recursive: true });

  const propsPath = propsPathFor(dir);
  const manifestPath = manifestPathFor(dir);
  const serialized = JSON.stringify(props);
  writeFileSync(propsPath, serialized);

  const manifest = {
    schema: RENDER_MANIFEST_SCHEMA,
    kind,
    createdAt: new Date().toISOString(),
    pipelineId,
    version: version ?? null,
    subject: subject ?? null,
    contentDir,
    audioDir,
    rawPath,
    finalPath,
    subtitlesPath,
    bgmPath,
    propsPath,
    propsBytes: Buffer.byteLength(serialized),
    propsSha256: sha256(serialized),
    command: [...command],
    finalize: finalize ?? null,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { dir, propsPath, manifestPath, manifest };
}

/** Values `kind` may carry; older manifests have none and mean "render". */
const MANIFEST_KINDS = new Set(["render", "still"]);

/**
 * Read a manifest and verify the props it points at are the ones it recorded.
 *
 * Validation is part of the contract: a manifest missing `rawPath` used to flow
 * into finalize, where `undefined` became both the ffmpeg input and output.
 *
 * @param {string} manifestPath
 * @returns {{manifest: object, props: Record<string, unknown>}}
 */
export function readRenderArtifacts(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    throw new Error(`cannot read render manifest ${manifestPath}: ${e.message}`);
  }
  if (manifest.schema !== RENDER_MANIFEST_SCHEMA) {
    throw new Error(
      `render manifest schema ${JSON.stringify(manifest.schema)} is not supported (expected ${RENDER_MANIFEST_SCHEMA}): ${manifestPath}`,
    );
  }
  for (const field of ["pipelineId", "rawPath", "finalPath", "propsPath", "audioDir"]) {
    if (typeof manifest[field] !== "string" || manifest[field].length === 0) {
      throw new Error(`render manifest is missing "${field}": ${manifestPath}`);
    }
  }
  if (!Array.isArray(manifest.command) || manifest.command.length === 0) {
    throw new Error(`render manifest is missing its recorded command: ${manifestPath}`);
  }
  const kind = manifest.kind ?? "render";
  if (!MANIFEST_KINDS.has(kind)) {
    throw new Error(`render manifest kind ${JSON.stringify(manifest.kind)} is not supported`);
  }
  manifest.kind = kind;
  if (kind === "render") {
    const fin = manifest.finalize;
    if (
      !fin ||
      typeof fin.deleteRawAfter !== "boolean" ||
      !Array.isArray(fin.sceneDurations) ||
      !Array.isArray(fin.audioBasenames)
    ) {
      throw new Error(
        `render manifest is missing the finalize decisions a replay must repeat: ${manifestPath}`,
      );
    }
  }

  const propsPath = manifest.propsPath;
  if (!existsSync(propsPath)) {
    throw new Error(`render manifest points at a missing props file: ${propsPath}`);
  }
  const text = readFileSync(propsPath, "utf8");
  if (typeof manifest.propsBytes === "number" && Buffer.byteLength(text) !== manifest.propsBytes) {
    throw new Error(
      `props size ${Buffer.byteLength(text)} does not match the recorded ${manifest.propsBytes} — the props file was replaced: ${propsPath}`,
    );
  }
  if (manifest.propsSha256 && sha256(text) !== manifest.propsSha256) {
    throw new Error(
      `props sha256 does not match the manifest — the props were edited after the render: ${propsPath}`,
    );
  }
  try {
    return { manifest, props: JSON.parse(text) };
  } catch (e) {
    throw new Error(
      `cannot parse the props recorded in ${manifestPath} (${propsPath}): ${e.message}`,
    );
  }
}

/**
 * `npx remotion render …` argv. Only paths cross this seam, never the payload.
 * @param {{rawPath: string, propsPath: string}} input
 * @returns {string[]}
 */
export function buildRemotionRenderArgs({ rawPath, propsPath }) {
  return [
    REMOTION_BIN,
    "remotion",
    "render",
    "src/Root.tsx",
    "ShortVideo",
    rawPath,
    `--props=${propsPath}`,
  ];
}

/**
 * `npx remotion still …` argv (same props-file contract).
 * @param {{out: string, frame: number|string, propsPath: string}} input
 * @returns {string[]}
 */
export function buildStillRenderArgs({ out, frame, propsPath }) {
  return [
    REMOTION_BIN,
    "remotion",
    "still",
    "src/Root.tsx",
    "ShortVideo",
    out,
    `--frame=${frame}`,
    `--props=${propsPath}`,
    // Boolean flag (no value): `--bundle-cache=false` parses as truthy and keeps
    // the cache, which silently serves a stale bundle after a gate edit.
    "--no-bundle-cache",
  ];
}

/**
 * Shell-quoted one-liner for logs and error messages. Never executed: the
 * render door runs the argv array directly, so quoting only has to read right.
 * Arguments without shell metacharacters stay bare so the logged command looks
 * like the command.
 * @param {string[]} args
 * @returns {string}
 */
export function formatRenderCommand(args) {
  const needsQuoting = /[\s'"`$\\!*?()[\]{}&|;<>~#]/;
  return args.map((arg) => (needsQuoting.test(arg) ? shellQuote(arg) : arg)).join(" ");
}

/**
 * `node scripts/short-video/replay-render.mjs --manifest '<path>'`
 * @param {string} manifestPath
 * @returns {string}
 */
export function replayInstruction(manifestPath) {
  return `node scripts/short-video/replay-render.mjs --manifest ${shellQuote(manifestPath)}`;
}

/**
 * What a failed render tells the next person. The command stays whole (it is
 * short now), and the manifest is named because that is the artifact a replay
 * needs — not the payload, which used to be truncated to 200 characters here.
 *
 * @param {{detail: string, commandLine: string, manifestPath: string|null}} input
 * @returns {string}
 */
export function describeRenderFailure({ detail, commandLine, manifestPath }) {
  const lines = ["Remotion render failed", `  command: ${commandLine}`];
  if (manifestPath) {
    lines.push(`  manifest: ${manifestPath}`);
    lines.push(`  replay:   ${replayInstruction(manifestPath)}`);
  } else {
    lines.push("  no manifest was written (the render failed before props reached disk)");
  }
  lines.push(`  detail:   ${String(detail ?? "").trim()}`);
  return lines.join("\n");
}

/**
 * The finalize pass a replayed render should run — read from what the door
 * recorded, never re-derived.
 *
 * The door owns these decisions (whether to delete the raw file, which scene
 * windows the head-trim measurement uses). A replay that recomputed them would
 * be a second source of truth that can drift from the artifact it is supposed
 * to reproduce, so `manifest.finalize` stores the decision itself and this
 * function only re-attaches the audio files, which live in a different place
 * by replay time (the door's `public/audio/` copies are gone).
 *
 * @param {{manifest: object, audioDir: string, exists?: (path: string) => boolean}} input
 * @returns {{videoPath: string, assPath: string|null, bgmPath: string|null, outputPath: string, realign: object|null, deleteRawAfter: boolean}|null}
 */
export function finalizePlan({ manifest, audioDir, exists = existsSync }) {
  const recorded = manifest.finalize;
  if (!recorded) return null;
  const audioPaths = (recorded.audioBasenames ?? []).map((name) => join(audioDir, name));
  return {
    videoPath: manifest.rawPath,
    assPath: recorded.assPath && exists(recorded.assPath) ? recorded.assPath : null,
    bgmPath: recorded.bgmPath && exists(recorded.bgmPath) ? recorded.bgmPath : null,
    outputPath: manifest.finalPath,
    realign:
      audioPaths.length === 0
        ? null
        : {
            outputDir: dirname(manifest.rawPath),
            sceneDurations: recorded.sceneDurations ?? [],
            audioPaths,
          },
    deleteRawAfter: recorded.deleteRawAfter === true,
  };
}

/**
 * Refuse a path that leaves the tree a manifest is allowed to write in.
 *
 * The manifest is data on disk, so its paths are untrusted: an unchecked
 * `rawPath` tells Remotion to overwrite any file, and a `finalPath` tells
 * ffmpeg to do the same. `root` is anchored to where the manifest itself
 * lives, never to a field inside it.
 *
 * @param {string} root
 * @param {string} target
 * @param {string} label
 * @param {string} manifestPath
 */
function assertContained(root, target, label, manifestPath) {
  const rel = relative(resolve(root), resolve(target));
  if (rel.length === 0 || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `refusing to replay: ${label} ${target} is outside ${resolve(root)} (manifest ${manifestPath})`,
    );
  }
}

/**
 * The argv this manifest implies.
 *
 * Rebuilt from the manifest rather than trusted from `manifest.command`, so the
 * recorded array cannot smuggle extra Remotion flags (e.g. a browser binary) or
 * a second `--props=` that Remotion would honour over the verified one.
 *
 * @param {object} manifest
 * @returns {string[]}
 */
function replayCommandFor(manifest) {
  if (manifest.kind === "still") {
    const recorded = Array.isArray(manifest.command) ? manifest.command : [];
    const frames = recorded
      .filter((arg) => typeof arg === "string" && arg.startsWith("--frame="))
      .map((arg) => arg.slice("--frame=".length));
    if (frames.length !== 1 || !/^\d+$/.test(frames[0])) {
      throw new Error(
        `refusing to replay: a still manifest must record exactly one numeric --frame, got ${JSON.stringify(frames)}`,
      );
    }
    return buildStillRenderArgs({
      out: manifest.rawPath,
      frame: frames[0],
      propsPath: manifest.propsPath,
    });
  }
  return buildRemotionRenderArgs({ rawPath: manifest.rawPath, propsPath: manifest.propsPath });
}

/**
 * Verify the recorded command is the one the manifest implies, and return the
 * rebuilt one to execute.
 *
 * @param {object} manifest
 * @returns {string[]}
 */
export function assertReplayableCommand(manifest) {
  const expected = replayCommandFor(manifest);
  const recorded = Array.isArray(manifest.command) ? manifest.command : [];
  const same =
    recorded.length === expected.length && recorded.every((arg, i) => arg === expected[i]);
  if (!same) {
    throw new Error(
      [
        "refusing to replay: the recorded command is not the one this manifest implies",
        `    recorded: ${formatRenderCommand(recorded.map(String))}`,
        `    expected: ${formatRenderCommand(expected)}`,
      ].join("\n"),
    );
  }
  return expected;
}

function collectStagedAssets(props) {
  const rels = new Set();
  for (const scene of props.scenes ?? []) {
    if (scene?.media?.path) rels.add(scene.media.path);
    if (scene?.media?.backdrop?.path) rels.add(scene.media.backdrop.path);
    if (scene?.avatar?.videoPath) rels.add(scene.avatar.videoPath);
  }
  return [...rels];
}

/**
 * Decide whether a recorded render can run again, and say what is missing.
 *
 * Audio is recoverable: the render door copies `output/<id>/audio/*` into
 * `remotion/public/audio/` and deletes its public copies afterwards, so a
 * replay can copy them back from the pipeline output. Staged media and avatars
 * are not: their source paths are rewritten during staging, so a missing staged
 * file means "render this content again", and the plan says so instead of
 * letting Remotion fail mid-frame.
 *
 * Nothing is optional here: a recorded subtitle, BGM or audio file that is gone
 * blocks the replay, because finalizing without it would ship a different file
 * under the same name — including a file with no #176 head trim.
 *
 * @param {{manifestPath: string, publicDir: string, remotionDir: string, audioDir?: string}} input
 * @returns {{ok: boolean, kind: string, blocking: string[], recoverable: Array<{rel: string, from: string, to: string}>, notes: string[], command: string[], cwd: string, audioDir: string}}
 */
export function planReplay({ manifestPath, publicDir, remotionDir, audioDir }) {
  const { manifest, props } = readRenderArtifacts(manifestPath);
  const blocking = [];
  const recoverable = [];
  const notes = [];

  // Where this manifest is allowed to write: `<outputDir>` for the recorded
  // artifacts, the manifest's own directory for props.json.
  const manifestDir = dirname(resolve(manifestPath));
  const outputRoot = dirname(dirname(manifestDir));
  assertContained(outputRoot, manifest.rawPath, "recorded output", manifestPath);
  assertContained(outputRoot, manifest.finalPath, "recorded final video", manifestPath);
  assertContained(manifestDir, manifest.propsPath, "props file", manifestPath);

  const sourceAudioDir = audioDir || manifest.audioDir;

  for (const rel of collectStagedAssets(props)) {
    const stagedPath = join(publicDir, rel);
    assertContained(publicDir, stagedPath, `recorded asset ${JSON.stringify(rel)}`, manifestPath);
    if (!existsSync(stagedPath)) {
      blocking.push(
        `staged asset missing: ${rel}\n    looked in ${stagedPath}\n    render this content once to stage it again`,
      );
    }
  }

  for (const rel of props.audioPaths ?? []) {
    const publicPath = join(publicDir, rel);
    assertContained(publicDir, publicPath, `recorded audio ${JSON.stringify(rel)}`, manifestPath);
    if (existsSync(publicPath)) continue;
    const candidate = join(sourceAudioDir, basename(rel));
    if (existsSync(candidate)) {
      recoverable.push({ rel, from: candidate, to: publicPath });
      continue;
    }
    blocking.push(`audio missing: ${rel}\n    looked in ${publicPath}\n    and in ${candidate}`);
  }

  for (const [label, path] of [
    ["subtitle", manifest.subtitlesPath],
    ["bgm", manifest.bgmPath],
  ]) {
    if (path && !existsSync(path)) {
      blocking.push(
        `${label} missing: ${path}\n    it was part of this render; replaying without it would write a different file`,
      );
    }
  }

  if ((props.audioPaths ?? []).length === 0) {
    notes.push("no audio recorded: finalize runs without head-trim realign, as the original did");
  }

  const command = assertReplayableCommand(manifest);

  return {
    ok: blocking.length === 0,
    kind: manifest.kind,
    blocking,
    recoverable,
    notes,
    command,
    cwd: remotionDir,
    audioDir: sourceAudioDir,
  };
}
