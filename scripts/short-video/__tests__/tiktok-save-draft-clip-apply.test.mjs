/**
 * `--save-draft` applies the clip edit before it clicks 保存草稿 (#1102).
 *
 * The defect is not a rendering bug and not a bad click guard: the clip editor
 * overlay covers the whole action bar while a staged clip edit is open, so the
 * draft click was refused by the very guard that protects it. Measured live on
 * 2026-11-02: the centre of 保存草稿 hit `VideoClip__root`; one click on the
 * panel's own 保存 cleared both bottom buttons and the draft count went 1 → 2.
 *
 * Pinned here at two levels: the page scripts are driven against a modelled
 * paint order (so the ordering is demonstrated, not just grep'd), and the draft
 * exit is pinned to the shared apply step rather than a copy of it.
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

const draftBarHtml = `
  <div class="VideoClip__root" id="overlay">
    <div id="panel-save">保存</div>
    <div id="panel-draft">保存草稿</div>
  </div>
  <div id="bar"><button id="bar-draft">保存草稿</button></div>`;

const overlayRect = { x: 0, y: 0, w: 1920, h: 1080 };
const barDraftRect = { x: 560, y: 639, w: 56, h: 20 };

/**
 * The live state: the clip panel is open, so it paints over the action bar and
 * its own 保存 is the only reachable action.
 */
function openPanelState(win) {
  const refs = {
    overlay: win.document.getElementById("overlay"),
    panelSave: win.document.getElementById("panel-save"),
    panelDraft: win.document.getElementById("panel-draft"),
    barDraft: win.document.getElementById("bar-draft"),
  };
  const { overlay, panelSave, panelDraft, barDraft } = refs;
  const panelSaveRect = { x: 1522, y: 24, w: 28, h: 20 };
  const panelDraftRect = { x: 100, y: 100, w: 56, h: 20 };
  place(overlay, overlayRect);
  place(panelSave, panelSaveRect);
  place(panelDraft, panelDraftRect);
  place(barDraft, barDraftRect);
  // The live measurement (2026-11-02): the panel's own 保存 answered for
  // itself, while 保存草稿 — both the panel copy and the bar copy — hit
  // `VideoClip__root` instead. Model exactly that: the overlay paints over
  // everything except the panel's 保存.
  paintStack(win, [
    { el: barDraft, rect: barDraftRect },
    { el: panelDraft, rect: panelDraftRect },
    { el: overlay, rect: overlayRect },
    { el: panelSave, rect: panelSaveRect },
  ]);
  return refs;
}

/** After 保存: the panel is gone, so the action bar is reachable. */
function closedPanelState(win, { overlay, panelSave, panelDraft, barDraft }) {
  const gone = { x: 0, y: 0, w: 0, h: 0 };
  place(overlay, gone);
  place(panelSave, gone);
  place(panelDraft, gone);
  paintStack(win, [{ el: barDraft, rect: barDraftRect }]);
}

describe("the draft click only becomes reachable after the clip edit is applied", () => {
  it("refuses 保存草稿 while the panel is open, then accepts it once closed", async () => {
    const dom = await fixture(draftBarHtml);
    const { window } = dom;

    const refs = openPanelState(window);
    const blocked = JSON.parse(window.eval(TAG_BY_TEXT("保存草稿")));
    expect(blocked.ok).toBe(true);
    expect(blocked.topmost).toBe(false);
    expect(blocked.blocker).toContain("VideoClip__root");

    // The panel's own 保存 is reachable, which is what makes it the way out.
    const panelSave = JSON.parse(window.eval(TAG_BY_TEXT("保存")));
    expect(panelSave.topmost).toBe(true);
    expect(window.document.getElementById("__byText")).toBe(refs.panelSave);

    // Apply the clip edit: the overlay goes away.
    closedPanelState(window, refs);
    const cleared = JSON.parse(window.eval(TAG_BY_TEXT("保存草稿")));
    expect(cleared.topmost).toBe(true);
    expect(cleared.blocker).toBeNull();
    expect(window.document.getElementById("__byText")).toBe(refs.barDraft);
    dom.window.close();
  });

  it("tags the reachable one when two elements share the label", async () => {
    const dom = await fixture(draftBarHtml);
    const { window } = dom;
    const overlay = window.document.getElementById("overlay");
    const barDraft = window.document.getElementById("bar-draft");
    // The panel copy is first in document order; the bar copy is reachable.
    place(overlay, overlayRect);
    place(window.document.getElementById("panel-draft"), { x: 100, y: 100, w: 56, h: 20 });
    place(barDraft, { x: 600, y: 600, w: 56, h: 20 });
    paintStack(window, [
      { el: overlay, rect: { x: 0, y: 0, w: 400, h: 400 } },
      { el: barDraft, rect: { x: 600, y: 600, w: 56, h: 20 } },
    ]);

    const result = JSON.parse(window.eval(TAG_BY_TEXT("保存草稿")));

    expect(result.ok).toBe(true);
    expect(result.topmost).toBe(true);
    expect(result.candidates).toBe(2);
    expect(window.document.getElementById("__byText")).toBe(barDraft);
    dom.window.close();
  });

  it("names the coverer instead of reporting an unreachable button", async () => {
    const dom = await fixture(draftBarHtml);
    const { window } = dom;
    openPanelState(window);

    const result = JSON.parse(window.eval(TAG_BY_TEXT("保存草稿")));

    // "not found" would be a lie — the button is there, something is on it.
    expect(result.ok).toBe(true);
    expect(result.topmost).toBe(false);
    expect(result.blocker).toContain("VideoClip__root");
    dom.window.close();
  });
});

