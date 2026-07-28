#!/usr/bin/env node
/**
 * Update a post's content via Supabase REST API using admin email/password.
 *
 * Usage:
 *   node scripts/update-post.mjs <slug> <field> <value>
 *   node scripts/update-post.mjs <slug>            (fetch & print current content)
 *
 * Examples:
 *   node scripts/update-post.mjs deepseek-leaked-investor-meeting title "New Title"
 *   node scripts/update-post.mjs deepseek-leaked-investor-meeting content "$(cat content.md)"
 *
 * Credentials read from .env.local (ADMIN_EMAIL, ADMIN_PASSWORD).
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function readEnv() {
  const vars = {};
  for (const p of [".env", ".env.local"]) {
    const fp = resolve(projectRoot, p);
    if (existsSync(fp)) {
      for (const line of readFileSync(fp, "utf-8").split("\n")) {
        const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
        if (m) vars[m[1]] = m[2];
      }
    }
  }
  return vars;
}

const SUPABASE_URL = "https://zjsjrghmhcmwvkfpbqap.supabase.co";
const ANON_KEY = "sb_publishable_KNu1cr9jcesU7e197KBxRA_fTYxu7XK";

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function updatePost(slug, field, value, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?slug=eq.${slug}`, {
    method: "PATCH",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ [field]: value }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Update failed: ${res.status} ${body}`);
  }
  return res.status === 204;
}

async function getPostContent(slug, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?slug=eq.${slug}&select=content`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const data = await res.json();
  return data[0]?.content ?? null;
}

async function main() {
  const [slug, field, ...valueParts] = process.argv.slice(2);

  if (!slug) {
    console.error("Usage: node scripts/update-post.mjs <slug> [field] [value]");
    process.exit(1);
  }

  const env = readEnv();
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error("Error: ADMIN_EMAIL/ADMIN_PASSWORD not found in .env.local");
    process.exit(1);
  }

  console.log("Signing in...");
  const token = await signIn(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  console.log("Authenticated.");

  if (!field || valueParts.length === 0) {
    console.log("Fetching current content...");
    const content = await getPostContent(slug, token);
    if (content) {
      console.log(content);
    } else {
      console.log("Post not found");
    }
    return;
  }

  const value = valueParts.join(" ");
  console.log(`Updating post '${slug}' field '${field}'...`);
  const success = await updatePost(slug, field, value, token);
  console.log(success ? "Update successful." : "Update may have failed (no rows affected).");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
