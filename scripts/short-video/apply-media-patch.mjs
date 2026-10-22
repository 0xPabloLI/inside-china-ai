#!/usr/bin/env node
/**
 * Apply Media Patch — applies a reviewed media-patch.json to scene-data.mjs.
 *
 * Reads `output/media-patch.json` (produced by asset-sourcer.mjs) and writes
 * approved media assignments directly into `content/<slug>/scene-data.mjs`,
 * with backup, validation, atomic write, and rollback.
 *
 * Usage:
 *   node apply-media-patch.mjs --content <slug> [--patch <path>] [--dry-run] [--force]
 *
 * Options:
 *   --content <slug>  Content directory slug (required)
 *   --patch <path>   Path to media-patch.json (default: output/media-patch.json)
 *   --dry-run        Show planned changes without modifying files
 *   --force          Overwrite existing media fields (default: preserve)
 *
 * @module apply-media-patch
 */

import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from "fs";
import { join, dirname, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { shown, validateProvenance } from "./lib/media-integrity.mjs";
import { formatMediaObject, normalizeMediaPatch } from "./lib/media-patch-format.mjs";
import { MEDIA_FIELD_KEYS } from "./lib/media-field-schema.mjs";

// ─── Pure functions ───

/**
 * Check if a media path is contained within the content directory.
 * Rejects absolute paths, ../ traversal, and ~ prefixes.
 *
 * @param {string} mediaPath - Path from patch (relative to content dir)
 * @param {string} contentDir - Absolute content directory path
 * @returns {boolean} True if path is contained within contentDir
 */
export function isPathContained(mediaPath, contentDir) {
  if (!mediaPath || typeof mediaPath !== "string") return false;
  // Reject absolute paths
  if (mediaPath.startsWith("/") || mediaPath.startsWith("~")) return false;
  // Reject ~ prefixes
  if (mediaPath.startsWith("~")) return false;
  const resolved = resolve(contentDir, mediaPath);
  const contentDirWithSep = contentDir.endsWith(sep) ? contentDir : contentDir + sep;
  return resolved === contentDir || resolved.startsWith(contentDirWithSep);
}

/**
 * Detect conflict between patch media and existing scene media.
 *
 * @param {Object|null} patchMedia - Media from patch entry
 * @param {Object|null} existingMedia - Media already in scene-data.mjs
 * @returns {"none"|"already-applied"|"conflict"}
 */
export function detectConflict(patchMedia, existingMedia) {
  if (!existingMedia) return "none";
  if (patchMedia.type === existingMedia.type && patchMedia.path === existingMedia.path) {
    return "already-applied";
  }
  return "conflict";
}

/**
 * Validate a single patch entry against scene data.
 *
 * @param {Object} entry - Patch entry from media-patch.json
 * @param {Array} scenes - Scene array from scene-data.mjs
 * @param {string} contentDir - Absolute content directory path
 * @returns {{valid: boolean, errors: string[], reason?: string, scene?: Object}}
 */
export function validatePatchEntry(entry, scenes, contentDir) {
  const errors = [];

  // Check status — skip non-assigned entries
  if (entry.status !== "assigned") {
    return { valid: true, errors: [], reason: entry.status || "unassigned" };
  }

  // Check media exists
  if (!entry.media || typeof entry.media !== "object") {
    errors.push("Patch entry has status 'assigned' but media is null or missing.");
    return { valid: false, errors };
  }

  // Check sceneId is a number
  if (typeof entry.sceneId !== "number") {
    errors.push(`Invalid sceneId: expected number, got ${typeof entry.sceneId}.`);
    return { valid: false, errors };
  }

  // Check scene exists
  const scene = scenes.find((s) => s.id === entry.sceneId);
  if (!scene) {
    errors.push(`Scene id ${entry.sceneId} not found in scene-data.mjs.`);
    return { valid: false, errors };
  }

  // Check media type
  if (!entry.media.type || !["image", "video"].includes(entry.media.type)) {
    errors.push(`Invalid media type: "${entry.media.type}". Must be "image" or "video".`);
  }

  // #846: the formatter writes MEDIA_FIELD_KEYS and nothing else, so an unknown
  // key would be dropped on the way to scene-data. Reject it here instead of
  // reporting a successful patch that lost a declaration (#836's preflight
  // rule, applied to the writer).
  const unknownMediaKeys = Object.keys(entry.media).filter((key) => !MEDIA_FIELD_KEYS.has(key));
  if (unknownMediaKeys.length > 0) {
    errors.push(
      `Unknown media field(s): ${unknownMediaKeys.sort().join(", ")}. Add the key to MediaField (remotion/src/types.ts) and MEDIA_FIELD_KEYS (lib/media-field-schema.mjs) first.`,
    );
  }

  // Check media path exists
  if (!entry.media.path) {
    errors.push("Media path is required.");
  } else {
    // Path containment check
    if (!isPathContained(entry.media.path, contentDir)) {
      errors.push(`Media path "${entry.media.path}" is not contained within content directory.`);
    }
  }

  // #360 videoStartOffsetMs — optional start offset into the source video.
  // Valid: integer ms ≥ 0 (absent = start at 0). Rejected: negative,
  // non-integer, non-number.
  if (entry.media.videoStartOffsetMs !== undefined) {
    const offset = entry.media.videoStartOffsetMs;
    if (entry.media.type !== "video") {
      errors.push(
        `Invalid videoStartOffsetMs on ${entry.media.type} media: only video media supports videoStartOffsetMs.`,
      );
    } else if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) {
      errors.push(
        `Invalid videoStartOffsetMs: ${JSON.stringify(offset)}. Must be an integer ≥ 0 (milliseconds).`,
      );
    }
  }

  // #758: a patch is the writer that used to silently drop evidence and
  // provenance, so it must not accept a declaration the final gate would
  // reject. The pixel reconciliation is NOT here — no file bytes are read at
  // patch-validation time; the final media gate owns that half.
  if (
    entry.media.evidence !== undefined &&
    entry.media.evidence !== null &&
    typeof entry.media.evidence !== "boolean"
  ) {
    errors.push(
      `Invalid evidence flag: ${shown(entry.media.evidence)}. Must be a boolean or null (only true marks evidence media).`,
    );
  } else if (entry.media.evidence === true && !entry.media.provenance) {
    errors.push(
      "media.evidence:true requires media.provenance (sourceUrl, selector, rect, clip, scale).",
    );
  }
  if (entry.media.provenance) {
    const provenance = validateProvenance(entry.media.provenance);
    if (!provenance.ok) {
      errors.push(`Invalid media.provenance: ${provenance.errors.join("; ")}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Check conflict / already-applied
  const conflictResult = detectConflict(entry.media, scene.media);
  if (conflictResult === "conflict") {
    return { valid: true, errors: [], reason: "conflict", scene };
  }
  if (conflictResult === "already-applied") {
    return { valid: true, errors: [], reason: "already-applied", scene };
  }

  return { valid: true, errors: [], reason: "none", scene };
}

// ─── Text scanning ───
//
// scene-data.mjs is authored JS with comments, trailing commas and nested
// objects (aiVideo / aiImage / avatar / evidence provenance), so the rewrite
// locates structure by brace depth, skipping strings and comments — never with
// a `[^}]*` regex that stops at the first nested close (#846).

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/** Index after the string/comment starting at `i`, or 0 when `i` is neither. */
function skipAtomic(text, i) {
  const char = text[i];
  if (char === '"' || char === "'" || char === "`") {
    let j = i + 1;
    while (j < text.length) {
      if (text[j] === "\\") j += 2;
      else if (text[j] === char) return j + 1;
      else j++;
    }
    return text.length;
  }
  if (char === "/" && text[i + 1] === "/") {
    const end = text.indexOf("\n", i + 2);
    return end === -1 ? text.length : end;
  }
  if (char === "/" && text[i + 1] === "*") {
    const end = text.indexOf("*/", i + 2);
    return end === -1 ? text.length : end + 2;
  }
  return 0;
}

function skipTrivia(text, i) {
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    const skipped = skipAtomic(text, i);
    if (skipped) {
      i = skipped;
      continue;
    }
    break;
  }
  return i;
}

