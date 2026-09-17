import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "path";

// ─── yt-dlp 412 persistent backoff guard ───
// Bilibili returns HTTP 412 both as a deterministic precondition (missing
// buvid3 device cookie) and as a rate-limit penalty (yt-dlp #5083); since
// 2025-10 the penalty can also hit playurl even with valid cookies (#14830,
// #16571). Community reports: all API requests from the blocked key are
// restricted "for a while" — no official number, cooldown observed in hours.
// The guard persists penalty state to disk so a fresh session does not
// blindly re-hit the block (the same failure the #249 limiter fixed for CDP).

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Wiring mocks — both specifier spellings used across lib imports.
const execSyncMock = vi.fn();
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, execSync: (...args) => execSyncMock(...args) };
});
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, execSync: (...args) => execSyncMock(...args) };
});

import { createYtdlp412Guard, matchYtdlp412 } from "../lib/ytdlp-guard.mjs";
import { searchYtdlp, downloadYtdlp } from "../lib/asset-sourcer.mjs";
import { downloadYtdlpAdapter } from "../lib/video-downloaders.mjs";

// ─── Pure guard tests (injected clock/state, instant) ───

function makeGuard(overrides = {}) {
  let t = 1_000_000;
  const mem = {};
  const guard = createYtdlp412Guard({
    now: () => t,
    loadState: () => JSON.parse(JSON.stringify(mem)),
    saveState: (s) => Object.assign(mem, JSON.parse(JSON.stringify(s))),
    ...overrides,
  });
  return { guard, mem, advance: (ms) => (t += ms), now: () => t };
}

describe("createYtdlp412Guard", () => {
  it("starts unblocked on fresh state", () => {
    const { guard } = makeGuard();
    expect(guard.isBlocked("bilibili.com")).toMatchObject({ blocked: false });
  });

  it("first 412 blocks the domain for 1 hour and persists", () => {
    const { guard, mem } = makeGuard();
    guard.record412("bilibili.com");
    expect(guard.isBlocked("bilibili.com").blocked).toBe(true);
    expect(mem.domains["bilibili.com"].until - 1_000_000).toBe(HOUR);
    expect(mem.domains["bilibili.com"].consecutive).toBe(1);
  });

  it("escalates exponentially per consecutive 412 and caps at 24h", () => {
    const { guard, advance, now } = makeGuard();
    const durations = [];
    for (let i = 0; i < 6; i++) {
      guard.record412("bilibili.com");
      const { until } = guard.isBlocked("bilibili.com");
      durations.push(until - now());
      advance(30 * 60 * 1000); // half the current window passes, re-hit
    }
    expect(durations).toEqual([HOUR, 2 * HOUR, 4 * HOUR, 8 * HOUR, 16 * HOUR, DAY]);
  });

  it("recordSuccess clears the block and persists the clear", () => {
    const { guard, mem } = makeGuard();
    guard.record412("bilibili.com");
    guard.recordSuccess("bilibili.com");
    expect(guard.isBlocked("bilibili.com").blocked).toBe(false);
    expect(mem.domains["bilibili.com"]).toBeUndefined();
  });

  it("block expires once until passes", () => {
    const { guard, advance } = makeGuard();
    guard.record412("bilibili.com");
    advance(HOUR + 1);
    expect(guard.isBlocked("bilibili.com").blocked).toBe(false);
  });

  it("state survives a brand-new guard instance (new session)", () => {
    let t = 1_000_000;
    const mem = {};
    const a = createYtdlp412Guard({
      now: () => t,
      loadState: () => JSON.parse(JSON.stringify(mem)),
      saveState: (s) => Object.assign(mem, JSON.parse(JSON.stringify(s))),
    });
    a.record412("bilibili.com");

    // Fresh session: new module instance, same persisted store.
    const b = createYtdlp412Guard({
      now: () => t + 1000,
      loadState: () => JSON.parse(JSON.stringify(mem)),
      saveState: (s) => Object.assign(mem, JSON.parse(JSON.stringify(s))),
    });
    expect(b.isBlocked("bilibili.com").blocked).toBe(true);
  });

  it("YTDLP_GUARD_DISABLED=1 escape hatch disables the block", () => {
    const { guard } = makeGuard();
    guard.record412("bilibili.com");
    process.env.YTDLP_GUARD_DISABLED = "1";
    try {
      expect(guard.isBlocked("bilibili.com").blocked).toBe(false);
    } finally {
      delete process.env.YTDLP_GUARD_DISABLED;
    }
  });
});

