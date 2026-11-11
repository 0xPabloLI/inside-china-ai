import { describe, expect, it } from "vitest";
import {
  HOOK_SAMPLE_TIMES_SEC,
  analyzeHookFrame,
  buildHookClaim,
  evaluateHookPayoff,
  formatHookPayoffReport,
} from "../lib/hook-payoff.mjs";

/** Tiny canvas with no safe-zone insets — the classifier only reads pixels. */
const CANVAS = { width: 108, height: 192 };
const NO_INSET = { top: 0, right: 0, bottom: 0, left: 0 };

function buffer(fill) {
  const data = new Uint8Array(CANVAS.width * CANVAS.height * 4);
  for (let y = 0; y < CANVAS.height; y++) {
    for (let x = 0; x < CANVAS.width; x++) {
      const idx = (CANVAS.width * y + x) * 4;
      const lum = fill(x, y);
      data[idx] = lum;
      data[idx + 1] = lum;
      data[idx + 2] = lum;
      data[idx + 3] = 255;
    }
  }
  return { data, ...CANVAS };
}

const BLACK = () => buffer(() => 0);
const FLAT = () => buffer(() => 13); // #0a0a14 canvas background
/** Type over the background: a white block on ~6% of the band. */
const CARD = () => buffer((x, y) => (x < 20 && y > 60 && y < 120 ? 255 : 13));
/** Footage: textured, ink everywhere. */
const PICTURE = () => buffer((x, y) => (y % 2 === 0 ? 70 : 150));

/** The hook shape from content/unitree-h2x-guardian/scene-data.mjs. */
const HOOK_SCENE = {
  id: 1,
  visualType: "hook",
  media: { type: "video", fit: "contain", videoStartOffsetMs: 2500 },
  voiceover: "Unitree's new guard robot lifts a car. 8 hours standing.",
  texts: { hookText: "IT LIFTS A CAR.", revealText: "STANDS 8 HOURS" },
};

describe("analyzeHookFrame", () => {
  it("reads an all-black band as black", () => {
    expect(analyzeHookFrame(BLACK(), NO_INSET).kind).toBe("black");
  });

  it("reads the brand background as flat, not as a card", () => {
    expect(analyzeHookFrame(FLAT(), NO_INSET).kind).toBe("flat");
  });

  it("reads type over the background as a card", () => {
    const { kind, metrics } = analyzeHookFrame(CARD(), NO_INSET);
    expect(kind).toBe("card");
    // The measurement is what separates a card from footage, so assert it.
    expect(metrics.inkCoverage).toBeLessThan(0.35);
    expect(metrics.brightRatio).toBeGreaterThan(0.005);
  });

  it("reads a textured band as picture", () => {
    const { kind, metrics } = analyzeHookFrame(PICTURE(), NO_INSET);
    expect(kind).toBe("picture");
    expect(metrics.inkCoverage).toBeGreaterThan(0.9);
  });

  it("samples only the content band", () => {
    // A bright right rail (x > width - 200) must not turn a flat hook into a card.
    const railOnly = buffer((x, y) => (x > CANVAS.width - 30 && y > 20 && y < 80 ? 255 : 13));
    const zone = { top: 0, right: 30, bottom: 0, left: 0 };
    expect(analyzeHookFrame(railOnly, zone).kind).toBe("flat");
  });
});

describe("buildHookClaim", () => {
  it("prefers the printed claim and keeps the voiceover", () => {
    const claim = buildHookClaim(HOOK_SCENE);
    expect(claim.promise).toBe("IT LIFTS A CAR. STANDS 8 HOURS.");
    expect(claim.assetNeed).toBe(claim.promise);
    expect(claim.voiceover).toContain("lifts a car");
    expect(claim.isEmpty).toBe(false);
  });

  it("falls back to the voiceover when the hook prints no claim", () => {
    const claim = buildHookClaim({ visualType: "hook", voiceover: "A robot lifts a car." });
    expect(claim.promise).toBe("A robot lifts a car.");
    expect(claim.hookText).toBe("");
  });

  it("reads a number-led hook's promise from bigNumber + numberLabel", () => {
    const claim = buildHookClaim({
      visualType: "hook",
      voiceover: "Nine of eleven.",
      texts: { bigNumber: "9 / 11", numberLabel: "BENCHMARKS WON" },
    });
    expect(claim.promise).toBe("9 / 11 BENCHMARKS WON");
  });

  it("reports an empty claim instead of inventing one", () => {
    const claim = buildHookClaim({ visualType: "hook" });
    expect(claim.isEmpty).toBe(true);
    expect(claim.promise).toBe("");
  });
});

function samples(...kinds) {
  return HOOK_SAMPLE_TIMES_SEC.map((t, index) => ({ t, kind: kinds[index] }));
}

