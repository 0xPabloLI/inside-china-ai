// Industry knowledge layer v1 (#253 S1) — data + ledger contract.
//
// The research slice (docs/research/industry-knowledge-layer-2026-11.md §5)
// fixes the shape: keyed facts (subject, relation, object, asOf, source,
// confidence, status) with bi-temporal supersession, plus per-domain baseline
// bands. These tests lock:
//   1. schema integrity of lib/data/industry-knowledge.json,
//   2. the entity index resolves all 71 company-relations entities and every
//      model subject (the S1 acceptance criterion),
//   3. applyFact replaces a same-key different-value fact without deleting
//      history, and is idempotent on an identical refresh,
//   4. freshness budgets: volatile relations age out, stable ones do not,
//   5. the migration from company-relations.json is lossless and idempotent.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { loadCompanyRelations } from "../lib/company-relations.mjs";
import {
  loadIndustryKnowledge,
  validateIndustryKnowledge,
  buildEntityIndex,
  resolveSubject,
  currentFacts,
  applyFact,
  findStaleFacts,
  baselineFor,
} from "../lib/industry-knowledge.mjs";
import { buildMigratedKnowledge, serializeKnowledge } from "../migrate-industry-knowledge.mjs";

const DATA_PATH = fileURLToPath(new URL("../lib/data/industry-knowledge.json", import.meta.url));
const raw = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const company = loadCompanyRelations();

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;
const CONFIDENCE = ["official", "media", "inferred"];
const STATUS = ["current", "superseded", "disputed"];

// ─── data schema integrity ───

describe("industry-knowledge.json schema", () => {
  it("declares the v1 vocabulary and per-domain baselines", () => {
    expect(raw.version).toBe(1);
    expect(raw.updatedAt).toMatch(DATE_RE);
    expect(raw.relations).toEqual([
      "has_model",
      "model_domain",
      "model_scale",
      "release_date",
      "capability_marker",
      "listed_on",
      "overseas_awareness",
      "competitive_position",
    ]);
    for (const domain of ["llm", "world_model", "video_generation", "vlm", "tts", "omni"]) {
      const b = raw.domains[domain];
      expect(b, `domain ${domain}`).toBeTruthy();
      expect(b.frontierBand).toBeTypeOf("string");
      expect(b.breakthrough.length).toBeGreaterThan(0);
      expect(b.freshnessDays).toBeGreaterThan(0);
    }
  });

  it("every fact carries the full keyed-fact tuple with valid values", () => {
    const ids = new Set();
    for (const f of raw.facts) {
      expect(f.id, JSON.stringify(f)).toMatch(/^fact-[a-z0-9-]+$/);
      expect(ids.has(f.id), `duplicate fact id ${f.id}`).toBe(false);
      ids.add(f.id);
      expect(f.subject).toBeTypeOf("string");
      expect(raw.relations).toContain(f.relation);
      expect(f.object).toBeDefined();
      expect(f.asOf, `${f.id} asOf`).toMatch(DATE_RE);
      expect(f.source, `${f.id} source`).toBeTypeOf("string");
      expect(f.source.length).toBeGreaterThan(0);
      expect(CONFIDENCE).toContain(f.confidence);
      expect(STATUS).toContain(f.status);
    }
  });

  it("holds at most one current fact per functional key, and one per value for multi-valued relations", () => {
    const multi = new Set(raw.multiValuedRelations ?? []);
    const currentByKey = new Map();
    for (const f of raw.facts.filter((x) => x.status === "current")) {
      const key = `${f.subject}|${f.relation}${multi.has(f.relation) ? `|${JSON.stringify(f.object)}` : ""}`;
      expect(currentByKey.has(key), `two current facts for ${key}`).toBe(false);
      currentByKey.set(key, f);
    }
  });

  it("superseded facts point at an existing replacing fact on the same key", () => {
    const byId = new Map(raw.facts.map((f) => [f.id, f]));
    for (const f of raw.facts) {
      if (f.status !== "superseded") continue;
      expect(f.supersededBy, `${f.id} lacks supersededBy`).toBeTypeOf("string");
      const next = byId.get(f.supersededBy);
      expect(next, `${f.id} → unknown ${f.supersededBy}`).toBeTruthy();
      expect(`${next.subject}|${next.relation}`).toBe(`${f.subject}|${f.relation}`);
      expect(next.status).toBe("current");
    }
  });

  it("every model is a child of a known company entity with a domain fact", () => {
    const companyIds = new Set(company.entities.map((e) => e.entity));
    const modelIds = new Set();
    for (const m of raw.models) {
      expect(m.id).toMatch(/^[a-z0-9_]+$/);
      expect(modelIds.has(m.id), `duplicate model ${m.id}`).toBe(false);
      modelIds.add(m.id);
      expect(m.displayName).toBeTypeOf("string");
      expect(companyIds, `${m.id} parent ${m.parent}`).toContain(m.parent);
      const domain = raw.facts.find(
        (f) => f.subject === m.id && f.relation === "model_domain" && f.status === "current",
      );
      expect(domain, `${m.id} has no current model_domain`).toBeTruthy();
      expect(Object.keys(raw.domains)).toContain(domain.object);
    }
  });
});

