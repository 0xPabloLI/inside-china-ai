/**
 * Industry knowledge layer v1 (#253 S1) — keyed facts with bi-temporal
 * supersession, per-domain baseline bands, and an entity index that spans the
 * company graph plus model subjects.
 *
 * Contract: docs/research/industry-knowledge-layer-2026-11.md §4.3 and §5.
 * - A fact is (subject, relation, object, asOf, source, confidence, status).
 * - Only `current` facts may be cited by a writer. A same-key different value
 *   retires the old row as `superseded` (kept for replay) instead of editing it.
 * - Freshness budgets are per domain; only `volatileRelations` age out.
 *
 * This module is data-only: no writer prompt or gate consumes it until S2.
 */

import { readFileSync } from "fs";
import { loadCompanyRelations } from "./company-relations.mjs";

const DATA_PATH = new URL("./data/industry-knowledge.json", import.meta.url);

const FACT_ID_RE = /^fact-[a-z0-9-]+$/;
const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;
const CONFIDENCE = new Set(["official", "media", "inferred"]);
const STATUS = new Set(["current", "superseded", "disputed"]);
const POSITIONS = new Set(["edge", "mainstream", "frontier_band"]);
const AWARENESS = new Set(["high", "mid", "low"]);

let cache = null;

/** Load, validate and cache the shipped ledger (fail-closed). */
export function loadIndustryKnowledge() {
  if (cache) return cache;
  const parsed = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const result = validateIndustryKnowledge(parsed);
  if (!result.ok) throw new Error(`industry-knowledge.json: ${result.errors[0]}`);
  cache = parsed;
  return cache;
}

