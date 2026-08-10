#!/usr/bin/env node
/**
 * Set TikTok URL on a Published Post
 *
 * Updates the `tiktok_url` field on a post identified by slug.
 * Used after manual TikTok uploads (when the pipeline didn't auto-save the URL).
 *
 * Usage:
 *   node scripts/article/set-tiktok-url.mjs --slug <slug> --url <tiktok-url>
 *
 * Options:
 *   --slug <slug>      Post slug (required)
 *   --url <url>        TikTok video URL (required)
 *
 * Env vars (from .env / .env.local):
 *   ADMIN_EMAIL              Supabase admin account email
 *   ADMIN_PASSWORD           Supabase admin account password
 *   SUPABASE_URL             Supabase project URL
 *   SUPABASE_PUBLISHABLE_KEY Supabase publishable/anon key
 */

import { loginAdmin, getEnvVar, loadDotEnvFiles } from "./lib/supabase-auth.mjs";

// ─── CLI args ───

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const slug = getArg("slug");
const url = getArg("url");

if (!slug || !url) {
  console.error("❌ --slug <slug> and --url <tiktok-url> are required");
  console.error(
    "   Usage: node scripts/article/set-tiktok-url.mjs --slug <slug> --url <tiktok-url>",
  );
  process.exit(1);
}

// Basic URL validation
if (!url.includes("tiktok.com")) {
  console.error(`❌ URL doesn't look like a TikTok URL: ${url}`);
  process.exit(1);
}

// ─── Main ───

async function main() {
  const dotenv = loadDotEnvFiles();
  const supabaseUrl = getEnvVar("SUPABASE_URL", dotenv);
  const supabaseKey = getEnvVar("SUPABASE_PUBLISHABLE_KEY", dotenv);

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in env");
  }

  console.log(`📝 Setting tiktok_url on post "${slug}"...`);
  console.log(`   URL: ${url}`);

  const auth = await loginAdmin();

  const resp = await fetch(`${supabaseUrl}/rest/v1/posts?slug=eq.${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      apikey: supabaseKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ tiktok_url: url }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase PATCH failed: HTTP ${resp.status} — ${text.slice(0, 200)}`);
  }

  console.log(`✅ Saved tiktok_url to post "${slug}"`);
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
