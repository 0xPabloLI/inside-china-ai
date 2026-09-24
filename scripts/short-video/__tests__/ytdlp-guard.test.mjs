import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync } from "node:fs";
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

import {
  createYtdlp412Guard,
  matchYtdlp412,
  parseMacSystemProxy,
  removeYtdlpStaleOutput,
  resolveYtdlpOutputPath,
  resolveYtdlpProxy,
  ytdlpContainerMime,
  ytdlpCookieBrowser,
  ytdlpProxyArg,
} from "../lib/ytdlp-guard.mjs";
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

// ─── #313: youtube cookie-source policy ───

describe("ytdlpCookieBrowser", () => {
  it("routes youtube video URLs to the chrome cookie store", () => {
    expect(ytdlpCookieBrowser("https://www.youtube.com/watch?v=abc")).toBe("chrome");
    expect(ytdlpCookieBrowser("https://youtu.be/abc")).toBe("chrome");
    expect(ytdlpCookieBrowser("https://m.youtube.com/watch?v=abc")).toBe("chrome");
  });

  it("keeps firefox for every other platform (pipeline default untouched)", () => {
    expect(ytdlpCookieBrowser("https://www.bilibili.com/video/BV1E7wtzaEdq")).toBe("firefox");
    expect(ytdlpCookieBrowser("https://weibo.com/5468142257/Ri5ajjFK0")).toBe("firefox");
  });

  it("ytsearch pseudo-URLs stay firefox — the working search path gains no Keychain dependency", () => {
    expect(ytdlpCookieBrowser("ytsearch10:deepseek")).toBe("firefox");
  });

  it("falls back to firefox on non-URL input", () => {
    expect(ytdlpCookieBrowser("")).toBe("firefox");
    expect(ytdlpCookieBrowser(null)).toBe("firefox");
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
    // #324 proxy hand-off probes the macOS system proxy (scutil) before the
    // yt-dlp call on darwin, and the probe result is module-cached — so the
    // yt-dlp command is NOT reliably calls[0]. Locate it by its argv instead.
    const cmd = execSyncMock.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.startsWith("yt-dlp "));
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

  it("#313: downloadYtdlp routes youtube downloads through the chrome cookie store", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("failed");
    });
    downloadYtdlp("https://www.youtube.com/watch?v=abc", join(tmp, "yt.mp4"));
    expect(execSyncMock.mock.calls[0][0]).toContain("--cookies-from-browser chrome");
  });

  it("#313: downloadYtdlp keeps firefox for bilibili downloads", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("failed");
    });
    downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", join(tmp, "bili.mp4"));
    expect(execSyncMock.mock.calls[0][0]).toContain("--cookies-from-browser firefox");
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
    execSyncMock.mockImplementation(() => {
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
    execSyncMock.mockImplementation(() => {});
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
    execSyncMock.mockImplementation(() => {}); // this run exits 0 producing nothing
    const res = downloadYtdlp("https://www.youtube.com/watch?v=abc", dest);
    expect(res.success).toBe(false);
    expect(res.error).toContain("file not found");
    expect(existsSync(`${dest}.webm`)).toBe(false); // stale sibling cleared pre-download
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

describe("#324 system proxy parsing", () => {
  it("reads every enabled HTTP(S) protocol, skipping the nested ExceptionsList entries", () => {
    expect(parseMacSystemProxy(SCUTIL_ALL_ENABLED)).toEqual({
      httpProxy: "127.0.0.1:7897",
      httpsProxy: "127.0.0.1:7897",
    });
  });

  it("reports a disabled protocol as null even when its host/port are present", () => {
    const partial = SCUTIL_ALL_ENABLED.replace("HTTPEnable : 1", "HTTPEnable : 0");
    expect(parseMacSystemProxy(partial).httpProxy).toBeNull();
    expect(parseMacSystemProxy(partial).httpsProxy).toBe("127.0.0.1:7897");
  });

  it("yields all-null on the PAC-only configuration observed on this host", () => {
    expect(parseMacSystemProxy(SCUTIL_PAC_ONLY)).toEqual({
      httpProxy: null,
      httpsProxy: null,
    });
  });

  it("survives empty or missing input", () => {
    expect(parseMacSystemProxy("")).toEqual({ httpProxy: null, httpsProxy: null });
    expect(parseMacSystemProxy(null)).toEqual({ httpProxy: null, httpsProxy: null });
  });
});

describe("#324 proxy resolution", () => {
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
    expect(
      resolveYtdlpProxy({
        env: {},
        readSystemProxy: () => parseMacSystemProxy(SCUTIL_ALL_ENABLED),
      }),
    ).toBe("http://127.0.0.1:7897");
  });

  it("adds the http:// scheme to a bare system endpoint", () => {
    expect(
      resolveYtdlpProxy({
        env: {},
        readSystemProxy: () => ({ httpProxy: "127.0.0.1:7897", httpsProxy: null }),
      }),
    ).toBe("http://127.0.0.1:7897");
  });

  it("returns null when only SOCKS is enabled (ffmpeg cannot use SOCKS)", () => {
    // Real scutil shape: SOCKS on, HTTP/HTTPS off. parseMacSystemProxy does
    // not surface SOCKS, so this resolves to nothing rather than to an
    // endpoint ffmpeg would reject.
    const socksOnly = SCUTIL_ALL_ENABLED.replace("HTTPEnable : 1", "HTTPEnable : 0").replace(
      "HTTPSEnable : 1",
      "HTTPSEnable : 0",
    );
    expect(socksOnly).toContain("SOCKSEnable : 1");
    expect(
      resolveYtdlpProxy({ env: {}, readSystemProxy: () => parseMacSystemProxy(socksOnly) }),
    ).toBeNull();
  });

  it("returns null on a PAC-only / no-proxy configuration", () => {
    expect(
      resolveYtdlpProxy({ env: {}, readSystemProxy: () => parseMacSystemProxy(SCUTIL_PAC_ONLY) }),
    ).toBeNull();
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

describe("#324 yt-dlp proxy hand-off", () => {
  const PROXY_KEYS = ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"];
  let saved;
  let tmp;

  beforeEach(() => {
    saved = Object.fromEntries(PROXY_KEYS.map((k) => [k, process.env[k]]));
    tmp = mkdtempSync(join(tmpdir(), "ytdlp-proxy-"));
    process.env.YTDLP_412_STATE_PATH = join(tmp, "state.json");
    execSyncMock.mockReset();
    execSyncMock.mockImplementation(() => {
      throw new Error("failed");
    });
  });

  afterEach(() => {
    for (const k of PROXY_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    delete process.env.YTDLP_412_STATE_PATH;
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
    expect(execSyncMock.mock.calls[0][0]).toContain('--proxy "http://127.0.0.1:7897"');
  });

  it("downloadYtdlp omits --proxy when the lowercase proxy is already exported", () => {
    // The child inherits it through env inheritance — injecting would only
    // override yt-dlp's own no_proxy handling.
    process.env.http_proxy = "http://127.0.0.1:7897";
    process.env.https_proxy = "http://127.0.0.1:7897";
    downloadYtdlp("https://www.bilibili.com/video/BV1E7wtzaEdq", join(tmp, "b.mp4"));
    expect(execSyncMock.mock.calls[0][0]).not.toContain("--proxy ");
  });

  it("searchYtdlp passes --proxy on the same terms", () => {
    uppercaseOnly();
    execSyncMock.mockImplementation(() => "BV1E7wtzaEdq\ttitle\t120\n");
    searchYtdlp("DeepSeek", "bilibili");
    expect(execSyncMock.mock.calls[0][0]).toContain('--proxy "http://127.0.0.1:7897"');
  });
});
