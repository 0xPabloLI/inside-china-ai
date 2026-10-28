import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import {
  extractSceneClaims,
  claimToKeywords,
  claimQueryPhrases,
  isUsableSearchHints,
  skipsMediaSourcing,
  extractZhKeywords,
} from "../lib/claim-keywords.mjs";
import { buildQueryGroups } from "../lib/asset-sourcer.mjs";
import { scenes as qwen4Scenes } from "../content/qwen4-preview/scene-data.mjs";
import { scenes as unitreeScenes } from "../content/unitree/scene-data.mjs";

// ── extractSceneClaims ──

describe("extractSceneClaims", () => {
  it("collects scenes with a non-empty assetNeed", () => {
    const scenes = [
      {
        id: 2,
        visualType: "narrative",
        layout: "media-overlay",
        voiceover: "It previews the Qwen4 architecture.",
        assetNeed: "  transformer architecture diagram  ",
      },
    ];
    expect(extractSceneClaims(scenes)).toEqual([
      {
        sceneId: 2,
        assetNeed: "transformer architecture diagram",
        voiceover: "It previews the Qwen4 architecture.",
      },
    ]);
  });

  it("treats empty, whitespace, and missing assetNeed as no explicit claim", () => {
    const scenes = [
      { id: 1, visualType: "narrative", layout: "media-overlay", assetNeed: "" },
      { id: 2, visualType: "narrative", layout: "media-overlay", assetNeed: "   " },
      { id: 3, visualType: "narrative", layout: "media-overlay" },
    ];
    expect(extractSceneClaims(scenes)).toEqual([]);
  });

  it("mediaOptOut wins over assetNeed", () => {
    const scenes = [
      {
        id: 4,
        visualType: "narrative",
        voiceover: "Pure CSS scene.",
        assetNeed: "chip diagram",
        mediaOptOut: true,
      },
    ];
    expect(extractSceneClaims(scenes)).toEqual([]);
  });

  it("excludes NO_MEDIA_TYPES scenes even with assetNeed", () => {
    const scenes = [
      { id: 5, visualType: "cta", voiceover: "Follow!", assetNeed: "logo wall" },
      { id: 6, visualType: "data", voiceover: "Numbers.", assetNeed: "chart" },
      { id: 7, visualType: "stat-reveal", voiceover: "62.5 percent.", assetNeed: "graph" },
    ];
    expect(extractSceneClaims(scenes)).toEqual([]);
  });

  it("handles null/undefined scenes array and real qwen4-preview scene-data", () => {
    expect(extractSceneClaims(null)).toEqual([]);
    expect(extractSceneClaims([])).toEqual([]);
    // Real content smoke: qwen4-preview has no assetNeed, and its only
    // sourcing-eligible scenes (6, 8) already carry bound media — derived
    // supply has nothing to search for, so there are still zero claims.
    expect(extractSceneClaims(qwen4Scenes)).toEqual([]);
  });

  it("derives a claim from the voiceover for a sourcing-eligible scene without media (#354)", () => {
    const voiceover = "Unitree's H1 humanoid walks across a factory floor.";
    expect(
      extractSceneClaims([{ id: 2, visualType: "narrative", layout: "media-overlay", voiceover }]),
    ).toEqual([{ sceneId: 2, assetNeed: "", voiceover }]);
  });

  it("does not derive a claim for a scene that already carries media", () => {
    const scenes = [
      {
        id: 2,
        visualType: "narrative",
        layout: "media-overlay",
        voiceover: "A humanoid robot walks.",
        media: { type: "image", path: "assets/x.jpg" },
      },
    ];
    expect(extractSceneClaims(scenes)).toEqual([]);
  });

  it("derives when a malformed media object carries no path", () => {
    const scenes = [
      {
        id: 7,
        visualType: "narrative",
        layout: "media-overlay",
        voiceover: "A robot arm lifts a block.",
        media: { type: "image" },
      },
    ];
    expect(extractSceneClaims(scenes)).toHaveLength(1);
  });

  it("does not derive supply for generation-only scenes (#354 shares shouldSourceStock)", () => {
    const base = {
      id: 5,
      visualType: "narrative",
      layout: "media-overlay",
      voiceover: "A humanoid robot walks across a factory floor.",
    };
    for (const mediaStrategy of ["b-roll", "ai-image"]) {
      expect(extractSceneClaims([{ ...base, mediaStrategy }])).toEqual([]);
    }
    for (const mediaStrategy of ["asset", "asset-then-broll", "asset-then-ai-image"]) {
      expect(extractSceneClaims([{ ...base, mediaStrategy }])).toHaveLength(1);
    }
  });

  it("keeps an explicit assetNeed on a generation-only scene (writer override until #355)", () => {
    expect(
      extractSceneClaims([
        {
          id: 6,
          visualType: "narrative",
          layout: "media-overlay",
          voiceover: "vo",
          mediaStrategy: "b-roll",
          assetNeed: "benchmark chart",
        },
      ]),
    ).toHaveLength(1);
  });

  it("skips derivation when the scene has no voiceover either", () => {
    expect(
      extractSceneClaims([{ id: 9, visualType: "narrative", layout: "media-overlay" }]),
    ).toEqual([]);
  });

  it("carries searchHints in writer order, sanitised and deduped (#354)", () => {
    const [claim] = extractSceneClaims([
      {
        id: 4,
        visualType: "narrative",
        layout: "media-overlay",
        voiceover: "vo",
        assetNeed: "humanoid robot",
        searchHints: [
          "Unitree H1 humanoid robot",
          "robot",
          "cinematic close-up",
          "humanoid robot factory",
          "Unitree H1 humanoid robot",
        ],
      },
    ]);
    expect(claim.searchHints).toEqual(["unitree h1 humanoid robot", "humanoid robot factory"]);
  });
});

