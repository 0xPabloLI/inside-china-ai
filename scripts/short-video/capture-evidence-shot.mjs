#!/usr/bin/env node
/**
 * Capture evidence screenshots from a web page (#758).
 *
 * Two modes:
 *   - pack: read `content/<slug>/evidence-captures.json`, capture every scene
 *     whose file is missing, and print the provenance block to paste into
 *     `scene-data.mjs`. `--check` verifies existing files without a browser.
 *   - one-off: capture a URL + selector + output path with no scene data. This
 *     is how the first provenance block for a new page is obtained.
 *
 * Selector and geometry drift are hard failures: the page moved, so the old
 * declaration is wrong. The CLI prints the freshly measured block and writes
 * nothing for that scene; it never falls back to a stock image or an
 * unchecked screenshot.
 *
 * Usage:
 *   node scripts/short-video/capture-evidence-shot.mjs --content <slug> [--scene <id>] [--force] [--check]
 *   node scripts/short-video/capture-evidence-shot.mjs --url <http(s)> --selector <sel> --output <path>
 *        [--padding 16] [--scale 2] [--viewport 1280x900]
 *
 * @module capture-evidence-shot
 */

import { existsSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parseArgs } from "util";
import {
  formatProvenanceBlock,
  normalizeCaptureRecipe,
  CAPTURE_DEFAULTS,
} from "./lib/evidence-capture.mjs";
import {
  captureEvidenceShot,
  findUncoveredEvidenceScenes,
  loadCaptureManifest,
  planEvidenceCaptures,
} from "./lib/evidence-capture-runner.mjs";
import {
  inspectMediaFile,
  validateProvenance,
  validateProvenancePixels,
} from "./lib/media-integrity.mjs";

const BASE_DIR = dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = join(BASE_DIR, "content");

const HELP = `Capture evidence screenshots for short-video scenes (#758)

Pack mode — capture missing files declared in content/<slug>/evidence-captures.json:
  node scripts/short-video/capture-evidence-shot.mjs --content <slug> [options]

    --content <slug>   Content pack under scripts/short-video/content/
    --scene <id>       Only this scene id
    --force            Re-capture even when the file already exists
    --check            Verify files against their declared provenance (no browser)

One-off mode — bootstrap the first provenance block for a page:
  node scripts/short-video/capture-evidence-shot.mjs \\
    --url https://example.com/changelog --selector "table" \\
    --output scripts/short-video/content/my-pack/assets/changelog.png \\
    --padding 16 --scale 2 --viewport 1280x900

    --url <http(s)>    Page to open
    --selector <sel>   Exactly one element must match
    --output <path>    PNG destination, relative to the current working directory
                       (parent directories are created)
    --padding <n>      CSS px added on every edge (default ${CAPTURE_DEFAULTS.padding})
    --scale <n>        Device scale factor (default ${CAPTURE_DEFAULTS.deviceScaleFactor})
    --viewport <WxH>   Page viewport (default ${CAPTURE_DEFAULTS.viewport.width}x${CAPTURE_DEFAULTS.viewport.height})

Environment:
  EVIDENCE_CAPTURE_CHANNEL      Chrome channel (default "chrome")
  EVIDENCE_CAPTURE_EXECUTABLE   Explicit browser binary (overrides the channel)

Exit: 0 = captured / verified / nothing to do, 1 = failure (drift, selector, missing file,
      evidence scene without a capture recipe).
`;

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Relative path for terminal output, without leaving a dangling "" for cwd. */
const displayPath = (abs) => relative(process.cwd(), abs) || abs;

export function parseViewport(text) {
  const match = /^(\d+)x(\d+)$/i.exec(text);
  if (!match) throw new Error(`--viewport must be <width>x<height> in px, got "${text}"`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) {
    throw new Error(`--viewport must have positive dimensions, got "${text}"`);
  }
  return { width, height };
}

/** Select one scene's recipe, or the whole manifest when no scene is given. */
export function selectCaptures(manifest, scene) {
  if (manifest === null || scene === undefined) return manifest;
  return Object.fromEntries(
    Object.entries(manifest).filter(([key]) => String(key) === String(scene)),
  );
}