/** Index of the `}` closing the object opening at `openIndex`, or -1. */
function matchingBrace(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length;) {
    const skipped = skipAtomic(text, i);
    if (skipped) {
      i = skipped;
      continue;
    }
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function lineStartOf(text, index) {
  return text.lastIndexOf("\n", index - 1) + 1;
}

function readLiteral(text, start) {
  const char = text[start];
  if (char === '"' || char === "'" || char === "`") {
    const end = skipAtomic(text, start) - 1;
    return text.slice(start + 1, end);
  }
  const match = /^-?\d+(?:\.\d+)?/.exec(text.slice(start, start + 32));
  return match ? Number(match[0]) : null;
}

/** Index of the last character of the value starting at `start`, or -1. */
function valueEndOf(text, start) {
  const char = text[start];
  if (char === "{") return matchingBrace(text, start);
  if (char === "[") {
    let depth = 0;
    for (let i = start; i < text.length;) {
      const skipped = skipAtomic(text, i);
      if (skipped) {
        i = skipped;
        continue;
      }
      if (text[i] === "[") depth++;
      else if (text[i] === "]") {
        depth--;
        if (depth === 0) return i;
      }
      i++;
    }
    return -1;
  }
  if (char === '"' || char === "'" || char === "`") return skipAtomic(text, start) - 1;
  let i = start;
  while (i < text.length && !/[,}\]\n]/.test(text[i])) i++;
  return i - 1;
}

