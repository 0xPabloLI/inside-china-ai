import { describe, it, expect } from "vitest";
import {
  assignAssetsToScenes,
  scoreRelevanceOverlap,
  makeRelevance,
  RELEVANCE_SOURCE,
} from "../lib/asset-sourcer.mjs";

// ── Fixtures ──

const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover: "Qwen4 beats Claude at coding with six billion active parameters.",
    assetNeed: "coding benchmark chart",
  },
  {
    id: 2,
    name: "open-weights",
    visualType: "narrative",
    voiceover: "Open weights published on Hugging Face for free download.",
    assetNeed: "hugging face model page",
  },
  {
    id: 3,
    name: "context",
    visualType: "quote",
    voiceover: "Alibaba previews the architecture that will underpin Qwen4.",
  },
  { id: 4, name: "specs", visualType: "data", voiceover: "Numbers only." },
  { id: 5, name: "cta", visualType: "cta", voiceover: "Follow for more." },
];

const img = (over = {}) => ({
  type: "image",
  path: "assets/new.jpg",
  url: "https://fresh.example/new.jpg",
  score: 80,
  fit: "cover",
  ...over,
});

const THRESHOLD = { relevanceThreshold: 60 };

// ── Legacy behavior (no opts) ──

describe("assignAssetsToScenes — legacy mode (no opts)", () => {
  it("assigns without any relevance gate, binding, or cap", () => {
    const assets = [img({ description: "an alipay qr code", subjects: [] })];
    const result = assignAssetsToScenes(assets, scenes);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("assigned");
    expect(result[0].sceneId).toBe(1); // score>=60 + fit=cover → hook takes it first
  });
});

// ── Relevance gate ──

describe("assignAssetsToScenes — relevance gate", () => {
  it("rejects a claim-bound asset whose VLM relevance is below threshold", () => {
    const assets = [
      img({ claimSceneId: 1, relevanceScore: 30, relevanceReason: "unrelated product shot" }),
    ];
    const result = assignAssetsToScenes(assets, scenes, THRESHOLD);
    expect(result[0].status).toBe("unassigned");
    expect(result[0].reason).toMatch(/below threshold/i);
  });

  it("accepts at exactly the threshold (>= semantics)", () => {
    const assets = [img({ claimSceneId: 1, relevanceScore: 60, relevanceReason: "borderline" })];
    const result = assignAssetsToScenes(assets, scenes, THRESHOLD);
    expect(result[0].status).toBe("assigned");
    expect(result[0].sceneId).toBe(1);
    expect(result[0].relevanceScore).toBe(60);
    expect(result[0].relevanceSource).toBe("vlm");
    expect(result[0].relevanceReason).toBe("borderline");
  });

  it("fails closed when VLM relevance is missing (null/undefined) for a claim-bound asset", () => {
    const assets = [img({ claimSceneId: 1 })];
    const result = assignAssetsToScenes(assets, scenes, THRESHOLD);
    expect(result[0].status).toBe("unassigned");
    expect(result[0].reason).toMatch(/fail-closed|missing/i);
  });

  it("binds claim assets to their scene and never spills to other scenes", () => {
    // Scene 1 already has manual media → binding target unavailable → unassigned
    const scenesWithManualHook = scenes.map((s) =>
      s.id === 1 ? { ...s, media: { type: "image", path: "assets/manual.jpg" } } : s,
    );
    const assets = [img({ claimSceneId: 1, relevanceScore: 90 })];
    const result = assignAssetsToScenes(assets, scenesWithManualHook, THRESHOLD);
    expect(result[0].status).toBe("unassigned");
    expect(result.find((r) => r.sceneId != null)).toBeUndefined();
  });

  it("gates fallback assets per scene via token overlap and rejects when all scenes fail", () => {
    const assets = [
      img({ description: "alipay qr code payment", subjects: ["alipay", "qr code"] }),
    ];
    const result = assignAssetsToScenes(assets, scenes, THRESHOLD);
    expect(result[0].status).toBe("unassigned");
    expect(result[0].reason).toMatch(/relevance/i);
  });

  it("assigns a fallback asset to the first scene whose overlap clears the threshold", () => {
    const assets = [
      img({
        description: "hugging face model page screenshot showing open weights download",
        subjects: ["hugging face", "open weights", "model page"],
      }),
    ];
    const result = assignAssetsToScenes(assets, scenes, THRESHOLD);
    expect(result[0].status).toBe("assigned");
    expect(result[0].sceneId).toBe(2);
    expect(result[0].relevanceSource).toBe("overlap");
  });

  it("stacks the relevance gate on top of the hook gates (score + fit=cover)", () => {
    const relevantButWeak = img({
      claimSceneId: 1,
      relevanceScore: 95,
      score: 40, // below HOOK_MIN_SCORE
      fit: "cover",
    });
    const result = assignAssetsToScenes([relevantButWeak], scenes, THRESHOLD);
    // hook rejects on score → asset should not land on hook; not eligible
    // for other scenes either (claim-bound) → unassigned
    expect(result[0].status).toBe("unassigned");

    const containAsset = img({ claimSceneId: 1, relevanceScore: 95, score: 90, fit: "contain" });
    const result2 = assignAssetsToScenes([containAsset], scenes, THRESHOLD);
    expect(result2[0].status).toBe("unassigned");
  });

  it("never assigns to NO_MEDIA_TYPES scenes or scenes with manual media", () => {
    const assets = [
      img({
        description: "hugging face model page screenshot showing open weights download",
        subjects: ["hugging face", "open weights", "model page"],
      }),
    ];
    const result = assignAssetsToScenes(assets, scenes, THRESHOLD);
    const assignedScene = result[0];
    expect([4, 5]).not.toContain(assignedScene.sceneId);
  });
});

