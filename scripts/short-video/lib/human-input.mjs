/**
 * Human-input primitives for the CDP publish path (#1013).
 *
 * The defect this replaces, measured on 2026-10-30 against the repo's own
 * proxy: `/clickAt` dispatched `mousePressed` + `mouseReleased` and nothing
 * else — no `mousemove` at all — and the caption arrived as one synthetic
 * `paste` event (`isTrusted: false`) carrying 1166 characters in a single
 * frame. Both are input-shape facts, independent of what TikTok does with
 * them, and both are what this module stops producing.
 *
 * Why a second CDP session instead of a new proxy endpoint: `skills/shared` is
 * a git submodule with its own delivery surface, while the publish path lives
 * here. Chrome accepts several flattened sessions on one target, so the
 * driver can open its own browser-level session on the proxy-owned tab and
 * dispatch real input. Verified live on 2026-10-30: a second session on a
 * proxy-created tab delivered `mousemove` / `mousedown` / `insertText` events
 * that the page saw as `isTrusted: true`, including emoji.
 *
 * Everything that can be pure is pure and seeded, so the shape (curvature,
 * overshoot, deceleration, jitter bounds, grapheme segmentation) is pinned by
 * tests instead of eyeballed on a live run.
 *
 * @module human-input
 */

import { automationPort } from "./cdp-profile-guard.mjs";

/** Typing gap between segments: the band a person's keystrokes fall in. */
export const TYPING_GAP_MS = Object.freeze([30, 120]);
/** Occasional pause at a word/sentence boundary. */
export const TYPING_PAUSE_MS = Object.freeze([300, 900]);
/** Reading the field before starting to type. */
export const LEAD_IN_MS = Object.freeze([250, 700]);
/** Newline cadence: people pause at the end of a line. */
export const NEWLINE_PAUSE_MS = Object.freeze([350, 1100]);

/** Fraction of boundary positions that get a full pause instead of a gap. */
const PAUSE_CHANCE = 0.22;

/**
 * Pointer-path cadence, as named bands rather than call-site literals.
 *
 * A person's pointer does not move on a fixed clock: steps are ~9ms apart,
 * there is a short settle before the press, and the button is held for a beat.
 * Naming them here keeps the "no bare duration" rule true of this module too —
 * `tiktok-upload-prep-human-shape.test.mjs` rejects a numeric literal in any
 * sleep call across the publish path.
 */
export const POINTER_STEP_MS = Object.freeze([9, 5]);
/** Pause between the last move and the press: the hand settling. */
export const POINTER_SETTLE_MS = Object.freeze([85, 45]);
/** Button hold time. */
export const POINTER_HOLD_MS = Object.freeze([45, 120]);
/** Beat after moving to the scroll point, before the first wheel burst (135 ± 45). */
export const WHEEL_SETTLE_MS = Object.freeze([135, 45]);
/** Gap between wheel bursts (170 ± 90). */
export const WHEEL_BURST_GAP_MS = Object.freeze([170, 90]);
/**
 * How long one wheel dispatch may wait for an ack. A real ack is milliseconds;
 * the long session budget would only convert a silent drop into a 15s stall.
 */
export const WHEEL_ACK_TIMEOUT_MS = 3000;
/**
 * Wait for an unacknowledged wheel to land before correcting the scroll
 * position (120 ± 80). Long enough for a throttled renderer to drain the
 * dispatch it never acked, short enough not to be felt.
 */
export const LATE_DISPATCH_SETTLE_MS = Object.freeze([120, 80]);

/**
 * Uniform float in [min, max].
 *
 * @param {number} min
 * @param {number} max
 * @param {() => number} [rand]
 * @returns {number}
 */
export function randomBetween(min, max, rand = Math.random) {
  return min + rand() * (max - min);
}

/**
 * Sleep `baseMs ± spreadMs`, never below zero.
 *
 * @param {number} baseMs
 * @param {number} spreadMs
 * @param {{ rand?: () => number, sleepFn?: (ms: number) => Promise<void> }} [opts]
 * @returns {Promise<number>} the duration actually slept
 */
export async function sleepJitter(baseMs, spreadMs, opts = {}) {
  const { rand = Math.random, sleepFn = defaultSleep } = opts;
  const ms = Math.max(0, Math.round(baseMs + randomBetween(-spreadMs, spreadMs, rand)));
  await sleepFn(ms);
  return ms;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ease-out cubic: fast at the start, slow at the end.
 *
 * @param {number} t - progress in [0, 1]
 * @returns {number}
 */
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

const round2 = (n) => Math.round(n * 100) / 100;

function cubicAt(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
  };
}

/**
 * Plan a pointer path from `from` to `to`.
 *
 * The path is a cubic Bézier with a lateral bend, sampled on an ease-out
 * curve so the steps get shorter near the target, aimed a couple of pixels
 * PAST the target, then corrected back onto it. That is the shape of a hand:
 * it curves, it decelerates, and it overshoots slightly before settling.
 *
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {{ rand?: () => number }} [opts]
 * @returns {{ points: Array<{x:number,y:number}>, overshoot: {x:number,y:number}|null, distance: number }}
 */
