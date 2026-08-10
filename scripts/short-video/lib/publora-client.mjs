/**
 * Publora REST API client.
 *
 * Shared module for all Publora API interactions:
 * - API key resolution (env var → MCP config fallback)
 * - POST/PUT requests with error handling
 * - S3 presigned URL upload
 * - Platform connection ID lookup
 *
 * Used by: publish-tiktok.mjs, fetch-tiktok-analytics.mjs, future publish-*.mjs
 */

import { readFileSync, existsSync } from "fs";
import { readFile } from "fs/promises";

const PUB_BASE_URL = "https://api.publora.com/api/v1";

/**
 * Resolve the Publora API key.
 *
 * Priority:
 *   1. PUBLORA_API_KEY env var
 *   2. CatPaw MCP settings file (two candidate paths)
 *
 * @returns {Promise<string>} The API key.
 * @throws {Error} If no key is found in env or MCP config.
 */
export async function getApiKey() {
  // 1. Env var
  if (process.env.PUBLORA_API_KEY) {
    return process.env.PUBLORA_API_KEY;
  }

  // 2. CatPaw MCP settings fallback
  const home = process.env.HOME || process.env.USERPROFILE;
  const mcpSettingsPaths = [
    `${home}/Library/Application Support/CatPawAI/User/globalStorage/mt-idekit.mt-idekit-code/settings/mcopilot_mcp_settings.json`,
    `${home}/.cursor/skills/web-access/mcp_settings.json`, // legacy
  ];

  for (const p of mcpSettingsPaths) {
    try {
      if (existsSync(p)) {
        const raw = await readFile(p, "utf8");
        const config = JSON.parse(raw);
        const authHeader = config?.mcpServers?.publora?.headers?.Authorization;
        if (authHeader?.startsWith("Bearer ")) {
          return authHeader.slice(7);
        }
      }
    } catch {
      // try next path
    }
  }

  throw new Error(
    "PUBLORA_API_KEY not found.\n   Set it: export PUBLORA_API_KEY=sk_...\n   Or configure Publora MCP in CatPaw settings.",
  );
}

/**
 * Send a POST request to the Publora API.
 *
 * @param {string} path - API path (e.g. "/create-post")
 * @param {object} body - JSON body
 * @param {string} [apiKey] - API key (auto-resolved if omitted)
 * @returns {Promise<object>} Parsed JSON response
 * @throws {Error} If the response is not OK
 */
export async function publoraPost(path, body, apiKey) {
  const key = apiKey || (await getApiKey());
  const resp = await fetch(`${PUB_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "x-publora-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Publora POST ${path} failed: HTTP ${resp.status} — ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Send a PUT request to the Publora API.
 *
 * @param {string} path - API path (e.g. "/update-post/pg_123")
 * @param {object} body - JSON body
 * @param {string} [apiKey] - API key (auto-resolved if omitted)
 * @returns {Promise<object>} Parsed JSON response
 * @throws {Error} If the response is not OK
 */
export async function publoraPut(path, body, apiKey) {
  const key = apiKey || (await getApiKey());
  const resp = await fetch(`${PUB_BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      "x-publora-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Publora PUT ${path} failed: HTTP ${resp.status} — ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Send a GET request to the Publora API.
 *
 * @param {string} path - API path (e.g. "/get-post/pg_123")
 * @param {string} [apiKey] - API key (auto-resolved if omitted)
 * @returns {Promise<object>} Parsed JSON response
 * @throws {Error} If the response is not OK
 */
export async function publoraGet(path, apiKey) {
  const key = apiKey || (await getApiKey());
  const resp = await fetch(`${PUB_BASE_URL}${path}`, {
    headers: { "x-publora-key": key },
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Publora GET ${path} failed: HTTP ${resp.status} — ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Upload a file to an S3 presigned URL.
 *
 * @param {string} uploadUrl - Presigned S3 URL
 * @param {string} filePath - Local file path
 * @param {string} contentType - MIME type (e.g. "video/mp4")
 * @throws {Error} If the upload fails
 */
export async function uploadToS3(uploadUrl, filePath, contentType) {
  const buffer = readFileSync(filePath);
  const resp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`S3 upload failed: HTTP ${resp.status} — ${text.slice(0, 300)}`);
  }
}

/**
 * Get the platform connection ID for a given platform prefix.
 *
 * @param {string} platformPrefix - e.g. "tiktok-", "youtube-"
 * @param {string} [apiKey] - API key (auto-resolved if omitted)
 * @returns {Promise<string>} The platformId (e.g. "tiktok-xyz123")
 * @throws {Error} If no matching connection is found
 */
export async function getPlatformId(platformPrefix, apiKey) {
  const key = apiKey || (await getApiKey());
  const resp = await fetch(`${PUB_BASE_URL}/platform-connections`, {
    headers: { "x-publora-key": key },
  });
  const data = await resp.json();
  const conn = data.connections?.find((c) => c.platformId?.startsWith(platformPrefix));
  if (!conn) {
    throw new Error(
      `No ${platformPrefix} connection found in Publora. Run list_connections first.`,
    );
  }
  if (conn.tokenStatus !== "valid") {
    console.warn(`⚠️  ${platformPrefix} token status: ${conn.tokenStatus}`);
  }
  return conn.platformId;
}
