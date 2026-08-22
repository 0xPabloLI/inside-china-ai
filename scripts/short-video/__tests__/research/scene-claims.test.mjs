import { describe, it, expect } from "vitest";
import {
  getClaimIdsForScene,
  validateSceneClaimIds,
  validateAllSceneClaimIds,
  getAllClaimIds,
} from "../../lib/research/scene-claims.mjs";

// ─── getClaimIdsForScene ───

describe("getClaimIdsForScene", () => {
  it("returns claim IDs when present", () => {
    const scene = { claimIds: ["c1", "c2", "c3"] };
    expect(getClaimIdsForScene(scene)).toEqual(["c1", "c2", "c3"]);
  });

  it("returns empty array when claimIds absent", () => {
    const scene = { voiceover: "hello", visualType: "hook" };
    expect(getClaimIdsForScene(scene)).toEqual([]);
  });

  it("filters out empty strings and non-strings", () => {
    const scene = { claimIds: ["c1", "", null, 42, "c2"] };
    expect(getClaimIdsForScene(scene)).toEqual(["c1", "c2"]);
  });

  it("returns empty array for null/undefined scene", () => {
    expect(getClaimIdsForScene(null)).toEqual([]);
    expect(getClaimIdsForScene(undefined)).toEqual([]);
  });

  it("returns empty array when claimIds is not an array", () => {
    const scene = { claimIds: "c1" };
    expect(getClaimIdsForScene(scene)).toEqual([]);
  });
});

// ─── validateSceneClaimIds ───

describe("validateSceneClaimIds", () => {
  it("passes when claimIds is absent (backward compatible)", () => {
    const scene = { voiceover: "hello", visualType: "content" };
    const result = validateSceneClaimIds(scene);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes when claimIds is a valid array of strings", () => {
    const scene = { claimIds: ["c1", "c2"] };
    const result = validateSceneClaimIds(scene);
    expect(result.valid).toBe(true);
  });

  it("passes when claimIds is an empty array", () => {
    const scene = { claimIds: [] };
    const result = validateSceneClaimIds(scene);
    expect(result.valid).toBe(true);
  });

  it("fails when claimIds is not an array", () => {
    const scene = { claimIds: "c1" };
    const result = validateSceneClaimIds(scene);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("must be an array");
  });

  it("fails when a claimId is an empty string", () => {
    const scene = { claimIds: ["c1", ""] };
    const result = validateSceneClaimIds(scene);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("non-empty string");
  });

  it("fails when a claimId is not a string", () => {
    const scene = { claimIds: ["c1", 42] };
    const result = validateSceneClaimIds(scene);
    expect(result.valid).toBe(false);
  });

  it("passes for null scene (nothing to validate)", () => {
    const result = validateSceneClaimIds(null);
    expect(result.valid).toBe(true);
  });
});

// ─── validateAllSceneClaimIds ───

describe("validateAllSceneClaimIds", () => {
  it("passes for a mixed array (some with claimIds, some without)", () => {
    const scenes = [
      { visualType: "hook", voiceover: "Breaking news" },
      { visualType: "content", voiceover: "DeepSeek raised $1.4B", claimIds: ["c1"] },
      { visualType: "cta", voiceover: "Follow for more" },
    ];
    const result = validateAllSceneClaimIds(scenes);
    expect(result.valid).toBe(true);
    expect(result.scenesWithClaims).toBe(1);
  });

  it("passes when no scenes have claimIds (backward compat)", () => {
    const scenes = [
      { visualType: "hook", voiceover: "Breaking" },
      { visualType: "cta", voiceover: "Follow" },
    ];
    const result = validateAllSceneClaimIds(scenes);
    expect(result.valid).toBe(true);
    expect(result.scenesWithClaims).toBe(0);
  });

  it("fails when one scene has invalid claimIds", () => {
    const scenes = [
      { visualType: "content", claimIds: ["c1"] },
      { visualType: "content", claimIds: ["c2", 123] }, // Invalid
    ];
    const result = validateAllSceneClaimIds(scenes);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns valid=true for empty array", () => {
    const result = validateAllSceneClaimIds([]);
    expect(result.valid).toBe(true);
    expect(result.scenesWithClaims).toBe(0);
  });

  it("returns valid=true for non-array input", () => {
    expect(validateAllSceneClaimIds(null).valid).toBe(true);
    expect(validateAllSceneClaimIds("not-array").valid).toBe(true);
  });
});

// ─── getAllClaimIds ───

describe("getAllClaimIds", () => {
  it("collects all unique claim IDs across scenes", () => {
    const scenes = [
      { claimIds: ["c1", "c2"] },
      { claimIds: ["c2", "c3"] }, // c2 is duplicate
      { claimIds: ["c4"] },
      { voiceover: "no claims" }, // No claimIds
    ];
    const all = getAllClaimIds(scenes);
    expect(all).toHaveLength(4);
    expect(all).toContain("c1");
    expect(all).toContain("c2");
    expect(all).toContain("c3");
    expect(all).toContain("c4");
  });

  it("returns empty array when no scenes have claimIds", () => {
    const scenes = [{ voiceover: "hello" }, { voiceover: "world" }];
    expect(getAllClaimIds(scenes)).toEqual([]);
  });

  it("returns empty array for non-array input", () => {
    expect(getAllClaimIds(null)).toEqual([]);
    expect(getAllClaimIds("not-array")).toEqual([]);
  });
});
