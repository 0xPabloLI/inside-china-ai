/**
 * AvatarCard render-probe tests (#214 ticket 02).
 *
 * Same driver pattern as scene-gate-render.test.mjs (T5): vitest has no
 * access to the remotion workspace's node_modules, so the real render runtime
 * is driven through `npx remotion still` against the dedicated fixture entry
 * (remotion/src/avatar-card-fixture.tsx, own registerRoot — Root.tsx is never
 * touched).
 *
 * Evidence claims locked here (ticket acceptance criteria):
 *   1. A fully-declared avatar paints the card at the lib/safe-zones.mjs
 *      rect (right-center, clear of the action rail / subtitle lane) — real
 *      Chromium frame diff against the avatar-less control. The 1248×1632
 *      fixture source (2x-upscaled EchoMimicV3 frame size) must fill the
 *      420×550 card without spilling outside it (scale-in, no distortion).
 *   2. present: [{from, to}] clips the card to the window: frames inside the
 *      window differ from the control; frames one step outside BOTH edges are
 *      BYTE-identical to the control (no residue on the switch frames).
 *
 * The fixture clip is generated at test time (ffmpeg testsrc2) into
 * remotion/public/assets/ and deleted afterwards — no committed binaries.
 * Committed frame evidence for human review lives in
 * __tests__/evidence/avatar-card/ (regenerate with the AVATAR_EVIDENCE=1
 * env flag, which copies the probe stills there at half scale).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import { AVATAR_CARD_RECT } from "../lib/safe-zones.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REMOTION_DIR = resolve(__dirname, "..", "remotion");
const ENTRY = "src/avatar-card-fixture.tsx";
const COMPOSITION = "AvatarCardFixture";
const FIXTURE_VIDEO = "avatar-card-fixture.mp4";
const EVIDENCE_DIR = resolve(__dirname, "evidence", "avatar-card");

// present: [{from:1, to:3}] at 30fps → the Sequence paints frames 30-89
const [WIN_FROM, WIN_TO] = [30, 90];

let fixtureVideoPath;
let stillDir;

beforeAll(() => {
  stillDir = mkdtempSync(join(tmpdir(), "t02-avatar-"));
  // 1248×1632 = 624×816 (EchoMimicV3 native) × 2 (dh-upscale) — proves the
  // oversized source scales INTO the card frame (acceptance criterion 5).
  fixtureVideoPath = join(REMOTION_DIR, "public", "assets", FIXTURE_VIDEO);
  execFileSync(
    "ffmpeg",
    [
      "-f", "lavfi", "-i", "testsrc2=s=1248x1632:d=4:r=30",
      "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "30", "-y", fixtureVideoPath,
    ],
    { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 },
  );
});

afterAll(() => {
  rmSync(fixtureVideoPath, { force: true });
  rmSync(stillDir, { recursive: true, force: true });
});

/**
 * Run one still render of the fixture (memoized per scenario+frame — each
 * call pays a bundle + browser startup, so keep the matrix small).
 */
