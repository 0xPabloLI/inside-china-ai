#!/usr/bin/env node
/**
 * TikTok upload prep — drives the TikTok Studio web upload page up to (but
 * never through) the publish button.
 *
 * Why this exists
 * ---------------
 * The publish profile's manual guide told the operator to attach a trending
 * sound by hand in the app ("Trending audio" checklist item), because the
 * official Content Posting API has no sound endpoint. That was true of the
 * API, but NOT of the web upload page: tiktokstudio/upload has a 音乐 (Music)
 * tab with a sound search box, and selecting a result attaches that native
 * sound to the post. So the tedious part is scriptable, and the only step that
 * genuinely needs a human is the publish decision itself.
 *
 * What the web flow actually does (corrected 2026-10-25, first real publish)
 * -------------------------------------------------------------------------
 * The sound is written into the CLIP's audio, not onto the post as a labelled
 * sound. After a successful attach + save the published post still reports
 * "原声 - Chinaainews" as its sound — verified on live post 7700554811866909970.
 * A "Breaking News - Voxie" label is not reachable from the web upload page.
 *
 * Five steps in this flow failed silently or were missing on the first run and
 * are now guarded:
 *
 *   1. The caption field arrives pre-filled with the video's filename and is a
 *      Draft.js editor, which ignores a DOM Range. `execCommand("selectAll")`
 *      reaches it; do NOT follow it with a delete (the paste then drops its
 *      first paragraph — measured: 708 of 1223 chars).
 *   2. The music volume slider is a custom component. The `input[type=range]`
 *      inside it is a hidden 0x0 fallback: writing to it changes nothing while
 *      reporting success, leaving the music at 0 dB — about 1 dB ABOVE the
 *      narration. The slider must be clicked for real, and the value read back.
 *   3. Attaching only stages the music. The clip editor has to be saved (保存)
 *      for the music and its volume to join the clip, and the publish button
 *      sits below the fold behind that editor's overlay.
 *   4. The AI-generated-content disclosure was not implemented at all, so the
 *      first post shipped unlabeled even though the platform profile had
 *      declared it mandatory. The control exists on the web, behind 显示更多,
 *      and cannot be set after publishing — see the AIGC section below.
 *   5. A no-voice run needs `--no-aigc`; the label is otherwise always applied.
 *
 * HITL boundary
 * -------------
 * By default this script stops with the editor fully prepared — video
 * uploaded, caption filled, AIGC disclosed, native sound attached — and leaves
 * the tab open for the operator to review and publish. The content-pipeline
 * HITL gate is preserved: a human makes the publish call.
 *
 * Standing default (user, 2026-10-25): once the video is approved at HITL,
 * publish it end to end — attach the music bed, set its level, disclose AIGC,
 * click 发布 — without coming back with a BGM question. Use --sound only to
 * pick a different track than the account's usual one.
 *
 * `--publish` clicks 发布. The user authorized that capability on 2026-10-24
 * ("发布时跑自动化：脚本一次性做完挂 sound + 设音量 + 点发布"). Passing the
 * flag on a given run IS the publish decision for that run — it is not a
 * standing licence to publish, and the pipeline's HITL approval still has to
 * have happened before the flag is used.
 *
 * Usage
 *   node scripts/short-video/tiktok-upload-prep.mjs \
 *     --video output/unitree-h2x-guardian/xxx-short.mp4 \
 *     --content unitree-h2x-guardian \
 *     --sound "Breaking News" \
 *     --sound-owner Voxie \
 *     --volume-db -15
 *
 * Options
 *   --video <path>        Video file to upload (required)
 *   --content <dir>       Pipeline id — caption defaults to
 *                         output/{dir}/publish/tiktok/tiktok-caption.txt
 *   --caption <text>      Caption override (else the --content default)
 *   --caption-file <path> Caption file override
 *   --sound <query>       Sound to search for (default: the account's usual)
 *   --sound-owner <name>  Owner name to disambiguate same-titled sounds
 *   --volume-db <n>       Music track volume in dB (default -15). Read back
 *                         from the slider after setting; the run aborts if the
 *                         slider did not land within 1 dB, because a wrong
 *                         value here buries the narration.
 *   --no-aigc             Skip the AI-generated-content disclosure. Only for a
 *                         post with no synthetic media or voice at all; the
 *                         label cannot be added after publishing.
 *   --publish             Click 发布 after preparing. Without it the script
 *                         never publishes.
 *   --keep-tab            Leave the tab open on success (default: keep, so the
 *                         operator can publish; --close-tab closes it instead)
 *   --close-tab           Close the tab when done (dry runs / testing)
 *   --save-draft          After preparing, click 保存草稿 (Save draft) so the
 *                         post lands in the account's TikTok drafts. Still
 *                         never publishes. The attached sound does NOT survive
 *                         a draft save/reopen; the caption does.
 *   --dry-run             Everything except the upload (page reachability only)
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { cdpNewTab, cdpEval, cdpCloseTab } from "./lib/cdp-client.mjs";
import { ensureCdpProfileGuard } from "./lib/cdp-preflight.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload";
const DEFAULT_SOUND = "Breaking News";
const DEFAULT_SOUND_OWNER = "Voxie";
/**
 * Music bed level, as the editor's 音量 slider shows it.
 *
 * This is NOT "dB below the narration". The slider is relative to the track's
 * own level, and the track is not mastered to match our voice: measured on the
 * first real publish (2026-10-25), a slider reading of -20 dB put the music
 * 22.2 dB below the narration. So the slider-to-narration offset is about
 * -2.2 dB for this track.
 *
 * -15 dB therefore lands near -17 dB below the narration, which sits mid-range
 * on the standard guidance for music under speech (15-25 dB below the voice;
 * -20 to -25 reads as "felt rather than heard" for documentary, -18 to -22 for
 * a talking head). The previous -20 dB measured 22.2 dB down, which is inside
 * the range but at the quiet end — the user read it as too light.
 */
