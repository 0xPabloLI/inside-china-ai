#!/usr/bin/env node
/**
 * Render ONE frame of a package as a still, with the same props the real
 * render uses. Built to debug TextGate failures: a still reproduces the gate
 * check for a single frame without paying for a full 1600+ frame render.
 *
 * Usage:
 *   node scripts/short-video/still-frame.mjs --content unitree-h2x-guardian --frame 450 [--out /tmp/x.png]
 */
import { execFileSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

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
const out = getArg("out") || `/tmp/still-${contentId}-${frame}.png`;

const contentDir = join(__dirname, "content", contentId);
const { scenes } = await import(join(contentDir, "scene-data.mjs"));

const durationsPath = join(__dirname, "output", contentId, "audio", "scene-durations.json");
if (!existsSync(durationsPath)) {
  console.error(`no scene-durations.json at ${durationsPath} — run TTS first`);
  process.exit(1);
}
const durations = JSON.parse(readFileSync(durationsPath, "utf8")).map((d) => d.duration);

// Mirror render-remotion.mjs exactly: media.path and audioPaths are rewritten to
// their public/-relative staged locations before the props reach Remotion.
const sanitizedScenes = scenes.map((s) => {
  if (!s.media?.path) return s;
  return { ...s, media: { ...s.media, path: `assets/_staged/${basename(s.media.path)}` } };
});
const audioPaths = scenes.map((s) => `audio/scene-${s.id}.wav`);

const props = {
  scenes: sanitizedScenes,
  audioPaths,
  durations,
  contentDir,
};

const remotionDir = join(__dirname, "remotion");
const cmd = [
  "npx",
  "remotion",
  "still",
  "src/Root.tsx",
  "ShortVideo",
  out,
  `--frame=${frame}`,
  `--props=${JSON.stringify(props)}`,
  // Boolean flag (no value): `--bundle-cache=false` parses as truthy and keeps
  // the cache, which silently serves a stale bundle after a gate edit.
  "--no-bundle-cache",
];

console.log(`Rendering still: content=${contentId} frame=${frame} -> ${out}`);
try {
  const stdout = execFileSync(cmd[0], cmd.slice(1), {
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
  process.exit(1);
}
