/**
 * POSIX shell quoting — one value becomes one literal argument.
 *
 * Single quotes around the value, with embedded `'` closed-escaped as `'\''`
 * (the standard sequence). Callers interpolate the result into a command
 * string, so a value carrying `$(...)`, backticks or quotes is read as data
 * and never as shell syntax (#319 OCR video batch scan).
 *
 * Scope: POSIX shell command lines. ffmpeg's concat demuxer has its own
 * list-file quoting (see `concatListEntry` in compile-series.mjs) — the
 * sequence coincides today but the parser is different; keep them separate.
 */

/**
 * @param {unknown} value
 * @returns {string} the value wrapped in single quotes, safe to interpolate
 */
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
