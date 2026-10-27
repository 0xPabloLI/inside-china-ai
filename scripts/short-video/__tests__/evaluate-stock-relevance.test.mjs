import { describe, it, expect, vi } from "vitest";
import {
  buildClaim,
  evaluateScene,
  isExemptScene,
  normalizeExemption,
  summarizeResults,
} from "../evaluate-stock-relevance.mjs";

const scene = (over = {}) => ({
  id: 2,
  name: "open-loop",
  visualType: "narrative",
  voiceover: "DeepSeek leads a robot round.",
  media: { type: "image", path: "assets/robot.jpg" },
  ...over,
});

describe("buildClaim — the evaluation asks the pipeline's question", () => {
  it("prefers the scene's structured assetNeed", () => {
    const { claim, claimSource } = buildClaim(
      scene({ assetNeed: "humanoid robot prototype in a lab", texts: { company: "UNITREE" } }),
    );
    expect(claimSource).toBe("assetNeed");
    expect(claim.assetNeed).toBe("humanoid robot prototype in a lab");
    expect(claim.voiceover).toBe("DeepSeek leads a robot round.");
  });

  it("falls back to the generated-media prompt", () => {
    expect(buildClaim(scene({ aiImage: { prompt: "a robot arm" } })).claimSource).toBe(
      "aiImage.prompt",
    );
    expect(buildClaim(scene({ aiVideo: { prompt: "a robot walking" } })).claimSource).toBe(
      "aiVideo.prompt",
    );
  });

  it("uses texts only when no declared intent exists", () => {
    const { claim, claimSource } = buildClaim(
      scene({ texts: { company: "UNITREE", action: "WALKS" } }),
    );
    expect(claimSource).toBe("texts");
    expect(claim.assetNeed).toBe("UNITREE. WALKS");
  });

  it("treats a blank assetNeed as absent", () => {
    expect(buildClaim(scene({ assetNeed: "   ", texts: { company: "X" } })).claimSource).toBe(
      "texts",
    );
  });
});

describe("normalizeExemption — the repo-visible waiver channel", () => {
  it("accepts a whole-package string", () => {
    expect(
      normalizeExemption({ stockRelevanceExemption: "published package, not re-rendering" }),
    ).toEqual({ reason: "published package, not re-rendering", scenes: null, dropped: 0 });
  });

  it("accepts an object with a scene list", () => {
    expect(
      normalizeExemption({
        stockRelevanceExemption: { reason: "deliberate", scenes: [2, 7] },
      }),
    ).toEqual({ reason: "deliberate", scenes: [2, 7], dropped: 0 });
  });

  it("accepts a single scene id", () => {
    expect(normalizeExemption({ stockRelevanceExemption: { reason: "x", scenes: 6 } })).toEqual({
      reason: "x",
      scenes: [6],
      dropped: 0,
    });
  });

  it("ignores a waiver without a reviewable reason", () => {
    expect(normalizeExemption({ stockRelevanceExemption: { scenes: [2] } })).toBe(null);
    expect(normalizeExemption({ stockRelevanceExemption: "   " })).toBe(null);
    expect(normalizeExemption({})).toBe(null);
  });

  it("keeps an empty scene list as 'no scenes', not 'whole package'", () => {
    expect(normalizeExemption({ stockRelevanceExemption: { reason: "x", scenes: [] } })).toEqual({
      reason: "x",
      scenes: [],
      dropped: 0,
    });
  });

  it("drops malformed ids instead of widening the waiver to the whole package", () => {
    const exemption = normalizeExemption({
      stockRelevanceExemption: { reason: "x", scenes: ["6", -1, 2.5, 9] },
    });
    expect(exemption).toEqual({ reason: "x", scenes: [9], dropped: 3 });
    expect(isExemptScene(2, exemption)).toBe(false);
    expect(isExemptScene(9, exemption)).toBe(true);
  });

  it("scopes the waiver to the listed scenes", () => {
    const exemption = { reason: "x", scenes: [2] };
    expect(isExemptScene(2, exemption)).toBe(true);
    expect(isExemptScene(3, exemption)).toBe(false);
    expect(isExemptScene(2, { reason: "x", scenes: null })).toBe(true);
    expect(isExemptScene(2, null)).toBe(false);
  });
});

