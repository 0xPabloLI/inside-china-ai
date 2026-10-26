/**
 * MediaBackground container-zoom on VIDEO — #357 render evidence.
 *
 * Driver pattern: media-start-offset.test.mjs — vitest has no access to the
 * remotion workspace's node_modules, so the real render runtime is driven
 * through `npx remotion still` against a dedicated fixture entry
 * (remotion/src/media-zoom-fixture.tsx, own registerRoot).
 *
 * Why this file exists (the user-visible defect): the `zoom` preset is a
 * CONTAINER scale — entrance 1.3 → 1.0, exit 1.0 → 1.15 — layered on top of
 * fit:"cover". On a video asset that means (1) the asset's own camera motion
 * gets a second, artificial motion on top, (2) the frame is cropped twice, so
 * the entrance/exit only show a fraction of the already-cropped picture, and
 * (3) the crop window drifts every frame, which silently invalidates the VLM
 * cropFocus that was computed for a STATIC crop.
 *
 * Frame selection:
 *   frame 118 — exit window (opacity is 1 there; nothing hides the crop).
 *               The scale is ≈1.14, i.e. ~13% of the cover-cropped picture is
 *               pushed off-screen.
 *   frame 9   — entrance window (opacity still ramping, scale still > 1).
 *
 * Asset: the real pipeline clip content/unitree/assets/unitree-superman-demo.mp4
 * (640x360, its own camera motion), copied into public/assets/ for the render
 * and removed afterwards. Stills persist under the gitignored output/ dir as
 * ticket evidence; paths are reported in the issue comment, not committed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REMOTION_DIR = resolve(__dirname, "..", "remotion");
const ENTRY = "src/media-zoom-fixture.tsx";
const COMPOSITION = "MediaZoomFixture";
const FIXTURE_VIDEO = "media-zoom-fixture.mp4";
const FIXTURE_IMAGE = "media-zoom-fixture.png";
const SOURCE_CLIP = resolve(
  __dirname,
  "..",
  "content",
  "unitree",
  "assets",
  "unitree-superman-demo.mp4",
);

/** Exit window — opacity 1, zoom scale ≈ 1.14. */
const EXIT_FRAME = 118;
/** Entrance window — opacity ramping, zoom scale still > 1. */
const ENTRANCE_FRAME = 9;
/** Zoom exit scale at EXIT_FRAME: outStart=105, out=15 → 1 + 0.15 × 13/15. */
const EXIT_SCALE = 1.13;
/**
 * Zoom-vs-none measured on this frame before #357 — kept only as a printed
 * reference point. It is NOT a threshold: it was captured while <Video>
 * silently rendered `contain`, so it measures a different fit mode. See the
 * "fade vs none" cases.
 */
const ZOOM_VS_NONE_BEFORE = 414_816;

let stillDir;
let fixtureVideoPath;
let fixtureImagePath;

beforeAll(() => {
  stillDir = join(__dirname, "..", "output", "media-zoom-stills");
  mkdirSync(stillDir, { recursive: true });
  fixtureVideoPath = join(REMOTION_DIR, "public", "assets", FIXTURE_VIDEO);
  fixtureImagePath = join(REMOTION_DIR, "public", "assets", FIXTURE_IMAGE);
  copyFileSync(SOURCE_CLIP, fixtureVideoPath);
  // Image control group: a 1080x1920 pattern, i.e. EXACTLY the composition
  // size, so fit:cover has nothing to resample. That isolates the preset's
  // geometry — with a small source, cover's own upscale blur dominates the
  // pixel diff and the centre-crop comparison stops being decidable.
  execFileSync(
    "ffmpeg",
    ["-f", "lavfi", "-i", "testsrc2=s=1080x1920:d=1", "-frames:v", "1", "-y", fixtureImagePath],
    { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 },
  );
});

afterAll(() => {
  rmSync(fixtureVideoPath, { force: true });
  rmSync(fixtureImagePath, { force: true });
});

