// Avatar declaration contract tests (#214 ticket 01).
// Accept/reject matrix for the optional scene.avatar foreground layer.
// Zero-impact guarantee: packages without avatar produce byte-identical
// aggregate results; declared packages get pass/warn entries instead.

import { describe, it, expect } from "vitest";
import { checkAvatarContract, runAllSceneDataChecks } from "../lib/scene-rules.mjs";
import { scenes as qwenScenes } from "../content/qwen4-preview/scene-data.mjs";
import {
  validAvatarScene,
  generatedAvatarScene,
  unknownFieldScene,
  badPresentScene,
} from "../content/_test-fixtures/avatar-declarations/scene-data.mjs";

const seriesMeta = { seriesId: "restraint", partNumber: 1, totalParts: 3 };

// Minimal CTA scene builder for matrix cases not covered by the fixtures
const ctaScene = (avatar, voiceover) => ({
  id: 6,
  name: "cta",
  visualType: "cta",
  voiceover: voiceover ?? "Follow for more China AI news that matters.",
  texts: {
    brand: "CHINA AI NEWS",
    tagline: "DAILY CHINA AI BRIEFING",
    action: "FOLLOW FOR MORE",
  },
  ...(avatar === undefined ? {} : { avatar }),
});

describe("checkAvatarContract — zero impact (no avatar)", () => {
  it("returns [] when no scene declares avatar", () => {
    expect(checkAvatarContract(qwenScenes)).toEqual([]);
  });

  it("aggregate results for existing packages are unchanged (qwen4-preview baseline)", () => {
    const before = runAllSceneDataChecks(qwenScenes, seriesMeta);
    expect(before.fail).toEqual([]);
    // Baseline counts — any unrelated check drift (added/removed check) breaks
    // these and forces a conscious update, keeping the avatar zero-impact
    // guarantee meaningful against future changes.
    // #166 layer 2: warn went 5 → 3 — the two NEGATIVE-coverage warns on
    // scenes 5/6 are gone because the constants are code-injected now.
    expect(before.pass).toHaveLength(47);
    expect(before.warn).toHaveLength(3);
    expect(before.pass.map((r) => r.check)).toContain("Template contract (REMOTION_SLOT_MAP)");
  });
});

describe("checkAvatarContract — accept matrix", () => {
  it("fixture: declaration state {} passes through the full aggregate chain", () => {
    const { pass, warn, fail } = runAllSceneDataChecks([validAvatarScene], seriesMeta);
    // Single-scene package triggers unrelated package-level fails — scope
    // assertions to the avatar contract itself
    expect(fail.filter((r) => r.check.startsWith("Avatar"))).toEqual([]);
    expect(pass.some((r) => r.check === "Avatar declaration contract")).toBe(true);
    expect(warn.some((r) => r.check === "Avatar pending generation")).toBe(true);
  });

  it("fixture: generated state (videoPath) has no pending warn", () => {
    const results = checkAvatarContract([generatedAvatarScene]);
    expect(results.filter((r) => r.level === "fail")).toEqual([]);
    expect(results.filter((r) => r.level === "warn")).toEqual([]);
    expect(results.some((r) => r.level === "pass" && r.detail.includes("videoPath"))).toBe(true);
  });

  it("accepts full valid declaration (position + scale) through the full aggregate chain", () => {
    const { pass, warn, fail } = runAllSceneDataChecks(
      [ctaScene({ videoPath: "assets/avatar/cta.mp4", position: "right-card", scale: 1 })],
      seriesMeta,
    );
    expect(fail.filter((r) => r.check.startsWith("Avatar"))).toEqual([]);
    expect(warn.some((r) => r.check === "Avatar pending generation")).toBe(false);
    expect(pass.some((r) => r.check === "Avatar declaration contract")).toBe(true);
  });

  it("accepts valid present intervals within estimated scene duration", () => {
    // 10-word VO → ~4.0s at 2.5wps → to=3 is inside
    const scene = ctaScene({ present: [{ from: 0, to: 3 }] });
    scene.voiceover = "Follow for more China AI news that matters today ok";
    const results = checkAvatarContract([scene]);
    expect(results.filter((r) => r.level === "fail")).toEqual([]);
    expect(results.some((r) => r.level === "pass")).toBe(true);
  });

  it("accepts out-of-order non-overlapping present intervals", () => {
    // Declaration order is author's choice — overlap is order-independent
    const scene = ctaScene({ present: [{ from: 2, to: 3 }, { from: 0, to: 1 }] });
    scene.voiceover = "Follow for more China AI news that matters today ok";
    const results = checkAvatarContract([scene]);
    expect(results.filter((r) => r.level === "fail")).toEqual([]);
  });

  it("empty voiceover with present intervals fails closed (duration unknowable pre-TTS)", () => {
    const results = checkAvatarContract([ctaScene({ present: [{ from: 0, to: 1 }] }, "")]);
    expect(results.filter((r) => r.level === "fail")).toHaveLength(1);
  });

  it("aggregate wiring: adding avatar:{} to a real package only adds contract pass + pending warn", () => {
    const before = runAllSceneDataChecks(qwenScenes, seriesMeta);
    const cta = qwenScenes.find((s) => s.visualType === "cta");
    const after = runAllSceneDataChecks(
      qwenScenes.map((s) => (s === cta ? { ...s, avatar: {} } : s)),
      seriesMeta,
    );
    expect(after.fail).toEqual(before.fail);
    expect(after.pass).toHaveLength(before.pass.length + 1);
    expect(after.warn).toHaveLength(before.warn.length + 1);
  });
});

