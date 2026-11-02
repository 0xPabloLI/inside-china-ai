/**
 * cropFocus / focus → objectPosition — the pixel contract (#952).
 *
 * Why this file exists: `fit` and `cropFocus` are DECLARED scene fields whose
 * only runtime effect is where the source is sampled. Until 2026-10-25 the
 * video branch of MediaBackground silently rendered `contain`, so
 * `fit: "cover"` did nothing and `cropFocus` had no effect at all. `fit` now
 * has a pixel gate (`checkMediaBandFill`, TOP-of-band row variance), but that
 * gate cannot see WHICH PART of the picture landed in the frame: a frame
 * sampled from the wrong end of the source fills the band perfectly.
 *
 * Driver pattern: media-zoom-render.test.mjs — vitest has no access to the
 * remotion workspace's node_modules, so the real render runtime is driven
 * through the still driver (`remotion-still.mjs`) against a dedicated fixture entry
 * (remotion/src/media-focus-fixture.tsx, own registerRoot).
 *
 * The colour-coded sources are generated at test time into the gitignored
 * `assets/_staged/` namespace and deleted afterwards — no committed binaries.
 * Every case samples a fixed point of the rendered frame and classifies it
 * against the source's palette, so the assertion is "that point came from band
 * N", not "the frames differ" (an unrelated visual change satisfies the
 * latter).
 *
 * Cases pin five invariants:
 *   1. cropFocus.x moves the sampling window left/right — image AND video.
 *   2. The default (no cropFocus, no focus) samples the centre band — image
 *      AND video. The video default is the one that was silently broken.
 *   3. `focus` top/center/bottom moves the window vertically — image AND video.
 *   4. cropFocus takes precedence over `focus` when both are declared (the
 *      documented `cropFocus ?? FOCUS_MAP[focus]` contract). Cover crops one
 *      axis, so the two compete on the tall source's vertical axis.
 *   5. MediaCard passes media through unchanged: the same focus values land on
 *      the same bands inside the evidence card, which is a LANDSCAPE box — so
 *      it crops the tall source on the vertical axis.
 *
 * Sampling and classification are NOT defined here: they live in
 * `__tests__/pixel-probe.mjs` (`meanColourInPatch` / `nearestPaletteColour`) and
 * are covered by the CI-run `pixel-probe.test.mjs`. That split is the fix for
 * #1084 — this file spent 2026-10-30..11-01 red on main because its local
 * helpers were wrong, and being in `CI_SKIPPED_MACHINE_BOUND` meant no gate
 * ever saw them: the 60x60 patch was centred on the fractional `CARD_CENTRE.y`
 * (648.5), whose half-pixel the row-stride multiplication swallowed, so the
 * read window slid to x 980-1038 — outside the card — and pure black, being
 * equidistant from red/lime/blue, was classified "red". Invariant 5's bottom
 * case failed on the wrong end; its top case passed while sampling nothing.
 * A helper bug is now a red CI test; a rendering bug still needs this file.
 *
 * Of #1084's three leads: the FOCUS_MAP one is a non-issue for this case — the
 * fixture sets no `fit`, so `objectPositionFor` takes the cover branch and only
 * reads `focus`; the stills show "center top" / "center bottom" selecting the
 * top and bottom bands. The card-geometry lead is recorded at invariant 5. The
 * "render a still and look" lead is what the evidence lines below do on every
 * run, and the stills are kept under `output/media-focus-stills/`.
 *
 * CI runs this file in the dedicated `pixel-render` job (#1087), which installs
 * `scripts/short-video/remotion` — its own lockfile means the root `npm ci`
 * every other job runs leaves that workspace's node_modules and
 * headless-browser download absent (docs/conventions/test-env-baseline.md). It
 * stays in `CI_SKIPPED_MACHINE_BOUND` so the `Lint, typecheck, test` job, whose
 * 15-minute budget cannot hold a workspace install plus a browser download,
 * still skips it. The rest of #952's gate is the static
 * canvas-image-fit-contract.test.mjs.
 */
import { renderStill } from "./remotion-still.mjs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import { EVIDENCE_CARD } from "../lib/safe-zones.mjs";
import { meanColourInPatch, nearestPaletteColour } from "./pixel-probe.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REMOTION_DIR = resolve(__dirname, "..", "remotion");
const ENTRY = "src/media-focus-fixture.tsx";
const COMPOSITION = "MediaFocusFixture";
const STAGED_SUBDIR = "_staged"; // gitignored; public/assets symlinks to assets/

const ASSETS = {
  horizontalImage: "media-focus-horizontal.png",
  horizontalVideo: "media-focus-horizontal.mp4",
  verticalImage: "media-focus-vertical.png",
  verticalVideo: "media-focus-vertical.mp4",
};

