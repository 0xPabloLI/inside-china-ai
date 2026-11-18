// Currency gate contract (2026-11-18): the rule is fail-closed.
// Before this change `checkCurrencyDualAnnotation` returned `warn`, so a pack
// could ship RMB prices untouched (DeepSeek pack, 2026-11-17: "0.39 YUAN").

import { describe, it, expect } from "vitest";
import { runAllSceneDataChecks } from "../lib/scene-rules.mjs";

const seriesMeta = { seriesId: "restraint", partNumber: 1, totalParts: 3 };
const CHECK = "Currency dual-annotation (CNY/HKD → USD)";

function currencyFinding(scenes) {
  const results = runAllSceneDataChecks(scenes, seriesMeta);
  return [...results.pass, ...results.warn, ...results.fail].find((r) => r.check === CHECK);
}

function sceneWith(voiceover, texts = {}) {
  return [{ id: 1, voiceover, texts }];
}

describe("currency gate", () => {
  it('fails on a bare "<n> yuan" that the normalizer missed', () => {
    const finding = currencyFinding(sceneWith("Speech costs 0.39 yuan an hour."));
    expect(finding.level).toBe("fail");
    expect(finding.detail).toContain("0.39 yuan");
  });

  it("passes when the amount carries a USD dual annotation", () => {
    const finding = currencyFinding(sceneWith("Speech costs $0.05 (0.39 yuan) an hour."));
    expect(finding.level).toBe("pass");
  });

  it("fails on a spelled-out amount and names it as unfixable", () => {
    const finding = currencyFinding(sceneWith("Speech costs thirty nine fen an hour."));
    expect(finding.level).toBe("fail");
    expect(finding.detail).toContain("Spelled-out amount");
    expect(finding.detail).toContain("thirty nine fen");
  });

  it("does not fire on non-currency 元 words", () => {
    const finding = currencyFinding(sceneWith("元宇宙和元素周期表都不是货币。"));
    expect(finding.level).toBe("pass");
  });
});
