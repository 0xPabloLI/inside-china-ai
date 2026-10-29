import { describe, test, expect } from "vitest";

import {
  PROMPT_SLOTS,
  PROMPT_TEMPLATES,
  MODEL_TIER_FAMILIES,
  familyForModelTier,
  getPromptTemplate,
  renderDeclaredPrompt,
  renderPromptForModel,
} from "../b-roll/prompt-templates.mjs";
import { MAX_PROMPT_TOKENS, PromptBudgetError } from "../b-roll/prompt-budget.mjs";
import { MODEL_TIERS } from "../b-roll/runner.mjs";

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

  test("derived tier→family keys all exist in runner.mjs MODEL_TIERS", () => {
    const knownTiers = Object.keys(MODEL_TIERS);
    for (const tier of Object.keys(MODEL_TIER_FAMILIES)) {
      expect(knownTiers).toContain(tier);
    }
  });

  test("every family with a live integration declares at least one tier", () => {
    for (const template of Object.values(PROMPT_TEMPLATES)) {
      if (template.integration === "pipeline") {
        expect(template.modelTiers.length).toBeGreaterThan(0);
      }
    }
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

// ─── declared-prompt entry (#922) ───

describe("renderDeclaredPrompt (#922)", () => {
  const declared = "A lone server rack glowing blue beside one small cube, no text.";

  test("both live Wan families return the declared prompt trimmed, otherwise byte-identical", () => {
    expect(renderDeclaredPrompt(`  ${declared}  `, "wan2.2")).toBe(declared);
    expect(renderDeclaredPrompt(`  ${declared}  `, "wan2.1")).toBe(declared);
    // The trailing full stop belongs to the declared prompt — prompt-injection
    // strips it only when it appends constants.
    expect(renderDeclaredPrompt(declared, "wan2.2").endsWith("no text.")).toBe(true);
  });

  test("blank or missing declared prompts render empty", () => {
    expect(renderDeclaredPrompt("", "wan2.2")).toBe("");
    expect(renderDeclaredPrompt("   ", "wan2.2")).toBe("");
    expect(renderDeclaredPrompt(undefined, "wan2.1")).toBe("");
    expect(renderDeclaredPrompt(null, "wan2.1")).toBe("");
  });

  test("over-budget declared prompts throw PromptBudgetError naming family, tokens and overshoot", () => {
    const long = "glowing bar ".repeat(600);
    let error;
    try {
      renderDeclaredPrompt(long, "wan2.2");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PromptBudgetError);
    expect(error).toBeInstanceOf(RangeError);
    expect(error.message).toContain("wan2.2");
    expect(error.message).toMatch(/~\d+ tokens/);
    expect(error.message).toContain("over the 480-token budget");
    expect(error.message).toMatch(/,\s*\d+ over the 480-token budget/);
  });

  test("unknown families are rejected with the known ids", () => {
    expect(() => renderDeclaredPrompt("a rack", "wan9")).toThrow(
      /Unknown T2V prompt family "wan9"/,
    );
  });

  test("candidate families are refused by the pipeline entry", () => {
    expect(() => renderDeclaredPrompt("a rack", "seedance")).toThrow(
      /not admitted to the generation pipeline/,
    );
  });
});
