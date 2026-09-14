/**
 * Unified .env.local loader for pipeline entry points (#287).
 *
 * dotenv loads ONCE at the application entry (main.mjs, search-sources.mjs,
 * the search-pool CLI guard); library modules never self-load — a library
 * writing process.env is an implicit side effect its consumers cannot opt
 * out of (#275 design decision, 2026-09-13).
 *
 * Uses the Node ≥20.12 builtin process.loadEnvFile() — no dotenv dependency.
 * Real environment variables take precedence over file values (Node
 * --env-file semantics; matches the old per-key `if (!process.env[k])` guard).
 *
 * Fail-open (#269 semantics): a missing .env.local is a silent no-op; any
 * other load failure warns once on stderr and lets the pipeline boot —
 * engines that then miss their key are skipped per engine, not fatal.
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT_ENV_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".env.local",
);

let loaded = false;

/**
 * Load repo-root .env.local into process.env, once per process.
 * Call only from application entry points, before pipeline logic runs.
 *
 * @param {string} [envPath] - env file path override (test seam)
 */
export function loadEnv(envPath = REPO_ROOT_ENV_PATH) {
  if (loaded) return;
  loaded = true;
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    if (err?.code === "ENOENT") return; // no .env.local — normal on fresh clones
    process.stderr.write(`warn: loadEnvFile(${envPath}) failed: ${err?.message ?? err}\n`);
  }
}
