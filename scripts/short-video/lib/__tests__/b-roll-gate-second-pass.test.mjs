import { describe, test, expect } from "vitest";

import { pickWinner, scoreCandidates } from "../b-roll/gate.mjs";

/**
 * #1296 follow-up: the b-roll gate now runs the #294 subject question as a
 * second pass. The 2026-11-13 measurement that forced it:
 *
 *   baidu-token-exchange  scene 2  keynote stage   relevance 0/0  (rejected)
 *                         scene 3  data-centre isle relevance 50/50 (rejected)
 *                         scene 5  fingerprint       relevance 80/80 (won)
 *
 * Both rejected frames were exactly what their prompts asked for. The first
 * question demands the claim's specific entity; every T2I prompt forbids logos
 * and text, so the entity can never appear. These tests pin the fix.
 */

const FILE = "/tmp/b-roll/scene-2-seed1024.png";
const OTHER = "/tmp/b-roll/scene-2-seed1025.png";

/** Routes first-pass and subject-check calls to separate handlers by `opts`. */
function routedAnalyzer({ first, subject }) {
  return async (path, opts) => (opts?.relevanceCheck ? subject(path, opts) : first(path, opts));
}

describe("scoreCandidates second pass", () => {
  test("a frame the generator was told to draw is admitted when the subject check matches", async () => {
    const analyzer = routedAnalyzer({
      first: () => ({ relevance: 0, relevanceReason: "no identifiable company" }),
      subject: () => ({ subjectMatch: "match", subjectMatchReason: "keynote stage as prompted" }),
    });
    const [scored] = await scoreCandidates([{ seed: 1024, file: FILE }], {
      analyzer,
      claim: {
        voiceover: "Li Yanhong unveiled it",
        assetNeed: "keynote stage, silhouetted speaker",
      },
      secondPass: { claim: { assetNeed: "keynote stage, silhouetted speaker" }, floor: 0 },
    });
    expect(scored.passed).toBe(true);
    expect(scored.admission).toBe("second-pass");
    expect(scored.relevance).toBe(0); // the first-pass number is preserved for audit
    expect(scored.secondPass.verdict).toBe("match");
  });

  test("a frame that misses the prompt's subject stays closed", async () => {
    const analyzer = routedAnalyzer({
      first: () => ({ relevance: 0 }),
      subject: () => ({ subjectMatch: "no_match", subjectMatchReason: "an empty corridor" }),
    });
    const [scored] = await scoreCandidates([{ seed: 1024, file: FILE }], {
      analyzer,
      claim: { voiceover: "v", assetNeed: "keynote stage" },
      secondPass: { claim: { assetNeed: "keynote stage" }, floor: 0 },
    });
    expect(scored.passed).toBe(false);
    expect(scored.admission).toBeUndefined();
    expect(scored.secondPass.verdict).toBe("no_match");
  });

  test("the subject question is asked against assetNeed only, never the voiceover", async () => {
    const seen = [];
    const analyzer = routedAnalyzer({
      first: () => ({ relevance: 0 }),
      subject: (path, opts) => {
        seen.push(opts.claim);
        return { subjectMatch: "match" };
      },
    });
    await scoreCandidates([{ seed: 1024, file: FILE }], {
      analyzer,
      claim: { voiceover: "Li Yanhong unveiled it", assetNeed: "keynote stage" },
      secondPass: { claim: { assetNeed: "keynote stage" }, floor: 0 },
    });
    expect(seen).toEqual([{ assetNeed: "keynote stage" }]);
    expect(seen[0]).not.toHaveProperty("voiceover");
  });

  test("a candidate that already passed is not re-checked", async () => {
    let subjectCalls = 0;
    const analyzer = routedAnalyzer({
      first: () => ({ relevance: 80 }),
      subject: () => {
        subjectCalls += 1;
        return { subjectMatch: "match" };
      },
    });
    const [scored] = await scoreCandidates([{ seed: 1024, file: FILE }], {
      analyzer,
      claim: { voiceover: "v", assetNeed: "p" },
      secondPass: { claim: { assetNeed: "p" }, floor: 0 },
    });
    expect(scored.admission).toBe("score");
    expect(subjectCalls).toBe(0);
    expect(scored.secondPass).toBeUndefined();
  });

  test("a null first-pass score is fail-closed even with a matching subject check", async () => {
    // The analyzer failed on the first call. Running the second pass would launder
    // a tool failure into an admission — the candidate has no content verdict.
    let subjectCalls = 0;
    const analyzer = routedAnalyzer({
      first: () => ({ relevance: null }),
      subject: () => {
        subjectCalls += 1;
        return { subjectMatch: "match" };
      },
    });
    const [scored] = await scoreCandidates([{ seed: 1024, file: FILE }], {
      analyzer,
      claim: { voiceover: "v", assetNeed: "p" },
      secondPass: { claim: { assetNeed: "p" }, floor: 0 },
    });
    expect(scored.passed).toBe(false);
    expect(subjectCalls).toBe(0);
  });

  test("a throwing subject check is fail-closed and keeps its reason", async () => {
    const analyzer = routedAnalyzer({
      first: () => ({ relevance: 50 }),
      subject: () => {
        throw new Error("vlm crashed");
      },
    });
    const [scored] = await scoreCandidates([{ seed: 1024, file: FILE }], {
      analyzer,
      claim: { voiceover: "v", assetNeed: "p" },
      secondPass: { claim: { assetNeed: "p" }, floor: 0 },
    });
    expect(scored.passed).toBe(false);
    expect(scored.secondPass.verdict).toBeNull();
    expect(scored.secondPass.reason).toMatch(/second pass error/i);
  });

  test("floor defaults to the borderline band, so a stock-photo 20 is not re-asked", async () => {
    let subjectCalls = 0;
    const analyzer = routedAnalyzer({
      first: () => ({ relevance: 20 }),
      subject: () => {
        subjectCalls += 1;
        return { subjectMatch: "match" };
      },
    });
    const [scored] = await scoreCandidates([{ seed: 1024, file: FILE }], {
      analyzer,
      claim: { voiceover: "v", assetNeed: "p" },
      secondPass: { claim: { assetNeed: "p" } },
    });
    expect(subjectCalls).toBe(0);
    expect(scored.passed).toBe(false);
  });

  test("without secondPass the gate behaves exactly as before", async () => {
    const analyzer = async () => ({ relevance: 0 });
    const [scored] = await scoreCandidates([{ seed: 1024, file: FILE }], {
      analyzer,
      claim: { voiceover: "v", assetNeed: "p" },
    });
    expect(scored.passed).toBe(false);
    expect(scored.secondPass).toBeUndefined();
  });
});

describe("pickWinner with a second-pass admission", () => {
  const rows = (list) =>
    list.map((r) => ({
      seed: r.seed,
      file: `f${r.seed}.png`,
      relevance: r.relevance,
      reason: "",
      passed: true,
      admission: r.admission,
    }));

  test("a wider-question pass outranks a subject-only pass at equal relevance", () => {
    const winner = pickWinner(
      rows([
        { seed: 1024, relevance: 50, admission: "second-pass" },
        { seed: 1025, relevance: 50, admission: "score" },
      ]),
    );
    expect(winner.seed).toBe(1025);
  });

  test("relevance still decides when both admissions are the same kind", () => {
    const winner = pickWinner(
      rows([
        { seed: 1024, relevance: 0, admission: "second-pass" },
        { seed: 1025, relevance: 50, admission: "second-pass" },
      ]),
    );
    expect(winner.seed).toBe(1025);
  });

  test("subject-only admissions still lose to a higher first-pass score", () => {
    const winner = pickWinner(
      rows([
        { seed: 1024, relevance: 90, admission: "score" },
        { seed: 1025, relevance: 0, admission: "second-pass" },
      ]),
    );
    expect(winner.seed).toBe(1024);
  });
});