/**
 * Locate a top-level property of the object spanning [objectStart, objectEnd].
 * Nested objects keep their own depth, so `id` inside `aiVideo: { ... }` or a
 * `}` inside a comment cannot shadow the scene's own field.
 */
function findTopLevelProperty(text, objectStart, objectEnd, key) {
  let depth = 0;
  let i = objectStart + 1;
  while (i < objectEnd) {
    const skipped = skipAtomic(text, i);
    if (skipped) {
      i = skipped;
      continue;
    }
    const char = text[i];
    if (char === "{" || char === "[" || char === "(") {
      depth++;
      i++;
      continue;
    }
    if (char === "}" || char === "]" || char === ")") {
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && IDENT_START.test(char)) {
      let end = i + 1;
      while (end < objectEnd && IDENT_PART.test(text[end])) end++;
      const ident = text.slice(i, end);
      const after = skipTrivia(text, end);
      if (ident === key && text[after] === ":") {
        return { propertyStart: i, valueStart: skipTrivia(text, after + 1) };
      }
      i = end;
      continue;
    }
    i++;
  }
  return null;
}

/** The `{ ... }` ranges of every top-level element in `export const scenes = [...]`. */
export function listSceneRanges(text) {
  const ranges = [];
  const match = /export\s+const\s+scenes\s*=\s*\[/.exec(text);
  if (!match) return ranges;
  let i = match.index + match[0].length;
  while (i < text.length) {
    const skipped = skipAtomic(text, i);
    if (skipped) {
      i = skipped;
      continue;
    }
    if (text[i] === "{") {
      const end = matchingBrace(text, i);
      if (end === -1) break;
      ranges.push({ start: i, end });
      i = end + 1;
      continue;
    }
    if (text[i] === "]") break;
    i++;
  }
  return ranges;
}

/** Scene ids in source order (numeric ids and quoted ids alike). */
export function listSceneIds(text) {
  return listSceneRanges(text)
    .map((range) => findTopLevelProperty(text, range.start, range.end, "id"))
    .filter(Boolean)
    .map((property) => readLiteral(text, property.valueStart))
    .filter((id) => id !== null);
}

function findSceneRange(text, sceneId) {
  for (const range of listSceneRanges(text)) {
    const idProperty = findTopLevelProperty(text, range.start, range.end, "id");
    if (idProperty && readLiteral(text, idProperty.valueStart) === sceneId) return range;
  }
  return null;
}

/** True when the media object at [openIndex, closeIndex] declares `evidence: true`. */
function hasEvidenceTrue(text, openIndex, closeIndex) {
  const property = findTopLevelProperty(text, openIndex, closeIndex, "evidence");
  if (!property) return false;
  const end = valueEndOf(text, property.valueStart);
  return end !== -1 && text.slice(property.valueStart, end + 1).trim() === "true";
}

/**
 * Apply patches to scene-data.mjs text (pure text transformation, no disk write).
 *
 * @param {string} fileContent - Original scene-data.mjs text
 * @param {Array} patches - Array of { sceneId, media, action: "add"|"replace" }
 * @param {{ force: boolean }} options
 * @returns {{ modifiedContent: string, applied: Array, skipped: Array, errors: Array }}
 */
export function applyPatchesToText(fileContent, patches, options = { force: false }) {
  let modifiedContent = fileContent;
  const applied = [];
  const skipped = [];
  const errors = [];
  const appliedSceneIds = new Set();

  for (const patch of patches) {
    const { sceneId, media } = patch;

    // Skip if this scene was already processed
    if (appliedSceneIds.has(sceneId)) {
      skipped.push({ sceneId, reason: "conflict" });
      continue;
    }

    // The patch's declared action is re-derived from the file: `media: null`
    // imports as falsy and the CLI calls that "add", but the property already
    // exists, so inserting would duplicate the key. A located property is always
    // replaced; a missing one is always inserted (#846).
    const sceneRange = findSceneRange(modifiedContent, sceneId);
    if (!sceneRange) {
      errors.push(`Could not find scene ${sceneId} in scene-data.mjs.`);
      continue;
    }

    const mediaProperty = findTopLevelProperty(
      modifiedContent,
      sceneRange.start,
      sceneRange.end,
      "media",
    );

    if (mediaProperty) {
      const valueEnd = valueEndOf(modifiedContent, mediaProperty.valueStart);
      if (valueEnd === -1) {
        errors.push(`Could not locate media block to replace in scene ${sceneId}.`);
        continue;
      }

      // #846: `--force` forced the replacement of every media block, which
      // silently erased `evidence: true` and its capture geometry. An Evidence
      // Media may only be overwritten with an explicit decision: `evidence:
      // false` to de-designate it, or `evidence: true` plus valid provenance to
      // keep the declaration. Anything else is an error, not a success.
      if (
        modifiedContent[mediaProperty.valueStart] === "{" &&
        hasEvidenceTrue(modifiedContent, mediaProperty.valueStart, valueEnd)
      ) {
        const declared = media?.evidence;
        if (
          declared === undefined ||
          (declared !== true && declared !== false && declared !== null)
        ) {
          errors.push(
            `Scene ${sceneId} media is an Evidence Media (evidence: true); pass media.evidence: false to de-designate it, or evidence: true with a valid provenance to keep the declaration.`,
          );
          continue;
        }
        if (declared === true) {
          const provenance = validateProvenance(media.provenance || {});
          if (!provenance.ok) {
            errors.push(
              `Scene ${sceneId} media is an Evidence Media (evidence: true); a valid provenance is required to keep the declaration: ${provenance.errors.join("; ")}`,
            );
            continue;
          }
        }
      }

      const lineStart = lineStartOf(modifiedContent, mediaProperty.propertyStart);
      const linePrefix = modifiedContent.slice(lineStart, mediaProperty.propertyStart);
      const indent = /^[ \t]*$/.test(linePrefix) ? linePrefix : "";
      const oldValue = modifiedContent.slice(mediaProperty.valueStart, valueEnd + 1);
      let replacement = `media: ${formatMediaObject(media, indent, { includeDeprecatedFocus: true })},`;
      if (!oldValue.includes("\n")) replacement = replacement.replace(/\n\s*/g, " ");
      let end = valueEnd + 1;
      if (modifiedContent[end] === ",") end++;
      modifiedContent =
        modifiedContent.slice(0, mediaProperty.propertyStart) +
        replacement +
        modifiedContent.slice(end);
      applied.push({ sceneId, action: "replaced", media });
      appliedSceneIds.add(sceneId);
      continue;
    }

    // Insert: put the media block immediately before voiceover.
    const voiceoverProperty = findTopLevelProperty(
      modifiedContent,
      sceneRange.start,
      sceneRange.end,
      "voiceover",
    );
    if (!voiceoverProperty) {
      errors.push(`Could not locate voiceover field in scene ${sceneId} for media insertion.`);
      continue;
    }

    const lineStart = lineStartOf(modifiedContent, voiceoverProperty.propertyStart);
    const linePrefix = modifiedContent.slice(lineStart, voiceoverProperty.propertyStart);
    const block = `media: ${formatMediaObject(media, /^[ \t]*$/.test(linePrefix) ? linePrefix : "", { includeDeprecatedFocus: true })},`;
    if (/^[ \t]*$/.test(linePrefix)) {
      modifiedContent =
        modifiedContent.slice(0, lineStart) +
        `${linePrefix}${block}\n` +
        modifiedContent.slice(lineStart);
    } else {
      const flat = block.replace(/\n\s*/g, " ");
      modifiedContent =
        modifiedContent.slice(0, voiceoverProperty.propertyStart) +
        `${flat} ` +
        modifiedContent.slice(voiceoverProperty.propertyStart);
    }
    applied.push({ sceneId, action: "added", media });
    appliedSceneIds.add(sceneId);
  }

  return { modifiedContent, applied, skipped, errors };
}

/**
 * Generate a media-receipt.json object.
 *
 * @param {Array} applied - Array of applied entries
 * @param {Array} skipped - Array of skipped entries
 * @param {{ content: string, patchFile: string, backupPath: string }} meta
 * @returns {Object} Receipt object
 */
export function generateReceipt(applied, skipped, meta) {
  const conflicts = skipped.filter((s) => s.reason === "conflict").length;
  return {
    appliedAt: new Date().toISOString(),
    content: meta.content,
    patchFile: meta.patchFile,
    backupPath: meta.backupPath,
    applied,
    skipped,
    summary: {
      total: applied.length + skipped.length,
      applied: applied.length,
      skipped: skipped.length,
      conflicts,
    },
  };
}

/**
 * Format dry-run output as human-readable text.
 *
 * @param {Array} applied - Array of applied entries
 * @param {Array} skipped - Array of skipped entries
 * @returns {string} Formatted output
 */
export function formatDryRun(applied, skipped) {
  const lines = [];

  for (const entry of applied) {
    const mediaStr = entry.media
      ? `{ type: "${entry.media.type}", path: "${entry.media.path}", animation: "${entry.media.animation || "fade"}", overlay: ${entry.media.overlay || 0.7} }`
      : "{}";
    lines.push(`Scene ${entry.sceneId} (${entry.sceneName || "unknown"}):`);
    lines.push(`  + media: ${mediaStr}`);
    lines.push("");
  }

  for (const entry of skipped) {
    lines.push(`Scene ${entry.sceneId} (${entry.sceneName || "unknown"}):`);
    if (entry.reason === "conflict") {
      lines.push(`  ! CONFLICT: existing media → skipping (use --force to overwrite)`);
    } else if (entry.reason === "already-applied") {
      lines.push(`  = ALREADY APPLIED: media matches existing, no change`);
    } else {
      lines.push(`  - SKIP: status "${entry.reason}" in patch`);
    }
    lines.push("");
  }

  // toApply entries carry "add"/"replace"; applyPatchesToText results carry
  // "added"/"replaced". The dry-run summary reads toApply, so match both.
  const addCount = applied.filter((a) => a.action === "added" || a.action === "add").length;
  const replaceCount = applied.filter(
    (a) => a.action === "replaced" || a.action === "replace",
  ).length;
  const conflictCount = skipped.filter((s) => s.reason === "conflict").length;
  const alreadyCount = skipped.filter((s) => s.reason === "already-applied").length;
  const otherSkipCount = skipped.length - conflictCount - alreadyCount;

  lines.push(
    `Summary: ${addCount} to add, ${replaceCount} to replace, ${conflictCount} conflict${conflictCount !== 1 ? "s" : ""}, ${alreadyCount} already applied, ${otherSkipCount} skipped`,
  );

  return lines.join("\n");
}

// ─── Main orchestrator ───

/**
 * Accept both patch shapes the pipeline writes: a bare array, and the
 * `{ schemaVersion, patches: [...] }` envelope `media-patch-format.mjs` emits.
 * Before this, an envelope parsed as a non-array and the CLI exited with
 * "must be a JSON array" even though normalization already supported it (#846).
 *
 * @param {unknown} raw - Parsed patch JSON
 * @returns {Array} Normalized patch entries
 * @throws {Error} When the payload is neither shape
 */
export function normalizePatchInput(raw) {
  const isArray = Array.isArray(raw);
  const isEnvelope =
    raw !== null && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.patches);
  if (!isArray && !isEnvelope) {
    throw new Error("Patch file must be a JSON array or a { schemaVersion, patches } envelope.");
  }
  return normalizeMediaPatch(raw);
}

