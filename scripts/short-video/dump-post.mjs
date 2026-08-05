/**
 * Dump full post content to /tmp for analysis
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";

const env = {};
for (const f of [".env", ".env.local"]) {
  try {
    const text = readFileSync(f, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) {
        let val = m[2].trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        )
          val = val.slice(1, -1);
        env[m[1]] = val;
      }
    }
  } catch {}
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

await supabase.auth.signInWithPassword({
  email: env.ADMIN_EMAIL,
  password: env.ADMIN_PASSWORD,
});

const { data: post } = await supabase
  .from("posts")
  .select("content")
  .eq("slug", "deepseek-leaked-investor-meeting")
  .single();

writeFileSync("/tmp/deepseek-post-full.txt", post.content);
console.log("Content written to /tmp/deepseek-post-full.txt");
console.log("Length:", post.content.length, "chars");

// Also extract plain text sections for video scripting
const sections = post.content.split(/^#{1,3}\s+/m);
console.log(`\nFound ${sections.length} sections`);

await supabase.auth.signOut();