/**
 * Full schema validation. Returns every error instead of the first so a
 * migration run can report the whole drift in one pass.
 * @param {any} data
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateIndustryKnowledge(data) {
  const errors = [];
  const push = (message) => errors.push(message);

  if (!data || typeof data !== "object") return { ok: false, errors: ["not an object"] };
  if (data.version !== 1) push(`version must be 1, got ${data.version}`);
  if (!Array.isArray(data.relations) || data.relations.length === 0) {
    push("relations[] missing or empty");
  }
  if (!Array.isArray(data.volatileRelations)) push("volatileRelations[] missing");
  if (!data.domains || typeof data.domains !== "object") {
    push("domains{} missing");
  } else {
    for (const [domain, b] of Object.entries(data.domains)) {
      if (!b || typeof b !== "object") {
        push(`domain ${domain} is not an object`);
        continue;
      }
      for (const field of ["frontierBand", "edgeBand", "mainstreamBand"]) {
        if (typeof b[field] !== "string" || b[field].length === 0) {
          push(`domain ${domain} lacks ${field}`);
        }
      }
      if (!Array.isArray(b.breakthrough) || b.breakthrough.length === 0) {
        push(`domain ${domain} lacks breakthrough[]`);
      }
      if (typeof b.freshnessDays !== "number" || b.freshnessDays <= 0) {
        push(`domain ${domain} has an invalid freshnessDays`);
      }
    }
  }
  if (!Array.isArray(data.models)) push("models[] missing");
  if (!Array.isArray(data.facts)) push("facts[] missing");
  if (errors.length > 0) return { ok: false, errors };

  // — entity index: company graph + model subjects, no id/key collisions
  let index;
  try {
    index = buildEntityIndex(data);
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }

  const relations = new Set(data.relations);
  const companyIds = new Set(loadCompanyRelations().entities.map((e) => e.entity));
  const modelIds = new Set();

  for (const m of data.models) {
    if (typeof m?.id !== "string" || !m.id) {
      push("model without id");
      continue;
    }
    if (modelIds.has(m.id)) push(`duplicate model ${m.id}`);
    modelIds.add(m.id);
    if (typeof m.displayName !== "string" || !m.displayName) push(`model ${m.id} lacks displayName`);
    if (!companyIds.has(m.parent)) push(`model ${m.id} parent ${m.parent} is not a known entity`);
    const domain = data.facts.find(
      (f) => f.subject === m.id && f.relation === "model_domain" && f.status === "current",
    );
    if (!domain) push(`model ${m.id} has no current model_domain`);
    else if (!data.domains[domain.object]) push(`model ${m.id} domain ${domain.object} is unknown`);
  }

  const ids = new Set();
  const currentKeys = new Map();
  const multi = new Set(data.multiValuedRelations ?? []);
  const keyOf = (f) =>
    `${f.subject}|${f.relation}${multi.has(f.relation) ? `|${canonicalJson(f.object)}` : ""}`;
  for (const f of data.facts) {
    if (typeof f?.id !== "string" || !FACT_ID_RE.test(f.id)) push(`fact id ${f.id} malformed`);
    if (ids.has(f.id)) push(`duplicate fact id ${f.id}`);
    ids.add(f.id);
    if (!index.byId.has(f.subject)) push(`${f.id}: unknown subject ${f.subject}`);
    if (!relations.has(f.relation)) push(`${f.id}: unknown relation ${f.relation}`);
    if (typeof f.source !== "string" || f.source.trim().length === 0) push(`${f.id}: missing source`);
    if (typeof f.asOf !== "string" || !DATE_RE.test(f.asOf)) push(`${f.id}: malformed asOf ${f.asOf}`);
    if (!CONFIDENCE.has(f.confidence)) push(`${f.id}: unknown confidence ${f.confidence}`);
    if (!STATUS.has(f.status)) push(`${f.id}: unknown status ${f.status}`);
    validateObject(f.relation, f.object, data, modelIds, (m) => push(`${f.id}: ${m}`));
    if (f.status === "current") {
      const key = keyOf(f);
      if (currentKeys.has(key)) push(`two current facts for ${key}`);
      currentKeys.set(key, f.id);
    }
  }

  for (const f of data.facts) {
    if (f.status !== "superseded") continue;
    if (typeof f.supersededBy !== "string" || !f.supersededBy) {
      push(`${f.id}: superseded without supersededBy`);
      continue;
    }
    const next = data.facts.find((x) => x.id === f.supersededBy);
    if (!next) {
      push(`${f.id}: supersededBy ${f.supersededBy} does not exist`);
      continue;
    }
    if (next.subject !== f.subject || next.relation !== f.relation) {
      push(`${f.id}: supersededBy ${f.supersededBy} is on a different key`);
    }
    if (multi.has(f.relation) && canonicalJson(next.object) !== canonicalJson(f.object)) {
      push(`${f.id}: supersededBy ${f.supersededBy} replaced a different object`);
    }
    if (next.status !== "current") push(`${f.id}: supersededBy ${f.supersededBy} is not current`);
  }

  return { ok: errors.length === 0, errors };
}

/** Per-relation object shape guard, shared by schema validation and applyFact. */
function validateObject(relation, object, data, modelIds, push) {
  switch (relation) {
    case "model_domain":
      if (typeof object !== "string" || !data.domains?.[object]) {
        push(`model_domain ${object} is not a known domain`);
      }
      break;
    case "model_scale": {
      if (!object || typeof object !== "object" || Array.isArray(object)) {
        push("model_scale object must be an object");
        break;
      }
      const variants = object.variants;
      if (variants !== undefined) {
        if (!Array.isArray(variants) || variants.length === 0) {
          push("model_scale variants must be a non-empty array");
        } else {
          for (const v of variants) {
            if (!v || typeof v !== "object" || Array.isArray(v)) {
              push("model_scale variant must be an object");
            } else if (!v.total && !v.active) {
              push("model_scale variant needs total or active");
            }
          }
        }
      }
      if (variants === undefined && !object.total && !object.active) {
        push("model_scale needs total, active or variants");
      }
      break;
    }
    case "capability_marker":
      if (typeof object === "string") {
        if (!object.trim()) push("capability_marker is empty");
      } else if (!Array.isArray(object) || object.length === 0) {
        push("capability_marker must be a string or non-empty array");
      } else if (object.some((x) => typeof x !== "string" || !x.trim())) {
        push("capability_marker entries must be non-empty strings");
      }
      break;
    case "competitive_position":
      if (!POSITIONS.has(object)) push(`competitive_position ${object} is not edge|mainstream|frontier_band`);
      break;
    case "overseas_awareness":
      if (!AWARENESS.has(object)) push(`overseas_awareness ${object} is not high|mid|low`);
      break;
    case "has_model":
      if (typeof object !== "string" || !modelIds.has(object)) {
        push(`has_model ${object} is not a known model`);
      }
      break;
    case "release_date":
      if (typeof object !== "string" || !DATE_RE.test(object)) push(`release_date ${object} is malformed`);
      break;
    case "listed_on":
      if (typeof object !== "string" || !object.trim()) push("listed_on must be a non-empty string");
      break;
    default:
      break;
  }
}

