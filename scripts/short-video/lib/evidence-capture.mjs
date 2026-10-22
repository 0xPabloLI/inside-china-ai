/**
 * Evidence capture contract (#758).
 *
 * #759's gate polices the *declaration*: a provenance block must be shaped
 * correctly and its clip must contain its rect. Nothing tied those numbers to
 * the file on disk, so a clip nobody ever captured still passed. This module is
 * the pure half of the fix: the capture recipe a producer must follow, the
 * geometry it must record, the drift comparison used before an existing capture
 * is overwritten, and the single formatter that writes a provenance block into
 * scene data or a media patch.
 *
 * Deliberately browser-free — the Playwright producer imports this module, so
 * the contract is testable without launching Chromium.
 *
 * @module evidence-capture
 */

import { shown } from "./media-integrity.mjs";

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

/** Playwright's `page.goto` waitUntil values. */
const WAIT_UNTIL_VALUES = new Set(["load", "domcontentloaded", "networkidle", "commit"]);

const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 900 });

/**
 * Capture defaults shared by every pack manifest. Frozen because a producer
 * mutating `CAPTURE_DEFAULTS.viewport` would silently change every recipe.
 */
export const CAPTURE_DEFAULTS = Object.freeze({
  padding: 16,
  deviceScaleFactor: 2,
  viewport: DEFAULT_VIEWPORT,
  waitUntil: "load",
  timeoutMs: 30000,
});

/**
 * Normalize one capture recipe from a pack manifest.
 *
 * Only the seven contract fields are returned: an unknown key is not a recipe
 * field, and carrying it through would let an unvalidated value reach the
 * producer. `sceneId` is context for the error message, so a manifest with 30
 * entries names the broken one instead of failing anonymously.
 *
 * @param {unknown} entry - one manifest entry
 * @param {number|string} sceneId - scene the entry belongs to, for errors
 * @returns {{url: string, selector: string, padding: number, deviceScaleFactor: number,
 *            viewport: {width: number, height: number}, waitUntil: string, timeoutMs: number}}
 */
