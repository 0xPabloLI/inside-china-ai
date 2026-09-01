/**
 * Load per-pipeline DOM verification config from content/<dir>/dom-config.mjs.
 *
 * If the file is absent or has a syntax error, falls back to defaults.
 * If the file exports an incomplete config, missing fields are filled with defaults.
 *
 * @param {string} contentDir - content directory name (e.g. "restraint/pt1")
 * @param {string} [baseDir] - base directory containing "content/" (for testing)
 * @returns {Promise<{absentClasses: string[], singleOccurrence: object, wordFit: object}>}
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_ABSENT_CLASSES = ["source-badge", "subscribe"];

export const DEFAULT_DOM_CONFIG = Object.freeze({
  absentClasses: DEFAULT_ABSENT_CLASSES,
  singleOccurrence: {},
  wordFit: {},
});

export async function loadDomConfig(contentDir, baseDir) {
  const root = baseDir || join(__dirname, "..");
  const configUrl = `file://${join(root, "content", contentDir, "dom-config.mjs")}`;

  try {
    const mod = await import(configUrl);
    if (mod.domConfig && typeof mod.domConfig === "object") {
      return {
        absentClasses: mod.domConfig.absentClasses || DEFAULT_ABSENT_CLASSES,
        singleOccurrence: mod.domConfig.singleOccurrence || {},
        wordFit: mod.domConfig.wordFit || {},
      };
    }
    // File exists but doesn't export domConfig — use defaults
    return { ...DEFAULT_DOM_CONFIG };
  } catch {
    // dom-config.mjs absent or has syntax error — use defaults
    return { ...DEFAULT_DOM_CONFIG };
  }
}
