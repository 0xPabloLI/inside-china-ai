#!/usr/bin/env node
/**
 * Upload Source Attachments to a Published Post
 *
 * Reads one or more files from local paths, uploads them to the Supabase
 * post-attachments storage bucket, and inserts metadata rows into the
 * post_attachments table.
 *
 * The post must already exist (publish-article.mjs should be run first).
 * Supports uploading multiple files in a single invocation.
 *
 * Usage:
 *   node scripts/article/upload-attachments.mjs --post <slug> --files <path1> [path2 ...]
 *   node scripts/article/upload-attachments.mjs --post-id <uuid> --files <path1> [path2 ...]
 *
 * Options:
 *   --post <slug>     Post slug (will look up post ID by slug)
 *   --post-id <uuid>  Post UUID directly (skip slug lookup)
 *   --files <paths>   One or more file paths to upload (at least 1 required)
 *   --list            List existing attachments for the post (no upload)
 *   --verbose         Show detailed upload progress
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

import { loginAdmin, loadDotEnvFiles, getEnvVar } from "./lib/supabase-auth.mjs";
import {
  uploadAttachments,
  listAttachments,
  buildAttachmentHeaders,
} from "./lib/attachment-utils.mjs";

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

function getFilesArg() {
  const i = args.indexOf("--files");
  if (i < 0) return null;
  // Collect all args after --files until we hit another --flag
  const files = [];
  for (let j = i + 1; j < args.length; j++) {
    if (args[j].startsWith("--")) break;
    files.push(args[j]);
  }
  return files;
}

const postSlug = getArg("post");
const postIdDirect = getArg("post-id");
const filePaths = getFilesArg();
const listOnly = hasFlag("list");
const verbose = hasFlag("verbose");

// Validate args
if (!postSlug && !postIdDirect) {
  console.error("❌ Either --post <slug> or --post-id <uuid> is required");
  console.error(
    "   Usage: node scripts/article/upload-attachments.mjs --post <slug> --files <path1> [path2 ...]",
  );
  console.error(
    "          node scripts/article/upload-attachments.mjs --post-id <uuid> --files <path1> [path2 ...]",
  );
  console.error("          node scripts/article/upload-attachments.mjs --post <slug> --list");
  process.exit(1);
}

if (!listOnly && (!filePaths || filePaths.length === 0)) {
  console.error("❌ --files <path> is required (at least one file)");
  console.error("   Or use --list to view existing attachments");
  process.exit(1);
}

// ─── Helpers ───

/**
 * Look up a post ID by slug via Supabase REST API.
 *
 * @param {string} slug - Post slug
 * @param {string} accessToken - Admin access token
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} supabaseKey - Supabase publishable/anon key
 * @returns {Promise<{ id: string, title: string, slug: string }>}
 * @throws {Error} If post not found
 */
async function getPostBySlug(slug, accessToken, supabaseUrl, supabaseKey) {
  const url = `${supabaseUrl}/rest/v1/posts?slug=eq.${encodeURIComponent(slug)}&select=id,title,slug`;
  const headers = buildAttachmentHeaders(accessToken, supabaseKey);
  headers["Content-Type"] = "application/json";

  const resp = await fetch(url, { headers });
  const data = await resp.json();

  if (!resp.ok) {
    const msg = data?.message || `HTTP ${resp.status}`;
    throw new Error(`Post lookup failed: ${msg}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(
      `Post not found with slug "${slug}". Make sure the article is published first (run publish-article.mjs).`,
    );
  }

  return data[0];
}

// ─── Main ───

async function main() {
  console.log("📎 Upload Attachments");
  console.log("=".repeat(50));

  // 1. Login as admin
  console.log("\n🔐 Logging in as admin...");
  const auth = await loginAdmin();
  console.log(`  ✅ Authenticated (user: ${auth.user.id})`);

  // 2. Get Supabase URL and key from env
  const dotenv = loadDotEnvFiles();
  const supabaseUrl = getEnvVar("SUPABASE_URL", dotenv);
  const supabaseKey = getEnvVar("SUPABASE_PUBLISHABLE_KEY", dotenv);

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. Check .env file.");
  }

  // 3. Resolve post ID
  let targetPostId = postIdDirect;
  let postTitle = "(unknown)";

  if (!targetPostId && postSlug) {
    console.log(`\n🔍 Looking up post by slug: ${postSlug}`);
    const post = await getPostBySlug(postSlug, auth.access_token, supabaseUrl, supabaseKey);
    targetPostId = post.id;
    postTitle = post.title;
    console.log(`  ✅ Found: "${postTitle}" (ID: ${targetPostId})`);
  } else {
    console.log(`\n📌 Using post ID: ${targetPostId}`);
  }

  // 4. List mode
  if (listOnly) {
    console.log("\n📋 Existing attachments:");
    const existing = await listAttachments(
      targetPostId,
      auth.access_token,
      supabaseUrl,
      supabaseKey,
    );

    if (existing.length === 0) {
      console.log("  (no attachments)");
    } else {
      for (const att of existing) {
        const sizeKB = att.file_size ? ` · ${(att.file_size / 1024).toFixed(1)} KB` : "";
        console.log(`  • ${att.file_name} (${att.mime_type}${sizeKB})`);
      }
    }
    console.log("\n" + "=".repeat(50));
    return;
  }

  // 5. Upload mode
  console.log(`\n📤 Uploading ${filePaths.length} file(s) to post "${postTitle}"...`);

  if (verbose) {
    for (const fp of filePaths) {
      console.log(`  • ${fp}`);
    }
  }

  const result = await uploadAttachments(
    targetPostId,
    filePaths,
    auth.access_token,
    supabaseUrl,
    supabaseKey,
  );

  // 6. Report results
  console.log("\n" + "=".repeat(50));

  if (result.uploaded.length > 0) {
    console.log(`✅ Uploaded ${result.uploaded.length} file(s):`);
    for (const att of result.uploaded) {
      console.log(`  • ${att.fileName}`);
      if (verbose) {
        console.log(`    Storage: ${att.storagePath}`);
        console.log(`    URL: ${att.publicUrl}`);
        console.log(`    Attachment ID: ${att.attachmentId}`);
      }
    }
  }

  if (result.errors.length > 0) {
    console.log(`\n❌ ${result.errors.length} error(s):`);
    for (const err of result.errors) {
      console.log(`  • ${err.fileName}: ${err.error}`);
    }
    process.exit(1);
  }

  console.log("=".repeat(50));
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