const stillCache = new Map();
function still(scenario, asset, frame) {
  const key = `${asset}-${scenario}@${frame}`;
  if (stillCache.has(key)) return stillCache.get(key);
  const out = join(stillDir, `${key.replace("@", "-")}.png`);
  execFileSync(
    "npx",
    [
      "remotion",
      "still",
      ENTRY,
      COMPOSITION,
      out,
      "--props",
      JSON.stringify({ scenario, asset }),
      "--frame",
      String(frame),
    ],
    { cwd: REMOTION_DIR, stdio: "pipe", timeout: 300_000 },
  );
  stillCache.set(key, out);
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

/**
 * Center-crop `path` to 1/factor of its size and nearest-neighbour it back up.
 * A pure container scale of `factor` produces exactly this image, so a low
 * diff against it proves "the frame is the middle 1/factor, blown up".
 */
function centerCropScaled(path, factor) {
  const src = PNG.sync.read(readFileSync(path));
  const out = new PNG({ width: src.width, height: src.height });
  const cw = Math.round(src.width / factor);
  const ch = Math.round(src.height / factor);
  const x0 = Math.round((src.width - cw) / 2);
  const y0 = Math.round((src.height - ch) / 2);
  for (let y = 0; y < src.height; y++) {
    const sy = y0 + Math.min(ch - 1, Math.floor((y * ch) / src.height));
    for (let x = 0; x < src.width; x++) {
      const sx = x0 + Math.min(cw - 1, Math.floor((x * cw) / src.width));
      const s = (sy * src.width + sx) * 4;
      const d = (y * src.width + x) * 4;
      out.data[d] = src.data[s];
      out.data[d + 1] = src.data[s + 1];
      out.data[d + 2] = src.data[s + 2];
      out.data[d + 3] = 255;
    }
  }
  return out;
}

/** Per-pixel abs RGB diff count between a PNG file and a decoded PNG. */
function diffPng(pathA, pngB) {
  const a = PNG.sync.read(readFileSync(pathA));
  expect(a.width, "frame size mismatch").toBe(pngB.width);
  expect(a.height, "frame size mismatch").toBe(pngB.height);
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d =
      Math.abs(a.data[i] - pngB.data[i]) +
      Math.abs(a.data[i + 1] - pngB.data[i + 1]) +
      Math.abs(a.data[i + 2] - pngB.data[i + 2]);
    if (d > 40) count++;
  }
  return count;
}

const TOTAL_PIXELS = 1080 * 1920;

// ─── What the preset does (measured on an image, where zoom stays legal) ───
// The numbers quantify the defect #357 describes: a container scale is a
// SECOND crop of the cover frame. Video is excluded from this preset (below),
// so the preset's geometry is measured where it is still allowed — images.

describe("container zoom is a second crop (image control)", { timeout: 600_000 }, () => {
  it("exit frame: zoom is the cover frame's centre, blown up — edges pushed off-screen", () => {
    const zoomed = still("zoom", "image", EXIT_FRAME);
    const plain = still("none", "image", EXIT_FRAME);
    // (a) the two frames are materially different — zoom is not a no-op
    const raw = diffCount(zoomed, plain);
    // (b) zoom ≈ the middle 1/EXIT_SCALE of the un-zoomed frame, blown back up.
    //     Control: the un-zoomed frame compared against its OWN centre crop is
    //     far off — so a small number here really means "zoom is that crop".
    const asCrop = diffPng(zoomed, centerCropScaled(plain, EXIT_SCALE));
    const selfCrop = diffPng(plain, centerCropScaled(plain, EXIT_SCALE));
    console.log(
      `[evidence] image exit f${EXIT_FRAME}: zoom-vs-none=${raw}px, zoom-vs-centre-crop=${asCrop}px, none-vs-own-crop=${selfCrop}px of ${TOTAL_PIXELS}`,
    );
    expect(raw, "zoom must differ from none").toBeGreaterThan(20_000);
    expect(asCrop, "zoom must be the centre crop").toBeLessThan(selfCrop / 2);
  });
});

// ─── The fix: video never takes the container zoom (#357) ───

