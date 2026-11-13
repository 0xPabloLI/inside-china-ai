import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// spawnSync is left real by the module mock below — the #329 probe shells out
// to the actual yt-dlp binary on purpose.
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  utimesSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "path";

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
//
// Two call forms are in play and they need separate mocks:
//   - `execSync(cmd)` — shell strings: asset-sourcer's download path, the
//     video-downloaders adapter, and ytdlp-guard's own `scutil --proxy` probe.
//   - `execFileSync(file, args)` — argv: asset-sourcer's search + download
//     paths (#319's argv direction; `keyword`/`url` are externally-derived and
//     must not reach a shell).
// The `scutil` probe is execSync, so `execFileSyncMock` sees ONLY yt-dlp calls
// from asset-sourcer and `calls[0]` is always the one under test.
const execSyncMock = vi.fn();
const execFileSyncMock = vi.fn();
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execSync: (...args) => execSyncMock(...args),
    execFileSync: (...args) => execFileSyncMock(...args),
  };
});
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execSync: (...args) => execSyncMock(...args),
    execFileSync: (...args) => execFileSyncMock(...args),
  };
});

import {
  createYtdlp412Guard,
  endYtdlpItem,
  firefoxProfileCandidates,
  matchYtdlp412,
  paceYtdlpItem,
  parseFirefoxProfilesIni,
  removeYtdlpStaleOutput,
  resolveFirefoxCookieSource,
  resolveYtdlpOutputPath,
  resolveYtdlpProxy,
  YTDLP_PACING,
  ytdlpContainerMime,
  ytdlpCookieSource,
  ytdlpPacing,
  ytdlpPacingArgs,
  ytdlpProxyArg,
  ytdlpProxyEnv,
} from "../lib/ytdlp-guard.mjs";
import { parseScutilProxy } from "../../lib/proxy-port.mjs";
import { searchYtdlp, downloadYtdlp } from "../lib/asset-sourcer.mjs";
import { downloadYtdlpAdapter, buildYtdlpCommand } from "../lib/video-downloaders.mjs";

// ─── argv helpers for the execFileSync call sites ───

/** Flatten an `execFileSync(file, args, opts)` mock call into its argv. */
const fileArgv = (call) => [call[0], ...(call[1] ?? [])];

/** The value following `flag` in an argv, or undefined when absent. */
const flagValue = (argv, flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};

/**
 * The binary appears exactly once, as argv[0]. A leftover "yt-dlp" element in
 * the args array is invisible to a mocked child_process but makes the real
 * spawn run `yt-dlp yt-dlp ...` — caught on the real host, not by the mock.
 */
const expectSingleBinary = (argv) => {
  expect(argv[0]).toBe("yt-dlp");
  expect(argv.filter((t) => t === "yt-dlp")).toHaveLength(1);
};

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

