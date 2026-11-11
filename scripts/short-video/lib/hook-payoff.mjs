/**
 * Hook payoff — does the hook's opening picture show what its copy promises?
 *
 * Why this exists (#1206): every hook gate in this repo judges LAYOUT — safe
 * zones, contrast, media presence, the text contract, duration. None of them
 * reads the promise the hook makes (on-screen claim + voiceover) against the
 * picture underneath it. The 2026-10-25 cut shipped `IT LIFTS A CAR.` over
 * footage of a night rescue segment; every automated gate passed, and the
 * defect was caught by a human reading extracted frames.
 *
 * This module is the pure half: claim extraction, first-frame classification
 * and verdict assembly. verify-hook-payoff.mjs owns ffmpeg, PNG decoding and
 * the optional VLM call.
 *
 * THE DEFAULT IS WARN, NOT FAIL. A CSS-only hook (`media: null`) is a legal,
 * declared choice — checkHookMediaContract already warns about it. The defect
 * this check names is the SILENT one: copy promising a payoff the picture never
 * shows. `strict` turns the two hard findings into fails for callers that opt
 * in (a pre-publish run), so an experiment can never fail a legitimate hook by
 * default.
 *
 * @module hook-payoff
 */

import { BLACK_THRESHOLD, BRIGHT_THRESHOLD, SAMPLE_STEP, luminance } from "./frame-analysis.mjs";
import { SAFE_ZONES } from "./safe-zones.mjs";

// ─── Constants ───

/**
 * Sample times (seconds) inside the hook. Frame 0 is the literal first frame —
 * the one the viewer sees before any entrance animation settles. 0.5 / 1 / 2
 * answer "did the footage arrive, and when?" without sampling past the hook's
 * own ~4s scene.
 */
export const HOOK_SAMPLE_TIMES_SEC = [0, 0.5, 1, 2];

/**
 * The renderer's own fade-in beat. Every hook in this repo starts with the
 * media at 0 opacity and the copy already on screen, so frame 0 reads as a
 * text card on BOTH good and bad renders (measured 2026-11-11 on the unitree
 * and qwen4 renders: identical card-at-0s / picture-at-0.5s signature). Copy
 * that holds the frame past this beat is a real finding; the 0.5s beat is not.
 */
const FADE_IN_BEAT_SEC = 0.5;

/**
 * Pixels above this luminance count as "ink" (picture or type) rather than the
 * canvas background (#0a0a14 → luminance ≈ 13). 40 sits above the background
 * gradient and the dimming scrims at their lightest, and below any real
 * picture or text glyph.
 */
const INK_THRESHOLD = 40;

/**
 * Ink coverage that separates a picture from a text card. Measured on real
 * renders (docs: lib/frame-analysis.mjs and unitree's scene-data): a row of
 * 78px type covers 18-26% of the band width, a picture row 48-86%. 0.35 sits
 * between them.
 */
const PICTURE_INK_COVERAGE = 0.35;

/**
 * Bright-pixel ratio above which a frame is a text card rather than flat
 * background. Type is luminance > 100; the grid/glow/scanline layers stay
 * below 60, so they do not register here.
 */
const CARD_BRIGHT_RATIO = 0.005;

/** Truncate a claim for one-line reports. */
const DETAIL_MAX_CHARS = 90;

// ─── Claim ───

const clean = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * Build the hook's promise from the scene it was authored as.
 *
 * Scene 1 carries exactly ONE focal (checkHookContract): a claim-led hook
 * prints `hookText` + `revealText`, a number-led one prints `bigNumber` +
 * `numberLabel`. Both are promises — "IT LIFTS A CAR" and "9 / 11 BENCHMARKS
 * WON" say what the viewer is about to see — so both feed the check. The
 * voiceover is the spoken statement and the fallback when nothing is printed.
 *
 * @param {object|null} scene - the hook scene (scenes[0])
 * @returns {{hookText: string, revealText: string, bigNumber: string,
 *   numberLabel: string, voiceover: string, promise: string,
 *   assetNeed: string, isEmpty: boolean}}
 */
export function buildHookClaim(scene) {
  const texts = scene?.texts || {};
  const hookText = clean(texts.hookText);
  const revealText = clean(texts.revealText);
  const bigNumber = clean(texts.bigNumber);
  const numberLabel = clean(texts.numberLabel);
  const voiceover = clean(scene?.voiceover);
  const claimLed = !!(hookText || revealText);
  const printed = claimLed
    ? [hookText, revealText]
        .filter(Boolean)
        .map((line) => (/[.!?]$/.test(line) ? line : `${line}.`))
        .join(" ")
    : [bigNumber, numberLabel].filter(Boolean).join(" ");
  const promise = printed || voiceover;
  return {
    hookText,
    revealText,
    bigNumber,
    numberLabel,
    voiceover,
    promise,
    // The VLM claim contract is {voiceover, assetNeed}; the promise is what the
    // picture must depict, the voiceover supplies the spoken context.
    assetNeed: promise,
    isEmpty: !promise && !voiceover,
  };
}

