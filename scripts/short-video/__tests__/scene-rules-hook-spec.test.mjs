/**
 * Hook opening spec (#1231): sentence-family priority + 4.5–5 s duration band.
 *
 * Source: docs/research/competitor-video-benchmarks-research.md §10.2 —
 * hook median 5.0 s (p25–p75 4.1–6.6 s), sentence-family hits n=35:
 * scale/superlative 11, quantity anchor 11, `just` + event 9, question 4,
 * intensity words 4. The checks below are EDITORIAL advice (#763): the
 * write-side rule lives in docs/content-pipeline.md, and nothing here may
 * block a render. They print what the hook currently is, not a pass/fail gate.
 */
import { describe, it, expect } from "vitest";
import {
  checkHookDuration,
  checkHookSentenceFamily,
  runAllSceneDataChecks,
} from "../lib/scene-rules.mjs";

const hook = (voiceover, id = 1) => ({
  id,
  visualType: "hook",
  voiceover,
  texts: { hookText: "ONE FOCAL" },
  media: null,
});

const tail = [
  { id: 2, visualType: "narrative", voiceover: "The rest of the story runs here." },
  {
    id: 3,
    visualType: "cta",
    voiceover: "Follow for the next dispatch.",
    texts: { action: "FOLLOW" },
  },
];

const withHook = (voiceover) => [hook(voiceover), ...tail];
const at = (results) => results[0];

// ── sentence families ───────────────────────────────────────────────────────

describe("checkHookSentenceFamily — priority families", () => {
  it("passes a scale / superlative opening", () => {
    const result = at(
      checkHookSentenceFamily(withHook("The biggest building in human history is here.")),
    );
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("规模 / 最高级锚点");
  });

  it("passes a quantity-anchor opening", () => {
    const result = at(
      checkHookSentenceFamily(withHook("Here are five things to build this weekend.")),
    );
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("数量锚点");
  });

  it("passes a `just` + event opening", () => {
    const result = at(
      checkHookSentenceFamily(withHook("China just dropped an AI model that beats GPT-5.")),
    );
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("just + 事件");
  });

  it("reads the first sentence only — a later superlative does not rescue it", () => {
    const result = at(
      checkHookSentenceFamily(
        withHook("DeepSeek shipped a compiler. The biggest surprise came three days later."),
      ),
    );
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("先头三族");
  });

  it("does not treat a discourse marker as the scale family", () => {
    const result = at(
      checkHookSentenceFamily(withHook("First, let's look at what DeepSeek shipped.")),
    );
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("先头三族");
  });

  it("does not treat `First up` as the scale family", () => {
    const result = at(
      checkHookSentenceFamily(withHook("First up, we look at what DeepSeek shipped.")),
    );
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("先头三族");
  });

  it("does not count a spaced model version as a quantity anchor", () => {
    const result = at(checkHookSentenceFamily(withHook("Qwen 4 is the model everyone wants.")));
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("先头三族");
  });

  it("does not count `just need` as a just + event", () => {
    const result = at(checkHookSentenceFamily(withHook("You just need to see this.")));
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("先头三族");
  });

  it("keeps `first` when it modifies a noun", () => {
    const result = at(checkHookSentenceFamily(withHook("China just passed its first AI law.")));
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("规模 / 最高级锚点");
  });

  it("ends the sentence on a standalone capital", () => {
    // `Model X.` is a sentence, not an abbreviation; the later superlative
    // must not rescue the opening.
    const result = at(
      checkHookSentenceFamily(withHook("Model X. The biggest surprise came later.")),
    );
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("先头三族");
  });

  it("ends the sentence on a quoted terminator", () => {
    // The superlative is in the second sentence; the first must still be read
    // as `He said "boom.` and flagged.
    const result = at(
      checkHookSentenceFamily(withHook('He said "boom." Then the biggest shift landed.')),
    );
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("先头三族");
  });

  it("keeps an abbreviation inside the first sentence", () => {
    const result = at(
      checkHookSentenceFamily(withHook("The U.S. just blocked the biggest chip export yet.")),
    );
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("just + 事件");
  });

  it("keeps `No.` inside the first sentence", () => {
    const result = at(
      checkHookSentenceFamily(withHook("No. 1 chipmaker just shipped the biggest chip yet.")),
    );
    expect(result.level).toBe("pass");
  });
});

