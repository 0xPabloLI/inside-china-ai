#!/usr/bin/env node
/**
 * Catalog validation — makes catalog.yml's declared width/height checkable.
 *
 * Two layers, because the binaries are gitignored and absent on a clean checkout:
 *
 *   1. Static, always: every non-legacy entry declares positive integer width
 *      and height; a global-library entry (`assets/...`) is at least
 *      DEFAULT_TARGET_SHORT_SIDE on the short side. Package-local media under
 *      `content/<slug>/assets/` has no such floor — it is indexed for search
 *      and upscaled per package by autoUpscaleIfNeeded.
 *   2. On disk, when the file exists: ffprobe (via upscale.checkResolution)
 *      must agree with the declaration. A missing file or a probe failure is a
 *      warning, never a content verdict: a tool that cannot read the file has
 *      not proved the asset wrong.
 *
 * Entries that predate the rule and whose files are not on disk are frozen by
 * path in LEGACY_CATALOG_FILES_WITHOUT_DIMENSIONS. The list may only shrink —
 * backfill the real dimensions and delete the path. A path that leaves the
 * catalog, gains dimensions, or whose file becomes readable is reported so the
 * list cannot rot silently.
 *
 * Usage:
 *   node scripts/short-video/lib/catalog-validate.mjs [--require-files]
 *   node scripts/short-video/lib/catalog-validate.mjs --catalog <path>
 *
 * Exit: 0 = no errors, 1 = validation errors, 2 = usage or parse error.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { checkResolution, DEFAULT_TARGET_SHORT_SIDE, isSupportedFile } from "./upscale.mjs";

/** Frozen legacy paths: predate the rule and have no readable local file. */
export const LEGACY_CATALOG_FILES_WITHOUT_DIMENSIONS = Object.freeze([
  "content/deepseek-v41-flash-1017/assets/evidence-hf-benchmark.png",
  "content/deepseek-v41-flash-1017/assets/evidence-hf-model-card.png",
  "content/deepseek-v41-flash-1017/assets/evidence-search-api-pricing.png",
  "content/unitree-h2x-guardian/assets/clips/act1-martial.mp4",
  "content/unitree-h2x-guardian/assets/clips/act2-parkour.mp4",
  "content/unitree-h2x-guardian/assets/clips/act3-jump.mp4",
  "content/unitree-h2x-guardian/assets/clips/act4-night.mp4",
  "content/unitree-h2x-guardian/assets/clips/act5-lift.mp4",
  "content/unitree-h2x-guardian/assets/clips/act6-rescue.mp4",
]);

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = join(MODULE_DIR, "..", "assets", "catalog.yml");

function issue(code, file, message) {
  return { code, file, message };
}