// ─── #405: serial pacing ───
//
// The measured triple (2026-09-28, Video-MME short subset): burst 23 → 100%
// blocked; paced + serial + one retry → 22/23. These numbers live in one
// constant that both adapters and the bench downloader read.
describe("#405 ytdlpPacing", () => {
  it("defaults to the measured triple", () => {
    expect(YTDLP_PACING).toEqual({ sleepRequestsSec: 3, sleepIntervalSec: 8, itemGapSec: 6 });
    expect(ytdlpPacing({})).toEqual(YTDLP_PACING);
  });

  it("reads the env overrides, including 0 to disable a knob", () => {
    expect(
      ytdlpPacing({ YTDLP_SLEEP_REQUESTS: "1", YTDLP_SLEEP_INTERVAL: "0", YTDLP_ITEM_GAP: "12" }),
    ).toEqual({ sleepRequestsSec: 1, sleepIntervalSec: 0, itemGapSec: 12 });
  });

  it("keeps the measured default when an override is malformed", () => {
    // A typo must not switch the rate limit off — only an explicit 0 does.
    const pacing = ytdlpPacing({ YTDLP_SLEEP_REQUESTS: "abc", YTDLP_SLEEP_INTERVAL: "-4" });
    expect(pacing.sleepRequestsSec).toBe(3);
    expect(pacing.sleepIntervalSec).toBe(8);
  });

  it("renders no flags when both yt-dlp knobs are disabled", () => {
    expect(ytdlpPacingArgs({ sleepRequestsSec: 0, sleepIntervalSec: 0, itemGapSec: 6 })).toEqual(
      [],
    );
    expect(ytdlpPacingArgs()).toEqual(["--sleep-requests", "3", "--sleep-interval", "8"]);
  });

  it("measures the gap from the previous item's completion, not its start", () => {
    const state = { lastEnd: 0 };
    let t = 1_000_000;
    const sleeps = [];
    const deps = {
      pacing: YTDLP_PACING,
      now: () => t,
      sleep: (ms) => sleeps.push(ms),
      state,
    };
    expect(paceYtdlpItem(deps)).toBe(0); // first item: single-download path pays nothing
    t += 20_000; // a long download...
    endYtdlpItem({ now: () => t, state }); // ...ends here
    t += 1_000;
    expect(paceYtdlpItem(deps)).toBe(5_000); // next item waits 6s AFTER it, not from its start
    t += 60_000; // caller was idle far longer than the gap
    endYtdlpItem({ now: () => t, state });
    t += 10_000;
    expect(paceYtdlpItem(deps)).toBe(0);
    expect(sleeps).toEqual([5_000]);
  });

  it("item gap 0 disables the wait entirely", () => {
    const sleeps = [];
    const deps = {
      pacing: { ...YTDLP_PACING, itemGapSec: 0 },
      now: () => 1_000_000,
      sleep: (ms) => sleeps.push(ms),
      state: { lastEnd: 1 },
    };
    expect(paceYtdlpItem(deps)).toBe(0);
    expect(paceYtdlpItem(deps)).toBe(0);
    expect(sleeps).toEqual([]);
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

// ─── #313: youtube cookie-source policy ───

describe("ytdlpCookieBrowser", () => {
  it("every target resolves to firefox — no target reads the Chrome Keychain store", () => {
    // 2026-10-14: youtube moved off chrome. The Chrome Safe Storage ACL cannot
    // be persisted for this unsigned/adhoc binary chain, so every chrome read
    // raised a blocking SecurityAgent prompt that timed out at 120s when
    // unattended (#328). Firefox cookies are plaintext SQLite — no Keychain.
    expect(ytdlpCookieSource()).toMatch(/^firefox/);
  });
});

// ─── #328: firefox profile resolution ───

describe("parseFirefoxProfilesIni", () => {
  it("parses sections, trims, and skips comments and blanks", () => {
    const sections = parseFirefoxProfilesIni(
      [
        "; a comment",
        "# another",
        "",
        "[Profile0]",
        "Name=default-release",
        "Path=Profiles/abc.default-release",
        "",
        "[Install2656FF1E876E9973]",
        "Default=Profiles/abc.default-release",
      ].join("\n"),
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({
      name: "Profile0",
      kv: { Name: "default-release", Path: "Profiles/abc.default-release" },
    });
    expect(sections[1].kv.Default).toBe("Profiles/abc.default-release");
  });

  it("returns an empty list for empty input", () => {
    expect(parseFirefoxProfilesIni("")).toEqual([]);
  });
});

describe("firefoxProfileCandidates", () => {
  // The real host layout that caused the bug: `Default=1` names an EMPTY
  // profile whose cookies.sqlite has no moz_cookies table, while the
  // install-level Default names the profile actually in use.
  const REAL_HOST_INI = [
    "[Profile1]",
    "Name=default",
    "Path=Profiles/7oxxo6jf.default",
    "Default=1",
    "",
    "[Profile0]",
    "Name=default-release",
    "Path=Profiles/4m5wba40.default-release",
    "",
    "[General]",
    "StartWithLastProfile=1",
    "Version=2",
    "",
    "[Install2656FF1E876E9973]",
    "Default=Profiles/4m5wba40.default-release",
    "Locked=1",
  ].join("\n");

  it("prefers the install-level default over the empty Profile* Default=1", () => {
    const candidates = firefoxProfileCandidates(parseFirefoxProfilesIni(REAL_HOST_INI));
    expect(candidates[0]).toBe("Profiles/4m5wba40.default-release");
    // the empty profile is still a candidate — just not the first one
    expect(candidates).toContain("Profiles/7oxxo6jf.default");
  });

  it("deduplicates a profile named by both sections", () => {
    const candidates = firefoxProfileCandidates(
      parseFirefoxProfilesIni(
        [
          "[Profile0]",
          "Path=Profiles/same.default",
          "Default=1",
          "[InstallAAA]",
          "Default=Profiles/same.default",
        ].join("\n"),
      ),
    );
    expect(candidates).toEqual(["Profiles/same.default"]);
  });
});

describe("resolveFirefoxCookieSource", () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ff-root-"));
    delete process.env.YTDLP_FIREFOX_PROFILE;
  });
  afterEach(() => {
    delete process.env.YTDLP_FIREFOX_PROFILE;
    rmSync(root, { recursive: true, force: true });
  });

  /** Materialize a profile dir; `size` 0 mimics the truncated/empty store. */
  function makeProfile(dirName, size) {
    mkdirSync(join(root, "Profiles", dirName), { recursive: true });
    writeFileSync(join(root, "Profiles", dirName, "cookies.sqlite"), Buffer.alloc(size));
  }

  it("skips a zero-byte cookies.sqlite and picks the usable profile", () => {
    writeFileSync(
      join(root, "profiles.ini"),
      [
        "[Profile1]",
        "Path=Profiles/empty.default",
        "Default=1",
        "[InstallAAA]",
        "Default=Profiles/empty.default",
        "[Profile0]",
        "Path=Profiles/real.default-release",
      ].join("\n"),
    );
    makeProfile("empty.default", 0);
    makeProfile("real.default-release", 4096);

    expect(resolveFirefoxCookieSource({ root })).toBe(
      `firefox:${join(root, "Profiles", "real.default-release")}`,
    );
  });

  it("falls back to bare firefox when no profile has a usable store", () => {
    writeFileSync(join(root, "profiles.ini"), "[Profile0]\nPath=Profiles/empty.default\n");
    makeProfile("empty.default", 0);
    expect(resolveFirefoxCookieSource({ root })).toBe("firefox");
  });

  it("falls back to bare firefox when profiles.ini is missing", () => {
    expect(resolveFirefoxCookieSource({ root })).toBe("firefox");
  });

  it("honours the YTDLP_FIREFOX_PROFILE escape hatch over discovery", () => {
    process.env.YTDLP_FIREFOX_PROFILE = "my-pinned-profile";
    expect(resolveFirefoxCookieSource({ root })).toBe("firefox:my-pinned-profile");
  });

  it("returns an absolute path so the shell-quoted argument survives the space in 'Application Support'", () => {
    writeFileSync(
      join(root, "profiles.ini"),
      "[InstallAAA]\nDefault=Profiles/real.default-release\n",
    );
    makeProfile("real.default-release", 4096);
    const resolved = resolveFirefoxCookieSource({ root });
    const profilePath = resolved.slice("firefox:".length);
    expect(isAbsolute(profilePath)).toBe(true);
  });
});

// ─── Wiring tests (mocked execSync, tmp state file) ───

describe("yt-dlp wiring", () => {
  let tmp;
  let savedItemGap;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ytdlp-guard-"));
    process.env.YTDLP_412_STATE_PATH = join(tmp, "state.json");
    // The item gap is wall-clock by design; the seam itself is unit-tested
    // with an injected clock, so the wiring cases opt out to stay instant.
    savedItemGap = process.env.YTDLP_ITEM_GAP;
    process.env.YTDLP_ITEM_GAP = "0";
    execSyncMock.mockReset();
    execFileSyncMock.mockReset();
  });

  afterEach(() => {
    delete process.env.YTDLP_412_STATE_PATH;
    // Restore rather than delete: the host may export its own pacing.
    if (savedItemGap === undefined) delete process.env.YTDLP_ITEM_GAP;
    else process.env.YTDLP_ITEM_GAP = savedItemGap;
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
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it("searchYtdlp passes a browser user-agent and records success", () => {
    execFileSyncMock.mockReturnValue("BV1E7wtzaEdq\t从 LLM 到 Agent Skill\t1951\n");
    const out = searchYtdlp("DeepSeek", "bilibili");
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://www.bilibili.com/video/BV1E7wtzaEdq");
    // argv form: the `scutil` proxy probe is execSync, so this mock sees only
    // yt-dlp calls and calls[0] is the one under test.
    const argv = fileArgv(execFileSyncMock.mock.calls[0]);
    expectSingleBinary(argv);
    expect(flagValue(argv, "--user-agent")).toContain("Mozilla/5.0");
    const stateText = existsSync(process.env.YTDLP_412_STATE_PATH)
      ? readFileSync(process.env.YTDLP_412_STATE_PATH, "utf8")
      : "";
    expect(stateText).not.toContain("bilibili.com");
  });

  it("searchYtdlp passes the keyword as a literal argv element, never a shell word", () => {
    execFileSyncMock.mockReturnValue("");
    const payload = 'x"; touch /tmp/should-not-exist; echo "';
    searchYtdlp(payload, "youtube");
    // The payload survives verbatim as one argument — no quoting, no split.
    expect(fileArgv(execFileSyncMock.mock.calls[0])).toContain(`ytsearch10:${payload}`);
  });

  it("searchYtdlp 412 failure records the block; next call short-circuits", () => {
    const err = new Error("failed");
    err.stderr = "ERROR: HTTP Error 412: Precondition Failed";
    execFileSyncMock.mockImplementation(() => {
      throw err;
    });
    expect(searchYtdlp("DeepSeek", "bilibili")).toEqual([]);
    expect(readFileSync(process.env.YTDLP_412_STATE_PATH, "utf8")).toContain("bilibili.com");

    execFileSyncMock.mockClear();
    expect(searchYtdlp("DeepSeek", "bilibili")).toEqual([]);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it("downloadYtdlp 412 failure records the block and reports it", () => {
    const dest = join(tmp, "clip.mp4");
    const err = new Error("failed");
    err.stderr = "ERROR: HTTP Error 412: Precondition Failed";
    execFileSyncMock.mockImplementation(() => {
      throw err;
    });
    const res = downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", dest);
    expect(res.success).toBe(false);
    expect(res.error).toContain("412");
    expect(readFileSync(process.env.YTDLP_412_STATE_PATH, "utf8")).toContain("bilibili.com");
  });

  it("#328: downloadYtdlp routes youtube through firefox, never the chrome store", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("failed");
    });
    downloadYtdlp("https://www.youtube.com/watch?v=abc", join(tmp, "yt.mp4"));
    const argv = fileArgv(execFileSyncMock.mock.calls[0]);
    expectSingleBinary(argv);
    expect(flagValue(argv, "--cookies-from-browser")).toMatch(/^firefox/);
    expect(argv).not.toContain("chrome");
  });

  it("downloadYtdlp keeps firefox for bilibili downloads", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("failed");
    });
    downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", join(tmp, "bili.mp4"));
    const argv = fileArgv(execFileSyncMock.mock.calls[0]);
    expect(flagValue(argv, "--cookies-from-browser")).toMatch(/^firefox/);
    expect(argv).not.toContain("chrome");
  });

  it("downloadYtdlp passes the url as a literal argv element, never a shell word", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("failed");
    });
    const payload = 'https://x/"; touch /tmp/should-not-exist; echo "';
    downloadYtdlp(payload, join(tmp, "p.mp4"));
    expect(fileArgv(execFileSyncMock.mock.calls[0])).toContain(payload);
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

  it("#323: downloadYtdlp succeeds when yt-dlp falls back to a webm container", () => {
    const dest = join(tmp, "clip.mp4");
    execFileSyncMock.mockImplementation(() => {
      // webm-only source: yt-dlp appends the real container extension to the
      // -o template (empirical #313 probe: `-o /tmp/x.mp4` → /tmp/x.mp4.webm).
      writeFileSync(`${dest}.webm`, Buffer.alloc(2048), "utf8");
    });
    const res = downloadYtdlp("https://www.youtube.com/watch?v=abc", dest);
    expect(res.success).toBe(true);
    expect(res.path).toBe(`${dest}.webm`);
  });

  it("#323: downloadYtdlp still reports failure when nothing landed on disk", () => {
    const dest = join(tmp, "clip.mp4");
    execFileSyncMock.mockImplementation(() => {});
    const res = downloadYtdlp("https://www.youtube.com/watch?v=abc", dest);
    expect(res.success).toBe(false);
    expect(res.error).toContain("file not found");
  });

  it("#323: downloadYtdlpAdapter reads the webm fallback, reports the real container, leaves no orphan", () => {
    let produced = null;
    execSyncMock.mockImplementation((cmd) => {
      const template = cmd.match(/-o "([^"]+)"/)[1];
      produced = `${template}.webm`;
      writeFileSync(produced, Buffer.alloc(2048), "utf8");
    });
    const res = downloadYtdlpAdapter("https://www.youtube.com/watch?v=abc");
    expect(res.status).toBe("downloaded");
    expect(res.extension).toBe("webm");
    expect(res.mimeType).toBe("video/webm");
    expect(res.buffer.length).toBe(2048);
    expect(existsSync(produced)).toBe(false); // consumed, not orphaned
  });

  it("#323: a stale webm orphan from a previous failed run is not sold as today's download", () => {
    const dest = join(tmp, "clip.mp4");
    // pre-fix-era orphan: a failed run left <dest>.webm on disk
    writeFileSync(`${dest}.webm`, Buffer.alloc(2048), "utf8");
    execFileSyncMock.mockImplementation(() => {}); // this run exits 0 producing nothing
    const res = downloadYtdlp("https://www.youtube.com/watch?v=abc", dest);
    expect(res.success).toBe(false);
    expect(res.error).toContain("file not found");
    expect(existsSync(`${dest}.webm`)).toBe(false); // stale sibling cleared pre-download
  });

  // ─── #405: pacing reaches both production adapters ───

  it("#405: buildYtdlpCommand carries the measured pacing flags", () => {
    const cmd = buildYtdlpCommand("https://www.youtube.com/watch?v=abc", {
      tmpPath: join(tmp, "paced.mp4"),
    });
    expect(cmd).toContain("--sleep-requests 3 --sleep-interval 8");
  });

  it("#405: the pacing env overrides reach the built command", () => {
    process.env.YTDLP_SLEEP_REQUESTS = "1";
    process.env.YTDLP_SLEEP_INTERVAL = "2";
    try {
      const cmd = buildYtdlpCommand("https://www.youtube.com/watch?v=abc", {
        tmpPath: join(tmp, "paced-env.mp4"),
      });
      expect(cmd).toContain("--sleep-requests 1 --sleep-interval 2");
    } finally {
      delete process.env.YTDLP_SLEEP_REQUESTS;
      delete process.env.YTDLP_SLEEP_INTERVAL;
    }
  });

  it("#405: asset-sourcer's downloadYtdlp passes pacing as argv", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("failed");
    });
    downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", join(tmp, "paced.mp4"));
    const argv = fileArgv(execFileSyncMock.mock.calls[0]);
    expect(flagValue(argv, "--sleep-requests")).toBe("3");
    expect(flagValue(argv, "--sleep-interval")).toBe("8");
  });

  it("#405: a failed attempt still stamps the item end (failed downloads pace too)", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("failed");
    });
    downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", join(tmp, "fail.mp4"));
    // Default module state with an injected sleep: the failed attempt spent
    // upstream requests, so the next item must still wait the gap. The wiring
    // cases run with YTDLP_ITEM_GAP=0, hence the explicit pacing here.
    const slept = [];
    const paced = paceYtdlpItem({ pacing: YTDLP_PACING, sleep: (ms) => slept.push(ms) });
    expect(paced).toBeGreaterThan(0);
    expect(paced).toBeLessThanOrEqual(6_000);
  });

  it("#405: a penalized domain emits no command at all (412 box beats pacing)", () => {
    // The gate returns before the item gap and before any spawn: sleeping first
    // would manufacture the wait the box exists to avoid.
    // The bucket for an unlisted host is its hostname (matchDomain → _default).
    seedBlocked("www.youtube.com");
    const adapter = downloadYtdlpAdapter("https://www.youtube.com/watch?v=abc");
    expect(adapter.status).toBe("failed");
    expect(execSyncMock).not.toHaveBeenCalled();

    seedBlocked("bilibili.com");
    const direct = downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", join(tmp, "g.mp4"));
    expect(direct.success).toBe(false);
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });
});

