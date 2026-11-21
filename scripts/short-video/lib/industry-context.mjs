/**
 * Industry context builder (#253 S2) — the writer-facing view of the S1 ledger.
 *
 * Contract: docs/research/industry-knowledge-layer-2026-11.md §4.3/§5 and
 * issue #1479. One artifact per pack (`content/<dir>/industry-context.json`)
 * that both the Stage 3 writer and the MRL-2 fact gate read:
 * - only `current` facts enter the block; `superseded` / `disputed` never do;
 * - per-domain baseline bands come from `domains{}` via `baselineFor()`;
 * - facts past their domain freshness budget are flagged stale and may only be
 *   quoted as "as of <month>" (the gate enforces that, see industry-facts.mjs);
 * - `firstReport` marks entities that are not yet in docs/refs/entity-registry.yaml,
 *   which is where content-pipeline.md requires a first-time entity to be
 *   registered before Stage 3 gives it a positioning line.
 *
 * The ledger stays the single source of truth: the gate re-reads it live and
 * only warns when this artifact lags behind (facts are never trusted from a
 * generated copy).
 */

import { readFileSync } from "fs";
import { load as loadYaml } from "js-yaml";
import {
  baselineFor,
  buildEntityIndex,
  currentFacts,
  findStaleFacts,
  loadIndustryKnowledge,
  resolveSubject,
} from "./industry-knowledge.mjs";

const REGISTRY_PATH = new URL("../../../docs/refs/entity-registry.yaml", import.meta.url);

/** Relations that carry a writer-relevant claim, in reading order. */
const FACT_ORDER = [
  "model_domain",
  "model_scale",
  "competitive_position",
  "capability_marker",
  "release_date",
  "listed_on",
  "overseas_awareness",
];

let registryCache = null;

/**
 * Registry keys (company + model ids, display names and aliases) used to answer
 * "has this entity been through the pipeline before?".
 * @returns {Set<string>}
 */