export function mousePath(from, to, opts = {}) {
  const { rand = Math.random } = opts;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 1) {
    return { points: [{ ...from }, { ...to }], overshoot: null, distance };
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const px = -uy;
  const py = ux;

  // Overshoot: 0.4-2px beyond the target, with a little lateral drift.
  const beyond = randomBetween(0.4, 2, rand);
  const drift = randomBetween(-1, 1, rand);
  const aim = {
    x: to.x + ux * beyond + px * drift,
    y: to.y + uy * beyond + py * drift,
  };

  // Bend the approach; short moves bend less so the path stays plausible.
  const bend =
    randomBetween(8, Math.min(60, Math.max(12, distance * 0.25)), rand) * (rand() < 0.5 ? -1 : 1);
  const c1 = {
    x: from.x + dx * 0.33 + px * bend,
    y: from.y + dy * 0.33 + py * bend,
  };
  const c2 = {
    x: from.x + dx * 0.66 + px * bend * 0.5,
    y: from.y + dy * 0.66 + py * bend * 0.5,
  };

  const steps = Math.max(10, Math.min(36, Math.round(distance / 16)));
  const points = [{ x: round2(from.x), y: round2(from.y) }];
  for (let i = 1; i <= steps; i++) {
    const p = cubicAt(from, c1, c2, aim, easeOutCubic(i / steps));
    points.push({ x: round2(p.x), y: round2(p.y) });
  }
  // Correction back onto the exact target, in a few short steps.
  for (let i = 1; i <= 3; i++) {
    points.push({
      x: round2(aim.x + (to.x - aim.x) * (i / 3)),
      y: round2(aim.y + (to.y - aim.y) * (i / 3)),
    });
  }
  points[points.length - 1] = { x: to.x, y: to.y };

  return { points, overshoot: { x: round2(aim.x), y: round2(aim.y) }, distance };
}

/**
 * Move the pointer to a point and click there with a real press/release.
 *
 * @param {{ send: (method: string, params?: object) => Promise<object> }} session
 * @param {{ from: {x:number,y:number}, to: {x:number,y:number}, rand?: () => number, sleepFn?: (ms:number)=>Promise<void> }} opts
 * @returns {Promise<{ from: object, to: object, points: object[], holdMs: number }>}
 */
export async function clickAtPoint(session, opts) {
  const { from, to, rand = Math.random, sleepFn = defaultSleep } = opts;
  const path = mousePath(from, to, { rand });

  for (let i = 1; i < path.points.length; i++) {
    const p = path.points[i];
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: p.x,
      y: p.y,
      button: "none",
    });
    await sleepJitter(...POINTER_STEP_MS, { rand, sleepFn });
  }

  await sleepJitter(...POINTER_SETTLE_MS, { rand, sleepFn });
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: to.x,
    y: to.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });

  const holdMs = Math.round(randomBetween(POINTER_HOLD_MS[0], POINTER_HOLD_MS[1], rand));
  await sleepFn(holdMs);

  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: to.x,
    y: to.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });

  return { from: { ...from }, to: { ...to }, points: path.points, holdMs };
}

/**
 * JavaScript that finds the element which actually scrolls this page.
 *
 * `window` is the wrong answer on an app shell: TikTok's For You feed scrolls
 * `#column-list-container` while `window.scrollY` stays 0 and `window.scrollBy`
 * does nothing (measured 2026-10-31: `scrollHeight` 6741, `clientHeight` 749,
 * window offset pinned at 0). Aiming a correction at the window therefore
 * reported the whole request as "corrected" while moving nothing.
 *
 * Written as an expression that resolves to a DOM element so callers can pick
 * window-level or container-level behaviour from one scan.
 */
const SCROLLER_JS = `(() => {
  const doc = document.scrollingElement || document.documentElement;
  if (doc && doc.scrollHeight > doc.clientHeight + 4) return doc;
  let best = null;
  let bestRange = 0;
  for (const el of document.querySelectorAll("div, main, section")) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY !== "scroll" && overflowY !== "auto") continue;
    if (el.clientHeight < 200) continue;
    const range = el.scrollHeight - el.clientHeight;
    if (range > bestRange) {
      bestRange = range;
      best = el;
    }
  }
  return best;
})()`;

/** Read the vertical offset of whatever element actually scrolls. */
const SCROLL_OFFSET_JS = `(() => {
  const el = ${SCROLLER_JS};
  if (el && el !== document.scrollingElement && el !== document.documentElement) return el.scrollTop;
  return window.scrollY;
})()`;

/** Scroll the element that actually scrolls, by `delta` pixels. */
const scrollByJs = (delta) => `(() => {
  const el = ${SCROLLER_JS};
  if (el && el !== document.scrollingElement && el !== document.documentElement) {
    el.scrollTop = el.scrollTop + (${delta});
    return el.scrollTop;
  }
  window.scrollBy(0, ${delta});
  return window.scrollY;
})()`;

/**
 * A scripted scroll for callers that drive the page through the eval endpoint
 * instead of a CDP session.
 *
 * Exported so the warm-up's own fallback and `wheelScroll`'s cannot disagree
 * about which element to move — on this app shell the window is the wrong one.
 *
 * @param {number} delta pixels, negative to scroll up
 * @returns {string} a JavaScript expression
 */
