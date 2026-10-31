#!/usr/bin/env node
/**
 * Human-input self-test (#1013).
 *
 * Why this exists: the publish path's input shape is the one thing about
 * "does this look human" that is measurable without guessing at TikTok's
 * ranking. This script measures it directly against a local fixture page in
 * the automation profile, so a regression (a raw `el.click()`, a synthetic
 * paste, a fixed-delay sleep that lost its jitter) shows up as a failing
 * count rather than a silently bot-shaped publish.
 *
 * It exercises the same primitives the driver uses: a bent pointer path with
 * deceleration and overshoot, trusted insertText typing with newlines,
 * the Draft-state poke (space + Backspace), and wheel scrolling.
 *
 * What it checks:
 *   - every dispatched event the page saw was `isTrusted: true`;
 *   - the pointer travelled (≥5 mousemove events, real distance, varied steps);
 *   - mousedown/mouseup landed where the path ended;
 *   - typing produced `beforeinput`/`input` with `inputType: "insertText"`;
 *   - Enter and Backspace arrived as trusted key events;
 *   - a wheel scroll produced trusted wheel events;
 *   - the typed text (emoji included) matches what was requested;
 *   - no paste event was used at all.
 *
 * Run:
 *   node scripts/short-video/human-input-selftest.mjs
 *
 * Exit: 0 = every check passed, 1 = at least one failed (details on stdout).
 */

import { realpathSync } from "fs";
import { fileURLToPath } from "url";
import { cdpNewTab, cdpCloseTab } from "./lib/cdp-client.mjs";
import { ensureCdpProfileGuard } from "./lib/cdp-preflight.mjs";
import { automationPort } from "./lib/cdp-profile-guard.mjs";
import {
  clickAtPoint,
  openVisibleSession,
  planTyping,
  pokeEditorState,
  sleepJitter,
  typePlan,
  wheelScroll,
} from "./lib/human-input.mjs";

const CAPTION = "Hello 世界 🙂\nsecond line";

const FIXTURE = `<!doctype html>
<html><body style="margin:0;font:14px system-ui">
<button id="btn" style="width:180px;height:56px;margin:24px">click me</button>
<div id="ed" contenteditable="true"
     style="width:420px;min-height:90px;border:1px solid #333;margin:24px"></div>
<div style="height:4000px"></div>
<script>
window.__events = [];
window.__maxScrollY = 0;
addEventListener("scroll", () => { window.__maxScrollY = Math.max(window.__maxScrollY, window.scrollY); }, true);
for (const type of ["mousemove", "mousedown", "mouseup", "wheel", "keydown", "beforeinput", "input", "paste"]) {
  document.addEventListener(type, (e) => {
    window.__events.push({
      type,
      trusted: e.isTrusted,
      inputType: e.inputType || null,
      key: e.key || null,
      x: typeof e.clientX === "number" ? e.clientX : null,
      y: typeof e.clientY === "number" ? e.clientY : null,
    });
  }, true);
}
</script></body></html>`;

const FIXTURE_URL = `data:text/html;charset=utf-8,${encodeURIComponent(FIXTURE)}`;

function fail(list, message) {
  list.push(message);
}

/** Resolve an element's centre in viewport coordinates. */
async function rectOf(cdp, selector) {
  const { result } = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`,
    returnByValue: true,
  });
  return result?.value ?? null;
}

/** Read the fixture's event log and editor text. */
async function readFixture(cdp) {
  const { result } = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      events: window.__events,
      text: document.getElementById("ed").innerText,
      scrollY: Math.round(window.__maxScrollY ?? window.scrollY),
    })`,
    returnByValue: true,
  });
  const raw = result?.value;
  return typeof raw === "string" ? JSON.parse(raw) : { events: [], text: "" };
}