// ─── Frame classification ───

/**
 * @typedef {Object} PixelBuffer
 * @property {Uint8Array} data - RGBA pixel data (4 bytes per pixel)
 * @property {number} width
 * @property {number} height
 */

/**
 * Classify one hook frame by what occupies the content band.
 *
 *   "black"   — no picture and no type (render failure / fade-out)
 *   "picture" — the band is mostly footage
 *   "card"    — type over a flat background (a CSS-only hook, or the opening
 *               beat of a hook whose footage has not faded in yet)
 *   "flat"    — empty background, no type
 *
 * Sampling is limited to the content band: the brand bar, watermark and frame
 * glow all sit outside it, and the hook's claim always sits inside it.
 *
 * @param {PixelBuffer} buf
 * @param {{top: number, right: number, bottom: number, left: number}} [safeZones]
 * @returns {{kind: "black"|"picture"|"card"|"flat"|"unknown",
 *   metrics: {blackRatio: number, brightRatio: number, inkCoverage: number, samples: number}}}
 */
export function analyzeHookFrame(buf, safeZones = SAFE_ZONES) {
  const xStart = Math.max(0, safeZones.left);
  const xEnd = Math.min(buf.width, buf.width - safeZones.right);
  const yStart = Math.max(0, safeZones.top);
  const yEnd = Math.min(buf.height, buf.height - safeZones.bottom);

  let total = 0;
  let black = 0;
  let bright = 0;
  let ink = 0;
  for (let y = yStart; y < yEnd; y += SAMPLE_STEP) {
    for (let x = xStart; x < xEnd; x += SAMPLE_STEP) {
      const idx = (buf.width * y + x) * 4;
      const lum = luminance(buf.data[idx], buf.data[idx + 1], buf.data[idx + 2]);
      if (lum < BLACK_THRESHOLD) black++;
      if (lum > BRIGHT_THRESHOLD) bright++;
      if (lum > INK_THRESHOLD) ink++;
      total++;
    }
  }

  const metrics = {
    blackRatio: total > 0 ? black / total : 0,
    brightRatio: total > 0 ? bright / total : 0,
    inkCoverage: total > 0 ? ink / total : 0,
    samples: total,
  };
  if (total === 0) return { kind: "unknown", metrics };

  let kind = "flat";
  if (metrics.blackRatio >= 0.98) kind = "black";
  else if (metrics.inkCoverage >= PICTURE_INK_COVERAGE) kind = "picture";
  else if (metrics.brightRatio >= CARD_BRIGHT_RATIO) kind = "card";
  return { kind, metrics };
}

// ─── Verdict ───

/**
 * Trim a string to `max` characters for one-line report fields.
 *
 * Shared with cohort-report.mjs so the two reports truncate identically.
 *
 * @param {unknown} text
 * @param {number} [max]
 * @returns {string}
 */
export function truncate(text, max = DETAIL_MAX_CHARS) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatTimes(samples) {
  return samples.map((s) => `${s.t}s`).join(", ");
}

/**
 * Assemble the payoff verdict.
 *
 * @param {object} input
 * @param {Array<{t: number, kind: string, metrics?: object}>} [input.samples]
 * @param {{promise: string, voiceover: string, assetNeed: string,
 *   hookText?: string, revealText?: string}|null} [input.claim]
 * @param {{payoff: "pass"|"partial"|"absent"|null, payoffReason: string|null}|null} [input.semantics]
 *   VLM verdict for the hook window, or null when the semantic pass did not
 *   run (not requested / unavailable).
 * @param {boolean} [input.strict] - promote the two hard findings to "fail"
 * @returns {{level: "pass"|"warn"|"fail", strict: boolean,
 *   checks: Array<{level: string, check: string, detail: string, fix?: string}>,
 *   claim: object|null, samples: Array<object>, semantics: object|null}}
 */
