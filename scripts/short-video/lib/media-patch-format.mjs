/**
 * Media Patch Format — unified formatting and normalization for media patches.
 *
 * Single source of truth for:
 *   1. Human-readable review summary (focus analysis + VLM semantics comments, spec §4.7)
 *   2. Copyable media: { ... } code blocks (including cropFocus, fit, volume, videoStartOffsetMs,
 *      evidence, provenance)
 *   3. Normalization of media-patch envelopes (both array and {schemaVersion, patches} shapes)
 *   4. Asset analysis lookup map loading
 *
 * Shared by review-media-patch.mjs and apply-media-patch.mjs (#649).
 *
 * @module media-patch-format
 */

import { readFileSync, existsSync } from "fs";
import { formatProvenanceBlock } from "./evidence-capture.mjs";
import { isPlainObject, shown, validateProvenance } from "./media-integrity.mjs";
import { BACKDROP_FIELD_KEYS } from "./media-field-schema.mjs";

/**
 * Format a focus analysis result as a human-readable comment block.
 *
 * Spec §4.7:
 *   - status=ok/partial: output readable summary (status, protectedRegions rect list, saliency available/unavailable)
 *   - status=degraded/unsupported: output warning line
 *   - status=low_information: output note that no protected regions found
 *
 * @param {Object|null} focusAnalysis - The focusAnalysis object from media-patch.json
 * @returns {string} Multi-line comment block (without slash-star wrappers, just // lines)
 */
export function formatFocusSummary(focusAnalysis) {
  if (!focusAnalysis || typeof focusAnalysis !== "object") {
    return "";
  }

  const status = focusAnalysis.status || "unknown";
  const errorCode = focusAnalysis.errorCode;
  const lines = [];

  switch (status) {
    case "ok":
    case "partial": {
      lines.push(`  // Focus Analysis: ${status}`);
      const regions = focusAnalysis.protectedRegions || [];
      if (regions.length > 0) {
        lines.push(`  // Protected Regions (${regions.length}):`);
        for (const r of regions) {
          const rect = r.rect || [];
          lines.push(
            `  //   ${r.kind || "unknown"}: [${rect.map((n) => n.toFixed(3)).join(", ")}]` +
              (r.confidence ? ` (conf: ${r.confidence})` : ""),
          );
        }
      } else {
        lines.push(`  // No protected regions detected.`);
      }
      const sal = focusAnalysis.saliency;
      if (sal) {
        lines.push(
          `  // Saliency: ${sal.available ? "available" : "unavailable"}` +
            (sal.available
              ? `, dispersion: ${sal.dispersion?.toFixed(3)}, centroid: [${(sal.centroid || []).map((n) => n.toFixed(3)).join(", ")}]`
              : ""),
        );
      }
      break;
    }

    case "low_information": {
      lines.push(
        `  // Focus Analysis: low_information — no protected regions, place text normally.`,
      );
      break;
    }

    case "degraded": {
      lines.push(
        `  // ⚠️ Focus Analysis: degraded (${errorCode || "unknown"}) — ignore focusAnalysis, use default text placement.`,
      );
      break;
    }

    case "unsupported": {
      lines.push(
        `  // Focus Analysis: unsupported (${errorCode || "unknown"}) — video asset, not applicable.`,
      );
      break;
    }

    default: {
      lines.push(`  // Focus Analysis: unknown status "${status}".`);
      break;
    }
  }

  return lines.join("\n");
}

/**
 * Format VLM semantic analysis as a human-readable comment block.
 *
 * P3: Displays description, subjects, contentKind, fit, criticalEdgeText, reason
 * from asset-analysis.json.
 *
 * @param {Object|null} semantics - VLM analysis fields from asset-analysis.json
 * @returns {string} Multi-line comment block
 */
function formatSemanticsSummary(semantics) {
  if (!semantics || typeof semantics !== "object") {
    return "";
  }

  const lines = [];

  if (semantics.description) {
    lines.push(`  // VLM Description: ${semantics.description}`);
  }
  if (semantics.subjects && semantics.subjects.length > 0) {
    lines.push(`  // Subjects: ${semantics.subjects.join(", ")}`);
  }
  if (semantics.contentKind) {
    lines.push(`  // Content Kind: ${semantics.contentKind}`);
  }
  if (semantics.fit) {
    lines.push(`  // Fit: ${semantics.fit}`);
  }
  if (semantics.criticalEdgeText) {
    lines.push(`  // Critical Edge Text: ${semantics.criticalEdgeText}`);
  }
  if (semantics.reason) {
    lines.push(`  // Reason: ${semantics.reason}`);
  }
  if (semantics.lowConfidence) {
    lines.push(
      `  // ⚠️ Low confidence (technicalScore: ${semantics.technicalScore || "?"}) — VLM skipped.`,
    );
  }
  if (semantics.cropDecision) {
    const d = semantics.cropDecision;
    const focusStr = d.cropFocus ? `[${d.cropFocus.x}, ${d.cropFocus.y}]` : "null";
    lines.push(`  // Crop Decision: ${d.status}, ${d.policy}, focus ${focusStr} — ${d.reason}`);
  }

  return lines.join("\n");
}

