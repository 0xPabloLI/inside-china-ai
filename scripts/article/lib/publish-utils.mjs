/**
 * Publish Article Utils — Frontmatter parsing, slug validation, and Supabase upsert.
 *
 * Extracted into a lib module for testability. The main publish-article.mjs
 * script imports these functions.
 */

import matter from "gray-matter";
import { execSync } from "child_process";

// ─── Slug helpers ───

/**
 * Convert a title to a URL slug.
 * Matches the slugify logic in admin.tsx:
 *   lowercase → trim → remove non-word/space/hyphen → replace spaces with hyphens → collapse hyphens → truncate to 80
 */
export function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/**
 * Validate that a slug matches the postInput schema regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
 */
export function validateSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

// ─── Frontmatter parsing ───

/**
 * Parse a frontmatter markdown file into article fields.
 *
 * @param {string} fileContent - Raw file content with YAML frontmatter + markdown body
 * @returns {{ title: string, slug: string, excerpt: string|null, content: string, published: boolean }}
 * @throws {Error} If no frontmatter or title is missing
 */
export function parseArticleFile(fileContent) {
  // Check for frontmatter presence
  if (!fileContent.trimStart().startsWith("---")) {
    throw new Error('Frontmatter is required. Start the file with:\n---\ntitle: "..."\n---');
  }

  const parsed = matter(fileContent);
  const fm = parsed.data || {};
  const content = (parsed.content ?? "").trim();

  // title is required
  if (!fm.title || typeof fm.title !== "string" || !fm.title.trim()) {
    throw new Error("title is required in frontmatter");
  }

  // slug: auto-generate from title if missing
  let slug = fm.slug;
  if (!slug) {
    slug = slugify(fm.title);
  }

  // Validate slug format
  if (!validateSlug(slug)) {
    throw new Error(
      `slug must match [a-z0-9-]+ pattern (got: "${slug}"). Use lowercase letters, numbers, and hyphens only.`,
    );
  }

  return {
    title: fm.title.trim(),
    slug,
    excerpt: fm.excerpt ? String(fm.excerpt).trim() : null,
    content,
    published: fm.published === true,
  };
}

// ─── Post payload builder ───

/**
 * Build the Supabase API payload for insert or update.
 *
 * @param {object} parsed - Output of parseArticleFile
 * @param {string} userId - Authenticated user's UUID
 * @param {object|null} existing - Existing post record (null if new)
 * @returns {{ mode: "insert"|"update", data: object, existingId?: string }}
 */
export function buildPostPayload(parsed, userId, existing) {
  const now = new Date().toISOString();

  if (!existing) {
    // INSERT
    return {
      mode: "insert",
      data: {
        author_id: userId,
        title: parsed.title,
        slug: parsed.slug,
        excerpt: parsed.excerpt,
        content: parsed.content,
        published: parsed.published,
        published_at: parsed.published ? now : null,
      },
    };
  }

  // UPDATE — preserve published_at (don't overwrite)
  // If existing.published_at is null and now publishing, set it
  let published_at = existing.published_at;
  if (parsed.published && !existing.published_at) {
    published_at = now;
  }

  return {
    mode: "update",
    existingId: existing.id,
    data: {
      title: parsed.title,
      slug: parsed.slug,
      excerpt: parsed.excerpt,
      content: parsed.content,
      published: parsed.published,
      published_at,
    },
  };
}

// ─── Supabase REST API upsert ───

function isNewSupabaseApiKey(value) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function buildHeaders(accessToken, supabaseKey) {
  const headers = {
    "Content-Type": "application/json",
    apikey: supabaseKey,
    Authorization: `Bearer ${accessToken}`,
    Prefer: "return=representation",
  };
  return headers;
}

/**
 * Upsert a post to Supabase by slug.
 *
 * 1. Query existing post by slug
 * 2. If not found → INSERT
 * 3. If found → UPDATE (preserve published_at)
 *
 * @param {object} parsed - Output of parseArticleFile
 * @param {{ access_token: string, user: { id: string } }} auth - Auth result
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} supabaseKey - Supabase publishable/anon key
 * @returns {Promise<{ id: string, slug: string, mode: "insert"|"update" }>}
 */
export async function upsertPost(parsed, auth, supabaseUrl, supabaseKey) {
  const headers = buildHeaders(auth.access_token, supabaseKey);

  // 1. Query existing post by slug
  const queryUrl = `${supabaseUrl}/rest/v1/posts?slug=eq.${encodeURIComponent(parsed.slug)}&select=id,published,published_at`;
  const queryResp = await fetch(queryUrl, { headers });
  const queryData = await queryResp.json();

  if (!queryResp.ok) {
    const msg = queryData?.message || `HTTP ${queryResp.status}`;
    throw new Error(`Supabase query failed: ${msg}`);
  }

  const existing = Array.isArray(queryData) && queryData.length > 0 ? queryData[0] : null;

  // 2. Build payload
  const payload = buildPostPayload(parsed, auth.user.id, existing);

  // 3. Execute insert or update
  let resp;
  if (payload.mode === "insert") {
    resp = await fetch(`${supabaseUrl}/rest/v1/posts`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload.data),
    });
  } else {
    resp = await fetch(`${supabaseUrl}/rest/v1/posts?id=eq.${payload.existingId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload.data),
    });
  }

  const data = await resp.json();

  if (!resp.ok) {
    const msg = data?.message || `HTTP ${resp.status}`;
    throw new Error(`Supabase ${payload.mode} failed: ${msg}`);
  }

  // Return representation (array from REST API)
  const row = Array.isArray(data) ? data[0] : data;
  return {
    id: row.id,
    slug: row.slug,
    mode: payload.mode,
  };
}

// ─── RAG Reindex Trigger (Scenario #2) ───

/**
 * Trigger RAG reindex after successful article publish.
 *
 * Non-blocking: if index.mjs fails, the publish still succeeds.
 * Spec: docs/archive/spec-rag.md §4.6
 *
 * @param {string} projectRoot — Absolute path to project root
 * @param {Function} [execFn=execSync] — Exec function (injectable for testing)
 */
export function triggerRagReindex(projectRoot, execFn = execSync) {
  console.log("  📚 Triggering RAG reindex...");
  try {
    execFn("node scripts/rag/index.mjs", {
      stdio: "inherit",
      cwd: projectRoot,
    });
    console.log("  ✅ RAG reindex complete");
  } catch (err) {
    console.warn("  ⚠️  RAG reindex failed (non-blocking):", err.message);
    console.warn("     Run manually: node scripts/rag/index.mjs");
  }
}