describe("checkHookSentenceFamily — question and intensity handling", () => {
  it("flags a question-only opening (4/35 in the corpus)", () => {
    const result = at(checkHookSentenceFamily(withHook("Do you have a dream?")));
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("提问式");
    expect(result.fix).toContain("规模");
  });

  it("keeps a question that carries a number anchor (the 405 shape)", () => {
    const result = at(
      checkHookSentenceFamily(
        withHook("What if one GPU could run a world model for 1.3 billion people?"),
      ),
    );
    expect(result.level).toBe("pass");
  });

  it("does not count a model-version digit as a number anchor", () => {
    const result = at(checkHookSentenceFamily(withHook("What is GPT-5?")));
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("提问式");
  });

  it("flags an intensity-only hook without a concrete fact", () => {
    const result = at(
      checkHookSentenceFamily(withHook("This is an absolutely insane week for AI.")),
    );
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("强度词");
    expect(result.fix).toContain("具体事实");
  });

  it("does not claim 'no fact' when a named comparison backs the intensity word", () => {
    // Research §10.4 P4 counts "beats GPT-5" as the concrete fact. That shape
    // has no digit and no priority family, so the complaint must fall through
    // to the family rule, not the intensity rule.
    const result = at(
      checkHookSentenceFamily(withHook("This is insane: DeepSeek beats GPT-5 on every benchmark.")),
    );
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("先头三族");
    expect(result.detail).not.toContain("强度词");
  });

  it("accepts an intensity word when a concrete anchor backs it", () => {
    const result = at(
      checkHookSentenceFamily(withHook("This is the most insane tech company in the world, ASML.")),
    );
    expect(result.level).toBe("pass");
  });

  it("flags a hook that hits none of the three priority families", () => {
    const result = at(
      checkHookSentenceFamily(withHook("DeepSeek open-sourced the code that runs its models.")),
    );
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("先头三族");
  });

  it("passes non-hook first scenes without judging them", () => {
    const result = at(
      checkHookSentenceFamily([{ id: 1, visualType: "narrative", voiceover: "Anything." }]),
    );
    expect(result.level).toBe("pass");
  });
});

// ── duration band ───────────────────────────────────────────────────────────

describe("checkHookDuration — real TTS durations", () => {
  const opts = (duration) => ({ sceneDurations: [{ sceneId: 1, duration }] });

  it("passes a hook inside the 4.5–5.0 s target band", () => {
    const result = at(checkHookDuration(withHook("A hook."), opts(4.8)));
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("4.80s");
    expect(result.detail).toContain("目标");
  });

  it("passes a hook inside the measured 4.1–6.6 s band but outside target", () => {
    const result = at(checkHookDuration(withHook("A hook."), opts(5.6)));
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("4.1–6.6");
  });

  it("advises a hook longer than the measured p75", () => {
    const result = at(checkHookDuration(withHook("A hook."), opts(10.84)));
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("10.84s");
    expect(result.fix).toContain("4.5–5");
  });

  it("advises a hook shorter than the measured p25", () => {
    const result = at(checkHookDuration(withHook("Ten words."), opts(3.3)));
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("3.30s");
  });

  it("falls back to the word-count projection when the hook row is missing", () => {
    const result = at(
      checkHookDuration(withHook("A hook."), { sceneDurations: [{ sceneId: 2, duration: 7 }] }),
    );
    expect(result.detail).toContain("预估");
  });
});

describe("checkHookDuration — pre-TTS word projection", () => {
  it("passes the 12-word target band (4.8 s)", () => {
    const vo = "One two three four five six seven eight nine ten eleven twelve.";
    const result = at(checkHookDuration(withHook(vo)));
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("12");
    expect(result.detail).toContain("目标");
  });

  it("passes 13 words (5.2 s) as accepted but outside target", () => {
    const vo = "One two three four five six seven eight nine ten eleven twelve thirteen.";
    const result = at(checkHookDuration(withHook(vo)));
    expect(result.level).toBe("pass");
    expect(result.detail).toContain("4.1–6.6");
  });

  it("advises 10 words — 4.0 s projects below the acceptance floor", () => {
    const vo = "One two three four five six seven eight nine ten.";
    const result = at(checkHookDuration(withHook(vo)));
    expect(result.level).toBe("warn");
    expect(result.fix).toContain("补词");
  });

  it("advises 17 words — 6.8 s projects above the acceptance ceiling", () => {
    const vo =
      "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.";
    const result = at(checkHookDuration(withHook(vo)));
    expect(result.level).toBe("warn");
    expect(result.fix).toContain("删词");
  });

  it("passes the wider 11–16 word acceptance band", () => {
    const vo =
      "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.";
    const result = at(checkHookDuration(withHook(vo)));
    expect(result.level).toBe("pass");
  });

  it("advises a hook that projects beyond the acceptance band", () => {
    const vo =
      "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one.";
    const result = at(checkHookDuration(withHook(vo)));
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("预估");
    expect(result.fix).toContain("删词");
  });

  it("passes non-hook first scenes", () => {
    const result = at(
      checkHookDuration([{ id: 1, visualType: "narrative", voiceover: "Anything." }]),
    );
    expect(result.level).toBe("pass");
  });
});

// ── editorial wiring ────────────────────────────────────────────────────────

describe("runAllSceneDataChecks — hook spec is advisory-only", () => {
  it("routes both hook-spec checks into the editorial bucket", () => {
    const results = runAllSceneDataChecks(
      withHook("DeepSeek open-sourced the code that runs its models."),
      null,
    );
    const family = results.editorial.find((r) => r.check.includes("Hook sentence family"));
    const duration = results.editorial.find((r) => r.check.includes("Hook duration"));
    expect(family).toBeDefined();
    expect(duration).toBeDefined();
    expect(family.level).toBe("advisory");
    expect(duration.level).toBe("advisory");
    expect(results.fail.find((r) => r.check.includes("Hook sentence family"))).toBeUndefined();
    expect(results.fail.find((r) => r.check.includes("Hook duration"))).toBeUndefined();
  });
});
