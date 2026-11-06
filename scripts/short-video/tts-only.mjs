#!/usr/bin/env node
/**
 * TTS-only driver — 只跑 Step 1（语音生成 + 对齐 + 质量门禁），不渲染。
 * 用于：① 诊断引擎速度；② 预生成音频缓存（后续 full pipeline 复用）。
 *
 * Usage:
 *   node scripts/short-video/tts-only.mjs --content deepseek-deepinfer
 *   TTS_ENGINE=cosyvoice3-mlx node scripts/short-video/tts-only.mjs --content deepseek-deepinfer
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const ci = args.indexOf("--content");
const contentDir = ci >= 0 ? args[ci + 1] : null;
if (!contentDir) {
  console.error("usage: tts-only.mjs --content <dir>");
  process.exit(1);
}

const metaMod = await import(`./content/${contentDir}/meta.mjs`);
const dataMod = await import(`./content/${contentDir}/scene-data.mjs`);
const meta = metaMod.meta;
const scenes = dataMod.scenes;
if (!Array.isArray(scenes) || scenes.length === 0) {
  console.error(`no scenes in content/${contentDir}/scene-data.mjs`);
  process.exit(1);
}
console.log(`loaded ${scenes.length} scenes from content/${contentDir}`);

// 与 main.mjs Step 0.5/0.6 一致的前处理（否则缓存 key 与 full run 不一致）
try {
  const { normalizeSceneData } = await import("./lib/normalize-currency.mjs");
  normalizeSceneData(scenes, meta);
} catch (e) {
  console.warn(`currency normalize skipped: ${e.message}`);
}
try {
  const { normalizeTtsText } = await import("./lib/normalize-tts-text.mjs");
  normalizeTtsText(scenes, meta);
} catch (e) {
  console.warn(`tts-text normalize skipped: ${e.message}`);
}

const { generateTTS } = await import("./lib/tts/registry.mjs");
const outputDir = join(__dirname, "output", contentDir, "audio");
const t0 = Date.now();
const results = await generateTTS(scenes, outputDir);
const ms = Date.now() - t0;

console.log(`\n=== TTS done in ${(ms / 1000).toFixed(1)}s ===`);
for (const r of results) {
  const id = r.sceneId ?? r.id ?? "?";
  const dur = typeof r.duration === "number" ? r.duration.toFixed(2) : r.duration;
  console.log(`  scene ${id}: dur=${dur}s status=${r.status ?? "?"}`);
}
