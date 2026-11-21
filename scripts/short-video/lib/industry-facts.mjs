/**
 * Industry fact gate (#253 S2) — MRL-2 checks that make three failure modes
 * red before TTS/render money is spent:
 *
 * 1. total/active mixing: a model's total parameter count quoted as the
 *    per-token (active) figure, or the reverse (the ledger stores both);
 * 2. band mismatch: an edge-tier model compared as a peer of the frontier band
 *    ("拿端侧档比旗舰档");
 * 3. stale-as-current: a volatile fact past its domain freshness budget quoted
 *    in the present tense without an "as of <month>" qualifier.
 *
 * Only entities that exist in the ledger are judged. Numbers that cannot be
 * traced to a `current` fact of the mentioned subject are reported, so a claim
 * about a model's scale is either sourced or red — never silently invented.
 *
 * The gate reads the ledger live (never a generated industry-context.json copy);
 * `context` may be passed to reuse the pack's entity list.
 */

import {
  buildEntityIndex,
  currentFacts,
  findStaleFacts,
  loadIndustryKnowledge,
} from "./industry-knowledge.mjs";
import { collectPackEntities, entityKeyPattern, expandEntityKey } from "./industry-context.mjs";

const CATEGORY = "Industry facts";

const UNIT_TO_BILLIONS = {
  t: 1000,
  trillion: 1000,
  b: 1,
  billion: 1,
  m: 0.001,
  million: 0.001,
  k: 0.000001,
  thousand: 0.000001,
  万亿: 1000,
  亿: 0.1,
  万: 0.0001,
};

const SCALE_RE = /\b(\d{1,4}(?:[.,]\d+)?)\s*(trillion|billion|million|thousand|T|B|M|K)\b/gi;
const CN_SCALE_RE = /(\d{1,4}(?:\.\d+)?)\s*(万亿|亿|万)/g;

const ACTIVE_RE = /activat\w*|per[-\s]?token|激活|每\s*token|推理时/gi;
const TOTAL_RE = /\btotal\b|parameters?|参数总量|总参数|总参|参数量|\bparams\b/gi;
const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december";
const AS_OF_RE = new RegExp(
  `as of|截至|as in|\\bin\\s+(${MONTHS})\\b|\\b(${MONTHS})\\s+20\\d{2}\\b|\\bin\\s+20\\d{2}\\b`,
  "i",
);
const SUPERIORITY_RE =
  /\b(outperform(?:s|ed|ing)?|beats?|better than|more capable|on par|ahead of|rivals?|matches)\b|超越|强于|媲美|持平|不输|碾压|吊打/i;

