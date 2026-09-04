/**
 * Search Pool MCP server (#65 / #109) — stdio JSON-RPC exposing the general
 * search pool as a single `web_search` tool for agent hosts (web-access skill
 * HOST_SEARCH_TOOL). Replaces the stale `brave-search:brave_web_search`
 * pointer, which no host ever registered.
 *
 * Engine chain: lib/search-pool.mjs (Brave > Tavily > Jina REST engines) with
 * the self-hosted mcp-search-bridge (Grok, unlimited) as the last resort —
 * the issue #65 pool design's 4th member. Credentials come from repo-root
 * .env.local (loaded here, because MCP hosts spawn this server with a bare
 * environment). Registration snippet: skills/web-access/templates/config.env.template
 *
 * Hand-rolled JSON-RPC (no SDK) — same style as lib/mcp-client.mjs, which
 * implements the client side of the same protocol.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { searchPool } from "./search-pool.mjs";
import { ALL_SOURCES } from "./source-registry.mjs";
import { callMcpTool, parseMcpResult } from "./mcp-client.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const TOOL_NAME = "web_search";

/** Load repo-root .env.local once at startup (host spawns us without it). */
function loadDotEnv() {
  try {
    const envContent = readFileSync(join(__dirname, "..", "..", "..", ".env.local"), "utf8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^(\w+)=(.+)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch {
    // No .env.local — engines will report missing keys per engine.
  }
}

/**
 * Grok last resort: spawn the self-hosted mcp-search-bridge (unlimited quota)
 * using the registry's mcp_grok_search fallback config. Returns articles or [].
 */
async function grokSearchDefault(query) {
  const source = ALL_SOURCES.find((s) => s.name === "mcp_grok_search");
  const fb = source?.capabilities?.articles?.mcpFallback ?? source?.mcpFallback;
  if (!fb) return [];

  const result = await callMcpTool({
    command: fb.command,
    args: fb.args,
    toolName: fb.toolName,
    toolArgs: fb.toolArgs(query),
    timeoutMs: fb.timeoutMs || 60000,
  });
  if (!result.success) return [];
  return fb.resultMapper(parseMcpResult(result.data)) || [];
}

function toolDefinition() {
  return {
    name: TOOL_NAME,
    description:
      "General web search across Brave, Tavily and Jina (round-robin fallback), " +
      "with self-hosted Grok as last resort. Returns structured {title, url, snippet} results.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword or question" },
      },
      required: ["query"],
    },
  };
}

async function toolCall(arguments_, deps) {
  const query = arguments_?.query;
  if (typeof query !== "string" || query.trim() === "") {
    return {
      isError: true,
      content: [{ type: "text", text: "error: query (string) is required" }],
    };
  }

  let pool;
  try {
    pool = await deps.searchPool(query.trim());
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: `pool error: ${err.message}` }] };
  }

  if (pool.articles.length > 0) {
    return {
      content: [
        { type: "text", text: JSON.stringify({ engine: pool.engine, articles: pool.articles }) },
      ],
    };
  }

  let grokArticles = [];
  try {
    grokArticles = await deps.grokSearch(query.trim());
  } catch {
    grokArticles = [];
  }
  if (grokArticles.length > 0) {
    return {
      content: [{ type: "text", text: JSON.stringify({ engine: "grok", articles: grokArticles }) }],
    };
  }

  const attempted = pool.attempts.map((a) => `${a.engine}: ${a.error}`).join("; ");
  return {
    isError: true,
    content: [{ type: "text", text: `no results from any pool engine or Grok (${attempted})` }],
  };
}

/**
 * Handle one JSON-RPC message. Returns the response object, or null for
 * notifications/requests that need no reply. deps is a test seam.
 */
export function handleMessage(msg, deps) {
  const d = deps ?? {
    searchPool: (q) => searchPool(q),
    grokSearch: grokSearchDefault,
  };

  if (!msg || typeof msg !== "object") return null;

  if (msg.method === "initialize") {
    return {
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "search-pool", version: "1.0.0" },
      },
    };
  }

  if (msg.method === "tools/list") {
    return { id: msg.id, result: { tools: [toolDefinition()] } };
  }

  if (msg.method === "tools/call") {
    // Async handled by the caller awaiting the returned promise.
    return handleMessageAsync(msg, d);
  }

  return null;
}

async function handleMessageAsync(msg, d) {
  const params = msg.params ?? {};
  if (params.name !== TOOL_NAME) {
    return {
      id: msg.id,
      result: { isError: true, content: [{ type: "text", text: `unknown tool: ${params.name}` }] },
    };
  }
  const result = await toolCall(params.arguments ?? {}, d);
  return { id: msg.id, result };
}

/** Stdio loop: line-delimited JSON-RPC in, responses out. */
async function main() {
  loadDotEnv();

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    let idx;
    while ((idx = Buffer.concat(chunks).indexOf(0x0a)) >= 0) {
      const buffer = Buffer.concat(chunks);
      const line = buffer.subarray(0, idx).toString("utf8").trim();
      const rest = buffer.subarray(idx + 1);
      chunks.length = 0;
      chunks.push(rest);
      if (line === "") continue;

      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // Not JSON — ignore the frame
      }

      try {
        const resp = await handleMessage(msg);
        if (resp) process.stdout.write(JSON.stringify(resp) + "\n");
      } catch (err) {
        if (msg.id !== undefined) {
          process.stdout.write(
            JSON.stringify({
              id: msg.id,
              result: {
                isError: true,
                content: [{ type: "text", text: `server error: ${err.message}` }],
              },
            }) + "\n",
          );
        }
      }
    }
  }
}

const isMainModule = process.argv[1] && process.argv[1].endsWith("search-pool-server.mjs");
if (isMainModule) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  });
}
