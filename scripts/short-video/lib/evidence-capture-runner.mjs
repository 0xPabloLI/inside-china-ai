/**
 * Deterministic evidence-capture producer (#758).
 *
 * A provenance block is only worth recording if the file behind it was
 * captured from the element it names. This module is the browser half of that
 * contract: it plans captures from a pack manifest, measures the element in
 * page coordinates, screenshots exactly that clip through CDP, and refuses to
 * write when the selector or the geometry no longer matches the declaration.
 *
 * Recipes live in `content/<slug>/evidence-captures.json`, keyed by scene id,
 * rather than in `scene.media`: `scene.media` has a strict field contract and
 * `sourceRef` belongs to the claim's source text. A per-pack manifest keeps
 * the browser recipe out of both.
 *
 * The browser is a fresh, unauthenticated context: only public pages can be
 * captured, and a redirect (a login wall, a canonical move) is a failure, not
 * a quietly different page.
 *
 * Browser code is imported dynamically so importing this module (tests, the
 * pipeline's stage import) never loads Playwright. Playwright's bundled
 * headless shell is not always installed; the default launch uses system
 * Chrome (`channel: "chrome"`), with an explicit binary available through
 * `EVIDENCE_CAPTURE_EXECUTABLE`.
 *
 * @module evidence-capture-runner
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve, sep } from "path";
import {
  buildClip,
  buildProvenance,
  compareMeasuredProvenance,
  formatProvenanceBlock,
  normalizeCaptureRecipe,
} from "./evidence-capture.mjs";
import { inspectMediaFile, shown, validateProvenancePixels } from "./media-integrity.mjs";

const MANIFEST_FILE = "evidence-captures.json";

/** Slack for sub-pixel layout noise between the declared and measured boxes. */
const GEOMETRY_TOLERANCE_PX = 0.5;

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const inside = (root, abs) => abs !== root && abs.startsWith(root + sep);

/**
 * Read `content/<slug>/evidence-captures.json`, or null when the pack has none.
 *
 * A pack without a manifest is the normal case for non-evidence content, so
 * absence is not an error. A payload that is not an object is: silently
 * treating it as empty would make a typo look like "no captures to run".
 *
 * @param {string} contentDirAbs - absolute content pack directory
 * @returns {Record<string, object>|null}
 */
