#!/usr/bin/env node
/**
 * Publish Article to Website via Supabase REST API
 *
 * Reads a frontmatter markdown file, logs in as admin, and upserts the article
 * to the Supabase posts table. If the slug already exists, updates the article
 * (preserving published_at). If not, creates a new article.
 *
 * Usage:
 *   node scripts/article/publish-article.mjs --file <path>
 *   node scripts/article/publish-article.mjs --file <path> --draft
 *
 * Options:
 *   --file <path>    Path to frontmatter markdown file (required)
 *   --draft          Override frontmatter published=true to false (save as draft)
 *
 * Env vars (from .env / .env.local):
 *   ADMIN_EMAIL              Supabase admin account email
 *   ADMIN_PASSWORD           Supabase admin account password
 *   SUPABASE_URL             Supabase project URL
 *   SUPABASE_PUBLISHABLE_KEY Supabase publishable/anon key
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { loginAdmin, getEnvVar, loadDotEnvFiles } from "./lib/supabase-auth.mjs";
import { parseArticleFile, upsertPost } from "./lib/publish-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI args ───

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const filePath = getArg("file");
const forceDraft = hasFlag("draft");

if (!filePath) {
  console.error("❌ --file <path> is required");
  console.error("   Usage: node scripts/article/publish-article.mjs --file <path> [--draft]");
  process.exit(1);
}

if (!existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

// ─── Main ───

async function main() {
  console.log("📝 Publish Article");
  console.log("=".repeat(50));

  // 1. Read and parse file
  console.log(`📄 Reading: ${filePath}`);
  const fileContent = readFileSync(filePath, "utf8");
  const parsed = parseArticleFile(fileContent);

  // Override to draft if --draft flag
  if (forceDraft) {
    parsed.published = false;
  }

  console.log(`  Title:    ${parsed.title}`);
  console.log(`  Slug:     ${parsed.slug}`);
  console.log(`  Excerpt:  ${parsed.excerpt ? parsed.excerpt.substring(0, 50) + "..." : "(none)"}`);
  console.log(`  Content:  ${parsed.content.length} chars`);
  console.log(`  Status:   ${parsed.published ? "published" : "draft"}`);

  // 2. Login as admin
  console.log("\n🔐 Logging in as admin...");
  const auth = await loginAdmin();
  console.log(`  ✅ Authenticated (user: ${auth.user.id})`);

  // 3. Get Supabase URL and key from env
  const dotenv = loadDotEnvFiles();
  const supabaseUrl = getEnvVar("SUPABASE_URL", dotenv);
  const supabaseKey = getEnvVar("SUPABASE_PUBLISHABLE_KEY", dotenv);

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. Check .env file.");
  }

  // 4. Upsert to Supabase
  console.log("\n📤 Upserting to Supabase...");
  const result = await upsertPost(parsed, auth, supabaseUrl, supabaseKey);

  console.log("\n" + "=".repeat(50));
  console.log("✅ Success!");
  console.log(`  Mode:     ${result.mode === "insert" ? "Created" : "Updated"}`);
  console.log(`  Post ID:  ${result.id}`);
  console.log(`  URL:      /posts/${result.slug}`);
  if (parsed.published) {
    console.log(`  Status:   Published`);
  } else {
    console.log(`  Status:   Draft (not visible publicly)`);
  }
  console.log("=".repeat(50));
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
