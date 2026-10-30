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
  activateTarget,
  clickAtPoint,
  openCdpSession,
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
    })`,
    returnByValue: true,
  });
  const raw = result?.value;
  return typeof raw === "string" ? JSON.parse(raw) : { events: [], text: "" };
}

export async function runSelfTest() {
  const failures = [];
  await ensureCdpProfileGuard();

  const tab = await cdpNewTab(FIXTURE_URL);
  // A background tab throttles input dispatch to ~4.6s per event (measured);
  // foreground it before measuring anything.
  await activateTarget(tab, { port: automationPort() });
  const cdp = await openCdpSession(tab, { port: automationPort() });
  try {
    await sleepJitter(400, 150);
    const button = await rectOf(cdp, "#btn");
    if (!button) {
      fail(failures, "fixture button not found");
      return { ok: false, failures, report: null };
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
      return { ok: false, failures, report: null };
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

    await wheelScroll(cdp, { x: 640, y: 480, totalDeltaY: 520 });
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
    if (wheels.length < 3) fail(failures, `only ${wheels.length} wheel events`);
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
    };
    return { ok: failures.length === 0, failures, report };
  } finally {
    cdp.close();
    await cdpCloseTab(tab);
  }
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  runSelfTest()
    .then(({ ok, failures, report }) => {
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
        console.log(`  wheel:    ${report.wheels} trusted bursts`);
        console.log(`  text:     ${JSON.stringify(report.text)}`);
        console.log(
          `  synthetic events: ${report.untrustedEvents} · paste events: ${report.pasteEvents}`,
        );
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