function parseNumber(name, text) {
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number, got "${text}"`);
  return value;
}

function printProvenance(provenance, heading) {
  console.log(heading);
  console.log(formatProvenanceBlock(provenance));
}

async function loadScenes(contentDirAbs) {
  const sceneDataPath = join(contentDirAbs, "scene-data.mjs"); // nosemgrep -- contentDirAbs passed the CONTENT_ROOT containment check
  if (!existsSync(sceneDataPath)) {
    throw new Error(`no scene-data.mjs in ${contentDirAbs}`);
  }
  const module = await import(pathToFileURL(sceneDataPath).href);
  if (!Array.isArray(module.scenes)) {
    throw new Error(`${sceneDataPath} must export a scenes array`);
  }
  return module.scenes;
}

export function resolveContentDir(slug) {
  const root = resolve(CONTENT_ROOT);
  const contentDirAbs = resolve(root, slug); // nosemgrep -- containment checked on the next line
  if (contentDirAbs === root || !contentDirAbs.startsWith(root + sep)) {
    throw new Error(`--content "${slug}" must name a pack inside ${root}`);
  }
  return contentDirAbs;
}

const uncoveredLine = (scene) =>
  `Scene ${scene.id}: no capture recipe — add it to evidence-captures.json or declare composed:true`;

async function checkCaptures({ planned, errors, uncovered }) {
  const failures = [...errors, ...uncovered.map(uncoveredLine)];
  for (const entry of planned) {
    const scene = `Scene ${entry.sceneId}`;
    if (!existsSync(entry.outputAbs)) {
      failures.push(
        `${scene}: ${displayPath(entry.outputAbs)} is missing — run without --check to capture it`,
      );
      continue;
    }
    const verdict = inspectMediaFile(entry.outputAbs);
    if (!verdict.ok) {
      failures.push(
        `${scene}: ${displayPath(entry.outputAbs)} is unusable — ${verdict.code}: ${verdict.detail}`,
      );
      continue;
    }
    const shape = validateProvenance(entry.declared);
    if (!shape.ok) {
      failures.push(`${scene}: invalid provenance — ${shape.errors.join("; ")}`);
      continue;
    }
    const pixels = validateProvenancePixels(entry.declared, verdict);
    if (!pixels.ok) {
      failures.push(`${scene}: file does not match its provenance — ${pixels.errors.join("; ")}`);
      continue;
    }
    console.log(
      `${scene}: OK — ${displayPath(entry.outputAbs)} ${verdict.width}×${verdict.height}`,
    );
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} evidence capture check(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`\nAll ${planned.length} evidence capture(s) verified.`);
  return 0;
}

async function capturePack({ contentDirAbs, content, scene, force }) {
  const scenes = await loadScenes(contentDirAbs);
  const manifest = loadCaptureManifest(contentDirAbs);
  // Judged against the whole manifest: a --scene run must not report every
  // other evidence scene as a gap.
  const uncovered = findUncoveredEvidenceScenes(scenes, manifest);

  if (!manifest) {
    if (uncovered.length === 0) {
      console.log(`No evidence-captures.json in content/${content} — nothing to capture.`);
      return 0;
    }
    console.error(`Evidence scenes with no capture recipe in content/${content}:`);
    for (const entry of uncovered) console.error(`  - ${uncoveredLine(entry)}`);
    return 1;
  }

  const selected = selectCaptures(manifest, scene);
  if (scene !== undefined && Object.keys(selected).length === 0) {
    const available = Object.keys(manifest).join(", ") || "none";
    throw new Error(`scene ${scene} has no capture recipe (manifest scenes: ${available})`);
  }

  const plan = planEvidenceCaptures({ scenes, contentDirAbs, manifest: selected, force });
  if (plan.errors.length > 0) {
    console.error("Evidence capture plan rejected:");
    for (const error of plan.errors) console.error(`  - ${error}`);
    return 1;
  }

  if (plan.planned.length === 0 && uncovered.length === 0) {
    const already = plan.skipped.length;
    console.log(
      already > 0
        ? `${already} evidence capture(s) already present — use --force to re-capture.`
        : "No evidence captures planned.",
    );
    return 0;
  }

  let failures = 0;
  for (const entry of plan.planned) {
    try {
      const shot = await captureEvidenceShot({
        recipe: entry.recipe,
        outputAbs: entry.outputAbs,
        declared: entry.declared,
      });
      console.log(
        `\n✅ Scene ${entry.sceneId}: captured ${displayPath(entry.outputAbs)} (${shot.width}×${shot.height})`,
      );
      printProvenance(
        shot.provenance,
        "Paste into scene-data (inside media, beside evidence: true):",
      );
    } catch (error) {
      failures++;
      console.error(`\n❌ Scene ${entry.sceneId}: ${error.message}`);
    }
  }
  if (uncovered.length > 0) {
    failures += uncovered.length;
    console.error(`\nEvidence scenes with no capture recipe in content/${content}:`);
    for (const entry of uncovered) console.error(`  - ${uncoveredLine(entry)}`);
  }
  return failures > 0 ? 1 : 0;
}

async function captureOneOff(values) {
  if (values.content !== undefined || values.scene !== undefined || values.check || values.force) {
    throw new Error(
      "one-off mode (--url/--selector/--output) cannot be combined with pack options",
    );
  }
  for (const name of ["url", "selector", "output"]) {
    if (!values[name]) throw new Error(`--${name} is required in one-off mode`);
  }
  const recipe = normalizeCaptureRecipe(
    {
      url: values.url,
      selector: values.selector,
      padding: values.padding === undefined ? undefined : parseNumber("padding", values.padding),
      deviceScaleFactor:
        values.scale === undefined ? undefined : parseNumber("scale", values.scale),
      viewport: values.viewport === undefined ? undefined : parseViewport(values.viewport),
    },
    "one-off",
  );
  // One-off mode is a manual bootstrap: the operator names the destination.
  const outputAbs = resolve(process.cwd(), values.output); // nosemgrep -- operator-chosen output path
  const shot = await captureEvidenceShot({ recipe, outputAbs, declared: null });
  console.log(`✅ Captured ${displayPath(outputAbs)} (${shot.width}×${shot.height})`);
  printProvenance(shot.provenance, "Paste into scene-data (inside media, beside evidence: true):");
  console.log("      // also set: evidence: true");
  return 0;
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      content: { type: "string" },
      scene: { type: "string" },
      force: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      url: { type: "string" },
      selector: { type: "string" },
      output: { type: "string" },
      padding: { type: "string" },
      scale: { type: "string" },
      viewport: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const oneOff =
    values.url !== undefined || values.selector !== undefined || values.output !== undefined;
  if (oneOff) return captureOneOff(values);

  if (!values.content) {
    console.log(HELP);
    console.error(
      "error: pass --content <slug> (pack mode) or --url/--selector/--output (one-off)",
    );
    return 1;
  }

  if (values.padding !== undefined || values.scale !== undefined || values.viewport !== undefined) {
    throw new Error(
      "--padding/--scale/--viewport only apply in one-off mode; put them in evidence-captures.json",
    );
  }

  const contentDirAbs = resolveContentDir(values.content);
  if (values.check) {
    const scenes = await loadScenes(contentDirAbs);
    const manifest = loadCaptureManifest(contentDirAbs);
    const uncovered = findUncoveredEvidenceScenes(scenes, manifest);
    if (!manifest && uncovered.length === 0) {
      console.log(`No evidence-captures.json in content/${values.content} — nothing to check.`);
      return 0;
    }
    const selected = selectCaptures(manifest, values.scene);
    if (manifest !== null && values.scene !== undefined && Object.keys(selected).length === 0) {
      throw new Error(`scene ${values.scene} has no capture recipe`);
    }
    const plan =
      manifest === null
        ? { planned: [], errors: [], skipped: [] }
        : planEvidenceCaptures({ scenes, contentDirAbs, manifest: selected, force: true });
    return checkCaptures({ ...plan, uncovered });
  }

  return capturePack({
    contentDirAbs,
    content: values.content,
    scene: values.scene,
    force: values.force,
  });
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`❌ ${error.message}`);
      process.exitCode = 1;
    });
}