/**
 * Entity index: `byId` holds canonical ids (company ids from
 * company-relations.json + model ids from the ledger), `byKey` resolves
 * matchKeys, aliases and display names case-insensitively.
 * @param {any} data
 * @returns {{ byId: Map<string, any>, byKey: Map<string, any> }}
 */
export function buildEntityIndex(data) {
  const byId = new Map();
  const byKey = new Map();
  const company = loadCompanyRelations();
  for (const e of company.entities) {
    byId.set(e.entity, {
      kind: "company",
      id: e.entity,
      displayName: e.aliases?.[0] ?? e.entity,
      aliases: e.aliases ?? [],
      matchKeys: e.matchKeys ?? [],
      parent: e.parent ?? null,
      record: e,
    });
  }
  for (const m of data.models ?? []) {
    if (byId.has(m.id)) throw new Error(`model ${m.id} collides with a company entity id`);
    byId.set(m.id, {
      kind: "model",
      id: m.id,
      displayName: m.displayName,
      aliases: m.aliases ?? [],
      matchKeys: [m.id],
      parent: m.parent,
      record: m,
    });
  }

  const register = (entry) => {
    const keys = new Set(
      [entry.id, entry.displayName, ...entry.aliases, ...entry.matchKeys]
        .filter(Boolean)
        .map((k) => String(k).trim().toLowerCase()),
    );
    for (const key of keys) {
      const previous = byKey.get(key);
      if (!previous) {
        byKey.set(key, entry);
        continue;
      }
      if (previous.id === entry.id) continue;
      // A model is the more specific subject for its own display name: the
      // company graph may use the same product name as a matchKey (e.g.
      // lingbot → "lingbot-world"). Model keys override company keys in
      // this knowledge-layer index only; company-relations semantics are untouched.
      if (previous.kind === "company" && entry.kind === "model") {
        byKey.set(key, entry);
        continue;
      }
      throw new Error(`entity key collision "${key}" (${previous.id} vs ${entry.id})`);
    }
  };
  for (const entry of byId.values()) register(entry);
  return { byId, byKey };
}

/**
 * Resolve an entity id, matchKey, alias or display name.
 * @returns {{ kind: "company" | "model", id: string } | null}
 */
export function resolveSubject(data, key) {
  if (key === undefined || key === null) return null;
  const { byKey } = buildEntityIndex(data);
  return byKey.get(String(key).trim().toLowerCase()) ?? null;
}

/**
 * Current facts only. `subject` accepts an id or any resolvable alias.
 * @param {any} data
 * @param {{ subject?: string, relation?: string }} [filter]
 */
export function currentFacts(data, filter = {}) {
  const facts = data.facts ?? [];
  let subjectId = null;
  if (filter.subject) {
    const entry = resolveSubject(data, filter.subject);
    if (!entry) return [];
    subjectId = entry.id;
  }
  return facts.filter(
    (f) =>
      f.status === "current" &&
      (subjectId === null || f.subject === subjectId) &&
      (!filter.relation || f.relation === filter.relation),
  );
}

/**
 * Write one fact under the bi-temporal rule:
 * - new key → `added`
 * - same key, same value → `refreshed` in place (a re-verification)
 * - same key, different value → `superseded` (old row kept, points at the new one)
 * Returns a new ledger; the input is never mutated.
 * @param {any} data
 * @param {any} fact
 */