export function loadCaptureManifest(contentDirAbs) {
  const manifestPath = join(contentDirAbs, MANIFEST_FILE); // nosemgrep -- pack dir is containment-checked by the caller
  if (!existsSync(manifestPath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    throw new Error(`${manifestPath} is not valid JSON: ${e.message}`);
  }
  if (!isObject(parsed)) {
    throw new Error(`${manifestPath} must be an object keyed by scene id, got ${shown(parsed)}`);
  }
  return parsed;
}

/**
 * Evidence scenes a fresh clone cannot re-capture: `media.evidence: true` with
 * no manifest entry.
 *
 * `composed: true` is exempt — a legacy hand-composed banner has no producer to
 * run, so demanding a recipe would ask for one that cannot exist.
 *
 * @param {Array<Record<string, any>>} scenes - scene data
 * @param {Record<string, object>|null} manifest - loaded manifest, or null
 * @returns {Array<Record<string, any>>} the uncovered scenes
 */
export function findUncoveredEvidenceScenes(scenes, manifest) {
  const covered = new Set(Object.keys(manifest ?? {}));
  return (scenes ?? []).filter(
    (scene) =>
      scene.media?.evidence === true &&
      scene.media.provenance?.composed !== true &&
      !covered.has(String(scene.id)),
  );
}

/**
 * Resolve manifest entries against scene data without touching the browser.
 *
 * All problems are collected rather than thrown: the operator needs the whole
 * list (three bad scenes should not take three runs), and the caller decides
 * whether a plan error blocks execution or is only reported.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.scenes - scene data
 * @param {string} input.contentDirAbs - absolute content pack directory
 * @param {Record<string, object>|null} input.manifest - parsed manifest
 * @param {boolean} [input.force=false] - plan existing outputs too
 * @param {(path: string) => boolean} [input.exists] - injectable file probe
 * @returns {{planned: Array<{sceneId: number|string, recipe: object, outputAbs: string, declared: object}>,
 *            skipped: Array<{sceneId: number|string, outputAbs: string, reason: string}>,
 *            errors: string[]}}
 */
export function planEvidenceCaptures({
  scenes,
  contentDirAbs,
  manifest,
  force = false,
  exists = existsSync,
}) {
  const planned = [];
  const skipped = [];
  const errors = [];
  if (manifest === null || manifest === undefined) return { planned, skipped, errors };
  if (!isObject(manifest)) {
    return {
      planned,
      skipped,
      errors: [
        `evidence captures manifest must be an object keyed by scene id, got ${shown(manifest)}`,
      ],
    };
  }

  const root = resolve(contentDirAbs); // nosemgrep -- pack dir is containment-checked by the caller
  const scenesById = new Map((scenes ?? []).map((scene) => [String(scene.id), scene]));

  for (const [key, entry] of Object.entries(manifest)) {
    const scene = scenesById.get(String(key));
    if (!scene) {
      errors.push(`scene ${shown(key)}: no scene with this id in scene-data`);
      continue;
    }
    const sceneId = scene.id;
    if (scene.media?.evidence !== true) {
      errors.push(
        `scene ${shown(sceneId)}: media.evidence must be true — an unmarked asset is not an evidence capture`,
      );
      continue;
    }
    const mediaPath = scene.media?.path;
    if (typeof mediaPath !== "string" || mediaPath.trim() === "") {
      errors.push(`scene ${shown(sceneId)}: media.path must be a non-empty string`);
      continue;
    }
    if (!isObject(scene.media.provenance)) {
      errors.push(
        `scene ${shown(sceneId)}: media.provenance must be present so the capture can be checked against it`,
      );
      continue;
    }
    const outputAbs = resolve(root, mediaPath); // nosemgrep -- containment checked on the next lines
    if (!inside(root, outputAbs)) {
      errors.push(
        `scene ${shown(sceneId)}: media.path "${mediaPath}" resolves outside the content dir (${root})`,
      );
      continue;
    }
    let recipe;
    try {
      recipe = normalizeCaptureRecipe(entry, sceneId);
    } catch (e) {
      errors.push(e.message);
      continue;
    }
    // The manifest is what a future run will re-capture; the provenance is what
    // this scene claims. If they describe different pages/elements, a
    // `--check` against the existing file would pass while the next re-capture
    // silently targets something else.
    const declared = scene.media.provenance;
    const disagreements = [];
    if (recipe.url !== declared.sourceUrl) {
      disagreements.push(
        `recipe url ${shown(recipe.url)} does not match provenance.sourceUrl ${shown(declared.sourceUrl)}`,
      );
    }
    if (recipe.selector !== declared.selector) {
      disagreements.push(
        `recipe selector ${shown(recipe.selector)} does not match provenance.selector ${shown(declared.selector)}`,
      );
    }
    if (recipe.deviceScaleFactor !== declared.scale) {
      disagreements.push(
        `recipe deviceScaleFactor ${shown(recipe.deviceScaleFactor)} does not match provenance.scale ${shown(declared.scale)}`,
      );
    }
    if (disagreements.length > 0) {
      errors.push(`scene ${shown(sceneId)}: ${disagreements.join("; ")}`);
      continue;
    }
    if (!force && exists(outputAbs)) {
      skipped.push({ sceneId, outputAbs, reason: "exists" });
      continue;
    }
    planned.push({ sceneId, recipe, outputAbs, declared: scene.media.provenance });
  }

  return { planned, skipped, errors };
}

/**
 * Launch the browser used by the producer.
 *
 * Exported as the default for `deps.launchBrowser` so a caller can pin it.
 * @returns {Promise<import("@playwright/test").Browser>}
 */
export async function launchEvidenceBrowser() {
  // @playwright/test is the declared devDependency and re-exports chromium;
  // importing the transitive "playwright" package directly would be a phantom
  // dependency that only works while the hoisted copy happens to be installed.
  const { chromium } = await import("@playwright/test");
  const executablePath = process.env.EVIDENCE_CAPTURE_EXECUTABLE;
  if (executablePath) return chromium.launch({ headless: true, executablePath });
  return chromium.launch({
    headless: true,
    channel: process.env.EVIDENCE_CAPTURE_CHANNEL || "chrome",
  });
}

/**
 * Capture one element from an already-open page.
 *
 * Separated from launch/teardown so a test can drive it with a fake page and
 * CDP session. The returned dimensions are the file's real pixels, not the
 * requested clip, because that is what the gate reconciles later.
 *
 * @param {object} page - Playwright Page (or a fake with the same surface)
 * @param {object} recipe - normalized capture recipe
 * @param {object|null} declared - provenance already in scene data
 * @param {string} outputAbs - final absolute path
 * @returns {Promise<{provenance: object, width: number, height: number}>}
 */
export async function captureFromPage(page, recipe, declared, outputAbs) {
  const { url, selector, padding, deviceScaleFactor, waitUntil, timeoutMs } = recipe;
  await page.goto(url, { waitUntil, timeout: timeoutMs });

  // The browser is unauthenticated, so a login wall or a canonical move shows
  // up as a different final URL. Capturing that page would bind a screenshot of
  // something other than the element the provenance names.
  // Compare normalized hrefs: `new URL("http://host").href` is "http://host/",
  // which is what the browser reports for the same recipe — a raw string
  // comparison would call every root URL a redirect.
  const requested = new URL(url).href;
  const finalUrl = new URL(page.url()).href;
  if (finalUrl !== requested) {
    throw new Error(
      `page redirected to ${page.url()} — use the final URL in the recipe ` +
        "(a login redirect cannot be captured as evidence)",
    );
  }

  const locator = page.locator(selector);
  const count = await locator.count();
  if (count !== 1) {
    throw new Error(
      `evidence capture for ${url}: selector ${JSON.stringify(selector)} matched ${count} element(s); ` +
        "exactly one is required — sharpen or scope the selector",
    );
  }
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
  await locator.scrollIntoViewIfNeeded();

  // Page coordinates, not `boundingBox()`: the latter is viewport-relative and
  // would record a different clip after scrolling a tall page.
  const rect = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
  });
  const clip = buildClip(rect, padding);
  const measured = buildProvenance({
    sourceUrl: url,
    selector,
    rect,
    clip,
    scale: deviceScaleFactor,
  });

  if (declared) {
    const drift = compareMeasuredProvenance(declared, measured, GEOMETRY_TOLERANCE_PX);
    if (!drift.ok) {
      throw new Error(
        `evidence capture drifted for ${url} (selector ${JSON.stringify(selector)}):\n` +
          drift.errors.map((error) => `  - ${error}`).join("\n") +
          "\nNothing was written. Paste the new block into scene-data:\n" +
          formatProvenanceBlock(measured),
      );
    }
  }

  // `page.screenshot({ clip })` clips to the viewport; a table halfway down a
  // tall page would be cut. CDP with captureBeyondViewport captures page
  // coordinates and honours the device scale factor.
  const client = await page.context().newCDPSession(page);
  const { data } = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: deviceScaleFactor },
  });
  const bytes = Buffer.from(data, "base64");

  mkdirSync(dirname(outputAbs), { recursive: true });
  const tmp = join(dirname(outputAbs), `.${basename(outputAbs)}.${process.pid}-${Date.now()}.tmp`); // nosemgrep -- outputAbs is contained by the plan (or operator-chosen in one-off mode)
  try {
    writeFileSync(tmp, bytes);
    const verdict = inspectMediaFile(tmp);
    if (!verdict.ok) {
      throw new Error(`capture wrote an unusable file: ${verdict.code} — ${verdict.detail}`);
    }
    const pixels = validateProvenancePixels(measured, verdict);
    if (!pixels.ok) {
      throw new Error(
        `capture geometry does not match the screenshot: ${pixels.errors.join("; ")}`,
      );
    }
    // Same-directory rename keeps the final path atomic: the gate never sees a
    // half-written PNG, even if the process dies mid-capture.
    renameSync(tmp, outputAbs);
    return { provenance: measured, width: verdict.width, height: verdict.height };
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // Renamed into place, or the write never happened.
    }
  }
}