const stillCache = new Map();
function still(scenario, frame) {
  const key = `${scenario}@${frame}`;
  if (stillCache.has(key)) return stillCache.get(key);
  const out = join(stillDir, `${key.replace("@", "-")}.png`);
  execFileSync(
    "npx",
    [
      "remotion", "still", ENTRY, COMPOSITION, out,
      "--props", JSON.stringify({ scenario }),
      "--frame", String(frame),
    ],
    { cwd: REMOTION_DIR, stdio: "pipe", timeout: 240_000 },
  );
  stillCache.set(key, out);
  // Committed frame evidence: refresh when explicitly asked for (AVATAR_EVIDENCE=1)
  if (process.env.AVATAR_EVIDENCE === "1") {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const evidencePath = join(EVIDENCE_DIR, `${key.replace("@", "-")}.png`);
    execFileSync(
      "ffmpeg",
      ["-i", out, "-vf", "scale=540:960", "-y", evidencePath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  }
  return out;
}

/** Per-pixel abs RGB diff stats between two stills of the same frame. */
function diffStats(pathA, pathB) {
  const a = PNG.sync.read(readFileSync(pathA));
  const b = PNG.sync.read(readFileSync(pathB));
  expect(a.width, "frame size mismatch").toBe(b.width);
  expect(a.height, "frame size mismatch").toBe(b.height);
  let count = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (a.width * y + x) << 2;
      const d =
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > 40) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { count, minX, minY, maxX, maxY };
}

// The card shadow (30px blur, 8px offset) darkens pixels beyond the rect;
// video CONTENT (what the diff threshold catches) must stay inside the rect
// plus this shadow tolerance.
const SHADOW_TOLERANCE = 45;

describe(
  "AvatarCard (real Chromium via remotion still)",
  { timeout: 300_000 },
  () => {
    it("declared avatar paints the card at the safe-zone rect (scale-in, no spill)", () => {
      const card = still("avatar-card", 45);
      const control = still("avatar-control", 45);
      expect(existsSync(card)).toBe(true);

      const stats = diffStats(card, control);
      // The card is ON: a large content area differs from the control…
      expect(stats.count).toBeGreaterThan(300 * 500);
      // …and every differing pixel stays inside the card rect (+ shadow).
      expect(stats.minX).toBeGreaterThanOrEqual(AVATAR_CARD_RECT.x - SHADOW_TOLERANCE);
      expect(stats.maxX).toBeLessThanOrEqual(
        AVATAR_CARD_RECT.x + AVATAR_CARD_RECT.width + SHADOW_TOLERANCE,
      );
      expect(stats.minY).toBeGreaterThanOrEqual(AVATAR_CARD_RECT.y - SHADOW_TOLERANCE);
      expect(stats.maxY).toBeLessThanOrEqual(
        AVATAR_CARD_RECT.y + AVATAR_CARD_RECT.height + SHADOW_TOLERANCE,
      );

      // The video fills the card (1248×1632 source cover-fits 420×550 exactly):
      // sample a grid inside the card — every point must differ from control.
      const cardPng = PNG.sync.read(readFileSync(card));
      const controlPng = PNG.sync.read(readFileSync(control));
      const inset = 12;
      const step = 40;
      for (let y = AVATAR_CARD_RECT.y + inset; y < AVATAR_CARD_RECT.y + AVATAR_CARD_RECT.height - inset; y += step) {
        for (let x = AVATAR_CARD_RECT.x + inset; x < AVATAR_CARD_RECT.x + AVATAR_CARD_RECT.width - inset; x += step) {
          const i = (cardPng.width * y + x) << 2;
          const d =
            Math.abs(cardPng.data[i] - controlPng.data[i]) +
            Math.abs(cardPng.data[i + 1] - controlPng.data[i + 1]) +
            Math.abs(cardPng.data[i + 2] - controlPng.data[i + 2]);
          expect(d, `card interior point (${x},${y}) shows no video content`).toBeGreaterThan(40);
        }
      }
    });

    it("present window: card visible inside [{1s,3s}], absent with NO residue outside", () => {
      // One frame inside each edge + the middle: card painted (differs from control)
      for (const frame of [WIN_FROM + 1, 45, WIN_TO - 1]) {
        const stats = diffStats(still("avatar-present", frame), still("avatar-control", frame));
        expect(stats.count, `frame ${frame} should show the card`).toBeGreaterThan(300 * 500);
      }
      // One frame before/after the window edges: byte-identical to the
      // control — the card is fully unmounted, nothing lingers (切换帧无残留).
      for (const frame of [WIN_FROM - 1, WIN_TO + 1]) {
        const present = readFileSync(still("avatar-present", frame));
        const control = readFileSync(still("avatar-control", frame));
        expect(
          present.equals(control),
          `frame ${frame}: outside the present window the render must be identical to the no-avatar control`,
        ).toBe(true);
      }
    });

    it("control (no avatar) renders clean — the diff baseline is a real frame", () => {
      expect(existsSync(still("avatar-control", 45))).toBe(true);
    });
  },
);