const DEFAULT_VOLUME_DB = -15;

// ─── page-side helpers (stringified into the tab) ───

/** Find a clickable element whose own text is exactly `label`. */
const CLICK_BY_TEXT = (label) => `
(() => {
  const target = ${JSON.stringify(label)};
  const nodes = [...document.querySelectorAll("button, [role=button], div, span")];
  const hit = nodes.find((e) => {
    const own = [...e.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join("")
      .trim();
    return own === target && e.getBoundingClientRect().width > 0;
  });
  if (!hit) return JSON.stringify({ ok: false });
  const btn = hit.closest("button, [role=button]") || hit;
  btn.click();
  return JSON.stringify({ ok: true, tag: btn.tagName });
})()`;

/**
 * Fill the description box.
 *
 * The field is a Draft.js editor (`div.public-DraftEditor-content`), and it
 * arrives PRE-FILLED with the video's filename. Draft.js keeps its own
 * ContentState beside the DOM, so typing into the DOM is not enough — the
 * editor has to receive the text through a path it actually handles.
 *
 * `document.execCommand("insertText")` is that trap. It updates the DOM and
 * leaves Draft.js's state behind, which produced a saved draft whose entire
 * body was missing (only the trailing hashtags survived, 2026-10-24). The
 * longer, multi-paragraph inserts also tore the page down to the generic
 * "出错了 / 请重试" screen with no console exception. Both symptoms came from
 * driving the DOM around Draft.js, not from the caption's content: the same
 * caption through a paste is handled cleanly.
 *
 * So the caption goes in as a synthetic `paste` carrying a real DataTransfer,
 * which is the path Draft.js implements (onPaste). Two details matter:
 *
 *  1. Select the whole editor first so the paste REPLACES the pre-filled
 *     filename. `document.execCommand("selectAll")` is what works — neither a
 *     synthetic Cmd+A keydown nor a DOM Range reaches Draft.js, and both were
 *     measured failing on the live editor.
 *  2. Let the selection settle before pasting, and give Draft.js a moment to
 *     process afterwards — it re-renders from its ContentState.
 *
 * The result is compared against the requested caption with whitespace
 * normalized: Draft.js renders block boundaries as extra newlines in
 * innerText, so an exact string compare would fail on formatting alone. That
 * check is not ceremony — it is what caught the filename being glued to the
 * caption, and a paste that silently dropped the opening paragraph.
 */
const FILL_CAPTION = (caption) => `
(async () => {
  const want = ${JSON.stringify(caption)};
  const el =
    document.querySelector('div[contenteditable="true"][data-e2e*="caption"]') ||
    document.querySelector("div.public-DraftEditor-content") ||
    document.querySelector('div[contenteditable="true"]') ||
    [...document.querySelectorAll("textarea")].find((t) => t.getBoundingClientRect().width > 0);
  if (!el) return JSON.stringify({ ok: false, reason: "no caption field" });

  const healthy = () =>
    document.body.innerText.includes("视频描述") &&
    document.querySelectorAll("button.editor-entrance").length > 0;
  const normalize = (s) => s.replace(/[ \\t]+/g, " ").replace(/\\s*\\n\\s*/g, "\\n").trim();

  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, want);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return JSON.stringify({ ok: true, len: el.value.length, mode: "value" });
  }

  const prefilled = el.innerText;

  // Replace the pre-filled filename caption. Two things about Draft.js, both
  // established on the live editor (2026-10-25):
  //
  //  1. A DOM Range plus a selectionchange event does NOT reach Draft.js —
  //     its paste handler inserts at the editor's OWN internal cursor, so the
  //     caption came out as the filename with the caption glued on
  //     ("...-shortUnitree introduced the H2-X...", 1279 chars).
  //  2. document.execCommand("selectAll") DOES reach it, because that goes
  //     through the browser's editing pipeline. So selectAll is the whole
  //     fix, and the paste replaces the filename in one step.
  //
  // Do NOT add an execCommand("delete") between the selectAll and the paste.
  // Clearing first and then pasting was tried and is worse: the paste landed
  // with the first paragraph missing (708 of 1223 chars) — the delete
  // re-renders Draft.js's ContentState and the paste races it. Driving the
  // editor harder also tears the page down to the generic error screen
  // ("出错了 / 请重试"), which is the same failure the older insertText
  // approach caused. One selectAll, one paste, then verify.
  el.focus();
  document.execCommand("selectAll");
  await new Promise((r) => setTimeout(r, 700));

  const dt = new DataTransfer();
  dt.setData("text/plain", want);
  el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
  await new Promise((r) => setTimeout(r, 2500));

  if (!healthy()) {
    return JSON.stringify({ ok: false, reason: "editor died after paste" });
  }

  const got = el.innerText;
  const replaced = got.indexOf(prefilled.slice(0, 12)) === -1;
  const matches = normalize(got) === normalize(want);
  return JSON.stringify({
    ok: matches,
    mode: "paste",
    len: got.length,
    prefilled: prefilled.slice(0, 40),
    replaced,
    reason: matches ? undefined : "caption text did not match after paste",
  });
})()`;