export async function runSelfTest() {
  const failures = [];
  const notes = [];
  await ensureCdpProfileGuard();

  // A background tab throttles input dispatch to ~5s per event (measured), so
  // the fixture has to be in a visible tab or every count below is measured
  // through a per-event stall. `openVisibleSession` re-hosts it in a new window
  // when the automation window cannot be raised.
  const opened = await openVisibleSession(FIXTURE_URL, {
    port: automationPort(),
    createTab: cdpNewTab,
    closeTab: cdpCloseTab,
    onRehost: (reason) => console.log(`  ⚠️ ${reason} — re-hosted the fixture in a new window`),
    onRecover: ({ method, retried }) =>
      console.log(
        `  ⚠️ input stalled on ${method} mid-run — emulating focus` +
          (retried ? " and retrying" : "; scripting that scroll instead"),
      ),
  });
  const tab = opened.targetId;
  const cdp = opened.session;
  // The counts below are only comparable to the documented healthy bands when
  // the tab was really in front. Emulation lifts the throttle without moving
  // the window, so say so instead of letting a healthy-looking number imply a
  // visible window.
  if (opened.focusEmulated) {
    notes.push(
      "focus emulation was needed: the fixture window was not in front, so these numbers " +
        "measure an emulated renderer rather than a raised window",
    );
  }
  try {
    await sleepJitter(400, 150);

    // Scroll FIRST, before any click or keystroke. Measured 2026-10-30 on this
    // Chrome build: once a pointer press or a burst of trusted text input has
    // been dispatched, a wheel event is never acknowledged (press → 15s stall,
    // then a fallback scroll). Scrolling on a fresh page is the one order that
    // measures real wheel delivery, and it is also the driver's order — warm up
    // on the feed, then click and type.
    const scrolled = await wheelScroll(cdp, { x: 640, y: 480, totalDeltaY: 520 });
    await sleepJitter(250, 100);
    if (scrolled.mode !== "wheel") {
      // Not a failure by itself: this Chrome build sometimes stops acking
      // mid-burst after a few deliveries. What matters is how many trusted
      // wheel events the page actually received, checked below.
      notes.push(
        `wheel burst ended in ${scrolled.mode}: ${scrolled.reason}` +
          (scrolled.correctedPx
            ? ` (a late dispatch overshot, so the scripted scroll was corrected by ${scrolled.correctedPx}px)`
            : ""),
      );
      // That burst also healed the throttle (`withThrottleRecovery` runs inside
      // `cdp.send`), so a second burst is the honest proof that trusted wheel
      // input works again — and it is the same retry the driver relies on.
      await sleepJitter(400, 200);
      const retried = await wheelScroll(cdp, { x: 640, y: 480, totalDeltaY: 260 });
      notes.push(`after the heal, a second burst ended in ${retried.mode}`);
    }

    const button = await rectOf(cdp, "#btn");
    if (!button) {
      fail(failures, "fixture button not found");
      return { ok: false, failures, notes, report: null };
    }

    const pointer = { x: 200, y: 500 };
    const clickPoint = {
      x: button.x + button.width / 2,
      y: button.y + button.height / 2,
    };
    const clicked = await clickAtPoint(cdp, { from: pointer, to: clickPoint });
    await sleepJitter(300, 100);

    const editor = await rectOf(cdp, "#ed");
    if (!editor) {
      fail(failures, "fixture editor not found");
      return { ok: false, failures, notes, report: null };
    }
    await cdp.send("Runtime.evaluate", {
      expression: "document.getElementById('ed').focus()",
    });
    await clickAtPoint(cdp, {
      from: { ...clickPoint },
      to: { x: editor.x + editor.width / 2, y: editor.y + editor.height / 2 },
    });
    await sleepJitter(250, 100);

    const plan = planTyping(CAPTION);
    await typePlan(cdp, plan);
    await pokeEditorState(cdp);
    await sleepJitter(250, 100);

    const fixture = await readFixture(cdp);
    const events = fixture.events;

    const moves = events.filter((e) => e.type === "mousemove");
    const presses = events.filter((e) => e.type === "mousedown");
    const releases = events.filter((e) => e.type === "mouseup");
    const inserts = events.filter((e) => e.type === "beforeinput" && e.inputType === "insertText");
    const enters = events.filter((e) => e.type === "keydown" && e.key === "Enter");
    const backspaces = events.filter((e) => e.type === "keydown" && e.key === "Backspace");
    const wheels = events.filter((e) => e.type === "wheel");
    const pastes = events.filter((e) => e.type === "paste");
    const synthetic = events.filter((e) => !e.trusted);

    const travel = moves.slice(1).reduce((sum, p, i) => {
      const prev = moves[i];
      return sum + Math.hypot(p.x - prev.x, p.y - prev.y);
    }, 0);
    const steps = moves.slice(1).map((p, i) => Math.hypot(p.x - moves[i].x, p.y - moves[i].y));

    if (moves.length < 5) fail(failures, `only ${moves.length} mousemove events`);
    if (!(travel > 100)) fail(failures, `pointer only travelled ${Math.round(travel)}px`);
    if (new Set(steps.map((s) => Math.round(s))).size < 3) {
      fail(failures, "pointer steps are uniform — no deceleration/curve");
    }
    if (presses.length < 2) fail(failures, `only ${presses.length} mousedown events`);
    if (releases.length < 2) fail(failures, `only ${releases.length} mouseup events`);
    if (inserts.length < 5) fail(failures, `only ${inserts.length} insertText beforeinput events`);
    if (enters.length < 1) fail(failures, "no trusted Enter keydown");
    if (backspaces.length < 1) fail(failures, "no trusted Backspace keydown");
    // Two delivered bursts prove trusted wheel input; the page actually
    // scrolling proves the burst was not silently dropped (this Chrome build
    // sometimes stops acking mid-burst after a few deliveries).
    if (wheels.length < 2) fail(failures, `only ${wheels.length} wheel events`);
    if (!(fixture.scrollY > 0))
      fail(failures, `the wheel did not scroll the page (scrollY=${fixture.scrollY})`);
    if (pastes.length > 0) fail(failures, `a paste event was used (${pastes.length})`);
    if (synthetic.length > 0) {
      fail(
        failures,
        `${synthetic.length} untrusted event(s): ${synthetic.map((e) => e.type).join(", ")}`,
      );
    }

    const normalized = (s) =>
      s
        .replace(/[ \t]+/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .trim();
    if (normalized(fixture.text) !== normalized(CAPTION)) {
      fail(failures, `typed text mismatch: ${JSON.stringify(fixture.text)}`);
    }

    const report = {
      moves: moves.length,
      travelPx: Math.round(travel),
      distinctStepSizes: new Set(steps.map((s) => Math.round(s))).size,
      clicks: presses.length,
      clickPoint: clicked.to,
      inserts: inserts.length,
      segments: plan.segments.length,
      enters: enters.length,
      backspaces: backspaces.length,
      wheels: wheels.length,
      untrustedEvents: synthetic.length,
      pasteEvents: pastes.length,
      text: fixture.text,
      notes,
    };
    // `notes` travels with the report so the CLI prints it: the summary above
    // has no room for "this number was measured through a js-fallback".
    return { ok: failures.length === 0, failures, notes, report: { ...report, notes } };
  } finally {
    cdp.close();
    await cdpCloseTab(tab);
  }
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runSelfTest()
    .then(({ ok, failures, notes, report }) => {
      if (report) {
        console.log("");
        console.log("=".repeat(60));
        console.log("🧪 human-input self-test");
        console.log("=".repeat(60));
        console.log(
          `  pointer:  ${report.moves} moves, ${report.travelPx}px travel, ` +
            `${report.distinctStepSizes} distinct step sizes`,
        );
        console.log(
          `  clicks:   ${report.clicks} (press/release at ` +
            `${report.clickPoint.x.toFixed(1)},${report.clickPoint.y.toFixed(1)})`,
        );
        console.log(
          `  typing:   ${report.inserts} insertText events from ` +
            `${report.segments} planned segments`,
        );
        console.log(`  keys:     ${report.enters} Enter, ${report.backspaces} Backspace`);
        console.log(`  wheel:    ${report.wheels} trusted bursts, page scrolled`);
        console.log(`  text:     ${JSON.stringify(report.text)}`);
        console.log(
          `  synthetic events: ${report.untrustedEvents} · paste events: ${report.pasteEvents}`,
        );
        for (const note of notes ?? []) console.log(`  ⚠️ ${note}`);
        console.log("");
      }
      if (ok) {
        console.log("✅ every input event the page saw was trusted and human-shaped");
        process.exit(0);
      }
      console.log("❌ self-test failed:");
      for (const failure of failures) console.log(`   - ${failure}`);
      process.exit(1);
    })
    .catch((err) => {
      console.error(`❌ self-test crashed: ${err.message}`);
      process.exit(1);
    });
}
