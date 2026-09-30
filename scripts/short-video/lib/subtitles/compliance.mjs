/**
 * Subtitle compliance gate (#415 ②) — Netflix Timed Text Style Guide limits.
 *
 * `cues.mjs` already guarantees timing shape (0.8 s minimum, 2-frame chain
 * gaps) and single-line widths (HARD_PX), but nothing ever checked the two
 * numbers Netflix actually publishes: reading speed (20 CPS adult / 17 CPS
 * children) and 42 characters per line over at most 2 lines.
 *
 * The gate measures what reaches the screen — ASS override tags stripped —
 * and works on either `buildCues()` output or `parseAss()` output, so the same
 * checker covers the pre-render path and a post-hoc audit of subtitles.ass.
 *
 * CPS convention: characters *including spaces*, divided by the cue's on-screen
 * duration (Subtitle Edit / Netflix practice). A zero-duration cue measures as
 * Infinity rather than 0 so it can never slip through as compliant.
 *
 * @module subtitles/compliance
 */

/** Maximum characters per second, adult content (Netflix). */
export const MAX_CPS = 20;
/** Maximum characters per second, children's content (Netflix). */
export const MAX_CPS_CHILD = 17;
/** Maximum characters in any single line (Netflix). */
export const MAX_CPL = 42;
/** Maximum lines per cue (Netflix). */
export const MAX_LINES = 2;

/**
 * `{...}` override / karaoke blocks. Escape-aware: `\{` / `\}` inside the
 * block (escapeText output) must not be mistaken for delimiters.
 */
const ASS_TAG = /\{(?:\\.|[^}\\])*\}/g;
/** libass hard line break. */
const ASS_BREAK = /\\N/g;
/** Escaped literal backslash / brace (see ass.mjs escapeText). */
const ASS_ESCAPE = /\\([\\{}])/g;

/**
 * Strip ASS markup down to what a viewer reads.
 *
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function visibleText(text) {
  return String(text ?? "")
    .replace(ASS_TAG, "")
    .replace(ASS_BREAK, "\n")
    .replace(ASS_ESCAPE, "$1");
}

/**
 * Measure one cue against the reading-speed / width dimensions.
 *
 * @param {{start?: number, end?: number, text?: string}} cue
 * @returns {{chars: number, duration: number, cps: number, lines: number, cpl: number}}
 */
export function cueMetrics(cue) {
  const text = visibleText(cue?.text ?? "");
  const lines = text.split("\n");
  // Line breaks are not displayed characters: counting the "\n" that `\N`
  // became would over-count every multi-line cue by one per break and can
  // falsely flag a borderline cue as over the CPS limit.
  const chars = [...text.replace(/\n/g, "")].length;
  const duration = Math.max(0, (cue?.end ?? 0) - (cue?.start ?? 0));
  return {
    chars,
    duration,
    cps: duration > 0 ? chars / duration : Infinity,
    lines: lines.length,
    cpl: Math.max(0, ...lines.map((line) => [...line].length)),
  };
}

/**
 * Check a cue list against the Netflix limits.
 *
 * @param {Array<{start?: number, end?: number, text?: string}>} cues
 * @param {{maxCps?: number, maxCpl?: number, maxLines?: number}} [options]
 * @returns {{ok: boolean, checked: number, violations: Array, metrics: {maxCps: number, maxCpl: number, maxLines: number}}}
 */
export function checkCueCompliance(cues, options = {}) {
  const maxCps = options.maxCps ?? MAX_CPS;
  const maxCpl = options.maxCpl ?? MAX_CPL;
  const maxLines = options.maxLines ?? MAX_LINES;
  const list = cues ?? [];
  const violations = [];
  let seenCps = 0;
  let seenCpl = 0;
  let seenLines = 0;

  list.forEach((cue, index) => {
    const m = cueMetrics(cue);
    const text = visibleText(cue?.text ?? "");
    seenCps = Math.max(seenCps, m.cps);
    seenCpl = Math.max(seenCpl, m.cpl);
    seenLines = Math.max(seenLines, m.lines);
    if (m.cps > maxCps) {
      violations.push({ index, code: "cps", value: m.cps, limit: maxCps, text });
    }
    if (m.cpl > maxCpl) {
      violations.push({ index, code: "cpl", value: m.cpl, limit: maxCpl, text });
    }
    if (m.lines > maxLines) {
      violations.push({ index, code: "lines", value: m.lines, limit: maxLines, text });
    }
  });

  return {
    ok: violations.length === 0,
    checked: list.length,
    violations,
    metrics: { maxCps: seenCps, maxCpl: seenCpl, maxLines: seenLines },
  };
}

/**
 * Human-readable one-line-per-violation report.
 *
 * @param {{violations: Array, metrics: object, checked: number}} report
 * @returns {string}
 */
export function formatComplianceReport(report) {
  const { violations = [], metrics = {}, checked = 0 } = report ?? {};
  const head =
    `subtitle compliance: ${violations.length} violation(s) over ${checked} cue(s) ` +
    `(max ${metrics.maxCps?.toFixed?.(1) ?? "?"} CPS, ${metrics.maxCpl ?? "?"} CPL, ${metrics.maxLines ?? "?"} line(s))`;
  const lines = violations.map(
    (v) =>
      `  - cue ${v.index}: ${v.code} ${Number.isFinite(v.value) ? v.value.toFixed(1) : v.value} ` +
      `> limit ${v.limit} — "${v.text.replace(/\n/g, "\\n").slice(0, 60)}"`,
  );
  return [head, ...lines].join("\n");
}

/**
 * Throwing variant for strict gates.
 *
 * @param {Array} cues
 * @param {object} [options]
 * @returns {object} the report (when compliant)
 * @throws {Error} with the formatted violation list
 */
export function assertCueCompliance(cues, options = {}) {
  const report = checkCueCompliance(cues, options);
  if (!report.ok) {
    throw new Error(`Subtitle compliance gate failed\n${formatComplianceReport(report)}`);
  }
  return report;
}