describe("isUsableSearchHints (#354 preflight shape)", () => {
  it("accepts an omitted field and usable phrase lists", () => {
    expect(isUsableSearchHints(undefined)).toBe(true);
    expect(isUsableSearchHints(["humanoid robot factory"])).toBe(true);
    expect(
      isUsableSearchHints([
        "unitree h1 humanoid robot",
        "humanoid robot factory",
        "warehouse automation",
        "robot arm assembly",
      ]),
    ).toBe(true);
  });

  it("rejects non-arrays, empty lists, over-long lists and unretrievable phrases", () => {
    expect(isUsableSearchHints("humanoid robot")).toBe(false);
    expect(isUsableSearchHints([])).toBe(false);
    expect(isUsableSearchHints(["a", "b", "c", "d", "e"])).toBe(false);
    expect(isUsableSearchHints(["robot"])).toBe(false); // single generic word
    expect(isUsableSearchHints(["cinematic close-up"])).toBe(false);
    expect(isUsableSearchHints([42])).toBe(false);
    // Longer phrases would be truncated to the primary window at sourcing
    // time — fail instead of silently losing words.
    expect(isUsableSearchHints(["humanoid robot factory assembly line"])).toBe(false);
  });
});

describe("claimQueryPhrases (#354)", () => {
  it("tokenizes an explicit assetNeed", () => {
    expect(claimQueryPhrases({ assetNeed: "benchmark chart", voiceover: "vo" })).toEqual([
      "benchmark chart",
    ]);
  });

  it("tokenizes the voiceover when the claim is derived", () => {
    expect(
      claimQueryPhrases({ assetNeed: "", voiceover: "Factory robots assemble phones." }),
    ).toEqual(["factory robots assemble phones"]);
  });

  it("lets writer searchHints replace the tokenized phrases", () => {
    expect(
      claimQueryPhrases({
        assetNeed: "humanoid robot",
        voiceover: "vo",
        searchHints: ["unitree h1 humanoid robot", "humanoid robot factory"],
      }),
    ).toEqual(["unitree h1 humanoid robot", "humanoid robot factory"]);
  });

  it("returns no phrases for a missing claim or empty text", () => {
    expect(claimQueryPhrases(null)).toEqual([]);
    expect(claimQueryPhrases({ assetNeed: "", voiceover: "" })).toEqual([]);
  });
});

// ── claimToKeywords ──

