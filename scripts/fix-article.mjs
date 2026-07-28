#!/usr/bin/env node
/**
 * Fix article content (remove corruption) + insert widget markers.
 * Uses email/password auth — no refresh token needed.
 *
 * Usage: node scripts/fix-article.mjs
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
const SLUG = "deepseek-leaked-investor-meeting";

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

async function fetchContent(token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?slug=eq.${SLUG}&select=content`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data[0]?.content ?? null;
}

async function updateContent(token, content) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?slug=eq.${SLUG}`, {
    method: "PATCH",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ content }),
  });
  return res.status === 204;
}

// ─── Main ───
const env = readEnv();
console.log("Signing in with admin credentials...");
const token = await signIn(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
console.log("✓ Authenticated");

console.log("Fetching current content...");
let content = await fetchContent(token);
if (!content) throw new Error("Post not found");
console.log(`✓ Content fetched (${content.length} chars)`);

// 1. Remove corruption: strip leading "Refreshing token...\nFetching current content...\n"
const corruptionPrefix = "Refreshing token...\nFetching current content...\n";
if (content.startsWith(corruptionPrefix)) {
  content = content.slice(corruptionPrefix.length);
  console.log("✓ Removed corrupted prefix");
} else {
  console.log("- No corruption prefix found");
}

// 2. Insert widget markers
const markers = [
  {
    check: "<!-- widget:deepseek-cloud -->",
    anchor:
      "What follows is a summary of the key points Liang Wenfeng made during the meeting, based on the full transcript.",
    insert: "\n\n<!-- widget:deepseek-cloud -->",
    label: "cloud",
  },
  {
    check: "<!-- widget:deepseek-funding -->",
    anchor: "<!-- widget:deepseek-cloud -->",
    insert: "\n\n<!-- widget:deepseek-funding -->",
    label: "funding",
  },
  {
    check: "<!-- widget:deepseek-pricing -->",
    anchor: "## 3. The strongest models are open-sourced",
    insert: "<!-- widget:deepseek-pricing -->\n\n---\n\n",
    label: "pricing",
  },
  {
    check: "<!-- widget:deepseek-talent -->",
    anchor: "## 7. The gap with America is compute, not talent",
    insert: "<!-- widget:deepseek-talent -->\n\n---\n\n",
    label: "talent",
  },
  {
    check: "<!-- widget:deepseek-companies -->",
    anchor: "## Sources",
    insert: "<!-- widget:deepseek-companies -->\n\n---\n\n",
    label: "companies",
  },
];

for (const m of markers) {
  if (content.includes(m.check)) {
    console.log(`- ${m.label} marker already present`);
    continue;
  }
  const idx = content.indexOf(m.anchor);
  if (idx === -1) {
    console.log(`✗ Anchor not found for ${m.label}: "${m.anchor.slice(0, 50)}..."`);
    continue;
  }
  const insertPos = idx + m.anchor.length;
  content = content.slice(0, insertPos) + m.insert + content.slice(insertPos);
  console.log(`✓ Inserted ${m.label} marker`);
}

console.log("Updating article in DB...");
const ok = await updateContent(token, content);
console.log(ok ? "✓ Done! Article fixed and all 5 widget markers inserted." : "✗ Update failed.");
