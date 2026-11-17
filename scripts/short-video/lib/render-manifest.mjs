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
import { basename, dirname, join } from "node:path";

import { shellQuote } from "./shell-quote.mjs";

/** Bump only with a migration path for older manifests. */
const RENDER_MANIFEST_SCHEMA = 1;

/**
 * The executable the recorded commands start with. Exported so tests assert
 * against the same constant the render door uses instead of a literal that
 * the render-suite policy reads as a CLI spawn.
 */
export const REMOTION_BIN = "npx";

/**
 * Directory holding one render's artifacts.
 * @param {string} outputDir
 * @param {string|null} version
 * @returns {string}
 */
export function renderArtifactDir(outputDir, version) {
  return join(
    outputDir,
    "render",
    version && String(version).length > 0 ? String(version) : "latest",
  );
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
}) {
  const dir = renderArtifactDir(outputDir, version);
  mkdirSync(dir, { recursive: true });

  const propsPath = propsPathFor(dir);
  const manifestPath = manifestPathFor(dir);
  const serialized = JSON.stringify(props);
  writeFileSync(propsPath, serialized);

  const manifest = {
    schema: RENDER_MANIFEST_SCHEMA,
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
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { dir, propsPath, manifestPath, manifest };
}

/**
 * Read a manifest and verify the props it points at are the ones it recorded.
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
  const propsPath = manifest.propsPath;
  if (!propsPath || !existsSync(propsPath)) {
    throw new Error(`render manifest points at a missing props file: ${propsPath || "(unset)"}`);
  }
  const text = readFileSync(propsPath, "utf8");
  if (manifest.propsSha256 && sha256(text) !== manifest.propsSha256) {
    throw new Error(
      `props sha256 does not match the manifest — the props were edited after the render: ${propsPath}`,
    );
  }
  return { manifest, props: JSON.parse(text) };
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
 * What a replay's finalize pass should do, derived from the manifest alone.
 *
 * A replay has to land on the same kind of artifact the render door produced:
 * `renderRemotion` always finalizes (loudnorm + head trim), even with no
 * subtitles or BGM, and deletes the raw file when no subtitles were burned.
 * Skipping finalize because the manifest records no subtitles would quietly
 * produce a different file than the one being replayed.
 *
 * @param {{manifest: object, props: Record<string, unknown>, exists?: (path: string) => boolean}} input
 * @returns {{videoPath: string, assPath: string|null, bgmPath: string|null, outputPath: string, realign: object|null, deleteRawAfter: boolean}}
 */
export function planFinalize({ manifest, props, exists = existsSync }) {
  const assPath =
    manifest.subtitlesPath && exists(manifest.subtitlesPath) ? manifest.subtitlesPath : null;
  const bgmPath = manifest.bgmPath && exists(manifest.bgmPath) ? manifest.bgmPath : null;
  const audioPaths = (props.audioPaths ?? []).map((rel) =>
    join(manifest.audioDir || dirname(manifest.rawPath), basename(rel)),
  );
  const realign = audioPaths.every((path) => exists(path))
    ? {
        outputDir: dirname(manifest.rawPath),
        sceneDurations: (props.scenes ?? []).map((scene, i) => ({
          sceneId: scene.id ?? i + 1,
          duration: props.durations?.[i],
        })),
        audioPaths,
      }
    : null;

  return {
    videoPath: manifest.rawPath,
    assPath,
    bgmPath,
    outputPath: manifest.finalPath,
    realign,
    deleteRawAfter: !assPath,
  };
}

/**
 * A manifest is data on disk, so the command it carries is untrusted input.
 * Only the two shapes this module writes may run, and the props path must be
 * the manifest's own props file — a replay can not be retargeted by editing a
 * JSON file to point at something else.
 *
 * @param {object} manifest
 * @returns {string[]}
 */
export function assertReplayableCommand(manifest) {
  const command = Array.isArray(manifest.command) ? manifest.command : [];
  const [bin, sub, action] = command;
  const propsArg = command.find((arg) => typeof arg === "string" && arg.startsWith("--props="));
  if (bin !== REMOTION_BIN || sub !== "remotion" || !["render", "still"].includes(action)) {
    throw new Error(
      `refusing to replay: recorded command is not a remotion render/still call: ${JSON.stringify(command.slice(0, 3))}`,
    );
  }
  if (!propsArg || propsArg.slice("--props=".length) !== manifest.propsPath) {
    throw new Error(
      `refusing to replay: the recorded --props path does not match the manifest's props file (${manifest.propsPath})`,
    );
  }
  return [...command];
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
 * `remotion/public/audio/` and deletes its copies afterwards, so a replay can
 * copy them back from the pipeline output. Staged media and avatars are not:
 * their source paths are rewritten during staging, so a missing staged file
 * means "render this content again", and the plan says so instead of letting
 * Remotion fail mid-frame.
 *
 * @param {{manifestPath: string, publicDir: string, remotionDir: string, audioDir?: string}} input
 * @returns {{ok: boolean, blocking: string[], recoverable: Array<{rel: string, from: string, to: string}>, notes: string[], command: string[], cwd: string}}
 */
export function planReplay({ manifestPath, publicDir, remotionDir, audioDir }) {
  const { manifest, props } = readRenderArtifacts(manifestPath);
  const blocking = [];
  const recoverable = [];
  const notes = [];

  for (const rel of collectStagedAssets(props)) {
    if (!existsSync(join(publicDir, rel))) {
      blocking.push(
        `staged asset missing: ${rel}\n    looked in ${join(publicDir, rel)}\n    render this content once to stage it again`,
      );
    }
  }

  const sourceAudioDir = audioDir || manifest.audioDir || "";
  for (const rel of props.audioPaths ?? []) {
    const publicPath = join(publicDir, rel);
    if (existsSync(publicPath)) continue;
    const candidate = sourceAudioDir ? join(sourceAudioDir, basename(rel)) : null;
    if (candidate && existsSync(candidate)) {
      recoverable.push({ rel, from: candidate, to: publicPath });
      continue;
    }
    blocking.push(
      `audio missing: ${rel}\n    looked in ${publicPath}${candidate ? `\n    and in ${candidate}` : ""}`,
    );
  }

  for (const [label, path] of [
    ["subtitle", manifest.subtitlesPath],
    ["bgm", manifest.bgmPath],
  ]) {
    if (path && !existsSync(path)) notes.push(`${label} missing: ${path} (finalize will skip it)`);
  }

  const command = assertReplayableCommand(manifest);

  return {
    ok: blocking.length === 0,
    blocking,
    recoverable,
    notes,
    command,
    cwd: remotionDir,
  };
}