export function applyFact(data, fact) {
  const next = structuredClone(data);
  const errors = [];
  validateSingleFact(fact, next, errors);
  if (errors.length > 0) throw new Error(errors[0]);

  const existing = next.facts.find((f) => f.id === fact.id);
  if (existing) {
    if (!sameValue(existing.object, fact.object)) throw new Error(`duplicate fact id ${fact.id}`);
    if (existing.subject !== fact.subject || existing.relation !== fact.relation) {
      throw new Error(`duplicate fact id ${fact.id}`);
    }
    existing.asOf = fact.asOf;
    existing.source = fact.source;
    existing.confidence = fact.confidence;
    return { data: next, outcome: "refreshed", superseded: null };
  }

  const multi = new Set(next.multiValuedRelations ?? []);
  const current = next.facts.find(
    (f) =>
      f.status === "current" &&
      f.subject === fact.subject &&
      f.relation === fact.relation &&
      (!multi.has(fact.relation) || sameValue(f.object, fact.object)),
  );
  if (current) {
    if (sameValue(current.object, fact.object)) {
      throw new Error(`same-key identical value must reuse fact id ${current.id}`);
    }
    current.status = "superseded";
    current.supersededBy = fact.id;
    next.facts.push({ ...fact, status: "current" });
    return { data: next, outcome: "superseded", superseded: current.id };
  }

  next.facts.push({ ...fact, status: "current" });
  return { data: next, outcome: "added", superseded: null };
}

function validateSingleFact(fact, data, errors) {
  if (typeof fact?.id !== "string" || !FACT_ID_RE.test(fact.id)) errors.push(`fact id ${fact?.id} malformed`);
  if (!Array.isArray(data.facts)) errors.push("facts[] missing");
  const { byId } = buildEntityIndex(data);
  if (!byId.has(fact.subject)) errors.push(`unknown subject ${fact.subject}`);
  if (!data.relations.includes(fact.relation)) errors.push(`unknown relation ${fact.relation}`);
  if (typeof fact.source !== "string" || fact.source.trim().length === 0) {
    errors.push(`fact ${fact.id} missing source`);
  }
  if (typeof fact.asOf !== "string" || !DATE_RE.test(fact.asOf)) errors.push(`fact ${fact.id} malformed asOf`);
  if (!CONFIDENCE.has(fact.confidence)) errors.push(`fact ${fact.id} unknown confidence`);
  if (!STATUS.has(fact.status)) errors.push(`fact ${fact.id} unknown status`);
  if (fact.status !== "current") errors.push(`fact ${fact.id} must be written as current`);
  const modelIds = new Set((data.models ?? []).map((m) => m.id));
  validateObject(fact.relation, fact.object, data, modelIds, (m) => errors.push(`fact ${fact.id}: ${m}`));
}

/**
 * Current volatile facts past their domain's freshness budget.
 * A stale fact may still be quoted, but only as "as of <month>".
 * @param {any} data
 * @param {{ today: string }} options
 */
export function findStaleFacts(data, { today }) {
  const now = parseDate(today);
  if (now === null) throw new Error(`findStaleFacts: invalid today ${today}`);
  const volatile = new Set(data.volatileRelations ?? []);
  const domainOf = (subject) => {
    if (!data.models?.some((m) => m.id === subject)) return null;
    const fact = (data.facts ?? []).find(
      (f) => f.subject === subject && f.relation === "model_domain" && f.status === "current",
    );
    return fact?.object ?? null;
  };
  const out = [];
  for (const fact of data.facts ?? []) {
    if (fact.status !== "current" || !volatile.has(fact.relation)) continue;
    const asOf = parseDate(fact.asOf);
    if (asOf === null) continue;
    const domain = domainOf(fact.subject);
    const budgetDays =
      (domain && data.domains?.[domain]?.freshnessDays) ?? data.defaultFreshnessDays ?? 90;
    const ageDays = Math.floor((now - asOf) / 86_400_000);
    if (ageDays > budgetDays) out.push({ fact, ageDays, budgetDays, domain });
  }
  return out.sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * Baseline bands for one domain (world model, video generation, ...).
 * @param {any} data
 * @param {string} domain
 */
export function baselineFor(data, domain) {
  const baseline = data.domains?.[domain];
  if (!baseline) throw new Error(`unknown domain ${domain}`);
  return baseline;
}

/** YYYY-MM-DD or YYYY-MM (month starts on the 1st) → epoch ms, else null. */
function parseDate(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const month = Number(m) - 1;
  if (month < 0 || month > 11) return null;
  return Date.UTC(Number(y), month, d ? Number(d) : 1);
}

/** Structural equality with object keys sorted; array order is significant. */
function sameValue(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

/** Canonical JSON form used for same-value checks (object keys sorted). */
export function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonical(value[key]);
        return acc;
      }, {});
  }
  return value;
}