/**
 * Read the page state after a publish click, to catch a TikTok-side rejection
 * instead of reporting success on a form that never submitted.
 */
const PUBLISH_STATE = `
(() => {
  const text = document.body.innerText;
  const err = /出错了|请重试|发布失败|发布错误/.test(text) ? text.slice(0, 200) : null;
  return JSON.stringify({ error: err, url: location.href });
})()`;

/**
 * True once the clip editor overlay is gone.
 *
 * 保存 closes it, and only then is the music (and its volume) written into the
 * clip. Verified 2026-10-25: attaching the sound without saving left the post
 * with no music in its DOM and its sound still reading "原声 - Chinaainews";
 * after 保存 the timeline held the music clip at the volume that was set.
 */
const OVERLAY_CLOSED = `
(() => JSON.stringify({
  ready: !document.querySelector('[class*="clip-forge-editor-container"]'),
}))()`;

/**
 * Scroll the publish button into view and report whether a click could land.
 *
 * It sits ~566px below the fold inside a scrollable panel (the body itself
 * does not scroll), so a real mouse click at its centre misses unless it is
 * scrolled first. `unobstructed` re-checks with elementFromPoint because the
 * clip editor overlay covers the whole viewport while it is open.
 */
const SCROLL_TO_PUBLISH = `
(() => {
  const b = document.querySelector('[data-e2e="post_video_button"]');
  if (!b) return JSON.stringify({ ok: false, reason: "no publish button" });
  b.scrollIntoView({ block: "center" });
  const r = b.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return JSON.stringify({
    ok: true,
    inView: r.y >= 0 && r.y + r.height <= window.innerHeight,
    unobstructed: !!(hit && (hit === b || b.contains(hit) || (hit.closest && hit.closest('[data-e2e="post_video_button"]')))),
  });
})()`;

/**
 *
 * Targets `button.editor-entrance` specifically: the page ALSO has a
 * `.EditorLeftSideMenu__menuText` div labelled 音乐, and a generic
 * text-matching selector can land on that one instead, which does not always
 * open the sound library. Verified 2026-10-24.
 */
const OPEN_MUSIC_TAB = `
(() => {
  const btns = [...document.querySelectorAll("button.editor-entrance")];
  const music = btns.find((b) => (b.innerText || "").trim() === "音乐");
  if (!music) {
    return JSON.stringify({ ok: false, tabs: btns.map((b) => (b.innerText || "").trim()) });
  }
  music.click();
  return JSON.stringify({ ok: true });
})()`;

/** Report whether the sound library panel is mounted and searchable. */
const MUSIC_PANEL_READY = `
(() => {
  const input =
    document.querySelector('input[placeholder="搜索音乐"]') ||
    document.querySelector('input[placeholder*="搜索"]');
  return JSON.stringify({
    ready: !!input,
    items: document.querySelectorAll(".MusicPanelMusicItem__wrap").length,
    error: /出错了|请重试/.test(document.body.innerText),
  });
})()`;

/** Search the sound library. */
const SEARCH_SOUND = (query) => `
(() => {
  const inp =
    document.querySelector('input[placeholder="搜索音乐"]') ||
    document.querySelector('input[placeholder*="搜索"]') ||
    [...document.querySelectorAll("input[type=text]")].find((i) => i.getBoundingClientRect().width > 0);
  if (!inp) return JSON.stringify({ ok: false, reason: "no search input" });
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, ${JSON.stringify(query)});
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true }));
  return JSON.stringify({ ok: true });
})()`;

/** Count sound results (used to poll after a search). */
const SOUND_RESULT_COUNT = `
(() => JSON.stringify({
  ready: document.querySelectorAll(".MusicPanelMusicItem__wrap").length > 0,
  count: document.querySelectorAll(".MusicPanelMusicItem__wrap").length,
}))()`;