/** Frame inside the settled part of the scene (animation "none" → no motion). */
const FRAME = 60;

/** Canvas centre: where a full-frame scene's picture is sampled. */
const CANVAS_CENTRE = { x: 540, y: 960 };

/** Evidence-card centre: where MediaCard's inner picture is sampled. */
const CARD_CENTRE = {
  x: EVIDENCE_CARD.left + EVIDENCE_CARD.width / 2,
  y: EVIDENCE_CARD.top + EVIDENCE_CARD.height / 2,
};

/** Palette reference points. Nearest-colour classification, not thresholds. */
const PALETTE = {
  red: { r: 255, g: 0, b: 0 },
  lime: { r: 0, g: 255, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
};

let stillDir;
const assetPaths = {};

/**
 * Write a three-band source (red | lime | blue) along `axis`.
 * Still = one frame; clip = 1s at 30fps, H.264 yuv420p.
 */
function writeBands(axis, out, clip) {
  const horizontal = axis === "horizontal";
  const size = horizontal ? "640x1080" : "540x640";
  const stack = horizontal ? "hstack" : "vstack";
  const encode = clip
    ? ["-t", "1", "-r", "30", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "18", "-y"]
    : ["-frames:v", "1", "-y"];
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      ...["red", "lime", "blue"].flatMap((colour) => [
        "-f",
        "lavfi",
        "-i",
        `color=c=${colour}:s=${size}`,
      ]),
      "-filter_complex",
      `[0:v][1:v][2:v]${stack}=inputs=3`,
      ...encode,
      out,
    ],
    { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 },
  );
}

beforeAll(() => {
  // Stills persist under the gitignored output/ dir as ticket evidence; paths
  // are reported in the issue comment, not committed.
  stillDir = join(__dirname, "..", "output", "media-focus-stills");
  mkdirSync(stillDir, { recursive: true });
  const staged = join(REMOTION_DIR, "public", "assets", STAGED_SUBDIR);
  mkdirSync(staged, { recursive: true });
  for (const [key, name] of Object.entries(ASSETS)) assetPaths[key] = join(staged, name);
  writeBands("horizontal", assetPaths.horizontalImage, false);
  writeBands("horizontal", assetPaths.horizontalVideo, true);
  writeBands("vertical", assetPaths.verticalImage, false);
  writeBands("vertical", assetPaths.verticalVideo, true);
});

afterAll(() => {
  for (const path of Object.values(assetPaths)) rmSync(path, { force: true });
});

const stillCache = new Map();
async function still(props) {
  const key = JSON.stringify(props);
  if (stillCache.has(key)) return stillCache.get(key);
  const name = Object.entries(props)
    .map(([k, v]) => `${k}=${v}`)
    .join("_");
  const out = join(stillDir, `${name}.png`);
  await renderStill({
    entry: ENTRY,
    composition: COMPOSITION,
    output: out,
    props: props,
    frame: FRAME,
    timeout: 300_000,
  });
  stillCache.set(key, out);
  return out;
}

async function sampleAt(props, point = CANVAS_CENTRE) {
  const png = PNG.sync.read(readFileSync(await still(props)));
  expect(png.width, "frame width").toBe(1080);
  expect(png.height, "frame height").toBe(1920);
  const rgb = meanColourInPatch(png, point);
  const name = nearestPaletteColour(rgb, PALETTE);
  const where = point === CANVAS_CENTRE ? "centre" : "card centre";
  console.log(`[evidence] ${JSON.stringify(props)} → ${where} ${JSON.stringify(rgb)} = ${name}`);
  // No palette entry within the ceiling means either nothing was drawn there
  // (frame background) or the sample straddles two bands. Say that, instead of
  // letting the caller's toBe() report a wrong-band failure (#1084).
  expect(
    name,
    `no band at ${where} (${point.x}, ${point.y}): mean ${JSON.stringify(rgb)} is not ` +
      `within the palette ceiling of any entry — nothing was rendered there, or the ` +
      `patch straddles two bands`,
  ).not.toBeNull();
  return name;
}

// ─── 1+2: cropFocus.x moves the window; absent means centre ───

