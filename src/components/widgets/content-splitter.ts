export type ContentSegment =
  { type: "markdown"; content: string } | { type: "widget"; name: string };

/**
 * Split markdown content by `<!-- widget:xxx -->` markers into alternating
 * markdown and widget segments.
 *
 * - Markdown segments preserve the original text (trimmed of surrounding
 *   whitespace that is purely structural around the marker).
 * - Widget segments contain the widget name extracted from the marker.
 * - Unknown widget names are preserved as-is (validation happens at render time).
 * - Content with no markers returns a single markdown segment.
 * - Empty markdown segments are preserved (for markers at start/end).
 */
export function splitContent(content: string): ContentSegment[] {
  if (!content) return [{ type: "markdown", content: "" }];

  const pattern = /<!--\s*widget:(\S+)\s*-->/g;
  const segments: ContentSegment[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index);
    segments.push({ type: "markdown", content: before.trim() });
    segments.push({ type: "widget", name: match[1] });
    lastIndex = pattern.lastIndex;
  }

  const after = content.slice(lastIndex);
  segments.push({ type: "markdown", content: after.trim() });

  return segments;
}