/** Attach a sound from the results list by title (+ optional owner). */
const ATTACH_SOUND = (title, owner) => `
(() => {
  const wantTitle = ${JSON.stringify(title)}.toLowerCase();
  const wantOwner = ${JSON.stringify(owner || "")}.toLowerCase();
  const items = [...document.querySelectorAll(".MusicPanelMusicItem__wrap")];
  const rows = items.map((e) => (e.innerText || "").replace(/\\n/g, " | "));
  const match =
    items.find((e) => {
      const t = (e.innerText || "").toLowerCase();
      return t.includes(wantTitle) && (!wantOwner || t.includes(wantOwner));
    }) ||
    items.find((e) => (e.innerText || "").toLowerCase().includes(wantTitle));
  if (!match) return JSON.stringify({ ok: false, seen: rows.slice(0, 8) });
  const label = (match.innerText || "").replace(/\\n/g, " | ").slice(0, 60);
  const btn = match.querySelector("button") || match;
  btn.click();
  return JSON.stringify({ ok: true, attached: label });
})()`;

/**
 * Read the music clip's volume as the UI actually shows it.
 *
 * The panel is a custom slider (TUX `PropSettingSliderInput`), NOT a native
 * input: the `input[type=range]` inside it is a 0x0 hidden fallback whose
 * `.value` can be written by script while the visible slider — and therefore
 * React's state, and therefore the saved clip — keeps the old value. Reading
 * the fallback is what made the first live run report "-20 dB" for a music
 * track that was still at 0 dB (verified 2026-10-25: the fallback read -20
 * while `Slider__progress` sat at 75% = 0 dB).
 *
 * The truth is the progress element's x offset along the track, so that is
 * what this reads. Returns null when the panel is not mounted.
 */
const READ_VOLUME_DB = `
(() => {
  const rng = document.querySelector(".PropSettingAudioVolume__wrap input[type='range']");
  const prog = document.querySelector(".PropSettingAudioVolume__wrap .Slider__progress");
  const track = document.querySelector(".PropSettingAudioVolume__wrap .PropSettingSliderInput__sliderInput");
  if (!rng || !prog || !track) return JSON.stringify({ ok: false, reason: "volume panel not mounted" });
  const min = Number(rng.min), max = Number(rng.max);
  const tr = track.getBoundingClientRect();
  if (!tr.width) return JSON.stringify({ ok: false, reason: "slider has no width" });
  const frac = Math.min(1, Math.max(0, (prog.getBoundingClientRect().x - tr.x) / tr.width));
  return JSON.stringify({ ok: true, min, max, frac, db: Math.round((min + frac * (max - min)) * 10) / 10 });
})()`;

/**
 * Place a 1x1 click target at the position on the volume slider that
 * corresponds to `db`, and return its selector.
 *
 * A synthetic `input` event cannot move this slider, so the volume has to be
 * set with a real mouse click — the same conclusion the caption field forced.
 * The proxy's /clickAt only clicks an element's CENTRE, which for this track
 * is a fixed 50% (-20 dB on the -60..20 scale) and useless for any other
 * target, so this injects a throwaway marker at the exact x and lets
 * /clickAt land on it. `pointer-events: none` makes the marker transparent to
 * the click, so the press reaches the slider underneath.
 */
const PLACE_VOLUME_MARKER = (db) => `
(() => {
  const rng = document.querySelector(".PropSettingAudioVolume__wrap input[type='range']");
  const track = document.querySelector(".PropSettingAudioVolume__wrap .PropSettingSliderInput__sliderInput");
  if (!rng || !track) return JSON.stringify({ ok: false, reason: "volume panel not mounted" });
  const min = Number(rng.min), max = Number(rng.max);
  const want = Math.min(max, Math.max(min, ${Number(db)}));
  track.scrollIntoView({ block: "center" });
  const tr = track.getBoundingClientRect();
  const frac = (want - min) / (max - min);
  const old = document.getElementById("__volumeMarker");
  if (old) old.remove();
  const m = document.createElement("div");
  m.id = "__volumeMarker";
  m.style.cssText = [
    "position:fixed",
    "width:1px",
    "height:1px",
    "pointer-events:none",
    "z-index:2147483647",
    "left:" + (tr.x + frac * tr.width) + "px",
    "top:" + (tr.y + tr.height / 2) + "px",
  ].join(";");
  document.body.appendChild(m);
  return JSON.stringify({ ok: true, want, min, max, frac, x: Math.round(tr.x + frac * tr.width), y: Math.round(tr.y + tr.height / 2) });
})()`;

/** Remove the marker injected by PLACE_VOLUME_MARKER. */
const CLEAR_VOLUME_MARKER = `
(() => {
  const m = document.getElementById("__volumeMarker");
  if (m) m.remove();
  return JSON.stringify({ ok: true });
})()`;

