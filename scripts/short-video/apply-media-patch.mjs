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

  // Check media path exists
  if (!entry.media.path) {
    errors.push("Media path is required.");
  } else {
    // Path containment check
    if (!isPathContained(entry.media.path, contentDir)) {
      errors.push(`Media path "${entry.media.path}" is not contained within content directory.`);
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

/**
 * Format a media object as a scene-data.mjs code block.
 *
 * @param {Object} media - Media object { type, path, source?, animation?, overlay?, volume?, fit?, focus? }
 * @param {string} indent - Indentation string (e.g., "    ")
 * @returns {string} Formatted media block
 */
function formatMediaBlock(media, indent = "    ") {
  const lines = ["media: {"];
  lines.push(`  type: "${media.type}",`);
  lines.push(`  path: "${media.path}",`);
  if (media.source) lines.push(`  source: "${media.source}",`);
  if (media.animation) lines.push(`  animation: "${media.animation}",`);
  if (media.overlay !== undefined) lines.push(`  overlay: ${media.overlay},`);
  if (media.volume !== undefined) lines.push(`  volume: ${media.volume},`);
  if (media.fit) lines.push(`  fit: "${media.fit}",`);
  if (media.focus) lines.push(`  focus: "${media.focus}",`);
  lines.push("},");
  return lines.map((l) => (l === "media: {" || l === "}," ? indent + l : indent + l)).join("\n");
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
    const { sceneId, media, action } = patch;

    // Skip if this scene was already processed
    if (appliedSceneIds.has(sceneId)) {
      skipped.push({ sceneId, reason: "conflict" });
      continue;
    }

    const mediaBlock = formatMediaBlock(media);

    if (action === "replace") {
      // Replace existing media block within the scene object
      // Find the scene by id, then find media: { ... } within it
      const sceneRegex = new RegExp(
        `((?:^|\\n)[ \\t]*\\{[^}]*?id:\\s*${sceneId}\\b[^}]*?)\\n([ \\t]*)media:\\s*\\{[^}]*\\},`,
        "s",
      );
      const match = modifiedContent.match(sceneRegex);
      if (match) {
        const indent = match[2];
        const newBlock = mediaBlock.replace(/^(    )/gm, indent);
        modifiedContent = modifiedContent.replace(sceneRegex, `$1\n${newBlock}`);
        applied.push({ sceneId, action: "replaced", media });
        appliedSceneIds.add(sceneId);
      } else {
        // Fallback: try single-line media
        const singleLineRegex = new RegExp(
          `(\\{[^}]*?id:\\s*${sceneId}\\b[^}]*?)media:\\s*\\{[^}]*\\}`,
          "s",
        );
        const slMatch = modifiedContent.match(singleLineRegex);
        if (slMatch) {
          modifiedContent = modifiedContent.replace(
            singleLineRegex,
            `$1${mediaBlock.replace(/\n/g, " ").replace(/,$/, "")}`,
          );
          applied.push({ sceneId, action: "replaced", media });
          appliedSceneIds.add(sceneId);
        } else {
          errors.push(`Could not locate media block to replace in scene ${sceneId}.`);
        }
      }
    } else {
      // Insert: find scene by id, insert media before voiceover
      const sceneRegex = new RegExp(
        `(\\{[^}]*?id:\\s*${sceneId}\\b[^}]*?)(\\n([ \\t]*)voiceover:)`,
        "s",
      );
      const match = modifiedContent.match(sceneRegex);
      if (match) {
        const indent = match[3];
        const newBlock = mediaBlock.replace(/^(    )/gm, indent);
        modifiedContent = modifiedContent.replace(sceneRegex, `$1\n${newBlock}$2`);
        applied.push({ sceneId, action: "added", media });
        appliedSceneIds.add(sceneId);
      } else {
        // Try to detect if media already exists (already-applied check)
        const mediaCheckRegex = new RegExp(
          `id:\\s*${sceneId}\\b[^}]*?media:\\s*\\{[^}]*?path:\\s*"${media.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
          "s",
        );
        if (modifiedContent.match(mediaCheckRegex)) {
          skipped.push({ sceneId, reason: "already-applied" });
        } else {
          errors.push(`Could not locate voiceover field in scene ${sceneId} for media insertion.`);
        }
      }
    }
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

  const addCount = applied.filter((a) => a.action === "added").length;
  const replaceCount = applied.filter((a) => a.action === "replaced").length;
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
    patches = JSON.parse(readFileSync(resolvedPatchPath, "utf8"));
  } catch (e) {
    console.error(`❌ Failed to parse patch JSON: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(patches)) {
    console.error("❌ Patch file must be a JSON array.");
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
    const output = formatDryRun(toApply, skipped);
    console.log(output);
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
