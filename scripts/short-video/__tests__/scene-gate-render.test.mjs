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
import { CANVAS, SAFE_ZONES } from "../lib/safe-zones.mjs";
import { HOOK_SUBJECT_ROW, hookSubjectTextWidth, SLOT_FIELDS } from "../lib/text-slots.mjs";

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

// #576: the claim-led focal shapes the reveal line-height fix must keep green.
// Short (one line at the preferred 80px), long (wrapping claim + wrapping
// reveal) and the #573 logo-row combination, plus the entrance-window sweep
// below. All of them cancelled the render before the fix.
const CLAIM_REVEAL_SCENARIOS = [
  "baseline-hook-claim-reveal",
  "baseline-hook-claim-reveal-long",
  "baseline-hook-claim-reveal-short",
  "baseline-hook-logo-claim-reveal",
];

const BASELINES = [
  "baseline-hook",
  "hook-source-descender",
  // #422: the logo row. `texts.subjectLogo` puts a 96px logo in the SAME flex
  // row as the subject gate; before the fix the row measured 96+24+820 = 940
  // against the 820 band, so the gate was pushed out of the safe zone and the
  // render was cancelled (entrance frame: safe-zone-breach; settled frame:
  // container-overflow). Claim-led, number-led, wrapped long name and
  // logo-only are all covered — every one of them failed before.
  "baseline-hook-logo-row",
  "baseline-hook-logo-long",
  "baseline-hook-logo-claim",
  "baseline-hook-logo-only",
  // #576: claim-led focal WITH `revealText`. Before the fix, revealText's
  // lineHeight 1.05 sat below the font's natural ~1.107em leading, so EVERY
  // candidate size failed Fit (the inline rect pokes above the gate box) —
  // the ladder bottomed out at the 56px floor and cancelled the render. All
  // four shapes failed before the fix, all pass after. Number-led hooks are
  // untouched by construction: the reveal only renders in the claim branch,
  // and scene-rules rejects a scene that sets both focals.
  ...CLAIM_REVEAL_SCENARIOS,
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

    it("F3 (#31): over-long copy FAILs at the result floor with a structured error", () => {
      const { ok, payload, raw } = renderScenario("f3-floor");
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      // The highlight forces nowrap, so the single line stays wider than the
      // 692px slot at every candidate: the ladder exhausts itself and Fit
      // fails structured at the result field's hard floor. (The wrapping
      // variant failing on a fixed-height container is covered by the T4
      // suite's container-overflow test.)
      expect(payload.reason).toBe("fit-bottom");
      expect(payload.slotId).toBe("narrative.media-overlay.result");
      // #688 raised the result floor 40 -> 46 (preferred 56 -> 64, floor
      // round(0.72 x preferred)). Read it from the contract so the next size
      // change cannot leave this assertion silently pinning a stale value.
      expect(payload.fontSize).toBe(SLOT_FIELDS.result.minSize);
    });

    it("T10 F6: s5 copy in media-split locked at the shipped 52px FAILs (the clipped-text incident)", () => {
      // qwen4-preview s5's original copy ("1/9 THE TRAINING COST", highlight
      // nowrap) in the media-split column it shipped in. The old world
      // clipped it at 52px; the gate asserts instead — one nowrap line of
      // ~620px against the 372px column.
      const { ok, payload, raw } = renderScenario("f6-media-split-lock52");
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("fit-bottom");
      expect(payload.slotId).toBe("narrative.media-split.result");
      expect(payload.field).toBe("result");
      expect(payload.fontSize).toBe(52);
      expect(payload.measured.width).toBeGreaterThan(payload.available.width);
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

    it("T8: a highlight fragment that is not a substring of its field fails validation", () => {
      const { ok, raw } = renderScenario("bad-highlight");
      expect(ok, raw).toBe(false);
      expect(raw).toMatch(/not a substring of texts\.result/);
    });

    it("T9 group gate: band over its height budget shrinks low-priority fields down its order", () => {
      // The probe cancels the render with the measurement payload once every
      // gate (and group approval) has settled; measuredGroupFits carries each
      // band's final font sizes. The budget override (200) sits between the
      // #688 floors' height (~146: source 29 + context 35 on one line each +
      // result 40) and the initial content height (~298: T8's partial-fragment
      // highlight no longer forces the result line nowrap, so width Fit accepts
      // 56 on two lines and context starts at its preferred 48 on two), so the
      // walk must exhaust source (priority 5, floor 29) and context (10, floor
      // 35) and then step result 56 → 54 → 52 → 50, where the copy collapses
      // to ONE line and the band settles at 187 ≤ 200 — the walk never steps a
      // field below what the band needs.
      const { ok, payload, raw } = renderScenario("group-shrink-measure");
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("measurement");
      const fit = payload.measuredGroupFits["narrative.media-overlay.bottom-band"];
      expect(fit, raw).toBeTruthy();
      expect(fit.shrunk).toBe(true);
      expect(fit.sizes["narrative.media-overlay.source"]).toBe(29); // minSize
      expect(fit.sizes["narrative.media-overlay.context"]).toBe(35); // minSize
      expect(fit.sizes["narrative.media-overlay.result"]).toBe(50);
      expect(fit.contentHeight).toBe(187);
      expect(fit.contentHeight).toBeLessThanOrEqual(fit.maxHeight + 0.5);
    });

    it("T9 group gate: copy that cannot fit even at the floors fails structured (group-overflow)", () => {
      const { ok, payload, raw } = renderScenario("group-overflow-fail");
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("group-overflow");
      expect(payload.slotId).toBe("narrative.media-overlay.bottom-band");
      expect(payload.measured.height).toBeGreaterThan(payload.available.height);
      // The walk must have exhausted the order down to the floors before
      // failing. First-insertion order of the last-step map IS the shrink
      // order (source 5 → context 10 → result 40); result's final step must
      // be its hard floor.
      const lastStepByField = {};
      for (const s of payload.steps) lastStepByField[s.slotId.split(".").pop()] = s.fontSize;
      expect(Object.keys(lastStepByField)).toEqual(["source", "context", "result"]);
      expect(lastStepByField.result).toBe(SLOT_FIELDS.result.minSize);
    });

    it("T10 F7: hook circle vs subject / numberLabel — per-target ratios recorded, each ≤ 2%", () => {
      // decision 7: subject and numberLabel are SEPARATE denominators (never
      // merged), and the annotated number itself is not a target. The probe
      // surfaces the ratios the scene-level assert measured on the settled
      // frame; with the T10 box="inside" circle both must be ≤ the 2% gate.
      // This pins the actual numbers the ticket asks to record.
      const { ok, payload, raw } = renderScenario("measure:hook");
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("measurement");
      const collision = payload.measuredCollisionRatios["hook.hero-center.bigNumber"];
      expect(collision, raw).toBeTruthy();
      expect(Object.keys(collision.ratios).sort()).toEqual([
        "hook.hero-center.numberLabel",
        "hook.hero-center.subject",
      ]);
      for (const ratio of Object.values(collision.ratios)) {
        expect(ratio).toBeLessThanOrEqual(0.02);
      }
    });

    it("#422: the hook logo row measures inside the band — row, logo, gate and ink", () => {
      // The failure the ticket reported was the ROW, not the gate: logo(96) +
      // gap(24) + a gate still claiming the full band(820) = 940, centred in
      // an 820 band, so the logo and the gate hung 60px past each edge. The
      // probe reads all four boxes on a real settled render — proving the
      // logo, the text and the row itself never reach the TikTok rail.
      const { ok, payload, raw } = renderScenario("measure:hook-logo-row");
      // The measurement harness rides out on a cancelRender payload.
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("measurement");
      const bandLeft = SAFE_ZONES.left;
      const bandRight = CANVAS.width - SAFE_ZONES.right;
      const row = payload.measuredBoxes?.["subject-row"];
      const logo = payload.measuredBoxes?.["subject-logo"];
      const gate = payload.measuredGates?.["hook.hero-center.subject"];
      const ink = payload.measuredInk?.["hook.hero-center.subject"];
      for (const [name, box] of Object.entries({ row, logo, gate, ink })) {
        expect(box, `${name} missing from the probe payload: ${raw}`).toBeTruthy();
        expect(box.left, `${name} left`).toBeGreaterThanOrEqual(bandLeft);
        expect(box.right, `${name} right`).toBeLessThanOrEqual(bandRight);
      }
      expect(row.width).toBe(bandRight - bandLeft);
      expect(logo.width).toBe(HOOK_SUBJECT_ROW.logoSize);
      // The gate renders the RESERVED width, not the band — that subtraction
      // is the whole fix.
      expect(gate.width).toBe(hookSubjectTextWidth({ hasLogo: true }));
      // Ink fits the gate: the name has room and is not clipped.
      expect(ink.width).toBeLessThanOrEqual(gate.width);
    });

    it("#422 entrance window: the logo row never false-positives mid-SlideUp", () => {
      // The ticket's acceptance covers entrance AND settled frames. The row
      // slides in from y+30 between frames 12 and 24; the entrance assert
      // polices transform-free layout boxes, so a resting overflow — which is
      // exactly what the bug was — must still fail here, while the translate
      // itself must not.
      for (const frame of [13, 20, 30]) {
        const { ok, payload, raw } = renderScenario("baseline-hook-logo-row", frame);
        expect(ok, raw).toBe(true);
        expect(payload).toBeNull();
      }
    });

    it("#576: the claim reveal renders at the preferred size — gate box pinned", () => {
      // The fix raises revealText's lineHeight to 1.1, the font's natural
      // leading (measured ~1.107em: at the 56px floor the inline rect was
      // 62px against a 1.05em box). The probe reads the settled geometry:
      // two lines at the preferred 80px × 1.1 = 176px, inside the safe band,
      // ink within the gate. A re-tightened line-height fails Fit before the
      // probe can run; any change to the constant moves this box and must
      // update this pin.
      const { ok, payload, raw } = renderScenario("measure:hook-claim-reveal");
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("measurement");
      const gate = payload.measuredGates?.["hook.hero-center.revealText"];
      const ink = payload.measuredInk?.["hook.hero-center.revealText"];
      expect(gate, raw).toBeTruthy();
      expect(gate.bottom - gate.top).toBe(176); // 2 lines × 1.1 × 80
      expect(gate.left).toBeGreaterThanOrEqual(SAFE_ZONES.left);
      expect(gate.right).toBeLessThanOrEqual(CANVAS.width - SAFE_ZONES.right);
      expect(ink, raw).toBeTruthy();
      expect(ink.width).toBeLessThanOrEqual(gate.width);
    });

    it("#576 entrance window: claim-led reveal never false-positives mid-entrance", () => {
      // revealText stamps in at delay 0.8s (frames 24-39); the ticket's
      // acceptance covers entrance AND settled frames. The entrance assert
      // polices transform-free layout boxes, so the StampIn shrink must not
      // trip it — while the resting defect (an inline rect taller than the
      // gate box at every size) would have failed every one of these frames
      // before the fix.
      for (const scenario of CLAIM_REVEAL_SCENARIOS) {
        for (const frame of [13, 20, 30]) {
          const { ok, payload, raw } = renderScenario(scenario, frame);
          expect(ok, `${scenario} @ frame ${frame}: ${raw}`).toBe(true);
          expect(payload).toBeNull();
        }
      }
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
