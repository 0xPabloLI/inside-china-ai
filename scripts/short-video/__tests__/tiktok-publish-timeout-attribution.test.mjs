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
 * Pinned here at three levels the ticket asks for: the page script is executed
 * (not just read as source), the settle classification is a pure function, and
 * the analytics write sits behind that classification.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  PUBLISH_STATE,
  classifyPublishSettle,
  pollFor,
  publishSettled,
  publishTimeoutMessage,
} from "../tiktok-upload-prep.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIVER = join(__dirname, "..", "tiktok-upload-prep.mjs");
const source = readFileSync(DRIVER, "utf8");

const UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload";
const POST_URL = "https://www.tiktok.com/@chinaainews/video/7300000000000000000";

/** Run the real page script in jsdom; jsdom has no layout, so `innerText` is stubbed. */
async function readPublishState(html, url = UPLOAD_URL) {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    url,
    runScripts: "outside-only",
  });
  Object.defineProperty(dom.window.document.body, "innerText", {
    value: dom.window.document.body.textContent,
    configurable: true,
  });
  const state = JSON.parse(dom.window.eval(PUBLISH_STATE));
  dom.window.close();
  return state;
}

describe("PUBLISH_STATE separates the page's banner from the driver's read", () => {
  it("reports the page banner as `pageError` and never as a bare `error`", async () => {
    // `pollFor` owns `error` for its own eval failures. Reusing that key for the
    // page's text is what made the two indistinguishable after the timeout.
    const state = await readPublishState("<div>发布失败，请重试</div>");
    expect(state.pageError).toContain("发布失败");
    expect(state).not.toHaveProperty("error");
    expect(state.url).toBe(UPLOAD_URL);
  });

  it("reports no banner on a clean upload page", async () => {
    const state = await readPublishState("<div>上传视频</div>");
    expect(state.pageError).toBeNull();
    expect(state.url).toBe(UPLOAD_URL);
    expect(publishSettled(state)).toBe(false);
  });

  it("only calls a post page settled", async () => {
    expect(publishSettled(await readPublishState("<div>已发布</div>", POST_URL))).toBe(true);
  });

  it("keeps a failed read and a banner from ever reading as settled", () => {
    // An error envelope has no `url`; without `!s.error` the /upload test would
    // pass on the empty string and report a publish for a page nobody read.
    expect(publishSettled({ error: "Execution context was destroyed" })).toBe(false);
    expect(publishSettled({ pageError: "发布失败", url: POST_URL })).toBe(false);
    expect(publishSettled(null)).toBe(false);
  });
});