export function loadEntityRegistryKeys() {
  if (registryCache) return registryCache;
  const parsed = loadYaml(readFileSync(REGISTRY_PATH, "utf8"));
  const keys = new Set();
  const add = (id, record) => {
    for (const key of [id, record?.name, ...(record?.aliases ?? [])]) {
      if (key) keys.add(String(key).trim().toLowerCase());
    }
  };
  for (const section of ["companies", "models", "people"]) {
    for (const [id, record] of Object.entries(parsed?.[section] ?? {})) add(id, record);
  }
  registryCache = keys;
  return registryCache;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Mention pattern for one entity key: ASCII keys get token boundaries so `k3`
 * cannot match inside `k30`; CJK keys match as plain substrings.
 * @param {string} key
 * @returns {RegExp}
 */
export function entityKeyPattern(key) {
  const escaped = escapeRegExp(String(key));
  const asciiToken = /^[a-z0-9][a-z0-9 ._+-]*$/i.test(String(key));
  return asciiToken
    ? new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i")
    : new RegExp(escaped, "i");
}

/**
 * Version spellings for a key: "LingBot-World v2" also matches "2.0" / "2"
 * (packs write both), so the newer model wins over its predecessor.
 */
export function expandEntityKey(key) {
  const source = String(key);
  const match = source.match(/\bv(\d+)(?:\.\d+)?\b/i);
  if (!match) return [source];
  const number = match[1];
  return [
    source,
    source.replace(/\bv\d+(?:\.\d+)?\b/i, `${number}.0`),
    source.replace(/\bv\d+(?:\.\d+)?\b/i, number),
  ];
}

/** Flat text of a pack, for entity mention scanning. */
export function packText(meta, scenes) {
  const metaText = meta ? JSON.stringify(meta) : "";
  const sceneText = (scenes ?? [])
    .map((scene) => [scene.voiceover, scene.name, JSON.stringify(scene.texts ?? {})].join(" "))
    .join("\n");
  return `${metaText}\n${sceneText}`;
}

/**
 * Entities this pack talks about: declared keys from meta.keyEntities first
 * (the writer's own declaration), then any ledger matchKey / alias / display
 * name that appears in the pack text.
 * @param {object} params
 * @param {object} [params.meta]
 * @param {object[]} [params.scenes]
 * @param {any} [params.knowledge]
 */
export function collectPackEntities({ meta, scenes, knowledge = loadIndustryKnowledge() }) {
  const index = buildEntityIndex(knowledge);
  const found = new Map();

  const addResolved = (key) => {
    const entry = resolveSubject(knowledge, key);
    if (!entry) return;
    if (!found.has(entry.id)) found.set(entry.id, index.byId.get(entry.id));
  };

  for (const key of meta?.keyEntities?.companies ?? []) addResolved(key);
  for (const key of meta?.keyEntities?.models ?? []) addResolved(key);

  const text = packText(meta, scenes);
  // Longest keys first so "DeepSeek V4-Pro" wins over "DeepSeek".
  const keys = [...index.byKey.keys()].sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (!expandEntityKey(key).some((variant) => entityKeyPattern(variant).test(text))) continue;
    const entry = index.byKey.get(key);
    if (!found.has(entry.id)) found.set(entry.id, entry);
  }

  return [...found.values()];
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Build the pack's industry context.
 * @param {object} params
 * @param {string} params.packId
 * @param {object} [params.meta]
 * @param {object[]} [params.scenes]
 * @param {any} [params.knowledge]
 * @param {string} params.today - YYYY-MM-DD, injected so tests are deterministic
 */
export function buildIndustryContext({ packId, meta, scenes, knowledge, today }) {
  if (!packId) throw new Error("buildIndustryContext: packId is required");
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error(`buildIndustryContext: today must be YYYY-MM-DD, got ${today}`);
  }
  const data = knowledge ?? loadIndustryKnowledge();
  const registry = loadEntityRegistryKeys();
  const stale = new Map(findStaleFacts(data, { today }).map((row) => [row.fact.id, row]));

  const entities = collectPackEntities({ meta, scenes, knowledge: data }).map((entry) => {
    const domainFact = currentFacts(data, { subject: entry.id, relation: "model_domain" })[0];
    const domain = domainFact?.object ?? null;
    const facts = currentFacts(data, { subject: entry.id })
      .slice()
      .sort((a, b) => {
        const ai = FACT_ORDER.indexOf(a.relation);
        const bi = FACT_ORDER.indexOf(b.relation);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .map((fact) => {
        const staleRow = stale.get(fact.id);
        return {
          relation: fact.relation,
          object: fact.object,
          asOf: fact.asOf,
          source: fact.source,
          confidence: fact.confidence,
          stale: Boolean(staleRow),
          ageDays: staleRow?.ageDays ?? null,
          budgetDays: staleRow?.budgetDays ?? null,
        };
      });

    const registryKeys = [entry.id, entry.displayName, ...(entry.aliases ?? [])].map(normalizeKey);
    return {
      id: entry.id,
      kind: entry.kind,
      displayName: entry.displayName,
      parent: entry.parent ?? null,
      firstReport: !registryKeys.some((key) => registry.has(key)),
      domain,
      facts,
    };
  });

  const domains = {};
  for (const entity of entities) {
    if (!entity.domain || domains[entity.domain]) continue;
    const baseline = baselineFor(data, entity.domain);
    domains[entity.domain] = {
      label: baseline.label,
      edgeBand: baseline.edgeBand,
      mainstreamBand: baseline.mainstreamBand,
      frontierBand: baseline.frontierBand,
      freshnessDays: baseline.freshnessDays,
    };
  }

  return {
    version: 1,
    pack: packId,
    today,
    generatedAt: new Date().toISOString(),
    entities,
    domains,
  };
}

function formatScale(object) {
  const parts = [];
  if (object.total) parts.push(`${object.total} total`);
  if (object.active) parts.push(`${object.active} active`);
  for (const variant of object.variants ?? []) {
    if (variant.label) {
      const role =
        variant.total && variant.active ? "total+active" : variant.total ? "total" : "active";
      parts.push(`${variant.label} (${role})`);
      continue;
    }
    if (variant.total) parts.push(`${variant.total} total`);
    if (variant.active) parts.push(`${variant.active} active`);
  }
  return parts.join(" / ");
}

function formatFact(fact) {
  const value =
    fact.relation === "model_scale" && typeof fact.object === "object"
      ? formatScale(fact.object)
      : typeof fact.object === "string"
        ? fact.object
        : JSON.stringify(fact.object);
  const stale = fact.stale
    ? `⚠️ 超预算 ${fact.ageDays}/${fact.budgetDays} 天，只能写 "as of <month>"`
    : "✅ 在预算内";
  return `  - ${fact.relation}: ${value}（asOf ${fact.asOf}，${fact.confidence}，${stale}）`;
}

/**
 * Readable injection block for the Stage 3 writer.
 * @param {ReturnType<typeof buildIndustryContext>} context
 */
export function formatIndustryContext(context) {
  const lines = [
    `## 行业坐标系（industry-context v1，pack=${context.pack}，today=${context.today}）`,
    '只含 current 事实；superseded / disputed 不在本块内。超预算事实只能用 "as of <month>"，不得用现在时。',
    "",
  ];
  for (const entity of context.entities) {
    const parent = entity.parent ? `，母公司 ${entity.parent}` : "";
    const domain = entity.domain ? `，领域 ${entity.domain}` : "";
    const first = entity.firstReport ? "，首次报道" : "";
    lines.push(`- ${entity.displayName}（${entity.kind}${parent}${domain}${first}）`);
    if (entity.domain && context.domains[entity.domain]) {
      const band = context.domains[entity.domain];
      lines.push(
        `  基线 ${band.label}：edge ${band.edgeBand} / mainstream ${band.mainstreamBand} / frontier ${band.frontierBand}（freshness ${band.freshnessDays} 天）`,
      );
    }
    for (const fact of entity.facts) lines.push(formatFact(fact));
  }
  if (context.entities.length === 0) {
    lines.push("- 本包没有命中知识库实体（无行业坐标系可注入）。");
  }
  if (context.entities.some((entity) => entity.firstReport)) {
    lines.push("");
    lines.push("首次报道实体：写一句 who + where + why it matters 的定位，不假设观众认识它。");
  }
  return lines.join("\n");
}