export function scriptedScrollBy(delta) {
  return scrollByJs(delta);
}

/**
 * Scroll with trusted wheel events, in several bursts.
 *
 * The leading `mouseMoved` is not decoration: a wheel dispatched right after
 * `Input.insertText` never resolved on this Chrome build (15s timeout), while
 * the same wheel preceded by one `mouseMoved` resolved in 10ms. A person also
 * moves the pointer to where they want to scroll, so the fix is the more human
 * call as well as the working one.
 *
 * Order matters more than that, though: after a SUSTAINED burst of trusted text
 * input (a typed caption — ~20+ insertText events), wheel dispatch stops being
 * acknowledged entirely, and a settle delay does not recover it (measured
 * 2026-10-30: 0ms, 800ms and 2500ms all failed; "abc" and a single emoji
 * still worked, so it is the burst, not any one key). Scroll BEFORE filling a
 * text field, which is the order the driver already uses — warm up on the feed,
 * then type the caption. When a wheel still goes unacknowledged, this falls
 * back to a scripted scroll and reports `mode: "js-fallback"` so the caller can
 * log it instead of losing 15 seconds to a hang.
 *
 * @param {{ send: (method: string, params?: object) => Promise<object> }} session
 * @param {{ x: number, y: number, totalDeltaY: number, rand?: () => number, sleepFn?: (ms:number)=>Promise<void>, fallback?: boolean }} opts
 * @returns {Promise<{ chunks: number[], mode: "wheel"|"js-fallback", reason?: string, scriptedPx?: number, correctedPx?: number }>}
 *   `scriptedPx` is what the scripted scroll actually moved (0 on a page that
 *   pins its scroll position); `correctedPx` is only present when a late
 *   dispatch really had to be compensated for.
 */
export async function wheelScroll(session, opts) {
  const { x, y, totalDeltaY, rand = Math.random, sleepFn = defaultSleep, fallback = true } = opts;
  const sign = Math.sign(totalDeltaY) || 1;
  const total = Math.abs(Math.round(totalDeltaY));
  if (!total) return { chunks: [], mode: "wheel" };

  /** @returns {Promise<number|null>} the page's vertical offset, null if unreadable */
  const scrollY = async () => {
    const { result } = await session.send("Runtime.evaluate", {
      expression: SCROLL_OFFSET_JS,
      returnByValue: true,
    });
    return typeof result?.value === "number" ? result.value : null;
  };
  // A navigation or a torn-down renderer must not stop the scroll itself, so an
  // unreadable start position only costs the correction — it is the one thing
  // here that needs a baseline.
  const startY = await scrollY().catch(() => null);

  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  // Let the hit test settle before the first burst; a wheel that lands in the
  // same frame as the move is the one Chrome tends to drop.
  await sleepJitter(...WHEEL_SETTLE_MS, { rand, sleepFn });

  const count = Math.min(total, Math.max(3, Math.round(randomBetween(3, 6, rand))));
  const weights = Array.from({ length: count }, () => randomBetween(0.6, 1.4, rand));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const chunks = weights.map((w) => Math.max(1, Math.round((total * w) / weightSum)));
  // Correct the rounding residual on the largest chunk. The last chunk can be
  // clamped to 1 for a small request, and shifting the residual onto it would
  // zero or flip its sign — scrolling in the opposite direction.
  const diff = total - chunks.reduce((a, b) => a + b, 0);
  const biggest = chunks.indexOf(Math.max(...chunks));
  chunks[biggest] += diff;

  let sent = 0;
  try {
    for (const chunk of chunks) {
      await session.send(
        "Input.dispatchMouseEvent",
        {
          type: "mouseWheel",
          x,
          y,
          deltaX: 0,
          deltaY: sign * chunk,
          button: "none",
        },
        // A wheel ack is milliseconds. Waiting the session's full budget for a
        // dispatch that will never be acknowledged costs 15s per burst for
        // nothing.
        { timeoutMs: WHEEL_ACK_TIMEOUT_MS },
      );
      sent += 1;
      await sleepJitter(...WHEEL_BURST_GAP_MS, { rand, sleepFn });
    }
  } catch (err) {
    if (!fallback) throw err;
    // Only the shortfall is scripted: the bursts that were acknowledged already
    // scrolled the page, and adding the full total on top would overshoot by
    // whatever they moved.
    const delivered = chunks.slice(0, sent);
    const remaining = sign * (total - delivered.reduce((a, b) => a + b, 0));
    const chunksSent = [...delivered.map((c) => sign * c), ...(remaining ? [remaining] : [])];

    // Scripting is a fallback, not a guarantee. A virtualized feed pins its
    // container: on TikTok's For You feed (2026-10-31) `scrollTop = 300` reads
    // back as 0 and `window.scrollBy` does nothing, so a real wheel is the only
    // thing that moves that page. Measure what the script actually achieved
    // rather than assuming it worked — otherwise the run reports a correction
    // it never performed.
    let scriptedPx = 0;
    if (remaining) {
      const beforeY = await scrollY().catch(() => null);
      await session.send("Runtime.evaluate", { expression: scrollByJs(remaining) });
      const afterY = await scrollY().catch(() => null);
      scriptedPx = beforeY === null || afterY === null ? 0 : afterY - beforeY;
    }
    if (!scriptedPx) {
      return {
        chunks: chunksSent,
        mode: "js-fallback",
        reason: err.message,
        scriptedPx: 0,
      };
    }

    // The unacknowledged burst was NOT cancelled: the renderer can still apply
    // it once the throttle lifts, and then this correction has overshot by
    // exactly that chunk. Measured 2026-10-31 on the fixture: three wheels
    // reached the page for a two-of-four ack, so the scripted shortfall scrolled
    // ~163px too far. Wait for the late dispatch to land, then converge on the
    // position the caller asked for instead of trusting the arithmetic.
    await sleepJitter(...LATE_DISPATCH_SETTLE_MS, { rand, sleepFn });
    const nowY = await scrollY().catch(() => null);
    const drift = startY === null || nowY === null ? null : startY + sign * total - nowY;
    if (drift !== null && Math.abs(drift) >= 2) {
      await session.send("Runtime.evaluate", { expression: scrollByJs(drift) });
    }
    return {
      chunks: chunksSent,
      mode: "js-fallback",
      reason: err.message,
      scriptedPx,
      ...(drift === null ? {} : { correctedPx: Math.round(drift) }),
    };
  }
  return { chunks: chunks.map((c) => sign * c), mode: "wheel" };
}