describe("checkAvatarContract — reject matrix (fail-closed)", () => {
  const expectFail = (avatar, detailPart) => {
    const results = checkAvatarContract([ctaScene(avatar)]);
    const fails = results.filter((r) => r.level === "fail");
    expect(fails.length).toBeGreaterThanOrEqual(1);
    expect(fails.every((r) => r.check === "Avatar declaration contract")).toBe(true);
    if (detailPart) expect(fails[0].detail).toContain(detailPart);
    return fails;
  };

  it("fixture: unknown avatar fields (typo fail-closed)", () => {
    expectFail(unknownFieldScene.avatar, "unknown avatar field(s): vedioPath");
    expectFail({ foo: 1 }, "unknown avatar field(s): foo");
  });

  it("fixture: malformed present (from >= to)", () => {
    expectFail(badPresentScene.avatar, "from=3 >= to=3");
  });

  it("rejects non-object avatar (null / array / string)", () => {
    expectFail(null, "must be an object");
    expectFail([], "must be an object");
    expectFail("assets/a.mp4", "must be an object");
  });

  it("rejects invalid position values", () => {
    expectFail({ position: "bottom-left" }, 'position="bottom-left"');
  });

  it("rejects non-positive or non-numeric scale", () => {
    expectFail({ scale: 0 }, "scale must be a positive number");
    expectFail({ scale: -1.5 }, "scale must be a positive number");
    expectFail({ scale: "big" }, "scale must be a positive number");
  });

  it("rejects malformed videoPath", () => {
    expectFail({ videoPath: "" }, "videoPath must be a non-empty string");
    expectFail({ videoPath: 42 }, "videoPath must be a non-empty string");
  });

  it("rejects malformed present: not array / empty / non-numeric fields", () => {
    expectFail({ present: "0-3" }, "non-empty array");
    expectFail({ present: [] }, "non-empty array");
    expectFail({ present: [{ from: 0 }] }, "must be {from: number, to: number}");
    expectFail({ present: [{ from: "0", to: 3 }] }, "must be {from: number, to: number}");
  });

  it("rejects from >= to and negative from", () => {
    expectFail({ present: [{ from: 5, to: 2 }] }, "from=5 >= to=2");
    expectFail({ present: [{ from: -1, to: 3 }] }, "negative");
  });

  it("rejects overlapping present intervals regardless of declaration order", () => {
    expectFail({ present: [{ from: 0, to: 5 }, { from: 4, to: 8 }] }, "overlap");
    expectFail({ present: [{ from: 4, to: 8 }, { from: 0, to: 5 }] }, "overlap");
  });

  it("rejects present interval far beyond estimated scene duration", () => {
    // 10-word VO → ~4.0s estimate → to=99 obviously overflows (tolerance ×2)
    const scene = ctaScene({ present: [{ from: 0, to: 99 }] });
    scene.voiceover = "Follow for more China AI news that matters today ok";
    const results = checkAvatarContract([scene]);
    const fails = results.filter((r) => r.level === "fail");
    expect(fails).toHaveLength(1);
    expect(fails[0].detail).toContain("voiceover is ~");
    expect(fails[0].detail).toContain("wps estimate");
  });

  it("rejected scenes produce no pass entries (fail-closed, not silent)", () => {
    const results = checkAvatarContract([ctaScene({ foo: 1 })]);
    expect(results.filter((r) => r.level === "pass")).toEqual([]);
  });
});
