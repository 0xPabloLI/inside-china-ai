/**
 * Human-input primitives (#1013).
 *
 * The defect this guards: the CDP publish path clicked with an instant
 * `mousePressed`/`mouseReleased` (no `mousemove` at all), pasted a whole
 * caption in one synthetic clipboard event, and slept on fixed literals. Every
 * one of those is a measurable "this is a script" input feature, independent of
 * whatever TikTok does with them.
 *
 * These tests pin the shape of the replacement: pointer paths that bend,
 * decelerate and overshoot; timing that always jitters; typing that goes one
 * grapheme segment at a time; and a CDP session that works alongside the
 * proxy's own session on the same tab (proven live 2026-10-30: a second
 * flattened session on a proxy-owned target sees trusted input events).
 */
import { describe, it, expect } from "vitest";
import {
  LEAD_IN_MS,
  TYPING_GAP_MS,
  TYPING_PAUSE_MS,
  activateTarget,
  clickAtPoint,
  easeOutCubic,
  ensureForeground,
  mousePath,
  openCdpSession,
  openVisibleSession,
  openWindowTarget,
  planTyping,
  pokeEditorState,
  randomBetween,
  sleepJitter,
  splitGraphemes,
  typePlan,
  wheelScroll,
} from "../lib/human-input.mjs";

/**
 * Deterministic PRNG (mulberry32) for the pacing assertions.
 *
 * Lives in the test on purpose: no production path seeds a run, so exporting it
 * from the library would only add a second, unused way to build randomness.
 */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seeded = (seed = 42) => makeRng(seed);

/** Fake session: records every CDP call and its order. */
function fakeSession() {
  const calls = [];
  return {
    calls,
    send: async (method, params = {}) => {
      calls.push({ method, params });
      return {};
    },
  };
}

/** Fake clock for pacing assertions (records the requested sleeps). */
function fakeSleep() {
  const sleeps = [];
  const sleepFn = async (ms) => {
    sleeps.push(ms);
  };
  return { sleeps, sleepFn };
}