describe("cropFocus.x selects the sampled band", { timeout: 600_000 }, () => {
  it("image: left focus samples the LEFT third", async () => {
    expect(
      await sampleAt({ asset: "image", source: "horizontal", cropFocusX: 0.05 }),
      "cropFocus.x=0.05 must land on the red (left) band",
    ).toBe("red");
  });

  it("image: absent cropFocus samples the CENTRE third (default)", async () => {
    expect(
      await sampleAt({ asset: "image", source: "horizontal" }),
      "no cropFocus must leave the frame centred on the green band",
    ).toBe("lime");
  });

  it("image: right focus samples the RIGHT third", async () => {
    expect(
      await sampleAt({ asset: "image", source: "horizontal", cropFocusX: 0.95 }),
      "cropFocus.x=0.95 must land on the blue (right) band",
    ).toBe("blue");
  });

  it("video: left focus samples the LEFT third", async () => {
    expect(
      await sampleAt({ asset: "video", source: "horizontal", cropFocusX: 0.05 }),
      "the <Video> branch must honour objectPosition too",
    ).toBe("red");
  });

  it("video: absent cropFocus samples the CENTRE third (the broken default)", async () => {
    // This is the case that shipped wrong: the video branch declared cover,
    // ignored objectFit-in-style and letterboxed, so every focus value was
    // invisible. With cover restored the default must land mid-source.
    expect(
      await sampleAt({ asset: "video", source: "horizontal" }),
      "no cropFocus must leave the video frame centred on the green band",
    ).toBe("lime");
  });

  it("video: right focus samples the RIGHT third", async () => {
    expect(
      await sampleAt({ asset: "video", source: "horizontal", cropFocusX: 0.95 }),
      "the <Video> branch must honour objectPosition too",
    ).toBe("blue");
  });
});

// ─── 3: the deprecated focus enum still moves the window vertically ───

describe("focus enum selects the sampled band (vertical crop)", { timeout: 600_000 }, () => {
  // One still per case: each render has its own 300s budget, and a test with
  // three of them could exceed the describe budget before any single call
  // times out — a failure with no still to inspect.
  it("image: focus top samples the TOP third", async () => {
    expect(await sampleAt({ asset: "image", source: "vertical", focus: "top" })).toBe("red");
  });

  it("image: focus center samples the MIDDLE third", async () => {
    expect(await sampleAt({ asset: "image", source: "vertical", focus: "center" })).toBe("lime");
  });

  it("image: focus bottom samples the BOTTOM third", async () => {
    expect(await sampleAt({ asset: "image", source: "vertical", focus: "bottom" })).toBe("blue");
  });

  it("video: focus top samples the TOP third", async () => {
    expect(await sampleAt({ asset: "video", source: "vertical", focus: "top" })).toBe("red");
  });

  it("video: focus bottom samples the BOTTOM third", async () => {
    expect(await sampleAt({ asset: "video", source: "vertical", focus: "bottom" })).toBe("blue");
  });
});

// ─── 4: cropFocus wins over the focus enum when both are declared ───
//
// Cover crops exactly one axis, so both fields can only compete on that axis:
// the tall (vertical) source with cropFocus.y against focus top/bottom.

describe("cropFocus takes precedence over focus", { timeout: 600_000 }, () => {
  it("control: focus top alone samples the TOP band", async () => {
    expect(
      await sampleAt({ asset: "image", source: "vertical", focus: "top" }),
      "without cropFocus the enum must drive the vertical window",
    ).toBe("red");
  });

  it("cropFocus.y=0.95 + focus top samples the BOTTOM band, not the top", async () => {
    expect(
      await sampleAt({ asset: "image", source: "vertical", cropFocusY: 0.95, focus: "top" }),
      "cropFocus must override object-position, including the axis focus names",
    ).toBe("blue");
  });
});

// ─── 5: the evidence card passes media through unchanged ───
//
// MediaCard is a wrapper (EVIDENCE_CARD.width x height = 820x697, landscape)
// around MediaBackground. It has no media wiring of its own, which is exactly
// why it is worth asserting: a wrapper that dropped or overwrote
// `focus`/`cropFocus` would look fine in every still of a full-frame scene.
//
// The fixture passes no `bottom`, so MediaCard's default applies
// (`top + EVIDENCE_CARD.height`) and the card is exactly EVIDENCE_CARD — which
// is what makes CARD_CENTRE the right probe (#1084 lead 2, verified when the
// #1021 geometry change made that centre a half pixel).

describe("MediaCard passes focus through to MediaBackground", { timeout: 600_000 }, () => {
  it("card: focus top samples the TOP band inside the card", async () => {
    expect(
      await sampleAt(
        { asset: "image", source: "vertical", wrap: "card", focus: "top" },
        CARD_CENTRE,
      ),
      "a card-mode scene must render the same crop the full-frame scene would",
    ).toBe("red");
  });

  it("card: focus bottom samples the BOTTOM band inside the card", async () => {
    expect(
      await sampleAt(
        { asset: "image", source: "vertical", wrap: "card", focus: "bottom" },
        CARD_CENTRE,
      ),
      "a card-mode scene must render the same crop the full-frame scene would",
    ).toBe("blue");
  });
});
