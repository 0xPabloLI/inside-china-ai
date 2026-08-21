/**
 * Lightweight MCP (Model Context Protocol) stdio client.
 *
 * Spawns an MCP server as a child process, performs JSON-RPC 2.0 handshake
 * (initialize → tools/call), and returns the result.
 *
 * Designed for use as a fallback when CDP-based scraping fails.
 *
 * Protocol reference: https://spec.modelcontextprotocol.io/
 */

import { spawn } from "child_process";

const DEFAULT_TIMEOUT_MS = 30000;
const INIT_TIMEOUT_MS = 10000;

/**
 * Call an MCP server tool via stdio JSON-RPC 2.0.
 *
 * @param {Object} options
 * @param {string} options.command - Spawn command (e.g., "python", "uvx")
 * @param {string[]} options.args - Spawn args (e.g., ["-m", "xiaohongshu_mcp_server"])
 * @param {string} options.toolName - MCP tool name to call (e.g., "search_feeds")
 * @param {Object} options.toolArgs - Arguments to pass to the tool
 * @param {number} [options.timeoutMs=30000] - Overall timeout
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function callMcpTool({
  command,
  args,
  toolName,
  toolArgs,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let child;
  let timeoutHandle;
  let initTimeoutHandle;
  let buffer = "";

  const pendingRequests = new Map();
  let nextId = 1;

  return new Promise((resolve) => {
    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (initTimeoutHandle) clearTimeout(initTimeoutHandle);
      if (child && child.pid) {
        try {
          child.kill();
        } catch {
          // Already dead
        }
      }
    };

    const fail = (error) => {
      cleanup();
      resolve({ success: false, error });
    };

    const succeed = (data) => {
      cleanup();
      resolve({ success: true, data });
    };

    // Overall timeout
    timeoutHandle = setTimeout(() => {
      fail(`MCP call timeout after ${timeoutMs}ms`);
    }, timeoutMs);

    try {
      child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });
    } catch (e) {
      fail(`Failed to spawn MCP server: ${e.message}`);
      return;
    }

    child.on("error", (err) => {
      fail(`MCP server error: ${err.message}`);
    });

    child.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        // Only fail if we haven't resolved yet
        for (const [, reject] of pendingRequests.values()) {
          reject(`MCP server exited with code ${code}`);
        }
      }
    });

    child.stderr.on("data", (data) => {
      // Log stderr but don't fail — MCP servers log debug info to stderr
    });

    child.stdout.on("data", (data) => {
      buffer += data.toString();
      // Process complete JSON-RPC messages (newline-delimited)
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.substring(0, newlineIdx).trim();
        buffer = buffer.substring(newlineIdx + 1);

        if (!line) continue;

        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue; // Not valid JSON, skip
        }

        if (msg.id !== undefined && pendingRequests.has(msg.id)) {
          const [resolveReq, rejectReq] = pendingRequests.get(msg.id);
          pendingRequests.delete(msg.id);

          if (msg.error) {
            rejectReq(msg.error.message || JSON.stringify(msg.error));
          } else {
            resolveReq(msg.result);
          }
        }
      }
    });

    // Helper: send JSON-RPC request
    const sendRequest = (method, params) => {
      const id = nextId++;
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      return new Promise((resolveReq, rejectReq) => {
        pendingRequests.set(id, [resolveReq, rejectReq]);
        try {
          child.stdin.write(msg);
        } catch (e) {
          pendingRequests.delete(id);
          rejectReq(`Failed to write to stdin: ${e.message}`);
        }
      });
    };

    // Step 1: initialize
    initTimeoutHandle = setTimeout(() => {
      fail("MCP initialize timeout");
    }, INIT_TIMEOUT_MS);

    sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "search-sources", version: "1.0.0" },
    })
      .then(() => {
        if (initTimeoutHandle) clearTimeout(initTimeoutHandle);

        // Step 2: send initialized notification (no response expected)
        try {
          const notif =
            JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/initialized",
            }) + "\n";
          child.stdin.write(notif);
        } catch {
          // Best effort
        }

        // Step 3: tools/call
        return sendRequest("tools/call", {
          name: toolName,
          arguments: toolArgs,
        });
      })
      .then((result) => {
        succeed(result);
      })
      .catch((err) => {
        fail(err);
      });
  });
}

/**
 * Parse MCP tool call result into a normalized format.
 *
 * MCP tools return { content: [{ type: "text", text: "..." }] }
 * This function extracts the text content and tries to parse it as JSON.
 * If the text is not JSON (e.g. natural-language search results from
 * mcp-search-bridge), it returns a single-element array containing
 * { text: rawText } so that the source's resultMapper can handle it.
 *
 * @param {Object} mcpResult - Raw result from callMcpTool
 * @returns {Array} Array of parsed items, or empty array if not parseable
 */
export function parseMcpResult(mcpResult) {
  if (!mcpResult || !mcpResult.content) {
    return [];
  }

  for (const item of mcpResult.content) {
    if (item.type === "text" && item.text) {
      try {
        const parsed = JSON.parse(item.text);
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === "object" && parsed !== null) {
          // Some MCP servers return { data: [...] } or { results: [...] }
          if (Array.isArray(parsed.data)) return parsed.data;
          if (Array.isArray(parsed.results)) return parsed.results;
          if (Array.isArray(parsed.items)) return parsed.items;
          // Single object — wrap in array
          return [parsed];
        }
      } catch {
        // Not JSON — return as text payload for resultMapper to handle
        return [{ text: item.text }];
      }
    }
  }

  return [];
}
