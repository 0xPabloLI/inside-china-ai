/**
 * Sentence / clause boundary predicates for subtitle pagination (#746).
 *
 * Split out of `cues.mjs` so the token classification has its own test seam:
 * the splitter only needs two questions answered — "does this token end a
 * sentence?" (mandatory flush) and "may the line break here?" (fallback).
 *
 * Sentence ends: `.` `!` `?`. A colon or semicolon is NOT a sentence end — it
 * introduces the rest of the clause, so the line keeps flowing through it
 * (real corpus: 33 distinct tokens end in `:`/`;` and the old `/[.!?:;]$/`
 * flushed a chunk on every one). A period still ends a sentence after a
 * number ("and 4.7.", "since 2019."), so the upstream source's BARE_NUMBER
 * class is deliberately not implemented; only abbreviation, single-initial and
 * dotted-acronym periods are withheld.
 *
 * The abbreviation set is intentionally small: it holds only forms whose
 * trailing period never ends a sentence in practice. "no." is excluded even
 * though `No.` is a conventional abbreviation, because the bare word "no" plus
 * a period is a sentence end far more often than "No. 5" is.
 */

const STRONG_END = /[!?]$/;
const PERIOD = /\.$/;

/** Abbreviations whose trailing period does not end a sentence. */
const ABBREVIATIONS = new Set([
  "dr.",
  "mr.",
  "mrs.",
  "ms.",
  "prof.",
  "st.",
  "vs.",
  "etc.",
  "fig.",
  "inc.",
  "ltd.",
  "corp.",
  "jr.",
  "sr.",
  "u.s.",
  "u.k.",
  "e.u.",
  "a.m.",
  "p.m.",
  "i.e.",
  "e.g.",
]);

/** A dotted acronym without its final period: "u.s", "e.u", "a.i". */
const DOTTED_ACRONYM = /^(?:[a-z]\.)+$/i;
/** A single-letter initial: "J". */
const SINGLE_INITIAL = /^[a-z]$/i;

/**
 * Does this token end its sentence — i.e. must the current chunk flush?
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isSentenceEnd(text) {
  const token = String(text ?? "").trim();
  if (!token) return false;
  if (STRONG_END.test(token)) return true;
  if (!PERIOD.test(token)) return false;

  const core = token.slice(0, -1);
  if (ABBREVIATIONS.has(token.toLowerCase())) return false;
  if (SINGLE_INITIAL.test(core)) return false;
  if (DOTTED_ACRONYM.test(core)) return false;
  return true;
}

/**
 * May the line break after this token?
 *
 * Clause punctuation (`,` `;` `:`) and sentence terminators all qualify; the
 * splitter uses this to back off to the nearest clause boundary when a limit
 * forces a break, instead of cutting mid-phrase.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isClauseBreak(text) {
  const token = String(text ?? "").trim();
  if (!token) return false;
  return /[,;:]$/.test(token) || PERIOD.test(token) || STRONG_END.test(token);
}
