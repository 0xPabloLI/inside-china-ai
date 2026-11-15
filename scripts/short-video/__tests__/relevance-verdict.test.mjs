import { describe, it, expect } from "vitest";
import {
  BORDERLINE_FLOOR,
  DEFAULT_RELEVANCE_THRESHOLD,
  POOL_VERDICT,
  RELEVANCE_BAND,
  admissionSource,
  classifyPool,
  classifyRelevance,
  isRelevanceAdmitted,
  needsSecondPass,
} from "../lib/relevance-verdict.mjs";

describe("classifyRelevance — score bands", () => {
  it("passes at and above the threshold", () => {
    expect(classifyRelevance(60)).toBe(RELEVANCE_BAND.PASS);
    expect(classifyRelevance(100)).toBe(RELEVANCE_BAND.PASS);
  });

  it("marks 40-59 as borderline (inclusive on both ends of the band)", () => {
    expect(classifyRelevance(40)).toBe(RELEVANCE_BAND.BORDERLINE);
    expect(classifyRelevance(59)).toBe(RELEVANCE_BAND.BORDERLINE);
    expect(classifyRelevance(50)).toBe(RELEVANCE_BAND.BORDERLINE);
  });

  it("marks below 40 as low", () => {
    expect(classifyRelevance(39)).toBe(RELEVANCE_BAND.LOW);
    expect(classifyRelevance(0)).toBe(RELEVANCE_BAND.LOW);
  });

  it("treats null / undefined / non-finite as unavailable, not low", () => {
    for (const value of [null, undefined, NaN, Infinity, "60", {}]) {
      expect(classifyRelevance(value)).toBe(RELEVANCE_BAND.UNAVAILABLE);
    }
  });

  it("honours custom threshold and floor", () => {
    expect(classifyRelevance(70, { threshold: 80, borderlineFloor: 60 })).toBe(
      RELEVANCE_BAND.BORDERLINE,
    );
    expect(classifyRelevance(59, { threshold: 80, borderlineFloor: 60 })).toBe(RELEVANCE_BAND.LOW);
  });

  it("keeps the historical threshold and the ticket's borderline floor", () => {
    expect(DEFAULT_RELEVANCE_THRESHOLD).toBe(60);
    expect(BORDERLINE_FLOOR).toBe(40);
  });
});

describe("needsSecondPass — which first-pass scores earn a subject check", () => {
  it("asks for a second pass on a borderline score without a check", () => {
    expect(needsSecondPass({ relevanceScore: 50 })).toBe(true);
  });

  it("does not ask again when a check is already recorded", () => {
    expect(needsSecondPass({ relevanceScore: 50, relevanceCheck: { verdict: "no_match" } })).toBe(
      false,
    );
  });

  it("does not ask for pass, low or unavailable scores", () => {
    expect(needsSecondPass({ relevanceScore: 80 })).toBe(false);
    expect(needsSecondPass({ relevanceScore: 20 })).toBe(false);
    expect(needsSecondPass({ relevanceScore: null })).toBe(false);
  });
});

describe("classifyPool — satisfiability of one scene's candidate set", () => {
  it("is satisfiable when any candidate clears the threshold", () => {
    expect(classifyPool([0, 50, 80]).verdict).toBe(POOL_VERDICT.SATISFIABLE);
    expect(classifyPool([0, 50, 80]).ceiling).toBe(80);
  });

  it("is unsatisfiable when the pool ceiling is below the threshold", () => {
    const pool = classifyPool([0, 50, 50]);
    expect(pool.verdict).toBe(POOL_VERDICT.UNSATISFIABLE);
    expect(pool.ceiling).toBe(50);
    expect(pool.count).toBe(3);
  });

  it("is unavailable when no candidate produced a score", () => {
    expect(classifyPool([null, undefined]).verdict).toBe(POOL_VERDICT.UNAVAILABLE);
    expect(classifyPool([]).verdict).toBe(POOL_VERDICT.UNAVAILABLE);
    expect(classifyPool([]).ceiling).toBe(null);
  });

  it("ignores unparseable entries when a numeric score exists", () => {
    const pool = classifyPool([null, 55]);
    expect(pool.verdict).toBe(POOL_VERDICT.UNSATISFIABLE);
    expect(pool.ceiling).toBe(55);
    expect(pool.count).toBe(1);
  });

  it("is satisfiable when the best candidate is a borderline score that passed its check", () => {
    const pool = classifyPool([
      { relevanceScore: 0 },
      { relevanceScore: 50, relevanceCheck: { verdict: "match" } },
    ]);
    expect(pool.verdict).toBe(POOL_VERDICT.SATISFIABLE);
    expect(pool.ceiling).toBe(50);
    expect(pool.admitted).toBe(1);
  });

  it("stays unsatisfiable when the borderline candidate has no match", () => {
    for (const check of [null, { verdict: "no_match" }, { verdict: null }]) {
      const pool = classifyPool([
        { relevanceScore: 50, relevanceCheck: check },
        { relevanceScore: 55 },
      ]);
      expect(pool.verdict).toBe(POOL_VERDICT.UNSATISFIABLE);
      expect(pool.admitted).toBe(0);
    }
  });
});

