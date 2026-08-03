/**
 * Generate SRT subtitle file from wav2vec2 alignment data + scene durations.
 * Converts per-scene relative timestamps to absolute timestamps across the full video.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * @param {Array} timingData - subtitle-timing.json [{sceneId, segments: [{text, start, end, words}]}]
 * @param {Array} sceneDurations - [{sceneId, duration}]
 * @param {string} outputPath - path to write SRT file
 * @returns {string} SRT file path
 */
export function generateSRT(timingData, sceneDurations, outputPath) {
  if (!timingData || timingData.length === 0) return null;

  const subtitles = [];
  let sceneOffset = 0;

  for (const scene of timingData) {
    const sceneId = scene.sceneId;
    const sceneDur = sceneDurations.find((s) => s.sceneId === sceneId)?.duration || 0;

    for (const seg of scene.segments || []) {
      const startAbs = sceneOffset + seg.start;
      const endAbs = sceneOffset + Math.min(seg.end, sceneDur);
      // Split long segments (>7 words) into smaller chunks
      const words = seg.text.split(/\s+/);
      if (words.length <= 7) {
        subtitles.push({
          start: startAbs,
          end: endAbs,
          text: seg.text,
        });
      } else {
        // Split into 3-7 word chunks
        const subChunks = Math.ceil(words.length / 5);
        const wordsPerChunk = Math.ceil(words.length / subChunks);
        const segDur = endAbs - startAbs;
        const timePerWord = segDur / words.length;
        for (let i = 0; i < words.length; i += wordsPerChunk) {
          const chunkWords = words.slice(i, i + wordsPerChunk);
          const chunkStart = startAbs + i * timePerWord;
          const chunkEnd = startAbs + Math.min(i + wordsPerChunk, words.length) * timePerWord;
          subtitles.push({
            start: chunkStart,
            end: Math.max(chunkEnd, chunkStart + 0.5),
            text: chunkWords.join(" "),
          });
        }
      }
    }
    // 0.5s buffer between scenes (matches Playwright recording buffer)
    sceneOffset += sceneDur + 0.5;
  }

  // Sort by start time
  subtitles.sort((a, b) => a.start - b.start);

  // Extend each subtitle to next subtitle's start (gap-fill)
  for (let i = 0; i < subtitles.length - 1; i++) {
    const nextStart = subtitles[i + 1].start;
    if (nextStart > subtitles[i].end) {
      subtitles[i].end = nextStart - 0.1;
    }
  }

  // Generate SRT format
  const srt = subtitles
    .map((sub, i) => {
      return `${i + 1}\n${formatSRTTime(sub.start)} --> ${formatSRTTime(sub.end)}\n${sub.text}\n`;
    })
    .join("\n");

  writeFileSync(outputPath, srt, "utf8");
  console.log(`  📝 SRT generated: ${subtitles.length} cues → ${outputPath}`);
  return outputPath;
}

function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
