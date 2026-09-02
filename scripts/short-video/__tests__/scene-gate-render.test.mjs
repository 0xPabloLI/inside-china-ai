/**
 * Render-layer integration tests for the gated scene templates (T5).
 *
 * Same driver pattern as text-gate-render.test.mjs (T4): vitest has no access
 * to the remotion workspace's node_modules, so the real render runtime is
 * driven through `npx remotion still` against the dedicated fixture entry
 * (remotion/src/scene-gate-fixture.tsx, own registerRoot — Root.tsx is never
 * touched). FAIL scenarios assert the TextFitError JSON payload that
 * cancelRender surfaces on the message's first line; dispatch errors (unknown
 * field / unknown visualType) surface as plain render failures.
 *
 * Scenario mapping (spec scenario matrix): baselines #35 (+ F2 #30 via
 * baseline-narrative), f1-lock56 #29, f3-floor #31, unknown-field #32,
 * unknown-visualtype #37, empty-fields #34, indexed slots #36 (hook stats,
 * contrast chips, info-card points inside the baselines).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REMOTION_DIR = resolve(__dirname, "..", "remotion");
const ENTRY = "src/scene-gate-fixture.tsx";
const COMPOSITION = "SceneGateFixture";

/**
 * Run one still render of the fixture with the given scenario. Returns
 * { ok, payload, raw } — payload is the parsed TextFitError JSON when the
 * gate cancelled the render, otherwise null. Frame 45 ≥ settledFrame (40).
 */
function renderScenario(scenario, frame = 45) {
  const out = join(mkdtempSync(join(tmpdir(), "t5-scene-")), "still.png");
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
        JSON.stringify({ scenario }),
        "--frame",
        String(frame),
      ],
      { cwd: REMOTION_DIR, stdio: "pipe", timeout: 240_000 },
    );
    return { ok: true, payload: null, raw: "" };
  } catch (err) {
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    const match = /\[TextFitError\] (\{.*\})/.exec(text);
    return { ok: false, payload: match ? JSON.parse(match[1]) : null, raw: text };
  }
}

// One bundle + browser startup per still adds up; keep the file patient.
const GATE_TIMEOUT = 300_000;

const BASELINES = [
  "baseline-hook",
  "baseline-narrative",
  "baseline-narrative-stacked",
  "baseline-stat-reveal",
  "baseline-cta",
  "baseline-quote",
  "baseline-context",
  "baseline-contrast",
  "baseline-data",
  "baseline-info-card",
  "baseline-fullscreen",
];

// baseline-quote renders after the verified badge's StampIn settles (delay
// 1.8s + 0.4s = frame 66; that gate declares settledFrame={66}), so its
// settled asserts actually run. baseline-narrative-stacked gives one frame
// of margin over its source label's SlideUp (delay 1.0s + 0.5s = frame 45).
const BASELINE_FRAMES = { "baseline-quote": 75, "baseline-narrative-stacked": 48 };

