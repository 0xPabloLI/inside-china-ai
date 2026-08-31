/**
 * Render-layer integration tests for the TextGate (T4).
 *
 * Vitest runs in a node environment with no access to the remotion workspace's
 * node_modules, so these tests drive the real render runtime the way the
 * pipeline does: `npx remotion still` against a dedicated fixture entry
 * (remotion/src/text-gate-fixture.tsx, its own registerRoot — Root.tsx is
 * never touched). FAIL scenarios assert the TextFitError JSON payload that
 * cancelRender surfaces on the message's first line; PASS scenarios assert a
 * clean exit.
 *
 * Scenario forms (spec refinement decision 36): pass baseline, fixed-size
 * overflow (F1 shape), Fit shrink (F2 shape), minSize floor (F3 shape),
 * annotation drawn-bound overflow (F4 shape), ink-only overflow (F9 runtime
 * shape), font-load timeout (#24/#27).
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

/**
 * Run one still render of the fixture with the given scenario props.
 * Returns { ok, payload } — payload is the parsed TextFitError JSON when the
 * gate cancelled the render, otherwise null. Settled-frame asserts need a
 * frame ≥ settledFrame (40); entrance asserts run at frame 0.
 */
function renderFixture(props, frame = 45) {
  const out = join(mkdtempSync(join(tmpdir(), "t4-gate-")), "still.png");
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
        JSON.stringify(props),
        "--frame",
        String(frame),
      ],
      { cwd: REMOTION_DIR, stdio: "pipe", timeout: 240_000 },
    );
    return { ok: true, payload: null };
  } catch (err) {
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    const match = /\[TextFitError\] (\{.*\})/.exec(text);
    return { ok: false, payload: match ? JSON.parse(match[1]) : null, raw: text };
  }
}

// One bundle + browser startup per still adds up; keep the file patient.
const GATE_TIMEOUT = 300_000;

describe(
  "TextGate render-layer behaviour (real Chromium via remotion still)",
  { timeout: GATE_TIMEOUT },
  () => {
    it("PASS baseline: legal copy fits at preferred size", () => {
      const { ok, raw } = renderFixture({ scenario: "pass" });
      expect(ok, raw).toBe(true);
    });

    it("F1 shape: fixed size bypassing Fit + overflowing copy FAILs (old gate would PASS)", () => {
      const { ok, payload, raw } = renderFixture({ scenario: "fixed-overflow" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("fit-bottom");
      expect(payload.slotId).toBe("narrative.media-overlay.result");
      expect(payload.field).toBe("result");
      expect(payload.fontSize).toBe(56);
      expect(payload.measured.width).toBeGreaterThan(payload.available.width);
    });

    it("F2 shape: same copy with Fit enabled shrinks to fit and renders", () => {
      const { ok, raw } = renderFixture({ scenario: "fit-shrink" });
      expect(ok, raw).toBe(true);
    });

    it("F3 shape: copy too long even at minSize FAILs with structured error, no ×0.9 escape", () => {
      const { ok, payload, raw } = renderFixture({ scenario: "floor-fail" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("fit-bottom");
      expect(payload.fontSize).toBe(40); // the hard floor of the result field
    });

    it("F4 shape: annotation drawn bounds beyond the slot content box FAILs", () => {
      const { ok, payload, raw } = renderFixture({ scenario: "annotation-overhang" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("annotation-out-of-slot");
    });

    it("ink-only overflow: layout metrics pass but glyph ink extends outside → FAIL", () => {
      const { ok, payload, raw } = renderFixture({ scenario: "ink-overhang" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("fit-bottom");
      // Ink is what trips it: the layout box itself fit.
      const inkTotal =
        payload.inkPad.left + payload.inkPad.right + payload.inkPad.top + payload.inkPad.bottom;
      expect(inkTotal).toBeGreaterThan(0);
    });

    it("font timeout: fonts never ready → FAIL with reason font-timeout (no silent fallback)", () => {
      const { ok, payload, raw } = renderFixture({ scenario: "font-timeout" });
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("font-timeout");
    });

    it("entrance window: 2× start scale at frame 0 breaches SAFE_ZONES → FAIL", () => {
      const { ok, payload, raw } = renderFixture({ scenario: "entrance-breach" }, 0);
      expect(ok, raw).toBe(false);
      expect(payload, raw).toBeTruthy();
      expect(payload.reason).toBe("safe-zone-breach");
    });
  },
);