const closeQuietly = async (target) => {
  try {
    await target?.close?.();
  } catch {
    // A close failure must not mask the capture result.
  }
};

/**
 * Capture one planned entry: launch a page with the recipe's viewport and
 * device scale factor, capture, and always close both page and browser.
 *
 * @param {object} input
 * @param {object} input.recipe - normalized recipe
 * @param {string} input.outputAbs - final absolute path
 * @param {object|null} [input.declared] - provenance already in scene data
 * @param {{launchBrowser?: () => Promise<object>}} [input.deps]
 * @returns {Promise<{provenance: object, width: number, height: number}>}
 */
export async function captureEvidenceShot({ recipe, outputAbs, declared, deps = {} }) {
  const launchBrowser = deps.launchBrowser ?? launchEvidenceBrowser;
  const browser = await launchBrowser();
  let page;
  try {
    page = await browser.newPage({
      viewport: recipe.viewport,
      deviceScaleFactor: recipe.deviceScaleFactor,
    });
    return await captureFromPage(page, recipe, declared, outputAbs);
  } finally {
    await closeQuietly(page);
    await closeQuietly(browser);
  }
}

/**
 * Run every missing capture for a pack.
 *
 * Existing files are the final gate's problem (pixels vs provenance); this
 * stage only fills gaps, so a normal pipeline run does not re-open pages.
 * `force` is the manual drift check.
 *
 * A rejected recipe is returned in `errors`, not thrown: one typo must not cost
 * every other scene its capture. The caller decides whether that is fatal.
 *
 * @param {object} input
 * @param {Array<Record<string, any>>} input.scenes
 * @param {string} input.contentDirAbs
 * @param {boolean} [input.force=false]
 * @param {object} [input.deps] - `launchBrowser`, `exists`
 * @returns {Promise<{manifest: boolean,
 *            captured: Array<{sceneId: number|string, path: string, provenance: object}>,
 *            skipped: Array<object>,
 *            errors: string[],
 *            uncovered: Array<Record<string, any>>}>}
 */
