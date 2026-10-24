import { describe, test, expect } from "vitest";

import {
  PROMPT_SLOTS,
  PROMPT_TEMPLATES,
  MODEL_TIER_FAMILIES,
  familyForModelTier,
  getPromptTemplate,
  renderPromptForModel,
} from "../b-roll/prompt-templates.mjs";
import { MAX_PROMPT_TOKENS } from "../b-roll/prompt-injection.mjs";

// ─── template table ───

describe("admitted families (#757)", () => {
  test("only the three admitted families are exported", () => {
    expect(Object.keys(PROMPT_TEMPLATES).sort()).toEqual(["seedance", "wan2.1", "wan2.2"]);
  });

  test("researched-but-refused families stay out of the table", () => {
    expect(PROMPT_TEMPLATES.hunyuanvideo).toBeUndefined();
    expect(PROMPT_TEMPLATES.cogvideox).toBeUndefined();
  });

  test("every slot order uses known slots, without duplicates", () => {
    for (const template of Object.values(PROMPT_TEMPLATES)) {
      expect(new Set(template.slotOrder).size).toBe(template.slotOrder.length);
      for (const slot of template.slotOrder) {
        expect(PROMPT_SLOTS).toContain(slot);
      }
    }
  });

  test("every family declares a non-empty official camera vocabulary", () => {
    for (const template of Object.values(PROMPT_TEMPLATES)) {
      expect(template.cameraVocabulary.movements.length).toBeGreaterThan(0);
    }
  });

  test("Wan families share the derived 480-token budget; Seedance has no local budget", () => {
    expect(PROMPT_TEMPLATES["wan2.2"].maxPromptTokens).toBe(MAX_PROMPT_TOKENS);
    expect(PROMPT_TEMPLATES["wan2.1"].maxPromptTokens).toBe(MAX_PROMPT_TOKENS);
    expect(PROMPT_TEMPLATES.seedance.maxPromptTokens).toBeNull();
  });

  test("negative capability is declared, not invented", () => {
    expect(PROMPT_TEMPLATES["wan2.2"].negativeMode).toBe("prompt-clause");
    expect(PROMPT_TEMPLATES["wan2.2"].negativeApiParam).toBe("negative_prompt");
    expect(PROMPT_TEMPLATES.seedance.negativeMode).toBe("none");
    expect(PROMPT_TEMPLATES.seedance.negativeApiParam).toBeNull();
  });

  test("live tiers map to the Wan families", () => {
    expect(familyForModelTier("fastmetal-5b")).toBe("wan2.2");
    expect(familyForModelTier("fastmetal-1.3b")).toBe("wan2.1");
    expect(Object.keys(MODEL_TIER_FAMILIES).sort()).toEqual(["fastmetal-1.3b", "fastmetal-5b"]);
  });
});

// ─── lookups ───

describe("lookups", () => {
  test("getPromptTemplate returns the record", () => {
    expect(getPromptTemplate("wan2.2").id).toBe("wan2.2");
  });

  test("unknown family fails loudly with the known ids", () => {
    expect(() => getPromptTemplate("wan9")).toThrow(/Unknown T2V prompt family "wan9"/);
    expect(() => getPromptTemplate("wan9")).toThrow(/wan2\.2.*wan2\.1.*seedance/);
  });

  test("unknown model tier fails loudly with the known tiers", () => {
    expect(() => familyForModelTier("fastmetal-99b")).toThrow(/Unknown model tier/);
  });
});

// ─── renderer ───

const PARTS = {
  subject: "a lone server rack glowing blue",
  visualMetaphor: "the rack shrinking into one small cube",
  reference: "reference: a data center aisle",
  camera: "camera pushes in slowly",
  motion: "the cube contracts once, then holds",
  lighting: "cold rim light from the left",
};

describe("renderPromptForModel (#757)", () => {
  test("Wan order follows Entity → Scene → Motion → aesthetic control", () => {
    expect(renderPromptForModel(PARTS, "wan2.2")).toBe(
      [
        "a lone server rack glowing blue",
        "the rack shrinking into one small cube",
        "the cube contracts once, then holds",
        "cold rim light from the left",
        "camera pushes in slowly",
        "reference: a data center aisle",
      ].join(", "),
    );
  });

  test("Seedance puts camera and lighting first", () => {
    expect(renderPromptForModel(PARTS, "seedance")).toBe(
      [
        "camera pushes in slowly",
        "cold rim light from the left",
        "a lone server rack glowing blue",
        "the cube contracts once, then holds",
        "the rack shrinking into one small cube",
        "reference: a data center aisle",
      ].join(", "),
    );
  });

  test("missing and blank clauses are skipped; empty input renders empty", () => {
    expect(renderPromptForModel({ subject: " a rack " }, "wan2.2")).toBe("a rack");
    expect(renderPromptForModel({}, "wan2.2")).toBe("");
    expect(renderPromptForModel(undefined, "seedance")).toBe("");
  });

  test("trailing punctuation is stripped from every clause", () => {
    expect(renderPromptForModel({ subject: "a rack.", motion: "it contracts... " }, "wan2.2")).toBe(
      "a rack, it contracts",
    );
  });

  test("code-owned dimensions are rejected by name", () => {
    expect(() => renderPromptForModel({ ...PARTS, brand: "dark studio" }, "wan2.2")).toThrow(
      /"brand" is code-owned/,
    );
    expect(() => renderPromptForModel({ ...PARTS, negative: "no text" }, "wan2.2")).toThrow(
      /"negative" is code-owned/,
    );
  });

  test("unknown slot names are rejected", () => {
    expect(() => renderPromptForModel({ ...PARTS, style: "cyberpunk" }, "wan2.2")).toThrow(
      /Unknown prompt slot "style"/,
    );
  });

  test("Wan over-budget prompts throw instead of truncating", () => {
    const long = Array.from({ length: 400 }, (_, i) => `clause${i}`).join(" ");
    expect(() => renderPromptForModel({ subject: long }, "wan2.2")).toThrow(
      /over the 480-token budget/,
    );
  });

  test("Seedance has no local budget gate", () => {
    const long = Array.from({ length: 400 }, (_, i) => `clause${i}`).join(" ");
    expect(renderPromptForModel({ subject: long }, "seedance").length).toBeGreaterThan(0);
  });
});
