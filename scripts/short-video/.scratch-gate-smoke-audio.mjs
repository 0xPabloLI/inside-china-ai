/**
 * One-shot helper: make the _gate-smoke pack renderable from a fresh clone.
 * Content assets are gitignored, so this synthesizes whatever is missing:
 *  - scene-N audio via macOS `say` (offline, fastest option) → ffmpeg → mp3
 *  - the fullscreen-media placeholder image via an ffmpeg gradient
 * Re-run after `git clean` or on a new machine, then:
 * `node render-only.mjs --content _gate-smoke`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { scenes } = await import("./content/_gate-smoke/scene-data.mjs");
const OUT_DIR = new URL("./output/_gate-smoke/audio/", import.meta.url).pathname;
mkdirSync(OUT_DIR, { recursive: true });

// Placeholder for the fullscreen-media scene (real asset stays local-only).
const IMG = new URL("./content/_gate-smoke/assets/smoke-data-center.jpg", import.meta.url).pathname;
if (!existsSync(IMG)) {
  mkdirSync(join(IMG, ".."), { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "gradients=size=1080x1920:c0=0x1e293b:c1=0x020617:speed=0.02",
      "-frames:v",
      "1",
      "-q:v",
      "4",
      IMG,
    ],
    { stdio: "ignore" },
  );
  console.log("smoke-data-center.jpg synthesized (placeholder gradient)");
}

const tmp = mkdtempSync(join(tmpdir(), "gate-smoke-audio-"));
for (const scene of scenes) {
  const aiff = join(tmp, `scene-${scene.id}.aiff`);
  const mp3 = join(OUT_DIR, `scene-${scene.id}.mp3`);
  execFileSync("say", ["-v", "Daniel", "-r", "190", "-o", aiff, scene.voiceover]);
  execFileSync("ffmpeg", ["-y", "-i", aiff, "-codec:a", "libmp3lame", "-qscale:a", "4", mp3], {
    stdio: "ignore",
  });
  console.log(`scene-${scene.id}.mp3 ok (${scene.voiceover.slice(0, 40)}…)`);
}
rmSync(tmp, { recursive: true, force: true });