/**
 * Split text into grapheme clusters (emoji and combining marks stay whole).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitGraphemes(text) {
  if (!text) return [];
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return [...segmenter.segment(text)].map((s) => s.segment);
  }
  return Array.from(text);
}

const BOUNDARY_RE = /[.!?,;:\s]$/;

/**
 * Plan a caption's keystroke rhythm.
 *
 * One grapheme per segment, deliberately. Draft.js handles a single-character
 * insertText as a real keystroke; multi-character insertions are not reliably
 * applied to its ContentState, and the text then lives only in the DOM until
 * the next re-render drops it. Measured on the live editor 2026-10-30: a
 * caption typed in 1-3 character segments failed the state probe on one run
 * and passed on another; the same text typed one character at a time survived
 * every probe. Gaps sit in the 30-120ms band, and boundary positions
 * occasionally take a 300-900ms beat. Newlines are their own `enter` segments
 * so the executor can press the real Enter key rather than insert "\n".
 *
 * @param {string} text
 * @param {{ rand?: () => number }} [opts]
 * @returns {{ leadInMs: number, segments: Array<{text:string, delayBeforeMs:number, kind:'text'|'enter'}>, estimateMs: number }}
 */
export function planTyping(text, opts = {}) {
  const { rand = Math.random } = opts;
  if (!text) return { leadInMs: 0, segments: [], estimateMs: 0 };

  const graphemes = splitGraphemes(text);
  const segments = [];
  let prevText = "";

  const nextDelay = () => {
    if (prevText && BOUNDARY_RE.test(prevText) && rand() < PAUSE_CHANCE) {
      return Math.round(randomBetween(TYPING_PAUSE_MS[0], TYPING_PAUSE_MS[1], rand));
    }
    return Math.round(randomBetween(TYPING_GAP_MS[0], TYPING_GAP_MS[1], rand));
  };

  for (const grapheme of graphemes) {
    if (grapheme === "\n") {
      segments.push({
        text: "\n",
        kind: "enter",
        delayBeforeMs: Math.round(randomBetween(NEWLINE_PAUSE_MS[0], NEWLINE_PAUSE_MS[1], rand)),
      });
      prevText = "\n";
      continue;
    }
    segments.push({ text: grapheme, kind: "text", delayBeforeMs: nextDelay() });
    prevText = grapheme;
  }

  const leadInMs = Math.round(randomBetween(LEAD_IN_MS[0], LEAD_IN_MS[1], rand));
  const estimateMs = leadInMs + segments.reduce((a, s) => a + s.delayBeforeMs, 0);
  return { leadInMs, segments, estimateMs };
}

/**
 * Press Enter through the real key pipeline.
 *
 * Draft.js splits its block on `keydown`, so a trusted Enter is the path that
 * produces a new paragraph in the editor's own state.
 *
 * @param {{ send: (method: string, params?: object) => Promise<object> }} session
 */
export async function pressEnter(session) {
  await pressKey(session, {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    // A real Enter carries \r; Draft.js prevents the default and splits its
    // block, while a plain contenteditable needs the character to insert the
    // line break at all.
    text: "\r",
  });
}

/**
 * Press a non-text key (Enter, Backspace, arrows) through CDP.
 *
 * @param {{ send: (method: string, params?: object) => Promise<object> }} session
 * @param {{ key: string, code: string, windowsVirtualKeyCode: number, text?: string }} key
 */
