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
 * Human input layer (#1013, added 2026-10-30)
 * ------------------------------------------
 * The first CDP-published post (2026-10-25) sat at 0 plays after 72h while the
 * four app-published posts before it read 210 / 285 / 419 / 372. The root
 * cause is not established, but the path's INPUT SHAPE was measurable and
 * bot-like, and all five features are now fixed here:
 *
 *   1. Mouse travel. The proxy's `/clickAt` dispatched press/release with no
 *      `mousemove` at all (measured 2026-10-30: `mousedown:trusted`,
 *      `mouseup:trusted`, zero movement events). Every click now goes through
 *      `clickAtPoint` in `lib/human-input.mjs`: a bent Bézier path with
 *      ease-out deceleration, a 0.4-2px overshoot, then a short correction.
 *   2. Caption input. It used to be one synthetic `ClipboardEvent("paste")`
 *      (measured `paste:synthetic`) carrying the whole 1000+ character caption
 *      in a single frame. It is now typed through trusted insertText events,
 *      one grapheme at a time, 30-120ms apart, with occasional 300-900ms
 *      beats at boundaries and real Enter keys for newlines. The paste path
 *      survives as an automatic fallback: typed text is verified against the
 *      requested caption, and a mismatch re-selects and pastes (the only path
 *      Draft.js is known to handle cleanly). `--paste-caption` skips typing
 *      deliberately.
 *   3. Delay jitter. Every wait is `sleepJitter(...PUBLISH_PACING.<name>)` or
 *      `sleepBetween(...)`; no fixed literal remains. A test pins each pacing
 *      entry to a spread of at least 20% of its base and rejects naked
 *      durations (including inside page scripts).
 *   4. Pre-publish review. With `--publish`, the script presses play on the
 *      preview, watches it for a random 5-15s, pauses it, and confirms the
 *      clock moved and then stopped — then records the verdict in the publish
 *      log. The preview is a canvas with no <video> element, so the evidence
 *      is the player's own clock. `--skip-review` opts out.
 *   5. Session warm-up. Unless `--no-warmup`, the session opens on the For You
 *      feed, scrolls 2-4 times with a 2.3-4.7s dwell after each, and only then
 *      navigates to the upload page.
 *
 * The technical enabler: Chrome accepts a second flattened CDP session on the
 * same target, so the driver opens its own browser-level session on the tab
 * the proxy owns and dispatches trusted input there. Verified live 2026-10-30
 * (mousemove / mousedown / insertText all arrived as `isTrusted: true`,
 * emoji included). The shared web-access proxy is a submodule and is left
 * untouched.
 *
 * Publish log
 * -----------
 * Every step appends one JSON line to
 * `output/{content}/publish/tiktok/publish-log.jsonl` (when `--content` points
 * at an existing pipeline directory): warm-up, caption mode, AIGC, sound,
 * volume, review verdict and publish result. That is where "已审阅" lives.
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
 *   --no-warmup           Skip the For You warm-up before the upload page.
 *   --paste-caption       Paste the caption in one event instead of typing it.
 *                         The run does this automatically when typed text does
 *                         not verify; this flag just skips the attempt.
 *   --skip-review         Skip the pre-publish playback review (the publish
 *                         log then says `reviewed: false`).
 *   --close-tab           Close the tab when done (dry runs / testing). The
 *                         tab is kept by default, so the operator can review
 *                         and publish by hand.
 *   --save-draft          After preparing, click 保存草稿 (Save draft) so the
 *                         post lands in the account's TikTok drafts. Still
 *                         never publishes. The attached sound does NOT survive
 *                         a draft save/reopen; the caption does.
 *   --dry-run             Everything except the upload (page reachability only)
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import { CDP_BASE, cdpNewTab, cdpEval, cdpCloseTab } from "./lib/cdp-client.mjs";
import { ensureCdpProfileGuard } from "./lib/cdp-preflight.mjs";
import { automationPort } from "./lib/cdp-profile-guard.mjs";
import {
  clickAtPoint,
  openVisibleSession,
  planTyping,
  pokeEditorState,
  pressEnter,
  randomBetween,
  sleepBetween,
  sleepJitter,
  typePlan,
  wheelScroll,
} from "./lib/human-input.mjs";
import { PUBLISH_PACING, REVIEW_WATCH_MS } from "./lib/publish-pacing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload";
const WARMUP_URL = "https://www.tiktok.com/foryou";
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

/** Find a clickable element whose own text is exactly `label`, and tag it. */
const TAG_BY_TEXT = (label, id = "__byText") => `
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
  if (!hit) return JSON.stringify({ ok: false, reason: "not found" });
  const btn = hit.closest("button, [role=button]") || hit;
  btn.id = ${JSON.stringify(id)};
  btn.scrollIntoView({ block: "center" });
  const r = btn.getBoundingClientRect();
  return JSON.stringify({ ok: true, id: ${JSON.stringify(id)}, tag: btn.tagName, x: r.x, y: r.y, width: r.width, height: r.height });
})()`;

/** JS-level click (fallback only — produces no pointer events at all). */
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
 * Resolve a click target to viewport coordinates.
 *
 * Returns the rect and whether the point is actually reachable. The publisher
 * uses this to aim a human click; the pointer no longer teleports to a
 * hardcoded centre, so a target that is covered or off-screen must fail here
 * with a name instead of clicking whatever happens to be on top.
 */
const RESOLVE_CLICK_TARGET = (selector) => `
(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return JSON.stringify({ ok: false, reason: "not found" });
  el.scrollIntoView({ block: "center" });
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return JSON.stringify({ ok: false, reason: "zero-size" });
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return JSON.stringify({
    ok: true,
    x: r.x, y: r.y, width: r.width, height: r.height,
    inViewport: r.y >= 0 && r.y + r.height <= window.innerHeight,
    topmost: !!(hit && (hit === el || el.contains(hit))),
    pointerEvents: getComputedStyle(el).pointerEvents,
  });
})()`;

/**
 * Focus the caption editor and select its contents.
 *
 * The field is a Draft.js editor (`div.public-DraftEditor-content`) and it
 * arrives PRE-FILLED with the video's filename. Draft.js keeps its own
 * ContentState beside the DOM, so typing into the DOM is not enough — the
 * editor has to receive the text through a path it actually handles.
 *
 * `document.execCommand("selectAll")` is what reaches it: neither a synthetic
 * Cmd+A keydown nor a DOM Range does. Select first, then type (or paste) over
 * the filename. Do NOT add an `execCommand("delete")` in between: clearing
 * first and then pasting was tried and is worse — the paste landed with the
 * first paragraph missing (708 of 1223 chars) because the delete re-renders
 * Draft.js's ContentState and the paste races it.
 */
/**
 * The caption field, in priority order, as page-side JS.
 *
 * One source for the four places that need it (select, paste, read, click):
 * they used to carry four copies of this chain, and the click carried a single
 * selector instead — so a human click could land on a different element than
 * the paste and the read that followed.
 */
const CAPTION_LOOKUP = `(
    document.querySelector('div[contenteditable="true"][data-e2e*="caption"]') ||
    document.querySelector("div.public-DraftEditor-content") ||
    document.querySelector('div[contenteditable="true"]') ||
    [...document.querySelectorAll("textarea")].find((t) => t.getBoundingClientRect().width > 0)
  )`;

const CAPTION_SELECT = `
(() => {
  const el = ${CAPTION_LOOKUP};
  if (!el) return JSON.stringify({ ok: false, reason: "no caption field" });

  // Tag it so the human click below targets the same element this select,
  // the paste and the read all resolve to.
  el.id = "__caption";
  const isField = el.tagName === "TEXTAREA" || el.tagName === "INPUT";
  const prefilled = isField ? el.value : el.innerText;
  el.focus();
  if (isField) el.select();
  else document.execCommand("selectAll");
  return JSON.stringify({ ok: true, kind: isField ? "field" : "editor", prefilled });
})()`;

/**
 * Paste the caption as one synthetic ClipboardEvent.
 *
 * This is the FALLBACK path, and it is kept because it is the only path
 * Draft.js has been proven to handle cleanly: typing is the normal route, but
 * if the typed text does not verify (autocomplete, an emoji Draft refuses to
 * compose, a page re-render mid-typing), re-selecting and pasting replaces the
 * whole body in one step. Insert the paste after `CAPTION_SELECT`, never after
 * a delete.
 */
const CAPTION_PASTE = (caption) => `
(() => {
  const want = ${JSON.stringify(caption)};
  const el = ${CAPTION_LOOKUP};
  if (!el) return JSON.stringify({ ok: false, reason: "no caption field" });

  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, want);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return JSON.stringify({ ok: true, mode: "value", len: el.value.length });
  }

  const dt = new DataTransfer();
  dt.setData("text/plain", want);
  el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
  return JSON.stringify({ ok: true, mode: "paste" });
})()`;

/** Read the caption back and whether the editor is still alive. */
const CAPTION_READ = `
(() => {
  const el = ${CAPTION_LOOKUP};
  if (!el) return JSON.stringify({ ok: false, reason: "no caption field" });
  const isField = el.tagName === "TEXTAREA" || el.tagName === "INPUT";
  const text = isField ? el.value : el.innerText;
  return JSON.stringify({
    ok: true,
    text,
    len: text.length,
    healthy:
      document.body.innerText.includes("视频描述") &&
      document.querySelectorAll("button.editor-entrance").length > 0,
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

/** True once the upload page's file input is mounted. */
const FILE_INPUT_READY = `
(() => JSON.stringify({ ready: !!document.querySelector('input[type="file"]') }))()`;

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
 *
 * Tags the tab button so the driver can click it with a real pointer; the
 * page-side `.click()` is kept as the fallback in `clickElement`.
 */
const OPEN_MUSIC_TAB = `
(() => {
  const btns = [...document.querySelectorAll("button.editor-entrance")];
  const music = btns.find((b) => (b.innerText || "").trim() === "音乐");
  if (!music) {
    return JSON.stringify({ ok: false, tabs: btns.map((b) => (b.innerText || "").trim()) });
  }
  music.id = "__musicTab";
  music.scrollIntoView({ block: "center" });
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

/** Tag the sound-library search box so the pointer can focus it for real. */
const TAG_SOUND_SEARCH = `
(() => {
  const inp =
    document.querySelector('input[placeholder="搜索音乐"]') ||
    document.querySelector('input[placeholder*="搜索"]') ||
    [...document.querySelectorAll("input[type=text]")].find((i) => i.getBoundingClientRect().width > 0);
  if (!inp) return JSON.stringify({ ok: false, reason: "no search input" });
  inp.id = "__soundSearch";
  inp.scrollIntoView({ block: "center" });
  return JSON.stringify({ ok: true });
})()`;

/** Read the search box value back (typed text is verified, not assumed). */
const READ_SEARCH_VALUE = `
(() => {
  const inp = document.getElementById("__soundSearch");
  return JSON.stringify({ ok: !!inp, value: inp ? inp.value : null });
})()`;

/**
 * Set the search value through the input setter (fallback only).
 *
 * Needed because the native input may drop a trusted insertText if the panel
 * re-mounted between the click and the keystrokes. The value is always read
 * back afterwards.
 */
const SET_SEARCH_VALUE = (query) => `
(() => {
  const inp =
    document.getElementById("__soundSearch") ||
    document.querySelector('input[placeholder="搜索音乐"]') ||
    document.querySelector('input[placeholder*="搜索"]');
  if (!inp) return JSON.stringify({ ok: false, reason: "no search input" });
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, ${JSON.stringify(query)});
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  return JSON.stringify({ ok: true, value: inp.value });
})()`;

/** Count sound results (used to poll after a search). */
const SOUND_RESULT_COUNT = `
(() => JSON.stringify({
  ready: document.querySelectorAll(".MusicPanelMusicItem__wrap").length > 0,
  count: document.querySelectorAll(".MusicPanelMusicItem__wrap").length,
}))()`;

/** Tag a sound from the results list by title (+ optional owner). */
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
  btn.id = "__soundPick";
  btn.scrollIntoView({ block: "center" });
  return JSON.stringify({ ok: true, attached: label, selector: "#__soundPick" });
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
 * target, so this injects a throwaway marker at the exact x and lets the
 * human pointer land on it. `pointer-events: none` makes the marker
 * transparent to the click, so the press reaches the slider underneath.
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
// inner input does nothing. On 2026-10-25 flipping it opened a confirmation
// modal that had to be accepted before the state changed; on 2026-10-30 the
// same account flipped it directly with no modal. So the step clicks, accepts
// a modal IF one appears, and then verifies the switch's own state — that is
// the only fact that ships.

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
 * Tag the switch with an id so the pointer can land on it.
 *
 * The editor scrolls between measuring and clicking, so the position has to be
 * read in the same call that tags the element, and the click has to be a real
 * CDP mouse press — a synthetic `.click()` does not move this control.
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

/** Tag the "标记 AI 生成的内容" confirmation modal's accept button. */
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

/**
 * Tag the preview's play button so the pre-publish review can press play on
 * the real player.
 *
 * There is no <video> element to drive: Studio renders the preview to a
 * <canvas> inside `.Player__root`, and the only observable state is the
 * control bar — the play/pause button label and the `00:00:03 / 00:01:04`
 * clock. Verified on a live prepared post 2026-10-30 (`videos: []`, canvas
 * 284x558, `.play-time` present). A `<video>`-based review would have
 * reported "not reviewed" on every run.
 */
const REVIEW_TARGET = `
(() => {
  const btn = document.querySelector(".video-player-control .play-btn");
  const time = document.querySelector(".video-player-control .play-time");
  if (!btn || !time) return JSON.stringify({ ok: false, reason: "no player controls on the page" });
  btn.id = "__reviewPlay";
  btn.scrollIntoView({ block: "center" });
  return JSON.stringify({
    ok: true,
    label: (btn.innerText || "").trim(),
    timeText: time.innerText,
    progress: (document.querySelector(".video-player-control .progress-bar") || {}).style?.width || null,
  });
})()`;

/** Read the tagged player's clock and control label. */
const REVIEW_STATE = `
(() => {
  const time = document.querySelector(".video-player-control .play-time");
  if (!time) return JSON.stringify({ ok: false, reason: "no player clock" });
  const btn = document.getElementById("__reviewPlay") || document.querySelector(".video-player-control .play-btn");
  return JSON.stringify({
    ok: true,
    timeText: time.innerText,
    label: btn ? (btn.innerText || "").trim() : null,
    progress: (document.querySelector(".video-player-control .progress-bar") || {}).style?.width || null,
  });
})()`;

// ─── publish log ───

/**
 * Append one JSON line per step to the content's publish package.
 *
 * Written only when `--content` names an existing pipeline directory, so a
 * typo cannot create a stray output tree. Without a log file the same entries
 * go nowhere; stdout remains the operator-facing trace.
 */
function makePublishLogger(contentId) {
  if (!contentId) return () => {};
  const outDir = join(__dirname, "output", contentId);
  if (!existsSync(outDir)) return () => {};
  const dir = join(outDir, "publish", "tiktok");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "publish-log.jsonl");
  return (step, detail = {}) => {
    const entry = { at: new Date().toISOString(), step, ...detail };
    appendFileSync(file, `${JSON.stringify(entry)}\n`);
    return entry;
  };
}

// ─── driver ───

/** Pointer position, carried across clicks so paths start where the last ended. */
const pointer = { x: 320, y: 320 };

const normalizeCaption = (s) =>
  s
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

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
 * Click an element with a JS-level `.click()`.
 *
 * Kept as the FALLBACK only: it produces no pointer events at all, which is
 * one of the bot-like features #1013 is about. Used when a human click has
 * been tried and the expected state did not follow.
 */
async function clickElement(tabId, selector) {
  const resp = await fetch(`${CDP_BASE}/click?target=${tabId}`, {
    method: "POST",
    body: selector,
  }).then((r) => r.json());
  if (!resp?.clicked) throw new Error(`click failed for ${selector}: ${JSON.stringify(resp)}`);
  return resp;
}

/** Resolve an element's viewport rect (and reachability) for a human click. */
async function resolveClickTarget(tabId, selector) {
  return evalJson(tabId, RESOLVE_CLICK_TARGET(selector));
}

/** Pick a point inside the element, biased to its centre by at most ±3px. */
function clickPointWithin(rect, rand = Math.random) {
  const jx = Math.min(3, rect.width / 4);
  const jy = Math.min(3, rect.height / 4);
  return {
    x: Math.round((rect.x + rect.width / 2 + randomBetween(-jx, jx, rand)) * 10) / 10,
    y: Math.round((rect.y + rect.height / 2 + randomBetween(-jy, jy, rand)) * 10) / 10,
  };
}

/**
 * Move the pointer along a human path and click the element.
 *
 * @param {string} tabId
 * @param {object} cdp - session from openCdpSession
 * @param {string} selector
 * @returns {Promise<{ mode: string, x: number, y: number, holdMs: number }>}
 */
async function humanClickElement(tabId, cdp, selector) {
  const target = await resolveClickTarget(tabId, selector);
  if (!target.ok) throw new Error(`click target ${selector}: ${target.reason || "not found"}`);
  if (!target.topmost && target.pointerEvents !== "none") {
    throw new Error(`click target ${selector} is covered at its centre`);
  }
  const point = clickPointWithin(target);
  const result = await clickAtPoint(cdp, { from: { ...pointer }, to: point });
  pointer.x = point.x;
  pointer.y = point.y;
  return { mode: "human", x: point.x, y: point.y, holdMs: result.holdMs };
}

/**
 * Poll a page script until it reports the expected state.
 *
 * Never throws; returns the last observation so the caller can decide between
 * a fallback and a hard failure. `isReady` defaults to the `ready` envelope
 * the scripts in this file use.
 */
async function pollFor(
  tabId,
  script,
  { timeoutMs = 20_000, label = "state", isReady = (s) => !!s?.ready } = {},
) {
  const started = Date.now();
  let last = null;
  let printed = false;
  while (Date.now() - started < timeoutMs) {
    last = await evalJson(tabId, script);
    if (isReady(last)) {
      if (printed) process.stdout.write("\n");
      return { ready: true, last };
    }
    process.stdout.write(
      `  … waiting for ${label} (${Math.round((Date.now() - started) / 1000)}s)\r`,
    );
    printed = true;
    await sleepJitter(...PUBLISH_PACING.poll);
  }
  if (printed) process.stdout.write("\n");
  return { ready: false, last };
}

/** Poll a predicate script until ready, or throw with the last state. */
async function waitFor(tabId, script, opts = {}) {
  const { timeoutMs = 180_000, label = "state", isReady } = opts;
  const result = await pollFor(tabId, script, { timeoutMs, label, isReady });
  if (!result.ready) {
    throw new Error(
      `${label} not reached within ${timeoutMs / 1000}s — last state: ${JSON.stringify(result.last)}`,
    );
  }
  return result.last;
}

const readyOnOk = (s) => !!s?.ok;

/**
 * Human-click an element and verify the state it is supposed to cause.
 *
 * The JS `.click()` fallback exists for controls that ignore synthetic
 * pointer presses (the volume slider needed a real one, but the reverse also
 * happens). Every fallback is announced, because it is exactly the kind of
 * input-shape regression this file is trying to keep visible.
 */
async function humanClickThen(
  tabId,
  cdp,
  selector,
  verifyScript,
  { label, timeoutMs = 20_000, jsFallback = true, isReady } = {},
) {
  let mode = "human";
  try {
    await humanClickElement(tabId, cdp, selector);
  } catch (err) {
    if (!jsFallback) throw err;
    mode = "js-fallback";
    console.log(`      ⚠️ ${label}: human click failed (${err.message}) — using JS click`);
  }

  if (mode === "human") {
    const first = await pollFor(tabId, verifyScript, { timeoutMs, label, isReady });
    if (first.ready) return { mode };
    if (!jsFallback) {
      throw new Error(`${label}: no response after a human click — ${JSON.stringify(first.last)}`);
    }
    console.log(`      ⚠️ ${label}: human click did not take — falling back to a JS click`);
    mode = "js-fallback";
  }

  await clickElement(tabId, selector);
  const second = await pollFor(tabId, verifyScript, { timeoutMs, label, isReady });
  if (!second.ready) {
    throw new Error(
      `${label}: still no response after a JS click — ${JSON.stringify(second.last)}`,
    );
  }
  return { mode: "js-fallback" };
}

/**
 * Fill the caption by typing it like a person, with a verified paste fallback.
 *
 * Typing goes through trusted insertText events (Draft.js sees `beforeinput`
 * with `inputType: "insertText"`), one grapheme at a time. The editor is then
 * poked (`pokeEditorState`) so Draft rebuilds the block from its own
 * ContentState — a DOM-only insertion looks identical in `innerText` but saves
 * empty later. The final text is compared with whitespace normalized: Draft.js
 * renders block boundaries as extra newlines in `innerText`, so an exact
 * string compare would fail on formatting alone. If the text diverged — an
 * autocomplete swallowed a keystroke, an emoji did not compose, a re-render
 * ate a chunk — re-select the editor and paste once.
 */
async function fillCaption(tabId, cdp, caption, { pasteOnly = false } = {}) {
  const selected = await evalJson(tabId, CAPTION_SELECT);
  if (!selected.ok) throw new Error(`caption field not found: ${JSON.stringify(selected)}`);
  await sleepJitter(...PUBLISH_PACING.captionFieldSelect);

  const want = normalizeCaption(caption);
  const typed =
    !pasteOnly && selected.kind === "editor"
      ? await (async () => {
          const plan = planTyping(caption);
          const started = Date.now();
          let printed = 0;
          console.log(
            `      typing ${caption.length} chars (~${Math.round(plan.estimateMs / 1000)}s)…`,
          );
          await typePlan(cdp, plan, {
            onSegment: (_seg, index) => {
              const pct = Math.floor((index / plan.segments.length) * 100);
              if (pct >= printed + 10) {
                printed = pct;
                process.stdout.write(`\r      typing… ${pct}%`);
              }
            },
          });
          process.stdout.write("\r");
          // Make Draft render from its state before we trust the DOM text.
          await pokeEditorState(cdp);
          await sleepJitter(...PUBLISH_PACING.captionSettleAfterTyping);
          return { plan, typedMs: Date.now() - started };
        })()
      : null;

  const read = await evalJson(tabId, CAPTION_READ);
  if (!read.ok) throw new Error(`caption vanished after typing: ${JSON.stringify(read)}`);
  if (!read.healthy) throw new Error("editor died after typing — check the open tab");

  if (normalizeCaption(read.text) === want) {
    return {
      mode: typed ? "typed" : "paste",
      len: read.len,
      typedMs: typed?.typedMs,
      segments: typed?.plan.segments.length,
    };
  }

  // Fallback: the typed text did not survive. Re-select, paste once, verify.
  const reselected = await evalJson(tabId, CAPTION_SELECT);
  if (!reselected.ok) throw new Error(`caption re-select failed: ${JSON.stringify(reselected)}`);
  await sleepJitter(...PUBLISH_PACING.captionFieldSelect);
  const pasted = await evalJson(tabId, CAPTION_PASTE(caption));
  if (!pasted.ok) throw new Error(`caption paste failed: ${JSON.stringify(pasted)}`);
  await sleepJitter(...PUBLISH_PACING.captionSettleAfterTyping);

  const after = await evalJson(tabId, CAPTION_READ);
  if (!after.ok || !after.healthy) {
    throw new Error(`editor died after the paste fallback: ${JSON.stringify(after)}`);
  }
  if (normalizeCaption(after.text) !== want) {
    throw new Error(
      `caption did not verify after typing and pasting — got ${after.len} chars, ` +
        `want ${caption.length}: ${JSON.stringify(after.text.slice(0, 80))}`,
    );
  }
  console.log(
    `      ⚠️ typed caption did not verify (${read.len} chars) — replaced it with one paste`,
  );
  return { mode: "paste-fallback", len: after.len, typedMs: typed?.typedMs };
}

/**
 * Type into the sound search box and press Enter.
 *
 * Same reasoning as the caption: writing `.value` and dispatching a synthetic
 * `input` event is a fingerprint. The value is read back, and only a mismatch
 * falls back to the setter.
 */
async function searchSound(tabId, cdp, query) {
  const tagged = await evalJson(tabId, TAG_SOUND_SEARCH);
  if (!tagged.ok) throw new Error(`sound search input not found: ${JSON.stringify(tagged)}`);
  await humanClickElement(tabId, cdp, "#__soundSearch");
  await typePlan(cdp, planTyping(query));

  const read = await evalJson(tabId, READ_SEARCH_VALUE);
  let mode = "typed";
  if (!read.ok || read.value !== query) {
    const set = await evalJson(tabId, SET_SEARCH_VALUE(query));
    if (!set.ok) throw new Error(`sound search text did not take: ${JSON.stringify(read)}`);
    mode = "setter-fallback";
    console.log("      ⚠️ sound search: typed value did not stick — set it via the input setter");
  }
  await pressEnter(cdp);
  return { mode };
}

/**
 * Warm the session up on the For You feed before the upload page opens.
 *
 * A session that goes straight to the upload URL, fills a form and publishes
 * is a shape no creator produces. This dwells and scrolls first, with human
 * wheel events, then navigates the same tab to the upload page so the journey
 * has a history.
 */
async function runSessionWarmup(cdp, tab) {
  const startedAt = Date.now();
  const scrolls = [];
  const modes = [];
  const cycles = Math.max(2, Math.round(randomBetween(2, 4)));
  let wheelsUsable = true;
  for (let i = 0; i < cycles; i++) {
    const deltaY = Math.round(randomBetween(280, 760));
    let scrolled = { mode: "wheel" };
    if (wheelsUsable) {
      scrolled = await wheelScroll(cdp, {
        x: Math.round(randomBetween(480, 980)),
        y: Math.round(randomBetween(320, 620)),
        totalDeltaY: deltaY,
      });
      if (scrolled.mode !== "wheel") {
        // Chrome sometimes stops acknowledging wheel dispatches on this build
        // (measured 2026-10-30). The fallback scrolls anyway; naming it here
        // keeps the difference between a human scroll and a scripted one
        // visible, and stops the remaining cycles paying the same wait.
        console.log(`      ⚠️ warm-up scroll ${i + 1}/${cycles} was scripted: ${scrolled.reason}`);
        wheelsUsable = false;
      }
    } else {
      await evalJson(
        tab,
        `(() => { window.scrollBy(0, ${deltaY}); return JSON.stringify({ok: true}); })()`,
      );
      scrolled = { mode: "js-fallback" };
    }
    modes.push(scrolled.mode);
    scrolls.push(deltaY);
    await sleepJitter(...PUBLISH_PACING.warmupDwell);
  }
  const dwellMs = Date.now() - startedAt;
  await fetch(`${CDP_BASE}/navigate?target=${tab}`, { method: "POST", body: UPLOAD_URL });
  return { dwellMs, scrolls, cycles, modes };
}

/**
 * Parse the player clock ("00:00:03 / 00:01:04") into seconds.
 *
 * @param {string|null|undefined} text
 * @returns {number|null}
 */
export function parseClock(text) {
  if (!text) return null;
  const hms = /(\d+):(\d{2}):(\d{2})/.exec(text);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const ms = /(\d+):(\d{2})/.exec(text);
  if (ms) return Number(ms[1]) * 60 + Number(ms[2]);
  return null;
}

/**
 * Watch a random stretch of the prepared video before publishing.
 *
 * The first CDP-published post went from "upload finished" straight to
 * "发布" — no creator does that. This presses play on the real preview, lets
 * it run for 5-15s, pauses it, and records what actually happened. It never
 * blocks: a preview that will not play is reported as `reviewed: false` with
 * a reason, and the publish decision stays with the operator/flag.
 *
 * The preview is a canvas, not a <video>, so the evidence is the player's own
 * clock: it must advance from where it started. That check is what prevents a
 * "review" that clicks play on a control that never started.
 */
export async function reviewBeforePublish(tabId, cdp) {
  const target = await evalJson(tabId, REVIEW_TARGET);
  if (!target.ok) return { reviewed: false, reason: target.reason };

  await sleepJitter(...PUBLISH_PACING.reviewLeadIn);
  const startSeconds = parseClock(target.timeText);
  if (startSeconds === null) {
    return {
      reviewed: false,
      reason: `unreadable player clock: ${JSON.stringify(target.timeText)}`,
    };
  }

  // Is it already playing? Compare the clock across a short interval; that is
  // more reliable than a localized play/pause label.
  const first = parseClock((await evalJson(tabId, REVIEW_STATE)).timeText);
  await sleepJitter(...PUBLISH_PACING.reviewLeadIn);
  const second = parseClock((await evalJson(tabId, REVIEW_STATE)).timeText);
  const alreadyPlaying = first !== null && second !== null && second > first + 0.2;

  let started = false;
  if (!alreadyPlaying) {
    // Stand still on the frame before pressing play — a person sizes up the
    // clip first, and it separates this click from the last one.
    await sleepJitter(...PUBLISH_PACING.reviewBeforePlay);
    await humanClickElement(tabId, cdp, "#__reviewPlay");
    const advanced = await pollFor(tabId, REVIEW_STATE, {
      timeoutMs: 15_000,
      label: "preview playback",
      isReady: (s) => {
        const t = parseClock(s?.timeText);
        return t !== null && t > startSeconds + 0.5;
      },
    });
    started = advanced.ready;
    if (!started) {
      return { reviewed: false, reason: "pressing play did not start playback", watchedMs: 0 };
    }
  }

  const watchedMs = await sleepBetween(...REVIEW_WATCH_MS);
  const during = await evalJson(tabId, REVIEW_STATE);
  const endClock = parseClock(during.timeText);
  const advancedSeconds =
    startSeconds !== null && endClock !== null ? Number((endClock - startSeconds).toFixed(2)) : 0;

  // Pause only if playback actually happened, so a preview that never started
  // is not toggled on at the end of the watch.
  if (advancedSeconds > 0) await humanClickElement(tabId, cdp, "#__reviewPlay");

  // Confirm the pause by watching the clock stand still. The control's label
  // lags the click by a React render — read immediately it still says 暂停 —
  // so a label check would report the state we just left.
  const pauseClockA = parseClock((await evalJson(tabId, REVIEW_STATE)).timeText);
  await sleepJitter(...PUBLISH_PACING.pauseConfirm);
  const pauseClockB = parseClock((await evalJson(tabId, REVIEW_STATE)).timeText);
  const pausedAfter = pauseClockA !== null && pauseClockB !== null && pauseClockB === pauseClockA;

  const reviewed = advancedSeconds >= 2;
  return {
    reviewed,
    watchedMs,
    advancedSeconds,
    startedPlayback: started || alreadyPlaying,
    pausedAfter,
    reason: reviewed ? undefined : "playback did not advance",
  };
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const videoArg = getArg("video");
  // --dry-run only proves the upload page is reachable, so a video is not
  // required for it — that is the whole point of the mode.
  if (!videoArg && !dryRun) {
    console.error("❌ --video is required");
    console.error(
      "   Example: --video output/unitree-h2x-guardian/xxx-short.mp4 --content unitree-h2x-guardian",
    );
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

  // Validate the volume BEFORE anything runs. `Number("--publish")` is NaN, and
  // NaN would flow into the marker's CSS and then into the read-back guard —
  // `Math.abs(vol.db - NaN) > 1` is false for every reading, so the check that
  // exists to catch a wrong mix would pass a mix it never verified. Fail here
  // instead, where the message can name the argument.
  const volumeArg = getArg("volume-db");
  const volumeDb = volumeArg !== null ? Number(volumeArg) : DEFAULT_VOLUME_DB;
  if (!Number.isFinite(volumeDb)) {
    console.error(`❌ --volume-db must be a number, got: ${JSON.stringify(volumeArg)}`);
    console.error(
      '   Example: --volume-db -15   (a missing value swallows the next flag, e.g. "--volume-db --publish")',
    );
    process.exit(1);
  }

  // Caption resolution: explicit text > explicit file > the pipeline package.
  let caption = getArg("caption");
  const captionFile =
    getArg("caption-file") ||
    (contentId
      ? join(__dirname, "output", contentId, "publish", "tiktok", "tiktok-caption.txt")
      : null);
  if (!caption && captionFile && existsSync(captionFile)) {
    caption = readFileSync(captionFile, "utf8").trim();
  }

  // Publishing is irreversible and the caption field arrives pre-filled with
  // the video's FILENAME (see the header). Without a caption the run would
  // publish a post whose entire description is "…-short.mp4". A typo'd
  // --content or a run before generate-caption.mjs lands here, so refuse
  // rather than ship it; preparing without publishing stays allowed.
  if (hasFlag("publish") && !caption) {
    console.error("❌ refusing to --publish with no caption resolved.");
    console.error(`   Looked for: ${captionFile ?? "(no --content, so no default path)"}`);
    console.error(
      "   The description field is pre-filled with the video's filename, so this would publish that filename as the caption.",
    );
    console.error(
      "   Fix: run generate-caption.mjs, or pass --caption / --caption-file. Drop --publish to prepare the post and review it first.",
    );
    process.exit(1);
  }

  // The publish path is a security boundary — the same profile guard the rest
  // of the pipeline uses, so this can never silently run against a profile
  // without the account's login state.
  await ensureCdpProfileGuard();

  const log = makePublishLogger(contentId);

  console.log("");
  console.log("=".repeat(60));
  console.log("📤 TikTok upload prep (stops before Publish — HITL)");
  console.log("=".repeat(60));
  console.log(`  Video:   ${videoPath ? basename(videoPath) : "(none — dry run)"}`);
  console.log(`  Sound:   ${sound}${soundOwner ? ` — ${soundOwner}` : ""}`);
  console.log(`  Volume:  ${volumeDb} dB`);
  console.log(`  Caption: ${caption ? `${caption.length} chars` : "(none — will skip)"}`);
  console.log(`  Warm-up: ${hasFlag("no-warmup") ? "skipped" : `${WARMUP_URL} (scroll + dwell)`}`);
  console.log(
    `  Input:   ${hasFlag("paste-caption") ? "paste caption (explicit)" : "typed caption"} · human pointer paths · jittered waits`,
  );
  console.log("");

  if (dryRun) {
    console.log("  --dry-run: checking page reachability only");
    const tab = await cdpNewTab(UPLOAD_URL);
    try {
      await sleepJitter(...PUBLISH_PACING.dryRunReachability);
      const state = await evalJson(tab, EDITOR_STATE);
      console.log(`  ✅ upload page reachable — ${JSON.stringify(state)}`);
    } finally {
      await cdpCloseTab(tab);
    }
    return;
  }

  log("start", {
    video: videoPath ? basename(videoPath) : null,
    sound,
    soundOwner,
    volumeDb,
    captionChars: caption ? caption.length : 0,
    publish: hasFlag("publish"),
    warmup: !hasFlag("no-warmup"),
    captionMode: hasFlag("paste-caption") ? "paste" : "typed",
  });

  let tab = null;
  let cdp = null;
  pointer.x = Math.round(randomBetween(200, 900));
  pointer.y = Math.round(randomBetween(160, 620));
  let keepTab = !hasFlag("close-tab");
  try {
    // Foreground is a precondition, not a courtesy: a hidden tab throttles
    // input dispatch to ~5s per event (measured) and TikTok's uploader never
    // starts. `openVisibleSession` checks it and, when the automation window
    // cannot be raised (another macOS Space, fully occluded), re-hosts the
    // upload in a window Chrome places on the active Space — same page, 8ms
    // per event instead of 5s.
    const launch = await openVisibleSession(hasFlag("no-warmup") ? UPLOAD_URL : WARMUP_URL, {
      port: automationPort(),
      createTab: cdpNewTab,
      closeTab: cdpCloseTab,
      onRehost: (reason) => console.log(`      ⚠️ ${reason} — opening a new window`),
    });
    tab = launch.targetId;
    cdp = launch.session;
    log("input", { window: launch.window });

    if (hasFlag("no-warmup")) {
      console.log("  0/6 warm-up skipped (--no-warmup)");
      log("warmup", { skipped: true });
      await sleepJitter(...PUBLISH_PACING.uploadPageOpen);
    } else {
      console.log("  0/6 warming the session up on For You…");
      await sleepJitter(...PUBLISH_PACING.warmupPageLoad);
      const warmed = await runSessionWarmup(cdp, tab);
      console.log(
        `      warmed: ${warmed.cycles} scroll(s), ${Math.round(warmed.dwellMs / 1000)}s dwell`,
      );
      log("warmup", { skipped: false, ...warmed });
      await sleepJitter(...PUBLISH_PACING.uploadPageSettle);
    }

    console.log("  1/6 upload page open — waiting for the editor…");
    await waitFor(tab, FILE_INPUT_READY, { timeoutMs: 90_000, label: "upload page" });

    console.log("  2/6 selecting the video file…");
    const setFiles = await fetch(`${CDP_BASE}/setFiles?target=${tab}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selector: 'input[type="file"]', files: [videoPath] }),
    }).then((r) => r.json());
    if (!setFiles?.success) throw new Error(`setFiles failed: ${JSON.stringify(setFiles)}`);
    log("upload", { file: basename(videoPath), set: true });

    console.log("  3/6 waiting for the upload to finish…");
    await waitFor(tab, EDITOR_STATE, { timeoutMs: 300_000, label: "editor ready" });

    if (caption) {
      // Tag and select the field first (CAPTION_SELECT also focuses it), then
      // click the tagged element with a real pointer press — Draft.js ignores a
      // selection set by script alone.
      const selected = await evalJson(tab, CAPTION_SELECT);
      if (!selected.ok) throw new Error(`caption field not found: ${JSON.stringify(selected)}`);
      await sleepJitter(...PUBLISH_PACING.captionFieldSelect);
      await humanClickElement(tab, cdp, "#__caption");
      const filled = await fillCaption(tab, cdp, caption, {
        pasteOnly: hasFlag("paste-caption"),
      });
      console.log(
        `  4/6 caption ${filled.mode} (${filled.len} chars` +
          `${filled.segments ? `, ${filled.segments} segments` : ""}` +
          `${filled.typedMs ? `, ${Math.round(filled.typedMs / 1000)}s` : ""})`,
      );
      log("caption", filled);
    } else {
      console.log("  4/6 caption skipped (none supplied)");
      log("caption", { mode: "skipped" });
    }

    // AIGC disclosure. Runs before the sound step because it is a compliance
    // obligation (lib/platforms/tiktok.mjs aiDisclosure.required), not a
    // preference: a post that ships without it cannot be fixed afterwards.
    if (hasFlag("no-aigc")) {
      console.log("  5/6 AIGC label SKIPPED (--no-aigc) — the post will not carry a disclosure");
      log("aigc", { mode: "skipped" });
    } else {
      const advanced = await evalJson(tab, OPEN_ADVANCED);
      if (!advanced.ok) throw new Error(`could not expand 显示更多: ${JSON.stringify(advanced)}`);
      await sleepJitter(...PUBLISH_PACING.aigcExpand);

      const before = await evalJson(tab, READ_AIGC);
      if (!before.ok) throw new Error(`could not read the AIGC switch: ${JSON.stringify(before)}`);

      if (before.checked) {
        console.log("  5/6 AIGC label already on");
        log("aigc", { mode: "already-on" });
      } else {
        const tagged = await evalJson(tab, TAG_AIGC_SWITCH);
        if (!tagged.ok) throw new Error(`could not tag the AIGC switch: ${JSON.stringify(tagged)}`);
        await sleepJitter(...PUBLISH_PACING.aigcTagSettle);

        // Click, then find out what this UI version actually does. Two shapes
        // have been observed on the same account:
        //   - 2026-10-25: the switch opens a "标记 AI 生成的内容" modal that
        //     must be accepted with 开启;
        //   - 2026-10-30: the switch flips directly, no modal at all.
        // Assuming the modal was how the smoke run failed: the toggle DID go
        // on, but the verification waited for a modal that never came, then
        // "retried" with a JS click. Verify the SWITCH STATE instead — it is
        // the thing that ships.
        await humanClickElement(tab, cdp, "#__aigcSwitch");
        await sleepJitter(...PUBLISH_PACING.aigcTagSettle);

        const confirm = await evalJson(tab, TAG_AIGC_CONFIRM);
        if (confirm.ok) {
          await humanClickElement(tab, cdp, "#__aigcConfirm");
          await sleepJitter(...PUBLISH_PACING.aigcConfirmSettle);
        }

        let after = await pollFor(tab, READ_AIGC, {
          timeoutMs: 10_000,
          label: "AIGC switch to flip",
          isReady: (s) => !!s?.ok && s.checked === true,
        });

        // One deliberate retry if the first press did not land. Only after a
        // full poll window with no modal, so a slow first click cannot be
        // toggled twice (off again).
        if (!after.ready && !confirm.ok) {
          console.log("      AIGC switch did not flip — pressing it once more");
          await humanClickElement(tab, cdp, "#__aigcSwitch");
          await sleepJitter(...PUBLISH_PACING.aigcTagSettle);
          after = await pollFor(tab, READ_AIGC, {
            timeoutMs: 6_000,
            label: "AIGC switch to flip",
            isReady: (s) => !!s?.ok && s.checked === true,
          });
        }

        // Read back. A silent failure here is exactly how an unlabeled post
        // ships, so this is the one place the run must not continue.
        if (!after.ready) {
          throw new Error(
            `AIGC label did not stick (switch reads ${JSON.stringify(after.last)}). ` +
              `Turn on 显示更多 → AI 生成的内容 by hand in the open tab, then publish from there.`,
          );
        }
        console.log(
          `  5/6 AIGC label ON (${confirm.ok ? "modal accepted" : "direct toggle"}, AI-generated content disclosed)`,
        );
        log("aigc", { mode: "on", modal: confirm.ok });
      }
    }

    console.log("  6/6 attaching the native sound…");
    const musicTabFound = await evalJson(tab, OPEN_MUSIC_TAB);
    if (!musicTabFound.ok)
      throw new Error(`music tab not found — editor tabs: ${JSON.stringify(musicTabFound.tabs)}`);
    const musicTab = await humanClickThen(tab, cdp, "#__musicTab", MUSIC_PANEL_READY, {
      label: "sound library",
      timeoutMs: 30_000,
    });
    log("soundLibrary", { clickMode: musicTab.mode });

    const searched = await searchSound(tab, cdp, sound);
    log("soundSearch", { query: sound, mode: searched.mode });
    await waitFor(tab, SOUND_RESULT_COUNT, { timeoutMs: 45_000, label: "sound results" });

    const attached = await evalJson(tab, ATTACH_SOUND(sound, soundOwner));
    if (!attached.ok) {
      throw new Error(
        `could not attach "${sound}"${soundOwner ? ` by ${soundOwner}` : ""} — first results: ${JSON.stringify(attached.seen)}`,
      );
    }
    await humanClickElement(tab, cdp, attached.selector);
    console.log(`      attached: ${attached.attached}`);
    await sleepJitter(...PUBLISH_PACING.soundAttached);
    log("sound", { title: sound, owner: soundOwner, attached: attached.attached });

    // The volume panel follows the timeline SELECTION, so the music clip has
    // to be selected first — otherwise the slider belongs to the video's own
    // audio, and ducking THAT would quiet the narration instead of the music.
    // (Observed live: with the video track selected the panel read 0 dB, and
    // selecting the music clip revealed its -20 dB.)
    const selectedClip = await humanClickThen(
      tab,
      cdp,
      '[class*="AudioClip__root"]',
      READ_VOLUME_DB,
      { label: "music clip selection", timeoutMs: 10_000, isReady: readyOnOk },
    );
    await sleepJitter(...PUBLISH_PACING.clipSelect);

    const marker = await evalJson(tab, PLACE_VOLUME_MARKER(volumeDb));
    if (!marker.ok) throw new Error(`volume slider not reachable: ${JSON.stringify(marker)}`);
    await humanClickElement(tab, cdp, "#__volumeMarker");
    await sleepJitter(...PUBLISH_PACING.volumeClick);
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
    console.log(
      `      volume: ${vol.db} dB (read back from the slider, ${selectedClip.mode} clip click)`,
    );
    log("volume", { requestedDb: volumeDb, readBackDb: vol.db, clickMode: selectedClip.mode });

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
      const tagged = await evalJson(tab, TAG_BY_TEXT("保存"));
      if (!tagged.ok) {
        throw new Error("保存 (save) button not found — publishing now would drop the music");
      }
      console.log("💾 Applying the clip edit (保存)…");
      const applied = await humanClickThen(tab, cdp, "#__byText", OVERLAY_CLOSED, {
        label: "保存",
        timeoutMs: 60_000,
      });
      log("clipEdit", { clickMode: applied.mode });

      if (hasFlag("skip-review")) {
        console.log("👀 Pre-publish review skipped (--skip-review)");
        log("review", { reviewed: false, reason: "skipped by --skip-review" });
      } else {
        console.log("👀 Watching the prepared video before publishing…");
        // A review is a behaviour signal, never a publish gate: a preview that
        // will not play is recorded as NOT reviewed and the run continues.
        let review;
        try {
          review = await reviewBeforePublish(tab, cdp);
        } catch (err) {
          review = { reviewed: false, reason: `review failed: ${err.message}` };
        }
        const verdict = review.reviewed
          ? `已审阅 · ${review.advancedSeconds}s played, paused=${review.pausedAfter}`
          : `未审阅（${review.reason}）`;
        console.log(`      ${verdict}`);
        // The issue asks for the review verdict itself to be recorded, so the
        // log carries both the machine fact (`reviewed`) and the same words the
        // operator sees (`verdict`) — a reader of the log should not have to
        // re-derive what "reviewed: false" meant.
        log("review", { reviewed: review.reviewed, verdict, ...review });
      }

      console.log("🚀 Publishing (--publish)…");
      const scrolled = await evalJson(tab, SCROLL_TO_PUBLISH);
      if (!scrolled.ok || !scrolled.unobstructed) {
        throw new Error(`publish button not clickable: ${JSON.stringify(scrolled)}`);
      }
      await sleepJitter(...PUBLISH_PACING.publishScroll);
      const published = await humanClickElement(tab, cdp, '[data-e2e="post_video_button"]');
      const settled = await pollFor(tab, PUBLISH_STATE, {
        timeoutMs: 45_000,
        label: "publish to finish",
        isReady: (s) => !!s && !s.error && !/\/upload/.test(s.url || ""),
      });
      if (!settled.ready) {
        const after = settled.last;
        if (after?.error) throw new Error(`TikTok reported an error after publish: ${after.error}`);
        throw new Error(
          `still on the upload page after the publish click — check the tab: ${after?.url}`,
        );
      }
      log("publish", { published: true, url: settled.last.url, clickMode: published.mode });
      console.log("=".repeat(60));
      console.log("✅ Published.");
      console.log(`   ${settled.last.url}`);
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
        const tagged = await evalJson(tab, TAG_BY_TEXT("保存草稿"));
        if (tagged.ok) {
          const saved = await humanClickElement(tab, cdp, "#__byText");
          await sleepJitter(...PUBLISH_PACING.soundAttached);
          console.log("   💾 Draft saved — open TikTok → 主页 → 草稿 to review.");
          console.log("      The post is a draft, not a published video.");
          console.log("      Note: the attached sound does NOT persist in the draft;");
          console.log("      re-attach it by running this script again without --save-draft.");
          log("draft", { saved: true, clickMode: saved.mode });
        } else {
          console.log("   ⚠️  Save-draft button not found — the editor is still open");
          console.log("      in the tab, so you can click 保存草稿 yourself.");
          log("draft", { saved: false, reason: "button not found" });
        }
        keepTab = !hasFlag("close-tab");
      } else {
        console.log("   Review the draft in the open tab, then click 发布 (Publish)");
        console.log("   yourself — or re-run with --publish to do it in one pass.");
        console.log(`   Tab: ${tab}`);
        keepTab = true;
      }
      log("prepared", { published: false });
    }
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    log("error", { message: err.message });
    keepTab = true; // leave the tab so the operator can see where it stopped
    process.exitCode = 1;
  } finally {
    cdp?.close();
    if (!keepTab) {
      await cdpCloseTab(tab);
      console.log(`   (tab closed)`);
    }
  }
}

// Run only when invoked as a command. Importing this module (for example to
// exercise `reviewBeforePublish` against a live prepared post) must not open
// a browser tab and start an upload.
const invokedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`❌ ${err.stack || err.message}`);
    process.exit(1);
  });
}