describe("the draft exit applies the staged clip edit first", () => {
  const draftBranchStart = () => source.indexOf('if (hasFlag("save-draft")) {');

  it("runs the shared apply step before it tags 保存草稿", () => {
    const draftStart = draftBranchStart();
    expect(draftStart, "the save-draft branch is gone").toBeGreaterThan(-1);

    const apply = source.indexOf("applyClipEdit(", draftStart);
    const tagDraft = source.indexOf('TAG_BY_TEXT("保存草稿")', draftStart);
    expect(apply, "the draft branch never applies the clip edit").toBeGreaterThan(-1);
    expect(tagDraft).toBeGreaterThan(apply);
  });

  it("lets the draft exit skip when no clip panel is open", () => {
    // A draft run that staged no clip edit has nothing to apply. Making the
    // step mandatory there would be stricter than the flag has ever been.
    const draftStart = draftBranchStart();
    const draftApply = source.indexOf("applyClipEdit(", draftStart);
    const handOver = source.indexOf("✅ Editor is prepared", draftStart);
    const block = source.slice(draftApply, handOver);
    expect(block).toContain("required: false");
  });

  it("keeps the publish exit's apply mandatory", () => {
    // Publishing without applying drops the attached sound silently, which is
    // the reason the step exists on that path.
    const publishStart = source.indexOf('if (hasFlag("publish")) {');
    const publishApply = source.indexOf("applyClipEdit(", publishStart);
    const draftStart = draftBranchStart();
    const block = source.slice(publishApply, draftStart);
    expect(publishApply).toBeGreaterThan(publishStart);
    expect(block).not.toContain("required: false");
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
    const draftStart = draftBranchStart();
    const apply = source.indexOf("applyClipEdit(", draftStart);
    expect(apply).toBeGreaterThan(-1);
    expect(source.indexOf("✅ Editor is prepared")).toBeGreaterThan(apply);
    expect(source).toContain("✅ Draft saved — NOTHING HAS BEEN PUBLISHED.");
  });
});

describe("a click refusal names the blocker and the tab", () => {
  it("reports the element covering the target's centre", async () => {
    const dom = await fixture(
      `<div class="VideoClip__root" id="overlay"></div>
       <button id="draft">保存草稿</button>`,
    );
    const { window } = dom;
    const overlay = place(window.document.getElementById("overlay"), overlayRect);
    place(window.document.getElementById("draft"), barDraftRect);
    paintStack(window, [{ el: overlay, rect: overlayRect }]);

    const target = JSON.parse(window.eval(RESOLVE_CLICK_TARGET("#draft")));

    expect(target.ok).toBe(true);
    expect(target.topmost).toBe(false);
    expect(target.blocker).toContain("VideoClip__root");
    expect(clickRefusal("#draft", target)).toContain("covered at its centre by");
    expect(clickRefusal("#draft", target)).toContain("VideoClip__root");
    // The operator takes over by hand from the tab the run leaves open.
    expect(clickRefusal("#draft", target, { tab: "TAB-42" })).toContain("TAB-42");
    dom.window.close();
  });

  it("still refuses without inventing a name when nothing was hit", () => {
    const message = clickRefusal("#draft", { topmost: false });
    expect(message).toContain("covered at its centre");
    expect(message).toContain("unidentified element");
  });

  it("names a zero-size target instead of calling it missing", async () => {
    const dom = await fixture(`<button id="draft">保存草稿</button>`);
    const { window } = dom;
    place(window.document.getElementById("draft"), { x: 10, y: 10, w: 0, h: 0 });

    const target = JSON.parse(window.eval(RESOLVE_CLICK_TARGET("#draft")));

    expect(target.ok).toBe(false);
    expect(target.reason).toContain("zero-size");
    dom.window.close();
  });

  it("routes the human-click guard through that message", () => {
    expect(source).toContain("clickRefusal(selector, target, { tab: tabId })");
  });
});