export async function runEvidenceCaptures({ scenes, contentDirAbs, force = false, deps = {} }) {
  let manifest;
  let manifestError = null;
  try {
    manifest = loadCaptureManifest(contentDirAbs);
  } catch (e) {
    // A malformed manifest is one diagnosis, not a reason to lose the rest of
    // the stage: report it and treat every evidence scene as uncovered.
    manifestError = e.message;
    manifest = null;
  }
  const uncovered = findUncoveredEvidenceScenes(scenes, manifest);
  if (manifestError) {
    return { manifest: false, captured: [], skipped: [], errors: [manifestError], uncovered };
  }
  if (!manifest) return { manifest: false, captured: [], skipped: [], errors: [], uncovered };

  const plan = planEvidenceCaptures({
    scenes,
    contentDirAbs,
    manifest,
    force,
    exists: deps.exists ?? existsSync,
  });

  const captured = [];
  for (const entry of plan.planned) {
    const shot = await captureEvidenceShot({
      recipe: entry.recipe,
      outputAbs: entry.outputAbs,
      declared: entry.declared,
      deps,
    });
    captured.push({ sceneId: entry.sceneId, path: entry.outputAbs, provenance: shot.provenance });
  }
  return {
    manifest: true,
    captured,
    skipped: plan.skipped,
    errors: plan.errors,
    uncovered,
  };
}