describe("makeRng / randomBetween", () => {
  it("is deterministic per seed and stays inside [min, max)", () => {
    const a = seeded(7);
    const b = seeded(7);
    const first = [a(), a(), a()];
    const second = [b(), b(), b()];
    expect(first).toEqual(second);
    for (let i = 0; i < 50; i++) {
      const v = randomBetween(-5, 5, seeded(3));
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe("sleepJitter", () => {
  it("always varies the duration within base ± spread", async () => {
    const { sleeps, sleepFn } = fakeSleep();
    for (let i = 0; i < 20; i++) await sleepJitter(1000, 250, { rand: seeded(i), sleepFn });
    expect(sleeps).toHaveLength(20);
    expect(new Set(sleeps).size).toBeGreaterThan(1);
    for (const ms of sleeps) {
      expect(ms).toBeGreaterThanOrEqual(750);
      expect(ms).toBeLessThanOrEqual(1250);
    }
  });

  it("never becomes negative when spread exceeds base", async () => {
    const { sleeps, sleepFn } = fakeSleep();
    for (let i = 0; i < 20; i++) await sleepJitter(100, 400, { rand: seeded(i), sleepFn });
    for (const ms of sleeps) expect(ms).toBeGreaterThanOrEqual(0);
  });
});

describe("easeOutCubic", () => {
  it("is 0..1, monotonic, and decelerating", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const v = easeOutCubic(i / 10);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    const firstHalf = easeOutCubic(0.5) - easeOutCubic(0.4);
    const lastTenth = easeOutCubic(1) - easeOutCubic(0.9);
    expect(lastTenth).toBeLessThan(firstHalf);
  });
});

describe("mousePath", () => {
  const from = { x: 100, y: 100 };
  const to = { x: 800, y: 300 };

  it("starts at the current pointer, ends exactly on the target", () => {
    const { points } = mousePath(from, to, { rand: seeded(11) });
    expect(points[0]).toEqual(from);
    expect(points.at(-1)).toEqual(to);
    expect(points.length).toBeGreaterThanOrEqual(10);
    for (const p of points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("bends away from the straight line instead of tracking it", () => {
    const { points } = mousePath(from, to, { rand: seeded(11) });
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const maxDeviation = Math.max(
      ...points.map((p) => Math.abs((p.x - from.x) * dy - (p.y - from.y) * dx) / dist),
    );
    expect(maxDeviation).toBeGreaterThan(3);
  });

  it("overshoots the target before the final correction", () => {
    const { points } = mousePath(from, to, { rand: seeded(4) });
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const beyond = points.filter((p) => ((p.x - to.x) * dx + (p.y - to.y) * dy) / dist > 0.2);
    expect(beyond.length).toBeGreaterThan(0);
    // overshoot stays small — it is a hand tremor, not a different destination
    for (const p of beyond) expect(Math.hypot(p.x - to.x, p.y - to.y)).toBeLessThanOrEqual(4);
  });

  it("decelerates: the final steps are shorter than the opening steps", () => {
    const { points } = mousePath(from, to, { rand: seeded(11) });
    const steps = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    const head = steps.slice(0, Math.max(2, Math.floor(steps.length / 5)));
    const tail = steps.slice(-Math.max(2, Math.floor(steps.length / 5)));
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(tail)).toBeLessThan(avg(head));
  });

  it("is reproducible for the same seed", () => {
    expect(mousePath(from, to, { rand: seeded(99) })).toEqual(
      mousePath(from, to, { rand: seeded(99) }),
    );
  });

  it("does not pretend to move for a sub-pixel target", () => {
    const near = { x: 100.5, y: 100.5 };
    const { points } = mousePath(from, near, { rand: seeded(5) });
    expect(points[0]).toEqual(from);
    expect(points.at(-1)).toEqual(near);
  });
});

describe("clickAtPoint", () => {
  it("moves the pointer, then presses and releases after a human hold", async () => {
    const session = fakeSession();
    const { sleeps, sleepFn } = fakeSleep();
    const target = { x: 640, y: 360 };
    const result = await clickAtPoint(session, {
      from: { x: 120, y: 200 },
      to: target,
      rand: seeded(21),
      sleepFn,
    });

    const types = session.calls.map((c) => c.params.type);
    expect(types[0]).toBe("mouseMoved");
    expect(types.filter((t) => t === "mouseMoved").length).toBeGreaterThan(5);
    expect(types.at(-2)).toBe("mousePressed");
    expect(types.at(-1)).toBe("mouseReleased");

    const lastMove = session.calls.filter((c) => c.params.type === "mouseMoved").at(-1);
    expect(lastMove.params.x).toBe(target.x);
    expect(lastMove.params.y).toBe(target.y);

    for (const call of session.calls) expect(call.method).toBe("Input.dispatchMouseEvent");
    const pressed = session.calls.find((c) => c.params.type === "mousePressed");
    const released = session.calls.find((c) => c.params.type === "mouseReleased");
    expect(pressed.params.button).toBe("left");
    expect(released.params.button).toBe("left");
    expect(released.params.clickCount).toBe(1);

    // the press is held for a hand-length interval, not 0 ms
    expect(result.holdMs).toBeGreaterThanOrEqual(45);
    expect(result.holdMs).toBeLessThanOrEqual(120);
    expect(sleeps).toContain(result.holdMs);
  });
});

describe("wheelScroll", () => {
  it("splits a scroll into several trusted wheel bursts that sum to the request", async () => {
    const session = fakeSession();
    const { sleepFn } = fakeSleep();
    const result = await wheelScroll(session, {
      x: 700,
      y: 500,
      totalDeltaY: 600,
      rand: seeded(8),
      sleepFn,
    });
    const wheels = session.calls.filter((c) => c.params.type === "mouseWheel");
    expect(wheels.length).toBeGreaterThanOrEqual(3);
    const sum = wheels.reduce((a, c) => a + c.params.deltaY, 0);
    expect(Math.round(sum)).toBe(600);
    for (const w of wheels) {
      expect(w.params.x).toBe(700);
      expect(w.params.y).toBe(500);
      expect(w.params.deltaY).toBeGreaterThan(0);
    }
    expect(result.chunks.length).toBe(wheels.length);
  });

  it("scrolls in the requested direction", async () => {
    const session = fakeSession();
    const { sleepFn } = fakeSleep();
    await wheelScroll(session, {
      x: 10,
      y: 10,
      totalDeltaY: -400,
      rand: seeded(9),
      sleepFn,
    });
    const wheels = session.calls.filter((c) => c.params.type === "mouseWheel");
    for (const c of wheels) expect(c.params.deltaY).toBeLessThan(0);
  });

  it("moves the pointer to the scroll point first, or Chrome never acks the wheel", async () => {
    // Measured 2026-10-30: a wheel dispatched right after Input.insertText
    // never resolved, while the same wheel after one mouseMoved took 10ms.
    const session = fakeSession();
    const { sleepFn } = fakeSleep();
    await wheelScroll(session, {
      x: 640,
      y: 480,
      totalDeltaY: 300,
      rand: seeded(10),
      sleepFn,
    });
    expect(session.calls[0].params).toMatchObject({
      type: "mouseMoved",
      x: 640,
      y: 480,
    });
    expect(session.calls[1].params.type).toBe("mouseWheel");
  });

  it("falls back to a scripted scroll, and says so, when the wheel never acks", async () => {
    // Observed 2026-10-30: after a sustained burst of insertText, wheel
    // dispatch stops resolving. Losing 15s to a hang is worse than scrolling
    // by script, as long as the caller can see it happened.
    const calls = [];
    const session = {
      send: async (method, params = {}) => {
        calls.push({ method, params });
        if (params.type === "mouseWheel") throw new Error("CDP command timed out");
        return {};
      },
    };
    const { sleepFn } = fakeSleep();
    const result = await wheelScroll(session, {
      x: 300,
      y: 300,
      totalDeltaY: 500,
      rand: seeded(11),
      sleepFn,
    });
    expect(result.mode).toBe("js-fallback");
    expect(result.reason).toMatch(/timed out/);
    expect(result.chunks).toEqual([500]);
    const evaluated = calls.find((c) => c.method === "Runtime.evaluate");
    expect(evaluated.params.expression).toContain("scrollBy(0, 500)");
  });

  it("scripts only the shortfall when a later burst is dropped", async () => {
    // Bursts that were acknowledged already moved the page. Adding the whole
    // request on top overshoots by exactly what they scrolled.
    const calls = [];
    let wheels = 0;
    const session = {
      send: async (method, params = {}) => {
        if (params.type === "mouseWheel" && ++wheels > 2) throw new Error("CDP command timed out");
        calls.push({ method, params });
        return {};
      },
    };
    const { sleepFn } = fakeSleep();
    const result = await wheelScroll(session, {
      x: 300,
      y: 300,
      totalDeltaY: 520,
      rand: seeded(13),
      sleepFn,
    });
    const delivered = result.chunks.slice(0, -1).reduce((a, b) => a + b, 0);
    const remaining = result.chunks.at(-1);
    expect(result.mode).toBe("js-fallback");
    expect(remaining).toBe(520 - delivered);
    expect(delivered + remaining).toBe(520);
    const evaluated = calls.find((c) => c.method === "Runtime.evaluate");
    expect(evaluated.params.expression).toContain(`scrollBy(0, ${remaining})`);
    expect(Math.abs(remaining)).toBeLessThan(520);
  });

  it("keeps every burst positive and forward on a scroll shorter than the burst count", async () => {
    // Each chunk is clamped to ≥1 while the split asks for 3-6 of them, so a
    // residual correction aimed at the last chunk can zero it or flip its sign
    // — a wheel event in the wrong direction.
    for (const totalDeltaY of [4, 7, 10, -4]) {
      const session = fakeSession();
      const { sleepFn } = fakeSleep();
      const result = await wheelScroll(session, {
        x: 5,
        y: 5,
        totalDeltaY,
        rand: seeded(14),
        sleepFn,
      });
      for (const c of result.chunks) expect(Math.sign(c)).toBe(Math.sign(totalDeltaY));
      expect(result.chunks.reduce((a, b) => a + b, 0)).toBe(totalDeltaY);
    }
  });

  it("propagates the timeout when the caller opted out of the fallback", async () => {
    const session = {
      send: async (_method, params = {}) => {
        if (params.type === "mouseWheel") throw new Error("CDP command timed out");
        return {};
      },
    };
    const { sleepFn } = fakeSleep();
    await expect(
      wheelScroll(session, {
        x: 1,
        y: 1,
        totalDeltaY: 100,
        rand: seeded(12),
        sleepFn,
        fallback: false,
      }),
    ).rejects.toThrow(/timed out/);
  });
});

describe("splitGraphemes / planTyping", () => {
  const caption = "DeepSeek raised $15B.\nFollow for more China AI news.\n\n#chinaai #deepseek 🙂";

  it("segments by grapheme, never splitting emoji or combining marks", () => {
    expect(splitGraphemes("🙂")).toEqual(["🙂"]);
    expect(splitGraphemes("e\u0301")).toEqual(["e\u0301"]);
    expect(splitGraphemes("ab🙂c")).toEqual(["a", "b", "🙂", "c"]);
  });

  it("rebuilds the exact caption and keeps gaps inside the human bands", () => {
    const plan = planTyping(caption, { rand: seeded(31) });
    expect(plan.segments.map((s) => s.text).join("")).toBe(caption);
    expect(plan.leadInMs).toBeGreaterThanOrEqual(LEAD_IN_MS[0]);
    expect(plan.leadInMs).toBeLessThanOrEqual(LEAD_IN_MS[1]);

    for (const seg of plan.segments) {
      if (seg.delayBeforeMs <= TYPING_GAP_MS[1]) {
        expect(seg.delayBeforeMs).toBeGreaterThanOrEqual(TYPING_GAP_MS[0]);
      } else {
        // anything slower is a deliberate pause, and pauses only happen at
        // boundaries a person would actually stop at
        expect(seg.delayBeforeMs).toBeGreaterThanOrEqual(TYPING_PAUSE_MS[0]);
        expect(seg.delayBeforeMs).toBeLessThanOrEqual(1300);
      }
    }
  });

  it("emits newlines as their own Enter segments", () => {
    const plan = planTyping(caption, { rand: seeded(31) });
    const enters = plan.segments.filter((s) => s.kind === "enter");
    expect(enters).toHaveLength(3);
    for (const e of enters) expect(e.text).toBe("\n");
    // an Enter is never glued to neighbouring characters
    for (const seg of plan.segments) {
      if (seg.kind !== "enter") expect(seg.text).not.toContain("\n");
    }
  });

  it("keeps one grapheme per segment so Draft.js applies every keystroke", () => {
    const plan = planTyping(caption, { rand: seeded(12) });
    for (const seg of plan.segments) {
      if (seg.kind === "enter") continue;
      expect(splitGraphemes(seg.text)).toHaveLength(1);
    }
  });

  it("reports an estimate equal to its own lead-in plus gaps", () => {
    const plan = planTyping(caption, { rand: seeded(77) });
    const sum = plan.leadInMs + plan.segments.reduce((a, s) => a + s.delayBeforeMs, 0);
    expect(plan.estimateMs).toBe(sum);
  });

  it("is reproducible for the same seed", () => {
    expect(planTyping(caption, { rand: seeded(5) })).toEqual(
      planTyping(caption, { rand: seeded(5) }),
    );
  });
});

describe("typePlan", () => {
  it("inserts text per segment and presses Enter for newlines", async () => {
    const session = fakeSession();
    const { sleeps, sleepFn } = fakeSleep();
    const plan = planTyping("Hi\nyo", { rand: seeded(3) });
    const seen = [];
    await typePlan(session, plan, { sleepFn, onSegment: (seg) => seen.push(seg.text) });

    expect(session.calls.filter((c) => c.method === "Input.insertText").length).toBeGreaterThan(0);
    const enterDowns = session.calls.filter(
      (c) => c.method === "Input.dispatchKeyEvent" && c.params.type === "keyDown",
    );
    expect(enterDowns).toHaveLength(1);
    expect(enterDowns[0].params.key).toBe("Enter");
    expect(
      session.calls.filter(
        (c) => c.method === "Input.dispatchKeyEvent" && c.params.type === "keyUp",
      ),
    ).toHaveLength(1);

    const inserted = session.calls
      .filter((c) => c.method === "Input.insertText")
      .map((c) => c.params.text)
      .join("");
    expect(inserted).toBe("Hiyo");
    expect(seen.join("")).toBe("Hi\nyo");
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(plan.estimateMs);
  });
});

describe("pokeEditorState", () => {
  it("types a space and deletes it so the editor re-renders from its own state", async () => {
    const session = fakeSession();
    await pokeEditorState(session);
    expect(session.calls.map((c) => c.method)).toEqual([
      "Input.insertText",
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
    ]);
    expect(session.calls[0].params).toEqual({ text: " " });
    expect(session.calls[1].params.key).toBe("Backspace");
    expect(session.calls[1].params.windowsVirtualKeyCode).toBe(8);
    expect(session.calls[2].params.type).toBe("keyUp");
  });
});

// ─── CDP session ───
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    FakeSocket.instances.push(this);
    queueMicrotask(() => this.onopen && this.onopen());
  }
  send(raw) {
    const frame = JSON.parse(raw);
    this.sent.push(frame);
    this.respond(frame);
  }
  respond(frame) {
    const reply = (result) => {
      queueMicrotask(() =>
        this.onmessage?.({
          data: JSON.stringify({ id: frame.id, result }),
        }),
      );
    };
    const fail = (error) => {
      queueMicrotask(() =>
        this.onmessage?.({
          data: JSON.stringify({ id: frame.id, error }),
        }),
      );
    };
    if (FakeSocket.refuseMethod === frame.method) {
      fail({ code: -32602, message: "No target with given id found" });
      return;
    }
    if (frame.method === "Target.attachToTarget") {
      // One session per tab; visibility is keyed by attach order within the
      // test, so a test can say "the first tab is hidden, the next is visible".
      this.sessionOrdinal = FakeSocket.instances.filter(
        (s) => s.sessionOrdinal !== undefined,
      ).length;
      reply({ sessionId: `S-${this.sessionOrdinal + 1}` });
    } else if (frame.method === "Target.createTarget") reply({ targetId: "WIN-TAB-1" });
    else if (frame.method === "Runtime.evaluate")
      reply({ result: { value: FakeSocket.visibilityFor(this.sessionOrdinal ?? 0) } });
    else if (frame.method === "Target.detachFromTarget") reply({});
    else reply({ ok: true });
  }
  close() {
    this.closed = true;
  }
}
FakeSocket.instances = [];
FakeSocket.refuseMethod = null;
// Per-attach visibility; the last entry repeats for later tabs.
FakeSocket.visibility = ["visible"];
FakeSocket.visibilityFor = (ordinal) =>
  FakeSocket.visibility[Math.min(ordinal, FakeSocket.visibility.length - 1)];

const fakeFetch = async () => ({
  json: async () => ({ webSocketDebuggerUrl: "ws://127.0.0.1:9229/devtools/browser/fake" }),
});

describe("activateTarget", () => {
  it("foregrounds the target through the browser-level endpoint", async () => {
    FakeSocket.instances = [];
    const result = await activateTarget("TAB-9", {
      WebSocketImpl: FakeSocket,
      fetchImpl: fakeFetch,
    });
    expect(result).toBe("ok");
    const socket = FakeSocket.instances[0];
    expect(socket.url).toBe("ws://127.0.0.1:9229/devtools/browser/fake");
    expect(socket.sent[0]).toMatchObject({
      method: "Target.activateTarget",
      params: { targetId: "TAB-9" },
    });
    expect(socket.closed).toBe(true);
  });

  it("throws when Chrome refuses the activation, instead of running throttled", async () => {
    FakeSocket.instances = [];
    FakeSocket.refuseMethod = "Target.activateTarget";
    try {
      await expect(
        activateTarget("TAB-9", { WebSocketImpl: FakeSocket, fetchImpl: fakeFetch }),
      ).rejects.toThrow(/Target.activateTarget refused: No target/);
    } finally {
      FakeSocket.refuseMethod = null;
    }
    expect(FakeSocket.instances[0].closed).toBe(true);
  });
});

describe("ensureForeground", () => {
  const sessionWith = (values) => {
    const sent = [];
    let i = 0;
    return {
      sent,
      send: async (method) => {
        sent.push(method);
        if (method === "Runtime.evaluate") {
          const value = values[Math.min(i, values.length - 1)];
          i += 1;
          return { result: { value } };
        }
        return {};
      },
    };
  };
  const noSleep = async () => {};

  it("returns once the tab reports visible", async () => {
    const session = sessionWith(["visible"]);
    await expect(ensureForeground(session, { sleepFn: noSleep })).resolves.toBe("visible");
    expect(session.sent).toContain("Page.bringToFront");
  });

  it("retries a hidden tab before giving up", async () => {
    const session = sessionWith(["hidden", "hidden", "visible"]);
    await expect(ensureForeground(session, { sleepFn: noSleep })).resolves.toBe("visible");
  });

  it("throws with the instruction instead of running at ~5s per event", async () => {
    const session = sessionWith(["hidden"]);
    await expect(
      ensureForeground(session, { sleepFn: noSleep, label: "upload tab" }),
    ).rejects.toThrow(/upload tab is hidden.*Bring the Chrome window to the front/s);
  });
});

describe("openWindowTarget", () => {
  it("creates the window through the browser endpoint and returns its target", async () => {
    FakeSocket.instances = [];
    FakeSocket.visibility = ["visible"];
    const targetId = await openWindowTarget("https://example.test/upload", {
      WebSocketImpl: FakeSocket,
      fetchImpl: fakeFetch,
    });
    expect(targetId).toBe("WIN-TAB-1");
    const frame = FakeSocket.instances[0].sent[0];
    expect(frame).toMatchObject({
      method: "Target.createTarget",
      params: { url: "https://example.test/upload", newWindow: true },
    });
    expect(FakeSocket.instances[0].closed).toBe(true);
  });
});

describe("openVisibleSession", () => {
  const cycle = (states) => {
    FakeSocket.visibility = states;
    FakeSocket.instances = [];
  };

  it("keeps the proxy's tab when it is already visible", async () => {
    cycle(["visible"]);
    const closed = [];
    const opened = await openVisibleSession("https://example.test/upload", {
      createTab: async () => "TAB-1",
      closeTab: (id) => closed.push(id),
      WebSocketImpl: FakeSocket,
      fetchImpl: fakeFetch,
    });
    expect(opened).toMatchObject({ targetId: "TAB-1", window: "existing" });
    expect(closed).toEqual([]);
    // No window was created.
    expect(
      FakeSocket.instances.some((s) => s.sent.some((f) => f.method === "Target.createTarget")),
    ).toBe(false);
  });

  it("re-hosts into a new window when the occluded window's tab stays hidden", async () => {
    cycle(["hidden", "visible"]);
    const closed = [];
    const reasons = [];
    const opened = await openVisibleSession("https://example.test/upload", {
      createTab: async () => "TAB-1",
      closeTab: (id) => closed.push(id),
      onRehost: (reason) => reasons.push(reason),
      sleepFn: async () => {},
      WebSocketImpl: FakeSocket,
      fetchImpl: fakeFetch,
    });
    expect(opened).toMatchObject({ targetId: "WIN-TAB-1", window: "new" });
    expect(closed).toEqual(["TAB-1"]);
    expect(reasons[0]).toMatch(/hidden/);
    const create = FakeSocket.instances
      .flatMap((s) => s.sent)
      .find((f) => f.method === "Target.createTarget");
    expect(create.params).toEqual({ url: "https://example.test/upload", newWindow: true });
  });

  it("throws an actionable error when even a fresh window is hidden", async () => {
    cycle(["hidden"]);
    const closed = [];
    await expect(
      openVisibleSession("https://example.test/upload", {
        createTab: async () => "TAB-1",
        closeTab: (id) => closed.push(id),
        sleepFn: async () => {},
        WebSocketImpl: FakeSocket,
        fetchImpl: fakeFetch,
      }),
    ).rejects.toThrow(/input is throttled.*Bring the Chrome window to the front/s);
    expect(closed).toEqual(["TAB-1", "WIN-TAB-1"]);
  });
});

describe("openCdpSession", () => {
  it("attaches a flattened session to the proxy-owned target and scopes calls to it", async () => {
    FakeSocket.instances = [];
    const session = await openCdpSession("TAB-1", {
      WebSocketImpl: FakeSocket,
      fetchImpl: fakeFetch,
    });
    expect(session.sessionId).toBe("S-1");

    const attach = FakeSocket.instances[0].sent.find((f) => f.method === "Target.attachToTarget");
    expect(attach.params).toEqual({ targetId: "TAB-1", flatten: true });

    await session.send("Input.insertText", { text: "x" });
    const scoped = FakeSocket.instances[0].sent.find((f) => f.method === "Input.insertText");
    expect(scoped.sessionId).toBe("S-1");

    session.close();
    const detach = FakeSocket.instances[0].sent.find((f) => f.method === "Target.detachFromTarget");
    expect(detach.params).toEqual({ sessionId: "S-1" });
    // Browser-level command: a top-level sessionId would route it into the page
    // session, where Target.* does not exist.
    expect(detach.sessionId).toBeUndefined();
    expect(FakeSocket.instances[0].closed).toBe(true);
  });

  it("fails loudly and closes the socket when the browser has no debugger endpoint", async () => {
    FakeSocket.instances = [];
    await expect(
      openCdpSession("TAB-1", {
        WebSocketImpl: FakeSocket,
        fetchImpl: async () => ({ json: async () => ({}) }),
      }),
    ).rejects.toThrow(/no browser-level CDP endpoint/);
  });
});
