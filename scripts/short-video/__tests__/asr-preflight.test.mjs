/**
 * Tests for lib/asr-preflight.mjs — the Step 0.3 ASR hard gate (#418).
 *
 * Why this gate exists: the TTS quality gate word-verifies every take with
 * whisper.cpp ASR and fails closed as INFRA when the model is missing
 * (#415 ①) — but that judgement lands AFTER the TTS spend. Before this gate
 * the missing model only produced a `console.warn` + null transcript from
 * `transcribeVideo`, i.e. the pipeline discovered the hole one remote-GPU
 * batch too late. Step 0.3 moves the same judgement to pipeline start.
 *
 * The gate must not be a second silent no-op (the #406/#415 failure class:
 * "门禁存在但不生效"), so the last test pins the main.mjs wiring itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { ensureAsrOrExit } from "../lib/asr-preflight.mjs";

const MODEL = "/Users/x/.cache/whisper/ggml-large-v3-turbo.bin";
const CLI = "/opt/homebrew/bin/whisper-cli";

const avail = (over = {}) => ({
  ok: true,
  cli: CLI,
  cliFound: true,
  model: MODEL,
  modelFound: true,
  ...over,
});

describe("ensureAsrOrExit (#418 Step 0.3 hard gate)", () => {
  let logSpy, warnSpy, errSpy, exitSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.fn();
    delete process.env.TTS_QUALITY_ALLOW_NO_ASR;
    delete process.env.TTS_SKIP_QUALITY_GATE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TTS_QUALITY_ALLOW_NO_ASR;
    delete process.env.TTS_SKIP_QUALITY_GATE;
  });

  const errText = () => errSpy.mock.calls.flat().join(" ");
  const warnText = () => warnSpy.mock.calls.flat().join(" ");

  it("passes when the cli and the model are present", () => {
    const r = ensureAsrOrExit({ availability: avail(), exit: exitSpy });
    expect(r.ok).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("exits 1 and names the missing model path", () => {
    const r = ensureAsrOrExit({
      availability: avail({ ok: false, modelFound: false }),
      exit: exitSpy,
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(r.exited).toBe(true);
    expect(errText()).toContain(MODEL);
  });

  it("exits 1 and names the missing cli path", () => {
    ensureAsrOrExit({ availability: avail({ ok: false, cliFound: false }), exit: exitSpy });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errText()).toContain(CLI);
  });

  it("prints the explicit opt-out in the failure message", () => {
    ensureAsrOrExit({ availability: avail({ ok: false, modelFound: false }), exit: exitSpy });
    expect(errText()).toContain("TTS_QUALITY_ALLOW_NO_ASR=1");
  });

  it("downgrades to a warning under TTS_QUALITY_ALLOW_NO_ASR=1", () => {
    process.env.TTS_QUALITY_ALLOW_NO_ASR = "1";
    const r = ensureAsrOrExit({
      availability: avail({ ok: false, modelFound: false }),
      exit: exitSpy,
    });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(r.optedOut).toBe(true);
    expect(warnText()).toMatch(/ASR unavailable/);
  });

  it("downgrades under TTS_SKIP_QUALITY_GATE=1 (no gate → no ASR need)", () => {
    process.env.TTS_SKIP_QUALITY_GATE = "1";
    const r = ensureAsrOrExit({
      availability: avail({ ok: false, modelFound: false }),
      exit: exitSpy,
    });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(r.optedOut).toBe(true);
    expect(warnText()).toMatch(/ASR unavailable/);
  });

  it("does not opt out on any other env value", () => {
    process.env.TTS_QUALITY_ALLOW_NO_ASR = "0";
    ensureAsrOrExit({ availability: avail({ ok: false, modelFound: false }), exit: exitSpy });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  // The gate only matters if the pipeline actually calls it — pin the wiring
  // (a gate that exists in lib/ but is never invoked is the #406 failure mode).
  it("main.mjs calls ensureAsrOrExit after the CDP gate", () => {
    const src = readFileSync(new URL("../main.mjs", import.meta.url), "utf8");
    const cdpAt = src.indexOf("ensureCdpOrExit()");
    const asrAt = src.indexOf("ensureAsrOrExit()");
    expect(cdpAt).toBeGreaterThan(-1);
    expect(asrAt).toBeGreaterThan(cdpAt);
  });
});
