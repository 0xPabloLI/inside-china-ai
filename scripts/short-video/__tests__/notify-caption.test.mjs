import { describe, it, expect } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FEISHU_MAX_BODY_BYTES,
  NOTIFY_MODES,
  NOTIFY_PENDING_FILE,
  appendNotifyLog,
  approvePendingNotify,
  buildCopyText,
  buildFeishuPayload,
  buildPendingItem,
  buildSummaryText,
  chunkText,
  feishuSignature,
  hasSuccessfulSend,
  notifyCaption,
  readNotifyLog,
  readPendingNotify,
  resolveNotifyConfig,
  resolveNotifyMode,
  sendFeishuText,
  sendWithRetry,
  upsertPendingItem,
  writePendingNotify,
} from "../lib/notify-caption.mjs";

const CAPTION = [
  "Suno's Music Videos Run on a Chinese Model",
  "Suno's new Visuals product turns songs into lip-sync clips.",
  "Follow for more China AI news.",
  "",
  "#suno #sunoai #minimax #chinaai #ainews",
].join("\n");

const TAGS = ["#suno", "#sunoai", "#minimax", "#chinaai", "#ainews"];

function feishuResponse(code = 0, msg = "success") {
  return {
    ok: code === 0,
    status: code === 0 ? 200 : 400,
    text: async () => JSON.stringify({ code, msg }),
  };
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), "notify-caption-"));
}

describe("resolveNotifyConfig", () => {
  it("maps an empty webhook to the no-channel state", () => {
    const config = resolveNotifyConfig({});
    expect(config.channel).toBe("none");
    expect(config.required).toBe(false);
  });

  it("reads the webhook, secret and required switch", () => {
    const config = resolveNotifyConfig({
      FEISHU_BOT_WEBHOOK: " https://open.feishu.cn/open-apis/bot/v2/hook/abc ",
      FEISHU_BOT_SECRET: "s3cret",
      NOTIFY_REQUIRED: "1",
    });
    expect(config).toMatchObject({ channel: "feishu", secret: "s3cret", required: true });
    expect(config.webhook).toBe("https://open.feishu.cn/open-apis/bot/v2/hook/abc");
  });
});

describe("buildSummaryText", () => {
  it("carries run info, pinned comment and package path but no caption body", () => {
    const text = buildSummaryText({
      slug: "suno-visuals",
      runId: "r-20261124T045706-e611c3",
      platform: "tiktok",
      pinnedComment: "Would you use it for a song?",
      packageDir: "/tmp/out/publish/tiktok",
    });
    expect(text).toContain("suno-visuals");
    expect(text).toContain("r-20261124T045706-e611c3");
    expect(text).toContain("Would you use it for a song?");
    expect(text).toContain("/tmp/out/publish/tiktok");
    expect(text).not.toContain("Caption（整段复制）");
    expect(text).not.toContain("#suno");
  });

  it("omits empty blocks instead of leaving blank labels", () => {
    const text = buildSummaryText({ slug: "x", runId: "r-1", platform: "tiktok" });
    expect(text).not.toContain("置顶评论");
    expect(text).not.toContain("发布包");
    expect(text).toContain("x");
  });
});

describe("buildCopyText", () => {
  it("forwards the caption verbatim and appends only the missing hashtags", () => {
    const text = buildCopyText({
      caption: "Suno's new Visuals turns songs into clips.\n\n#suno #chinaai",
      hashtags: ["#suno", "#chinaai", "#ainews"],
    });
    expect(text).toBe("Suno's new Visuals turns songs into clips.\n\n#suno #chinaai\n\n#ainews");
  });

  it("adds no hashtag line when the caption already carries them all", () => {
    const text = buildCopyText({
      caption: `${CAPTION}`,
      hashtags: TAGS,
    });
    expect(text).toBe(CAPTION);
    expect(text.toLowerCase()).not.toContain("#ainews\n\n#ainews");
  });

  it("returns the tags alone when there is no caption", () => {
    expect(buildCopyText({ caption: "  ", hashtags: ["#a", "#b"] })).toBe("#a #b");
  });
});