describe("evaluateHookPayoff", () => {
  it("passes a hook that opens on footage which depicts its claim", () => {
    const result = evaluateHookPayoff({
      samples: samples("picture", "picture", "picture", "picture"),
      claim: buildHookClaim(HOOK_SCENE),
      semantics: { payoff: "pass", payoffReason: "the car's front wheel is off the ground" },
    });
    expect(result.level).toBe("pass");
    expect(result.checks.every((c) => c.level === "pass")).toBe(true);
  });

  it("treats the 0.5s card as the renderer fade-in, not as copy holding the frame", () => {
    const result = evaluateHookPayoff({
      samples: samples("card", "picture", "picture", "picture"),
      claim: buildHookClaim(HOOK_SCENE),
    });
    // Both the good and the bad real render share this signature, so it must
    // not warn — the discriminator is the semantic check, not frame 0.
    expect(result.level).toBe("pass");
    const check = result.checks.find((c) => c.check === "Hook opens on footage");
    expect(check.level).toBe("pass");
    expect(check.detail).toContain("fade-in beat");
    expect(check.detail).toContain("from 0.5s");
  });

  it("warns when copy holds the frame past the fade-in beat", () => {
    const result = evaluateHookPayoff({
      samples: samples("card", "card", "picture", "picture"),
      claim: buildHookClaim(HOOK_SCENE),
    });
    const check = result.checks.find((c) => c.check === "Hook opens on footage");
    expect(check.level).toBe("warn");
    expect(check.detail).toContain("first appears at 1s");
  });

  it("warns (not fails) by default when the hook never shows footage", () => {
    const result = evaluateHookPayoff({
      samples: samples("card", "card", "card", "card"),
      claim: buildHookClaim(HOOK_SCENE),
    });
    expect(result.level).toBe("warn");
    expect(result.checks.find((c) => c.check === "Hook shows footage").level).toBe("warn");
  });

  it("fails the no-footage hook under --strict", () => {
    const result = evaluateHookPayoff({
      samples: samples("card", "card", "card", "card"),
      claim: buildHookClaim(HOOK_SCENE),
      strict: true,
    });
    expect(result.level).toBe("fail");
    expect(result.strict).toBe(true);
  });

  it("treats partial as a weakness, not a pass", () => {
    const result = evaluateHookPayoff({
      samples: samples("picture", "picture", "picture", "picture"),
      claim: buildHookClaim(HOOK_SCENE),
      semantics: {
        payoff: "partial",
        payoffReason: "the car is on screen but still on the ground",
      },
    });
    expect(result.level).toBe("warn");
    expect(
      result.checks.find((c) => c.check === "Hook picture matches the claim").detail,
    ).toContain("partly shown");
  });

  it("names the 2026-10-25 defect: footage present, claim not depicted", () => {
    const result = evaluateHookPayoff({
      samples: samples("card", "picture", "picture", "picture"),
      claim: buildHookClaim(HOOK_SCENE),
      semantics: { payoff: "absent", payoffReason: "a robot walks in a night villa; no car" },
    });
    expect(result.level).toBe("warn");
    const check = result.checks.find((c) => c.check === "Hook picture matches the claim");
    expect(check.detail).toContain("does not show the promised payoff");
    expect(check.detail).toContain("no car");
  });

  it("fails the mismatch under --strict", () => {
    const result = evaluateHookPayoff({
      samples: samples("picture", "picture", "picture", "picture"),
      claim: buildHookClaim(HOOK_SCENE),
      semantics: { payoff: "absent", payoffReason: "no car leaves the ground" },
      strict: true,
    });
    expect(result.level).toBe("fail");
  });

  it("treats an unavailable verdict as a tool outcome, not a content verdict", () => {
    const result = evaluateHookPayoff({
      samples: samples("picture", "picture", "picture", "picture"),
      claim: buildHookClaim(HOOK_SCENE),
      semantics: { payoff: null, payoffReason: null },
    });
    expect(result.level).toBe("warn");
    expect(
      result.checks.find((c) => c.check === "Hook picture matches the claim").detail,
    ).toContain("unavailable");
  });

  it("does not run a semantic check that was not requested", () => {
    const result = evaluateHookPayoff({
      samples: samples("picture", "picture", "picture", "picture"),
      claim: buildHookClaim(HOOK_SCENE),
      semantics: null,
    });
    expect(result.checks.some((c) => c.check === "Hook picture matches the claim")).toBe(false);
  });

  it("reports missing frames instead of assuming them", () => {
    const result = evaluateHookPayoff({ samples: [], claim: buildHookClaim(HOOK_SCENE) });
    expect(result.level).toBe("warn");
    expect(result.checks[0].check).toBe("Hook frames extracted");
  });

  it("warns when there is no claim to check the picture against", () => {
    const result = evaluateHookPayoff({
      samples: samples("picture", "picture", "picture", "picture"),
      claim: null,
    });
    expect(result.level).toBe("warn");
    expect(result.checks.find((c) => c.check === "Hook claim readable").level).toBe("warn");
  });
});

describe("formatHookPayoffReport", () => {
  it("prints the mode and a fix line for hard findings", () => {
    const result = evaluateHookPayoff({
      samples: samples("card", "card", "card", "card"),
      claim: buildHookClaim(HOOK_SCENE),
      strict: true,
    });
    const text = formatHookPayoffReport(result);
    expect(text).toContain("Hook payoff: FAIL — strict");
    expect(text).toContain("→ FIX:");
  });
});