// ─── entity index + S1 acceptance: all 71 entities resolve ───

describe("entity index", () => {
  const index = buildEntityIndex(raw);

  it("resolves all 71 company-relations entities and their matchKeys", () => {
    expect(company.entities).toHaveLength(71);
    for (const e of company.entities) {
      expect(index.byId.get(e.entity), `entity ${e.entity}`).toBeTruthy();
      for (const key of e.matchKeys) {
        expect(index.byKey.get(key), `matchKey ${key}`).toBeTruthy();
      }
    }
  });

  it("registers model subjects next to the company graph without duplication", () => {
    for (const m of raw.models) {
      expect(index.byId.get(m.id)?.kind).toBe("model");
      expect(resolveSubject(raw, m.displayName)?.id).toBe(m.id);
      expect(resolveSubject(raw, m.id)?.id).toBe(m.id);
    }
    expect(resolveSubject(raw, "lnonexistent-corp")).toBeNull();
  });

  it("never lets a model id shadow a company entity id", () => {
    const companyIds = new Set(company.entities.map((e) => e.entity));
    for (const m of raw.models) expect(companyIds.has(m.id)).toBe(false);
  });
});

// ─── current facts ───

describe("currentFacts", () => {
  it("returns only current facts, filterable by subject and relation", () => {
    const all = currentFacts(raw);
    expect(all.every((f) => f.status === "current")).toBe(true);
    const kimi = currentFacts(raw, { subject: "kimi_k3" });
    expect(kimi.map((f) => f.relation).sort()).toEqual(
      ["capability_marker", "model_domain", "model_scale", "release_date"].sort(),
    );
    const scale = currentFacts(raw, { subject: "kimi_k3", relation: "model_scale" });
    expect(scale).toHaveLength(1);
    expect(scale[0].object).toEqual({ total: "2.8T", active: "104B" });
  });

  it("answers the 1.3B world-model question from the baseline bands, not the raw number", () => {
    const b = baselineFor(raw, "world_model");
    expect(b.edgeBand).toMatch(/1-3B/);
    const v2 = currentFacts(raw, {
      subject: "lingbot_world_v2",
      relation: "competitive_position",
    })[0];
    expect(v2.object).toBe("edge");
  });
});

// ─── applyFact: bi-temporal supersession ───