// ─── #323: yt-dlp output resolution (pure fs, real tmpdir) ───

describe("resolveYtdlpOutputPath", () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ytdlp-resolve-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns the exact path when yt-dlp landed the template name", () => {
    const dest = join(tmp, "clip.mp4");
    writeFileSync(dest, Buffer.alloc(16), "utf8");
    expect(resolveYtdlpOutputPath(dest)).toBe(dest);
  });

  it("resolves the container-suffixed output when the template extension mismatches (#323)", () => {
    const dest = join(tmp, "clip.mp4");
    writeFileSync(`${dest}.webm`, Buffer.alloc(16), "utf8");
    expect(resolveYtdlpOutputPath(dest)).toBe(`${dest}.webm`);
  });

  it("picks the newest produced file when several suffixed siblings exist", () => {
    const dest = join(tmp, "clip.mp4");
    writeFileSync(`${dest}.webm`, Buffer.alloc(16), "utf8");
    writeFileSync(`${dest}.mkv`, Buffer.alloc(16), "utf8");
    // pin mtime ordering — same-ms writes would tie and make this ambiguous
    utimesSync(`${dest}.webm`, new Date(1000), new Date(1000));
    utimesSync(`${dest}.mkv`, new Date(2000), new Date(2000));
    expect(resolveYtdlpOutputPath(dest)).toBe(`${dest}.mkv`);
  });

  it("returns null when nothing was produced", () => {
    expect(resolveYtdlpOutputPath(join(tmp, "missing.mp4"))).toBeNull();
  });

  it("removeYtdlpStaleOutput clears suffixed siblings and keeps the exact path", () => {
    const dest = join(tmp, "clip.mp4");
    writeFileSync(dest, Buffer.alloc(16), "utf8");
    writeFileSync(`${dest}.webm`, Buffer.alloc(16), "utf8");
    removeYtdlpStaleOutput(dest);
    expect(existsSync(dest)).toBe(true);
    expect(existsSync(`${dest}.webm`)).toBe(false);
  });

  it("ytdlpContainerMime reports octet-stream for unknown containers instead of a false mp4", () => {
    expect(ytdlpContainerMime("avi")).toBe("application/octet-stream");
  });
});

