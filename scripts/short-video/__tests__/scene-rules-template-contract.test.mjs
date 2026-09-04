import { describe, it, expect } from "vitest";
import { checkTemplateContract, runAllSceneDataChecks } from "../lib/scene-rules.mjs";

// #190: MRL-2 preflight must enforce the Remotion template contract
// (REMOTION_SLOT_MAP + assertKnownTextFields) BEFORE the TTS + render cycle.
// The kimi-ipo run shipped 4 categories of violations that all passed
// verify-video --pre and only failed mid-render. The preflight check mirrors
// the render-time layout resolution in ShortVideo.tsx (renderScene) via the
// shared resolveRenderLayout() seam in text-slots.mjs.

const scene = (id, visualType, layout, texts) => ({ id, visualType, layout, texts });

const fails = (results) => results.filter((r) => r.level === "fail");
const warns = (results) => results.filter((r) => r.level === "warn");

describe("checkTemplateContract (kimi-ipo violation replay)", () => {
  it("fails a narrative scene whose layout is not in REMOTION_SLOT_MAP.narrative", () => {
    // kimi-ipo category 1: narrative with layout "hero-center" — the render
    // throws "No Remotion slot mapping for layout hero-center of visualType
    // narrative" from remotionSlotsFor().
    const results = checkTemplateContract([
      scene(2, "narrative", "hero-center", { company: "A", action: "B", result: "C" }),
    ]);
    expect(fails(results)).toHaveLength(1);
    expect(fails(results)[0].detail).toContain("narrative");
    expect(fails(results)[0].detail).toContain("hero-center");
  });

  it("fails unknown text fields on stat-reveal (badge is not in the slot map)", () => {
    // kimi-ipo category 2: stat-reveal texts.badge — the render throws
    // "Slot stat-reveal.hero-center.badge has no measured maxWidth" (the
    // issue's observed error), surfaced as the Unknown-field assert here.
    const results = checkTemplateContract([
      scene(3, "stat-reveal", "hero-center", { bigNumber: "$4.7B", badge: "MARGIN", label: "x" }),
    ]);
    expect(fails(results)).toHaveLength(1);
    // getSlot's message for a SLOT_FIELDS entry without a measured width — the
    // exact error the kimi-ipo render threw.
    expect(fails(results)[0].detail).toContain("stat-reveal.hero-center.badge");
  });

  it("fails contrast scenes that use narrative-style field names", () => {
    // kimi-ipo category 3: contrast texts carrying narrative fields
    // (badge/company/action/result/source) alongside the contract set. The
    // assert reports ONE violation per scene, exactly like the render: with
    // title/left/right present, the unknown key loop fires on "company".
    const results = checkTemplateContract([
      scene(4, "contrast", "hero-center", {
        title: "T",
        left: ["a"],
        right: ["b"],
        badge: "B",
        company: "C",
        action: "A",
        result: "R",
        source: "S",
      }),
    ]);
    expect(fails(results)).toHaveLength(1);
    // badge IS a SLOT_FIELDS entry, so getSlot fails on the unmeasured slot id
    // rather than the Unknown-field branch. The key loop walks texts in
    // insertion order and reports the first offender — same as the render —
    // so this asserts on badge (first narrative-style key in the fixture).
    const detail = fails(results)[0].detail;
    expect(detail).toContain("contrast.hero-center.badge");
    expect(detail).toContain("no measured maxWidth");
  });

  it("fails scenes missing contract-promised rendered fields", () => {
    // brand/tagline are rendered for cta.hero-center — their absence throws at
    // render (the overlimit fixture shipped exactly this violation).
    const results = checkTemplateContract([
      scene(11, "cta", undefined, { action: "FOLLOW FOR MORE", line1: "CHINA AI NEWS" }),
    ]);
    expect(fails(results)).toHaveLength(1);
    const detail = fails(results)[0].detail;
    expect(detail).toContain('"brand"');
    expect(detail).toContain('"tagline"');
  });

  it("fails unknown fields even when no layout is given (non-narrative resolves hero-center)", () => {
    const results = checkTemplateContract([
      scene(11, "cta", undefined, { brand: "CHINA AI NEWS", tagline: "T", line1: "X" }),
    ]);
    expect(fails(results)).toHaveLength(1);
    expect(fails(results)[0].detail).toContain('"line1"');
  });

  it("warns (not fails) when a non-narrative scene carries a layout the render ignores", () => {
    // kimi-ipo category 4: cta with layout "cta". The render forces
    // hero-center for every non-narrative type, so the value is dead data —
    // warn so authors stop writing it, without blocking a renderable pack.
    const results = checkTemplateContract([
      scene(11, "cta", "cta", { brand: "CHINA AI NEWS", tagline: "T", action: "FOLLOW" }),
    ]);
    expect(fails(results)).toHaveLength(0);
    expect(warns(results)).toHaveLength(1);
    expect(warns(results)[0].detail).toContain("cta");
  });

  it("passes a fully compliant scene per visualType", () => {
    const results = checkTemplateContract([
      scene(1, "hook", "hero-center", { hookText: "HOOK", revealText: "REVEAL" }),
      scene(2, "narrative", "media-overlay", { company: "A", action: "B", result: "C" }),
      scene(3, "stat-reveal", "hero-center", { bigNumber: "$4.7B" }),
      scene(4, "contrast", "hero-center", { title: "T", left: ["a"], right: ["b"] }),
      scene(5, "data", "hero-center", { stat: "$1.4B", statLabel: "label" }),
      scene(10, "fullscreen", undefined, {}),
    ]);
    expect(fails(results)).toHaveLength(0);
    expect(warns(results)).toHaveLength(0);
  });

  it("accepts structured highlight + field aliases exactly like the render assert", () => {
    const results = checkTemplateContract([
      scene(2, "narrative", "media-bottom-bar", {
        company: "OPEN WEIGHTS DAY ONE",
        action: "SHIP IT",
        result: "FREE",
        highlight: { field: "company", text: "OPEN WEIGHTS" },
      }),
      scene(5, "data", "hero-center", { stat: "$1.4B", statLabel: "MARK" }),
    ]);
    expect(fails(results)).toHaveLength(0);
    expect(warns(results)).toHaveLength(0);
  });

  it("skips visualTypes outside REMOTION_SLOT_MAP (checkVisualTypeWhitelist owns those)", () => {
    const results = checkTemplateContract([scene(7, "benchmark", "hero-center", {})]);
    expect(fails(results)).toHaveLength(0);
    expect(warns(results)).toHaveLength(0);
  });

  it("reports one fail per violating scene, with the scene id in the check name", () => {
    const results = checkTemplateContract([
      scene(2, "narrative", "hero-center", { company: "A", action: "B", result: "C" }),
      scene(3, "narrative", "media-overlay", { company: "A", action: "B", result: "C" }),
    ]);
    expect(fails(results)).toHaveLength(1);
    expect(fails(results)[0].check).toContain("Scene 2");
  });
});

describe("runAllSceneDataChecks wires checkTemplateContract", () => {
  it("template-contract violations land in the fail bucket of the aggregate", () => {
    const res = runAllSceneDataChecks([
      scene(2, "narrative", "hero-center", { company: "A", action: "B", result: "C" }),
    ]);
    expect(res.fail.map((r) => r.check)).toContain("Scene 2 template contract");
  });
});