describe("claimToKeywords", () => {
  it("produces a deterministic primary phrase of up to 4 content words", () => {
    const keywords = claimToKeywords("Alipay QR code payment scene on a phone");
    expect(keywords).toEqual(["alipay qr code payment"]);
  });

  it("keeps a two-token claim as one phrase", () => {
    expect(claimToKeywords("benchmark chart")).toEqual(["benchmark chart"]);
  });

  it("never emits a bare generic word; only anchor tokens stand alone", () => {
    expect(claimToKeywords("robot")).toEqual([]);
    expect(claimToKeywords("hand")).toEqual([]);
    expect(claimToKeywords("Robot")).toEqual([]); // sentence-start casing is not an anchor cue
    expect(claimToKeywords("ROBOT")).toEqual([]); // nor is shouting: no lowercase letter, no brand
    expect(claimToKeywords("HAND")).toEqual([]);
    expect(claimToKeywords("SMALL BLOCK")).toEqual([]); // all-caps filler stays filtered
    expect(claimToKeywords("H800")).toEqual(["h800"]);
    expect(claimToKeywords("DeepSeek")).toEqual(["deepseek"]); // internal capital = brand-style anchor
    expect(claimToKeywords("3D")).toEqual(["3d"]);
    expect(claimToKeywords("2024")).toEqual([]); // bare numbers are quantifiers, not anchors
  });

  it("keeps a trailing anchor token instead of dropping it with the tail", () => {
    expect(claimToKeywords("robot arm camera sensor H800")).toEqual([
      "robot arm camera sensor",
      "h800",
    ]);
    expect(claimToKeywords("robot arm camera sensor dashboard")).toEqual([
      "robot arm camera sensor",
    ]);
  });

  it("treats colors and lighting as style, not subject matter (pinned trade)", () => {
    expect(claimToKeywords("blue neon data center")).toEqual(["data center"]);
    expect(claimToKeywords("dark high-contrast server room")).toEqual(["server room"]);
  });

  it("strips prompt-craft vocabulary from the phrase (#635)", () => {
    expect(
      claimToKeywords("close up of an advanced AI processor chip glowing red on a circuit board"),
    ).toEqual(["advanced processor chip circuit"]);
  });

  it("keeps possessives part of their noun instead of leaking a stray 's' (#354)", () => {
    expect(claimToKeywords("Unitree's humanoid robot walks")).toEqual([
      "unitree humanoid robot walks",
    ]);
    expect(claimToKeywords("Alibaba's Qwen team")).toEqual(["alibaba qwen team"]);
  });

  it("expands or drops contractions instead of emitting letter fragments (#354)", () => {
    expect(claimToKeywords("DeepSeek couldn't match Nvidia's pricing")).toEqual([
      "deepseek match nvidia pricing",
    ]);
    expect(claimToKeywords("We won't build a moat")).toEqual(["build moat"]);
    expect(claimToKeywords("They'd ship it")).toEqual([]); // remnants are all function words
  });

  it("collapses repeated words instead of echoing them (#635)", () => {
    expect(
      claimToKeywords("humanoid robot arm or robot hand close-up, dark high-contrast"),
    ).toEqual(["humanoid robot arm hand"]);
  });

  it("returns an empty array when every word is a stopword or prompt-craft word", () => {
    expect(claimToKeywords("the of and to a")).toEqual([]);
    expect(claimToKeywords("close-up split-pane wide cinematic view")).toEqual([]);
  });

  it("is deterministic and caps output at 3 multi-word keywords", () => {
    const claim = "humanoid robot backflip demo on factory floor with engineers watching";
    const first = claimToKeywords(claim);
    const second = claimToKeywords(claim);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(3);
    expect(first[0].split(" ").length).toBeLessThanOrEqual(4);
    for (const kw of first) expect(kw.includes(" ") || /[0-9]/.test(kw)).toBe(true);
  });

  it("handles empty and punctuation-only input", () => {
    expect(claimToKeywords("")).toEqual([]);
    expect(claimToKeywords("... !!! ---")).toEqual([]);
    expect(claimToKeywords(null)).toEqual([]);
  });
});