describe("evaluateScene — tri-state verdict + second pass", () => {
  const contentDir = "/tmp/content";

  it("admits an image that clears the bar on the first pass", async () => {
    const analyze = vi.fn().mockResolvedValue({
      relevance: 80,
      relevanceReason: "robot lab matches the claim",
    });
    const result = await evaluateScene(scene(), contentDir, analyze);

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("PASS");
    expect(result.band).toBe("pass");
    expect(result.admittedBy).toBe("score");
    expect(result.passed).toBe(true);
    expect(result.claimSource).toBe("texts");
  });

  it("runs the subject check on a borderline score and admits on match", async () => {
    const analyze = vi
      .fn()
      .mockResolvedValueOnce({ relevance: 50, relevanceReason: "topically correct" })
      .mockResolvedValueOnce({ subjectMatch: "match", reason: "robot subject" });

    const result = await evaluateScene(scene(), contentDir, analyze);

    expect(analyze).toHaveBeenCalledTimes(2);
    expect(analyze.mock.calls[1][1]).toMatchObject({ relevanceCheck: true });
    expect(result.status).toBe("PASS (second-pass)");
    expect(result.admittedBy).toBe("second-pass");
    expect(result.relevance).toBe(50);
    expect(result.subjectMatch).toBe("match");
  });

  it("keeps a borderline image failed when the subject check says no_match", async () => {
    const analyze = vi
      .fn()
      .mockResolvedValueOnce({ relevance: 50 })
      .mockResolvedValueOnce({ subjectMatch: "no_match", reason: "different subject" });

    const result = await evaluateScene(scene(), contentDir, analyze);

    expect(result.status).toBe("FAIL");
    expect(result.admittedBy).toBe(null);
    expect(result.subjectMatch).toBe("no_match");
  });

  it("records a failed subject check as a null verdict and stays closed", async () => {
    const analyze = vi
      .fn()
      .mockResolvedValueOnce({ relevance: 50 })
      .mockRejectedValueOnce(new Error("worker timeout"));

    const result = await evaluateScene(scene(), contentDir, analyze);

    expect(result.admittedBy).toBe(null);
    expect(result.subjectMatch).toBe(null);
    expect(result.subjectReason).toMatch(/timeout/);
  });

  it("reports a null score as unavailable, not as a failed image", async () => {
    const analyze = vi.fn().mockResolvedValue({
      relevance: null,
      relevanceReason: "directly shows the download page",
    });
    const result = await evaluateScene(scene(), contentDir, analyze);

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.band).toBe("unavailable");
    expect(result.admittedBy).toBe(null);
    expect(result.reason).toMatch(/download page/);
  });

  it("does not run the subject check below the borderline floor", async () => {
    const analyze = vi.fn().mockResolvedValue({ relevance: 0 });
    const result = await evaluateScene(scene(), contentDir, analyze);

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("FAIL");
    expect(result.band).toBe("low");
  });
});

describe("summarizeResults — package-level rollup", () => {
  it("counts passes, second-pass admissions, failures and exemptions", () => {
    const summary = summarizeResults([
      { relevance: 80, band: "pass", admittedBy: "score", exempted: false },
      {
        relevance: 50,
        band: "borderline",
        admittedBy: "second-pass",
        subjectMatch: "match",
        exempted: false,
      },
      { relevance: 50, band: "borderline", admittedBy: null, exempted: false },
      { relevance: 0, band: "low", admittedBy: null, exempted: false },
      { relevance: null, band: "unavailable", admittedBy: null, exempted: false },
      { relevance: null, band: null, admittedBy: null, exempted: true },
    ]);

    expect(summary).toMatchObject({
      evaluated: 5,
      passed: 1,
      borderlineAdmitted: 1,
      failed: 2,
      unavailable: 1,
      exempted: 1,
      ceiling: 80,
      verdict: "satisfiable",
    });
  });

  it("calls a package with no admissible image unsatisfiable", () => {
    expect(
      summarizeResults([
        { relevance: 50, band: "borderline", admittedBy: null, exempted: false },
        { relevance: 0, band: "low", admittedBy: null, exempted: false },
      ]).verdict,
    ).toBe("unsatisfiable");
  });

  it("calls a package with no parseable score unavailable", () => {
    expect(
      summarizeResults([
        { relevance: null, band: "unavailable", admittedBy: null, exempted: false },
      ]).verdict,
    ).toBe("unavailable");
  });

  it("reports no verdict when the waiver covers every image", () => {
    const summary = summarizeResults([
      { relevance: null, band: null, admittedBy: null, exempted: true },
    ]);
    expect(summary.evaluated).toBe(0);
    expect(summary.verdict).toBeNull();
    expect(summary.ceiling).toBeNull();
  });
});