describe("isRelevanceAdmitted — the single admission rule", () => {
  it("admits a first-pass pass", () => {
    expect(isRelevanceAdmitted({ relevanceScore: 60 })).toBe(true);
  });

  it("admits a borderline candidate only when the second pass says match", () => {
    expect(isRelevanceAdmitted({ relevanceScore: 50, relevanceCheck: { verdict: "match" } })).toBe(
      true,
    );
    expect(
      isRelevanceAdmitted({ relevanceScore: 50, relevanceCheck: { verdict: "no_match" } }),
    ).toBe(false);
    expect(isRelevanceAdmitted({ relevanceScore: 50 })).toBe(false);
  });

  it("never promotes a low or unavailable score, even with a match", () => {
    expect(isRelevanceAdmitted({ relevanceScore: 0, relevanceCheck: { verdict: "match" } })).toBe(
      false,
    );
    expect(
      isRelevanceAdmitted({ relevanceScore: null, relevanceCheck: { verdict: "match" } }),
    ).toBe(false);
  });
});

describe("admissionSource — patch-entry provenance", () => {
  it("names the path that admitted the asset", () => {
    expect(admissionSource({ relevanceScore: 80 })).toBe("score");
    expect(admissionSource({ relevanceScore: 50, relevanceCheck: { verdict: "match" } })).toBe(
      "second-pass",
    );
  });

  it("returns null when nothing admitted the asset", () => {
    expect(admissionSource({ relevanceScore: 50 })).toBe(null);
    expect(admissionSource({ relevanceScore: null })).toBe(null);
  });
});

describe("needsSecondPass — #1353 evergreen widening", () => {
  it("asks the subject question at every band below a pass for an evergreen claim", () => {
    expect(needsSecondPass({ relevanceScore: 17 }, { claimKind: "evergreen" })).toBe(true);
    expect(needsSecondPass({ relevanceScore: 0 }, { claimKind: "evergreen" })).toBe(true);
    expect(needsSecondPass({ relevanceScore: null }, { claimKind: "evergreen" })).toBe(true);
    expect(needsSecondPass({ relevanceScore: 50 }, { claimKind: "evergreen" })).toBe(true);
  });

  it("still does not re-ask a pass, or a check that already ran", () => {
    expect(needsSecondPass({ relevanceScore: 80 }, { claimKind: "evergreen" })).toBe(false);
    expect(
      needsSecondPass(
        { relevanceScore: 17, relevanceCheck: { verdict: "no_match" } },
        { claimKind: "evergreen" },
      ),
    ).toBe(false);
  });

  it("keeps the news trigger at borderline only — the status quo", () => {
    expect(needsSecondPass({ relevanceScore: 17 }, { claimKind: "news" })).toBe(false);
    expect(needsSecondPass({ relevanceScore: 17 })).toBe(false);
  });
});

describe("admissionSource — #1353 evergreen-subject provenance", () => {
  it("admits a low score rescued by an explicit subject match on an evergreen claim", () => {
    expect(
      admissionSource(
        { relevanceScore: 17, relevanceCheck: { verdict: "match" } },
        { claimKind: "evergreen" },
      ),
    ).toBe("evergreen-subject");
    // An unavailable first pass rescued the same way is admitted too — the
    // subject check is direct VLM evidence, and the trigger deliberately
    // includes the unavailable band for evergreen scenes.
    expect(
      admissionSource(
        { relevanceScore: null, relevanceCheck: { verdict: "match" } },
        { claimKind: "evergreen" },
      ),
    ).toBe("evergreen-subject");
  });

  it("keeps second-pass naming for the borderline band regardless of kind", () => {
    expect(
      admissionSource(
        { relevanceScore: 50, relevanceCheck: { verdict: "match" } },
        { claimKind: "evergreen" },
      ),
    ).toBe("second-pass");
  });

  it("stays closed for news claims and for a failed/absent second pass", () => {
    expect(
      admissionSource(
        { relevanceScore: 17, relevanceCheck: { verdict: "match" } },
        { claimKind: "news" },
      ),
    ).toBe(null);
    expect(
      admissionSource(
        { relevanceScore: 17, relevanceCheck: { verdict: "no_match" } },
        { claimKind: "evergreen" },
      ),
    ).toBe(null);
    expect(admissionSource({ relevanceScore: 17 }, { claimKind: "evergreen" })).toBe(null);
  });

  it("admits through isRelevanceAdmitted under the same rule", () => {
    expect(
      isRelevanceAdmitted(
        { relevanceScore: 17, relevanceCheck: { verdict: "match" } },
        { claimKind: "evergreen" },
      ),
    ).toBe(true);
    expect(isRelevanceAdmitted({ relevanceScore: 17, relevanceCheck: { verdict: "match" } })).toBe(
      false,
    );
  });
});

describe("classifyPool — #1353 kind-aware satisfiability", () => {
  it("reports an evergreen pool with only a subject-match rescue as satisfiable", () => {
    const pool = classifyPool([{ relevanceScore: 17, relevanceCheck: { verdict: "match" } }], {
      claimKind: "evergreen",
    });
    expect(pool.verdict).toBe(POOL_VERDICT.SATISFIABLE);
    expect(pool.admitted).toBe(1);
  });

  it("keeps the news pool verdict fail-closed for the same pool shape", () => {
    const pool = classifyPool([{ relevanceScore: 17, relevanceCheck: { verdict: "match" } }], {
      claimKind: "news",
    });
    expect(pool.verdict).toBe(POOL_VERDICT.UNSATISFIABLE);
    expect(pool.admitted).toBe(0);
  });
});
