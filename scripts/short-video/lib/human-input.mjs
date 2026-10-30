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
 * Small deterministic PRNG (mulberry32) for tests and reproducible runs.
 *
 * @param {number} seed
 * @returns {() => number} float in [0, 1)
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

/**
 * Sleep a uniformly random duration inside [minMs, maxMs].
 *
 * @param {number} minMs
 * @param {number} maxMs
 * @param {{ rand?: () => number, sleepFn?: (ms: number) => Promise<void> }} [opts]
 * @returns {Promise<number>} the duration actually slept
 */
export async function sleepBetween(minMs, maxMs, opts = {}) {
  const { rand = Math.random, sleepFn = defaultSleep } = opts;
  const ms = Math.max(0, Math.round(randomBetween(minMs, maxMs, rand)));
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
    await sleepJitter(9, 5, { rand, sleepFn });
  }

  await sleepJitter(85, 45, { rand, sleepFn });
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: to.x,
    y: to.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });

  const holdMs = Math.round(randomBetween(45, 120, rand));
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
 * Scroll with trusted wheel events, in several bursts.
 *
 * @param {{ send: (method: string, params?: object) => Promise<object> }} session
 * @param {{ x: number, y: number, totalDeltaY: number, rand?: () => number, sleepFn?: (ms:number)=>Promise<void> }} opts
 * @returns {Promise<{ chunks: number[] }>}
 */
export async function wheelScroll(session, opts) {
  const { x, y, totalDeltaY, rand = Math.random, sleepFn = defaultSleep } = opts;
  const sign = Math.sign(totalDeltaY) || 1;
  const total = Math.abs(Math.round(totalDeltaY));
  if (!total) return { chunks: [] };

  const count = Math.max(3, Math.round(randomBetween(3, 6, rand)));
  const weights = Array.from({ length: count }, () => randomBetween(0.6, 1.4, rand));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const chunks = weights.map((w) => Math.max(1, Math.round((total * w) / weightSum)));
  const diff = total - chunks.reduce((a, b) => a + b, 0);
  chunks[chunks.length - 1] += diff;

  for (const chunk of chunks) {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x,
      y,
      deltaX: 0,
      deltaY: sign * chunk,
      button: "none",
    });
    await sleepBetween(80, 260, { rand, sleepFn });
  }
  return { chunks: chunks.map((c) => sign * c) };
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
 * @param {string} targetId
 * @param {{ port?: number, WebSocketImpl?: typeof WebSocket, fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<string>} "ok"
 */
export async function activateTarget(targetId, opts = {}) {
  const {
    port = Number(process.env.CDP_AUTOMATION_PORT || 9229),
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
      () => reject(new Error(`activate timed out after ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: "Target.activateTarget", params: { targetId } }));
    ws.onmessage = (message) => {
      try {
        const frame = JSON.parse(message.data);
        if (frame.id !== 1) return;
        clearTimeout(timer);
        resolve(frame.error ? `error: ${frame.error.message}` : "ok");
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
    port = Number(process.env.CDP_AUTOMATION_PORT || 9229),
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

  const sendRaw = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error("CDP session is closed"));
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
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
    send: (method, params) => sendRaw(method, params, sessionId),
    close() {
      if (closed) return;
      try {
        ws.send(
          JSON.stringify({
            id: nextId++,
            method: "Target.detachFromTarget",
            params: { sessionId },
            sessionId,
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
