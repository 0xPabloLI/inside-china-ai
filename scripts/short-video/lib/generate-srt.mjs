/**
 * Generate ASS subtitle file from wav2vec2 alignment data + scene durations.
 *
 * Fixes (2026-08-06):
 * - Removed \, comma escaping — commas in ASS Text field (last field) don't need
 *   escaping; \, is not a standard ASS escape and libass renders it as literal "\,"
 * - Pixel-width-based chunking: splits chunks that exceed 950px (approx 38 chars
 *   at 42px Helvetica Neue Bold)
 * - Overlap prevention: clamps each subtitle's start to max(prev_end, natural_start)
 * - Gap-aware timing: extends subtitle end to next_start - 0.1s only when gap > 0
 * - Minimum duration enforcement: 0.8s per cue
 * - WrapStyle: 0 (smart wrapping) instead of 2 (no wrapping) as safety net
 */

import { writeFileSync } from "fs";

// ── Constants ──
const START_OFFSET = -0.3; // Subtitles appear 0.3s before audio
const MIN_DURATION = 0.8; // Minimum display time per subtitle
const GAP_PADDING = 0.1; // Gap between consecutive subtitles
const MAX_CHARS = 38; // Max chars per line (950px / ~25px avg char width)
const SCENE_BUFFER = 0.5; // Recording buffer added per scene

// ASS style parameters
const FONT_SIZE = 42;
const MARGIN_L = 65;
const MARGIN_R = 65;
const MARGIN_V = 450;

export function generateSRT(timingData, sceneDurations, outputPath) {
  if (!timingData || timingData.length === 0) return null;

  const subtitles = [];
  let sceneOffset = 0;

  for (const scene of timingData) {
    const sceneId = scene.sceneId;
    const sceneDur = sceneDurations.find((s) => s.sceneId === sceneId)?.duration || 0;

    for (const seg of scene.segments || []) {
      const startAbs = Math.max(sceneOffset + seg.start + START_OFFSET, 0);
      const endAbs = sceneOffset + Math.min(seg.end, sceneDur);

      // Split by pixel width (char count proxy)
      const chunks = splitByWidth(seg.text, startAbs, endAbs);

      for (const chunk of chunks) {
        // Enforce minimum duration
        const dur = chunk.end - chunk.start;
        if (dur < MIN_DURATION) {
          chunk.end = chunk.start + MIN_DURATION;
        }
        subtitles.push(chunk);
      }
    }
    sceneOffset += sceneDur + SCENE_BUFFER;
  }

  // Sort by start time
  subtitles.sort((a, b) => a.start - b.start);

  // ── Fix overlaps: clamp start to previous subtitle's end ──
  for (let i = 1; i < subtitles.length; i++) {
    if (subtitles[i].start < subtitles[i - 1].end) {
      subtitles[i].start = subtitles[i - 1].end;
    }
  }

  // ── Gap-fill: extend each subtitle to just before next start ──
  for (let i = 0; i < subtitles.length - 1; i++) {
    const nextStart = subtitles[i + 1].start;
    if (nextStart > subtitles[i].end + GAP_PADDING) {
      subtitles[i].end = nextStart - GAP_PADDING;
    }
  }

  // ── Generate ASS file ──
  const assPath = outputPath.replace(/\.srt$/, ".ass");
  let ass = "[Script Info]\n";
  ass += "ScriptType: v4.00+\n";
  ass += "PlayResX: 1080\n";
  ass += "PlayResY: 1920\n";
  ass += "WrapStyle: 0\n\n"; // 0 = smart wrapping (safety net for long lines)
  ass += "[V4+ Styles]\n";
  ass += "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n";
  ass += `Style: Default,Helvetica Neue,${FONT_SIZE},&H00F5F5F5,&H000000FF,&H66000000,&H66000000,1,0,0,0,100,100,0,0,1,3,1,2,${MARGIN_L},${MARGIN_R},${MARGIN_V},1\n\n`;
  ass += "[Events]\n";
  ass += "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n";

  for (const sub of subtitles) {
    // Text is the last field — commas don't need escaping in ASS
    // Only escape characters that are special in ASS: { } \
    const safeText = sub.text
      .replace(/\\/g, "\\\\")  // Escape literal backslashes
      .replace(/\{/g, "\\{")   // Escape opening brace
      .replace(/\}/g, "\\}");  // Escape closing brace
    ass += `Dialogue: 0,${formatASSTime(sub.start)},${formatASSTime(sub.end)},Default,,0,0,0,,${safeText}\n`;
  }

  writeFileSync(assPath, ass, "utf8");
  console.log(`  📝 ASS generated: ${subtitles.length} cues → ${assPath}`);
  return assPath;
}

/**
 * Split text into subtitle chunks that fit within MAX_CHARS.
 * Distributes timing proportionally based on word count.
 */
function splitByWidth(text, startAbs, endAbs) {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  // Group words into chunks that fit within MAX_CHARS
  const chunks = [];
  let currentWords = [];
  let currentLen = 0;

  for (const word of words) {
    const wordLen = word.length + (currentWords.length > 0 ? 1 : 0); // +1 for space
    if (currentLen + wordLen > MAX_CHARS && currentWords.length > 0) {
      // Flush current chunk
      chunks.push(currentWords);
      currentWords = [word];
      currentLen = word.length;
    } else {
      currentWords.push(word);
      currentLen += wordLen;
    }
  }
  if (currentWords.length > 0) {
    chunks.push(currentWords);
  }

  // Distribute timing proportionally
  const totalWords = words.length;
  const segDur = endAbs - startAbs;
  const timePerWord = segDur / totalWords;

  const result = [];
  let wordIdx = 0;
  for (const chunkWords of chunks) {
    const chunkStart = startAbs + wordIdx * timePerWord;
    wordIdx += chunkWords.length;
    const chunkEnd = startAbs + wordIdx * timePerWord;
    result.push({
      start: chunkStart,
      end: Math.max(chunkEnd, chunkStart + MIN_DURATION),
      text: chunkWords.join(" "),
    });
  }

  return result;
}

function formatASSTime(seconds) {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
