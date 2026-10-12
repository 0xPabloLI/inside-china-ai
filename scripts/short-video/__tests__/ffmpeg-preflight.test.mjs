/**
 * Tests for lib/ffmpeg-preflight.mjs — the Step 0.4 ASS burn-capability gate
 * (#394).
 *
 * Why this gate exists: the pipeline burned TTS + a full Remotion render, then
 * died at the ASS burn because the ffmpeg it consumes (`ffmpeg-full`, the only
 * binary with libass) was missing or lacked the `ass` filter. The check MUST
 * probe the binary post-process.mjs actually consumes — PATH ffmpeg
 * legitimately lacks libass, so a PATH probe would pass while the burn fails
 * (and `ffmpeg -h filter=ass` exits 0 even without libass, measured
 * 2026-10-12 — the filter list is the only reliable probe).
 *
 * The filter-list fixtures are REAL `ffmpeg -hide_banner -filters` slices
 * captured on 2026-10-12: the ffmpeg-full slice contains the `ass` line, the
 * PATH-ffmpeg slice is the same neighbourhood with libass absent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { FFMPEG_FULL } from "../lib/post-process.mjs";
import {
  checkAssBurnCapability,
  ensureAssBurnOrExit,
  filtersIncludeAss,
} from "../lib/ffmpeg-preflight.mjs";

const FULL_FILTERS = `Filters:
  T.. = Timeline support
  .S. = Slice threading
  A = Audio input/output
  V = Video input/output
  N = Dynamic number and/or type of input/output
  | = Source or sink filter
  ------
 .. aselect           A->N       Select audio frames to pass in output.
 .. asplit            A->N       Pass on the audio input to N audio outputs.
 TS asuperpass        A->A       Apply high order Butterworth band-pass filter.
 .. ass               V->V       Render ASS subtitles onto input video using the libass library.
 TS atadenoise        V->V       Apply an Adaptive Temporal Averaging Denoiser.
 .. subtitles         V->V       Render text subtitles onto input video using the libass library.
`;

const PATH_FILTERS = `Filters:
  T.. = Timeline support
  .S. = Slice threading
  A = Audio input/output
  V = Video input/output
  N = Dynamic number and/or type of input/output
  | = Source or sink filter
  ------
 .. aselect           A->N       Select audio frames to pass in output.
 .. asplit            A->N       Pass on the audio input to N audio outputs.
 TS asuperpass        A->A       Apply high order Butterworth band-pass filter.
 TS atadenoise        V->V       Apply an Adaptive Temporal Averaging Denoiser.
 TS bandpass          A->A       Apply a two-pole Butterworth band-pass filter.
`;

describe("filtersIncludeAss (#394)", () => {
  it("finds the ass filter in a real ffmpeg-full filter list", () => {
    expect(filtersIncludeAss(FULL_FILTERS)).toBe(true);
  });

  it("does not match filter names that merely contain 'ass'", () => {
    expect(filtersIncludeAss(PATH_FILTERS)).toBe(false);
    expect(filtersIncludeAss(" TS asuperpass        A->A  band-pass.\n")).toBe(false);
    expect(filtersIncludeAss(" .. allpass           A->A  all-pass.\n")).toBe(false);
  });

  it("anchors on the filter-name column, not the description", () => {
    // A description mentioning ASS without the filter itself must not pass.
    expect(filtersIncludeAss(" .. null              V->V  Render ASS subtitles.\n")).toBe(false);
  });
});

describe("checkAssBurnCapability (#394)", () => {
  it("passes when the consumed binary reports the ass filter", () => {
    const cap = checkAssBurnCapability({
      binary: "/x/ffmpeg-full",
      fileExists: () => true,
      probe: () => ({ status: 0, output: FULL_FILTERS }),
    });
    expect(cap.ok).toBe(true);
    expect(cap.binary).toBe("/x/ffmpeg-full");
  });

  it("fails with reason 'binary' when ffmpeg-full is missing", () => {
    const cap = checkAssBurnCapability({ binary: "/x/ffmpeg-full", fileExists: () => false });
    expect(cap.ok).toBe(false);
    expect(cap.reason).toBe("binary");
    expect(cap.binary).toBe("/x/ffmpeg-full");
  });

  it("fails with reason 'filter' when the binary lacks libass", () => {
    const cap = checkAssBurnCapability({
      binary: "/opt/homebrew/bin/ffmpeg",
      fileExists: () => true,
      probe: () => ({ status: 0, output: PATH_FILTERS }),
    });
    expect(cap.ok).toBe(false);
    expect(cap.reason).toBe("filter");
  });

  it("fails when the binary cannot be executed at all", () => {
    const cap = checkAssBurnCapability({
      binary: "/x/ffmpeg-full",
      fileExists: () => true,
      probe: () => ({ status: null, output: "", error: "spawnSync EACCES" }),
    });
    expect(cap.ok).toBe(false);
    expect(cap.reason).toBe("binary");
  });

  it("fails as 'binary' when the probe itself throws", () => {
    const cap = checkAssBurnCapability({
      binary: "/x/ffmpeg-full",
      fileExists: () => true,
      probe: () => {
        throw new Error("spawnSync EACCES");
      },
    });
    expect(cap.ok).toBe(false);
    expect(cap.reason).toBe("binary");
    expect(cap.detail).toContain("EACCES");
  });

  // The gate only protects the run if it probes the binary the burn consumes
  // (post-process.mjs). A PATH-ffmpeg probe would pass on this machine while
  // the burn fails.
  it("defaults to the binary post-process.mjs consumes", () => {
    const src = readFileSync(new URL("../lib/ffmpeg-preflight.mjs", import.meta.url), "utf8");
    expect(src).toContain('from "./post-process.mjs"');
    const cap = checkAssBurnCapability({
      fileExists: () => true,
      probe: () => ({ status: 0, output: FULL_FILTERS }),
    });
    expect(cap.binary).toBe(FFMPEG_FULL);
  });

  // Real-binary check — skipped on machines without ffmpeg-full (CI).
  it.skipIf(!existsSync(FFMPEG_FULL))("real ffmpeg-full reports the ass filter", () => {
    const cap = checkAssBurnCapability();
    expect(cap.ok).toBe(true);
    expect(cap.binary).toBe(FFMPEG_FULL);
  });

  // The trap this gate exists for, stated as a real measurement: on this
  // machine PATH ffmpeg genuinely lacks libass (2026-10-12) while ffmpeg-full
  // has it. Probing PATH would report "capable" and the burn would still fail.
  // Skipped where PATH ffmpeg does have libass — then there is nothing to be
  // negative about.
  const PATH_FFMPEG = spawnSync("which", ["ffmpeg"], { encoding: "utf8" }).stdout?.trim();
  const pathFilters = PATH_FFMPEG
    ? (spawnSync(PATH_FFMPEG, ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout ?? "")
    : "";
  it.skipIf(!existsSync(FFMPEG_FULL) || !PATH_FFMPEG || filtersIncludeAss(pathFilters))(
    "real PATH ffmpeg without libass fails as 'filter' while the consumed binary passes",
    () => {
      const pathCap = checkAssBurnCapability({ binary: PATH_FFMPEG });
      expect(pathCap.ok).toBe(false);
      expect(pathCap.reason).toBe("filter");
      expect(checkAssBurnCapability().ok).toBe(true);
    },
  );
});

describe("ensureAssBurnOrExit (#394 Step 0.4 hard gate)", () => {
  let logSpy, errSpy, exitSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  const errText = () => errSpy.mock.calls.flat().join(" ");
  const voiced = [{ id: 1, voiceover: "text" }];
  const okCap = { ok: true, reason: null, binary: FFMPEG_FULL, detail: null };

  it("passes on a voiced run when the burn binary has libass", () => {
    const r = ensureAssBurnOrExit({ scenes: voiced, capability: okCap, exit: exitSpy });
    expect(r.ok).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("exits 1 and names the missing binary with the install hint", () => {
    const r = ensureAssBurnOrExit({
      scenes: voiced,
      capability: { ok: false, reason: "binary", binary: FFMPEG_FULL, detail: "not found" },
      exit: exitSpy,
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(r.exited).toBe(true);
    expect(errText()).toContain(FFMPEG_FULL);
    expect(errText()).toContain("brew install ffmpeg-full");
  });

  it("exits 1 and names the missing filter when libass is absent", () => {
    ensureAssBurnOrExit({
      scenes: voiced,
      capability: { ok: false, reason: "filter", binary: FFMPEG_FULL, detail: null },
      exit: exitSpy,
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errText()).toContain("ass");
    expect(errText()).toContain("brew install ffmpeg-full");
  });

  // A visual-only run never burns subtitles, so it must not even spawn the
  // probe. Passing a THUNK (not a pre-computed value) is what makes this
  // observable — an eagerly evaluated default would spawn ffmpeg here.
  it("skips the probe entirely on a visual-only run (no voiceover → no ASS burn)", () => {
    const probe = vi.fn(() => ({ ok: false, reason: "binary", binary: FFMPEG_FULL }));
    const r = ensureAssBurnOrExit({
      scenes: [{ id: 1, texts: { headline: "visual only" } }],
      capability: probe,
      exit: exitSpy,
    });
    expect(probe).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(r.skipped).toBe(true);
    expect(logSpy.mock.calls.flat().join(" ")).toContain("N/A");
  });

  it("resolves the capability on a voiced run", () => {
    const probe = vi.fn(() => okCap);
    const r = ensureAssBurnOrExit({ scenes: voiced, capability: probe, exit: exitSpy });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
  });

  // A gate that exists in lib/ but is never invoked is the #406 failure mode.
  it("main.mjs calls ensureAssBurnOrExit after the ASR gate", () => {
    const src = readFileSync(new URL("../main.mjs", import.meta.url), "utf8");
    const asrAt = src.indexOf("ensureAsrOrExit()");
    const assAt = src.indexOf("ensureAssBurnOrExit(");
    expect(asrAt).toBeGreaterThan(-1);
    expect(assAt).toBeGreaterThan(asrAt);
  });
});