// ── #635: fragmented keyword regression (real assetNeed claims) ──

describe("#635 — assetNeed keyword hygiene", () => {
  // Real claims from content/deepseek-embodied-ai + siblings (ticket evidence).
  const REAL_CLAIMS = [
    "humanoid robot arm or robot hand close-up, dark high-contrast",
    "humanoid robot prototype in a lab, engineers at work",
    "Unitree humanoid robot walking, full body",
    "robot startup office or humanoid robot head close-up",
    "robot arm picking up a small block, benchmark demo",
    "humanoid robot in a kitchen beside a robot arm",
    "robot hand reaching toward a glowing object, dark background",
    "massive data center server racks glowing blue at night, wide aerial view",
    "autonomous vehicle interior cabin with touchscreen and passenger seats",
    "Bar chart comparing three models across DeepSWE and Terminal-Bench, blue and amber bars, dark background",
  ];

  it("never emits a context-free single word for a natural-language claim", () => {
    for (const claim of REAL_CLAIMS) {
      const keywords = claimToKeywords(claim);
      expect(keywords.length, claim).toBeGreaterThan(0);
      for (const kw of keywords) {
        expect(kw.includes(" ") || /[0-9]/.test(kw), `"${kw}" from "${claim}"`).toBe(true);
      }
    }
  });

  it("never yields the ticket's junk singletons as a keyword", () => {
    // Before #635 these were emitted as spare single-word queries (the ticket's evidence).
    const junk = [
      "hand",
      "hands",
      "close",
      "closeup",
      "work",
      "working",
      "full",
      "body",
      "head",
      "small",
      "block",
      "glowing",
      "object",
      "four",
      "three",
      "dark",
      "screen",
      "scene",
    ];
    for (const claim of REAL_CLAIMS) {
      for (const kw of claimToKeywords(claim)) {
        expect(junk, `"${kw}" from "${claim}"`).not.toContain(kw);
      }
    }
  });

  it("pins the ticket's evidence claims to contextual phrases", () => {
    // content/deepseek-embodied-ai — the run the ticket cites.
    expect(
      claimToKeywords("humanoid robot arm or robot hand close-up, dark high-contrast"),
    ).toEqual(["humanoid robot arm hand"]);
    expect(claimToKeywords("humanoid robot prototype in a lab, engineers at work")).toEqual([
      "humanoid robot prototype lab",
    ]);
    expect(claimToKeywords("Unitree humanoid robot walking, full body")).toEqual([
      "unitree humanoid robot walking",
    ]);
    expect(claimToKeywords("robot startup office or humanoid robot head close-up")).toEqual([
      "robot startup office humanoid",
    ]);
    expect(claimToKeywords("robot arm picking up a small block, benchmark demo")).toEqual([
      "robot arm picking block",
      "benchmark demo",
    ]);
    expect(claimToKeywords("humanoid robot in a kitchen beside a robot arm")).toEqual([
      "humanoid robot kitchen arm",
    ]);
    expect(claimToKeywords("robot hand reaching toward a glowing object, dark background")).toEqual(
      ["robot hand reaching"],
    );
    expect(
      claimToKeywords("autonomous vehicle interior cabin with touchscreen and passenger seats"),
    ).toEqual(["autonomous vehicle interior cabin", "touchscreen passenger seats"]);
    // Color/lighting drops plus the trailing-window break, on a swept claim.
    expect(
      claimToKeywords("massive data center server racks glowing blue at night, wide aerial view"),
    ).toEqual(["data center server racks"]);
  });

  it("holds for every real content package: no bare single-word query without a digit", async () => {
    // Regression guard for the ticket's failure mode: the pre-fix
    // implementation emitted 14 bare singles across these tracked content
    // packages (this test is red on it). scene-data.mjs files are git-tracked,
    // so CI sweeps the same corpus as a local checkout.
    const contentRoot = new URL("../content/", import.meta.url);
    let checked = 0;
    for (const dir of readdirSync(contentRoot)) {
      const file = new URL(`${dir}/scene-data.mjs`, contentRoot);
      if (!existsSync(file)) continue;
      const mod = await import(file.href);
      if (!mod.scenes) continue;
      for (const claim of extractSceneClaims(mod.scenes)) {
        checked++;
        for (const kw of claimQueryPhrases(claim)) {
          expect(
            kw.includes(" ") || /[0-9]/.test(kw),
            `"${kw}" from ${dir}: "${claim.assetNeed || claim.voiceover}"`,
          ).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

// ── buildQueryGroups（asset-sourcer 搜索计划，矩阵行 #2/#5）──

describe("buildQueryGroups", () => {
  it("returns empty groups when there is no claim text and no keyEntities (row 2: graceful pool)", () => {
    const { queryGroups, allKeywords } = buildQueryGroups(
      [{ id: 1, visualType: "narrative", layout: "media-overlay" }],
      null,
      null,
    );
    expect(queryGroups).toEqual([]);
    expect(allKeywords).toEqual([]);
  });

  it("builds a claim-bound group from a voiceover-derived claim (#354)", () => {
    const { queryGroups, claimCount } = buildQueryGroups(
      [
        {
          id: 3,
          visualType: "narrative",
          layout: "media-overlay",
          voiceover: "Unitree's humanoid robot walks across a factory floor.",
        },
      ],
      null,
      null,
    );
    expect(claimCount).toBe(1);
    // extractKeywords also emits a company-entity fallback group (claimSceneId
    // null) from the capitalized "Unitree" in the voiceover — filter to the
    // claim-bound groups this test is about.
    expect(queryGroups.filter((g) => g.claimSceneId === 3)).toEqual([
      { keywords: ["unitree humanoid robot walks", "factory floor"], claimSceneId: 3 },
    ]);
  });

  it("uses searchHints instead of tokenizing when the writer supplies them (#354)", () => {
    const { queryGroups } = buildQueryGroups(
      [
        {
          id: 4,
          visualType: "narrative",
          layout: "media-overlay",
          voiceover: "Unitree's humanoid robot walks across a factory floor.",
          searchHints: ["unitree h1 humanoid robot", "humanoid robot factory"],
        },
      ],
      null,
      null,
    );
    expect(queryGroups.filter((g) => g.claimSceneId === 4)).toEqual([
      { keywords: ["unitree h1 humanoid robot", "humanoid robot factory"], claimSceneId: 4 },
    ]);
  });

  it("derives claim-bound groups on a real package (unitree)", () => {
    const { queryGroups, claimCount } = buildQueryGroups(unitreeScenes, null, null);
    expect(claimCount).toBeGreaterThanOrEqual(2);
    expect(queryGroups.filter((g) => g.claimSceneId === 6)).toHaveLength(1);
    expect(queryGroups.filter((g) => g.claimSceneId === 8)).toHaveLength(1);
  });

  it("skips all-stopword claims but keeps the fallback pool (row 5)", () => {
    const scenes = [
      { id: 1, visualType: "narrative", voiceover: "vo", assetNeed: "the of and to a" },
    ];
    const { queryGroups } = buildQueryGroups(
      scenes,
      { keyEntities: { companies: ["Qwen"] } },
      null,
    );
    expect(queryGroups).toHaveLength(1);
    expect(queryGroups[0].claimSceneId).toBeNull();
    expect(queryGroups[0].keywords).toEqual(["Qwen"]); // extractKeywords preserves source casing
  });

  it("keeps claim groups ahead of the fallback pool", () => {
    const scenes = [
      { id: 2, visualType: "narrative", voiceover: "vo", assetNeed: "benchmark chart" },
    ];
    const { queryGroups } = buildQueryGroups(
      scenes,
      { keyEntities: { companies: ["Qwen"] } },
      null,
    );
    expect(queryGroups.map((g) => g.claimSceneId)).toEqual([2, null]);
  });

  it("lets --keywords override the fallback pool", () => {
    const { queryGroups } = buildQueryGroups([], null, ["custom"]);
    expect(queryGroups[0].keywords).toEqual(["custom"]);
  });
});

// ─── #191: shared media-sourcing skip predicate ───

describe("skipsMediaSourcing (#191)", () => {
  const base = { id: 1, visualType: "narrative", layout: "media-overlay" };

  it("skips NO_MEDIA_TYPES (cta/data/stat-reveal)", () => {
    expect(skipsMediaSourcing({ ...base, visualType: "cta" })).toBe(true);
    expect(skipsMediaSourcing({ ...base, visualType: "stat-reveal" })).toBe(true);
  });

  it("skips hooks even with an assetNeed (#299: manually curated)", () => {
    expect(skipsMediaSourcing({ ...base, visualType: "hook" })).toBe(true);
    const claims = extractSceneClaims([
      { ...base, id: 1, visualType: "hook", assetNeed: "curated cover" },
    ]);
    expect(claims).toEqual([]);
  });

  it("skips explicit media:null — permanent no-media declaration", () => {
    expect(skipsMediaSourcing({ ...base, media: null })).toBe(true);
  });

  it("still honors deprecated mediaOptOut (legacy content, #191)", () => {
    expect(skipsMediaSourcing({ ...base, mediaOptOut: true })).toBe(true);
  });

  it("skips CSS-only layouts (hero-center / stacked-cards)", () => {
    expect(skipsMediaSourcing({ ...base, layout: "hero-center" })).toBe(true);
    expect(skipsMediaSourcing({ ...base, layout: "stacked-cards" })).toBe(true);
  });

  it("does not skip scenes that need sourcing", () => {
    expect(skipsMediaSourcing(base)).toBe(false);
  });

  it("extractSceneClaims skips media:null scenes", () => {
    const claims = extractSceneClaims([
      { ...base, id: 1, assetNeed: "factory floor", media: null },
      { ...base, id: 2, assetNeed: "server room" },
    ]);
    expect(claims).toHaveLength(1);
    expect(claims[0].sceneId).toBe(2);
  });
});

// ─── #185: zh keyword extraction from sourceRef.sourceText ───

describe("extractZhKeywords (#185)", () => {
  it("extracts repeated CJK n-grams from Chinese source text, ordered by frequency then first appearance", () => {
    const text =
      "月之暗面发布了Kimi新一代模型，月之暗面称推理成本大幅下降。Kimi的上下文长度提升，推理成本降至一成。";
    const kws = extractZhKeywords(text);
    expect(kws).toContain("月之暗面");
    expect(kws).toContain("推理成本");
    // Sub-grams of a kept longer gram are the same concept — dropped
    expect(kws).not.toContain("月之");
    expect(kws).not.toContain("暗面");
  });

  it("drops grams containing stopwords, digits or latin letters", () => {
    const kws = extractZhKeywords("Kimi的模型发布了，Kimi的模型很强。");
    expect(kws.every((k) => !/[A-Za-z0-9的]/.test(k))).toBe(true);
  });

  it("returns [] for empty, latin-only or stopword-only text", () => {
    expect(extractZhKeywords("")).toEqual([]);
    expect(extractZhKeywords("DeepSeek V4 release notes")).toEqual([]);
    expect(extractZhKeywords("的了在是和与及")).toEqual([]);
  });

  it("is deterministic and capped by limit", () => {
    const text =
      "大模型竞赛进入多模态时代，大模型厂商密集发布旗舰模型，多模态能力成为焦点，大模型价格战延续，多模态与智能体结合成为新方向，智能体框架密集开源。";
    const a = extractZhKeywords(text);
    const b = extractZhKeywords(text);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(3);
    expect(extractZhKeywords(text, { limit: 3 })).toHaveLength(3);
  });
});

describe("extractSceneClaims — sourceRef passthrough (#185)", () => {
  it("carries sourceRef on claims for zh keyword building", () => {
    const claims = extractSceneClaims([
      {
        id: 1,
        visualType: "narrative",
        layout: "media-overlay",
        assetNeed: "server room",
        sourceRef: {
          url: "https://example.cn/a",
          title: "月之暗面发布",
          sourceText: "月之暗面发布了Kimi。月之暗面称成本大降。",
        },
      },
    ]);
    expect(claims[0].sourceRef?.sourceText).toContain("月之暗面");
  });
});
