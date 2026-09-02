/**
 * T12 contract tests: the official layout-utils fit seed must survive the
 * project's own terminal validation (spec decisions 57, 63).
 *
 * The probe runs inside a real Chromium render (`remotion still` against the
 * text-gate fixture) and reports two numbers per case:
 *
 *   - `truth`  — the size the pre-T12 full ladder picks, measured on real
 *                geometry (Range rects), i.e. what the gate has always chosen;
 *   - `seed`   — what @remotion/layout-utils predicts (fitText linear
 *                extrapolation, or the exact solve for fixed-px letter
 *                spacing).
 *
 * Two claims are locked here. (1) Outcome equivalence: the seeded walk picks
 * the SAME size as the old ladder — the seed may reorder the probes, never the
 * answer. (2) Prediction accuracy: the seed sits within one ladder step of the
 * truth, so the walk converges in a probe or two. Claim (2) is the drift guard
 * — if a layout-utils upgrade changes the extrapolation, this file goes red.
 *
 * The numbers leave the browser through the cancelRender payload: `remotion
 * still` forwards stdout but not page console.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REMOTION_DIR = resolve(__dirname, "..", "remotion");
const ENTRY = "src/text-gate-fixture.tsx";
const COMPOSITION = "TextGateFixture";
const LADDER_STEP = 2;

/**
 * Run one probe still. The probe always cancels the render (that is how it
 * smuggles the measurement out), so a "passing" render is a failed probe:
 * `ok === true` means the payload never arrived.
 */
function runProbe(spec) {
  const out = join(mkdtempSync(join(tmpdir(), "t12-probe-")), "still.png");
  try {
    execFileSync(
      "npx",
      [
        "remotion",
        "still",
        ENTRY,
        COMPOSITION,
        out,
        "--props",
        JSON.stringify({ scenario: "official-seed-probe", probe: spec }),
      ],
      { cwd: REMOTION_DIR, stdio: "pipe", timeout: 240_000 },
    );
    return { ok: true, payload: null, raw: "" };
  } catch (err) {
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    const match = /\[OfficialFitProbe\] (\{.*\})/.exec(text);
    return { ok: false, payload: match ? JSON.parse(match[1]) : null, raw: text };
  }
}

/** Fetch a probe payload, failing loudly when the probe never reported. */
function probe(spec) {
  const { payload, raw } = runProbe(spec);
  expect(payload, `probe payload missing. raw: ${raw.slice(-2000)}`).toBeTruthy();
  return payload;
}

describe(
  "official layout-utils fit seed (real Chromium via remotion still)",
  { timeout: 300_000 },
  () => {
    it("Times 900 uppercase: prediction lands within one ladder step of the truth", () => {
      // Decision 57: measure the official linear extrapolation instead of
      // assuming it. Times 900 uppercase is the brand's headline treatment.
      const p = probe({
        text: "QWEN3 RELEASED",
        boxWidth: 756,
        preferredSize: 56,
        minSize: 40,
      });
      expect(p.truth, JSON.stringify(p)).not.toBeNull();
      expect(Math.abs(p.seed - p.truth)).toBeLessThanOrEqual(LADDER_STEP);
    });

    it("seeded walk picks the same size the pre-T12 full ladder chose", () => {
      const p = probe({
        text: "QWEN3 RELEASED",
        boxWidth: 756,
        preferredSize: 56,
        minSize: 40,
      });
      expect(p.seeded, JSON.stringify(p)).toBe(p.truth);
    });

    it("seed costs no more probes than the blind ladder", () => {
      const p = probe({
        text: "QWEN3 RELEASED",
        boxWidth: 756,
        preferredSize: 56,
        minSize: 40,
      });
      expect(p.seededProbes).toBeLessThanOrEqual(p.truthProbes);
    });

    it("fixed-px letterSpacing: the corrected solve matches real geometry", () => {
      // The templates use -10px on the focus numbers. Fixed px spacing does
      // NOT scale with font size, so fitText's pure linear extrapolation
      // overshoots; official-fit.ts routes these through
      // solveSingleLinePxLetterSpacing. This proves the correction.
      const p = probe({
        text: "$1.4B",
        boxWidth: 820,
        preferredSize: 240,
        minSize: 150,
        letterSpacing: "-10px",
      });
      expect(p.truth, JSON.stringify(p)).not.toBeNull();
      expect(Math.abs(p.seed - p.truth)).toBeLessThanOrEqual(LADDER_STEP);
      expect(p.seeded, JSON.stringify(p)).toBe(p.truth);
    });

    it("wrapping copy: fitTextOnNLines seed agrees with the measured truth", () => {
      const p = probe({
        text: "THE WHOLE POINT OF THE ANNOUNCEMENT IS THAT CAPACITY GROWS",
        boxWidth: 600,
        preferredSize: 48,
        minSize: 24,
        wrap: true,
        maxLines: 2,
      });
      expect(p.truth, JSON.stringify(p)).not.toBeNull();
      expect(p.seeded, JSON.stringify(p)).toBe(p.truth);
    });

    it("focus number GLM-6.0: reports the floor the 820px band can actually hold", () => {
      // Evidence for the bigNumber minSize contract (spec decisions 93/270
      // fixed the floor at 180; 7-character focus numbers are the case that
      // broke it). The probe reports the truth rather than pinning a value,
      // so a contract change has to be justified by the printed numbers.
      const p = probe({
        text: "GLM-6.0",
        boxWidth: 820,
        preferredSize: 240,
        minSize: 150,
        letterSpacing: "-10px",
      });
      console.log("[T12 probe] GLM-6.0 @820:", JSON.stringify(p));
      expect(p.seeded, JSON.stringify(p)).toBe(p.truth);
    });
  },
);
