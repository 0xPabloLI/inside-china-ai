// Company-relation SSOT tests (#248).
//
// lib/data/company-relations.json is the single source of truth for
// entity → hashtag / parent / color / presentation. These tests lock:
//   1. data schema integrity (required fields, parent refs, no cycles,
//      unique matchKeys),
//   2. the derived ENTITY_HASHTAG_MAP equals the pre-#248 literal map
//      verbatim (the #242/#245 locked entries included),
//   3. prompt-injection color aliases keep the legacy 12-key coverage,
//   4. the 写稿辅助 presentation lookup (#245 user feedback shape).

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  loadCompanyRelations,
  resolveEntityHashtag,
  howToPresent,
  buildEntityHashtagMap,
  buildEntityColorAliases,
} from "../lib/company-relations.mjs";
import { deriveHashtags } from "../lib/caption-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = loadCompanyRelations();

// ─── schema integrity ───

describe("company-relations.json schema", () => {
  it("covers ≥60 entities (#248 acceptance)", () => {
    expect(data.entities.length).toBeGreaterThanOrEqual(60);
  });

  it("every record carries the required fields with valid values", () => {
    for (const e of data.entities) {
      expect(e.entity, JSON.stringify(e)).toMatch(/^[a-z0-9.-]+$/);
      expect(e.hashtag).toMatch(/^[a-z0-9]+$/);
      expect(Array.isArray(e.matchKeys)).toBe(true);
      expect(e.matchKeys.length).toBeGreaterThan(0);
      expect(["high", "mid", "low"]).toContain(e.overseasAwareness);
      expect(e.tier).toBeTypeOf("number");
    }
  });

  it("matchKeys are globally unique and lowercase", () => {
    const seen = new Map();
    for (const e of data.entities) {
      for (const key of e.matchKeys) {
        expect(key).toBe(key.toLowerCase());
        expect(seen.has(key), `duplicate matchKey ${key}`).toBe(false);
        seen.set(key, e.entity);
      }
    }
  });

  it("parent refs resolve and the graph is acyclic", () => {
    const byId = new Map(data.entities.map((e) => [e.entity, e]));
    for (const e of data.entities) {
      if (!e.parent) continue;
      expect(byId.has(e.parent), `${e.entity} → unknown parent ${e.parent}`).toBe(true);
    }
    for (const e of data.entities) {
      const seen = new Set([e.entity]);
      let cur = e;
      while (cur.parent) {
        expect(seen.has(cur.parent), `cycle at ${cur.parent} from ${e.entity}`).toBe(false);
        seen.add(cur.parent);
        cur = byId.get(cur.parent);
      }
    }
  });
});

// ─── golden: derived hashtag map === the pre-#248 literal ───