// ── Reused cap (online greedy) ──

describe("assignAssetsToScenes — reused cap", () => {
  // 5 identical eligible narrative scenes so fallback assets fill them in
  // order without fighting over hook gates or claim bindings.
  const capScenes = [1, 2, 3, 4, 5].map((id) => ({
    id,
    name: `n${id}`,
    visualType: "narrative",
    voiceover: "hugging face open weights free download",
    assetNeed: "",
  }));
  const relevantFallback = (over) =>
    img({
      description: "hugging face open weights download page screenshot",
      subjects: [],
      ...over,
    });
  const CAP_OPTS = {
    ...THRESHOLD,
    usedIndex: { hashes: new Set(), urls: new Set() },
  };

  it("accepts a reused asset while the running ratio stays <= 40%", () => {
    // 3 fresh first → reused 4th: (0+1)/(3+1)=0.25 <= 0.4 → accepted
    const assets = [
      relevantFallback({ path: "assets/f1.jpg" }),
      relevantFallback({ path: "assets/f2.jpg" }),
      relevantFallback({ path: "assets/f3.jpg" }),
      relevantFallback({ path: "assets/r1.jpg", url: "https://old.example/1.jpg", reused: true }),
    ];
    const result = assignAssetsToScenes(assets, capScenes, CAP_OPTS);
    expect(result.filter((r) => r.status === "assigned")).toHaveLength(4);
  });

  it("rejects a reused asset that would push the ratio above 40% and keeps accepting fresh ones", () => {
    const assets = [
      relevantFallback({ path: "assets/f1.jpg" }),
      relevantFallback({ path: "assets/r1.jpg", reused: true }), // (0+1)/(1+1)=0.5 > 0.4 → reject
      relevantFallback({ path: "assets/f2.jpg" }),
    ];
    const result = assignAssetsToScenes(assets, capScenes, CAP_OPTS);
    const byPath = Object.fromEntries(result.map((r) => [r.media?.path ?? r.path, r]));
    expect(byPath["assets/f1.jpg"].status).toBe("assigned");
    expect(byPath["assets/r1.jpg"].status).toBe("unassigned");
    expect(byPath["assets/r1.jpg"].reason).toMatch(/reuse/i);
    expect(byPath["assets/f2.jpg"].status).toBe("assigned");
  });

  it("ends with zero assignments when every candidate is reused", () => {
    const assets = [
      relevantFallback({ path: "assets/r1.jpg", reused: true }),
      relevantFallback({ path: "assets/r2.jpg", reused: true }),
    ];
    const result = assignAssetsToScenes(assets, capScenes, CAP_OPTS);
    expect(result.every((r) => r.status === "unassigned")).toBe(true);
  });

  it("marks reused flag on assigned entries", () => {
    const assets = [
      relevantFallback({ path: "assets/f1.jpg" }),
      relevantFallback({ path: "assets/f2.jpg" }),
      relevantFallback({ path: "assets/r1.jpg", url: "https://old.example/1.jpg", reused: true }),
    ];
    const result = assignAssetsToScenes(assets, capScenes, CAP_OPTS);
    const reusedEntry = result.find((r) => r.media?.path === "assets/r1.jpg");
    expect(reusedEntry.status).toBe("assigned");
    expect(reusedEntry.reused).toBe(true);
    expect(result.filter((r) => r.reused === true)).toHaveLength(1);
  });
});

// ── scoreRelevanceOverlap ──

describe("scoreRelevanceOverlap", () => {
  it("scores 100 when asset description covers the scene claim", () => {
    const asset = {
      description:
        "hugging face model page showing published open weights available for free download",
      subjects: [],
    };
    const scene = {
      voiceover: "Open weights published on Hugging Face for free download.",
      assetNeed: "hugging face model page",
    };
    // Worked example: scene tokens {open, weights, published, hugging, face,
    // free, download, model, page} = 9; asset covers all 9 → 100.
    expect(scoreRelevanceOverlap(asset, scene)).toBe(100);
  });

  it("scores partially for partial coverage and 0 for unrelated content", () => {
    const scene = { voiceover: "open weights on hugging face", assetNeed: "" };
    const partial = { description: "hugging face logo", subjects: [] };
    const unrelated = { description: "balloon parade in a plaza", subjects: [] };
    const p = scoreRelevanceOverlap(partial, scene);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(100);
    expect(scoreRelevanceOverlap(unrelated, scene)).toBe(0);
  });

  it("handles missing fields gracefully", () => {
    expect(scoreRelevanceOverlap({}, {})).toBe(0);
    expect(scoreRelevanceOverlap(null, null)).toBe(0);
  });
});

