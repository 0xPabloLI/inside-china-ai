/**
 * Project the editorial company graph onto the industry knowledge ledger (#253 S1).
 *
 * company-relations.json remains the SSOT for entity → hashtag / parent / color
 * / overseas awareness. This script only *projects* the parts the fact ledger
 * needs, so a writer has one place to read current facts:
 * - overseas_awareness for all 68 entities (source company-relations.json),
 * - has_model for every model in the ledger's model index.
 *
 * Re-running is idempotent: an identical value refreshes `asOf`/`source` in
 * place; a changed value supersedes the old row and appends a versioned one.
 * `--check` writes nothing and exits non-zero on drift (CI/test use).
 *
 * Usage: node scripts/short-video/migrate-industry-knowledge.mjs [--check]
 */

import { readFileSync, realpathSync } from "fs";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { loadCompanyRelations } from "./lib/company-relations.mjs";
import { canonicalJson, validateIndustryKnowledge } from "./lib/industry-knowledge.mjs";

const DATA_PATH = new URL("./lib/data/industry-knowledge.json", import.meta.url);

/**
 * Pure projection. Returns a new ledger; the input is never mutated.
 * @param {any} data
 * @returns {any}
 */
export function buildMigratedKnowledge(data) {
  const next = structuredClone(data);
  const company = loadCompanyRelations();
  const awarenessAsOf = company.updatedAt;
  const modelAsOf = data.updatedAt;

  for (const entity of company.entities) {
    project(next, {
      id: `fact-${slug(entity.entity)}-overseas-awareness`,
      subject: entity.entity,
      relation: "overseas_awareness",
      object: entity.overseasAwareness,
      asOf: awarenessAsOf,
      source: `company-relations.json (updatedAt ${awarenessAsOf})`,
      confidence: "inferred",
      status: "current",
    });
  }

  for (const model of data.models ?? []) {
    project(next, {
      id: `fact-${slug(model.parent)}-has-model-${slug(model.id)}`,
      subject: model.parent,
      relation: "has_model",
      object: model.id,
      asOf: modelAsOf,
      source: "industry-knowledge model index (projected from company-relations.json)",
      confidence: "inferred",
      status: "current",
    });
  }

  return next;
}

function project(data, base) {
  const multi = new Set(data.multiValuedRelations ?? []);
  const current = data.facts.find(
    (f) =>
      f.status === "current" &&
      f.subject === base.subject &&
      f.relation === base.relation &&
      (!multi.has(base.relation) || canonicalJson(f.object) === canonicalJson(base.object)),
  );
  if (!current) {
    data.facts.push(base);
    return "added";
  }
  if (canonicalJson(current.object) === canonicalJson(base.object)) {
    current.asOf = base.asOf;
    current.source = base.source;
    current.confidence = base.confidence;
    return "refreshed";
  }
  const versionedId = `${base.id}-${base.asOf}`;
  if (data.facts.some((f) => f.id === versionedId)) {
    throw new Error(`migration would duplicate fact id ${versionedId}`);
  }
  current.status = "superseded";
  current.supersededBy = versionedId;
  data.facts.push({ ...base, id: versionedId });
  return "superseded";
}

/** 2-space JSON with a trailing newline, matching the repo's data files. */
export function serializeKnowledge(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function main() {
  const check = process.argv.includes("--check");
  const before = readFileSync(DATA_PATH, "utf8");
  const parsed = JSON.parse(before);
  const migrated = buildMigratedKnowledge(parsed);
  const result = validateIndustryKnowledge(migrated);
  if (!result.ok) {
    console.error(`[migrate] invalid ledger after projection:\n- ${result.errors.join("\n- ")}`);
    process.exit(1);
  }
  const after = serializeKnowledge(migrated);

  if (after === before) {
    console.log(`[migrate] up to date (${migrated.facts.length} facts)`);
    return;
  }
  if (check) {
    console.error("[migrate] drift detected — run node scripts/short-video/migrate-industry-knowledge.mjs");
    process.exit(1);
  }
  writeFileSync(DATA_PATH, after);
  console.log(`[migrate] wrote ${migrated.facts.length} facts`);
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
