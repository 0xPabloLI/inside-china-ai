import { describe, it, expect } from "vitest";
import {
  ARCHETYPES,
  archetypeForText,
  archetypeWord,
  composeArchetypePhrase,
} from "../lib/visual-archetypes.mjs";

describe("archetypeForText — cue matching", () => {
  it("finds the chart archetype from index and chart cues", () => {
    expect(archetypeForText("Hang Seng TECH index chart showing the drawdown")).toBe("chart");
    expect(archetypeForText("The index sits below its 2021 peak")).toBe("chart");
    expect(archetypeForText("股价走势示意")).toBe("chart");
  });

  it("prefers the longest cue so multi-word forms win", () => {
    expect(archetypeForText("a robot arm picking up a block")).toBe("robot_arm");
    expect(archetypeForText("a data center with gpu racks")).toBe("data_center");
    // "data center" must not be read through a bare-token cue of another id.
    expect(archetypeForText("robotic arm manipulator")).toBe("robot_arm");
  });

  it("matches single-word cues only on whole tokens", () => {
    expect(archetypeForText("planting season on the farm")).toBe(null);
    expect(archetypeForText("relabel the categories")).toBe(null);
    expect(archetypeForText("the labels on the chart")).toBe("chart");
  });

  it("matches factory and humanoid cues", () => {
    expect(archetypeForText("an assembly line in a Shenzhen factory")).toBe("factory");
    expect(archetypeForText("Unitree humanoid robot on stage")).toBe("humanoid");
    expect(archetypeForText("人形机器人演示")).toBe("humanoid");
  });

  it("returns null for empty or archetype-free text", () => {
    expect(archetypeForText("")).toBe(null);
    expect(archetypeForText(null)).toBe(null);
    expect(archetypeForText("a person walking down a street")).toBe(null);
  });
});

describe("archetypeWord — retrieval terms", () => {
  it("maps an id to the term an index actually matches", () => {
    expect(archetypeWord("chart")).toBe("chart");
    expect(archetypeWord("data_center")).toBe("data center");
    expect(archetypeWord("humanoid")).toBe("humanoid robot");
  });

  it("returns null for unknown ids and empty input", () => {
    expect(archetypeWord("nope")).toBe(null);
    expect(archetypeWord(null)).toBe(null);
    expect(archetypeWord("")).toBe(null);
  });

  it("keeps every word a closed, index-friendly single term", () => {
    for (const [id, spec] of Object.entries(ARCHETYPES)) {
      expect(archetypeWord(id), id).toBe(spec.word);
      expect(spec.word.length).toBeGreaterThan(0);
    }
  });
});

describe("composeArchetypePhrase — entity + archetype", () => {
  it("joins the entity name and the retrieval term", () => {
    expect(composeArchetypePhrase("Hang Seng TECH", "chart")).toBe("Hang Seng TECH chart");
    expect(composeArchetypePhrase("Zhipu", "office")).toBe("Zhipu office");
  });

  it("returns null when either half is missing", () => {
    expect(composeArchetypePhrase("", "chart")).toBe(null);
    expect(composeArchetypePhrase("   ", "chart")).toBe(null);
    expect(composeArchetypePhrase("Zhipu", null)).toBe(null);
    expect(composeArchetypePhrase("Zhipu", "unknown")).toBe(null);
    expect(composeArchetypePhrase(null, "chart")).toBe(null);
  });
});

describe("archetypeForText — 指数 morpheme guard (#1353 review)", () => {
  it("does not read exponential-growth compounds as a chart", () => {
    expect(archetypeForText("算力需求呈指数增长")).toBe(null);
    expect(archetypeForText("成本呈指数级下降")).toBe(null);
  });

  it("still reads a market index as a chart", () => {
    expect(archetypeForText("恒生科技指数较高点下跌八成")).toBe("chart");
    expect(archetypeForText("指数走势图")).toBe("chart");
  });
});