export function evaluateHookPayoff({
  samples = [],
  claim = null,
  semantics = null,
  strict = false,
}) {
  const checks = [];
  const push = (level, check, detail, fix) =>
    checks.push({ level, check, detail, ...(fix ? { fix } : {}) });

  const sorted = [...samples].sort((a, b) => a.t - b.t);

  // 1. Something to look at.
  if (sorted.length === 0) {
    push(
      "warn",
      "Hook frames extracted",
      "no frames were sampled — the payoff was not judged",
      "Check the video path and that ffmpeg can decode the file",
    );
  } else {
    const pictures = sorted.filter((s) => s.kind === "picture");
    const first = sorted[0];
    const lastT = sorted[sorted.length - 1].t;
    if (pictures.length === 0) {
      push(
        strict ? "fail" : "warn",
        "Hook shows footage",
        `no picture in frames at ${formatTimes(sorted)} — the hook renders type/background only`,
        "Bind a hook clip whose payoff is in frame, or declare media: null deliberately for a CSS-only hook",
      );
    } else if (first.kind !== "picture") {
      const arrivesAt = pictures[0].t;
      const isFadeIn = arrivesAt <= FADE_IN_BEAT_SEC;
      push(
        isFadeIn ? "pass" : "warn",
        "Hook opens on footage",
        isFadeIn
          ? `frame 0 is "${first.kind}" (the renderer's fade-in beat); footage is on screen from ${arrivesAt}s`
          : `frame at ${first.t}s is "${first.kind}"; footage first appears at ${arrivesAt}s — the opening holds on copy`,
        isFadeIn
          ? undefined
          : "Start the hook on the payoff frame (videoStartOffsetMs) so footage is up by 0.5s, or accept that the opening beat is copy",
      );
    } else {
      push(
        "pass",
        "Hook opens on footage",
        `frame at ${first.t}s is picture (${pictures.length}/${sorted.length} sampled frames show picture up to ${lastT}s)`,
      );
    }
  }

  // 2. Something to compare the picture with.
  const hasClaim = !!claim && (!!claim.promise || !!claim.voiceover);
  if (!hasClaim) {
    push(
      "warn",
      "Hook claim readable",
      "hook declares no on-screen claim and no voiceover — nothing to check the picture against",
      "Add texts.hookText (claim-led hook) or a voiceover, so the promise can be scored",
    );
  } else {
    push(
      "pass",
      "Hook claim readable",
      claim.promise
        ? `"${truncate(claim.promise)}"`
        : `voiceover-only: "${truncate(claim.voiceover)}"`,
    );
  }

  // 3. Optional semantic pass — the only check that can see the mismatch the
  //    negative sample has: footage is present, but the promised action is not.
  //    `payoff` is the VLM's action-level verdict (pass | partial | absent);
  //    null/undefined means the pass did not run or the model committed to
  //    nothing, and is reported as unavailable rather than guessed.
  if (semantics) {
    const verdict = semantics.payoff || null;
    const reason = semantics.payoffReason ? ` — ${truncate(semantics.payoffReason)}` : "";
    if (verdict === "pass") {
      push("pass", "Hook picture matches the claim", `payoff shown${reason}`);
    } else if (verdict === "partial") {
      push(
        "warn",
        "Hook picture matches the claim",
        `payoff only partly shown${reason}`,
        "Hold the frame on the promised action long enough to read as the payoff, or move the claim to what the frames show",
      );
    } else if (verdict === "absent") {
      push(
        strict ? "fail" : "warn",
        "Hook picture matches the claim",
        `the opening picture does not show the promised payoff${reason}`,
        "Show the promised action inside the hook, or rewrite the claim to what the first seconds actually show",
      );
    } else {
      push(
        "warn",
        "Hook picture matches the claim",
        "semantic check unavailable (VLM returned no verdict) — the picture was not judged",
        "Re-run with --semantic once the VLM is available; the pixel checks above still stand",
      );
    }
  }

  const level = checks.some((c) => c.level === "fail")
    ? "fail"
    : checks.some((c) => c.level === "warn")
      ? "warn"
      : "pass";

  return { level, strict, checks, claim, samples: sorted, semantics: semantics ?? null };
}

/**
 * Render a verdict as the CLI's report body.
 *
 * @param {ReturnType<typeof evaluateHookPayoff>} result
 * @returns {string}
 */
export function formatHookPayoffReport(result) {
  const icon = { pass: "✅", warn: "⚠️", fail: "❌" };
  const lines = result.checks.map(
    (c) => `  ${icon[c.level]} ${c.check} — ${c.detail}${c.fix ? `\n     → FIX: ${c.fix}` : ""}`,
  );
  const mode = result.strict ? "strict" : "default (warn-only)";
  lines.push(
    "",
    `  Hook payoff: ${result.level.toUpperCase()} — ${mode}; ${result.checks.length} checks`,
  );
  return lines.join("\n");
}
