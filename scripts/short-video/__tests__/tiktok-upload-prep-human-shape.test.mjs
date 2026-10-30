/**
 * The publish driver's pacing contract (#1013).
 *
 * Fixed waits are the fingerprint the ticket is about. These tests make the
 * rule enforceable rather than documentary: every pacing entry must carry a
 * real spread, every entry must actually be used by the driver, and the driver
 * may not contain a naked duration anywhere (`setTimeout(r, 2500)`,
 * `sleep(9000)`, …) — including inside page-side template strings.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PUBLISH_PACING, REVIEW_WATCH_MS } from "../lib/publish-pacing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIVER = join(__dirname, "..", "tiktok-upload-prep.mjs");
const source = readFileSync(DRIVER, "utf8");
const humanInputSource = readFileSync(join(__dirname, "..", "lib", "human-input.mjs"), "utf8");

describe("PUBLISH_PACING", () => {
  it("gives every wait a base and a spread of at least 20%", () => {
    for (const [name, value] of Object.entries(PUBLISH_PACING)) {
      expect(Array.isArray(value), name).toBe(true);
      const [base, spread] = value;
      expect(base, name).toBeGreaterThan(0);
      expect(spread, name).toBeGreaterThan(0);
      expect(spread / base, name).toBeGreaterThanOrEqual(0.2);
    }
  });

  it("has the driver consuming every entry (no dead pacing values)", () => {
    for (const name of Object.keys(PUBLISH_PACING)) {
      expect(source, `${name} is unused`).toContain(`PUBLISH_PACING.${name}`);
    }
  });

  it("keeps the review playback inside the 5-15s band", () => {
    expect(REVIEW_WATCH_MS[0]).toBe(5000);
    expect(REVIEW_WATCH_MS[1]).toBe(15000);
    expect(REVIEW_WATCH_MS[0]).toBeLessThan(REVIEW_WATCH_MS[1]);
  });
});

describe("no naked durations on the publish path", () => {
  // Both files, because the claim in the docs and the header is about the path,
  // not about one file: an inline `sleepBetween(90, 180)` in the input library
  // is exactly as much a fingerprint as one in the driver.
  const NAKED_SLEEP = /(^|[^\w.])(sleep|sleepJitter|sleepBetween)\(\s*-?\d/m;

  for (const [name, text] of [
    ["tiktok-upload-prep.mjs", source],
    ["lib/human-input.mjs", humanInputSource],
  ]) {
    it(`${name} passes no numeric literal to a sleep helper`, () => {
      const hit = text.match(NAKED_SLEEP);
      expect(hit?.[0] ?? null, hit ? `found: ${hit[0]}` : "clean").toBeNull();
    });

    it(`${name} has no literal setTimeout delay`, () => {
      expect(text).not.toMatch(/setTimeout\([^,]*,\s*\d/);
    });
  }

  it("keeps the pointer and wheel cadence as named bands", async () => {
    const bands = await import("../lib/human-input.mjs");
    for (const name of [
      "POINTER_STEP_MS",
      "POINTER_SETTLE_MS",
      "POINTER_HOLD_MS",
      "WHEEL_SETTLE_MS",
      "WHEEL_BURST_GAP_MS",
    ]) {
      const band = bands[name];
      expect(band, name).toHaveLength(2);
      expect(band[0], name).toBeGreaterThan(0);
      expect(band[1], name).toBeGreaterThan(0);
    }
    expect(bands.WHEEL_ACK_TIMEOUT_MS).toBeLessThan(5000);
  });
});

describe("pre-publish review evidence", () => {
  it("parses the player clock the review reads", async () => {
    const { parseClock } = await import("../tiktok-upload-prep.mjs");
    expect(parseClock("00:00:03 / 00:01:04")).toBe(3);
    expect(parseClock("01:02:03 / 02:00:00")).toBe(3723);
    expect(parseClock("00:14")).toBe(14);
    expect(parseClock("")).toBeNull();
    expect(parseClock(null)).toBeNull();
  });

  it("drives the canvas player's controls, since Studio renders no <video>", () => {
    // Measured on a live prepared post 2026-10-30: `document.querySelectorAll("video")`
    // was empty and the preview was a <canvas> inside `.Player__root`.
    expect(source).toContain(".video-player-control .play-btn");
    expect(source).toContain("#__reviewPlay");
    expect(source).not.toContain("__reviewVideo");
  });

  it("checks the tab is really visible before dispatching input", () => {
    // Target.activateTarget reports ok even when the Chrome window is occluded
    // and the tab stays hidden — input then crawls at ~5s per event.
    expect(source).toContain("openVisibleSession(");
    expect(source).toContain("createTab: cdpNewTab");
    expect(source).toContain("closeTab: cdpCloseTab");
  });

  it("does not run the CLI when imported", () => {
    // main() opens a tab and starts an upload, so importing the module for
    // its helpers must not start one.
    expect(source).toMatch(/invokedDirectly/);
    expect(source).toMatch(/if \(invokedDirectly\) \{\s*main\(\)/);
  });
});

describe("the driver's input shape", () => {
  it("routes mouse and keyboard input through the human-input primitives", () => {
    expect(source).toContain('from "./lib/human-input.mjs"');
    for (const symbol of [
      "openVisibleSession",
      "clickAtPoint",
      "typePlan",
      "planTyping",
      "wheelScroll",
      "sleepJitter",
      "sleepBetween",
      "pokeEditorState",
    ]) {
      expect(source, `${symbol} not imported`).toContain(symbol);
    }
    // The point of the ticket: no raw instantaneous input left in the driver.
    expect(source).not.toContain("Input.dispatchMouseEvent");
    expect(source).not.toContain("Input.insertText");
    expect(source).not.toMatch(/\/clickAt\?target/);
  });

  it("warms the session up before it opens the upload editor", () => {
    const warmIndex = source.indexOf("runSessionWarmup");
    const editorIndex = source.indexOf("waitFor(tab, EDITOR_STATE");
    expect(warmIndex).toBeGreaterThan(-1);
    expect(editorIndex).toBeGreaterThan(warmIndex);
    expect(source).toContain("WARMUP_URL");
  });

  it("reviews the prepared video before the publish click", () => {
    const reviewIndex = source.indexOf("reviewBeforePublish");
    const publishIndex = source.indexOf("Publishing (--publish)");
    expect(reviewIndex).toBeGreaterThan(-1);
    expect(publishIndex).toBeGreaterThan(reviewIndex);
  });

  it("writes the publish log, review verdict included", () => {
    expect(source).toContain("publish-log.jsonl");
    // The logger writes `step` itself; the review entry must carry the verdict
    // the issue asked to record, in the same words the operator sees.
    expect(source).toContain('log("review"');
    expect(source).toContain("已审阅");
    expect(source).toContain("reviewed");
  });

  it("types the caption instead of only pasting it", () => {
    const typed = source.indexOf('"typed"');
    const pasteFallback = source.indexOf('"paste-fallback"');
    expect(typed).toBeGreaterThan(-1);
    expect(pasteFallback).toBeGreaterThan(typed);
  });
});