// ─── #324: proxy hand-off to the ffmpeg child ───
//
// yt-dlp delegates `--download-sections` to a spawned ffmpeg. yt-dlp's own
// HTTP layer resolves the macOS system proxy (Python getproxies), but ffmpeg
// only reads the LOWERCASE http_proxy/https_proxy env vars — so in a session
// with no lowercase var exported the CDN segment goes direct and times out
// (ffmpeg exited with code 196). Upstream yt-dlp already solved this the right
// way: when `--proxy` is given, FFmpegFD hands the ffmpeg child BOTH
// HTTP_PROXY and http_proxy (yt_dlp/downloader/external.py). So the fix is to
// resolve the proxy our side already has and pass it as `--proxy` — no
// hand-rolled env injection.
//
// Observed on this host (2026-09-21): without `--proxy` the ffmpeg child saw
// only the uppercase vars; with `--proxy` it also saw the lowercase one.

// Observed shape on this host (2026-09-21): every protocol disabled, PAC
// autodiscovery on. Used as the "nothing usable" fixture.
const SCUTIL_PAC_ONLY = `<dictionary> {
  ExceptionsList : <array> {
    0 : 127.0.0.1
    1 : 192.168.0.0/16
    2 : localhost
    3 : *.local
  }
  FTPPassive : 1
  HTTPEnable : 0
  HTTPSEnable : 0
  ProxyAutoConfigEnable : 1
  ProxyAutoConfigURLString : http://wpad/wpad.dat
  ProxyAutoDiscoveryEnable : 1
  SOCKSEnable : 0
}`;

// The ticket's failing configuration (#324 body): all three protocols enabled
// on the 7897 mixed port.
const SCUTIL_ALL_ENABLED = `<dictionary> {
  ExceptionsList : <array> {
    0 : 127.0.0.1
    1 : *.local
  }
  HTTPEnable : 1
  HTTPPort : 7897
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7897
  HTTPSProxy : 127.0.0.1
  SOCKSEnable : 1
  SOCKSPort : 7897
  SOCKSProxy : 127.0.0.1
}`;

// #329 verdict fixture: SOCKS on, HTTP/HTTPS off.
const SCUTIL_SOCKS_ONLY = SCUTIL_ALL_ENABLED.replace("HTTPEnable : 1", "HTTPEnable : 0").replace(
  "HTTPSEnable : 1",
  "HTTPSEnable : 0",
);

// Two clients on two loopback ports — the shape `test-env-baseline.md` records
// (FlClash on one port, Clash Verge on another), where picking the wrong client
// changes the egress path. Both forward, so precedence alone decides.
const SCUTIL_TWO_CLIENTS = SCUTIL_ALL_ENABLED.replace("HTTPSPort : 7897", "HTTPSPort : 7899");

describe("#324 system proxy parsing", () => {
  // `parseMacSystemProxy` — this file's own parser until #1064 — is gone. The
  // guard hands `parseScutilProxy`'s dict straight to the shared resolver, so
  // these cases pin the shape the resolver consumes; `Enable` gating has its
  // own suite in `scripts/__tests__/proxy-port.test.mjs`.
  it("parses one entry per protocol, skipping the nested ExceptionsList entries", () => {
    expect(parseScutilProxy(SCUTIL_ALL_ENABLED)).toEqual({
      HTTP: { enabled: true, host: "127.0.0.1", port: 7897 },
      HTTPS: { enabled: true, host: "127.0.0.1", port: 7897 },
      // #329: SOCKS is kept so the SOCKS-only verdict can name the endpoint
      // ffmpeg cannot use, instead of resolving to a bare null.
      SOCKS: { enabled: true, host: "127.0.0.1", port: 7897 },
    });
  });

  it("keeps the port of a protocol whose Enable flag is off, while still reporting the flag", () => {
    const partial = SCUTIL_ALL_ENABLED.replace("HTTPEnable : 1", "HTTPEnable : 0");
    expect(parseScutilProxy(partial).HTTP).toEqual({
      enabled: false,
      host: "127.0.0.1",
      port: 7897,
    });
    expect(parseScutilProxy(partial).HTTPS.enabled).toBe(true);
  });

  it("yields nothing usable on the PAC-only configuration observed on this host", () => {
    for (const proto of ["HTTP", "HTTPS", "SOCKS"]) {
      expect(parseScutilProxy(SCUTIL_PAC_ONLY)[proto]).toEqual({
        enabled: false,
        host: null,
        port: null,
      });
    }
  });

  it("survives empty or missing input", () => {
    for (const input of ["", null]) {
      expect(parseScutilProxy(input).HTTP).toEqual({ enabled: false, host: null, port: null });
    }
  });
});