describe("applyFact", () => {
  const base = /** @type {any} */ ({
    version: 1,
    facts: [],
    relations: raw.relations,
    volatileRelations: raw.volatileRelations,
    defaultFreshnessDays: raw.defaultFreshnessDays,
    domains: raw.domains,
    models: raw.models,
  });

  it("adds a fact to an empty key", () => {
    const fact = {
      id: "fact-test-new",
      subject: "deepseek_v4_pro",
      relation: "competitive_position",
      object: "frontier_band",
      asOf: "2026-11-21",
      source: "test",
      confidence: "inferred",
      status: "current",
    };
    const { data, outcome } = applyFact(base, fact);
    expect(outcome).toBe("added");
    expect(data.facts).toHaveLength(1);
    expect(data.facts[0].status).toBe("current");
  });

  it("supersedes a same-key different-value fact and keeps it replayable", () => {
    const first = {
      id: "fact-test-first",
      subject: "qwen3_8",
      relation: "model_scale",
      object: { total: "2.4T", active: "95B" },
      asOf: "2026-11",
      source: "first",
      confidence: "media",
      status: "current",
    };
    const second = {
      id: "fact-test-second",
      subject: "qwen3_8",
      relation: "model_scale",
      object: { total: "3.1T", active: "110B" },
      asOf: "2027-01",
      source: "second",
      confidence: "official",
      status: "current",
    };
    const a = applyFact(base, first);
    const b = applyFact(a.data, second);
    expect(b.outcome).toBe("superseded");
    const old = b.data.facts.find((f) => f.id === "fact-test-first");
    expect(old.status).toBe("superseded");
    expect(old.supersededBy).toBe("fact-test-second");
    // replay: the old value is still there, the current read only shows the new one
    expect(b.data.facts).toHaveLength(2);
    expect(currentFacts(b.data, { subject: "qwen3_8" })[0].object.total).toBe("3.1T");
  });

  it("refreshes an identical value in place instead of duplicating history", () => {
    const first = {
      id: "fact-test-refresh",
      subject: "kimi_k3",
      relation: "model_scale",
      object: { total: "2.8T", active: "104B" },
      asOf: "2026-11-21",
      source: "old reading",
      confidence: "official",
      status: "current",
    };
    const again = {
      ...first,
      asOf: "2026-12-20",
      source: "re-verified reading",
    };
    const a = applyFact(base, first);
    const b = applyFact(a.data, again);
    expect(b.outcome).toBe("refreshed");
    expect(b.data.facts).toHaveLength(1);
    expect(b.data.facts[0].asOf).toBe("2026-12-20");
    expect(b.data.facts[0].source).toBe("re-verified reading");
  });

  it("rejects duplicate ids, unknown subjects and malformed facts", () => {
    const ok = {
      id: "fact-test-guard",
      subject: "genie_3",
      relation: "capability_marker",
      object: ["realtime 720p@24fps"],
      asOf: "2026-11-21",
      source: "test",
      confidence: "media",
      status: "current",
    };
    expect(() => applyFact(base, { ...ok, subject: "unknown_subject" })).toThrow(
      /unknown subject/i,
    );
    expect(() => applyFact(base, { ...ok, source: "" })).toThrow(/source/i);
    expect(() => applyFact(base, { ...ok, relation: "made_up_relation" })).toThrow(/relation/i);
    const a = applyFact(base, ok);
    expect(() => applyFact(a.data, { ...ok, object: ["different"], source: "changed" })).toThrow(
      /duplicate fact id/i,
    );
  });
});

// ─── freshness budgets ───