describe("derived ENTITY_HASHTAG_MAP", () => {
  // Verbatim from caption-utils.mjs before #248 (the #242/#245 entries included).
  const GOLDEN = {
    alibaba: "#alibaba",
    qwen: "#qwen",
    tongyi: "#qwen",
    wan: "#wan",
    "ant-group": "#alibaba",
    "ant group": "#alibaba",
    amd: "#amd",
    bytedance: "#bytedance",
    doubao: "#doubao",
    seedance: "#seedance",
    dreamina: "#dreamina",
    jimeng: "#dreamina",
    seedream: "#seedream",
    feishu: "#feishu",
    lark: "#feishu",
    capcut: "#capcut",
    "volcano engine": "#volcanoengine",
    baidu: "#baidu",
    ernie: "#ernie",
    wenxin: "#ernie",
    apollo: "#apollo",
    tencent: "#tencent",
    hunyuan: "#hunyuan",
    yuanbao: "#yuanbao",
    huawei: "#huawei",
    pangu: "#pangu",
    xiaomi: "#xiaomi",
    mimo: "#xiaomi",
    kuaishou: "#kuaishou",
    kling: "#kling",
    iflytek: "#iflytek",
    spark: "#iflytek",
    deepseek: "#deepseek",
    zhipu: "#zhipu",
    "z.ai": "#zhipu",
    glm: "#zhipu",
    moonshot: "#kimi",
    kimi: "#kimi",
    minimax: "#minimax",
    hailuo: "#hailuo",
    talkie: "#talkie",
    baichuan: "#baichuan",
    stepfun: "#stepfun",
    "01.ai": "#01ai",
    yi: "#01ai",
    cambricon: "#cambricon",
    "horizon robotics": "#horizonrobotics",
    horizon: "#horizonrobotics",
    unitree: "#unitree",
    ubtech: "#ubtech",
    agibot: "#agibot",
    fourier: "#fourier",
    "pony.ai": "#ponyai",
    ponyai: "#ponyai",
    weride: "#weride",
    momenta: "#momenta",
    openai: "#chatgpt",
    chatgpt: "#chatgpt",
    sora: "#sora",
    google: "#google",
    gemini: "#gemini",
    veo: "#veo",
    meta: "#meta",
    llama: "#meta",
    anthropic: "#anthropic",
    claude: "#claude",
    mistral: "#mistral",
    nvidia: "#nvidia",
  };

  it("legacy literal map is fully preserved (no behavior drift)", () => {
    const derived = buildEntityHashtagMap();
    for (const [key, tag] of Object.entries(GOLDEN)) {
      expect(derived[key], `matchKey ${key}`).toBe(tag);
    }
  });

  it("adds the #248 subsidiary coverage on top (lingbot etc.)", () => {
    const derived = buildEntityHashtagMap();
    expect(derived["lingbot"]).toBe("#alibaba");
    expect(derived["lingbot-world"]).toBe("#alibaba");
    expect(derived["longcat"]).toBe("#meituan");
    expect(Object.keys(derived).length).toBeGreaterThan(Object.keys(GOLDEN).length);
  });

  it("caption-utils deriveHashtags consumes the SSOT end-to-end (real smoke)", () => {
    // entity hashtags are matched from keyEntitiesCompanies (not full text)
    const metadata = { keyEntitiesCompanies: ["ant-group", "qwen", "lingbot"] };
    // limits injected per #219 T02 (mirror of the TikTok profile values)
    const result = deriveHashtags([], metadata, { min: 3, max: 5 });
    expect(result).toContain("#alibaba");
    expect(result).toContain("#qwen");
  });
});

// ─── prompt-injection color inheritance ───

describe("derived ENTITY_ALIASES (prompt-injection)", () => {
  it("keeps the legacy 12-key color coverage with identical targets", () => {
    const legacy = {
      deepseek: "deepseek",
      huawei: "huawei",
      zhipu: "zhipu",
      glm: "zhipu",
      baidu: "baidu",
      ernie: "baidu",
      alibaba: "alibaba",
      qwen: "alibaba",
      "ant-group": "alibaba",
      "ant group": "alibaba",
      tencent: "tencent",
      hunyuan: "tencent",
    };
    const derived = buildEntityColorAliases();
    for (const [key, color] of Object.entries(legacy)) {
      expect(derived[key], `matchKey ${key}`).toBe(color);
    }
  });

  it("extends inheritance to new graph records (pangu → huawei, lingbot → alibaba)", () => {
    const derived = buildEntityColorAliases();
    expect(derived.pangu).toBe("huawei");
    expect(derived.lingbot).toBe("alibaba");
  });
});

// ─── 写稿辅助 (#245 feedback: 蚂蚁集团海外不知名，必须带出 Alibaba) ───

describe("howToPresent", () => {
  it("low-awareness subsidiaries get the Parent's Brand pattern", () => {
    expect(howToPresent("ant-group")).toEqual({
      text: "Alibaba's Ant Group",
      awareness: "low",
    });
    expect(howToPresent("lingbot").text).toBe("Alibaba's Ant Group LingBot");
  });

  it("high-awareness entities need no rewrite", () => {
    const p = howToPresent("alibaba");
    expect(p.awareness).toBe("high");
    expect(p.text).toBe("Alibaba");
  });

  it("returns null for unknown entities", () => {
    expect(howToPresent("nonexistent-corp")).toBeNull();
    expect(resolveEntityHashtag("nonexistent-corp")).toBeNull();
  });
});