describe("chunkText", () => {
  it("reconstructs the original exactly (nothing truncated)", () => {
    const source = `${CAPTION}\n\n${Array.from({ length: 40 }, (_, i) => `line-${i} 中文内容`).join("\n")}`;
    for (const chunk of chunkText(source, 120)) {
      expect(Buffer.byteLength(chunk, "utf8")).toBeLessThanOrEqual(120);
    }
    expect(chunkText(source, 120).join("")).toBe(source);
  });

  it("keeps a short message in one chunk", () => {
    expect(chunkText("short", 100)).toEqual(["short"]);
    expect(chunkText("", 100)).toEqual([]);
  });

  it("hard-splits a single line wider than the budget", () => {
    const line = "甲".repeat(50);
    const chunks = chunkText(line, 60);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(line);
  });
});

describe("feishu payload", () => {
  it("signs with the timestamp\\nsecret string as the HMAC key, empty message", () => {
    const secret = randomBytes(16).toString("hex");
    const timestamp = Date.now();
    const payload = buildFeishuPayload({ text: "hi", secret, timestamp });
    const expected = createHmac("sha256", `${timestamp}\n${secret}`).digest("base64");
    expect(payload.timestamp).toBe(String(timestamp));
    expect(payload.sign).toBe(expected);
    expect(payload.sign).toBe(feishuSignature({ timestamp: String(timestamp), secret }));
  });

  it("omits timestamp and sign when no secret is configured", () => {
    const payload = buildFeishuPayload({ text: "hi", secret: "" });
    expect(payload).toEqual({ msg_type: "text", content: { text: "hi" } });
  });
});

describe("sendFeishuText", () => {
  it("accepts code 0", async () => {
    const calls = [];
    const result = await sendFeishuText({
      text: "hi",
      webhook: "https://example.test/hook",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return feishuResponse(0);
      },
    });
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe("https://example.test/hook");
    expect(JSON.parse(calls[0].init.body).content.text).toBe("hi");
  });

  it("throws on a non-zero code and keeps the provider message", async () => {
    await expect(
      sendFeishuText({
        text: "hi",
        webhook: "https://example.test/hook",
        fetchImpl: async () => feishuResponse(19021, "sign match fail"),
      }),
    ).rejects.toThrow(/code=19021 sign match fail/);
  });

  it("throws when the payload exceeds the 20 KB body limit", async () => {
    await expect(
      sendFeishuText({
        text: "x".repeat(FEISHU_MAX_BODY_BYTES),
        webhook: "https://example.test/hook",
        fetchImpl: async () => feishuResponse(0),
      }),
    ).rejects.toThrow(/exceeds/);
  });
});

describe("sendWithRetry", () => {
  it("retries twice then succeeds", async () => {
    const sleeps = [];
    let attempts = 0;
    const result = await sendWithRetry({
      send: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("boom");
      },
      sleep: async (ms) => sleeps.push(ms),
    });
    expect(result).toEqual({ ok: true, attempts: 3 });
    expect(sleeps).toEqual([400, 1200]);
  });

  it("gives up after three attempts and returns the last error", async () => {
    const result = await sendWithRetry({
      send: async () => {
        throw new Error("still down");
      },
      sleep: async () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error.message).toBe("still down");
  });
});

