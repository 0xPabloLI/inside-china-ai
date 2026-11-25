import { describe, expect, it } from "vitest";
import {
  buildIndustryContext,
  collectPackEntities,
  entityKeyPattern,
  formatIndustryContext,
} from "../lib/industry-context.mjs";
import { currentFacts, loadIndustryKnowledge } from "../lib/industry-knowledge.mjs";

const knowledge = loadIndustryKnowledge();

const scenes = [
  {
    id: 2,
    voiceover: "DeepSeek V4-Pro activates 49B of its 1.6T parameters per token, as of April 2026.",
    texts: { title: "DeepSeek V4-Pro" },
  },
];

describe("collectPackEntities (#1479 S2)", () => {
  it("resolves the model the pack names, not every model in the ledger", () => {
    const entities = collectPackEntities({ meta: {}, scenes, knowledge });
    const ids = entities.map((entity) => entity.id);
    expect(ids).toContain("deepseek_v4_pro");
    expect(ids).not.toContain("qwen3_8");
  });

  it("takes declared keyEntities even when the text does not repeat them", () => {
    const entities = collectPackEntities({
      meta: { keyEntities: { models: ["deepseek_v4_flash"] } },
      scenes: [{ id: 1, voiceover: "A cheaper sibling ships today." }],
      knowledge,
    });
    expect(entities.map((entity) => entity.id)).toContain("deepseek_v4_flash");
  });

  it("does not match short ascii keys inside longer tokens", () => {
    expect(entityKeyPattern("K3").test("K3 ships")).toBe(true);
    expect(entityKeyPattern("K3").test("K30 ships")).toBe(false);
  });
});

describe("buildIndustryContext (#1479 S2)", () => {
  it("injects only current facts — never superseded or disputed ones", () => {
    const context = buildIndustryContext({
      packId: "fixture",
      meta: {},
      scenes,
      knowledge,
      today: "2026-11-21",
    });
    const model = context.entities.find((entity) => entity.id === "deepseek_v4_pro");
    expect(model).toBeTruthy();
    const currentIds = currentFacts(knowledge, { subject: "deepseek_v4_pro" }).length;
    expect(model.facts.length).toBe(currentIds);
    for (const fact of model.facts) {
      expect(fact.relation).toBeTruthy();
      expect(fact.object).toBeTruthy();
    }
  });

  it("flags stale facts with their age and budget, and clears them when fresh", () => {
    const stale = buildIndustryContext({
      packId: "fixture",
      meta: {},
      scenes,
      knowledge,
      today: "2026-11-21",
    }).entities.find((entity) => entity.id === "deepseek_v4_pro");
    const scale = stale.facts.find((fact) => fact.relation === "model_scale");
    expect(scale.stale).toBe(true);
    expect(scale.budgetDays).toBe(30);
    expect(scale.ageDays).toBeGreaterThan(30);

    const fresh = buildIndustryContext({
      packId: "fixture",
      meta: {},
      scenes,
      knowledge,
      today: "2026-04-26",
    }).entities.find((entity) => entity.id === "deepseek_v4_pro");
    const freshScale = fresh.facts.find((fact) => fact.relation === "model_scale");
    expect(freshScale.stale).toBe(false);
  });

  it("carries the domain baseline bands for the writer's positioning line", () => {
    const context = buildIndustryContext({
      packId: "fixture",
      meta: {},
      scenes,
      knowledge,
      today: "2026-11-21",
    });
    expect(context.domains.llm.frontierBand).toMatch(/1\.6T/);
    expect(context.domains.llm.edgeBand).toMatch(/8B/);
  });

  it("marks registry-known entities as not first-report", () => {
    const context = buildIndustryContext({
      packId: "fixture",
      meta: {},
      scenes,
      knowledge,
      today: "2026-11-21",
    });
    const deepseek = context.entities.find((entity) => entity.id === "deepseek");
    expect(deepseek.firstReport).toBe(false);
  });

  it("formats a readable injection block with the as-of rule stated", () => {
    const block = formatIndustryContext(
      buildIndustryContext({
        packId: "fixture",
        meta: {},
        scenes,
        knowledge,
        today: "2026-11-21",
      }),
    );
    expect(block).toContain("只含 current 事实");
    expect(block).toContain("as of <month>");
    expect(block).toContain("DeepSeek");
    expect(block).toContain("asOf");
  });

  it("refuses a missing pack id or an unparseable today", () => {
    expect(() =>
      buildIndustryContext({ meta: {}, scenes, knowledge, today: "2026-11-21" }),
    ).toThrow(/packId/);
    expect(() =>
      buildIndustryContext({ packId: "fixture", scenes, knowledge, today: "11/21/2026" }),
    ).toThrow(/YYYY-MM-DD/);
  });
});