export function normalizeCaptureRecipe(entry, sceneId) {
  const where = `evidence capture recipe for scene ${shown(sceneId)}`;
  if (!isObject(entry)) {
    throw new Error(`${where} must be an object, got ${shown(entry)}`);
  }
  const fail = (message) => {
    throw new Error(`${where}: ${message}`);
  };

  if (typeof entry.url !== "string" || entry.url.trim() === "") {
    fail(`url must be a non-empty string, got ${shown(entry.url)}`);
  }
  let url;
  try {
    url = new URL(entry.url);
  } catch {
    fail(`url is not a valid URL: ${shown(entry.url)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(`url must be http(s), got "${url.protocol}" (${shown(entry.url)})`);
  }

  if (typeof entry.selector !== "string" || entry.selector.trim() === "") {
    fail(`selector must be a non-empty element selector, got ${shown(entry.selector)}`);
  }

  const padding = entry.padding ?? CAPTURE_DEFAULTS.padding;
  if (!isFiniteNumber(padding) || padding < 0) {
    fail(`padding must be a finite number >= 0, got ${shown(entry.padding)}`);
  }

  const deviceScaleFactor = entry.deviceScaleFactor ?? CAPTURE_DEFAULTS.deviceScaleFactor;
  if (!isFiniteNumber(deviceScaleFactor) || deviceScaleFactor <= 0) {
    fail(`deviceScaleFactor must be a finite number > 0, got ${shown(entry.deviceScaleFactor)}`);
  }

  const viewport = entry.viewport ?? CAPTURE_DEFAULTS.viewport;
  if (!isObject(viewport)) {
    fail(`viewport must be an object { width, height }, got ${shown(viewport)}`);
  }
  for (const key of ["width", "height"]) {
    if (!Number.isInteger(viewport[key]) || viewport[key] <= 0) {
      fail(`viewport.${key} must be a positive integer, got ${shown(viewport[key])}`);
    }
  }

  const waitUntil = entry.waitUntil ?? CAPTURE_DEFAULTS.waitUntil;
  if (!WAIT_UNTIL_VALUES.has(waitUntil)) {
    fail(
      `waitUntil must be one of ${[...WAIT_UNTIL_VALUES].join(", ")}, got ${shown(entry.waitUntil)}`,
    );
  }

  const timeoutMs = entry.timeoutMs ?? CAPTURE_DEFAULTS.timeoutMs;
  if (!isFiniteNumber(timeoutMs) || timeoutMs <= 0) {
    fail(`timeoutMs must be a finite number > 0, got ${shown(entry.timeoutMs)}`);
  }

  return {
    url: entry.url,
    selector: entry.selector,
    padding,
    deviceScaleFactor,
    viewport: { width: viewport.width, height: viewport.height },
    waitUntil,
    timeoutMs,
  };
}

/**
 * Grow an element rect by `padding` into the region that is actually captured.
 *
 * The clip is clamped at the page origin: a rect near the top-left would
 * otherwise ask the browser for negative coordinates, which a screenshot
 * cannot honour. Clamping only the origin keeps the clip a superset of the
 * rect, which is what `validateProvenance` enforces.
 *
 * @param {{x: number, y: number, w: number, h: number}} rect - page CSS px
 * @param {number} padding - CSS px added on every edge
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function buildClip(rect, padding) {
  if (!isObject(rect)) {
    throw new Error(`rect must be an object { x, y, w, h }, got ${shown(rect)}`);
  }
  for (const key of ["x", "y", "w", "h"]) {
    if (!isFiniteNumber(rect[key])) {
      throw new Error(`rect.${key} must be a finite number, got ${shown(rect[key])}`);
    }
  }
  if (rect.w <= 0 || rect.h <= 0) {
    throw new Error(`rect.w and rect.h must be > 0, got ${rect.w}×${rect.h}`);
  }
  if (!isFiniteNumber(padding) || padding < 0) {
    throw new Error(`padding must be a finite number >= 0, got ${shown(padding)}`);
  }
  return {
    x: Math.max(0, rect.x - padding),
    y: Math.max(0, rect.y - padding),
    w: rect.w + 2 * padding,
    h: rect.h + 2 * padding,
  };
}

/**
 * Assemble the provenance object a capture records.
 *
 * A plain object with exactly these keys — the gate rejects anything whose
 * geometry does not survive a JSON round-trip, so class instances and extra
 * measurement fields must not leak in. `composed` is deliberately absent: the
 * deterministic producer never emits it (only a legacy pre-composed banner
 * declares it by hand).
 *
 * @param {{sourceUrl: string, selector: string, rect: object, clip: object, scale: number}} input
 * @returns {{sourceUrl: string, selector: string, rect: object, clip: object, scale: number}}
 */
export function buildProvenance(input = {}) {
  const { sourceUrl, selector, rect, clip, scale } = input ?? {};
  if (typeof sourceUrl !== "string" || sourceUrl.trim() === "") {
    throw new Error(`provenance.sourceUrl must be a non-empty string, got ${shown(sourceUrl)}`);
  }
  if (typeof selector !== "string" || selector.trim() === "") {
    throw new Error(`provenance.selector must be a non-empty string, got ${shown(selector)}`);
  }
  const copyBox = (box, name) => {
    if (!isObject(box)) {
      throw new Error(`provenance.${name} must be an object { x, y, w, h }, got ${shown(box)}`);
    }
    for (const key of ["x", "y", "w", "h"]) {
      if (!isFiniteNumber(box[key])) {
        throw new Error(
          `provenance.${name}.${key} must be a finite number, got ${shown(box[key])}`,
        );
      }
    }
    return { x: box.x, y: box.y, w: box.w, h: box.h };
  };
  if (!isFiniteNumber(scale) || scale <= 0) {
    throw new Error(`provenance.scale must be a finite number > 0, got ${shown(scale)}`);
  }
  return {
    sourceUrl,
    selector,
    rect: copyBox(rect, "rect"),
    clip: copyBox(clip, "clip"),
    scale,
  };
}

/**
 * Compare a declared provenance with freshly measured geometry.
 *
 * The capture producer calls this before overwriting an existing capture: a
 * mismatch means the page moved, so the old file no longer shows what the
 * scene claims. Every drifted field is named — reporting only the first would
 * take one capture run per drifted coordinate.
 *
 * `sourceUrl` and `selector` must match exactly (a different element is a
 * different fact); numbers get `tolerancePx` slack for sub-pixel layout noise.
 *
 * @param {object} declared - provenance already in scene data
 * @param {object} measured - provenance from this capture run
 * @param {number} [tolerancePx=0.01]
 * @returns {{ok: boolean, errors: string[]}}
 */
export function compareMeasuredProvenance(declared, measured, tolerancePx = 0.01) {
  if (!isObject(declared)) {
    return { ok: false, errors: [`declared provenance must be an object, got ${shown(declared)}`] };
  }
  if (!isObject(measured)) {
    return { ok: false, errors: [`measured provenance must be an object, got ${shown(measured)}`] };
  }

  const errors = [];
  for (const field of ["sourceUrl", "selector"]) {
    if (declared[field] !== measured[field]) {
      errors.push(
        `provenance.${field} drifted: declared ${shown(declared[field])}, measured ${shown(measured[field])}`,
      );
    }
  }

  const compareNumber = (field, from, to) => {
    if (!isFiniteNumber(from) || !isFiniteNumber(to)) {
      errors.push(
        `provenance.${field}: declared ${shown(from)} and measured ${shown(to)} must both be finite numbers`,
      );
      return;
    }
    if (Math.abs(from - to) > tolerancePx) {
      errors.push(
        `provenance.${field} drifted: declared ${shown(from)}, measured ${shown(to)} (tolerance ${tolerancePx})`,
      );
    }
  };

  for (const name of ["rect", "clip"]) {
    for (const key of ["x", "y", "w", "h"]) {
      compareNumber(`${name}.${key}`, declared[name]?.[key], measured[name]?.[key]);
    }
  }
  compareNumber("scale", declared.scale, measured.scale);

  return { ok: errors.length === 0, errors };
}

/** Integer in, integer out; floats capped at 3 decimals so drift noise stays readable. */
function formatNumber(value) {
  if (!isFiniteNumber(value)) return shown(value);
  return String(Math.round(value * 1000) / 1000);
}

const quote = (value) => (typeof value === "string" ? JSON.stringify(value) : shown(value));

/**
 * Format a provenance object as a paste-ready scene-data block.
 *
 * The single source for every writer (`media-patch-format.mjs` and the capture
 * CLI): a second copy of this layout would drift and hand the
 * operator a block the gate rejects for a reason that looks like their mistake.
 * `composed` is only emitted when true, because it is an opt-out and printing
 * `composed: false` on every capture would imply the reconciliation was skipped.
 *
 * @param {object} provenance
 * @param {string} [indent="      "] - prefix for every line (nested content adds 2 spaces)
 * @returns {string}
 */
export function formatProvenanceBlock(provenance, indent = "      ") {
  if (!isObject(provenance)) {
    throw new Error(`provenance must be an object, got ${shown(provenance)}`);
  }
  const { rect, clip } = provenance;
  for (const [name, box] of [
    ["rect", rect],
    ["clip", clip],
  ]) {
    if (!isObject(box)) {
      throw new Error(
        `provenance.${name} must be an object { x, y, w, h }, got ${shown(box)} — refusing to format an incomplete provenance`,
      );
    }
  }
  const box = (b) =>
    `{ x: ${formatNumber(b.x)}, y: ${formatNumber(b.y)}, w: ${formatNumber(b.w)}, h: ${formatNumber(b.h)} }`;

  const lines = [
    `${indent}provenance: {`,
    `${indent}  sourceUrl: ${quote(provenance.sourceUrl)},`,
    `${indent}  selector: ${quote(provenance.selector)},`,
    `${indent}  rect: ${box(rect)},`,
    `${indent}  clip: ${box(clip)},`,
    `${indent}  scale: ${formatNumber(provenance.scale)},`,
  ];
  if (provenance.composed === true) lines.push(`${indent}  composed: true,`);
  lines.push(`${indent}},`);
  return lines.join("\n");
}
