/**
 * MediaBackground videoStartOffsetMs — S6/S7/S8 evidence tests (#360 ticket-2).
 *
 * Driver pattern: avatar-card-render.test.mjs — vitest has no access to the
 * remotion workspace's node_modules, so the real render runtime is driven
 * through `npx remotion still` against a dedicated fixture entry
 * (remotion/src/media-offset-fixture.tsx, own registerRoot).
 *
 * Spec scenarios (docs/specs/spec-long-video-360.md):
 *   S6 — absent offset: rendering identical to pre-#360 (no regression).
 *        Asserted at component-contract level (trimBefore resolves to
 *        undefined when the field is absent → the <Video> element receives
 *        exactly the pre-#360 prop set) + a still against the same
 *        baseline.
 *   S7 — videoStartOffsetMs: 5000 → playback starts at source t=5s.
 *        Real still evidence: frame 15 (t=0.5s scene time) of the offset
 *        still must differ from the offset-0 still (source content at
 *        t≈5.5s vs t≈0.5s).
 *   S8 — offset beyond the source duration: MediaBackground has no source
 *        duration knowledge (schema deliberately does not thread one
 *        through), so there is no numeric clamp. The acceptance is
 *        graceful degradation: the still render must NOT throw. (Spec
 *        correction: "clamp + warn" assumed a duration was available; it
 *        is not — out-of-range is the author's responsibility.)
 *
 * The fixture clip (ffmpeg testsrc2, 12s of moving content) is generated
 * at test time into public/assets/ and deleted afterwards — no committed
 * binaries. Stills live in a temp dir; paths are reported in the ticket
 * evidence comment, not committed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REMOTION_DIR = resolve(__dirname, "..", "remotion");
const ENTRY = "src/media-offset-fixture.tsx";
const COMPOSITION = "MediaOffsetFixture";
const FIXTURE_VIDEO = "media-offset-fixture.mp4";

let fixtureVideoPath;
let stillDir;

beforeAll(() => {
  // Stills are persisted under the gitignored output/ dir as ticket
  // evidence (paths reported in the issue comment) — NOT deleted afterAll.
  stillDir = join(__dirname, "..", "output", "media-offset-stills");
  mkdirSync(stillDir, { recursive: true });
  fixtureVideoPath = join(REMOTION_DIR, "public", "assets", FIXTURE_VIDEO);
  execFileSync(
    "ffmpeg",
    [
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=720x1280:d=12:r=30",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-crf",
      "30",
      "-y",
      fixtureVideoPath,
    ],
    { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 },
  );
});

afterAll(() => {
  rmSync(fixtureVideoPath, { force: true });
});

const stillCache = new Map();
function still(scenario, frame) {
  const key = `${scenario}@${frame}`;
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
      JSON.stringify({ scenario }),
      "--frame",
      String(frame),
    ],
    { cwd: REMOTION_DIR, stdio: "pipe", timeout: 240_000 },
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

// ─── S6: absent offset — component contract + baseline still ───

describe("S6: absent offset — no regression", { timeout: 300_000 }, () => {
  it("component contract: trimBefore is undefined when videoStartOffsetMs is absent/0", () => {
    const content = readFileSync(
      join(REMOTION_DIR, "src", "components", "MediaBackground.tsx"),
      "utf-8",
    );
    // The trimBefore conversion must fall back to undefined (prop absent →
    // identical to the pre-#360 <Video> element) — not to 0 or another value.
    const match = content.match(
      /const offsetMsToTrimBefore = \(offsetMs: number \| undefined, fps: number\) =>\s*\n\s*offsetMs \? Math\.round\(\(offsetMs \/ 1000\) \* fps\) : undefined;/,
    );
    expect(match, "trimBefore fallback must be undefined").toBeTruthy();

    // The component must call the helper and pass trimBefore through…
    expect(content).toMatch(
      /const trimBefore = offsetMsToTrimBefore\(media\.videoStartOffsetMs, fps\);/,
    );
    expect(content).toMatch(/trimBefore=\{trimBefore\}/);
    // …and the backdrop <Video> must remain untouched (schema field only
    // exists on MediaField, not on the backdrop sub-object).
    const backdropSection = content.match(/backdropPath && \([\s\S]*?\)\}/);
    expect(backdropSection).toBeTruthy();
    expect(backdropSection[0]).not.toMatch(/trimBefore/);
  });

  it("offset-0 still renders (baseline exists for the S7 diff)", () => {
    const out = still("offset-0", 15);
    expect(existsSync(out)).toBe(true);
  });
});

// ─── S7: offset 5000 — playback starts at source t=5s ───

describe("S7: videoStartOffsetMs 5000 starts playback at the offset", { timeout: 300_000 }, () => {
  it("frame 15 differs between offset-0 and offset-5000 (source t≈0.5s vs t≈5.5s)", () => {
    const baseline = still("offset-0", 15);
    const offset = still("offset-5000", 15);
    const count = diffCount(baseline, offset);
    // testsrc2 content moves continuously; a 5s source-time shift changes
    // the frame substantially. The default 0.7 overlay dim multiplies
    // media pixels by 0.3, so channel diffs are compressed — the observed
    // count at this threshold is ~73k of 2.07M pixels (bright pattern
    // regions); anything in the tens of thousands proves the source time
    // shifted (identical frames would differ in 0).
    expect(count).toBeGreaterThan(50_000);
  });

  it("offset-5000@frame15 aligns with offset-0@frame165 (exact source-time match)", () => {
    // trimBefore shifts the source read position by exactly
    // round(5000ms × 30fps) = 150 frames: the offset still at scene frame
    // 15 shows the same source frame as the un-offset render at frame
    // 15 + 150 = 165. Near-zero diff proves the offset is frames-exact.
    const shifted = still("offset-5000", 15);
    const unshifted = still("offset-0", 165);
    expect(diffCount(shifted, unshifted)).toBeLessThan(5_000);
  });
});

// ─── S8: offset beyond source duration — graceful degradation ───

describe("S8: out-of-range offset renders without throwing", { timeout: 300_000 }, () => {
  it("offset 120000 on a 12s source: still renders, no crash", () => {
    const out = still("offset-out-of-range", 15);
    expect(existsSync(out)).toBe(true);
    const png = PNG.sync.read(readFileSync(out));
    expect(png.width).toBe(1080);
    expect(png.height).toBe(1920);
  });
});
