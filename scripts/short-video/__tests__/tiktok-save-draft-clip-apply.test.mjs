/**
 * `--save-draft` applies the clip edit before it clicks 保存草稿 (#1102).
 *
 * The defect is not a rendering bug and not a bad click guard: the clip editor
 * overlay covers the whole action bar while a staged clip edit is open, so the
 * draft click was refused by the very guard that protects it. Measured live on
 * 2026-11-02: the centre of 保存草稿 hit `VideoClip__root`; one click on the
 * panel's own 保存 cleared both bottom buttons and the draft count went 1 → 2.
 *
 * Pinned here: the draft exit runs the same apply step as the publish exit
 * (one implementation, not a copy), the button picker prefers a candidate a
 * pointer can actually reach, and a refusal names the element that is in the
 * way — "covered" without the coverer is how this stayed a mystery.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { RESOLVE_CLICK_TARGET, TAG_BY_TEXT, clickRefusal } from "../tiktok-upload-prep.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIVER = join(__dirname, "..", "tiktok-upload-prep.mjs");
const source = readFileSync(DRIVER, "utf8");

/** Element with the geometry the browser would report (jsdom has no layout). */
function place(el, { x, y, w, h }) {
  el.getBoundingClientRect = () => ({
    x,
    y,
    width: w,
    height: h,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
  });
  return el;
}

/**
 * Model paint order: the last layer containing the point is what a real
 * `elementFromPoint` returns, and nothing outside every layer is hit.
 */
function paintStack(win, layers) {
  win.document.elementFromPoint = (x, y) => {
    let hit = null;
    for (const { el, rect } of layers) {
      const inside = x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
      if (inside) hit = el;
    }
    return hit;
  };
}

async function fixture(html) {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  // jsdom implements no scrolling; the page scripts call it before measuring.
  dom.window.Element.prototype.scrollIntoView = function scrollIntoView() {};
  return dom;
}

describe("the draft exit applies the staged clip edit first", () => {
  it("runs the shared apply step before it tags 保存草稿", () => {
    const draftStart = source.indexOf('if (hasFlag("save-draft")) {');
    expect(draftStart, "the save-draft branch is gone").toBeGreaterThan(-1);

    const apply = source.indexOf("applyClipEdit(", draftStart);
    const tagDraft = source.indexOf('TAG_BY_TEXT("保存草稿")', draftStart);
    expect(apply, "the draft branch never applies the clip edit").toBeGreaterThan(-1);
    expect(tagDraft).toBeGreaterThan(apply);
  });

  it("keeps one apply implementation shared by both exits", () => {
    // A copy in the draft branch is the defect with extra steps: the publish
    // exit's comments and its OVERLAY_CLOSED wait are the reason it works.
    expect(source.match(/async function applyClipEdit\(/g)).toHaveLength(1);
    expect(source.match(/TAG_BY_TEXT\("保存"\)/g)).toHaveLength(1);
  });

  it("does not claim the editor is prepared before the draft is saved", () => {
    // The live failure printed "✅ Editor is prepared" and then aborted. That
    // claim now belongs to the hand-over exit only; the draft exit prints its
    // own success line after the click settles.
    const draftStart = source.indexOf('if (hasFlag("save-draft")) {');
    const apply = source.indexOf("applyClipEdit(", draftStart);
    expect(apply).toBeGreaterThan(-1);
    expect(source.indexOf("✅ Editor is prepared")).toBeGreaterThan(apply);
    expect(source).toContain("✅ Draft saved — NOTHING HAS BEEN PUBLISHED.");
  });
});

describe("TAG_BY_TEXT prefers a candidate a pointer can reach", () => {
  it("tags the reachable one when two elements share the label", async () => {
    const dom = await fixture(
      `<div class="VideoClip__root" id="overlay"><div id="stale">保存草稿</div></div>
       <div id="bar"><button id="draft">保存草稿</button></div>`,
    );
    const { window } = dom;
    const overlay = window.document.getElementById("overlay");
    const stale = window.document.getElementById("stale");
    const draft = window.document.getElementById("draft");
    // The clip panel paints its own copy over a strip; the action bar sits
    // outside it, which is the state that exists after 保存 is applied.
    const overlayRect = { x: 0, y: 0, w: 400, h: 400 };
    place(overlay, overlayRect);
    place(stale, { x: 100, y: 100, w: 56, h: 20 });
    place(draft, { x: 600, y: 600, w: 56, h: 20 });
    paintStack(window, [
      { el: overlay, rect: overlayRect },
      { el: draft, rect: { x: 600, y: 600, w: 56, h: 20 } },
    ]);

    const result = JSON.parse(window.eval(TAG_BY_TEXT("保存草稿")));

    expect(result.ok).toBe(true);
    expect(result.topmost).toBe(true);
    expect(window.document.getElementById("__byText")).toBe(draft);
    dom.window.close();
  });

  it("names the coverer instead of reporting an unreachable button", async () => {
    const dom = await fixture(
      `<div class="VideoClip__root" id="overlay"></div>
       <div id="bar"><button id="draft">保存草稿</button></div>`,
    );
    const { window } = dom;
    const overlay = window.document.getElementById("overlay");
    const draft = window.document.getElementById("draft");
    // The failing state: the overlay covers the whole action bar.
    const overlayEl = place(overlay, { x: 0, y: 0, w: 1920, h: 1080 });
    place(draft, { x: 560, y: 639, w: 56, h: 20 });
    paintStack(window, [{ el: overlayEl, rect: { x: 0, y: 0, w: 1920, h: 1080 } }]);

    const result = JSON.parse(window.eval(TAG_BY_TEXT("保存草稿")));

    // "not found" would be a lie — the button is there, something is on it.
    expect(result.ok).toBe(true);
    expect(result.topmost).toBe(false);
    expect(result.blocker).toContain("VideoClip__root");
    dom.window.close();
  });
});

describe("a click refusal names the blocker", () => {
  it("reports the element covering the target's centre", async () => {
    const dom = await fixture(
      `<div class="VideoClip__root" id="overlay"></div>
       <button id="draft">保存草稿</button>`,
    );
    const { window } = dom;
    const overlay = place(window.document.getElementById("overlay"), {
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
    });
    place(window.document.getElementById("draft"), { x: 560, y: 639, w: 56, h: 20 });
    paintStack(window, [{ el: overlay, rect: { x: 0, y: 0, w: 1920, h: 1080 } }]);

    const target = JSON.parse(window.eval(RESOLVE_CLICK_TARGET("#draft")));

    expect(target.ok).toBe(true);
    expect(target.topmost).toBe(false);
    expect(target.blocker).toContain("VideoClip__root");
    expect(clickRefusal("#draft", target)).toContain("covered at its centre by");
    expect(clickRefusal("#draft", target)).toContain("VideoClip__root");
    dom.window.close();
  });

  it("still refuses without inventing a name when nothing was hit", () => {
    const message = clickRefusal("#draft", { topmost: false });
    expect(message).toContain("covered at its centre");
    expect(message).toContain("unidentified element");
  });

  it("routes the human-click guard through that message", () => {
    expect(source).toContain("clickRefusal(selector, target)");
  });
});
