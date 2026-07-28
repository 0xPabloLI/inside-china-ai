#!/usr/bin/env node
/**
 * Update a post's content via Supabase REST API using refresh token.
 *
 * Usage:
 *   node scripts/update-post.mjs <slug> <field> <value>
 *
 * Examples:
 *   node scripts/update-post.mjs deepseek-leaked-investor-meeting title "New Title"
 *   node scripts/update-post.mjs deepseek-leaked-investor-meeting content "$(cat content.md)"
 *
 * The refresh token is read from .env.local (SUPABASE_REFRESH_TOKEN).
 * After each run, the new refresh token is written back to .env.local.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Read env files
function readEnv() {
  const envPath = resolve(projectRoot, ".env");
  const envLocalPath = resolve(projectRoot, ".env.local");
  const vars = {};
  for (const p of [envPath, envLocalPath]) {
    if (existsSync(p)) {
      const content = readFileSync(p, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
        if (match) vars[match[1]] = match[2];
      }
    }
  }
  return vars;
}

function writeEnvLocal(updates) {
  const envLocalPath = resolve(projectRoot, ".env.local");
  let content = "";
  if (existsSync(envLocalPath)) {
    content = readFileSync(envLocalPath, "utf-8");
  }
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `${key}="${value}"`);
    } else {
      content += `\n${key}="${value}"`;
    }
  }
  writeFileSync(envLocalPath, content.trim() + "\n");
}

const SUPABASE_URL = "https://zjsjrghmhcmwvkfpbqap.supabase.co";
const ANON_KEY = "sb_publishable_KNu1cr9jcesU7e197KBxRA_fTYxu7XK";

async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  };
}

async function updatePost(slug, field, value, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?slug=eq.${slug}`, {
    method: "PATCH",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
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

async function getPostContent(slug, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?slug=eq.${slug}&select=content`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const data = await res.json();
  return data[0]?.content ?? null;
}

async function main() {
  const [slug, field, ...valueParts] = process.argv.slice(2);

  if (!slug || !field || valueParts.length === 0) {
    // Interactive mode: just fetch current content
    const env = readEnv();
    if (!env.SUPABASE_REFRESH_TOKEN) {
      console.error("Error: SUPABASE_REFRESH_TOKEN not found in .env.local");
      process.exit(1);
    }

    console.log("Refreshing token...");
    const { access_token, refresh_token } = await refreshAccessToken(env.SUPABASE_REFRESH_TOKEN);
    writeEnvLocal({ SUPABASE_REFRESH_TOKEN: refresh_token });

    console.log("Fetching current content...");
    const content = await getPostContent(slug || "deepseek-leaked-investor-meeting", access_token);
    if (content) {
      console.log(content);
    } else {
      console.log("Post not found");
    }
    return;
  }

  const value = valueParts.join(" ");

  const env = readEnv();
  if (!env.SUPABASE_REFRESH_TOKEN) {
    console.error("Error: SUPABASE_REFRESH_TOKEN not found in .env.local");
    process.exit(1);
  }

  console.log(`Refreshing token...`);
  const { access_token, refresh_token } = await refreshAccessToken(env.SUPABASE_REFRESH_TOKEN);
  writeEnvLocal({ SUPABASE_REFRESH_TOKEN: refresh_token });
  console.log("Token refreshed and saved.");

  console.log(`Updating post '${slug}' field '${field}'...`);
  const success = await updatePost(slug, field, value, access_token);
  if (success) {
    console.log("Update successful.");
  } else {
    console.error("Update may have failed (no rows affected).");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
