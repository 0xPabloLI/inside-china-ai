/**
 * Direct Bigsong API client — replaces the mcp-search-bridge MCP hop (#90).
 *
 * The pipeline used to call Bigsong-backed search (`grok-chat-fast` for X,
 * `dots-chat` for xhs) through an MCP server: spawn + JSON-RPC handshake +
 * tools/call, all wrapping a single HTTP POST. This module makes that POST
 * directly. Same upstream (`key.bigsong`), same system prompt, same env vars
 * (SEARCH_BASE_URL, SEARCH_API_KEY, SEARCH_MODEL) — minus the subprocess.
 *
 * When NOT to use this: if Bigsong adds toolcall support, MCP's tools/call
 * dispatch becomes useful again — keep mcp-client.mjs for that future.
 */

const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Sent as the system message on every call. The "say you found nothing rather
 * than invent" clause is load-bearing: a model that believes it should have
 * search results will manufacture them, complete with plausible-looking URLs.
 */
const DEFAULT_SYSTEM_PROMPT = [
  "You can search the web. Answer from live search results, not from memory.",
  "Cite source links for the key facts.",
  "If you cannot find or confirm something, say so plainly.",
  "Never invent numbers, links, quotes, or citations.",
].join("\n");

/** Names of the required settings that are missing, for a precise error. */
function missingConfig(cfg) {
  const missing = [];
  if (!cfg.baseUrl) missing.push("SEARCH_BASE_URL");
  if (!cfg.apiKey) missing.push("SEARCH_API_KEY");
  if (!cfg.model) missing.push("SEARCH_MODEL");
  return missing;
}

async function chat(query, opts = {}) {
  const cfg = {
    baseUrl: (process.env.SEARCH_BASE_URL || "").replace(/\/$/, ""),
    apiKey: process.env.SEARCH_API_KEY || "",
    model: process.env.SEARCH_MODEL || "",
  };
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = opts.model ?? cfg.model;
  const systemPrompt =
    opts.systemPrompt ?? process.env.SEARCH_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;

  const missing = missingConfig(cfg);
  if (missing.length > 0) {
    return {
      success: false,
      error: `missing required environment variable(s): ${missing.join(", ")}`,
    };
  }

  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const raw = await resp.text();
    if (!resp.ok) {
      return { success: false, error: `upstream HTTP ${resp.status}: ${raw.slice(0, 500)}` };
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { success: false, error: `upstream did not return JSON: ${raw.slice(0, 500)}` };
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return { success: false, error: `no content in upstream response: ${raw.slice(0, 500)}` };
    }
    return { success: true, data: content };
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { success: false, error: `search timed out after ${timeoutMs}ms` };
    }
    return { success: false, error: err.message };
  }
}

/** Search X/Twitter via the Bigsong endpoint (model from SEARCH_MODEL). */
export function searchX(keyword, opts = {}) {
  return chat(keyword, opts);
}

/** Search 小红书 via the Bigsong endpoint (dots-chat model unless overridden). */
export function searchXhs(keyword, opts = {}) {
  return chat(keyword, { model: "dots-chat", ...opts });
}