/**
 * Load asset-analysis.json artifact (if it exists).
 *
 * @param {string} analysisPath - Path to asset-analysis.json
 * @returns {Map<string, Object>|null} Map of path → semantics, or null if file not found
 */
export function loadAssetAnalysis(analysisPath) {
  if (!analysisPath || !existsSync(analysisPath)) {
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(analysisPath, "utf8"));
    if (!data || !Array.isArray(data.assets)) return null;

    // Build a lookup map by path
    const map = new Map();
    for (const entry of data.assets) {
      if (entry.path) {
        map.set(entry.path, entry);
      }
    }
    return map;
  } catch {
    return null;
  }
}

function stringField(name, value) {
  if (typeof value !== "string") {
    throw new Error(`media.${name} must be a string, got ${shown(value)}`);
  }
  // JSON.stringify, not bare interpolation: patch values are agent-produced
  // from scraped pages, so a quote or newline must not close the literal.
  return JSON.stringify(value);
}

function numberField(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`media.${name} must be a finite number, got ${shown(value)}`);
  }
  return String(value);
}

function booleanField(name, value) {
  if (typeof value !== "boolean") {
    throw new Error(`media.${name} must be a boolean, got ${shown(value)}`);
  }
  return String(value);
}

function formatBackdrop(backdrop) {
  if (!isPlainObject(backdrop)) {
    throw new Error(`media.backdrop must be an object, got ${shown(backdrop)}`);
  }
  // Same rule as the top-level media body: an unknown key would be dropped, so
  // refuse it rather than write a declaration with no effect.
  const unknown = Object.keys(backdrop).filter((key) => !BACKDROP_FIELD_KEYS.has(key));
  if (unknown.length > 0) {
    throw new Error(`media.backdrop has unknown field(s): ${unknown.sort().join(", ")}`);
  }
  const parts = [];
  if (backdrop.type !== undefined)
    parts.push(`type: ${stringField("backdrop.type", backdrop.type)}`);
  if (backdrop.path !== undefined)
    parts.push(`path: ${stringField("backdrop.path", backdrop.path)}`);
  if (backdrop.source !== undefined)
    parts.push(`source: ${stringField("backdrop.source", backdrop.source)}`);
  if (backdrop.animation !== undefined)
    parts.push(`animation: ${stringField("backdrop.animation", backdrop.animation)}`);
  if (backdrop.volume !== undefined)
    parts.push(`volume: ${numberField("backdrop.volume", backdrop.volume)}`);
  if (backdrop.upscale !== undefined)
    parts.push(`upscale: ${booleanField("backdrop.upscale", backdrop.upscale)}`);
  return `{ ${parts.join(", ")} }`;
}

/**
 * Format a `scene.media` object as a JS object literal (no `media:` prefix,
 * no trailing comma). The single writer for every surface: the review copy
 * (`formatPatchEntry`) and the manual CLI's scene-data rewrite
 * (`apply-media-patch.mjs`) (#846).
 *
 * Fields follow `MEDIA_FIELD_KEYS` in `media-field-schema.mjs`, so a key the
 * schema accepts cannot be silently dropped on the way to scene-data.
 * Invalid `evidence`/`provenance` values are omitted here; the review caller
 * prints a comment explaining why, and the CLI rejects them before writing.
 *
 * @param {Object} media - Media object from a patch entry
 * @param {string} propertyIndent - Indentation of the line holding the object
 * @param {{ includeDeprecatedFocus?: boolean }} [options]
 * @returns {string} `{ ... }` object literal
 */
