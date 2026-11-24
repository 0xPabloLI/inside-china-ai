/**
 * Caption push notification (#1530).
 *
 * Once verify-video passes, the publish package holds everything the user needs
 * to post a video: the caption (hashtags included), the metadata, the pinned
 * comment. Copying that text out of the chat only works when a human is in the
 * chat at that moment; an unattended run strands it on disk. This module pushes
 * it over IM instead.
 *
 * Channel: Feishu custom-bot webhook. It is the only option that needs no
 * tenant-review, no app credentials and no OAuth: one group, one URL, one
 * HTTPS POST. WeCom's "消息推送" is internal-group only and cannot reach WeChat;
 * personal WeChat has no official push API at all.
 *
 * Contract (enforced by the callers, see notify-caption.mjs and
 * verify-video.mjs):
 * - A failed send never changes a run's PASS/FAIL verdict. NOTIFY_REQUIRED=1
 *   is the only switch that turns it into an error.
 * - Idempotent per runId+platform: publish/notify-log.jsonl is the ledger, so
 *   a re-run of verify does not re-notify.
 * - The caption is forwarded verbatim. Long text is chunked, never truncated.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createHmac } from "node:crypto";
import { dirname } from "node:path";

/** Feishu rejects request bodies larger than 20 KB (custom-bot guide). */
export const FEISHU_MAX_BODY_BYTES = 20 * 1024;
/** Leaves room for JSON envelope + sign fields inside the 20 KB body limit. */
export const DEFAULT_CHUNK_BYTES = 6 * 1024;
/** Per-attempt HTTP timeout; 3 attempts stay inside the 10 s budget. */
export const DEFAULT_TIMEOUT_MS = 2500;

/**
 * Resolve the notification channel from env. Empty webhook = no channel: the
 * pipeline keeps working, and the CLI explains how to finish the setup.
 */
export function resolveNotifyConfig(env = process.env) {
  const webhook = String(env.FEISHU_BOT_WEBHOOK ?? "").trim();
  const secret = String(env.FEISHU_BOT_SECRET ?? "").trim();
  return {
    channel: webhook ? "feishu" : "none",
    webhook,
    secret,
    required: env.NOTIFY_REQUIRED === "1",
  };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The message the user reads on the phone. Caption and hashtags are delimited
 * so a whole block can be copied without picking up the surrounding labels.
 */
export function buildCaptionText({
  slug,
  runId,
  platform,
  caption,
  hashtags = [],
  pinnedComment = "",
  videoPath = "",
  packageDir = "",
}) {
  const videoName = videoPath ? videoPath.split("/").pop() : "";
  let videoSize = "";
  if (videoPath && existsSync(videoPath)) {
    try {
      videoSize = formatBytes(statSync(videoPath).size);
    } catch {
      videoSize = "";
    }
  }

  const header = [
    `🎬 成片完成 · ${slug}`,
    [platform, videoName, videoSize].filter(Boolean).join(" · "),
    `run: ${runId}`,
  ]
    .filter(Boolean)
    .join("\n");

  const captionBody = String(caption ?? "").trim();
  const tagLine = (hashtags ?? []).filter(Boolean).join(" ");
  const pinned = String(pinnedComment ?? "").trim();

  const blocks = [header, "—— Caption（整段复制） ——", captionBody, "—— Hashtags ——", tagLine];

  if (pinned) blocks.push("—— 置顶评论（发布后手动发） ——", pinned);
  if (packageDir) blocks.push("—— 发布包 ——", packageDir);

  return blocks.filter((b) => b !== "").join("\n\n");
}

/**
 * Split text into chunks of at most `maxBytes` UTF-8 bytes, preferring to cut
 * after a newline. `chunks.join("") === text` by construction: nothing is
 * dropped or rewritten.
 */
export function chunkText(text, maxBytes = DEFAULT_CHUNK_BYTES) {
  const source = String(text ?? "");
  if (source === "") return [];
  if (!Number.isFinite(maxBytes) || maxBytes <= 0)
    throw new Error("chunkText: maxBytes must be positive");

  const chars = Array.from(source);
  const chunks = [];
  let start = 0;

  while (start < chars.length) {
    let bytes = 0;
    let index = start;
    let lastBreak = -1;
    while (index < chars.length) {
      const charBytes = Buffer.byteLength(chars[index], "utf8");
      if (bytes + charBytes > maxBytes) break;
      bytes += charBytes;
      index += 1;
      if (chars[index - 1] === "\n") lastBreak = index;
    }
    if (index === start) index = start + 1; // a single char wider than maxBytes
    // Everything left fits: take it all. Cutting at the last newline here would
    // strand the tail in a second chunk that adds nothing.
    const cut = index >= chars.length ? chars.length : lastBreak > start ? lastBreak : index;
    chunks.push(chars.slice(start, cut).join(""));
    start = cut;
  }

  return chunks;
}

/** Feishu custom-bot signature.
 *
 * The spec is easy to get backwards: the HMAC **key** is `${timestamp}\n${secret}`
 * and the **message** is empty — not `key=secret, msg=timestamp\nsecret`.
 * Verified against a live webhook on 2026-11-24 (the other reading returns
 * `code=19021 sign match fail`). `timestamp` is UNIX **seconds**.
 */
export function feishuSignature({ timestamp, secret }) {
  return createHmac("sha256", `${timestamp}\n${secret}`).digest("base64");
}

export function buildFeishuPayload({
  text,
  secret = "",
  timestamp = Math.floor(Date.now() / 1000),
}) {
  const payload = { msg_type: "text", content: { text } };
  if (secret) {
    payload.timestamp = String(timestamp);
    payload.sign = feishuSignature({ timestamp: String(timestamp), secret });
  }
  return payload;
}

/**
 * One HTTPS POST to the custom bot. Throws on any non-zero code so the retry
 * wrapper owns the policy.
 */
export async function sendFeishuText({
  text,
  webhook,
  secret = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!webhook) throw new Error("feishu: webhook is empty");
  if (typeof fetchImpl !== "function") throw new Error("feishu: fetch is unavailable");

  const body = JSON.stringify(buildFeishuPayload({ text, secret }));
  const bodyBytes = Buffer.byteLength(body, "utf8");
  if (bodyBytes > FEISHU_MAX_BODY_BYTES) {
    throw new Error(`feishu: payload ${bodyBytes} bytes exceeds ${FEISHU_MAX_BODY_BYTES} bytes`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
      signal: controller.signal,
    });
    const raw = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Non-JSON body: judge by HTTP status and surface the raw text below.
    }
    const code =
      parsed?.code ?? parsed?.StatusCode ?? parsed?.status_code ?? (response.ok ? 0 : -1);
    if (!response.ok || Number(code) !== 0) {
      const detail = parsed?.msg ?? parsed?.StatusMessage ?? String(raw).slice(0, 200);
      throw new Error(`feishu webhook rejected: HTTP ${response.status} code=${code} ${detail}`);
    }
    return { ok: true, code: 0, bytes: bodyBytes };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendWithRetry({
  send,
  attempts = 3,
  delaysMs = [400, 1200],
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  let lastError;
  let used = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    used = attempt;
    try {
      await send();
      return { ok: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delay = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
        await sleep(delay);
      }
    }
  }
  return { ok: false, attempts: used, error: lastError };
}

export function readNotifyLog(logPath) {
  if (!logPath || !existsSync(logPath)) return [];
  const lines = readFileSync(logPath, "utf8").split("\n");
  const entries = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // A torn last line (crash mid-append) must not poison the ledger.
    }
  }
  return entries;
}

