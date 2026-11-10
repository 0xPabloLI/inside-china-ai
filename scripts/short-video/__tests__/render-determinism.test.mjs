/**
 * Frame-identical re-render — the pixel half of #734 ①.
 *
 * The contract: rendering the same composition, props and frame twice must
 * produce the same pixels. The static half (`render-determinism-contract.test.mjs`)
 * forbids the sources that would break it; this file proves the rendered frame
 * actually is a pure function of (props, frame) through the real Chromium
 * pipeline — text gates, entrance springs, transitions and H.264 decode.
 *
 * Why two frames per case:
 *   - the identical pair is the assertion (must differ by 0 bytes);
 *   - the contrast frame is the negative control. Two blank or two stale
 *     frames are also "identical", so the suite would pass while rendering
 *     nothing. The contrast frame must differ, which proves the pixels are
 *     live. Same reasoning as #1084's palette-ceiling lesson: a gate that
 *     cannot fail is not a gate.
 *
 * Each `renderStill()` is a fresh page load from the same bundle, so
 * module-scope entropy re-rolls between the two calls — a `Math.random()` at
 * module scope is caught here, not just one inside a component. Nondeterminism
 * that only appears across OS processes (different Chrome build) is out of
 * reach of one vitest process; that is why the static contract exists and why
 * this suite runs on the same macOS runner every time.
 *
 * One dedicated fixture entry (`remotion/src/render-determinism-fixture.tsx`)
 * serves both cases, so this suite owns its bundle directory: `remotion-still.mjs`
 * memoizes one bundle per entry per process but writes it to a fixed path per
 * entry, so a suite sharing an entry with another would rebuild that directory
 * mid-render under local parallelism — a failure that would read as a
 * determinism break.
 *
 * Frames:
 *   - text mode frame 12 — entrance springs mid-flight, text gates have
 *     already fitted; frame 45 is the settled frame the gate suites use.
 *   - video mode frame 118 — exit window (opacity 1, container scale ≈1.14),
 *     real H.264 content; frame 9 is the entrance window.
 *
 * Runs in `pixel-render` (machine-bound: needs the remotion workspace and its
 * headless browser), like every suite that imports `remotion-still.mjs`.
 */
import { renderStill } from "./remotion-still.mjs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REMOTION_DIR = resolve(__dirname, "..", "remotion");
const STILL_DIR = join(__dirname, "..", "output", "determinism-stills");

/** The real pipeline clip, copied under this suite's own basename. */
const CLIP_NAME = "render-determinism-clip.mp4";
const SOURCE_CLIP = resolve(
  __dirname,
  "..",
  "content",
  "unitree",
  "assets",
  "unitree-superman-demo.mp4",
);

const CASES = [
  {
    name: "text-entrance",
    props: { mode: "text" },
    frame: 12,
    contrastFrame: 45,
    covers: "entrance spring + text-gate fitting",
  },
  {
    name: "video-zoom",
    props: { mode: "video", clipName: CLIP_NAME },
    frame: 118,
    contrastFrame: 9,
    covers: "H.264 frame extraction + container scale",
  },
];

let clipPath;

beforeAll(() => {
  mkdirSync(STILL_DIR, { recursive: true });
  clipPath = join(REMOTION_DIR, "public", "assets", CLIP_NAME);
  copyFileSync(SOURCE_CLIP, clipPath);
});

afterAll(() => {
  rmSync(clipPath, { force: true });
});

/** Fixed per suite: one entry whose bundle directory no other suite writes. */
const ENTRY = "src/render-determinism-fixture.tsx";
const COMPOSITION = "RenderDeterminismFixture";

/**
 * Render one frame to a still. `tag` suffixes the filename and bypasses the
 * cache; the identical-pair assertion renders the same inputs to two paths
 * through THIS function, so the pair cannot drift in render options (an option
 * added to only one copy would make the 0-byte gate compare different renders
 * and misreport the difference as nondeterminism).
 */
async function render(testCase, frame, tag = "") {
  const out = join(STILL_DIR, `${testCase.name}@${frame}${tag ? `-${tag}` : ""}.png`);
  await renderStill({
    entry: ENTRY,
    composition: COMPOSITION,
    output: out,
    props: testCase.props,
    frame,
    timeout: 300_000,
  });
  return out;
}

const stillCache = new Map();

async function still(testCase, frame) {
  const key = `${testCase.name}@${frame}`;
  if (!stillCache.has(key)) stillCache.set(key, await render(testCase, frame));
  return stillCache.get(key);
}

/**
 * Decode both PNGs and compare every RGBA byte. Returns the differing-byte
 * count (0 = identical) plus the first differing pixel for the failure
 * message — "differs" alone would not say whether a 1-pixel edge moved or the
 * whole frame shifted.
 */
function pixelDiff(pathA, pathB) {
  const a = PNG.sync.read(readFileSync(pathA));
  const b = PNG.sync.read(readFileSync(pathB));
  if (a.width !== b.width || a.height !== b.height) {
    return {
      differingBytes: -1,
      detail: `dimension mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    };
  }
  let differingBytes = 0;
  let first = null;
  for (let i = 0; i < a.data.length; i += 1) {
    if (a.data[i] === b.data[i]) continue;
    differingBytes += 1;
    if (!first) {
      const pixel = Math.floor(i / 4);
      first = {
        x: pixel % a.width,
        y: Math.floor(pixel / a.width),
        channel: "rgba"[i % 4],
        a: a.data[i],
        b: b.data[i],
      };
    }
  }
  return {
    differingBytes,
    detail: `first difference at (${first?.x}, ${first?.y}) channel ${first?.channel}: ${first?.a} vs ${first?.b}`,
    size: `${a.width}x${a.height}`,
  };
}

describe("frame-identical re-render (#734)", { timeout: 600_000 }, () => {
  for (const testCase of CASES) {
    describe(`${testCase.name} — ${testCase.covers}`, () => {
      it("renders the same frame twice with zero pixel differences", async () => {
        const first = await still(testCase, testCase.frame);
        // Second independent render to its own path: `render()` bypasses the
        // still cache and goes through the same option set as the first.
        const second = await render(testCase, testCase.frame, "rerun");
        const diff = pixelDiff(first, second);
        console.log(
          `[evidence] ${testCase.name} frame ${testCase.frame} (${diff.size}): ${diff.differingBytes} differing bytes`,
        );
        expect(diff.differingBytes, `${testCase.name}: ${diff.detail}`).toBe(0);
      });

      it("sees motion between two different frames (negative control)", async () => {
        const frame = await still(testCase, testCase.frame);
        const contrast = await still(testCase, testCase.contrastFrame);
        const diff = pixelDiff(frame, contrast);
        console.log(
          `[evidence] ${testCase.name} frames ${testCase.frame} vs ${testCase.contrastFrame}: ${diff.differingBytes} differing bytes`,
        );
        // If this is 0, both renders produced the same (or blank) picture and
        // the determinism assertion above would pass without proving anything.
        expect(
          diff.differingBytes,
          `${testCase.name}: frames ${testCase.frame} and ${testCase.contrastFrame} are identical — the render is not reflecting frame state, so the determinism assertion is vacuous`,
        ).toBeGreaterThan(0);
      });
    });
  }
});
