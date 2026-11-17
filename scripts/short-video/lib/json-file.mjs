/**
 * Shared JSON-file helpers for the short-video state files.
 *
 * The Stage 1 pipeline status and the Stage 2 pending-analysis records both
 * need the same three primitives: object detection, read/parse with a
 * classified error, and an atomic replace. Keeping one copy avoids the two
 * layouts drifting on error text and temp-file naming.
 */

import { readFileSync, renameSync, writeFileSync } from "node:fs";

export function isJsonObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readJsonFile(filePath, label = "json file") {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`${label}: cannot read ${filePath}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}: invalid JSON in ${filePath}: ${error.message}`);
  }
}

export function writeJsonAtomic(filePath, value) {
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, filePath);
}

/**
 * Stable JSON for equality checks: object keys sorted at every level, array
 * order preserved. Used where a hand-written or tool-written record may have
 * the same values in a different key order.
 */
export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}