export function hasSuccessfulSend(logPath, { runId, platform }) {
  return readNotifyLog(logPath).some(
    (entry) => entry?.ok === true && entry.runId === runId && entry.platform === platform,
  );
}

export function appendNotifyLog(logPath, entry) {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}

/**
 * Build → chunk → send → ledger. Returns a result object instead of throwing:
 * the caller decides whether a failure is a warning or an error.
 */
export async function notifyCaption({
  slug,
  runId,
  platform,
  caption,
  hashtags = [],
  pinnedComment = "",
  videoPath = "",
  packageDir = "",
  logPath,
  config = resolveNotifyConfig(),
  force = false,
  fetchImpl = globalThis.fetch,
  sleep,
}) {
  if (config.channel === "none") {
    return { ok: false, skipped: true, reason: "no-channel" };
  }
  if (!force && logPath && hasSuccessfulSend(logPath, { runId, platform })) {
    return { ok: true, skipped: true, reason: "duplicate", channel: config.channel };
  }

  const text = buildCaptionText({
    slug,
    runId,
    platform,
    caption,
    hashtags,
    pinnedComment,
    videoPath,
    packageDir,
  });
  const chunks = chunkText(text);
  let attempts = 0;

  for (const chunk of chunks) {
    const result = await sendWithRetry({
      send: () =>
        sendFeishuText({
          text: chunk,
          webhook: config.webhook,
          secret: config.secret,
          fetchImpl,
        }),
      sleep,
    });
    attempts += result.attempts;
    if (!result.ok) {
      const error = result.error?.message ?? String(result.error);
      if (logPath) {
        appendNotifyLog(logPath, {
          at: new Date().toISOString(),
          slug,
          runId,
          platform,
          channel: config.channel,
          ok: false,
          attempts,
          error,
        });
      }
      return { ok: false, channel: config.channel, attempts, error, chunks: chunks.length };
    }
  }

  if (logPath) {
    appendNotifyLog(logPath, {
      at: new Date().toISOString(),
      slug,
      runId,
      platform,
      channel: config.channel,
      ok: true,
      attempts,
      chunks: chunks.length,
      chars: text.length,
    });
  }

  return { ok: true, channel: config.channel, attempts, chunks: chunks.length, chars: text.length };
}
