/**
 * ContrastScene media wiring (#761) — render-level evidence.
 *
 * Before the fix `ContrastScene` never rendered `scene.media`: the template did
 * not import `MediaBackground` and `ShortVideo.renderScene` did not pass
 * `contentDir`, so a bound picture was dropped silently. Two real scenes
 * (didi-robotaxi-r2 s5/s7, official product photos) shipped with media that
 * never appeared on screen.
 *
 * Driver pattern: media-start-offset.test.mjs — vitest has no access to the
 * remotion workspace's node_modules, so the real runtime is driven through
 * `npx remotion still` against the dedicated scene-gate fixture entry. The
 * fixture's `baseline-contrast` and `baseline-contrast-media` scenes share the
 * same copy, so a pixel diff isolates the media layer.
 *
 * Stills are persisted under the gitignored `output/` dir as ticket evidence.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { mkdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REMOTION_DIR = resolve(__dirname, "..", "remotion");
const ENTRY = "src/scene-gate-fixture.tsx";
const COMPOSITION = "SceneGateFixture";
const FRAME = 45; // past every entrance animation in the contrast template

const stillDir = join(__dirname, "..", "output", "contrast-media-stills");

const cache = new Map();
function still(scenario) {
  if (cache.has(scenario)) return cache.get(scenario);
  mkdirSync(stillDir, { recursive: true });
  const out = join(stillDir, `${scenario}.png`);
  execFileSync(
    "npx",
    [
      "remotion",
      "still",
      ENTRY,
      COMPOSITION,
      out,
      "--props",
      JSON.stringify({ scenario }),
      "--frame",
      String(FRAME),
    ],
    { cwd: REMOTION_DIR, stdio: "pipe", timeout: 240_000 },
  );
  cache.set(scenario, out);
  return out;
}

/** Per-pixel abs RGB diff count between two stills (same dimensions). */
function diffCount(pathA, pathB) {
  const a = PNG.sync.read(readFileSync(pathA));
  const b = PNG.sync.read(readFileSync(pathB));
  expect(a.width, "frame size mismatch").toBe(b.width);
  expect(a.height, "frame size mismatch").toBe(b.height);
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d =
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 40) count++;
  }
  return count;
}

describe("ContrastScene renders bound media (#761)", { timeout: 300_000 }, () => {
  it("the media still differs from the text-only still across most of the frame", () => {
    const plain = still("baseline-contrast");
    const withMedia = still("baseline-contrast-media");

    // The image fills the frame and is dimmed by the 0.7 overlay; the text
    // and decorations are identical in both stills. 1080x1920 = 2,073,600
    // pixels, so anything above ~10% proves a full-bleed layer rendered
    // (an absent / unloaded asset would leave only the grid, diffing 0).
    // diffCount also asserts both stills are the same 1080x1920 frame.
    const count = diffCount(plain, withMedia);
    expect(count).toBeGreaterThan(200_000);
  });
});
