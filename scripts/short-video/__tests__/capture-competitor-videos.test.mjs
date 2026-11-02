/**
 * #300 stage 2 — competitor capture gates and ranking.
 * #748 — the identity gate that keeps a wrong handle out of the corpus.
 *
 * Why the gate cases matter more than the happy path: every failure mode here
 * is *silent* in production. A wrong CDP profile turns every later verdict into
 * a projection of "not logged in" (2026-09-22 incident); a HK exit makes TikTok
 * serve a region page that reads as "this account has no videos"; and a wrong
 * handle makes a stranger's videos look like a competitor sample (2026-11-02:
 * `@allsiekmiller` never existed, `@natebjones` was a 35-follower account, and
 * both landed in the manifest as `videos: []` / off-niche rows with
 * `error: null`). The assertions therefore pin ordering — a failed gate must
 * stop before listing or downloading — and pin that an unprovable identity is
 * written as an error, never as an empty sample.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, readFileSync } from "fs";

const state = vi.hoisted(() => ({
  profileVerdict: { status: "ok", message: "ok", fixCommand: null },
  traceText: "fl=1\nloc=JP\ncolo=NRT\n",
  // Grid payload, minus identity: the mock fills uniqueId/nickname from the tab
  // it was asked about, so a test cannot accidentally pass by reusing the
  // previous account's identity.
  profile: {
    regionBlocked: false,
    gridError: false,
    notFound: false,
    items: [],
    followerCount: 100000,
    videoCount: 0,
  },
  identityOverride: {},
  // Number of profile reads that return no identity block (the "Please wait" shell).
  blankReads: 0,
  tabs: new Map(),
  ready: "ready",
}));

vi.mock("../lib/cdp-profile-guard.mjs", () => ({
  checkAutomationProfile: vi.fn(async () => state.profileVerdict),
  formatVerdict: vi.fn((v) => v.message),
}));

vi.mock("../lib/cdp-client.mjs", () => ({
  CDP_BASE: "http://localhost:3456",
  cdpNewTab: vi.fn(async (url) => {
    const id = `tab-${state.tabs.size}`;
    state.tabs.set(id, url);
    return id;
  }),
  cdpCloseTab: vi.fn(async () => {}),
  // The real proxy answers `{result:{value}}` — returning a bare string here
  // once hid the unwrap bug (droid-review P1): both gates silently fell through
  // to their fallbacks against the real proxy, so a HK run looked like "no
  // videos" and the HK guard read as "unknown".
  cdpEval: vi.fn(async (tabId, script) => {
    // #964: the exit gate now reads the trace page body through the shared
    // probe instead of fetching it from a page script.
    if (script === "document.body.innerText" || script.includes("cdn-cgi/trace")) {
      return { result: { value: state.traceText } };
    }
    // Readiness probe: runs before the grid extractor and never touches it.
    if (script.includes("return 'waiting'")) {
      return { result: { value: state.ready } };
    }
    if (script.includes("user-post-item")) {
      const url = state.tabs.get(tabId) ?? "";
      const handle = url.includes("@") ? url.split("@")[1] : null;
      if (state.blankReads > 0) {
        // A tab that never renders its identity block (the "Please wait" shell).
        state.blankReads -= 1;
        return {
          result: {
            value: JSON.stringify({
              count: 0,
              uniqueId: null,
              nickname: null,
              regionBlocked: false,
              gridError: false,
              notFound: false,
              items: [],
            }),
          },
        };
      }
      const payload = {
        count: state.profile.items.length,
        uniqueId: handle,
        nickname: handle,
        ...state.profile,
        ...state.identityOverride,
      };
      return { result: { value: JSON.stringify(payload) } };
    }
    return { result: { value: "scrolled" } };
  }),
}));

vi.mock("../lib/video-downloaders.mjs", () => ({
  downloadVideo: vi.fn(async (url) => ({
    status: "ok",
    strategy: "ytdlp",
    sourceUrl: url,
    byteLength: 1234,
    buffer: Buffer.from([1, 2, 3, 4]),
  })),
}));

const {
  parsePlayCount,
  normalizeTikTokVideoUrl,
  normalizeDisplayName,
  identityVerdict,
  forTerminal,
  nicheVerdict,
  verifyAccount,
  sanitizeHandle,
  BENCH_ACCOUNTS,
  parseAccountsArg,
  captureCompetitorVideos,
  verifyCompetitorProfiles,
} = await import("../capture-competitor-videos.mjs");
const { cdpNewTab } = await import("../lib/cdp-client.mjs");
const { downloadVideo } = await import("../lib/video-downloaders.mjs");

const video = (id, views, handle = "x") => ({
  id,
  views,
  href: `https://www.tiktok.com/@${handle}/video/${id}`,
});

describe("sanitizeHandle (#300 stage 2)", () => {
  it("keeps the charset TikTok handles use", () => {
    expect(sanitizeHandle("rileybrown.ai")).toBe("rileybrown.ai");
    expect(sanitizeHandle("thechriswinfield")).toBe("thechriswinfield");
    expect(sanitizeHandle("user_1-2")).toBe("user_1-2");
  });

  it("strips path separators so a handle cannot escape the output dir", () => {
    expect(sanitizeHandle("../../etc/passwd")).not.toContain("/");
    expect(sanitizeHandle("a/b")).toBe("ab");
    expect(sanitizeHandle("C:\\tmp")).toBe("Ctmp");
  });

  it("returns an empty string for empty input (caller skips it)", () => {
    expect(sanitizeHandle("")).toBe("");
    expect(sanitizeHandle(null)).toBe("");
  });
});

describe("normalizeTikTokVideoUrl (#300 stage 2)", () => {
  it("leaves an absolute href untouched", () => {
    const abs = "https://www.tiktok.com/@rileybrown.ai/video/7309572377577393451";
    expect(normalizeTikTokVideoUrl(abs)).toBe(abs);
  });

  it("strips the query string and never double-prefixes the origin", () => {
    const url = normalizeTikTokVideoUrl(
      "https://www.tiktok.com/@x/video/123?is_from_webapp=1&lang=en",
    );
    expect(url).toBe("https://www.tiktok.com/@x/video/123");
    expect(url).not.toMatch(/tiktok\.comhttps/);
  });

  it("still resolves a relative href (site migration guard)", () => {
    expect(normalizeTikTokVideoUrl("/@x/video/123")).toBe("https://www.tiktok.com/@x/video/123");
  });

  it("returns an empty string for missing or blank hrefs", () => {
    expect(normalizeTikTokVideoUrl(undefined)).toBe("");
    expect(normalizeTikTokVideoUrl("")).toBe("");
    expect(normalizeTikTokVideoUrl("   ")).toBe("");
  });
});

describe("parsePlayCount (#300 stage 2)", () => {
  it("parses the K/M labels TikTok renders", () => {
    expect(parsePlayCount("965")).toBe(965);
    expect(parsePlayCount("177.5K")).toBe(177500);
    expect(parsePlayCount("2.1M")).toBe(2100000);
    expect(parsePlayCount("1,234")).toBe(1234);
    expect(parsePlayCount("1.2B")).toBe(1200000000);
  });

  it("returns 0 for empty or unparsable labels rather than NaN", () => {
    expect(parsePlayCount("")).toBe(0);
    expect(parsePlayCount(undefined)).toBe(0);
    expect(parsePlayCount("No views")).toBe(0);
  });
});

describe("identity gate (#748)", () => {
  it("folds display names to comparable cores", () => {
    expect(normalizeDisplayName("Maverick Maltin | AI & ChatGPT")).toBe("maverickmaltinaichatgpt");
    expect(normalizeDisplayName("  Allie K. Miller ")).toBe("alliek miller".replace(/\s/g, ""));
  });

  it("does not let a stranger nicknamed 'AI' pass as Maverick Maltin", () => {
    // Substring matching would: "ai" is inside "maverickmaltinaichatgpt".
    const v = identityVerdict(
      { handle: "maverickgpt", displayName: "Maverick Maltin | AI & ChatGPT" },
      { uniqueId: "maverickgpt", nickname: "AI" },
    );
    expect(v.status).toBe("nickname-mismatch");
  });

  it("does not accept a fragment of a short alias", () => {
    const v = identityVerdict(
      { handle: "nate.b.jones", displayName: "Nate B. Jones", aliases: ["Nate"] },
      { uniqueId: "nate.b.jones", nickname: "te" },
    );
    expect(v.status).toBe("nickname-mismatch");
  });

  it("accepts a page whose display name is its own handle, and says the evidence is weaker", () => {
    const v = identityVerdict(
      { handle: "rileybrown.ai", displayName: "Riley Brown" },
      { uniqueId: "rileybrown.ai", nickname: "rileybrown.ai" },
    );
    expect(v.status).toBe("ok");
    expect(v.reason).toContain("no independent name");
  });

  it("needs a declared alias when the page's name folds differently from the declared one", () => {
    // Declared name carries a suffix the page does not have, and the page joins
    // the words the declaration separates: no contiguous run of tokens matches.
    const bare = identityVerdict(
      { handle: "maverickgpt", displayName: "Maverick Maltin | AI & ChatGPT" },
      { uniqueId: "maverickgpt", nickname: "MaverickMaltin" },
    );
    expect(bare.status).toBe("nickname-mismatch");
    const aliased = identityVerdict(
      {
        handle: "maverickgpt",
        displayName: "Maverick Maltin | AI & ChatGPT",
        aliases: ["MaverickMaltin"],
      },
      { uniqueId: "maverickgpt", nickname: "MaverickMaltin" },
    );
    expect(aliased.status).toBe("ok");
  });

  it("strips control characters from page-supplied names before they are printed or stored", () => {
    expect(forTerminal("Eve\u001b[2J\u001b[31mred")).toBe("Eve [2J [31mred");
    expect(forTerminal(null)).toBe("");
    expect(forTerminal("x".repeat(200)).length).toBe(120);
  });

  it("fails closed on a malformed niche", () => {
    expect(nicheVerdict({ handle: "x", niche: "core" }).status).toBe("ok");
    expect(nicheVerdict({ handle: "x", niche: "adjacent" }).status).toBe("ok");
    expect(nicheVerdict({ handle: "x" }).status).toBe("ok");
    expect(nicheVerdict({ handle: "x", niche: "adjecent" }).status).toBe("niche-invalid");
    expect(nicheVerdict({ handle: "x", niche: "off" }).status).toBe("niche-invalid");
  });

  it("accepts the expected handle and nickname", () => {
    const v = identityVerdict(
      { handle: "rileybrown.ai", displayName: "Riley Brown" },
      { uniqueId: "rileybrown.ai", nickname: "Riley Brown" },
    );
    expect(v.status).toBe("ok");
  });

  it("accepts a page nickname that is a short form of the declared name", () => {
    // The real @nate.b.jones page shows "Nate"; its declared name is "Nate B. Jones".
    const v = identityVerdict(
      { handle: "nate.b.jones", displayName: "Nate B. Jones" },
      { uniqueId: "nate.b.jones", nickname: "Nate" },
    );
    expect(v.status).toBe("ok");
  });

  it("accepts a declared alias when the page shows a different name", () => {
    const v = identityVerdict(
      { handle: "shedoesai", displayName: "Gunhild Johanne Reumert", aliases: ["Johanne"] },
      { uniqueId: "shedoesai", nickname: "Johanne" },
    );
    expect(v.status).toBe("ok");
  });

  it("rejects a page whose uniqueId is a different handle", () => {
    const v = identityVerdict({ handle: "alliekmiller" }, { uniqueId: "allie.k.miller" });
    expect(v.status).toBe("handle-mismatch");
    expect(v.reason).toContain("allie.k.miller");
  });

  it("rejects a stranger who holds the expected handle", () => {
    // This is the 2026-11-02 @natebjones case: the handle matched, the person did not.
    const v = identityVerdict(
      { handle: "natebjones", displayName: "Nate B. Jones" },
      { uniqueId: "natebjones", nickname: "user3796273088564" },
    );
    expect(v.status).toBe("nickname-mismatch");
    expect(v.reason).toContain("user3796273088564");
  });

  it("rejects a missing nickname — unprovable is not the same as fine", () => {
    const v = identityVerdict(
      { handle: "x", displayName: "Somebody" },
      { uniqueId: "x", nickname: null },
    );
    expect(v.status).toBe("nickname-mismatch");
  });

  it("reports not-found before anything else", () => {
    const v = identityVerdict(
      { handle: "allsiekmiller", displayName: "Allie K. Miller" },
      { notFound: true },
    );
    expect(v.status).toBe("not-found");
    expect(v.reason).toContain("allsiekmiller");
  });

  it("refuses to verify a handle with no declared display name (ad-hoc runs must name the person)", () => {
    const v = identityVerdict({ handle: "someone" }, { uniqueId: "someone", nickname: "Whatever" });
    expect(v.status).toBe("unverified");
    expect(v.reason).toContain("no display name declared");
  });

  it("parses --accounts in both forms", () => {
    expect(parseAccountsArg("rileybrown.ai")).toEqual([
      expect.objectContaining({ handle: "rileybrown.ai", displayName: "Riley Brown" }),
    ]);
    expect(parseAccountsArg("@someone=Some One, other")).toEqual([
      expect.objectContaining({ handle: "someone", displayName: "Some One" }),
      // An undeclared ad-hoc handle carries no placeholder keys.
      { handle: "other", displayName: undefined },
    ]);
  });

  it("builds an auditable record from a profile read", () => {
    const { verdict, record } = verifyAccount(
      { handle: "rileybrown.ai", displayName: "Riley Brown", followers: "636.7K", niche: "core" },
      {
        identity: {
          uniqueId: "rileybrown.ai",
          nickname: "Riley Brown",
          followerCount: 638800,
          videoCount: 398,
        },
        items: [video("1", "1K", "rileybrown.ai")],
        gridError: false,
        notFound: false,
      },
    );
    expect(verdict.status).toBe("ok");
    expect(record).toMatchObject({
      handle: "rileybrown.ai",
      declaredFollowers: "636.7K",
      observedFollowers: 638800,
      niche: "core",
      listedVideos: 1,
      status: "ok",
    });
    expect(record.url).toBe("https://www.tiktok.com/@rileybrown.ai");
    expect(record.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("bench frame (#748)", () => {
  it("uses the verified handles, not the two wrong ones", () => {
    const handles = BENCH_ACCOUNTS.map((a) => a.handle);
    expect(handles).toContain("nate.b.jones");
    expect(handles).toContain("alliekmiller");
    expect(handles).not.toContain("natebjones");
    expect(handles).not.toContain("allsiekmiller");
    expect(new Set(handles).size).toBe(handles.length);
  });

  it("declares a niche verdict for every account", () => {
    for (const account of BENCH_ACCOUNTS) {
      expect(["core", "adjacent"]).toContain(account.niche);
      expect(account.displayName).toBeTruthy();
    }
    expect(BENCH_ACCOUNTS.filter((a) => a.niche === "adjacent").map((a) => a.handle)).toEqual([
      "marcus.dipaola",
      "kanekallaway",
    ]);
  });
});

describe("captureCompetitorVideos gates (#300 stage 2)", () => {
  const outDir = join(tmpdir(), `competitor-capture-test-${process.pid}`);

  beforeEach(() => {
    vi.clearAllMocks();
    state.profileVerdict = { status: "ok", message: "ok", fixCommand: null };
    state.traceText = "fl=1\nloc=JP\ncolo=NRT\n";
    state.profile = {
      ...state.profile,
      items: [],
      regionBlocked: false,
      gridError: false,
      notFound: false,
      followerCount: 100000,
      videoCount: 0,
    };
    state.identityOverride = {};
    state.blankReads = 0;
    state.tabs.clear();
    state.ready = "ready";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records a malformed niche as a gate failure instead of sampling", async () => {
    vi.useFakeTimers();
    state.profile.items = [video("1", "1K")];

    const pending = captureCompetitorVideos({
      accounts: [{ handle: "x", displayName: "X", niche: "adjecent" }],
      topN: 1,
      outDir,
    });
    await vi.runAllTimersAsync();
    const manifest = await pending;

    expect(manifest.accounts[0].error).toMatch(/niche gate failed.*adjecent/);
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("stops on a wrong CDP profile before opening any page", async () => {
    state.profileVerdict = {
      status: "wrong-profile",
      message: "port 9229 carries ~/.chrome-cdp, not the automation profile",
      fixCommand: "open -na ...",
    };

    await expect(captureCompetitorVideos({ accounts: ["someone"], outDir })).rejects.toThrow(
      /CDP profile gate failed/,
    );
    expect(cdpNewTab).not.toHaveBeenCalled();
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("stops on a HK exit before listing or downloading", async () => {
    // TikTok serves an "unavailable in your region" page from HK and reports no
    // error, so this must abort rather than record "0 videos".
    state.traceText = "fl=1\nloc=HK\ncolo=HKG\n";

    await expect(captureCompetitorVideos({ accounts: ["someone"], outDir })).rejects.toThrow(
      /exit gate failed.*HK/s,
    );
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("ranks by parsed plays, not by the label string", async () => {
    vi.useFakeTimers();
    state.profile.items = [video("1", "965"), video("2", "177.5K"), video("3", "9.2K")];

    const pending = captureCompetitorVideos({
      accounts: [{ handle: "x", displayName: "X" }],
      topN: 2,
      outDir,
    });
    await vi.runAllTimersAsync();
    const manifest = await pending;

    // "965" < "9.2K" < "177.5K" — a string sort would have ordered 965 last.
    expect(manifest.accounts[0].videos.map((v) => v.id)).toEqual(["2", "3"]);
    expect(manifest.accounts[0].videos[0].plays).toBe(177500);
    expect(manifest.exit).toBe("JP");
  });

  it("hands the downloader a clean absolute URL (regression: 0/36 batch on 2026-10-17)", async () => {
    // The profile grid's href is already absolute. The old extractor prefixed
    // the origin unconditionally, yielding host `www.tiktok.comhttps` → every
    // download failed as `unsupported-by-downloader`. The URL passed to
    // downloadVideo must be exactly the href, not a re-prefixed one.
    vi.useFakeTimers();
    state.profile.items = [video("7309572377577393451", "309.9K", "rileybrown.ai")];

    const pending = captureCompetitorVideos({
      accounts: [{ handle: "rileybrown.ai", displayName: "Riley Brown" }],
      topN: 1,
      outDir,
    });
    await vi.runAllTimersAsync();
    const manifest = await pending;

    const [first] = manifest.accounts[0].videos;
    expect(first.url).toBe("https://www.tiktok.com/@rileybrown.ai/video/7309572377577393451");
    expect(first.url).not.toMatch(/tiktok\.comhttps/);
    expect(downloadVideo).toHaveBeenCalledWith(first.url);
    expect(first.file).toBeTruthy();
  });

  it("records a region-blocked page as an error on the account entry", async () => {
    vi.useFakeTimers();
    state.profile.regionBlocked = true;

    const pending = captureCompetitorVideos({
      accounts: [{ handle: "x", displayName: "X" }],
      topN: 5,
      outDir,
    });
    await vi.runAllTimersAsync();
    const manifest = await pending;

    expect(manifest.accounts[0].error).toMatch(/region-blocked/);
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("blames the exit node, not the handle, when a region page also has no identity block", async () => {
    // This is what a region-blocked profile actually looks like: no hydration
    // payload, so uniqueId is empty. Judging identity first would report "wrong
    // handle" and send the operator to fix the wrong thing.
    vi.useFakeTimers();
    state.profile.regionBlocked = true;
    state.identityOverride = { uniqueId: null, nickname: null };

    const pending = captureCompetitorVideos({
      accounts: [{ handle: "x", displayName: "X" }],
      topN: 5,
      outDir,
    });
    await vi.runAllTimersAsync();
    const manifest = await pending;

    expect(manifest.accounts[0].error).toMatch(/region-blocked/);
    expect(manifest.accounts[0].error).not.toMatch(/identity gate/);
  });

  // The identity-gate behaviour cases live in capture-competitor-identity-gate.test.mjs:
  // they import only the pre-#748 export surface, so they can be run against the old
  // implementation as a genuine red baseline instead of an import error.

  it("retries a tab that never rendered its identity block (#748, the real @shedoesai case)", async () => {
    vi.useFakeTimers();
    // Three blank reads = every extract round of the first tab (LIST_SCROLL_ROUNDS).
    state.blankReads = 3;
    state.profile.items = [video("1", "1K")];

    const pending = captureCompetitorVideos({
      accounts: [{ handle: "x", displayName: "X" }],
      topN: 1,
      outDir,
    });
    await vi.runAllTimersAsync();
    const manifest = await pending;

    expect(manifest.accounts[0].error).toBeNull();
    expect(manifest.accounts[0].identity.status).toBe("ok");
    expect(cdpNewTab).toHaveBeenCalledTimes(3); // trace + first profile tab + retry
  });

  it("records the identity and niche verdict in the manifest", async () => {
    vi.useFakeTimers();
    state.profile.items = [video("1", "1K")];

    const pending = captureCompetitorVideos({
      accounts: [{ handle: "x", displayName: "X", niche: "core", followers: "100K" }],
      topN: 1,
      outDir,
    });
    await vi.runAllTimersAsync();
    const manifest = await pending;

    expect(manifest.accounts[0]).toMatchObject({
      handle: "x",
      displayName: "X",
      niche: "core",
      observedFollowers: 100000,
      observedNickname: "x",
    });
    expect(manifest.accounts[0].identity.status).toBe("ok");
    expect(manifest.accounts[0].identity.url).toBe("https://www.tiktok.com/@x");
  });
});

describe("verifyCompetitorProfiles (#748)", () => {
  const outDir = join(tmpdir(), `competitor-verify-test-${process.pid}`);

  beforeEach(() => {
    vi.clearAllMocks();
    state.profileVerdict = { status: "ok", message: "ok", fixCommand: null };
    state.traceText = "fl=1\nloc=JP\ncolo=NRT\n";
    state.profile = {
      ...state.profile,
      items: [],
      regionBlocked: false,
      gridError: false,
      notFound: false,
      followerCount: 100000,
      videoCount: 0,
    };
    state.identityOverride = {};
    state.blankReads = 0;
    state.tabs.clear();
    state.ready = "ready";
  });

  it("writes the audit artifact and downloads nothing", async () => {
    vi.useFakeTimers();
    state.profile.items = [video("1", "1K", "rileybrown.ai")];

    const pending = verifyCompetitorProfiles({
      accounts: [{ handle: "rileybrown.ai", displayName: "Riley Brown", niche: "core" }],
      outDir,
    });
    await vi.runAllTimersAsync();
    const artifact = await pending;

    expect(downloadVideo).not.toHaveBeenCalled();
    expect(artifact.results[0]).toMatchObject({
      handle: "rileybrown.ai",
      status: "ok",
      niche: "core",
    });
    expect(artifact.exit).toBe("JP");
    const file = join(outDir, "profile-verification.json");
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8")).results[0].handle).toBe("rileybrown.ai");
    vi.useRealTimers();
  });
});