export async function pressKey(session, key) {
  const base = {
    key: key.key,
    code: key.code,
    windowsVirtualKeyCode: key.windowsVirtualKeyCode,
    nativeVirtualKeyCode: key.windowsVirtualKeyCode,
  };
  const down = key.text ? { ...base, text: key.text, unmodifiedText: key.text } : base;
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", ...down });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

/**
 * Force the editor to render from its own state, then undo the probe.
 *
 * The trap this exists for: DOM-level insertion can leave Draft.js's
 * ContentState behind, so the field LOOKS filled while the post later saves
 * empty (the 2026-10-24 draft lost 708 of 1223 characters this way). Reading
 * `innerText` cannot see that difference. Typing a space and deleting it makes
 * Draft rebuild the block from its state — if earlier keystrokes only reached
 * the DOM, the text collapses here and the caller's verification catches it.
 *
 * @param {{ send: (method: string, params?: object) => Promise<object> }} session
 */
export async function pokeEditorState(session) {
  await session.send("Input.insertText", { text: " " });
  await pressKey(session, { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
}

/**
 * Execute a typing plan against a CDP session.
 *
 * @param {{ send: (method: string, params?: object) => Promise<object> }} session
 * @param {ReturnType<typeof planTyping>} plan
 * @param {{ sleepFn?: (ms:number)=>Promise<void>, onSegment?: (seg: object, index: number) => void }} [opts]
 * @returns {Promise<{ segments: number }>}
 */
export async function typePlan(session, plan, opts = {}) {
  const { sleepFn = defaultSleep, onSegment } = opts;
  await sleepFn(plan.leadInMs);
  let index = 0;
  for (const seg of plan.segments) {
    if (seg.delayBeforeMs) await sleepFn(seg.delayBeforeMs);
    if (seg.kind === "enter") await pressEnter(session);
    else await session.send("Input.insertText", { text: seg.text });
    index += 1;
    onSegment?.(seg, index);
  }
  return { segments: index };
}

/**
 * Send one command on the browser-level CDP endpoint.
 *
 * Separate from `openCdpSession` on purpose: `Target.*` commands that affect
 * windows and tabs belong to the browser endpoint, and a page session cannot
 * run them.
 *
 * @param {string} method
 * @param {object} params
 * @param {{ port?: number, WebSocketImpl?: typeof WebSocket, fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<object>} the command result
 */
async function browserCommand(method, params, opts = {}) {
  const {
    port = automationPort(),
    WebSocketImpl = globalThis.WebSocket,
    fetchImpl = globalThis.fetch,
    timeoutMs = 8000,
  } = opts;

  const version = await (await fetchImpl(`http://127.0.0.1:${port}/json/version`)).json();
  if (!version?.webSocketDebuggerUrl) {
    throw new Error(`no browser-level CDP endpoint on port ${port}`);
  }

  const ws = new WebSocketImpl(version.webSocketDebuggerUrl);
  const answer = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${method} timed out after ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method, params }));
    ws.onmessage = (message) => {
      try {
        const frame = JSON.parse(message.data);
        if (frame.id !== 1) return;
        clearTimeout(timer);
        if (frame.error) reject(new Error(`${method} refused: ${frame.error.message}`));
        else resolve(frame.result || {});
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
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * Bring a CDP target to the foreground.
 *
 * Not cosmetic: Chrome throttles input dispatch on hidden tabs. Measured on
 * 2026-10-30 against the automation profile, the same 14-point click path took
 * 65s in a background tab (≈4.6s per event, each one eventually acknowledged)
 * and 0.33s after activation. The web-access proxy creates tabs in the
 * background and exposes no /activate endpoint, so this talks to the
 * browser-level endpoint (`Target.activateTarget`) and leaves every other tab
 * alone.
 *
 * A refused activation is not cosmetic either: every later input event on a
 * hidden tab is throttled, so it throws rather than returning a string the
 * caller might print and continue past.
 *
 * @param {string} targetId
 * @param {{ port?: number, WebSocketImpl?: typeof WebSocket, fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<string>} "ok"
 */
export async function activateTarget(targetId, opts = {}) {
  await browserCommand("Target.activateTarget", { targetId }, opts);
  return "ok";
}

/**
 * Open a URL in a brand-new window and return its target id.
 *
 * Why a new window rather than a new tab: macOS puts a window the browser
 * creates onto the Space that is active right now, while a tab added to an
 * existing window inherits that window's Space. When the automation window
 * sits on another Space (or is fully occluded), every tab in it stays
 * `document.visibilityState === "hidden"` and input dispatch crawls at ~5s per
 * event. Measured 2026-10-30 on this profile: a proxy tab in the occluded
 * window dispatched at 5.0s per event, the same page in a new window at 8ms.
 * Nothing else about the tab differs.
 *
 * @param {string} url
 * @param {{ port?: number, WebSocketImpl?: typeof WebSocket, fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<string>} the new target id
 */
export async function openWindowTarget(url, opts = {}) {
  const created = await browserCommand("Target.createTarget", { url, newWindow: true }, opts);
  if (!created?.targetId) throw new Error(`createTarget returned no targetId for ${url}`);
  return created.targetId;
}

/**
 * How long an input dispatch may take before the renderer counts as throttled.
 *
 * A healthy dispatch is a few milliseconds (measured 3-13ms on this profile);
 * a throttled one is ~5s. The probe below times out at this value, so a
 * throttled tab costs one probe rather than five seconds per attempt.
 */
export const INPUT_PROBE_TIMEOUT_MS = 1500;

/**
 * Where the latency probe dispatches its `mouseMoved`. A corner, so the hover
 * state it creates lands on nothing that a later click cares about.
 */
const INPUT_PROBE_POINT = Object.freeze({ x: 2, y: 2 });

/**
 * Guarantee that input dispatched on this session is NOT throttled.
 *
 * Visibility is not the invariant — latency is, and the two disagree often
 * enough to matter. Measured on this profile:
 *
 *   2026-10-30  a tab that reports `visible` dispatches in 8ms, `hidden` in 5s;
 *   2026-10-31  a window Chrome opened for the run reported `visible` during
 *               `Target.activateTarget` and was `hidden` seconds later, so a
 *               visibility check passed and the very next wheel event still hit
 *               a 3s timeout.
 *
 * So probe the thing that hurts: dispatch one `mouseMoved` and time it. When it
 * is slow, enable focus emulation (`emulateFocus`, which took the same tab from
 * 5s per event to 3ms) and probe again. Only if THAT fails is the machine
 * genuinely unusable, and the error says so.
 *
 * @param {{ send: (method: string, params?: object) => Promise<object> }} session
 * @param {{ label?: string, probeTimeoutMs?: number, allowEmulation?: boolean }} [opts]
 *   `allowEmulation: false` makes this a pure probe, so a caller that can still
 *   re-host the page in a real window prefers that over emulating.
 * @returns {Promise<{ emulated: boolean, latencyMs: number }>}
 */
export async function ensureResponsiveInput(session, opts = {}) {
  const { label = "tab", probeTimeoutMs = INPUT_PROBE_TIMEOUT_MS, allowEmulation = true } = opts;

  const visibility = async () => {
    const { result } = await session.send("Runtime.evaluate", {
      expression: "document.visibilityState",
      returnByValue: true,
    });
    return result?.value ?? null;
  };

  const probe = async () => {
    const started = Date.now();
    try {
      await session.send(
        "Input.dispatchMouseEvent",
        { type: "mouseMoved", x: INPUT_PROBE_POINT.x, y: INPUT_PROBE_POINT.y, button: "none" },
        { timeoutMs: probeTimeoutMs },
      );
      return Date.now() - started;
    } catch (err) {
      return { timedOut: true, message: err.message, elapsed: Date.now() - started };
    }
  };

  // Two probes before any verdict, and either one being fast is enough. A
  // single 1.5s sample cannot tell a throttled renderer from a cold one: the
  // first dispatch after `Target.createTarget` builds the compositor, and a
  // machine doing a render alongside can miss the budget once and still be
  // fine. Re-hosting on one slow sample restarts the page load for nothing.
  const measure = async () => {
    const first = await probe();
    return typeof first === "number" ? first : await probe();
  };

  // bringToFront re-raises the tab inside its window; harmless when the window
  // is already frontmost, and it is the only lever that does not need a human.
  await session.send("Page.bringToFront");
  let latency = await measure();
  if (typeof latency === "number") return { emulated: false, latencyMs: latency };
  if (!allowEmulation) {
    throw new Error(
      `${label} dispatches input too slowly: no ack within ${latency.elapsed}ms ` +
        `(${latency.message}). Re-hosting the page in a new window.`,
    );
  }

  const afterEmulation = await emulateFocus(session).catch(() => null);
  latency = await measure();
  if (typeof latency === "number") return { emulated: true, latencyMs: latency };

  throw new Error(
    `${label} cannot receive input: dispatch timed out twice ` +
      `(visibilityState=${JSON.stringify(await visibility().catch(() => null))}, ` +
      `focus emulation ${afterEmulation === "visible" ? "reported visible" : "did not take"}). ` +
      "Bring the Chrome window to the front (no minimising, no other Space) and run again.",
  );
}

/**
 * Make a throttled-but-usable tab report itself as focused.
 *
 * Chrome throttles input dispatch on a renderer it considers hidden, and the
 * only OS-level fix is a human moving the window to the active Space. Focus
 * emulation is the in-process lever: the renderer reports `visible` and the
 * throttle lifts. Measured 2026-10-31 on this profile, same tab: 5018ms per
 * `Input.dispatchMouseEvent` before, 3ms after.
 *
 * What it does NOT do: it changes what the page believes about focus, not what
 * the window is doing. A page that suppresses work on `blur` will not see one,
 * so runs that use it report `focusEmulated: true` instead of passing silently.
 *
 * @param {{ send: (method: string, params?: object) => Promise<object> }} session
 * @returns {Promise<string|null>} the visibility state Chrome reports afterwards
 */
export async function emulateFocus(session) {
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const { result } = await session.send("Runtime.evaluate", {
    expression: "document.visibilityState",
    returnByValue: true,
  });
  return result?.value ?? null;
}

/**
 * Open a browser-level CDP session attached to one page target.
 *
 * The proxy already holds its own page session; Chrome allows additional
 * flattened sessions on the same target, which is what makes real input
 * dispatch possible without changing the proxy (a submodule).
 *
 * @param {string} targetId
 * @param {{ port?: number, WebSocketImpl?: typeof WebSocket, fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<{ sessionId: string, send: (method: string, params?: object) => Promise<object>, close: () => void }>}
 */
export async function openCdpSession(targetId, opts = {}) {
  const {
    port = automationPort(),
    WebSocketImpl = globalThis.WebSocket,
    fetchImpl = globalThis.fetch,
    timeoutMs = 15_000,
  } = opts;

  const version = await (await fetchImpl(`http://127.0.0.1:${port}/json/version`)).json();
  if (!version?.webSocketDebuggerUrl) {
    throw new Error(`no browser-level CDP endpoint on port ${port}`);
  }

  const ws = new WebSocketImpl(version.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;
  let closed = false;

  ws.onmessage = (message) => {
    let frame;
    try {
      frame = JSON.parse(message.data);
    } catch {
      return; // non-JSON frames are not ours
    }
    if (!frame?.id || !pending.has(frame.id)) return;
    const { resolve, reject, timer } = pending.get(frame.id);
    pending.delete(frame.id);
    clearTimeout(timer);
    if (frame.error) reject(new Error(`CDP ${frame.error.code}: ${frame.error.message}`));
    else resolve(frame.result || {});
  };

  const sendRaw = (method, params = {}, sessionId, budgetMs = timeoutMs) =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error("CDP session is closed"));
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, budgetMs);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("CDP websocket failed"));
  });

  let sessionId;
  try {
    const attached = await sendRaw("Target.attachToTarget", { targetId, flatten: true });
    sessionId = attached?.sessionId;
    if (!sessionId) throw new Error(`attach returned no sessionId for ${targetId}`);
  } catch (err) {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    throw err;
  }

  return {
    sessionId,
    /**
     * @param {string} method
     * @param {object} [params]
     * @param {{ timeoutMs?: number }} [opts] per-command budget, for commands
     *   that are allowed to be dropped (a wheel ack never takes seconds)
     */
    send: async (method, params, opts = {}) => {
      const started = Date.now();
      try {
        return await sendRaw(method, params, sessionId, opts.timeoutMs);
      } catch (err) {
        // A dispatch timeout is almost always the throttling this module
        // exists to avoid; say so instead of leaving a bare CDP error.
        if (/^CDP command timed out/.test(err.message) && method.startsWith("Input.")) {
          throw new Error(
            `${err.message} after ${Date.now() - started}ms — the tab is throttled ` +
              "(hidden renderer, or a modal blocking it). Check the Chrome window is frontmost.",
            { cause: err },
          );
        }
        throw err;
      }
    },
    close() {
      if (closed) return;
      try {
        // Browser-level command: it names the session in params and must NOT
        // carry a top-level sessionId, which would route it into the page
        // session where Target.* does not exist (Chrome then answers
        // "method not found" and the tab keeps the attachment).
        ws.send(
          JSON.stringify({
            id: nextId++,
            method: "Target.detachFromTarget",
            params: { sessionId },
          }),
        );
      } catch {
        /* socket already gone */
      }
      closed = true;
      for (const { timer, reject } of pending.values()) {
        clearTimeout(timer);
        reject(new Error("CDP session closed"));
      }
      pending.clear();
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  };
}

/** How many times one session may re-enable focus emulation. */
export const MAX_THROTTLE_RECOVERIES = 3;

/**
 * Does this failure mean "the renderer is not dispatching input right now"?
 *
 * `openCdpSession` decorates its own dispatch timeouts with that word; nothing
 * else does. Keep this in one place: the recovery wrapper and the wheel
 * fallback both need the same answer, and a second copy of the regex would let
 * them drift apart.
 *
 * @param {string} method
 * @param {Error} err
 */
function isThrottleError(method, err) {
  return method.startsWith("Input.") && /throttled/.test(err?.message ?? "");
}

/** A wheel, as opposed to a move/click/key: it is the one event Chrome drops. */
function isWheelDispatch(method, params) {
  return method === "Input.dispatchMouseEvent" && params?.type === "mouseWheel";
}

/**
 * Wrap a session so a mid-run throttle heals itself instead of failing a step.
 *
 * The visibility of a tab is not a property the session can be trusted to hold:
 * measured 2026-10-31, a tab that dispatched input in 13ms went back to
 * `hidden` — and to 5s per event — seconds later, with nothing in between but a
 * navigation. A single check at session open can therefore pass and the very
 * first wheel event after it still times out.
 *
 * So recover where the failure happens: an `Input.*` timeout enables focus
 * emulation, reports it through `onRecover`, and retries that same command.
 * The retry budget is small and finite (`MAX_THROTTLE_RECOVERIES`), because a
 * navigation can drop the emulation and legitimately need it again — but a
 * fourth recovery means the machine is broken, not that we should keep trying.
 *
 * Wheels are the exception: a local ack timeout does NOT cancel the dispatch,
 * so the throttled renderer can still process the original wheel once
 * emulation lifts it. Retrying would then scroll twice while `wheelScroll`
 * records one chunk. Those rethrow after emulating, and `wheelScroll` scripts
 * only the shortfall — the callers already verify scroll position.
 *
 * @param {{ sessionId?: string, send: Function, close: Function }} session
 * @param {{
 *   onRecover?: (detail: { method: string, retried: boolean }) => void,
 *   initialEmulated?: boolean,
 * }} [opts]
 *   `initialEmulated` seeds the budget and the flag from emulation that already
 *   happened while opening the session, so `focusEmulated()` is the single
 *   source of truth and the cap counts that first one too.
 * @returns {{ sessionId?: string, send: Function, close: Function, focusEmulated: () => boolean }}
 */
export function withThrottleRecovery(session, opts = {}) {
  const { onRecover, initialEmulated = false } = opts;
  let emulated = initialEmulated;
  let recoveries = initialEmulated ? 1 : 0;
  return {
    sessionId: session.sessionId,
    focusEmulated: () => emulated,
    close: () => session.close(),
    send: async (method, params, sendOpts) => {
      try {
        return await session.send(method, params, sendOpts);
      } catch (err) {
        if (!isThrottleError(method, err) || recoveries >= MAX_THROTTLE_RECOVERIES) throw err;
        try {
          await emulateFocus(session);
        } catch (emulationError) {
          // Keep the throttled error: it carries the actionable instruction,
          // and the emulation failure is the reason it could not be followed.
          throw new Error(err.message, { cause: emulationError });
        }
        // Only now is the fact true, and only now is the budget spent.
        emulated = true;
        recoveries += 1;
        const retried = !isWheelDispatch(method, params);
        onRecover?.({ method, retried });
        if (!retried) throw err;
        return session.send(method, params, sendOpts);
      }
    },
  };
}

/**
 * Open a tab whose input dispatch is not throttled, re-hosting it in a new
 * window when the automation window cannot be raised.
 *
 * The failure this absorbs is real and silent: with the Chrome window on
 * another macOS Space or fully occluded, a tab the proxy created dispatches
 * input at ~5s per event while every command still succeeds. The publish run
 * would then spend hours on a 300-character caption, or time out somewhere
 * unrelated. Re-hosting in a new window usually fixes it (8ms per event in the
 * same measurement), so the operator normally sees nothing.
 *
 * Both stages gate on measured dispatch latency, not on `visibilityState` — a
 * window Chrome opened for the run was observed reporting `visible` and then
 * throttling input seconds later (2026-10-31), so the cheap-looking check let
 * the failure through. When neither lever works, `ensureResponsiveInput` tries
 * focus emulation, which lifts the throttle without moving any window.
 *
 * `createTab` and `closeTab` are injected so the fallback can be tested without
 * a browser.
 *
 * @param {string} url
 * @param {{
 *   port?: number,
 *   createTab?: (url: string) => Promise<string>,
 *   closeTab?: (targetId: string) => Promise<void> | void,
 *   WebSocketImpl?: typeof WebSocket,
 *   fetchImpl?: typeof fetch,
 *   onRehost?: (reason: string) => void,
 *   onEmulate?: () => void,
 *   onRecover?: (detail: { method: string, retried: boolean }) => void,
 * }} [opts]
 *   `onEmulate` fires once when the session could only be opened by emulating
 *   focus; `onRecover` fires for every later mid-run heal, so a caller can log
 *   them differently.
 * @returns {Promise<{ targetId: string, session: object, window: "existing"|"new", focusEmulated: boolean }>}
 */
export async function openVisibleSession(url, opts = {}) {
  const {
    port,
    createTab,
    closeTab = () => {},
    WebSocketImpl,
    fetchImpl,
    onRehost,
    onEmulate,
    onRecover,
  } = opts;
  const shared = { port, WebSocketImpl, fetchImpl };

  const firstTab = await createTab(url);
  await activateTarget(firstTab, shared);
  let session = await openCdpSession(firstTab, shared);
  try {
    // Probe only: a real window is a better answer than emulation, so let the
    // failure fall through to the re-host below before emulating anything.
    const ready = await ensureResponsiveInput(session, {
      label: "the tab",
      allowEmulation: false,
    });
    return {
      targetId: firstTab,
      session: withThrottleRecovery(session, { onRecover }),
      window: "existing",
      focusEmulated: ready.emulated,
    };
  } catch (err) {
    // Close our own session before dropping the tab; the proxy tab is then
    // closed too so a failed attempt does not leave a stray tab behind.
    session.close();
    await closeTab(firstTab);
    onRehost?.(err.message);
  }

  const freshTab = await openWindowTarget(url, shared);
  await activateTarget(freshTab, shared);
  session = await openCdpSession(freshTab, shared);
  try {
    const ready = await ensureResponsiveInput(session, { label: "the new window" });
    if (ready.emulated) onEmulate?.();
    return {
      targetId: freshTab,
      // Seed the wrapper with what the probe already did, so the single
      // `focusEmulated()` accessor tells the truth and the cap counts it.
      session: withThrottleRecovery(session, { onRecover, initialEmulated: ready.emulated }),
      window: "new",
      focusEmulated: ready.emulated,
    };
  } catch (err) {
    session.close();
    await closeTab(freshTab);
    throw new Error(
      `input is throttled: ${err.message} Even a window Chrome opened for this run stayed throttled, ` +
        "and focus emulation did not lift it, " +
        "so this machine cannot dispatch human-speed input right now.",
      { cause: err },
    );
  }
}