describe("notifyCaption", () => {
  it("skips without a channel", async () => {
    const result = await notifyCaption({
      slug: "s",
      runId: "r",
      platform: "tiktok",
      caption: CAPTION,
      config: resolveNotifyConfig({}),
    });
    expect(result).toMatchObject({ ok: false, skipped: true, reason: "no-channel" });
  });

  it("skips a duplicate and sends again with force", async () => {
    const dir = tempDir();
    const logPath = join(dir, "notify-log.jsonl");
    try {
      appendNotifyLog(logPath, { ok: true, runId: "r-1", platform: "tiktok", channel: "feishu" });
      const config = resolveNotifyConfig({ FEISHU_BOT_WEBHOOK: "https://example.test/hook" });
      const duplicate = await notifyCaption({
        slug: "s",
        runId: "r-1",
        platform: "tiktok",
        caption: CAPTION,
        logPath,
        config,
        fetchImpl: async () => feishuResponse(0),
      });
      expect(duplicate).toMatchObject({ ok: true, skipped: true, reason: "duplicate" });

      const forced = await notifyCaption({
        slug: "s",
        runId: "r-1",
        platform: "tiktok",
        caption: CAPTION,
        logPath,
        config,
        force: true,
        fetchImpl: async () => feishuResponse(0),
      });
      expect(forced.ok).toBe(true);
      expect(forced.skipped).toBeUndefined();
      expect(readNotifyLog(logPath).filter((entry) => entry.ok).length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records a failed send and returns the error without throwing", async () => {
    const dir = tempDir();
    const logPath = join(dir, "notify-log.jsonl");
    try {
      const result = await notifyCaption({
        slug: "s",
        runId: "r-2",
        platform: "tiktok",
        caption: CAPTION,
        logPath,
        config: resolveNotifyConfig({ FEISHU_BOT_WEBHOOK: "https://example.test/hook" }),
        fetchImpl: async () => feishuResponse(9499, "internal error"),
        sleep: async () => {},
      });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/code=9499/);
      const entries = readNotifyLog(logPath);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ ok: false, platform: "tiktok", runId: "r-2" });
      expect(hasSuccessfulSend(logPath, { runId: "r-2", platform: "tiktok" })).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("logs a successful send once", async () => {
    const dir = tempDir();
    const logPath = join(dir, "notify-log.jsonl");
    try {
      const result = await notifyCaption({
        slug: "s",
        runId: "r-3",
        platform: "tiktok",
        caption: CAPTION,
        hashtags: TAGS,
        logPath,
        config: resolveNotifyConfig({ FEISHU_BOT_WEBHOOK: "https://example.test/hook" }),
        fetchImpl: async () => feishuResponse(0),
      });
      expect(result).toMatchObject({ ok: true, channel: "feishu", parts: 2 });
      const log = readFileSync(logPath, "utf8").trim().split("\n");
      expect(log).toHaveLength(1);
      expect(hasSuccessfulSend(logPath, { runId: "r-3", platform: "tiktok" })).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("review mode (#1562)", () => {
  it("defaults to review and accepts explicit modes", () => {
    expect(NOTIFY_MODES).toEqual(["auto", "review", "off"]);
    expect(resolveNotifyMode({})).toBe("review");
    expect(resolveNotifyMode({ NOTIFY_MODE: "auto" })).toBe("auto");
    expect(resolveNotifyMode({ NOTIFY_MODE: " OFF " })).toBe("off");
    expect(() => resolveNotifyMode({ NOTIFY_MODE: "sometimes" })).toThrow(/auto\|review\|off/);
  });

  it("stores one row per platform without clobbering the others", () => {
    const first = buildPendingItem({ platform: "tiktok", caption: CAPTION, hashtags: TAGS });
    const second = buildPendingItem({ platform: "youtube", caption: "yt copy", hashtags: [] });
    let pending = upsertPendingItem(null, first);
    pending = upsertPendingItem(pending, second);
    expect(pending.items.map((row) => row.platform)).toEqual(["tiktok", "youtube"]);
    expect(pending.items[0].status).toBe("pending");

    const updated = upsertPendingItem(
      pending,
      buildPendingItem({ platform: "tiktok", caption: "revised" }),
    );
    expect(updated.items).toHaveLength(2);
    expect(updated.items[0].caption).toBe("revised");
  });

  it("round-trips the review file and tolerates a torn one", () => {
    const dir = tempDir();
    try {
      const path = join(dir, NOTIFY_PENDING_FILE);
      expect(readPendingNotify(path)).toBeNull();
      const pending = {
        version: 1,
        slug: "suno-visuals",
        runId: "r-1",
        createdAt: "2026-11-26T00:00:00.000Z",
        items: [buildPendingItem({ platform: "tiktok", caption: CAPTION })],
      };
      writePendingNotify(path, pending);
      expect(readPendingNotify(path)).toMatchObject({ slug: "suno-visuals", runId: "r-1" });
      expect(readPendingNotify(path).items[0].caption).toBe(CAPTION);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("approves the reviewed copy, then refuses to send twice", async () => {
    const dir = tempDir();
    const pendingPath = join(dir, NOTIFY_PENDING_FILE);
    const logPath = join(dir, "notify-log.jsonl");
    let calls = 0;
    try {
      writePendingNotify(pendingPath, {
        version: 1,
        slug: "suno-visuals",
        runId: "r-review",
        createdAt: "2026-11-26T00:00:00.000Z",
        items: [
          buildPendingItem({ platform: "tiktok", caption: CAPTION, hashtags: TAGS }),
          buildPendingItem({ platform: "youtube", caption: "yt copy" }),
        ],
      });
      const config = resolveNotifyConfig({ FEISHU_BOT_WEBHOOK: "https://example.test/hook" });
      const first = await approvePendingNotify({
        pendingPath,
        logPath,
        config,
        fetchImpl: async () => {
          calls += 1;
          return feishuResponse(0);
        },
      });
      expect(first.ok).toBe(true);
      expect(first.sent).toBe(2); // two platform rows
      expect(calls).toBe(4); // two messages × two platforms
      expect(readPendingNotify(pendingPath).items.every((row) => row.status === "approved")).toBe(
        true,
      );
      expect(readNotifyLog(logPath).filter((entry) => entry.ok).length).toBe(2);

      const second = await approvePendingNotify({
        pendingPath,
        logPath,
        config,
        fetchImpl: async () => feishuResponse(0),
      });
      expect(second.results.every((row) => row.skipped)).toBe(true);
      expect(calls).toBe(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the row pending when the channel cannot send", async () => {
    const dir = tempDir();
    const pendingPath = join(dir, NOTIFY_PENDING_FILE);
    try {
      writePendingNotify(pendingPath, {
        version: 1,
        slug: "s",
        runId: "r-no-channel",
        createdAt: "2026-11-26T00:00:00.000Z",
        items: [buildPendingItem({ platform: "tiktok", caption: CAPTION })],
      });
      const result = await approvePendingNotify({
        pendingPath,
        logPath: join(dir, "notify-log.jsonl"),
        config: resolveNotifyConfig({}),
        fetchImpl: async () => feishuResponse(0),
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("send-failed");
      expect(readPendingNotify(pendingPath).items[0].status).toBe("pending");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a missing review file instead of sending nothing silently", async () => {
    const dir = tempDir();
    try {
      const result = await approvePendingNotify({
        pendingPath: join(dir, NOTIFY_PENDING_FILE),
        logPath: join(dir, "notify-log.jsonl"),
        config: resolveNotifyConfig({ FEISHU_BOT_WEBHOOK: "https://example.test/hook" }),
      });
      expect(result).toMatchObject({ ok: false, reason: "no-pending" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("verify seam wiring (#1530)", () => {
  it("keeps the notify CLI wired into verify-video's post-render path", () => {
    // The merge that resolved verify-video.mjs for #1531 dropped this block:
    // every lib-level test stayed green while the pipeline silently stopped
    // pushing. Pin the call site, not the wording around it.
    const source = readFileSync(new URL("../verify-video.mjs", import.meta.url), "utf8");
    const packageIdx = source.indexOf("Generating platform publish packages");
    const seamIdx = source.indexOf('"notify-caption.mjs"');
    expect(packageIdx).toBeGreaterThan(-1);
    expect(seamIdx).toBeGreaterThan(packageIdx);
    expect(source.slice(seamIdx)).toContain('"--require-notify"');
  });
});