function toBillions(token, unit) {
  const multiplier = UNIT_TO_BILLIONS[String(unit).toLowerCase()];
  if (multiplier === undefined) return null;
  const value = Number(String(token).replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return value * multiplier;
}

/** Parse "1.6T" / "49B" / "1.3B edge" style ledger values. */
function parseScaleValue(value) {
  if (typeof value !== "string") return null;
  SCALE_RE.lastIndex = 0;
  const match = SCALE_RE.exec(value);
  if (!match) return null;
  SCALE_RE.lastIndex = 0;
  return toBillions(match[1], match[2]);
}

/**
 * Every scale claim in a text, with its character offset.
 * @param {string} text
 * @returns {{ raw: string, billions: number, index: number }[]}
 */
function extractScaleClaims(text) {
  const out = [];
  for (const re of [SCALE_RE, CN_SCALE_RE]) {
    re.lastIndex = 0;
    for (const match of String(text ?? "").matchAll(re)) {
      const billions = toBillions(match[1], match[2]);
      if (billions === null) continue;
      out.push({ raw: match[0].trim(), billions, index: match.index ?? 0 });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Split a text into sentences while keeping their offsets. */
function sentencesOf(text) {
  const source = String(text ?? "");
  const out = [];
  let start = 0;
  for (const match of source.matchAll(/[.!?。！？]+(?=\s|$)|\n+/g)) {
    const end = (match.index ?? 0) + match[0].length;
    const sentence = source.slice(start, end).trim();
    if (sentence) out.push({ text: sentence, index: start });
    start = end;
  }
  const tail = source.slice(start).trim();
  if (tail) out.push({ text: tail, index: start });
  return out;
}

function nearestRole(sentence, claim) {
  const distanceTo = (re) => {
    re.lastIndex = 0;
    let best = Infinity;
    for (const match of sentence.matchAll(re)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const distance = claim.index < start ? start - claim.index : claim.index - end;
      best = Math.min(best, Math.max(0, distance));
    }
    re.lastIndex = 0;
    return best;
  };
  const active = distanceTo(ACTIVE_RE);
  const total = distanceTo(TOTAL_RE);
  const limit = 60;
  if (active <= limit && active <= total) return "active";
  if (total <= limit) return "total";
  return null;
}

/** All (role, billions) pairs of a model_scale object, variants included. */
function scaleValues(scale) {
  const rows = [];
  const push = (object) => {
    if (!object) return;
    for (const role of ["total", "active"]) {
      const value = parseScaleValue(object[role]);
      if (value !== null) rows.push({ role, billions: value });
    }
  };
  if (Array.isArray(scale?.variants)) {
    for (const variant of scale.variants) push(variant);
  } else {
    push(scale);
  }
  return rows;
}

function approx(a, b) {
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);
}

/**
 * Whether an entity is mentioned in a sentence (id, display name, aliases or
 * ledger matchKeys all count).
 */
function mentions(entry, sentence, keysById) {
  const keys = keysById.get(entry.id) ?? [];
  return keys.some((key) => entityKeyPattern(key).test(sentence));
}

/** Ranges plus single values of a band string ("10-28B total / 14B-class"). */
function bandCoverage(band) {
  if (typeof band !== "string") return null;
  const ranges = [];
  const singles = [];
  const rangeRe =
    /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(trillion|billion|million|thousand|T|B|M|K|万亿|亿|万)/gi;
  for (const match of band.matchAll(rangeRe)) {
    const low = toBillions(match[1], match[3]);
    const high = toBillions(match[2], match[3]);
    if (low !== null && high !== null) ranges.push({ low, high });
  }
  for (const claim of extractScaleClaims(band)) singles.push(claim.billions);
  return { ranges, singles };
}

function inBand(value, coverage) {
  if (!coverage) return false;
  if (coverage.singles.some((single) => approx(value, single))) return true;
  return coverage.ranges.some((range) => value >= range.low * 0.99 && value <= range.high * 1.01);
}

function frontierCoverage(domain, knowledge) {
  return bandCoverage(knowledge.domains?.[domain]?.frontierBand);
}

/** Longest match position of one entity in a sentence, or null. */
function mentionSpot(entry, sentence, keysById) {
  const keys = keysById.get(entry.id) ?? [];
  let best = null;
  for (const key of keys) {
    const match = entityKeyPattern(key).exec(sentence);
    if (!match) continue;
    const index = match.index ?? 0;
    const length = match[0].length;
    if (!best || length > best.length) best = { index, end: index + length, length };
  }
  return best;
}

/** The mentioned entity closest to a claim (within 80 chars), else null. */
function nearestMention(positions, claim) {
  let best = null;
  let bestGap = Infinity;
  let bestLength = 0;
  for (const [id, spot] of positions) {
    const end = claim.index + claim.raw.length;
    const gap = Math.max(0, claim.index < spot.index ? spot.index - end : claim.index - spot.end);
    // Same position: the longer, more specific key wins ("LingBot-World 2.0" over "LingBot-World").
    if (gap < bestGap || (gap === bestGap && spot.length > bestLength)) {
      bestGap = gap;
      bestLength = spot.length;
      best = id;
    }
  }
  return bestGap <= 80 ? best : null;
}

/**
 * Whether a claim is attached to the entity's own size rather than a comparison
 * figure ("outperforms 2.8T frontier models" is a comparison, not its scale).
 */
function isAttributed(sentence, claim, spot) {
  const start = claim.index;
  const end = start + claim.raw.length;
  const before = sentence.slice(Math.max(0, start - 10), start);
  const after = sentence.slice(end, end + 20);
  return (
    /\b(at|with|has|runs?|ships?|activates?|totals?)\s*$|参数|权重|weights\s*$/i.test(before) ||
    /^\s*(parameters?|params|参数|总参|参数量|weights)/i.test(after) ||
    Boolean(spot && Math.abs(start - spot.end) <= 3)
  );
}

/**
 * Run the industry fact gate over a pack.
 * @param {object[]} scenes
 * @param {object} [options]
 * @param {any} [options.knowledge] - ledger override (tests)
 * @param {object} [options.meta] - pack meta (entity declaration)
 * @param {{entities: object[]}} [options.context] - prebuilt context entities
 * @param {string} [options.today] - YYYY-MM-DD, defaults to system date
 */
export function runIndustryFactChecks(scenes, options = {}) {
  const knowledge = options.knowledge ?? loadIndustryKnowledge();
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const index = buildEntityIndex(knowledge);
  const entities =
    options.context?.entities ??
    collectPackEntities({ meta: options.meta, scenes, knowledge }).map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      displayName: entry.displayName,
      parent: entry.parent ?? null,
      domain: null,
      facts: [],
    }));

  if (entities.length === 0) {
    return [
      {
        level: "pass",
        category: CATEGORY,
        check: "No ledger entities in pack",
        detail: "nothing to trace against industry-knowledge.json",
      },
    ];
  }

  const staleById = new Map(findStaleFacts(knowledge, { today }).map((row) => [row.fact.id, row]));
  const keysById = new Map();
  for (const entity of entities) {
    const record = index.byId.get(entity.id);
    const keys = new Set([entity.id, entity.displayName, ...(record?.aliases ?? [])]);
    for (const key of record?.matchKeys ?? []) keys.add(key);
    keysById.set(
      entity.id,
      [...keys].filter(Boolean).flatMap((key) => expandEntityKey(key)),
    );
  }

  const rows = [];
  const add = (level, check, detail, fix) => rows.push({ level, check, detail, fix });
  let claimsChecked = 0;

  for (const scene of scenes ?? []) {
    const sceneText = [scene.voiceover, JSON.stringify(scene.texts ?? {})]
      .filter(Boolean)
      .join(". ");
    if (!sceneText) continue;

    for (const sentence of sentencesOf(sceneText)) {
      const claims = extractScaleClaims(sentence.text);
      const positions = new Map();
      for (const entity of entities) {
        const spot = mentionSpot(entity, sentence.text, keysById);
        if (spot) positions.set(entity.id, spot);
      }
      if (positions.size === 0) continue;

      const factsById = new Map();
      for (const entity of entities) {
        if (!positions.has(entity.id)) continue;
        factsById.set(entity.id, currentFacts(knowledge, { subject: entity.id }));
      }

      for (const claim of claims) {
        const ownerId = nearestMention(positions, claim);
        if (!ownerId) continue;
        const entity = entities.find((entry) => entry.id === ownerId);
        const facts = factsById.get(ownerId) ?? [];
        const scaleFact = facts.find((fact) => fact.relation === "model_scale");
        const scale = scaleFact ? scaleValues(scaleFact.object) : [];
        if (scale.length === 0) continue;
        if (!isAttributed(sentence.text, claim, positions.get(ownerId))) continue;

        claimsChecked += 1;
        const role = nearestRole(sentence.text, claim);
        const totalHit = scale.some(
          (row) => row.role === "total" && approx(claim.billions, row.billions),
        );
        const activeHit = scale.some(
          (row) => row.role === "active" && approx(claim.billions, row.billions),
        );

        if (role === "total" && !totalHit && activeHit) {
          add(
            "fail",
            "Total/active scale mismatch",
            `Scene ${scene.id}: "${claim.raw}" is quoted as total parameters but ${entity.displayName}'s active figure is ${activeHit ? claim.raw : scale.find((r) => r.role === "active")?.billions + "B"}`,
            "Quote the total count as total, or the active count as per-token active — never swap the two",
          );
        } else if (role === "active" && !activeHit && totalHit) {
          add(
            "fail",
            "Total/active scale mismatch",
            `Scene ${scene.id}: "${claim.raw}" is quoted as the per-token figure but ${entity.displayName}'s total is ${scale.find((r) => r.role === "total")?.billions}B`,
            "Quote the active count as per-token active, or the total count as total parameters",
          );
        } else if (role === "total" && !totalHit) {
          add(
            "fail",
            "Scale not traceable",
            `Scene ${scene.id}: ${entity.displayName} is quoted at ${claim.raw} total, ledger says ${scale
              .filter((r) => r.role === "total")
              .map((r) => r.billions + "B")
              .join("/")}`,
            "Use a current model_scale fact or refresh the ledger",
          );
        } else if (role === "active" && !activeHit) {
          add(
            "fail",
            "Scale not traceable",
            `Scene ${scene.id}: ${entity.displayName} active figure ${claim.raw} does not match the ledger (${scale
              .filter((r) => r.role === "active")
              .map((r) => r.billions + "B")
              .join("/")})`,
            "Use a current model_scale fact or refresh the ledger",
          );
        } else if (role === null && !totalHit && activeHit) {
          add(
            "warn",
            "Active figure stated as plain size",
            `Scene ${scene.id}: "${claim.raw}" is ${entity.displayName}'s active figure; the sentence never says so`,
            'Say "activates <n> per token" — unqualified numbers read as total parameters',
          );
        } else if (role === null && !totalHit && !activeHit) {
          add(
            "fail",
            "Scale not traceable",
            `Scene ${scene.id}: "${claim.raw}" cannot be traced to a current model_scale fact for ${entity.displayName}`,
            "Use a current fact, or refresh the ledger before quoting",
          );
        }

        if (scaleFact && staleById.has(scaleFact.id)) {
          const matched = totalHit || activeHit;
          if (matched && !AS_OF_RE.test(sentence.text)) {
            const stale = staleById.get(scaleFact.id);
            add(
              "fail",
              "Stale fact quoted as current",
              `Scene ${scene.id}: ${entity.displayName}'s scale is ${stale.ageDays} days old (budget ${stale.budgetDays}) and the sentence has no "as of <month>"`,
              `Re-verify the fact, or write "as of ${scaleFact.asOf.slice(0, 7)}"`,
            );
          }
        }
      }

      // Band mismatch is a sentence-level judgment: an edge-tier model named in
      // the same sentence as a frontier-band figure and superiority wording.
      if (SUPERIORITY_RE.test(sentence.text) && claims.length > 0) {
        for (const entity of entities) {
          if (!positions.has(entity.id)) continue;
          const facts = factsById.get(entity.id) ?? [];
          const positionFact = facts.find((fact) => fact.relation === "competitive_position");
          if (positionFact?.object !== "edge") continue;
          const domain = entity.domain ?? facts.find((f) => f.relation === "model_domain")?.object;
          const frontier = domain ? frontierCoverage(domain, knowledge) : null;
          const claim = claims.find((row) => inBand(row.billions, frontier));
          if (!claim) continue;
          add(
            "fail",
            "Band mismatch (edge vs frontier)",
            `Scene ${scene.id}: ${entity.displayName} sits in the edge tier but is compared as a peer of the frontier band (${claim.raw})`,
            "Compare it within its own tier, or state the tier difference explicitly",
          );
        }
      }

      for (const entity of entities) {
        if (!positions.has(entity.id)) continue;
        const facts = factsById.get(entity.id) ?? [];
        for (const fact of facts) {
          if (fact.relation !== "capability_marker" || !staleById.has(fact.id)) continue;
          if (AS_OF_RE.test(sentence.text)) continue;
          const markers = Array.isArray(fact.object) ? fact.object : [fact.object];
          const hit = markers.find(
            (marker) =>
              typeof marker === "string" &&
              sentence.text.toLowerCase().includes(marker.toLowerCase()),
          );
          if (!hit) continue;
          const stale = staleById.get(fact.id);
          add(
            "fail",
            "Stale fact quoted as current",
            `Scene ${scene.id}: "${hit}" for ${entity.displayName} is ${stale.ageDays} days old (budget ${stale.budgetDays}) and has no "as of <month>"`,
            `Re-verify the fact, or write "as of ${fact.asOf.slice(0, 7)}"`,
          );
        }
      }
    }
  }

  const failRows = dedupe(rows.filter((row) => row.level === "fail"));
  const warnRows = dedupe(rows.filter((row) => row.level === "warn"));
  if (failRows.length === 0 && warnRows.length === 0) {
    return [
      {
        level: "pass",
        category: CATEGORY,
        check: "Industry claims traceable",
        detail: `${claimsChecked} scale claim(s) checked against current facts`,
      },
    ];
  }
  return [...failRows, ...warnRows].map((row) => ({ ...row, category: CATEGORY }));
}

/** Collapse identical (check, detail-prefix) rows so one line covers a scene. */
function dedupe(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.check}|${row.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