// ─── AI-generated-content disclosure (AIGC) ───
//
// TikTok requires realistic AI-generated content to be disclosed, and that
// includes "AI-generated speech" over real footage — which is exactly what
// this pipeline produces (an AI-cloned voice narrating real footage). The
// platform's own help page documents the toggle for the MOBILE app and does
// not mention a desktop path, so the web flow looked like it had no such
// control. It does, behind 显示更多 (Show more).
//
// MISSED ON THE FIRST REAL PUBLISH (2026-10-25): this script had no AIGC step
// at all, so post 7700554811866909970 went out unlabeled. The platform profile
// (lib/platforms/tiktok.mjs aiDisclosure.required) had declared the label
// mandatory since the 《标识办法》 took effect on 2025-09-01; nothing consumed
// it. And the label CANNOT be added after the fact — Studio's per-post ⋯ menu
// offers only 置顶 / 下载 / 删除 (verified). It has to be set before 发布.
//
// The switch is a custom TUX component (`.Switch__root` wrapping a hidden
// `input[role=switch]`), the same family as the volume slider: writing to the
// inner input does nothing, and flipping it opens a confirmation modal that
// must be accepted before the state actually changes. So the click is real and
// the result is read back.

/** Expand the 显示更多 section that hides the disclosure switches. */
const OPEN_ADVANCED = `
(() => {
  const t = document.body.innerText;
  if (/AI 生成的内容/.test(t)) return JSON.stringify({ ok: true, alreadyOpen: true });
  const btn = [...document.querySelectorAll("button, div, span")]
    .find((e) => e.innerText && e.innerText.trim() === "显示更多");
  if (!btn) return JSON.stringify({ ok: false, reason: "no 显示更多 control" });
  btn.click();
  return JSON.stringify({ ok: true, alreadyOpen: false });
})()`;

/** Report the AIGC switch's state (null when the section is not expanded). */
const READ_AIGC = `
(() => {
  const row = [...document.querySelectorAll("div.jsx-1157814305.container")]
    .find((e) => /AI 生成的内容/.test(e.innerText || ""));
  if (!row) return JSON.stringify({ ok: false, reason: "AIGC row not found — expand 显示更多 first" });
  const content = row.querySelector(".Switch__content");
  if (!content) return JSON.stringify({ ok: false, reason: "AIGC switch not found" });
  return JSON.stringify({ ok: true, checked: content.getAttribute("data-state") === "checked" });
})()`;

/**
 * Tag the switch with an id so /clickAt can land on it.
 *
 * The editor scrolls between measuring and clicking, so the position has to be
 * read in the same call that tags the element, and the click has to be the
 * proxy's real CDP mouse press — a synthetic `.click()` does not move this
 * control.
 */
const TAG_AIGC_SWITCH = `
(() => {
  const row = [...document.querySelectorAll("div.jsx-1157814305.container")]
    .find((e) => /AI 生成的内容/.test(e.innerText || ""));
  if (!row) return JSON.stringify({ ok: false, reason: "AIGC row not found" });
  const sw = row.querySelector(".Switch__root");
  if (!sw) return JSON.stringify({ ok: false, reason: "AIGC switch not found" });
  sw.id = "__aigcSwitch";
  sw.scrollIntoView({ block: "center" });
  return JSON.stringify({ ok: true });
})()`;

/** Accept the "标记 AI 生成的内容" confirmation modal. */
const TAG_AIGC_CONFIRM = `
(() => {
  const overlay = document.querySelector(".TUXModal-overlay");
  if (!overlay || !/标记 AI 生成的内容/.test(overlay.parentElement.innerText || "")) {
    return JSON.stringify({ ok: false, reason: "confirmation modal not open" });
  }
  const btn = [...overlay.parentElement.querySelectorAll("button")]
    .find((b) => b.innerText.trim() === "开启");
  if (!btn) return JSON.stringify({ ok: false, reason: "开启 button not found" });
  btn.id = "__aigcConfirm";
  return JSON.stringify({ ok: true });
})()`;

/** Report whether the editor is ready (upload finished). */
const EDITOR_STATE = `
(() => {
  const t = document.body.innerText;
  return JSON.stringify({
    ready: /发布/.test(t) && /视频描述/.test(t),
    uploading: /已上传|上传中|Uploading/.test(t),
    hasCaption: /视频描述/.test(t),
    hasMusicPanel: /搜索音乐|MusicPanelMusicItem/.test(document.documentElement.innerHTML),
    url: location.href,
  });
})()`;

// ─── driver ───

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Bring a CDP target to the foreground.
 *
 * Required, not cosmetic. The web-access proxy creates tabs in the BACKGROUND,
 * and Chrome throttles hidden tabs — TikTok's uploader then accepts the file
 * (DOM.setFileInputFiles reports success) but never starts the transfer, with
 * no error shown. The proxy exposes no /activate endpoint, so this talks to
 * the browser's own CDP websocket. Only the named target is activated; every
 * other tab is left alone.
 *
 * Talks to the browser-level endpoint (Target.activateTarget), NOT the page's
 * own webSocketDebuggerUrl. The proxy already holds a page-level session, and
 * a second debugger connection to the same page target never opens — it just
 * hangs until the caller times out (observed twice on 2026-10-24).
 *
 * @param {string} targetId
 * @param {number} [port] - Chrome's CDP port (the automation profile's 9229)
 * @returns {Promise<string>} "ok", or the CDP error description
 */