describe("#324 proxy resolution", () => {
  // Since #1064 the system branch probes instead of trusting `<Proto>Enable`,
  // so each case injects the probe and the listener list. `prefer7897` is the
  // "a proxy is running on the port scutil names" state; `nothingForwards` is
  // the "client closed" state.
  const prefer7897 = (port) => (port === 7897 ? "204" : "000");
  const nothingForwards = () => "000";
  const systemDeps = (text, extra = {}) => ({
    env: {},
    readSystemProxy: () => parseScutilProxy(text),
    readLoopback: () => [],
    probe: prefer7897,
    ...extra,
  });

  it("does not inject when the lowercase http_proxy is already exported", () => {
    // The ffmpeg child inherits it through env inheritance; injecting would
    // additionally override yt-dlp's own no_proxy handling.
    expect(
      resolveYtdlpProxy({
        env: { http_proxy: "http://127.0.0.1:7897", HTTP_PROXY: "http://127.0.0.1:51079" },
        readSystemProxy: () => {
          throw new Error("must not be consulted");
        },
      }),
    ).toBeNull();
  });

  it("mirrors the uppercase env proxy when only that spelling exists", () => {
    expect(
      resolveYtdlpProxy({
        env: { HTTP_PROXY: "http://127.0.0.1:7897" },
        readSystemProxy: () => {
          throw new Error("must not be consulted");
        },
      }),
    ).toBe("http://127.0.0.1:7897");
  });

  it("falls back to the macOS system proxy when no env proxy exists", () => {
    expect(resolveYtdlpProxy(systemDeps(SCUTIL_ALL_ENABLED))).toBe("http://127.0.0.1:7897");
  });

  it("keeps HTTPS ahead of HTTP when scutil names both and both forward", () => {
    // Before #1064 this answered `system.httpsProxy || system.httpProxy` — the
    // HTTPS endpoint, no probe involved. The shared resolver defaults to
    // HTTP-first because that is what the git wrapper always did, so this
    // caller passes its own order; without it the refactor would silently
    // switch which client the downloads leave through.
    expect(parseScutilProxy(SCUTIL_TWO_CLIENTS).HTTP.port).toBe(7897);
    expect(parseScutilProxy(SCUTIL_TWO_CLIENTS).HTTPS.port).toBe(7899);
    expect(
      resolveYtdlpProxy({
        env: {},
        readSystemProxy: () => parseScutilProxy(SCUTIL_TWO_CLIENTS),
        readLoopback: () => [],
        probe: () => "204",
      }),
    ).toBe("http://127.0.0.1:7899");
  });

  it("adds the http:// scheme to a bare env endpoint", () => {
    // The system branch now yields a port, so a bare `host:port` only reaches
    // this seam from the environment.
    expect(
      resolveYtdlpProxy({
        env: { HTTPS_PROXY: "127.0.0.1:7897" },
        readSystemProxy: () => {
          throw new Error("must not be consulted");
        },
      }),
    ).toBe("http://127.0.0.1:7897");
  });

  it("takes a system port whose Enable flag is off, when it forwards", () => {
    // The failure #1064 exists for: a client left the flag off (or macOS never
    // set it) while the port still proxies. Reading `Enable` returned null here
    // and the download went direct.
    const flagOff = SCUTIL_ALL_ENABLED.replace(/Enable : 1/g, "Enable : 0");
    expect(parseScutilProxy(flagOff).HTTPS.enabled).toBe(false);
    expect(resolveYtdlpProxy(systemDeps(flagOff))).toBe("http://127.0.0.1:7897");
  });

  it("skips an enabled port that forwards nothing and takes the one that does", () => {
    // `Enable` says the client is running; the probe says it is not proxying.
    // The loopback listener is what actually answers, so it wins.
    expect(
      resolveYtdlpProxy({
        env: {},
        readSystemProxy: () => parseScutilProxy(SCUTIL_ALL_ENABLED),
        readLoopback: () => [7897, 7899],
        probe: (port) => (port === 7899 ? "204" : "000"),
      }),
    ).toBe("http://127.0.0.1:7899");
  });

  it("passes a system proxy on another host through untouched", () => {
    // #1064 asks which *local* port proxies. A corporate gateway is not a
    // candidate for that, and rewriting it to 127.0.0.1 (what the loopback
    // probe would do) turns a working proxy into "nothing forwards".
    const probe = vi.fn(nothingForwards);
    expect(
      resolveYtdlpProxy({
        env: {},
        readSystemProxy: () => ({
          HTTP: { enabled: false, host: null, port: null },
          HTTPS: { enabled: true, host: "proxy.corp", port: 7890 },
          SOCKS: { enabled: false, host: null, port: null },
        }),
        readLoopback: () => [],
        probe,
        warnings: {},
        warn: vi.fn(),
      }),
    ).toBe("http://proxy.corp:7890");
    expect(probe).not.toHaveBeenCalled();
  });

  it("probes once per process when a cache is supplied", () => {
    // Per-candidate callers would otherwise pay a network round trip for every
    // asset; the answer only changes when the client does. The first call
    // probes each candidate twice (one `000` is not a verdict), the second
    // call must probe nothing.
    const cache = {};
    const probe = vi.fn(nothingForwards);
    const deps = systemDeps(SCUTIL_ALL_ENABLED, { cache, probe });
    expect(resolveYtdlpProxy(deps)).toBeNull();
    const afterFirst = probe.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);
    expect(resolveYtdlpProxy(deps)).toBeNull();
    expect(probe.mock.calls).toHaveLength(afterFirst);
  });

  it("returns null and warns once when only SOCKS is enabled (ffmpeg cannot use SOCKS)", () => {
    // #329: ffmpeg has no SOCKS support and yt-dlp only report_warning's about
    // it, so a SOCKS-only system config leaves the `--download-sections` leg
    // direct-connected. The verdict stays "no proxy", but it is now a stated
    // one instead of a silent null.
    expect(SCUTIL_SOCKS_ONLY).toContain("SOCKSEnable : 1");
    const warnings = {};
    const warn = vi.fn();
    const deps = systemDeps(SCUTIL_SOCKS_ONLY, { warnings, warn, probe: nothingForwards });
    expect(resolveYtdlpProxy(deps)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    // Names the endpoint so the operator can see which proxy is unusable, and
    // says what to export instead.
    expect(warn.mock.calls[0][0]).toContain("127.0.0.1:7897");
    expect(warn.mock.calls[0][0]).toContain("http_proxy");
    // Once per process: callers resolve per candidate, not per session.
    expect(resolveYtdlpProxy(deps)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn about SOCKS while an HTTP(S) system proxy is usable", () => {
    const warn = vi.fn();
    expect(resolveYtdlpProxy(systemDeps(SCUTIL_ALL_ENABLED, { warnings: {}, warn }))).toBe(
      "http://127.0.0.1:7897",
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn when an env proxy already decides the route", () => {
    const warn = vi.fn();
    expect(
      resolveYtdlpProxy({
        env: { HTTP_PROXY: "http://127.0.0.1:7897" },
        readSystemProxy: () => parseScutilProxy(SCUTIL_SOCKS_ONLY),
        warnings: {},
        warn,
      }),
    ).toBe("http://127.0.0.1:7897");
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns null on a PAC-only / no-proxy configuration", () => {
    expect(resolveYtdlpProxy(systemDeps(SCUTIL_PAC_ONLY))).toBeNull();
    expect(resolveYtdlpProxy({ env: {}, readSystemProxy: () => null })).toBeNull();
  });

  it("fails open when the system proxy read throws", () => {
    expect(
      resolveYtdlpProxy({
        env: {},
        readSystemProxy: () => {
          throw new Error("scutil exploded");
        },
      }),
    ).toBeNull();
  });

  it("ytdlpProxyArg renders the shell fragment, or nothing when no proxy applies", () => {
    // Isolate all four spellings — the host environment may export any of them.
    const KEYS = ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"];
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    try {
      for (const k of KEYS) delete process.env[k];
      process.env.HTTP_PROXY = "http://127.0.0.1:7897";
      expect(ytdlpProxyArg()).toBe('--proxy "http://127.0.0.1:7897"');
      process.env.http_proxy = "http://127.0.0.1:7897";
      expect(ytdlpProxyArg()).toBe("");
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  it("escapes shell metacharacters so a hostile proxy value cannot break out", () => {
    // The fragment lands inside a double-quoted shell word at every call site.
    // BS is kept out of the source literal so the expectation stays readable.
    const BS = String.fromCharCode(92);
    const hostile = `http://h:a"b$c${BS}d`;
    const expected = `--proxy "http://h:a${BS}"b${BS}$c${BS}${BS}d"`;
    const KEYS = ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"];
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    try {
      for (const k of KEYS) delete process.env[k];
      process.env.HTTP_PROXY = hostile;
      expect(ytdlpProxyArg()).toBe(expected);
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});

// ─── #978: lowercase http_proxy carrying a SOCKS URL ───
//
// The same failure class as #329's SOCKS-only system config, on a second
// trigger path: when the operator exports `http_proxy=socks5://…`, the seam
// correctly declines to override it (the ffmpeg child inherits it verbatim),
// but ffmpeg silently ignores a SOCKS-scheme proxy URL and connects directly —
// so the run looks proxied while the `--download-sections` leg is not.
// Observed on this host 2026-11-07 with ffmpeg 8.1.2: a dead http:// proxy in
// `http_proxy` fails loudly (connection refused, server never hit), while the
// same dead port behind `socks5://` still reaches the origin (server hit).
// The route verdict stays "do not inject"; the null is what must be stated.
describe("#978 lowercase http_proxy carrying a SOCKS URL", () => {
  /** Isolate one env spelling and capture the seam's warning side effect. */
  function socksEnvDeps(value) {
    const warnings = {};
    const warn = vi.fn();
    return {
      deps: {
        env: { http_proxy: value },
        readSystemProxy: () => {
          throw new Error("must not be consulted");
        },
        warnings,
        warn,
      },
      warn,
    };
  }

  it.each([
    ["socks5", "socks5://127.0.0.1:7891"],
    ["socks5h", "socks5h://127.0.0.1:7891"],
    ["socks4", "socks4://127.0.0.1:7891"],
    ["socks4a", "socks4a://127.0.0.1:7891"],
    ["socks", "socks://127.0.0.1:7891"],
    ["uppercase scheme", "SOCKS5://127.0.0.1:7891"],
  ])("warns once and still injects nothing when http_proxy is %s", (_label, value) => {
    const { deps, warn } = socksEnvDeps(value);
    expect(resolveYtdlpProxy(deps)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0];
    // Names the variable, the endpoint and the remediation — an operator must
    // be able to fix it without reading the source.
    expect(message).toContain("http_proxy");
    expect(message).toContain("127.0.0.1:7891");
    expect(message).toContain("--download-sections");
    // Both outcomes are named: the leg may fail outright or fall back to a
    // direct connection. Naming only "direct" sent operators hunting a CDN
    // timeout when the fetch failed instead.
    expect(message).toMatch(/fail or fall back to a direct connection/);
    expect(message).toMatch(/Export http_proxy=<an HTTP proxy>/);
    // Per process, like #329: callers resolve per candidate.
    expect(resolveYtdlpProxy(deps)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps http(s) early-return semantics silent", () => {
    for (const value of [
      "http://127.0.0.1:7897",
      "https://127.0.0.1:7897",
      "http://user:pass@127.0.0.1:7897",
    ]) {
      const { deps, warn } = socksEnvDeps(value);
      expect(resolveYtdlpProxy(deps)).toBeNull();
      expect(warn, value).not.toHaveBeenCalled();
    }
  });

  it("names a bare endpoint and names nothing at all when userinfo is present", () => {
    // The endpoint is diagnostic value; the moment the value carries userinfo,
    // that value is withheld entirely — the warning still names the variable.
    const clean = socksEnvDeps("socks5://127.0.0.1:7891");
    resolveYtdlpProxy(clean.deps);
    expect(clean.warn.mock.calls[0][0]).toContain("127.0.0.1:7891");

    const withCreds = socksEnvDeps("socks5://operator:sup3rsecret@127.0.0.1:7891");
    resolveYtdlpProxy(withCreds.deps);
    const message = withCreds.warn.mock.calls[0][0];
    expect(message).toContain("http_proxy");
    expect(message).toContain("<credentials-redacted proxy URL>");
    expect(message).not.toContain("sup3rsecret");
    expect(message).not.toContain("operator");
  });

  it.each([
    ["ipv4", "socks5://127.0.0.1:7891", "127.0.0.1:7891"],
    ["ipv4 without a port", "socks5://127.0.0.1", "127.0.0.1"],
    ["dotted host", "socks5://proxy.corp:7890", "proxy.corp:7890"],
    ["localhost", "socks5://localhost:7890", "localhost:7890"],
    ["bracketed ipv6", "socks5h://[::1]:1080", "[::1]:1080"],
  ])("still names the endpoint for a bare %s", (_label, value, expected) => {
    const { deps, warn } = socksEnvDeps(value);
    resolveYtdlpProxy(deps);
    expect(warn.mock.calls[0][0]).toContain(`SOCKS URL (${expected})`);
  });

  it.each([
    // Every shape below leaked on some earlier attempt to *find* the endpoint.
    // `new URL` and a user:pass@ regex end the userinfo at the first `/`, so
    // `ops:1234` parsed as host:port; a last-`@` boundary still printed the
    // password tail when the host was truncated; a token with dots looked
    // exactly like a hostname.
    [
      "a slash after a numeric password chunk",
      "socks5://ops:1234/5678@proxy.corp:7891",
      ["ops", "5678"],
    ],
    [
      "a slash after a named user and port-like chunk",
      "socks5://s3cretuser:443/x@proxy.corp:7891",
      ["s3cretuser"],
    ],
    ["a slash in the password", "socks5://operator:pa/ssword@127.0.0.1:7891", ["pa/ssword"]],
    ["an at-sign in the password", "socks5://operator:pa@ssword@127.0.0.1:7891", ["pa@ssword"]],
    ["an at-sign with the host truncated", "socks5://operator:pa@ssword", ["pa", "ssword"]],
    ["an at-sign and a port with no host", "socks5://operator:pa@ssword:1080", ["pa", "ssword"]],
    ["a percent-encoded credential", "socks5://operator%40corp:p%40ss@127.0.0.1:7891", ["p%40ss"]],
    ["a credential with no host at all", "socks5://operator:sup3rsecret@", ["sup3rsecret"]],
    ["userinfo in the endpoint slot", "socks5://host@user:1234", ["user"]],
    // No `@` means no positional boundary: `user:1234` is exactly `host:port`.
    ["a short numeric password and no host", "socks5://alice:1234", ["alice", "1234"]],
    ["a single-label host with no userinfo", "socks5://intranetbox:7890", ["intranetbox"]],
    // Token shapes are dotted, and a dotted all-lowercase token is a plausible
    // secret even though it is indistinguishable from a hostname by shape.
    ["a dotted token with digits", "socks5://operator.sup3rsecret", ["sup3rsecret"]],
    ["a jwt-shaped token", "socks5://eyJ1IjoiYQ.eyJwIjoiYg.sig123", ["eyJ1IjoiYQ"]],
    ["a hyphenated api key", "socks5://sk-live-abc.def", ["sk-live"]],
    ["a malformed ipv4", "socks5://5.6.7.8.9.10", ["5.6.7.8.9.10"]],
  ])("never echoes credentials shaped as %s", (_label, value, forbidden) => {
    const { deps, warn } = socksEnvDeps(value);
    resolveYtdlpProxy(deps);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0];
    for (const fragment of ["sup3rsecret", "pa/ssword", "p%40ss", ...forbidden]) {
      expect(message, `${value} leaked ${fragment}`).not.toContain(fragment);
    }
  });

  it.each([
    ["one slash", "socks5:/user:pass@host"],
    ["no slash", "socks5:user:pass@host"],
  ])("recognises the socks scheme written with %s", (_label, value) => {
    // Hand-edited exports drop or duplicate a slash; the value is still a
    // SOCKS URL the ffmpeg leg cannot use, so the verdict must not vanish.
    const { deps, warn } = socksEnvDeps(value);
    expect(resolveYtdlpProxy(deps)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).not.toContain("pass");
  });

  it("does not share dedupe state with the SOCKS-only system verdict", () => {
    // Two different paths, two different remedies: silencing one must not
    // hide the other.
    const warnings = {};
    const warn = vi.fn();
    expect(
      resolveYtdlpProxy({
        env: { http_proxy: "socks5://127.0.0.1:7891" },
        readSystemProxy: () => {
          throw new Error("must not be consulted");
        },
        warnings,
        warn,
      }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(
      resolveYtdlpProxy({
        env: {},
        readSystemProxy: () => parseScutilProxy(SCUTIL_SOCKS_ONLY),
        readLoopback: () => [],
        probe: () => "000",
        warnings,
        warn,
      }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toContain("system proxy is SOCKS-only");
  });

  it("stays silent when the lowercase http_proxy has no scheme at all", () => {
    // A bare host:port is not a SOCKS URL; it keeps the pre-#978 semantics.
    const { deps, warn } = socksEnvDeps("127.0.0.1:7897");
    expect(resolveYtdlpProxy(deps)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["https_proxy", { https_proxy: "socks5://127.0.0.1:7891" }],
    ["HTTP_PROXY", { HTTP_PROXY: "socks5://127.0.0.1:7891" }],
    ["HTTPS_PROXY", { HTTPS_PROXY: "socks5://127.0.0.1:7891" }],
  ])("warns when %s carries a SOCKS URL", (variable, env) => {
    // This path is worse than the inherited one: the seam mirrors the value
    // into the ffmpeg child's http_proxy, so the repo itself manufactures an
    // env var ffmpeg ignores. The route must not change — yt-dlp can use SOCKS
    // through --proxy — but the verdict has to be stated.
    const warnings = {};
    const warn = vi.fn();
    expect(resolveYtdlpProxy({ env, readSystemProxy: () => null, warnings, warn })).toBe(
      "socks5://127.0.0.1:7891",
    );
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0];
    expect(message).toContain(variable);
    expect(message).toContain("127.0.0.1:7891");
    expect(message).toMatch(/fail or fall back to a direct connection/);
    // Per process: the second candidate must not repeat it.
    resolveYtdlpProxy({ env, readSystemProxy: () => null, warnings, warn });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("names only the variable that actually supplied the value", () => {
    // https_proxy wins the precedence chain, so the message must not blame
    // HTTP_PROXY for a verdict the operator would fix in the wrong place.
    const warn = vi.fn();
    resolveYtdlpProxy({
      env: { https_proxy: "socks5://a.corp:1", HTTP_PROXY: "socks5://b.corp:2" },
      readSystemProxy: () => null,
      warnings: {},
      warn,
    });
    expect(warn.mock.calls[0][0]).toContain("https_proxy is a SOCKS URL (a.corp:1)");
  });

  it("does not echo a value far longer than any endpoint", () => {
    // A 1 MB export is not diagnostic, and printing it moves secret-shaped text
    // into the log at full length.
    const { deps, warn } = socksEnvDeps(`socks5://${"aa.".repeat(250000)}aa`);
    resolveYtdlpProxy(deps);
    const message = warn.mock.calls[0][0];
    expect(message).toContain("<unparseable proxy URL>");
    expect(message.length).toBeLessThan(600);
  });

  it.each([
    ["an ipv4 endpoint", "127.0.0.1", 7897],
    ["a dotted endpoint", "proxy.corp", 7890],
  ])("names the endpoint scutil reports for %s", (_label, host, port) => {
    // The warning names `host:port`, and `127.0.0.1:` reads exactly like a
    // scheme — a strip that does not require a `/` eats the host and turns a
    // useful warning into a placeholder.
    const endpoint = `${host}:${port}`;
    const warn = vi.fn();
    expect(
      resolveYtdlpProxy({
        env: {},
        readSystemProxy: () => ({
          HTTP: { enabled: false, host: null, port: null },
          HTTPS: { enabled: false, host: null, port: null },
          SOCKS: { enabled: true, host, port },
        }),
        readLoopback: () => [],
        probe: () => "000",
        warnings: {},
        warn,
      }),
    ).toBeNull();
    expect(warn.mock.calls[0][0]).toContain(`SOCKS-only (${endpoint})`);
  });
});

describe("#324 yt-dlp proxy hand-off", () => {
  const PROXY_KEYS = ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"];
  let saved;
  let savedItemGap;
  let tmp;

  beforeEach(() => {
    saved = Object.fromEntries(PROXY_KEYS.map((k) => [k, process.env[k]]));
    tmp = mkdtempSync(join(tmpdir(), "ytdlp-proxy-"));
    process.env.YTDLP_412_STATE_PATH = join(tmp, "state.json");
    // #405: the wall-clock item gap is unit-tested with an injected clock.
    savedItemGap = process.env.YTDLP_ITEM_GAP;
    process.env.YTDLP_ITEM_GAP = "0";
    execSyncMock.mockReset();
    execFileSyncMock.mockReset();
    const fail = () => {
      throw new Error("failed");
    };
    execSyncMock.mockImplementation(fail);
    execFileSyncMock.mockImplementation(fail);
  });

  afterEach(() => {
    for (const k of PROXY_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    delete process.env.YTDLP_412_STATE_PATH;
    if (savedItemGap === undefined) delete process.env.YTDLP_ITEM_GAP;
    else process.env.YTDLP_ITEM_GAP = savedItemGap;
    rmSync(tmp, { recursive: true, force: true });
  });

  /** Drop the lowercase vars, keep the uppercase ones — the ticket's failing mode. */
  function uppercaseOnly() {
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    process.env.HTTP_PROXY = "http://127.0.0.1:7897";
    process.env.HTTPS_PROXY = "http://127.0.0.1:7897";
  }

  it("downloadYtdlp passes --proxy when only the uppercase env proxy is exported", () => {
    uppercaseOnly();
    downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", join(tmp, "a.mp4"));
    const argv = fileArgv(execFileSyncMock.mock.calls[0]);
    expect(flagValue(argv, "--proxy")).toBe("http://127.0.0.1:7897");
  });

  it("downloadYtdlp omits --proxy when the lowercase proxy is already exported", () => {
    // The child inherits it through env inheritance — injecting would only
    // override yt-dlp's own no_proxy handling.
    process.env.http_proxy = "http://127.0.0.1:7897";
    process.env.https_proxy = "http://127.0.0.1:7897";
    downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", join(tmp, "b.mp4"));
    expect(fileArgv(execFileSyncMock.mock.calls[0])).not.toContain("--proxy");
  });

  it("searchYtdlp passes --proxy on the same terms", () => {
    uppercaseOnly();
    execFileSyncMock.mockImplementation(() => "BV1E7wtzaEdq\ttitle\t120\n");
    searchYtdlp("DeepSeek", "bilibili");
    const argv = fileArgv(execFileSyncMock.mock.calls[0]);
    expect(flagValue(argv, "--proxy")).toBe("http://127.0.0.1:7897");
  });

  // ─── #329: the ffmpeg leg does not depend on upstream's injection ───
  // yt-dlp only hands ffmpeg a proxy when `--proxy` is given (FFmpegFD), and
  // that is upstream behaviour this repo cannot pin. Every ffmpeg-delegated
  // spawn therefore carries the lower-case variable itself; these assertions
  // are the CI gate that keeps that true.

  it("downloadYtdlp hands the spawned child the lower-case http_proxy", () => {
    uppercaseOnly();
    downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", join(tmp, "c.mp4"));
    const opts = execFileSyncMock.mock.calls[0][2];
    expect(opts.env.http_proxy).toBe("http://127.0.0.1:7897");
  });

  it("downloadYtdlpAdapter prefixes the shell command with the lower-case http_proxy", () => {
    uppercaseOnly();
    downloadYtdlpAdapter("https://www.youtube.com/watch?v=abc");
    const cmd = execSyncMock.mock.calls[0][0];
    // The assignment rides the command word, so yt-dlp and its ffmpeg child
    // inherit it without the spawn site carrying a second mechanism.
    expect(cmd).toContain('http_proxy="http://127.0.0.1:7897" yt-dlp');
  });

  it("downloadYtdlpAdapter emits no prefix for an already-exported lower-case proxy", () => {
    process.env.http_proxy = "http://127.0.0.1:8888";
    process.env.https_proxy = "http://127.0.0.1:8888";
    downloadYtdlpAdapter("https://www.youtube.com/watch?v=abc");
    const cmd = execSyncMock.mock.calls[0][0];
    expect(cmd.startsWith("yt-dlp")).toBe(true);
    expect(cmd).not.toContain("http_proxy=");
  });

  it("leaves an exported lower-case proxy untouched (no second copy)", () => {
    process.env.http_proxy = "http://127.0.0.1:8888";
    process.env.https_proxy = "http://127.0.0.1:8888";
    downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", join(tmp, "d.mp4"));
    const opts = execFileSyncMock.mock.calls[0][2];
    expect(opts.env.http_proxy).toBe("http://127.0.0.1:8888");
  });
});

// ─── #329: real-binary probe for the ffmpeg env hand-off ───
//
// Protocol — this is a developer-machine gate, not a CI gate. It needs the
// real yt-dlp on PATH (the pipeline host has it); elsewhere the block is
// skipped, because CI carries no such guarantee and the 2026-09-25 triage
// ruled out depending on the binary or the network there.
//
// What it pins: the last hop (yt-dlp → ffmpeg) for the overlay OUR seam
// produces — the unit tests above pin that both spawn sites call
// ytdlpProxyEnv(). If yt-dlp stops copying the parent env into the ffmpeg
// child, this goes red on a machine that runs the pipeline.
//
// Offline by construction: yt-dlp reads a hand-written info JSON instead of a
// page, and a stub `ffmpeg` records its own environment instead of fetching.
// Upstream FFmpegFD's own `--proxy` injection is deliberately not asserted:
// it is no longer load-bearing, and a red test with no production impact
// would be noise.
const ytdlpVersion = spawnSync("yt-dlp", ["--version"], { encoding: "utf8", timeout: 20000 });

describe.skipIf(ytdlpVersion.status !== 0)("#329 ffmpeg env hand-off (real yt-dlp)", () => {
  it("the lower-case http_proxy reaches the ffmpeg child", () => {
    const dir = mkdtempSync(join(tmpdir(), "ytdlp-env-probe-"));
    try {
      const bin = join(dir, "bin");
      mkdirSync(bin);
      const dump = join(dir, "ffmpeg.env");
      // yt-dlp first asks ffmpeg for its bitstream-filter list, then starts the
      // download. Answer capability probes; capture the download invocation.
      writeFileSync(
        join(bin, "ffmpeg"),
        [
          "#!/bin/sh",
          'case "$1" in',
          "  -bsfs|-version) printf '\\n'; exit 0 ;;",
          "esac",
          '{ echo "ARGV: $*"; env; } > "$PROBE_DUMP"',
          "exit 1",
          "",
        ].join("\n"),
        { mode: 0o755 },
      );
      const info = join(dir, "info.json");
      writeFileSync(
        info,
        JSON.stringify({
          id: "probe",
          title: "probe",
          extractor: "generic",
          extractor_key: "Generic",
          url: "http://127.0.0.1:9/clip.mp4",
          ext: "mp4",
          protocol: "http",
          formats: [
            {
              format_id: "0",
              url: "http://127.0.0.1:9/clip.mp4",
              ext: "mp4",
              protocol: "http",
              vcodec: "h264",
              acodec: "aac",
              height: 720,
              width: 1280,
            },
          ],
        }),
      );
      // The overlay comes from the seam under test, not from the test itself,
      // so the probe covers helper → child as one chain.
      const overlay = ytdlpProxyEnv({
        env: { HTTP_PROXY: "http://127.0.0.1:18888" },
        readSystemProxy: () => null,
      });
      expect(overlay).toEqual({ http_proxy: "http://127.0.0.1:18888" });
      // Minimal child env on purpose: the stub writes its env to a temp file,
      // and the developer shell's secrets (API keys and the like) must not be
      // copied into it. No --proxy either: the overlay is what must arrive.
      const childEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG ?? "en_US.UTF-8",
        ...overlay,
        PROBE_DUMP: dump,
      };
      if (process.env.TMPDIR) childEnv.TMPDIR = process.env.TMPDIR;
      const res = spawnSync(
        "yt-dlp",
        [
          "--no-config",
          "--no-warnings",
          "--load-info-json",
          info,
          // Force the ffmpeg downloader: the native one would never spawn it.
          "--downloader",
          "http:ffmpeg",
          "--ffmpeg-location",
          bin,
          "-o",
          join(dir, "out.mp4"),
        ],
        {
          env: childEnv,
          encoding: "utf8",
          timeout: 60000,
        },
      );
      expect(existsSync(dump), `yt-dlp stderr: ${res.stderr}`).toBe(true);
      const lines = readFileSync(dump, "utf8").split("\n");
      const argvLine = lines.find((l) => l.startsWith("ARGV: ")) ?? "";
      const httpProxyLine = lines.find((l) => l.startsWith("http_proxy=")) ?? "";
      // Guard against a stub misfire: a capability probe dumping its env would
      // leave the variable visible without the download path having run.
      expect(argvLine).not.toContain("-bsfs");
      expect(argvLine).not.toContain("-version");
      expect(httpProxyLine).toBe("http_proxy=http://127.0.0.1:18888");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90000);
});