export function formatMediaObject(media, propertyIndent = "  ", options = {}) {
  if (!isPlainObject(media)) {
    throw new Error(`media must be an object, got ${shown(media)}`);
  }
  const { includeDeprecatedFocus = false } = options;
  const fieldIndent = propertyIndent + "  ";
  const lines = ["{"];

  if (media.type !== undefined)
    lines.push(`${fieldIndent}type: ${stringField("type", media.type)},`);
  if (media.path !== undefined)
    lines.push(`${fieldIndent}path: ${stringField("path", media.path)},`);
  if (media.source !== undefined)
    lines.push(`${fieldIndent}source: ${stringField("source", media.source)},`);
  if (media.mode !== undefined)
    lines.push(`${fieldIndent}mode: ${stringField("mode", media.mode)},`);
  if (media.fit !== undefined) lines.push(`${fieldIndent}fit: ${stringField("fit", media.fit)},`);
  if (media.animation !== undefined)
    lines.push(`${fieldIndent}animation: ${stringField("animation", media.animation)},`);
  if (media.overlay !== undefined)
    lines.push(`${fieldIndent}overlay: ${numberField("overlay", media.overlay)},`);
  if (media.volume !== undefined)
    lines.push(`${fieldIndent}volume: ${numberField("volume", media.volume)},`);
  if (media.videoStartOffsetMs !== undefined)
    lines.push(
      `${fieldIndent}videoStartOffsetMs: ${numberField("videoStartOffsetMs", media.videoStartOffsetMs)},`,
    );
  // `0`/""/false are invalid cropFocus values, not "absent": a truthy check
  // dropped them silently, the same lost-declaration failure the unknown-key
  // rejection exists to prevent (#846 review).
  if (media.cropFocus !== undefined && media.cropFocus !== null) {
    if (
      typeof media.cropFocus.x !== "number" ||
      typeof media.cropFocus.y !== "number" ||
      media.cropFocus.x < 0 ||
      media.cropFocus.x > 1 ||
      media.cropFocus.y < 0 ||
      media.cropFocus.y > 1
    ) {
      throw new Error(
        `cropFocus values must be numbers in [0, 1], got x: ${shown(media.cropFocus.x)}, y: ${shown(media.cropFocus.y)}`,
      );
    }
    lines.push(`${fieldIndent}cropFocus: { x: ${media.cropFocus.x}, y: ${media.cropFocus.y} },`);
  }
  // Deprecated but still rendered; the review copy deliberately drops it,
  // the scene-data writer keeps it so a manual patch cannot lose the field.
  if (includeDeprecatedFocus && media.focus !== undefined)
    lines.push(`${fieldIndent}focus: ${stringField("focus", media.focus)},`);
  if (media.upscale !== undefined)
    lines.push(`${fieldIndent}upscale: ${booleanField("upscale", media.upscale)},`);
  if (media.evidence === true || media.evidence === false || media.evidence === null) {
    lines.push(`${fieldIndent}evidence: ${JSON.stringify(media.evidence)},`);
  }
  if (media.provenance) {
    const { ok } = validateProvenance(media.provenance);
    if (ok) lines.push(formatProvenanceBlock(media.provenance, fieldIndent));
  }
  if (media.contentKind !== undefined)
    lines.push(`${fieldIndent}contentKind: ${stringField("contentKind", media.contentKind)},`);
  if (media.subjects !== undefined) {
    if (
      !Array.isArray(media.subjects) ||
      media.subjects.some((subject) => typeof subject !== "string")
    ) {
      throw new Error(`media.subjects must be an array of strings, got ${shown(media.subjects)}`);
    }
    lines.push(`${fieldIndent}subjects: ${JSON.stringify(media.subjects)},`);
  }
  if (media.backdrop !== undefined)
    lines.push(`${fieldIndent}backdrop: ${formatBackdrop(media.backdrop)},`);

  lines.push(`${propertyIndent}}`);
  return lines.join("\n");
}

/**
 * Format a single media-patch entry as a copyable code block with review comments.
 *
 * Output format:
 *   // VLM Description: ...
 *   // Subjects: ...
 *   // Focus Analysis: ...
 *   media: {
 *     type: "image",
 *     path: "...",
 *     ...
 *     cropFocus: { x: 0.5, y: 0.5 },
 *   }
 *
 * The media object does NOT contain analysis or focusAnalysis fields.
 *
 * @param {Object} entry - A single entry from media-patch.json
 * @param {Map|null} [analysisMap] - Optional lookup from asset-analysis.json
 * @returns {string} Formatted block
 */