describe(
  "Gated scene templates (real Chromium via remotion still)",
  { timeout: GATE_TIMEOUT },
  () => {
    it.each(BASELINES)("%s: legal copy at contract sizes PASSes", (scenario) => {
      const { ok, raw } = renderScenario(scenario, BASELINE_FRAMES[scenario] ?? 45);
      expect(ok, raw).toBe(true);
    });

    it("F1 (#29): original s9 copy locked at 56px FAILs (the incident the gate exists for)", () => {
      const { ok, payload, raw } = renderScenario("f1-lock56");
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("fit-bottom");
      expect(payload.slotId).toBe("narrative.media-overlay.result");
      expect(payload.field).toBe("result");
      expect(payload.fontSize).toBe(56);
      expect(payload.measured.width).toBeGreaterThan(payload.available.width);
    });

    it("F3 (#31): over-long copy FAILs at the 40px floor with a structured error", () => {
      const { ok, payload, raw } = renderScenario("f3-floor");
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      // The highlight forces nowrap, so the single line stays wider than the
      // 692px slot at every candidate: the ladder exhausts itself and Fit
      // fails structured at the 40px floor. (The wrapping variant failing on
      // a fixed-height container is covered by the T4 suite's
      // container-overflow test.)
      expect(payload.reason).toBe("fit-bottom");
      expect(payload.slotId).toBe("narrative.media-overlay.result");
      expect(payload.fontSize).toBe(40); // hard floor of the result field
    });

    it("#32: a typo'd texts key fails the render with the field name", () => {
      const { ok, raw } = renderScenario("unknown-field");
      expect(ok).toBe(false);
      expect(raw).toMatch(/Unknown text field "compny"/);
    });

    it("T9 rendered contract: a scene missing a rendered field fails validation", () => {
      const { ok, raw } = renderScenario("missing-rendered");
      expect(ok).toBe(false);
      expect(raw).toMatch(/Rendered text field\(s\) "company" missing/);
    });

    it("#37: an unknown visualType throws at dispatch (no silent narrative fallback)", () => {
      const { ok, raw } = renderScenario("unknown-visualtype");
      expect(ok).toBe(false);
      expect(raw).toMatch(/Unknown visualType "mystery"/);
    });

    it("#34: empty strings/arrays render nothing and do not false-positive", () => {
      const { ok, raw } = renderScenario("empty-fields");
      expect(ok, raw).toBe(true);
    });

    it("entrance window: StampIn mid-shrink frames never false-positive a safe-zone breach", () => {
      // Regression from the _gate-smoke pipeline run: the hook badge stamps in
      // 2→1 (frames 6-18); while the scale sits between 1 and 1.5 the drawn
      // box legitimately exceeds the safe band. The entrance assert polices
      // transform-free LAYOUT boxes (rest geometry), and the settled asserts
      // from settledFrame on police the same thing on drawn rects.
      for (const frame of [12, 14, 16]) {
        const { ok, payload, raw } = renderScenario("baseline-hook", frame);
        expect(ok, raw).toBe(true);
        expect(payload).toBeNull();
      }
      // Same class, harsher shape: stat-reveal's bigNumber gate fills the
      // 820px safe band at rest, so even the s∈(1, 1.01] shrink tail
      // overshoots the band by more than EPS. Rest-position policing keeps
      // these frames green (pipeline regression: stat-reveal-4 "51B").
      for (const frame of [10, 14, 18, 22]) {
        const { ok, payload, raw } = renderScenario("baseline-stat-reveal", frame);
        expect(ok, raw).toBe(true);
        expect(payload).toBeNull();
      }
      // Same class, late entrance: quote's verified badge stamps in at frames
      // 54-66 (delay 1.8s), well past the default settledFrame — the default
      // frame-45 baselines never see it. The badge decoration lives inside
      // the 820px gate (pipeline regression quote-7: reverse nesting shifted
      // the gate's layout box 30px right out of the safe band).
      for (const frame of [56, 60, 64]) {
        const { ok, payload, raw } = renderScenario("baseline-quote", frame);
        expect(ok, raw).toBe(true);
        expect(payload).toBeNull();
      }
    });

    it("scene transitions: slide-in overlap frames never false-positive a safe-zone breach", () => {
      // Regression from the _gate-smoke pipeline run: hook → narrative slides
      // from the right over 10 frames; while the scene is in flight its gates
      // sit outside the safe band by design (scene-local frame 7 measured at
      // x=384, rest x=60). The entrance assert polices transform-free layout
      // boxes, so scene-level transition transforms are invisible to it and
      // the gate's own rest-position breaches are still caught. Sweep covers
      // overlap + badge FadeIn onset.
      for (const frame of [24, 25, 26, 27, 30, 34]) {
        const { ok, payload, raw } = renderScenario("transition-slide", frame);
        expect(ok, raw).toBe(true);
        expect(payload).toBeNull();
      }
    });
  },
);
