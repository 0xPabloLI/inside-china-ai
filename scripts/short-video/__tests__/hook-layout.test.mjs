import { describe, expect, it } from "vitest";
import {
  HOOK_LAYOUTS,
  claimPayoff,
  classifyHookLayout,
  evaluateHookLayout,
  evaluateHookLayoutRotation,
  hasMagnitude,
} from "../lib/hook-layout.mjs";

const hook = (texts, extra = {}) => ({
  id: 1,
  visualType: "hook",
  voiceover: "In June, Zhipu peaked at 2,980 Hong Kong dollars. Today it trades at 454.",
  texts,
  ...extra,
});

const narrative = (id, voiceover, texts = {}) => ({
  id,
  visualType: "narrative",
  voiceover,
  texts,
});

/** A film with explicit per-scene seconds, so the 30s window is deterministic. */
const film = (hookScene, scenes, durations) => ({
  scenes: [hookScene, ...scenes],
  sceneDurations: durations,
});

const codes = (result) => result.findings.map((finding) => finding.code);

describe("classifyHookLayout", () => {
  it("reads the renderer's own predicate for media-led", () => {
    const scene = hook(
      { subject: "ZHIPU", bigNumber: "-85%" },
      { layout: "media-led", mediaRole: "evidence", media: { type: "image", source: "HKEX" } },
    );
    expect(classifyHookLayout(scene)).toEqual({ declared: "media-led", effective: "media-led" });
  });

  it("treats a native candle chart as media-led evidence", () => {
    const scene = hook({ bigNumber: "-85%" }, { layout: "media-led", info: { chart: "candle" } });
    expect(classifyHookLayout(scene).effective).toBe("media-led");
  });

  it("does not call a decorative still media-led (it renders hero-center)", () => {
    const scene = hook(
      { hookText: "NOT A MODEL" },
      { layout: "media-led", media: { type: "image", source: "X" } },
    );
    expect(classifyHookLayout(scene)).toEqual({ declared: "media-led", effective: "claim-led" });
  });

  it("separates claim-led from number-led by the declared text slots", () => {
    expect(classifyHookLayout(hook({ hookText: "BROKE OUT OF" })).effective).toBe("claim-led");
    expect(classifyHookLayout(hook({ bigNumber: "2.8T" })).effective).toBe("number-led");
  });
});

describe("hasMagnitude", () => {
  it.each([
    ["2.8T", true],
    ["$0.05", true],
    ["-85%", true],
    ["160,000", true],
    ["20,000", true],
    ["9 / 11", true],
    ["234ms", true],
    ["GPT-5.5", false],
    ["V4.1", false],
    ["GLM-6.0", false],
    ["H100", false],
    ["5", false],
    ["ROBOTAXI", false],
  ])("hasMagnitude(%s) = %s", (value, expected) => {
    expect(hasMagnitude(value)).toBe(expected);
  });
});