async function bringToFront(targetId, port = 9229) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  if (!version.webSocketDebuggerUrl) {
    throw new Error(`no browser-level CDP endpoint on port ${port}`);
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  const answer = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("activate timed out after 8s")), 8000);
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: "Target.activateTarget", params: { targetId } }));
    ws.onmessage = (m) => {
      try {
        const d = JSON.parse(m.data);
        if (d.id !== 1) return;
        clearTimeout(timer);
        resolve(d.error ? `error: ${d.error.message}` : "ok");
      } catch {
        /* ignore non-JSON frames */
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("CDP websocket failed"));
    };
  });
  try {
    return await answer;
  } finally {
    ws.close();
  }
}

/** Evaluate a page script and parse its JSON envelope. */
async function evalJson(tabId, script) {
  const resp = await cdpEval(tabId, script);
  if (resp?.error) throw new Error(`page script failed: ${resp.error}`);
  const raw = typeof resp?.value === "string" ? resp.value : JSON.stringify(resp?.value ?? null);
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

/**
 * Click an element with a real mouse event.
 *
 * Needed for the description field: a scripted `el.focus()` does not make
 * Draft.js adopt a selection we set, but a real click does (see FILL_CAPTION).
 */
async function clickElement(tabId, selector) {
  const resp = await fetch(`http://localhost:3456/click?target=${tabId}`, {
    method: "POST",
    body: selector,
  }).then((r) => r.json());
  if (!resp?.clicked) throw new Error(`click failed for ${selector}: ${JSON.stringify(resp)}`);
  return resp;
}

/**
 * Click an element with a real CDP mouse event at its centre.
 *
 * Distinct from clickElement(): that one dispatches a page-level click, which
 * a custom (non-native) control can ignore. This one goes through the
 * browser's input pipeline, so sliders and other pointer-driven widgets see a
 * genuine press. The proxy takes the selector as the raw request body.
 */
async function clickAtElement(tabId, selector) {
  const resp = await fetch(`http://localhost:3456/clickAt?target=${tabId}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: selector,
  }).then((r) => r.json());
  if (!resp?.clicked) throw new Error(`clickAt failed for ${selector}: ${JSON.stringify(resp)}`);
  return resp;
}

/** Poll a predicate script until it reports ready. */
async function waitFor(tabId, script, { timeoutMs = 180_000, intervalMs = 4000, label = "state" } = {}) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await evalJson(tabId, script);
    if (last?.ready) return last;
    process.stdout.write(
      `  … waiting for ${label} (${Math.round((Date.now() - started) / 1000)}s)\r`,
    );
    await sleep(intervalMs);
  }
  throw new Error(`${label} not reached within ${timeoutMs / 1000}s — last state: ${JSON.stringify(last)}`);
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const videoArg = getArg("video");
  // --dry-run only proves the upload page is reachable, so a video is not
  // required for it — that is the whole point of the mode.
  if (!videoArg && !dryRun) {
    console.error("❌ --video is required");
    console.error("   Example: --video output/unitree-h2x-guardian/xxx-short.mp4 --content unitree-h2x-guardian");
    process.exit(1);
  }
  const videoPath = videoArg ? resolve(videoArg) : null;
  if (videoPath && !existsSync(videoPath)) {
    console.error(`❌ video not found: ${videoPath}`);
    process.exit(1);
  }

  const contentId = getArg("content");
  const sound = getArg("sound") || DEFAULT_SOUND;
  const soundOwner = getArg("sound-owner") ?? DEFAULT_SOUND_OWNER;
  const volumeDb = getArg("volume-db") !== null ? Number(getArg("volume-db")) : DEFAULT_VOLUME_DB;

  // Caption resolution: explicit text > explicit file > the pipeline package.
  let caption = getArg("caption");
  const captionFile =
    getArg("caption-file") ||
    (contentId ? join(__dirname, "output", contentId, "publish", "tiktok", "tiktok-caption.txt") : null);
  if (!caption && captionFile && existsSync(captionFile)) {
    caption = readFileSync(captionFile, "utf8").trim();
  }

  // The publish path is a security boundary — the same profile guard the rest
  // of the pipeline uses, so this can never silently run against a profile
  // without the account's login state.
  await ensureCdpProfileGuard();

  console.log("");
  console.log("=".repeat(60));
  console.log("📤 TikTok upload prep (stops before Publish — HITL)");
  console.log("=".repeat(60));
  console.log(`  Video:   ${videoPath ? basename(videoPath) : "(none — dry run)"}`);
  console.log(`  Sound:   ${sound}${soundOwner ? ` — ${soundOwner}` : ""}`);
  console.log(`  Volume:  ${volumeDb} dB`);
  console.log(`  Caption: ${caption ? `${caption.length} chars` : "(none — will skip)"}`);
  console.log("");

  if (dryRun) {
    console.log("  --dry-run: checking page reachability only");
    const tab = await cdpNewTab(UPLOAD_URL);
    try {
      await sleep(9000);
      const state = await evalJson(tab, EDITOR_STATE);
      console.log(`  ✅ upload page reachable — ${JSON.stringify(state)}`);
    } finally {
      await cdpCloseTab(tab);
    }
    return;
  }

  const tab = await cdpNewTab(UPLOAD_URL);
  let keepTab = !hasFlag("close-tab");
  try {
    console.log("  1/6 upload page open — waiting for the editor…");
    await sleep(10_000);

    // Foreground the tab BEFORE handing over the file: a hidden tab's uploader
    // silently never starts (see bringToFront).
    const activated = await bringToFront(tab);
    console.log(`      tab foregrounded (${activated})`);

    console.log("  2/6 selecting the video file…");
    const setFiles = await fetch(`http://localhost:3456/setFiles?target=${tab}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selector: 'input[type="file"]', files: [videoPath] }),
    }).then((r) => r.json());
    if (!setFiles?.success) throw new Error(`setFiles failed: ${JSON.stringify(setFiles)}`);

    console.log("  3/6 waiting for the upload to finish…");
    await waitFor(tab, EDITOR_STATE, { timeoutMs: 300_000, label: "editor ready" });
    process.stdout.write("\n");

    if (caption) {
      // Focus the field with a real click first — Draft.js ignores a selection
      // set by script alone (see FILL_CAPTION).
      await clickElement(tab, "div.public-DraftEditor-content");
      const filled = await evalJson(tab, FILL_CAPTION(caption));
      if (!filled.ok) throw new Error(`caption failed: ${JSON.stringify(filled)}`);
      console.log(`  4/6 caption filled (${filled.len} chars, replaced "${filled.prefilled}")`);
    } else {
      console.log("  4/6 caption skipped (none supplied)");
    }

    // AIGC disclosure. Runs before the sound step because it is a compliance
    // obligation (lib/platforms/tiktok.mjs aiDisclosure.required), not a
    // preference: a post that ships without it cannot be fixed afterwards.
    if (hasFlag("no-aigc")) {
      console.log("  5/6 AIGC label SKIPPED (--no-aigc) — the post will not carry a disclosure");
    } else {
      const advanced = await evalJson(tab, OPEN_ADVANCED);
      if (!advanced.ok) throw new Error(`could not expand 显示更多: ${JSON.stringify(advanced)}`);
      await sleep(1200);

      const before = await evalJson(tab, READ_AIGC);
      if (!before.ok) throw new Error(`could not read the AIGC switch: ${JSON.stringify(before)}`);

      if (before.checked) {
        console.log("  5/6 AIGC label already on");
      } else {
        const tagged = await evalJson(tab, TAG_AIGC_SWITCH);
        if (!tagged.ok) throw new Error(`could not tag the AIGC switch: ${JSON.stringify(tagged)}`);
        await sleep(800);
        await clickAtElement(tab, "#__aigcSwitch");
        await sleep(1500);

        const confirm = await evalJson(tab, TAG_AIGC_CONFIRM);
        if (!confirm.ok) throw new Error(`AIGC confirmation did not open: ${JSON.stringify(confirm)}`);
        await clickAtElement(tab, "#__aigcConfirm");
        await sleep(1500);

        // Read back. The switch flips only when the modal is accepted, so a
        // silent failure here is exactly how an unlabeled post ships.
        const after = await evalJson(tab, READ_AIGC);
        if (!after.ok || !after.checked) {
          throw new Error(
            `AIGC label did not stick (switch reads ${JSON.stringify(after)}). ` +
              `Turn on 显示更多 → AI 生成的内容 by hand in the open tab, then publish from there.`,
          );
        }
        console.log("  5/6 AIGC label ON (AI-generated content disclosed)");
      }
    }

    console.log("  6/6 attaching the native sound…");
    const opened = await evalJson(tab, OPEN_MUSIC_TAB);
    if (!opened.ok) throw new Error(`music tab not found — editor tabs: ${JSON.stringify(opened.tabs)}`);
    await waitFor(tab, MUSIC_PANEL_READY, { timeoutMs: 60_000, label: "sound library" });
    process.stdout.write("\n");

    const searched = await evalJson(tab, SEARCH_SOUND(sound));
    if (!searched.ok) throw new Error(`sound search failed: ${JSON.stringify(searched)}`);
    await waitFor(tab, SOUND_RESULT_COUNT, { timeoutMs: 45_000, label: "sound results" });
    process.stdout.write("\n");

    const attached = await evalJson(tab, ATTACH_SOUND(sound, soundOwner));
    if (!attached.ok) {
      throw new Error(
        `could not attach "${sound}"${soundOwner ? ` by ${soundOwner}` : ""} — first results: ${JSON.stringify(attached.seen)}`,
      );
    }
    console.log(`      attached: ${attached.attached}`);
    await sleep(3000);

    // The volume panel follows the timeline SELECTION, so the music clip has
    // to be selected first — otherwise the slider belongs to the video's own
    // audio, and ducking THAT would quiet the narration instead of the music.
    // (Observed live: with the video track selected the panel read 0 dB, and
    // selecting the music clip revealed its -20 dB.)
    await clickElement(tab, '[class*="AudioClip__root"]');
    await sleep(2500);
    const marker = await evalJson(tab, PLACE_VOLUME_MARKER(volumeDb));
    if (!marker.ok) throw new Error(`volume slider not reachable: ${JSON.stringify(marker)}`);
    await clickAtElement(tab, "#__volumeMarker");
    await sleep(1500);
    await evalJson(tab, CLEAR_VOLUME_MARKER);

    // Fail loudly on a mismatch. The mix is the whole point of this step: at
    // 0 dB the music sits ~1 dB ABOVE the narration and buries it, so a
    // silently-wrong volume is worse than no run at all.
    const vol = await evalJson(tab, READ_VOLUME_DB);
    if (!vol.ok) throw new Error(`could not read the music volume back: ${JSON.stringify(vol)}`);
    if (Math.abs(vol.db - volumeDb) > 1) {
      throw new Error(
        `music volume is ${vol.db} dB but ${volumeDb} dB was requested — the music would not sit under the narration. ` +
          `Set it by hand in the open tab's 音量 slider, then publish from there.`,
      );
    }
    console.log(`      volume: ${vol.db} dB (read back from the slider)`);

    console.log("");
    console.log("=".repeat(60));

    if (hasFlag("publish")) {
      // The publish click. The user authorized this capability on 2026-10-24
      // ("发布时跑自动化：脚本一次性做完挂 sound + 设音量 + 点发布"), which is
      // why the flag exists — but the content-pipeline HITL still applies to
      // RUNNING it: the operator passes --publish on the run where publishing
      // is the intended, already-approved action.
      //
      // The sound is attached in THIS session, immediately before publishing.
      // It is not carried over from a draft: TikTok Studio drops the attached
      // sound when a draft is saved and reopened (verified 2026-10-24 — the
      // timeline went from two tracks back to one, and the caption survives),
      // so attaching and publishing have to happen in one pass.
      //
      // The clip edit has to be APPLIED (保存) before publishing. Attaching
      // alone only stages the music in the editor: the post's own sound label
      // stays "原声 - Chinaainews" and the music appears nowhere in the page
      // until the editor is saved (verified 2026-10-25). Skipping this step
      // publishes the video without the music.
      console.log("💾 Applying the clip edit (保存)…");
      const applied = await evalJson(tab, CLICK_BY_TEXT("保存"));
      if (!applied.ok) {
        throw new Error("保存 (save) button not found — publishing now would drop the music");
      }
      await waitFor(tab, OVERLAY_CLOSED, { timeoutMs: 60_000, label: "editor to close" });
      process.stdout.write("\n");

      console.log("🚀 Publishing (--publish)…");
      const scrolled = await evalJson(tab, SCROLL_TO_PUBLISH);
      if (!scrolled.ok || !scrolled.unobstructed) {
        throw new Error(`publish button not clickable: ${JSON.stringify(scrolled)}`);
      }
      await sleep(1500);
      await clickAtElement(tab, '[data-e2e="post_video_button"]');
      await sleep(10_000);
      const after = await evalJson(tab, PUBLISH_STATE);
      if (after.error) throw new Error(`TikTok reported an error after publish: ${after.error}`);
      if (/\/upload/.test(after.url)) {
        throw new Error(`still on the upload page after the publish click — check the tab: ${after.url}`);
      }
      console.log("=".repeat(60));
      console.log("✅ Published.");
      console.log(`   ${after.url}`);
      keepTab = !hasFlag("close-tab");
    } else {
      console.log("✅ Editor is prepared. NOTHING HAS BEEN PUBLISHED.");
      console.log("=".repeat(60));

      if (hasFlag("save-draft")) {
        // 保存草稿 writes the post into the account's TikTok drafts, which sync
        // to the app for review. It is NOT 发布 — the publish decision stays
        // with the operator, so the HITL gate is intact.
        //
        // Caveat worth knowing before relying on it: the attached sound does
        // NOT survive the round trip. Reopening the draft showed one timeline
        // track (the video's own audio) instead of two. The caption does
        // survive. So a draft is good for reviewing caption and framing, and
        // the sound has to be re-attached in the publishing session.
        const saved = await evalJson(tab, CLICK_BY_TEXT("保存草稿"));
        if (saved.ok) {
          console.log("   💾 Draft saved — open TikTok → 主页 → 草稿 to review.");
          console.log("      The post is a draft, not a published video.");
          console.log("      Note: the attached sound does NOT persist in the draft;");
          console.log("      re-attach it by running this script again without --save-draft.");
        } else {
          console.log("   ⚠️  Save-draft button not found — the editor is still open");
          console.log("      in the tab, so you can click 保存草稿 yourself.");
        }
        keepTab = !hasFlag("close-tab");
      } else {
        console.log("   Review the draft in the open tab, then click 发布 (Publish)");
        console.log("   yourself — or re-run with --publish to do it in one pass.");
        console.log(`   Tab: ${tab}`);
        keepTab = true;
      }
    }
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    keepTab = true; // leave the tab so the operator can see where it stopped
    process.exitCode = 1;
  } finally {
    if (!keepTab) {
      await cdpCloseTab(tab);
      console.log(`   (tab closed)`);
    }
  }
}

main().catch((err) => {
  console.error(`❌ ${err.stack || err.message}`);
  process.exit(1);
});
