/**
 * Supabase Client — RAG database operations.
 *
 * Reuses loginAdmin() from scripts/article/lib/supabase-auth.mjs (Q6).
 * All functions accept a `client` parameter for testability.
 *
 * Spec: docs/spec-rag.md §4.2 (step 7 upsert, step 8 orphan cleanup)
 * Q6: Reuse loginAdmin, no service_role key. RLS stays in effect.
 * Q18: UPSERT via UNIQUE(content_type, source_id, chunk_index)
 */

import { createClient } from "@supabase/supabase-js";
import { loginAdmin, loadDotEnvFiles, getEnvVar } from "../../article/lib/supabase-auth.mjs";

export const UPSERT_BATCH_SIZE = 100;

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
    // PostgREST filter: source_id=notin.(id1,id2,...)
    const idsList = currentSourceIds.join(",");
    query = query.filter("source_id", "notin", `(${idsList})`);
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
    match_threshold: filters.threshold ?? 0.7,
    match_count: filters.limit ?? 10,
  });

  if (error) {
    throw new Error(`match_content RPC failed: ${error.message}`);
  }

  return data || [];
}
