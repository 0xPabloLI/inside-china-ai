/**
 * Text-level helpers for the Markdown editor.
 *
 * Kept out of the component so the insertion rules are unit-testable without a
 * DOM (#319 OCR components scan).
 */

export interface BlockInsertion {
  /** The whole document after the insertion. */
  text: string;
  /** Where the caret belongs after the insertion. */
  cursor: number;
}

/**
 * Insert a standalone Markdown block (`---`, a fenced code block, a widget
 * marker) at the caret, keeping the block on its own lines.
 *
 * A block glued to the surrounding text is not the block the user asked for:
 * `---` mid-line produced `---text`, and `line1\n---` parses as a setext
 * heading rather than a rule (#319 OCR components scan).
 */
export function insertBlockAt(value: string, cursor: number, block: string): BlockInsertion {
  const at = Math.max(0, Math.min(cursor, value.length));
  const before = value.slice(0, at);
  const after = value.slice(at);

  const prefix =
    before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after === "" || after.startsWith("\n") ? "" : "\n\n";

  return {
    text: `${before}${prefix}${block}${suffix}${after}`,
    cursor: before.length + prefix.length + block.length,
  };
}

/**
 * Escape a file name (or any label) for use as Markdown link text, so a name
 * containing `]` cannot break the `[name](url)` link (#319 OCR components scan).
 */
export function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}
