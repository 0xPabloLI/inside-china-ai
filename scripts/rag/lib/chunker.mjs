/**
 * Chunker — splits content into embeddable chunks.
 *
 * Two strategies:
 * - Markdown: split by ## headings; sub-split by paragraph if > 8K tokens (Q4)
 * - Scene-data: one chunk per scene, text = voiceover + visual texts (Q12)
 *
 * Spec: docs/spec-rag.md §4.2
 */

// bge-m3 context window = 8192 tokens
export const MAX_TOKENS = 8192;

/**
 * Approximate token count from text length.
 * Uses the standard 4-chars-per-token heuristic.
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Chunk shape.
 * @typedef {Object} Chunk
 * @property {string} sourceId - Article slug / file path / widget ID
 * @property {number} chunkIndex - Sequential index within the source
 * @property {string} text - The text to embed
 * @property {string|null} title - Section heading or scene name
 */

/**
 * Split a markdown document by ## headings.
 *
 * Rules:
 * - Each ## section becomes one chunk (Q4, Q7)
 * - If a section exceeds MAX_TOKENS, sub-split by paragraph (Scenario #5)
 * - No ## headings → whole file = one chunk with title=null (Scenario #6)
 * - ### and deeper headings are NOT split points — they stay within their ## section
 *
 * @param {string} text - Full markdown text
 * @param {string} sourceId - Source identifier for the chunks
 * @returns {Chunk[]}
 */
export function chunkMarkdown(text, sourceId) {
  if (!text || !text.trim()) return [];

  // Find all ## heading positions (must be at start of line)
  const lines = text.split("\n");
  const sectionBoundaries = []; // { lineIndex, title }

  for (let i = 0; i < lines.length; i++) {
    // ## heading: starts with "## " but NOT "### "
    if (lines[i].startsWith("## ") && !lines[i].startsWith("### ")) {
      const title = lines[i].slice(3).trim();
      sectionBoundaries.push({ lineIndex: i, title });
    }
  }

  // No ## headings → whole file is one chunk
  if (sectionBoundaries.length === 0) {
    const fullText = text.trim();
    if (!fullText) return [];
    return [{ sourceId, chunkIndex: 0, text: fullText, title: null }];
  }

  // Build sections from boundaries
  const sections = [];
  for (let i = 0; i < sectionBoundaries.length; i++) {
    const start = sectionBoundaries[i].lineIndex;
    const end =
      i + 1 < sectionBoundaries.length ? sectionBoundaries[i + 1].lineIndex : lines.length;

    const sectionLines = lines.slice(start, end);
    const sectionText = sectionLines.join("\n").trim();

    if (sectionText) {
      sections.push({
        title: sectionBoundaries[i].title,
        text: sectionText,
      });
    }
  }

  // Assign chunks with sub-splitting if needed
  const chunks = [];
  let chunkIdx = 0;

  for (const section of sections) {
    if (estimateTokens(section.text) <= MAX_TOKENS) {
      chunks.push({
        sourceId,
        chunkIndex: chunkIdx,
        text: section.text,
        title: section.title,
      });
      chunkIdx++;
    } else {
      // Sub-split by paragraph (double newline)
      const paragraphs = section.text.split(/\n\n+/).filter((p) => p.trim());
      let currentParaGroup = [];

      for (const para of paragraphs) {
        const candidateText = [...currentParaGroup, para].join("\n\n");

        if (estimateTokens(candidateText) > MAX_TOKENS && currentParaGroup.length > 0) {
          // Flush current group
          chunks.push({
            sourceId,
            chunkIndex: chunkIdx,
            text: currentParaGroup.join("\n\n"),
            title: section.title,
          });
          chunkIdx++;
          currentParaGroup = [para];
        } else {
          currentParaGroup.push(para);
        }
      }

      // Flush remaining
      if (currentParaGroup.length > 0) {
        chunks.push({
          sourceId,
          chunkIndex: chunkIdx,
          text: currentParaGroup.join("\n\n"),
          title: section.title,
        });
        chunkIdx++;
      }
    }
  }

  return chunks;
}

/**
 * Extract all string values from a scene's `texts` object.
 * Recursively traverses arrays and nested objects.
 *
 * @param {Object|undefined} texts
 * @returns {string[]}
 */
function extractVisualTexts(texts) {
  if (!texts || typeof texts !== "object") return [];

  const result = [];

  function collect(val) {
    if (typeof val === "string" && val.trim()) {
      result.push(val.trim());
    } else if (Array.isArray(val)) {
      for (const item of val) collect(item);
    } else if (val && typeof val === "object") {
      for (const v of Object.values(val)) collect(v);
    }
  }

  collect(texts);
  return result;
}

/**
 * Chunk scene-data: one chunk per scene.
 *
 * Rules:
 * - Chunk text = voiceover + visual texts (Q12)
 * - Skip scenes with empty/null/undefined voiceover (Scenario #7)
 * - Chunk title = scene name
 *
 * @param {Array} scenes - Array of scene objects
 * @param {Object} meta - Scene-data meta.mjs object (unused in chunking, reserved for caller)
 * @param {string} sourceId - Source identifier
 * @returns {Chunk[]}
 */
export function chunkSceneData(scenes, meta, sourceId) {
  if (!scenes || !Array.isArray(scenes)) return [];

  const chunks = [];
  let chunkIdx = 0;

  for (const scene of scenes) {
    const voiceover = scene?.voiceover;
    if (!voiceover || typeof voiceover !== "string" || !voiceover.trim()) {
      // Scenario #7: skip empty voiceover scenes
      continue;
    }

    const visualTexts = extractVisualTexts(scene.texts);
    const text =
      visualTexts.length > 0 ? `${voiceover}\n\nVisual: ${visualTexts.join(" | ")}` : voiceover;

    chunks.push({
      sourceId,
      chunkIndex: chunkIdx,
      text,
      title: scene.name || `Scene ${scene.id}`,
    });
    chunkIdx++;
  }

  return chunks;
}
