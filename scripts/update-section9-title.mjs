import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function readEnv() {
  const vars = {};
  for (const p of [".env", ".env.local"]) {
    const fullP = resolve(projectRoot, p);
    if (existsSync(fullP)) {
      for (const line of readFileSync(fullP, "utf-8").split("\n")) {
        const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
        if (m) vars[m[1]] = m[2];
      }
    }
  }
  return vars;
}

function writeEnvLocal(updates) {
  const p = resolve(projectRoot, ".env.local");
  let content = existsSync(p) ? readFileSync(p, "utf-8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) content = content.replace(re, `${key}="${value}"`);
    else content += `\n${key}="${value}"`;
  }
  writeFileSync(p, content.trim() + "\n");
}

const SUPABASE_URL = "https://zjsjrghmhcmwvkfpbqap.supabase.co";
const ANON_KEY = "sb_publishable_KNu1cr9jcesU7e197KBxRA_fTYxu7XK";

async function refresh(rt) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ refresh_token: rt }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return res.json();
}

async function fetchPost(slug, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?slug=eq.${slug}&select=content`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data[0]?.content ?? null;
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
  return res.status === 204;
}

const env = readEnv();
console.log("Refreshing token...");
const session = await refresh(env.SUPABASE_REFRESH_TOKEN);
writeEnvLocal({ SUPABASE_REFRESH_TOKEN: session.refresh_token });

console.log("Fetching current content...");
const content = await fetchPost("deepseek-leaked-investor-meeting", session.access_token);
if (!content) throw new Error("Post not found");

const oldTitle = "## 9. Why this leak cost DeepSeek a funding round";
const newTitle = "## 9. My Take: Why this leak cost DeepSeek a funding round";

if (!content.includes(oldTitle)) {
  console.error("Old title not found in content!");
  process.exit(1);
}

const updated = content.replace(oldTitle, newTitle);
console.log("Updating content...");
const ok = await updatePost(
  "deepseek-leaked-investor-meeting",
  "content",
  updated,
  session.access_token,
);
console.log(ok ? "Done! Title updated." : "Update failed.");