describe("the settle classifier names the side that failed", () => {
  it("confirms a post page with no banner", () => {
    const outcome = classifyPublishSettle({ tab: 7, last: { pageError: null, url: POST_URL } });
    expect(outcome.confirmed).toBe(true);
    expect(outcome.message).toBeNull();
  });

  it("blames TikTok only when the page itself carries the banner", () => {
    const outcome = classifyPublishSettle({
      tab: 7,
      last: { pageError: "发布失败，请重试", url: UPLOAD_URL },
    });
    expect(outcome.confirmed).toBe(false);
    expect(outcome.message).toContain("TikTok reported an error after publish");
    expect(outcome.message).toContain("发布失败，请重试");
    expect(outcome.message).not.toContain("could not read the page");
  });

  it("names the unreadable page, the tab and the last readable URL", () => {
    const outcome = classifyPublishSettle({
      tab: 7,
      last: { error: "Execution context was destroyed, most likely because of a navigation" },
      lastGood: { url: "https://www.tiktok.com/tiktokstudio/content" },
    });
    expect(outcome.confirmed).toBe(false);
    expect(outcome.message).toContain("could not read the page");
    expect(outcome.message).toContain("tab 7");
    expect(outcome.message).toContain("https://www.tiktok.com/tiktokstudio/content");
    expect(outcome.message).toContain("may be live");
    // The sentence that started this ticket: never blame TikTok for our read.
    expect(outcome.message).not.toContain("TikTok reported an error");
    // No `undefined` in operator-facing text.
    expect(outcome.message).not.toContain("undefined");
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
    const outcome = classifyPublishSettle({
      tab: 7,
      last: { pageError: null, url: UPLOAD_URL },
      lastGood: { url: UPLOAD_URL },
    });
    expect(outcome.confirmed).toBe(false);
    expect(outcome.message).toContain("still on the upload page");
    expect(outcome.message).toContain(UPLOAD_URL);
    expect(outcome.message).not.toContain("TikTok reported an error");
    expect(outcome.message).not.toContain("could not read the page");
  });

  it("says the analytics record was skipped on every unconfirmed branch", () => {
    // Acceptance 2: an unconfirmed publish is never recorded. The operator has
    // to be told on each branch, because the >48h export reminder will not fire
    // for this video.
    for (const last of [
      { pageError: "发布失败" },
      { error: "Execution context was destroyed" },
      { pageError: null, url: UPLOAD_URL },
    ]) {
      const { message } = classifyPublishSettle({ tab: 7, last, lastGood: { url: UPLOAD_URL } });
      expect(message, JSON.stringify(last)).toContain("pending-analysis.json was not written");
    }
  });

  it("treats a missing observation as unconfirmed instead of crashing", () => {
    const outcome = classifyPublishSettle({ tab: 7, last: null });
    expect(outcome.confirmed).toBe(false);
    expect(outcome.message).toContain("could not read the page");
  });
});

describe("pollFor keeps the last readable observation", () => {
  it("carries the last good URL across failing reads", async () => {
    let calls = 0;
    const result = await pollFor("TAB", "0", {
      timeoutMs: 50,
      evalFn: async () => {
        calls += 1;
        if (calls === 1) return { pageError: null, url: UPLOAD_URL };
        throw new Error("Execution context was destroyed");
      },
      sleepFn: async () => {},
      isReady: publishSettled,
    });
    expect(result.ready).toBe(false);
    expect(result.last.error).toMatch(/destroyed/);
    expect(result.lastGood.url).toBe(UPLOAD_URL);
  });

  it("feeds the same shape into the classifier end to end", async () => {
    const result = await pollFor("TAB", "0", {
      timeoutMs: 20,
      evalFn: async () => {
        throw new Error("Execution context was destroyed");
      },
      sleepFn: async () => {},
      isReady: publishSettled,
    });
    const outcome = classifyPublishSettle({ tab: 9, ...result });
    expect(result.lastGood).toBeNull();
    expect(outcome.confirmed).toBe(false);
    expect(outcome.message).toContain("tab 9");
    expect(outcome.message).toContain("no readable page");
  });
});

describe("the analytics record is written only after confirmation", () => {
  it("puts the classification throw between the poll and the write", () => {
    // Backstop for the behavioural half above: whatever the classifier says,
    // the write must sit below the only throw that can skip it.
    const poll = source.indexOf("const settled = await pollFor(tab, PUBLISH_STATE");
    const gate = source.indexOf("if (!outcome.confirmed) throw", poll);
    const confirmed = source.indexOf("publishSucceeded = true;", poll);
    const write = source.indexOf('join(outputDir, "pending-analysis.json")', poll);

    expect(poll).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(poll);
    expect(confirmed).toBeGreaterThan(gate);
    expect(write).toBeGreaterThan(confirmed);
  });

  it("has exactly one pending-analysis write in the publish branch", () => {
    const publishBranch = source.slice(
      source.indexOf("const settled = await pollFor(tab, PUBLISH_STATE"),
      source.indexOf('console.log("✅ Published.")'),
    );
    // Count the write, not the filename: the branch's own comment names the
    // file, so a text match would be satisfied by prose alone.
    expect(
      publishBranch.match(/writeFileSync\(\s*join\(outputDir, "pending-analysis\.json"\)/g) ?? [],
    ).toHaveLength(1);
  });
});
