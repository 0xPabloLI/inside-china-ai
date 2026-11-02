/**
 * The publish exit must not blame TikTok for the driver's own failed reads (#1106).
 *
 * `pollFor` treats an eval that fails mid-navigation as "not ready yet" and keeps
 * polling — correct, because aborting would report failure for a publish that
 * succeeded. The defect was downstream: `PUBLISH_STATE` wrote the page's banner
 * and `pollFor` wrote the eval error into the same `error` field, so after the
 * 45 s timeout both printed as "TikTok reported an error after publish". An
 * operator reading that sentence on a post that is already live is one re-run
 * away from a duplicate.
 *
 * Pinned here at the two levels the ticket asks for: the message classification
 * (page banner vs unreadable page) and the accounting (the analytics record is
 * written only after the publish is confirmed).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pollFor, publishTimeoutMessage } from "../tiktok-upload-prep.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIVER = join(__dirname, "..", "tiktok-upload-prep.mjs");
const source = readFileSync(DRIVER, "utf8");

const UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload?from=upload";

describe("PUBLISH_STATE separates the page's banner from the driver's read", () => {
  it("reports the page banner as `pageError`, never as a bare `error`", () => {
    // `pollFor` owns `error` for its own eval failures. Reusing that key for the
    // page's text is what made the two indistinguishable after the timeout.
    const publishState = source.match(/const PUBLISH_STATE = `([\s\S]*?)`;/);
    expect(publishState).toBeTruthy();
    expect(publishState[1]).toContain("pageError");
    expect(publishState[1]).not.toMatch(/\n\s+error,/);
  });

  it("keeps an eval failure from ever reading as ready", () => {
    // An error envelope has no `url`; without `!s.error` the /upload test would
    // pass on the empty string and report a publish for a page nobody read.
    expect(source).toContain(
      'isReady: (s) => !!s && !s.error && !s.pageError && !/\\/upload/.test(s.url || "")',
    );
  });
});

describe("the timeout message names the side that failed", () => {
  it("blames TikTok only when the page itself carries the banner", () => {
    const message = publishTimeoutMessage({
      tab: 7,
      last: { pageError: "发布失败，请重试", url: UPLOAD_URL },
      lastGood: { url: UPLOAD_URL },
    });
    expect(message).toContain("TikTok reported an error after publish");
    expect(message).toContain("发布失败，请重试");
    expect(message).not.toContain("could not read the page");
  });

  it("names the unreadable page, the tab and the last readable URL", () => {
    const message = publishTimeoutMessage({
      tab: 7,
      last: { error: "Execution context was destroyed, most likely because of a navigation" },
      lastGood: { url: "https://www.tiktok.com/tiktokstudio/content" },
    });
    expect(message).toContain("could not read the page");
    expect(message).toContain("tab 7");
    expect(message).toContain("https://www.tiktok.com/tiktokstudio/content");
    expect(message).toContain("may be live");
    // The sentence that started this ticket: never blame TikTok for our read.
    expect(message).not.toContain("TikTok reported an error");
    // No `undefined` in operator-facing text.
    expect(message).not.toContain("undefined");
  });

  it("still says where to look when no read succeeded after the click", () => {
    const message = publishTimeoutMessage({
      tab: 7,
      last: { error: "Execution context was destroyed" },
      lastGood: null,
    });
    expect(message).toContain("tab 7");
    expect(message).toContain("no readable page");
    expect(message).not.toContain("undefined");
  });

  it("keeps the plain timeout distinguishable from both failure sides", () => {
    const message = publishTimeoutMessage({
      tab: 7,
      last: { pageError: null, url: UPLOAD_URL },
      lastGood: { url: UPLOAD_URL },
    });
    expect(message).toContain("still on the upload page");
    expect(message).toContain(UPLOAD_URL);
    expect(message).not.toContain("TikTok reported an error");
    expect(message).not.toContain("could not read the page");
  });

  it("says the analytics record was not written while the publish is unconfirmed", () => {
    // Acceptance 2: an unconfirmed publish is never recorded. The operator has
    // to be told, because the >48h export reminder will not fire for it.
    const message = publishTimeoutMessage({
      tab: 7,
      last: { error: "Execution context was destroyed" },
      lastGood: { url: UPLOAD_URL },
    });
    expect(message).toContain("pending-analysis.json was not written");
  });
});

describe("pollFor keeps the last readable observation", () => {
  it("carries the last good URL across failing reads", async () => {
    let calls = 0;
    const result = await pollFor("TAB", "0", {
      timeoutMs: 50,
      evalFn: async () => {
        calls += 1;
        if (calls === 1)
          return { pageError: null, url: "https://www.tiktok.com/tiktokstudio/upload" };
        throw new Error("Execution context was destroyed");
      },
      sleepFn: async () => {},
      isReady: (s) => !!s && !s.error && !s.pageError && !/\/upload/.test(s.url || ""),
    });
    expect(result.ready).toBe(false);
    expect(result.last.error).toMatch(/destroyed/);
    expect(result.lastGood.url).toBe("https://www.tiktok.com/tiktokstudio/upload");
  });

  it("feeds the same shape into the message end to end", async () => {
    const result = await pollFor("TAB", "0", {
      timeoutMs: 20,
      evalFn: async () => {
        throw new Error("Execution context was destroyed");
      },
      sleepFn: async () => {},
      isReady: (s) => !!s && !s.error && !s.pageError && !/\/upload/.test(s.url || ""),
    });
    const message = publishTimeoutMessage({ tab: 9, ...result });
    expect(result.lastGood).toBeNull();
    expect(message).toContain("tab 9");
    expect(message).toContain("no readable page");
  });
});

describe("the analytics record is written only after confirmation", () => {
  it("places the pending-analysis write after `publishSucceeded = true`", () => {
    const poll = source.indexOf("const settled = await pollFor(tab, PUBLISH_STATE");
    const giveUp = source.indexOf("if (!settled.ready) {", poll);
    const confirmed = source.indexOf("publishSucceeded = true;", poll);
    const write = source.indexOf('join(outputDir, "pending-analysis.json")', poll);

    expect(poll).toBeGreaterThan(-1);
    expect(giveUp).toBeGreaterThan(poll);
    expect(confirmed).toBeGreaterThan(giveUp);
    expect(write).toBeGreaterThan(confirmed);
  });
});