/**
 * Main entry point.
 *
 * @param {string[]} args - CLI arguments
 */
export async function main(args = process.argv.slice(2)) {
  const getArg = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };

  const contentSlug = getArg("content");
  const patchPath = getArg("patch");
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  if (!contentSlug) {
    console.error(
      "Usage: node apply-media-patch.mjs --content <slug> [--patch <path>] [--dry-run] [--force]",
    );
    process.exit(1);
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const contentDir = join(__dirname, "content", contentSlug);
  const defaultPatchPath = join(__dirname, "output", "media-patch.json");
  const resolvedPatchPath = patchPath || defaultPatchPath;
  const sceneDataPath = join(contentDir, "scene-data.mjs");
  const backupPath = sceneDataPath + ".bak";
  const receiptPath = join(__dirname, "output", "media-receipt.json");

  // ── Check files exist ──
  if (!existsSync(resolvedPatchPath)) {
    console.error(`❌ Patch file not found: ${resolvedPatchPath}`);
    console.error("   Run asset-sourcer.mjs first to generate media-patch.json");
    process.exit(1);
  }

  if (!existsSync(sceneDataPath)) {
    console.error(`❌ scene-data.mjs not found: ${sceneDataPath}`);
    process.exit(1);
  }

  // ── Load patch JSON ──
  let patches;
  try {
    patches = normalizePatchInput(JSON.parse(readFileSync(resolvedPatchPath, "utf8")));
  } catch (e) {
    console.error(`❌ Failed to parse patch JSON: ${e.message}`);
    process.exit(1);
  }

  if (patches.length === 0) {
    console.log("No patches to apply. Empty patch file.");
    const receipt = generateReceipt([], [], {
      content: contentSlug,
      patchFile: resolvedPatchPath,
      backupPath: "N/A (no changes)",
    });
    if (!dryRun) {
      const { dirname: receiptDir } = { dirname: join(__dirname, "output") };
      writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
    }
    process.exit(0);
  }

  // ── Load scene-data.mjs ──
  let scenes;
  try {
    const mod = await import(`file://${sceneDataPath}`);
    scenes = mod.scenes || mod.default?.scenes;
  } catch (e) {
    console.error(`❌ Failed to load scene-data.mjs: ${e.message}`);
    process.exit(1);
  }

  if (!scenes || scenes.length === 0) {
    console.error("❌ No scenes found in scene-data.mjs");
    process.exit(1);
  }

  console.log(`📋 Apply Media Patch — ${contentSlug}`);
  console.log("=".repeat(60));
  console.log(`   Patch file: ${resolvedPatchPath}`);
  console.log(`   Scene-data: ${sceneDataPath}`);
  console.log(`   Scenes: ${scenes.length}`);
  console.log(`   Patch entries: ${patches.length}`);
  if (dryRun) console.log("   Mode: DRY RUN (no files modified)");
  if (force) console.log("   Force: YES (overwrite existing media)");
  console.log();

  // ── Validate all entries before mutation ──
  const validated = patches.map((entry) => ({
    entry,
    result: validatePatchEntry(entry, scenes, contentDir),
  }));

  // Check for hard validation errors
  const hardErrors = validated.filter((v) => !v.result.valid);
  if (hardErrors.length > 0) {
    console.error("❌ Validation errors found — no files modified:");
    for (const v of hardErrors) {
      for (const err of v.result.errors) {
        console.error(`   • Scene ${v.entry.sceneId}: ${err}`);
      }
    }
    process.exit(1);
  }

  // ── Separate into applied / skipped ──
  const toApply = [];
  const skipped = [];

  for (const v of validated) {
    const { entry, result } = v;
    if (
      result.reason === "unassigned" ||
      (result.reason && result.reason !== "none" && result.reason !== "conflict")
    ) {
      skipped.push({ sceneId: entry.sceneId, sceneName: entry.sceneName, reason: result.reason });
    } else if (result.reason === "conflict") {
      if (force) {
        toApply.push({
          sceneId: entry.sceneId,
          sceneName: entry.sceneName,
          media: entry.media,
          action: "replace",
        });
      } else {
        skipped.push({ sceneId: entry.sceneId, sceneName: entry.sceneName, reason: "conflict" });
      }
    } else if (result.reason === "already-applied") {
      skipped.push({
        sceneId: entry.sceneId,
        sceneName: entry.sceneName,
        reason: "already-applied",
      });
    } else {
      // reason === "none" → add or replace
      const scene = result.scene;
      const action = scene.media ? "replace" : "add";
      toApply.push({
        sceneId: entry.sceneId,
        sceneName: entry.sceneName,
        media: entry.media,
        action,
      });
    }
  }

  // ── Dry-run mode ──
  if (dryRun) {
    // #846: run the same transformation so a patch the real run would reject
    // (Evidence Media overwrite, unlocatable scene) fails here too, instead of
    // printing a reassuring "+ media" line and then exiting 1 on the real run.
    const preview = applyPatchesToText(readFileSync(sceneDataPath, "utf8"), toApply, { force });
    if (preview.errors.length > 0) {
      console.error("❌ Errors during text transformation:");
      for (const err of preview.errors) console.error(`   • ${err}`);
      process.exit(1);
    }
    console.log(formatDryRun(toApply, [...skipped, ...preview.skipped]));
    process.exit(0);
  }

  // ── Apply patches to text ──
  const originalContent = readFileSync(sceneDataPath, "utf8");
  const applyResult = applyPatchesToText(originalContent, toApply, { force });

  if (applyResult.errors.length > 0) {
    console.error("❌ Errors during text transformation:");
    for (const err of applyResult.errors) {
      console.error(`   • ${err}`);
    }
    process.exit(1);
  }

  // Merge skipped from applyPatchesToText (duplicate scene entries)
  const allSkipped = [...skipped, ...applyResult.skipped];
  const allApplied = applyResult.applied;

  if (allApplied.length === 0) {
    console.log("ℹ️  No changes to apply. All entries skipped or already applied.");
    const receipt = generateReceipt([], allSkipped, {
      content: contentSlug,
      patchFile: resolvedPatchPath,
      backupPath: "N/A (no changes)",
    });
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
    console.log(`   Receipt: ${receiptPath}`);
    process.exit(0);
  }

  // ── Backup ──
  copyFileSync(sceneDataPath, backupPath);
  console.log(`✅ Backup: ${backupPath}`);

  // ── Atomic write ──
  const tmpPath = sceneDataPath + ".tmp";
  writeFileSync(tmpPath, applyResult.modifiedContent, "utf8");
  renameSync(tmpPath, sceneDataPath);
  console.log(`✅ Written: ${sceneDataPath} (${allApplied.length} scenes updated)`);

  // ── Post-apply validation ──
  let validationErrors = [];
  try {
    const { validateMedia } = await import("./lib/media-bg.mjs");
    for (const applied of allApplied) {
      const mediaResult = validateMedia(applied.media, contentDir);
      if (!mediaResult.valid) {
        validationErrors.push(...mediaResult.errors.map((e) => `Scene ${applied.sceneId}: ${e}`));
      }
    }
  } catch (e) {
    console.warn(`⚠️  Could not run validateMedia: ${e.message}`);
  }

  if (validationErrors.length > 0) {
    console.error("❌ Post-apply validation failed — rolling back:");
    for (const err of validationErrors) {
      console.error(`   • ${err}`);
    }
    // Restore original
    copyFileSync(backupPath, sceneDataPath);
    console.log(`✅ Restored from backup: ${sceneDataPath}`);
    const receipt = generateReceipt(
      [],
      [...allSkipped, ...allApplied.map((a) => ({ sceneId: a.sceneId, reason: "rolled-back" }))],
      {
        content: contentSlug,
        patchFile: resolvedPatchPath,
        backupPath,
      },
    );
    receipt.rolledBack = true;
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
    process.exit(1);
  }

  // ── Write receipt ──
  const receipt = generateReceipt(allApplied, allSkipped, {
    content: contentSlug,
    patchFile: resolvedPatchPath,
    backupPath,
  });
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  console.log(`✅ Receipt: ${receiptPath}`);

  // ── Summary ──
  console.log("\n" + "=".repeat(60));
  console.log(`📊 Summary:`);
  console.log(
    `   Applied: ${allApplied.length} (${allApplied.filter((a) => a.action === "added").length} added, ${allApplied.filter((a) => a.action === "replaced").length} replaced)`,
  );
  console.log(
    `   Skipped: ${allSkipped.length} (${allSkipped.filter((s) => s.reason === "conflict").length} conflicts, ${allSkipped.filter((s) => s.reason === "already-applied").length} already applied, ${allSkipped.filter((s) => !["conflict", "already-applied"].includes(s.reason)).length} other)`,
  );
  console.log(`   Backup: ${backupPath}`);
  console.log("=".repeat(60));
}

// Auto-run if called directly
const isMainModule = process.argv[1] && process.argv[1].endsWith("apply-media-patch.mjs");
if (isMainModule) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}
