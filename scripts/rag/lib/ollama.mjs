/**
 * Ollama Embedding Client — connects to local Ollama instance for bge-m3 embeddings.
 *
 * API:
 * - GET  /api/tags  → list available models (used for availability check)
 * - POST /api/embed → generate embeddings for input texts
 *
 * Spec: docs/spec-rag.md §4.2 (step 1 pre-check, step 6 embedding)
 * Scenario #1 (Ollama not running), #13 (dimension mismatch)
 */

export const OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_MODEL = "bge-m3";
export const EXPECTED_DIMS = 1024;

/**
 * Check if Ollama is running and responsive.
 * Scenario #1: if Ollama is not running, returns false.
 *
 * @returns {Promise<boolean>}
 */
export async function isOllamaAvailable() {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Verify that a model returns embeddings of the expected dimension.
 * Scenario #13: detect model swap (e.g., 768-dim model when 1024 expected).
 *
 * @param {string} model - Ollama model name
 * @param {number} expectedDims - Expected embedding dimensions (default: 1024)
 * @throws {Error} If dimensions don't match or embedding fails
 */
export async function verifyModelDimensions(model = DEFAULT_MODEL, expectedDims = EXPECTED_DIMS) {
  const result = await embed(["dimension check"], model);
  const vector = result[0];
  if (!vector) {
    throw new Error(`Model "${model}" returned no embedding — cannot verify dimensions`);
  }
  if (vector.length !== expectedDims) {
    throw new Error(
      `Model "${model}" returned ${vector.length}-dimension embeddings, ` +
        `expected ${expectedDims} dimensions. Run: ollama pull ${model}`,
    );
  }
}

/**
 * Generate embeddings for an array of texts.
 *
 * @param {string[]} texts - Array of text strings to embed
 * @param {string} [model=DEFAULT_MODEL] - Ollama model name
 * @returns {Promise<number[][]>} Array of embedding vectors (each 1024-dim for bge-m3)
 * @throws {Error} On connection error, invalid model, or response mismatch
 */
export async function embed(texts, model = DEFAULT_MODEL) {
  if (!texts || texts.length === 0) return [];

  let resp;
  try {
    resp = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
    });
  } catch (err) {
    throw new Error(
      `Ollama connection failed: ${err.message}. ` + `Is Ollama running? Start with: ollama serve`,
    );
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    const msg = body.error || body.message || `HTTP ${resp.status}`;
    throw new Error(
      `Ollama embed failed (${resp.status}): ${msg}. ` +
        `Model: ${model}. Run: ollama pull ${model}`,
    );
  }

  const data = await resp.json();

  if (!data.embeddings || !Array.isArray(data.embeddings)) {
    throw new Error(`Ollama returned no embeddings field. Model: ${model}`);
  }

  if (data.embeddings.length !== texts.length) {
    throw new Error(
      `Embedding count mismatch: expected ${texts.length}, got ${data.embeddings.length}`,
    );
  }

  return data.embeddings;
}