describe("findStaleFacts", () => {
  const today = "2026-11-21";

  it("flags volatile facts past their domain budget on the shipped data", () => {
    const stale = findStaleFacts(raw, { today });
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.some((s) => s.fact.subject === "deepseek_v4_pro")).toBe(true);
    // qwen3_8 was read in 2026-11: inside the 30-day LLM budget on 11-21.
    expect(stale.some((s) => s.fact.subject === "qwen3_8")).toBe(false);
  });

  it("does not age out stable relations such as release_date or model_domain", () => {
    const stale = findStaleFacts(raw, { today: "2030-01-01" });
    const relations = new Set(stale.map((s) => s.fact.relation));
    expect(relations.has("release_date")).toBe(false);
    expect(relations.has("model_domain")).toBe(false);
    expect(relations.has("has_model")).toBe(false);
  });

  it("uses the domain budget: 30 days for llm, 90 days for vlm", () => {
    const at = (id, subject, relation, object, asOf = "2026-09-22") => ({
      id,
      subject,
      relation,
      object,
      asOf,
      source: "fixture",
      confidence: "official",
      status: "current",
    });
    const fixture = {
      version: 1,
      relations: raw.relations,
      volatileRelations: raw.volatileRelations,
      defaultFreshnessDays: raw.defaultFreshnessDays,
      domains: raw.domains,
      models: raw.models,
      facts: [
        at("fact-deepseek-v4-pro-model-domain", "deepseek_v4_pro", "model_domain", "llm"),
        at("fact-qwen3-vl-235b-a22b-model-domain", "qwen3_vl_235b_a22b", "model_domain", "vlm"),
        at("fact-deepseek-v4-pro-model-scale", "deepseek_v4_pro", "model_scale", {
          total: "1.6T",
          active: "49B",
        }),
        at("fact-qwen3-vl-235b-a22b-model-scale", "qwen3_vl_235b_a22b", "model_scale", {
          total: "235B",
          active: "22B",
        }),
        at(
          "fact-deepseek-v4-pro-release-date",
          "deepseek_v4_pro",
          "release_date",
          "2026-04-24",
          "2026-04-24",
        ),
      ],
    };
    // 60 days after asOf: the LLM fact is stale, the VLM one is inside 90 days.
    const soon = findStaleFacts(fixture, { today });
    expect(soon.map((s) => s.fact.subject)).toEqual(["deepseek_v4_pro"]);
    // 105 days: both are stale.
    const later = findStaleFacts(fixture, { today: "2027-01-15" });
    expect(later.map((s) => s.fact.subject).sort()).toEqual(
      ["deepseek_v4_pro", "qwen3_vl_235b_a22b"].sort(),
    );
  });
});

// ─── loader ───

describe("loadIndustryKnowledge", () => {
  it("loads the shipped file and passes validation", () => {
    const data = loadIndustryKnowledge();
    expect(data.version).toBe(1);
    expect(validateIndustryKnowledge(data)).toEqual({ ok: true, errors: [] });
  });

  it("fails closed on a broken invariant", () => {
    const broken = structuredClone(raw);
    broken.facts.push({ ...broken.facts[0], id: "fact-dup-current" });
    const result = validateIndustryKnowledge(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/two current facts/);
  });
});

// ─── migration from company-relations.json ───

describe("migrate-industry-knowledge", () => {
  it("projects all 71 awareness facts and one has_model fact per model", () => {
    const migrated = buildMigratedKnowledge(raw);
    const awareness = migrated.facts.filter((f) => f.relation === "overseas_awareness");
    expect(awareness).toHaveLength(71);
    const hasModel = migrated.facts.filter((f) => f.relation === "has_model");
    expect(hasModel).toHaveLength(raw.models.length);
    for (const m of raw.models) {
      expect(
        hasModel.some((f) => f.subject === m.parent && f.object === m.id),
        `${m.parent} → ${m.id}`,
      ).toBe(true);
    }
  });

  it("keeps awareness values equal to the company-relations SSOT", () => {
    const migrated = buildMigratedKnowledge(raw);
    for (const e of company.entities) {
      const fact = migrated.facts.find(
        (f) => f.subject === e.entity && f.relation === "overseas_awareness",
      );
      expect(fact?.object, `awareness for ${e.entity}`).toBe(e.overseasAwareness);
      expect(fact.status).toBe("current");
      expect(fact.confidence).toBe("inferred");
    }
  });

  it("is idempotent: a second run is byte-identical", () => {
    const once = buildMigratedKnowledge(raw);
    const twice = buildMigratedKnowledge(once);
    expect(serializeKnowledge(twice)).toBe(serializeKnowledge(once));
    expect(serializeKnowledge(once)).toBe(serializeKnowledge(raw));
  });

  it("still passes validation after projection", () => {
    expect(validateIndustryKnowledge(raw)).toEqual({ ok: true, errors: [] });
  });
});