/** One-line rendering shared by the CLI, the RAG index and test failures. */
export function formatIssue({ code, file, message }) {
  return `${code}: ${file} — ${message}`;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/** Catalog paths under `assets/` (including render scratch `_staged/`) resolve to the curated global library. */
function isGlobalLibraryPath(file) {
  return file.replace(/^\.\//, "").startsWith("assets/");
}

function runProbe(probe, filePath) {
  try {
    const measured = probe(filePath);
    if (!measured) return null;
    if (!Number.isFinite(measured.width) || !Number.isFinite(measured.height)) return null;
    if (measured.width <= 0 || measured.height <= 0) return null;
    return { width: measured.width, height: measured.height };
  } catch {
    return null;
  }
}

/**
 * Validate catalog entries against the declaration rules.
 *
 * @param {Array<object>} entries Parsed catalog entries.
 * @param {object} [options]
 * @param {string} [options.rootDir] Base directory entry.file paths resolve
 *   against (`scripts/short-video/`). Required unless `probe` is null.
 * @param {((filePath: string) => {width: number, height: number}) | null} [options.probe]
 *   Dimension probe; defaults to ffprobe via checkResolution. `null` skips the
 *   disk layer entirely (static-only run).
 * @param {boolean} [options.requireFiles] Turn missing files into errors.
 */
export function validateCatalog(entries, options = {}) {
  const { rootDir, probe = checkResolution, requireFiles = false } = options;

  if (probe && typeof rootDir !== "string") {
    throw new Error("validateCatalog: rootDir is required when probing the disk");
  }

  const legacy = new Set(LEGACY_CATALOG_FILES_WITHOUT_DIMENSIONS);
  const result = {
    total: entries.length,
    declared: 0,
    verified: [],
    diskMissing: [],
    probeFailed: [],
    probeUnsupported: [],
    legacyExempt: [],
    errors: [],
    warnings: [],
  };

  for (const entry of entries) {
    const file = entry?.file;
    if (typeof file !== "string" || file.trim() === "") {
      result.errors.push(
        issue("invalid-file", String(file ?? "<missing>"), "entry has no file path"),
      );
      continue;
    }

    if (typeof entry.description !== "string" || entry.description.trim() === "") {
      result.errors.push(
        issue(
          "missing-description",
          file,
          "entries need a description; chunkCatalog skips entries without one",
        ),
      );
      continue;
    }

    const hasWidth = entry.width !== undefined && entry.width !== null;
    const hasHeight = entry.height !== undefined && entry.height !== null;

    if (!hasWidth && !hasHeight) {
      if (!legacy.has(file)) {
        result.errors.push(
          issue(
            "missing-dimensions",
            file,
            "width and height are required; legacy entries are frozen by path in LEGACY_CATALOG_FILES_WITHOUT_DIMENSIONS",
          ),
        );
        continue;
      }

      result.legacyExempt.push(file);
      if (!probe) continue;

      const legacyPath = join(rootDir, file);
      if (existsSync(legacyPath)) {
        if (!isSupportedFile(legacyPath)) {
          result.probeUnsupported.push(file);
          result.warnings.push(
            issue(
              "probe-unsupported",
              file,
              "no probe for this file type; dimensions are declared but unverified",
            ),
          );
          continue;
        }
        const measured = runProbe(probe, legacyPath);
        if (measured) {
          result.errors.push(
            issue(
              "legacy-file-readable",
              file,
              `legacy entry's file is on disk (${measured.width}x${measured.height}); backfill width/height and drop it from the legacy list`,
            ),
          );
        } else {
          result.warnings.push(
            issue(
              "legacy-file-unmeasurable",
              file,
              "legacy entry's file is on disk but could not be measured; backfill width/height once a probe is available",
            ),
          );
        }
      }
      continue;
    }

    if (!hasWidth || !hasHeight) {
      result.errors.push(
        issue(
          "missing-dimensions",
          file,
          `declare both width and height (missing ${hasWidth ? "height" : "width"})`,
        ),
      );
      continue;
    }

    if (!isPositiveInteger(entry.width) || !isPositiveInteger(entry.height)) {
      result.errors.push(
        issue(
          "invalid-dimensions",
          file,
          `width/height must be positive integers, got ${JSON.stringify(entry.width)}x${JSON.stringify(entry.height)}`,
        ),
      );
      continue;
    }

    result.declared += 1;
    const { width, height } = entry;

    if (legacy.has(file)) {
      result.warnings.push(
        issue(
          "stale-legacy",
          file,
          "declares dimensions but is still in LEGACY_CATALOG_FILES_WITHOUT_DIMENSIONS; drop it from the list",
        ),
      );
    }

    if (isGlobalLibraryPath(file) && Math.min(width, height) < DEFAULT_TARGET_SHORT_SIDE) {
      result.errors.push(
        issue(
          "below-short-side",
          file,
          `declared ${width}x${height}: the short side of a global-library entry must be at least ${DEFAULT_TARGET_SHORT_SIDE}px`,
        ),
      );
    }

    if (!probe) continue;

    const resolved = join(rootDir, file);
    if (!existsSync(resolved)) {
      result.diskMissing.push(file);
      const target = requireFiles ? result.errors : result.warnings;
      target.push(
        issue(
          "missing-file",
          file,
          requireFiles
            ? "file is required (--require-files) but not on disk"
            : "file is not on disk — dimensions are declared but unverified",
        ),
      );
      continue;
    }

    if (!isSupportedFile(resolved)) {
      result.probeUnsupported.push(file);
      result.warnings.push(
        issue(
          "probe-unsupported",
          file,
          "no probe for this file type; dimensions are declared but unverified",
        ),
      );
      continue;
    }

    const measured = runProbe(probe, resolved);
    if (!measured) {
      result.probeFailed.push(file);
      result.warnings.push(
        issue(
          "probe-failed",
          file,
          "probe could not read the file; this is a tool failure, not a content verdict",
        ),
      );
      continue;
    }
    if (measured.width !== width || measured.height !== height) {
      result.errors.push(
        issue(
          "dimension-mismatch",
          file,
          `declared ${width}x${height}, measured ${measured.width}x${measured.height}`,
        ),
      );
      continue;
    }
    result.verified.push(file);
  }

  return result;
}

/**
 * A frozen legacy path that no longer appears in the catalog is stale. Kept
 * out of validateCatalog because it only means something for the complete
 * catalog, not for a fixture subset.
 */
export function findLegacyRosterIssues(entries) {
  const present = new Set(
    entries.map((entry) => entry?.file).filter((file) => typeof file === "string"),
  );
  return LEGACY_CATALOG_FILES_WITHOUT_DIMENSIONS.filter((file) => !present.has(file)).map((file) =>
    issue(
      "stale-legacy",
      file,
      "listed as legacy but absent from catalog.yml; drop it from the list",
    ),
  );
}

const USAGE =
  "usage: catalog-validate.mjs [--require-files] [--catalog <path>]\n" +
  "  --require-files  treat a missing binary as an error (local pre-admission check)\n" +
  "  --catalog <path> validate another catalog.yml (default: scripts/short-video/assets/catalog.yml)";

/**
 * CLI entry. Exported so tests can drive it without spawning a process.
 *
 * @param {string[]} argv Arguments after the script name.
 * @param {object} [io] `stdout`, `stderr` line sinks and a `probe` override.
 * @returns {number} Exit code.
 */
export function runCli(argv, io = {}) {
  const stdout = io.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = io.stderr ?? ((line) => process.stderr.write(`${line}\n`));

  const args = [...argv];
  let catalogPath = DEFAULT_CATALOG_PATH;
  let requireFiles = false;

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--require-files") {
      requireFiles = true;
    } else if (arg === "--catalog") {
      const value = args.shift();
      if (!value || value.startsWith("--")) {
        stderr(USAGE);
        return 2;
      }
      catalogPath = value;
    } else if (arg === "--help" || arg === "-h") {
      stdout(USAGE);
      return 0;
    } else {
      stderr(`unknown argument: ${arg}`);
      stderr(USAGE);
      return 2;
    }
  }

  let entries;
  try {
    entries = yaml.load(readFileSync(catalogPath, "utf8"));
  } catch (err) {
    stderr(`cannot read ${catalogPath}: ${err.message}`);
    return 2;
  }

  if (!Array.isArray(entries)) {
    stderr(`${catalogPath}: expected a YAML list of catalog entries`);
    return 2;
  }

  const result = validateCatalog(entries, {
    rootDir: dirname(dirname(catalogPath)),
    requireFiles,
    probe: io.probe === undefined ? checkResolution : io.probe,
  });
  const warnings = [...result.warnings, ...findLegacyRosterIssues(entries)];

  for (const item of result.errors) stderr(`❌ ${formatIssue(item)}`);
  for (const item of warnings) stdout(`⚠️  ${formatIssue(item)}`);
  for (const file of result.legacyExempt) stdout(`↪️  legacy without dimensions: ${file}`);

  const verdict = result.errors.length === 0 ? "✅" : "❌";
  stdout(
    `${verdict} ${catalogPath}: ${result.total} entries — ${result.declared} declare width/height, ` +
      `${result.verified.length} verified on disk, ${result.legacyExempt.length} legacy-exempt, ` +
      `${result.diskMissing.length} file(s) missing, ${result.probeFailed.length} probe failure(s), ` +
      `${result.probeUnsupported.length} unsupported type(s), ` +
      `${result.errors.length} error(s), ${warnings.length} warning(s)`,
  );

  return result.errors.length === 0 ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli(process.argv.slice(2)));
}