export function formatPatchEntry(entry, analysisMap) {
  if (!entry || entry.status !== "assigned") {
    return "";
  }

  const lines = [];

  // VLM semantics comments (P3: from asset-analysis.json)
  if (analysisMap && entry.media?.path) {
    const semantics = analysisMap.get(entry.media.path);
    if (semantics) {
      const summary = formatSemanticsSummary(semantics);
      if (summary) lines.push(summary);
    }
  }

  // Review summary comments (spec §4.7 v6 P1-3)
  if (entry.analysis?.focusAnalysis) {
    lines.push(formatFocusSummary(entry.analysis.focusAnalysis));
  }

  // #846/#836/#758: one formatter for every writer. The review copy is what an
  // agent pastes back into scene-data, so a declared evidence marker or capture
  // geometry must survive the round trip (same contract as VC-21). Values are
  // interpolated into generated JS, so only validated input becomes code: a bad
  // coordinate would otherwise be a code-injection surface or change type.
  const media = entry.media || {};
  if (
    media.evidence !== undefined &&
    media.evidence !== true &&
    media.evidence !== false &&
    media.evidence !== null
  ) {
    lines.push(
      `    // INVALID evidence (${shown(media.evidence)}): must be true, false or null — not copied`,
    );
  }
  if (media.provenance) {
    const { ok, errors } = validateProvenance(media.provenance);
    if (!ok) lines.push(`    // INVALID provenance — not copied as code: ${errors.join("; ")}`);
  }
  // Note: focus is NOT included in new output (deprecated, spec §4.8)
  // A malformed field must not take down the whole review summary: render the
  // reason as a comment and keep the block empty, same as evidence/provenance.
  try {
    lines.push(`  media: ${formatMediaObject(media, "  ")},`);
  } catch (error) {
    lines.push(`  // INVALID media — not copied as code: ${error.message}`);
    lines.push(`  media: {},`);
  }

  return lines.join("\n");
}

/**
 * Format the entire media-patch.json as a human-readable output.
 *
 * @param {Array} patches - Array of patch entries from media-patch.json
 * @param {Map|null} [analysisMap] - Optional lookup from asset-analysis.json
 * @returns {string} Complete formatted output
 */
export function formatMediaPatch(patches, analysisMap) {
  if (!Array.isArray(patches)) {
    return "No patches to display.\n";
  }

  const sections = [];
  sections.push("=".repeat(60));
  sections.push("📋 Media Patch — Human Review");
  sections.push("=".repeat(60));
  sections.push("");

  const assigned = patches.filter((p) => p.status === "assigned");
  const unassigned = patches.filter((p) => p.status === "unassigned");

  if (assigned.length > 0) {
    sections.push(`── Assigned (${assigned.length}) ──`);
    sections.push("");

    for (const entry of assigned) {
      const header = `Scene ${entry.sceneId}: ${entry.sceneName || "(unnamed)"} (${entry.visualType || "?"})`;
      sections.push(header);
      sections.push(`  Score: ${entry.assetScore || 0}, Source: ${entry.source || "?"}`);

      const formatted = formatPatchEntry(entry, analysisMap);
      if (formatted) {
        sections.push(formatted);
      }
      sections.push("");
    }
  }

  if (unassigned.length > 0) {
    sections.push(`── Unassigned (${unassigned.length}) ──`);
    sections.push("");
    for (const entry of unassigned) {
      sections.push(
        `  Score: ${entry.assetScore || 0}, Source: ${entry.source || "?"} — no available scene`,
      );
    }
    sections.push("");
  }

  if (assigned.length === 0 && unassigned.length === 0) {
    sections.push("(empty patch file)");
  }

  return sections.join("\n") + "\n";
}

/**
 * Normalize a media-patch.json payload to the entry array (#199 2.5).
 * Accepts the new `{schemaVersion, patches}` envelope and the legacy
 * top-level array, so files written before the envelope landed stay readable.
 *
 * @param {Object|Array} raw - parsed media-patch.json content
 * @returns {Array} patch entries (empty when the payload is neither shape)
 */
export function normalizeMediaPatch(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.patches)) return raw.patches;
  return [];
}

/**
 * Strict variant of {@link normalizeMediaPatch} for writers.
 *
 * Durations may read an unrecognised payload as "no patches" (a no-op review),
 * but a CLI that rewrites scene-data must not: an envelope was reported as
 * "must be a JSON array" before this existed (#846). Shape detection stays
 * here so the accepted payload contract has one home.
 *
 * @param {unknown} raw - parsed patch JSON
 * @returns {Array} patch entries
 * @throws {Error} when the payload is neither shape
 */
export function parsePatchPayload(raw) {
  if (Array.isArray(raw) || (isPlainObject(raw) && Array.isArray(raw.patches))) {
    return normalizeMediaPatch(raw);
  }
  throw new Error("Patch file must be a JSON array or a { schemaVersion, patches } envelope.");
}
