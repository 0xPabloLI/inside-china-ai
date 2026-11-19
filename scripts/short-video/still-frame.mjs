#!/usr/bin/env node
/**
 * Render ONE frame of a package as a still, with the same props the real
 * render uses. Built to debug TextGate failures: a still reproduces the gate
 * check for a single frame without paying for a full 1600+ frame render.
 *
 * REQUIRES A PRIOR RENDER for this content. `render-remotion.mjs` copies each
 * scene's media into `remotion/public/assets/_staged/` (and the audio into
 * `remotion/public/audio/`) as part of rendering, and rewrites the props to
 * those staged paths. This tool does not repeat that staging — duplicating it
 * is how the two would drift — so it verifies the staged copies are on disk and
 * refuses to run without them. A still built from missing files would render a
 * degraded frame (MediaBackground renders nothing for a missing file, an
 * <Audio> 404s) and any TextFit verdict from it would describe a frame the real
 * render never produces.
 *
 * Usage:
 *   node scripts/short-video/still-frame.mjs --content unitree-h2x-guardian --frame 450 [--out output/<id>/…png]
 */
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname, basename, isAbsolute, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { readSceneDurationsForTimeline } from "./lib/avatar-frame-audit.mjs";
import { resolveRun } from "./lib/run-history.mjs";
import {
  buildStillRenderArgs,
  propsPathFor,
  renderArtifactDir,
  replayInstruction,
  writeRenderArtifacts,
} from "./lib/render-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

const contentId = getArg("content");
const frame = getArg("frame");
if (!contentId || frame === null) {
  console.error("usage: still-frame.mjs --content <id> --frame <n> [--out <png>]");
  process.exit(1);
}
// `frame` becomes a directory name under output/<id>/render/ and a Remotion
// flag, so hold it to a non-negative integer: a path like `../../x` would
// otherwise write the manifest outside the content's output tree.
if (!/^\d+$/.test(frame)) {
  console.error(`❌ --frame must be a non-negative integer, got: ${JSON.stringify(frame)}`);
  process.exit(1);
}
// The id becomes a path segment below. Content ids are directory names
// (`unitree-h2x-guardian`, `_gate-smoke`), so hold it to that shape. The
// leading-character rule is what rejects `..`: neither `/` nor a leading `.`
// can appear, so no id can escape the content tree. A typo like `../..` would
// otherwise import a scene-data.mjs from outside it and render a still that
// has nothing to do with the package the caller named.
if (!/^[a-z0-9_][a-z0-9._-]*$/.test(contentId)) {
  console.error(
    `❌ --content must be a content id (lowercase letters, digits, . _ -), got: ${JSON.stringify(contentId)}`,
  );
  process.exit(1);
}
// The still lives next to its manifest: a replay re-runs the recorded command
// with the recorded output path, and the replay refuses paths outside the
// content's output tree, so a still written to /tmp would not be replayable.
const contentDir = join(__dirname, "content", contentId);
const { meta } = await import(join(contentDir, "meta.mjs")).catch(() => ({ meta: null }));
const slug = meta?.pipelineId || contentId.replace(/\//g, "-");
const run = resolveRun({ root: __dirname, slug, runId: getArg("run") });
const outRoot = run.dir;
const out = getArg("out") || join(outRoot, "render", `still-${frame}`, `frame-${frame}.png`);
const outRel = relative(resolve(outRoot), resolve(out));
if (outRel.length === 0 || outRel.startsWith("..") || isAbsolute(outRel)) {
  console.error(
    `❌ --out must stay inside ${outRoot}: the manifest records this path, and a replay only writes there`,
  );
  process.exit(1);
}

const { scenes } = await import(join(contentDir, "scene-data.mjs"));

// The same reader every sibling consumer uses: it sorts by sceneId (the file's
// entry order is not guaranteed), accepts the legacy `{scenes:[...]}` shape, and
// falls back to the per-scene sidecars. It throws when the timeline cannot be
// trusted — surface that as a plain message, not a stack trace.
const audioDir = join(outRoot, "audio");
let durations;
try {
  durations = readSceneDurationsForTimeline(audioDir, scenes.length).map((d) => d.duration);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}
if (durations.length !== scenes.length) {
  console.error(
    `got ${durations.length} durations for ${scenes.length} scenes from ${audioDir} — run TTS first`,
  );
  process.exit(1);
}

// Mirror render-remotion.mjs's props rewrite, then prove the files it points at
// are really there (see the header: this tool does not stage them itself).
const publicDir = join(__dirname, "remotion", "public");
const missing = [];
const sanitizedScenes = scenes.map((s) => {
  if (!s.media?.path) return s;
  const rel = `assets/_staged/${basename(s.media.path)}`;
  if (!existsSync(join(publicDir, rel))) missing.push(rel);
  return { ...s, media: { ...s.media, path: rel } };
});
const audioPaths = scenes.map((s) => `audio/scene-${s.id}.wav`);
for (const rel of audioPaths) {
  if (!existsSync(join(publicDir, rel))) missing.push(rel);
}
if (missing.length > 0) {
  console.error("❌ staged files missing — render this content once first:");
  for (const rel of missing.slice(0, 8)) console.error(`   ${join("remotion/public", rel)}`);
  if (missing.length > 8) console.error(`   … and ${missing.length - 8} more`);
  console.error(
    "   A still built without them would not reproduce the real render, so the TextFit verdict would be meaningless.",
  );
  process.exit(1);
}

const props = {
  scenes: sanitizedScenes,
  audioPaths,
  durations,
  contentDir,
};

// Same artifact contract as a full render (lib/render-manifest.mjs): props to
// disk, the command carries a path. A still failure is exactly the moment you
// want to re-run without redoing TTS, so it gets a replayable manifest too.
const outputDir = outRoot;
const version = `still-${frame}`;
const artifactDir = renderArtifactDir(outputDir, version);
const argv = buildStillRenderArgs({ out, frame, propsPath: propsPathFor(artifactDir) });
const { manifestPath } = writeRenderArtifacts({
  outputDir,
  version,
  props,
  pipelineId: contentId,
  contentDir,
  audioDir,
  rawPath: out,
  finalPath: out,
  subtitlesPath: null,
  bgmPath: null,
  subject: null,
  command: argv,
  kind: "still",
});

const remotionDir = join(__dirname, "remotion");
console.log(`Rendering still: content=${contentId} frame=${frame} -> ${out}`);
console.log(`   artifacts: ${manifestPath}`);
try {
  const stdout = execFileSync(argv[0], argv.slice(1), {
    cwd: remotionDir,
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf8",
  });
  console.log(stdout.split("\n").slice(-6).join("\n"));
  console.log(`\n✅ Still written: ${out}`);
} catch (e) {
  const stderr = e.stderr?.toString() ?? "";
  const fitError = [...stderr.matchAll(/\[TextFitError\] (\{.*\})/g)].pop()?.[1];
  console.error(`\n❌ Still failed for frame ${frame}`);
  console.error(fitError ? `TextFitError: ${fitError}` : stderr.slice(-1200));
  console.error(`   manifest: ${manifestPath}`);
  console.error(`   replay:   ${replayInstruction(manifestPath)}`);
  process.exit(1);
}