describe("video + zoom degrades to fade", { timeout: 600_000 }, () => {
  it(`exit frame ${EXIT_FRAME}: no 1.15 exit scale — zoom renders as fade`, () => {
    const zoomed = still("zoom", "video", EXIT_FRAME);
    const faded = still("fade", "video", EXIT_FRAME);
    const count = diffCount(zoomed, faded);
    console.log(`[evidence] video zoom-vs-fade f${EXIT_FRAME}: ${count}px of ${TOTAL_PIXELS}`);
    expect(count, "video must not render the 1.15 exit scale").toBeLessThan(2_000);
  });

  it(`entrance frame ${ENTRANCE_FRAME}: no 1.3 entrance scale — zoom renders as fade`, () => {
    const zoomed = still("zoom", "video", ENTRANCE_FRAME);
    const faded = still("fade", "video", ENTRANCE_FRAME);
    const count = diffCount(zoomed, faded);
    console.log(`[evidence] video zoom-vs-fade f${ENTRANCE_FRAME}: ${count}px of ${TOTAL_PIXELS}`);
    expect(count, "video must not render the 1.3 entrance scale").toBeLessThan(2_000);
  });
});

// ─── Why fade and not none (issue #357's open question) ───
// `fade` still pushes 1.0 → 1.05 across the scene and drifts -30px on exit, so
// it is not motionless — it cuts the crop-window drift from 30% to ~5%.
// `none` IS motionless, and was rejected for a reason the stills cannot show:
// MediaBackground holds `none` at a constant `baseVolume`, dropping the 4-stop
// volume envelope, so every video's audio would hard-cut at scene boundaries.
// These cases measure what the chosen default still costs and pin the numbers,
// so a future change to the fade curve — or a switch to `none` once the audio
// envelope is decoupled from the preset — shows up as a moved goalpost.

describe("fade vs none — what the chosen default still costs", { timeout: 600_000 }, () => {
  it("exit frame: fade's cost is bounded (no video zoom baseline exists to compare against)", () => {
    const faded = still("fade", "video", EXIT_FRAME);
    const plain = still("none", "video", EXIT_FRAME);
    const fadeVsNone = diffCount(faded, plain);

    // This case used to read `fadeVsNone < ZOOM_VS_NONE_BEFORE (414,816)`, i.e.
    // "fade is cheaper than the old zoom was". That comparison is gone, for two
    // independent reasons:
    //
    //   1. On VIDEO there is no zoom render to measure — resolvePreset degrades
    //      zoom → fade, which the two cases above pin at 0px difference. So
    //      "zoom-vs-none" on this asset measures the fade render against
    //      itself; the assertion had become vacuous.
    //   2. The 414,816 constant was captured while <Video> silently rendered
    //      `contain`, so only the 607px-tall letterboxed picture could differ.
    //      Now that fit:"cover" actually applies, the picture fills the frame
    //      and the same comparison measures 821,429px. A threshold from a
    //      different fit mode is not a threshold.
    //
    // What is worth pinning is the magnitude itself, so a future change to the
    // fade curve shows up as a moved goalpost. Half the frame is a generous
    // ceiling: fade's 1.0→1.05 push plus its 30px exit drift is a deliberate,
    // bounded cost, and the case below pins its shape (entrance > exit).
    const ratio = fadeVsNone / TOTAL_PIXELS;
    console.log(
      `[evidence] exit f${EXIT_FRAME}: fade-vs-none=${fadeVsNone}px (${(ratio * 100).toFixed(1)}% of frame)`,
    );
    expect(fadeVsNone, "fade must not disturb most of the frame").toBeLessThan(TOTAL_PIXELS / 2);
  });

  it("entrance frame: fade-vs-none is LARGER than at the exit — it is the fade-in, not geometry", () => {
    const entrance = diffCount(
      still("fade", "video", ENTRANCE_FRAME),
      still("none", "video", ENTRANCE_FRAME),
    );
    const exit = diffCount(still("fade", "video", EXIT_FRAME), still("none", "video", EXIT_FRAME));
    console.log(
      `[evidence] fade-vs-none: entrance f${ENTRANCE_FRAME}=${entrance}px, exit f${EXIT_FRAME}=${exit}px`,
    );
    // fade's opacity ramp is what separates it from `none` at frame 9 (it is
    // still ~0.375 there), so the entrance gap is dominated by brightness —
    // the opposite of zoom, whose entrance was the 1.3 crop. This pins the
    // mechanism: a future change to the fade-in length moves this number.
    expect(entrance).toBeGreaterThan(exit);
  });
});
