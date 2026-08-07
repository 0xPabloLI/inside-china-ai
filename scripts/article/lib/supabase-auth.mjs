/**
 * Supabase Auth Module — Shared admin authentication for article scripts.
 *
 * Reads ADMIN_EMAIL + ADMIN_PASSWORD from environment (process.env or .env.local),
 * logs in via Supabase Auth API, and returns an access token for REST API calls.
 *
 * Usage:
 *   import { loginAdmin } from "./lib/supabase-auth.mjs";
 *   const { access_token, user } = await loginAdmin();
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname =
  typeof import.meta !== "undefined" ? dirname(fileURLToPath(import.meta.url)) : __dirname;

// ─── .env.local loader ───

/**
 * Parse KEY=VALUE lines from env file content.
 * Handles comments (#), empty lines, and quoted values.
 */
export function loadEnvFile(content) {
  const result = {};
  if (!content) return result;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Load .env and .env.local from the project root.
 * Returns a merged object ( .env.local overrides .env ).
 */
export function loadDotEnvFiles() {
  const projectRoot = join(__dirname, "..", "..", "..");
  const merged = {};

  for (const file of [".env", ".env.local"]) {
    const path = join(projectRoot, file);
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf8");
        Object.assign(merged, loadEnvFile(content));
      } catch {
        // ignore read errors
      }
    }
  }

  return merged;
}

/**
 * Get an environment variable.
 * Checks process.env first, then falls back to .env/.env.local values.
 */
export function getEnvVar(name, fallback) {
  if (process.env[name]) return process.env[name];
  if (fallback && name in fallback) return fallback[name];
  return undefined;
}

// ─── Supabase Auth ───

function isNewSupabaseApiKey(value) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/**
 * Log in as admin via Supabase Auth password grant.
 *
 * Required env vars: ADMIN_EMAIL, ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
 *
 * @param {{ dotenv?: Record<string, string> }} [opts] - Optional injected
 *   env-file values (tests pass `{ dotenv: {} }` to simulate a missing-env
 *   machine without the repo .env/.env.local leaking real credentials in).
 *   Defaults to loading .env/.env.local from disk — callers that don't pass
 *   it keep the existing behavior.
 * @returns {Promise<{access_token: string, user: {id: string}}>}
 * @throws {Error} If env vars are missing, auth fails, or network error occurs.
 */
export async function loginAdmin({ dotenv } = {}) {
  const resolvedDotenv = dotenv ?? loadDotEnvFiles();

  const email = getEnvVar("ADMIN_EMAIL", dotenv);
  const password = getEnvVar("ADMIN_PASSWORD", dotenv);
  const supabaseUrl = getEnvVar("SUPABASE_URL", dotenv);
  const supabaseKey = getEnvVar("SUPABASE_PUBLISHABLE_KEY", dotenv);

  // Check required env vars with clear messages
  const missing = [];
  if (!email) missing.push("ADMIN_EMAIL");
  if (!password) missing.push("ADMIN_PASSWORD");
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseKey) missing.push("SUPABASE_PUBLISHABLE_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing env var(s): ${missing.join(", ")}. ` +
        `Check .env.local (see .env.local for ADMIN_EMAIL/ADMIN_PASSWORD, .env for SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY).`,
    );
  }

  // Build headers — new sb_publishable_ keys use apikey only, legacy keys use Bearer
  const headers = {
    "Content-Type": "application/json",
    apikey: supabaseKey,
  };

  if (!isNewSupabaseApiKey(supabaseKey)) {
    headers["Authorization"] = `Bearer ${supabaseKey}`;
  }

  // Call Supabase Auth API
  const url = `${supabaseUrl}/auth/v1/token?grant_type=password`;
  let resp;

  try {
    resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new Error(`Auth failed (network): ${err.message}`);
  }

  const data = await resp.json();

  if (!resp.ok) {
    const msg = data?.error_description || data?.error || data?.message || `HTTP ${resp.status}`;
    throw new Error(`Auth failed: ${msg}`);
  }

  if (!data.access_token || !data.user?.id) {
    throw new Error("Auth failed: No access_token or user.id in response");
  }

  return {
    access_token: data.access_token,
    user: { id: data.user.id },
  };
}