describe("evaluateHookLayout — table-driven positives and negatives", () => {
  const CASES = [
    {
      name: "number-led positive: cross-tier number with a traceable dataPoint",
      scene: hook({ bigNumber: "2.8T", numberLabel: "PARAMETERS" }),
      opts: {
        meta: { dataPoints: ["Kimi K3: 2.8T total parameters, 104B activated (official)"] },
        ...film(
          hook({ bigNumber: "2.8T" }),
          [narrative(2, "Kimi K3 carries 2.8T total parameters.")],
          [5, 5],
        ),
      },
      expect: { layout: "number-led", fails: [] },
    },
    {
      name: "number-led negative: a model nameplate is not a number",
      scene: hook({ bigNumber: "V4.1" }),
      opts: {},
      expect: { layout: "number-led", fails: ["hook-layout-number-no-magnitude"] },
    },
    {
      name: "number-led negative: a hedged magnitude is disallowed",
      scene: hook({ bigNumber: "~10X" }),
      opts: {},
      expect: { layout: "number-led", fails: ["hook-layout-number-hedged"] },
    },
    {
      name: "claim-led positive: the claim is settled in the first 30 seconds",
      scene: hook({ hookText: "NOT A MODEL", revealText: "A PLATFORM" }),
      opts: film(
        hook({ hookText: "NOT A MODEL" }),
        [narrative(2, "Baidu sells tokens, it is not a model vendor.")],
        [5, 6],
      ),
      expect: { layout: "claim-led", fails: [] },
    },
    {
      name: "claim-led negative: nothing in the film answers the claim",
      scene: hook({ hookText: "IT LIFTS A CAR.", revealText: "ALONE" }),
      opts: film(
        hook({ hookText: "IT LIFTS A CAR." }),
        [
          narrative(2, "The robot walked through a night rescue drill."),
          narrative(3, "Batteries lasted four hours."),
        ],
        [5, 6, 6],
      ),
      expect: { layout: "claim-led", fails: ["hook-layout-claim-unpaid"] },
    },
    {
      name: "claim-led negative: the payoff lands after 30 seconds",
      scene: hook({ hookText: "BROKE OUT OF", revealText: "THE LAB" }),
      opts: film(
        hook({ hookText: "BROKE OUT OF" }),
        [
          narrative(2, "The first two minutes cover the funding round."),
          narrative(3, "The first two minutes cover the hiring wave."),
          narrative(4, "The first two minutes cover the chip order."),
          narrative(5, "Only then does the film say the lab broke out."),
        ],
        [5, 10, 10, 10, 10],
      ),
      expect: { layout: "claim-led", fails: ["hook-layout-claim-unpaid"] },
    },
    {
      name: "media-led positive: evidence picture with provenance",
      scene: hook(
        { subject: "ZHIPU", bigNumber: "-85%" },
        {
          layout: "media-led",
          mediaRole: "evidence",
          media: { type: "image", source: "HKEX close" },
        },
      ),
      opts: {},
      expect: { layout: "media-led", fails: [] },
    },
    {
      name: "media-led negative: the declaration silently downgrades",
      scene: hook({ bigNumber: "-85%" }, { layout: "media-led", media: { type: "image" } }),
      opts: {},
      expect: { layout: "number-led", fails: ["hook-layout-media-led-unresolved"] },
    },
    {
      name: "media-led negative: evidence picture without provenance",
      scene: hook(
        { subject: "ZHIPU", bigNumber: "-85%" },
        { layout: "media-led", mediaRole: "evidence", media: { type: "image" } },
      ),
      opts: {},
      expect: { layout: "media-led", fails: ["hook-layout-media-no-provenance"] },
    },
  ];

  it.each(CASES)("$name", ({ scene, opts, expect: expected }) => {
    const result = evaluateHookLayout(scene, opts);
    expect(result.layout).toBe(expected.layout);
    expect(
      result.findings.filter((finding) => finding.level === "fail").map((finding) => finding.code),
    ).toEqual(expected.fails);
    for (const finding of result.findings) {
      // Every finding has to be readable on its own — the Stage 3 report is read
      // by the writer, not by the test.
      expect(finding.detail.length).toBeGreaterThan(10);
      if (finding.level === "fail") expect(finding.fix).toBeTruthy();
    }
  });

  it("names the rule the chosen layout has to satisfy", () => {
    const result = evaluateHookLayout(hook({ bigNumber: "2.8T" }), {});
    expect(result.layout).toBe("number-led");
    expect(HOOK_LAYOUTS["number-led"].disallowed).toContain("型号铭牌");
  });
});

describe("claimPayoff", () => {
  it("counts the hook's own spoken line as a settlement at 0s", () => {
    const hookScene = hook({ hookText: "$700M" }, { voiceover: "SenseTime revenue topped $700M." });
    const payoff = claimPayoff(hookScene, "$700M", film(hookScene, [], [5]));
    expect(payoff.paidOff).toBe(true);
    expect(payoff.payoffStart).toBe(0);
  });

  it("reports the first scene that settles the claim", () => {
    const hookScene = hook({ hookText: "BROKE OUT" });
    const payoff = claimPayoff(
      hookScene,
      "BROKE OUT",
      film(hookScene, [narrative(2, "It broke out of the lab.")], [5, 8]),
    );
    expect(payoff.payoffStart).toBe(5);
    expect(payoff.paidOff).toBe(true);
  });
});

describe("evaluateHookLayoutRotation — cross-pack anti-repetition", () => {
  it("treats two same-layout predecessors as the third repeat", () => {
    const rotation = evaluateHookLayoutRotation({
      history: [
        { slug: "b", layout: "number-led" },
        { slug: "a", layout: "number-led" },
      ],
      candidate: "number-led",
    });
    expect(rotation.status).toBe("needs-reason");
    expect(rotation.runLength).toBe(3);
    expect(rotation.detail).toContain("b → a");
    expect(rotation.suggested).not.toBe("number-led");
  });

  it("accepts the repeat with a recorded reason", () => {
    const rotation = evaluateHookLayoutRotation({
      history: [
        { slug: "b", layout: "number-led" },
        { slug: "a", layout: "number-led" },
      ],
      candidate: "number-led",
      repeatReason: "同一条生产线叙事必须连续三集用同一个数字版式",
    });
    expect(rotation.status).toBe("pass-with-reason");
    expect(rotation.detail).toContain("同一条生产线");
  });

  it("passes when the previous pack used a different layout", () => {
    const rotation = evaluateHookLayoutRotation({
      history: [{ slug: "b", layout: "claim-led" }],
      candidate: "number-led",
    });
    expect(rotation.status).toBe("pass");
    expect(rotation.detail).toContain("b");
  });

  it("passes one same-layout predecessor (only two in a row)", () => {
    const rotation = evaluateHookLayoutRotation({
      history: [{ slug: "b", layout: "number-led" }],
      candidate: "number-led",
    });
    expect(rotation.status).toBe("pass");
    expect(rotation.predecessors).toHaveLength(1);
  });

  it("reports insufficient history instead of inventing a verdict", () => {
    const rotation = evaluateHookLayoutRotation({ history: [], candidate: "number-led" });
    expect(rotation.status).toBe("insufficient-history");
  });
});