describe("matchYtdlp412", () => {
  it("detects 412 in execSync stderr payloads", () => {
    expect(matchYtdlp412({ stderr: "ERROR: ... HTTP Error 412: Precondition Failed" })).toBe(true);
    expect(matchYtdlp412(new Error("412: Precondition Failed"))).toBe(true);
  });

  it("does not fire on unrelated failures", () => {
    expect(matchYtdlp412({ stderr: "login required" })).toBe(false);
    expect(matchYtdlp412(new Error("timed out"))).toBe(false);
    expect(matchYtdlp412(null)).toBe(false);
  });

  it("does not fire on incidental 412 substrings (ids, durations, urls)", () => {
    expect(matchYtdlp412({ stderr: "ERROR: [Weibo] BV1412xyz: no formats" })).toBe(false);
    expect(matchYtdlp412(new Error("412000 bytes downloaded"))).toBe(false);
  });

  it("resets the escalation ladder after a penalty has expired", () => {
    const { guard, advance, now } = makeGuard();
    guard.record412("bilibili.com");
    guard.record412("bilibili.com"); // still penalized → escalates to 2h
    advance(3 * HOUR); // both windows lapsed
    guard.record412("bilibili.com");
    const { until } = guard.isBlocked("bilibili.com");
    expect(until - now()).toBe(HOUR); // fresh 1h, not 4h
  });
});

// ─── Wiring tests (mocked execSync, tmp state file) ───

describe("yt-dlp wiring", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ytdlp-guard-"));
    process.env.YTDLP_412_STATE_PATH = join(tmp, "state.json");
    execSyncMock.mockReset();
  });

  afterEach(() => {
    delete process.env.YTDLP_412_STATE_PATH;
    rmSync(tmp, { recursive: true, force: true });
  });

  function seedBlocked(domain) {
    writeFileSync(
      process.env.YTDLP_412_STATE_PATH,
      JSON.stringify({
        domains: { [domain]: { until: Date.now() + HOUR, consecutive: 1, lastAt: Date.now() } },
      }),
      "utf8",
    );
  }

  it("blocked platform: searchYtdlp returns [] without invoking yt-dlp", () => {
    seedBlocked("bilibili.com");
    const out = searchYtdlp("DeepSeek", "bilibili");
    expect(out).toEqual([]);
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("searchYtdlp passes a browser user-agent and records success", () => {
    execSyncMock.mockReturnValue("BV1E7wtzaEdq\t从 LLM 到 Agent Skill\t1951\n");
    const out = searchYtdlp("DeepSeek", "bilibili");
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://www.bilibili.com/video/BV1E7wtzaEdq");
    const cmd = execSyncMock.mock.calls[0][0];
    expect(cmd).toContain("--user-agent");
    expect(cmd).toContain("Mozilla/5.0");
    const stateText = existsSync(process.env.YTDLP_412_STATE_PATH)
      ? readFileSync(process.env.YTDLP_412_STATE_PATH, "utf8")
      : "";
    expect(stateText).not.toContain("bilibili.com");
  });

  it("searchYtdlp 412 failure records the block; next call short-circuits", () => {
    const err = new Error("failed");
    err.stderr = "ERROR: HTTP Error 412: Precondition Failed";
    execSyncMock.mockImplementation(() => {
      throw err;
    });
    expect(searchYtdlp("DeepSeek", "bilibili")).toEqual([]);
    expect(readFileSync(process.env.YTDLP_412_STATE_PATH, "utf8")).toContain("bilibili.com");

    execSyncMock.mockClear();
    expect(searchYtdlp("DeepSeek", "bilibili")).toEqual([]);
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("downloadYtdlp 412 failure records the block and reports it", () => {
    const dest = join(tmp, "clip.mp4");
    const err = new Error("failed");
    err.stderr = "ERROR: HTTP Error 412: Precondition Failed";
    execSyncMock.mockImplementation(() => {
      throw err;
    });
    const res = downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", dest);
    expect(res.success).toBe(false);
    expect(res.error).toContain("412");
    expect(readFileSync(process.env.YTDLP_412_STATE_PATH, "utf8")).toContain("bilibili.com");
  });

  it("downloadYtdlpAdapter (weibo route) also gates and records", () => {
    // Weibo adapter without WEIBO_COOKIE proceeds via plain yt-dlp; 412 must register.
    const err = new Error("failed");
    err.stderr = "HTTP Error 412: Precondition Failed";
    execSyncMock.mockImplementation(() => {
      throw err;
    });
    const res = downloadYtdlpAdapter("https://weibo.com/5468142257/Ri5ajjFK0");
    expect(res.status).toBe("failed");
    expect(readFileSync(process.env.YTDLP_412_STATE_PATH, "utf8")).toContain("weibo.com");
  });
});
