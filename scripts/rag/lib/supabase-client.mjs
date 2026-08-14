/**
 * Supabase Client — RAG database operations.
 *
 * Reuses loginAdmin() from scripts/article/lib/supabase-auth.mjs (Q6).
 * All functions accept a `client` parameter for testability.
 *
 * Spec: docs/archive/spec-rag.md §4.2 (step 7 upsert, step 8 orphan cleanup)
 * Q6: Reuse loginAdmin, no service_role key. RLS stays in effect.
 * Q18: UPSERT via UNIQUE(content_type, source_id, chunk_index)
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { loginAdmin, loadDotEnvFiles, getEnvVar } from "../../article/lib/supabase-auth.mjs";

export const UPSERT_BATCH_SIZE = 100;

// ─── Incremental indexing: hash-based change detection ───

/**
 * Compute SHA-256 hash of a chunk's text.
 * Used to detect whether a chunk has changed since last indexing.
 *
 * @param {string} text - Chunk text
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function computeChunkHash(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Fetch existing chunk hashes from the database for incremental indexing.
 *
 * Queries content_embeddings for all rows matching the given source IDs,
 * returning a Map keyed by `${content_type}:${source_id}:${chunk_index}` → hash.
 *
 * @param {Object} client - Supabase client
 * @param {string[]} sourceIds - Source IDs to fetch hashes for
 * @returns {Promise<Map<string, string>>} Map of "type:source:idx" → chunk_hash
 */
export async function fetchExistingHashes(client, sourceIds) {
  const hashMap = new Map();

  if (!sourceIds || sourceIds.length === 0) return hashMap;

  // Query in batches to avoid URL length limits
  const BATCH = 200;
  for (let i = 0; i < sourceIds.length; i += BATCH) {
    const batch = sourceIds.slice(i, i + BATCH);
    const { data, error } = await client
      .from("content_embeddings")
      .select("content_type,source_id,chunk_index,chunk_hash")
      .in("source_id", batch);

    if (error) {
      console.warn(`  ⚠️  Hash fetch error: ${error.message}`);
      return hashMap; // Graceful: treat as all-changed
    }

    if (data) {
      for (const row of data) {
        const key = `${row.content_type}:${row.source_id}:${row.chunk_index}`;
        hashMap.set(key, row.chunk_hash);
      }
    }
  }

  return hashMap;
}

/**
 * Create an authenticated Supabase client for RAG operations.
 * Uses loginAdmin() to get an admin access token (Q6).
 *
 * @returns {Promise<{client: Object, auth: Object}>} Supabase client + auth info
 * @throws {Error} If login fails or env vars missing
 */
export async function createRagClient() {
  const auth = await loginAdmin();
  const dotenv = loadDotEnvFiles();
  const supabaseUrl = getEnvVar("SUPABASE_URL", dotenv);
  const supabaseKey = getEnvVar("SUPABASE_PUBLISHABLE_KEY", dotenv);

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. Check .env file.");
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${auth.access_token}`,
      },
    },
  });

  return { client, auth };
}

/**
 * UPSERT chunks to content_embeddings table.
 * Q18: Idempotent via UNIQUE(content_type, source_id, chunk_index).
 * Batches to avoid request size limits.
 *
 * @param {Object} client - Supabase client
 * @param {Array} chunks - Array of chunk objects with embedding
 * @throws {Error} On upsert failure
 */
export async function upsertChunks(client, chunks) {
  if (!chunks || chunks.length === 0) return;

  for (let i = 0; i < chunks.length; i += UPSERT_BATCH_SIZE) {
    const batch = chunks.slice(i, i + UPSERT_BATCH_SIZE);

    const { error } = await client.from("content_embeddings").upsert(batch, {
      onConflict: "content_type,source_id,chunk_index",
    });

    if (error) {
      throw new Error(
        `Upsert failed (batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}): ${error.message}`,
      );
    }
  }
}

/**
 * Delete embeddings whose source_id is no longer in the current set.
 * Q9, Q18: Orphan cleanup runs once at end of full rebuild.
 *
 * @param {Object} client - Supabase client
 * @param {string[]} currentSourceIds - Source IDs that still exist
 * @throws {Error} On delete failure
 */
export async function cleanupOrphans(client, currentSourceIds) {
  let query = client.from("content_embeddings").delete();

  if (currentSourceIds.length > 0) {
    // Delete where source_id NOT IN (current set)
    // PostgREST: .not("column", "in", "(val1,val2,...)")
    const idsList = currentSourceIds.join(",");
    query = query.not("source_id", "in", `(${idsList})`);
  }
  // If no current IDs, delete all (no filter applied)

  const { error } = await query;

  if (error) {
    throw new Error(`Orphan cleanup failed: ${error.message}`);
  }
}

/**
 * Query content via match_content RPC.
 * Q17: Empty topics → NULL (COALESCE handles in RPC).
 *
 * @param {Object} client - Supabase client
 * @param {number[]} embedding - Query embedding vector
 * @param {{type?: string, topics?: string[], threshold?: number, limit?: number}} [filters]
 * @returns {Promise<Array>} Query results
 * @throws {Error} On RPC failure
 */
export async function queryContent(client, embedding, filters = {}) {
  // Normalize topics: lowercase, empty array → null (Q17, Scenario #10)
  let filterTopics = null;
  if (filters.topics && Array.isArray(filters.topics) && filters.topics.length > 0) {
    filterTopics = filters.topics.map((t) => t.toLowerCase());
  }

  const { data, error } = await client.rpc("match_content", {
    query_embedding: embedding,
    filter_content_type: filters.type || null,
    filter_topics: filterTopics,
    match_threshold: filters.threshold ?? 0.3,
    match_count: filters.limit ?? 10,
  });

  if (error) {
    throw new Error(`match_content RPC failed: ${error.message}`);
  }

  return data || [];
}
