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
  firefoxProfileCandidates,
  matchYtdlp412,
  parseFirefoxProfilesIni,
  parseMacSystemProxy,
  removeYtdlpStaleOutput,
  resolveFirefoxCookieSource,
  resolveYtdlpOutputPath,
  resolveYtdlpProxy,
  ytdlpContainerMime,
  ytdlpCookieSource,
  ytdlpProxyArg,
  ytdlpProxyEnv,
} from "../lib/ytdlp-guard.mjs";
import { searchYtdlp, downloadYtdlp } from "../lib/asset-sourcer.mjs";
import { downloadYtdlpAdapter } from "../lib/video-downloaders.mjs";

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

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ytdlp-guard-"));
    process.env.YTDLP_412_STATE_PATH = join(tmp, "state.json");
    execSyncMock.mockReset();
    execFileSyncMock.mockReset();
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

describe("#324 system proxy parsing", () => {
  it("reads every enabled HTTP(S)/SOCKS protocol, skipping the nested ExceptionsList entries", () => {
    expect(parseMacSystemProxy(SCUTIL_ALL_ENABLED)).toEqual({
      httpProxy: "127.0.0.1:7897",
      httpsProxy: "127.0.0.1:7897",
      // #329: SOCKS is surfaced so the SOCKS-only verdict can name the
      // endpoint ffmpeg cannot use instead of resolving to a bare null.
      socksProxy: "127.0.0.1:7897",
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
      socksProxy: null,
    });
  });

  it("survives empty or missing input", () => {
    expect(parseMacSystemProxy("")).toEqual({
      httpProxy: null,
      httpsProxy: null,
      socksProxy: null,
    });
    expect(parseMacSystemProxy(null)).toEqual({
      httpProxy: null,
      httpsProxy: null,
      socksProxy: null,
    });
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

  it("returns null and warns once when only SOCKS is enabled (ffmpeg cannot use SOCKS)", () => {
    // #329: ffmpeg has no SOCKS support and yt-dlp only report_warning's about
    // it, so a SOCKS-only system config leaves the `--download-sections` leg
    // direct-connected. The verdict stays "no proxy", but it is now a stated
    // one instead of a silent null.
    expect(SCUTIL_SOCKS_ONLY).toContain("SOCKSEnable : 1");
    const warnings = {};
    const warn = vi.fn();
    const deps = {
      env: {},
      readSystemProxy: () => parseMacSystemProxy(SCUTIL_SOCKS_ONLY),
      warnings,
      warn,
    };
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
    expect(
      resolveYtdlpProxy({
        env: {},
        readSystemProxy: () => parseMacSystemProxy(SCUTIL_ALL_ENABLED),
        warnings: {},
        warn,
      }),
    ).toBe("http://127.0.0.1:7897");
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn when an env proxy already decides the route", () => {
    const warn = vi.fn();
    expect(
      resolveYtdlpProxy({
        env: { HTTP_PROXY: "http://127.0.0.1:7897" },
        readSystemProxy: () => parseMacSystemProxy(SCUTIL_SOCKS_ONLY),
        warnings: {},
        warn,
      }),
    ).toBe("http://127.0.0.1:7897");
    expect(warn).not.toHaveBeenCalled();
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

  it("downloadYtdlpAdapter hands the shell-spawned child the lower-case http_proxy", () => {
    uppercaseOnly();
    downloadYtdlpAdapter("https://www.youtube.com/watch?v=abc");
    const opts = execSyncMock.mock.calls[0][1];
    expect(opts.env.http_proxy).toBe("http://127.0.0.1:7897");
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
