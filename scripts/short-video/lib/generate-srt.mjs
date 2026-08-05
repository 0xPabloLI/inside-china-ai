/**
 * Generate ASS subtitle file from wav2vec2 alignment data + scene durations.
 * Uses explicit PlayResX=1080, PlayResY=1920 so FontSize/MarginV are in actual pixels.
 */

import { writeFileSync } from "fs";

export function generateSRT(timingData, sceneDurations, outputPath) {
  if (!timingData || timingData.length === 0) return null;

  const subtitles = [];
  let sceneOffset = 0;
  const START_OFFSET = -0.3;

  for (const scene of timingData) {
    const sceneId = scene.sceneId;
    const sceneDur = sceneDurations.find((s) => s.sceneId === sceneId)?.duration || 0;

    for (const seg of scene.segments || []) {
      const startAbs = Math.max(sceneOffset + seg.start + START_OFFSET, 0);
      const endAbs = sceneOffset + Math.min(seg.end, sceneDur);

      const words = seg.text.split(/\s+/);
      if (words.length <= 7) {
        subtitles.push({ start: startAbs, end: endAbs, text: seg.text });
      } else {
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
    sceneOffset += sceneDur + 0.5;
  }

  subtitles.sort((a, b) => a.start - b.start);

  // Gap-fill: extend each subtitle to next subtitle's start
  for (let i = 0; i < subtitles.length - 1; i++) {
    const nextStart = subtitles[i + 1].start;
    if (nextStart > subtitles[i].end) {
      subtitles[i].end = nextStart - 0.1;
    }
  }

  // Generate ASS file with explicit PlayResX=1080, PlayResY=1920
  // This ensures FontSize and MarginV are in actual pixels
  const assPath = outputPath.replace(/\.srt$/, ".ass");
  let ass = "[Script Info]\n";
  ass += "ScriptType: v4.00+\n";
  ass += "PlayResX: 1080\n";
  ass += "PlayResY: 1920\n";
  ass += "WrapStyle: 2\n\n";
  ass += "[V4+ Styles]\n";
  ass += "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n";
  ass += "Style: Default,Helvetica Neue,42,&H00F5F5F5,&H000000FF,&H66000000,&H66000000,1,0,0,0,100,100,0,0,1,3,1,2,65,65,450,1\n\n";
  ass += "[Events]\n";
  ass += "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n";

  for (const sub of subtitles) {
    ass += `Dialogue: 0,${formatASSTime(sub.start)},${formatASSTime(sub.end)},Default,,0,0,0,,${sub.text.replace(/,/g, "\\,")}\n`;
  }

  writeFileSync(assPath, ass, "utf8");
  console.log(`  📝 ASS generated: ${subtitles.length} cues → ${assPath}`);
  return assPath;
}

function formatASSTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