// ── makeRelevance / RELEVANCE_SOURCE contract ──

describe("makeRelevance — relevance field group factory", () => {
  it("builds the flat patch-entry field group from structured inputs", () => {
    expect(
      makeRelevance({
        score: 80,
        source: RELEVANCE_SOURCE.VLM,
        reason: "shows the benchmark chart",
        reused: false,
      }),
    ).toEqual({
      relevanceScore: 80,
      relevanceSource: "vlm",
      relevanceReason: "shows the benchmark chart",
      reused: false,
    });
  });

  it("preserves the ||-semantics: falsy reason ('' or null) becomes null", () => {
    expect(
      makeRelevance({ score: 0, source: RELEVANCE_SOURCE.OVERLAP, reason: "", reused: true })
        .relevanceReason,
    ).toBe(null);
    expect(
      makeRelevance({ score: 0, source: RELEVANCE_SOURCE.OVERLAP, reason: null, reused: true })
        .relevanceReason,
    ).toBe(null);
    expect(
      makeRelevance({ score: 0, source: RELEVANCE_SOURCE.OVERLAP, reason: "x", reused: true })
        .relevanceReason,
    ).toBe("x");
  });

  it("exposes the two canonical relevance sources", () => {
    expect(RELEVANCE_SOURCE).toEqual({ VLM: "vlm", OVERLAP: "overlap" });
  });
});

// ─── #192: mediaReject — per-scene asset rejection loop ───

describe("assignAssetsToScenes — mediaReject (#192)", () => {
  it("skips a rejected asset for the rejecting scene, assigns the next best", () => {
    const assets = [
      img({
        path: "assets/rejected.jpg",
        url: "https://x.example/r.jpg",
        description: "stock office",
      }),
      img({
        path: "assets/better.jpg",
        url: "https://x.example/b.jpg",
        description: "stock office",
      }),
    ];
    const rejecting = {
      ...scenes[1],
      mediaReject: { reason: "irrelevant", rejected: ["assets/rejected.jpg"] },
    };
    const result = assignAssetsToScenes(assets, [scenes[0], rejecting, scenes[2]], {
      relevanceThreshold: 0,
    });
    // assets/rejected.jpg must never land on scene 2 (the rejector)
    const rejectedOnScene2 = result.find(
      (r) => r.status === "assigned" && r.sceneId === 2 && r.media?.path === "assets/rejected.jpg",
    );
    expect(rejectedOnScene2).toBeUndefined();
    // The scene still got media — the second asset
    const scene2 = result.find((r) => r.status === "assigned" && r.sceneId === 2);
    expect(scene2?.media?.path).toBe("assets/better.jpg");
  });

  it("matches rejections by URL as well as by path", () => {
    const assets = [img({ path: "assets/a.jpg", url: "https://x.example/a.jpg" })];
    const rejecting = { ...scenes[1], mediaReject: { rejected: ["https://x.example/a.jpg"] } };
    const result = assignAssetsToScenes(assets, [scenes[0], rejecting], { relevanceThreshold: 0 });
    const onScene2 = result.find((r) => r.status === "assigned" && r.sceneId === 2);
    expect(onScene2).toBeUndefined();
  });

  it("a rejected-for-scene-A asset can still be assigned to scene B", () => {
    const assets = [img({ path: "assets/rejected.jpg", description: "stock office" })];
    const rejecting = { ...scenes[1], mediaReject: { rejected: ["assets/rejected.jpg"] } };
    const result = assignAssetsToScenes(assets, [scenes[0], rejecting], { relevanceThreshold: 0 });
    // Scene 1 (hook, score 80 fit cover) is eligible and has no reject flag
    expect(result.find((r) => r.status === "assigned" && r.sceneId === 1)).toBeTruthy();
  });

  it("claim-bound asset rejected by its target scene → unassigned with a reject reason", () => {
    const assets = [img({ claimSceneId: 2, relevanceScore: 90, path: "assets/rejected.jpg" })];
    const rejecting = { ...scenes[1], mediaReject: { rejected: ["assets/rejected.jpg"] } };
    const result = assignAssetsToScenes(assets, [scenes[0], rejecting], THRESHOLD);
    expect(result[0].status).toBe("unassigned");
    expect(result[0].reason).toMatch(/mediaReject/i);
  });

  it("scenes without mediaReject are unaffected", () => {
    const assets = [img({ path: "assets/ok.jpg", description: "stock office" })];
    const result = assignAssetsToScenes(assets, scenes, { relevanceThreshold: 0 });
    expect(result.filter((r) => r.status === "assigned").length).toBeGreaterThan(0);
  });
});
