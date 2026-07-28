#!/usr/bin/env node
/**
 * Insert widget markers into the DeepSeek article content.
 * Reads current content, inserts markers at agreed positions, writes back.
 *
 * Usage: node scripts/insert-widget-markers.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

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

async function updatePostContent(slug, content, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?slug=eq.${slug}`, {
    method: "PATCH",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Update failed: ${res.status} ${body}`);
  }
  return true;
}

function insertMarkers(content) {
  // 1. After "What follows is a summary..." insert cloud + funding
  const marker1 =
    "What follows is a summary of the key points Liang Wenfeng made during the meeting, based on the full transcript.";
  content = content.replace(
    marker1,
    marker1 + "\n\n<!-- widget:deepseek-cloud -->\n\n<!-- widget:deepseek-funding -->",
  );

  // 2. After section 2 (API pricing) - before the --- that precedes section 3
  const sec3 = "## 3. The strongest models are open-sourced";
  let idx = content.indexOf(sec3);
  if (idx > 0) {
    const dashPos = content.lastIndexOf("---", idx);
    content =
      content.slice(0, dashPos) +
      "<!-- widget:deepseek-pricing -->\n\n---" +
      content.slice(dashPos + 3);
  }

  // 3. After section 6 (team) - before the --- that precedes section 7
  const sec7 = "## 7. The gap with America is compute, not talent";
  idx = content.indexOf(sec7);
  if (idx > 0) {
    const dashPos = content.lastIndexOf("---", idx);
    content =
      content.slice(0, dashPos) +
      "<!-- widget:deepseek-talent -->\n\n---" +
      content.slice(dashPos + 3);
  }

  // 4. After section 9 - before the --- that precedes Sources
  const sources = "## Sources";
  idx = content.indexOf(sources);
  if (idx > 0) {
    const dashPos = content.lastIndexOf("---", idx);
    content =
      content.slice(0, dashPos) +
      "<!-- widget:deepseek-companies -->\n\n---" +
      content.slice(dashPos + 3);
  }

  return content;
}

async function main() {
  const slug = "deepseek-leaked-investor-meeting";
  const env = readEnv();

  if (!env.SUPABASE_REFRESH_TOKEN) {
    console.error("Error: SUPABASE_REFRESH_TOKEN not found in .env.local");
    process.exit(1);
  }

  console.log("Refreshing token...");
  const { access_token, refresh_token } = await refreshAccessToken(env.SUPABASE_REFRESH_TOKEN);
  writeEnvLocal({ SUPABASE_REFRESH_TOKEN: refresh_token });
  console.log("Token refreshed.");

  console.log("Fetching current content...");
  const content = await getPostContent(slug, access_token);
  if (!content) {
    console.error("Post not found");
    process.exit(1);
  }

  // Check if markers already exist
  if (content.includes("<!-- widget:deepseek-")) {
    console.log("Widget markers already exist in content. Skipping.");
    return;
  }

  console.log("Inserting widget markers...");
  const updated = insertMarkers(content);

  // Verify markers were inserted
  const markerCount = (updated.match(/<!-- widget:deepseek-/g) || []).length;
  console.log(`Inserted ${markerCount} widget markers.`);

  console.log("Updating post content...");
  await updatePostContent(slug, updated, access_token);
  console.log("Update successful!");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
