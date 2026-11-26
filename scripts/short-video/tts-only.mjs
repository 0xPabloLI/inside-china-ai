#!/usr/bin/env node
/**
 * TTS-only driver — 只跑 Step 1（语音生成 + 对齐 + 质量门禁），不渲染。
 * 用于：① 诊断引擎速度；② 预生成音频缓存（后续 full pipeline 复用）；
 * ③ `--run` 直接产出一个自包含 run 目录，供 `render-only --run` 在干净机器复现（#1528）。
 *
 * Usage:
 *   node scripts/short-video/tts-only.mjs --content deepseek
 *   node scripts/short-video/tts-only.mjs --content deepseek --run
 *   TTS_ENGINE=cosyvoice3-mlx node scripts/short-video/tts-only.mjs --content deepseek
 *
 * `--run` 的 run 状态停在 running（未出片），不移动 latest；渲染时显式
 * `render-only --content <id> --run <runId>`。
 */
import { dirname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const ci = args.indexOf("--content");
const contentDir = ci >= 0 ? args[ci + 1] : null;
if (!contentDir) {
  console.error("usage: tts-only.mjs --content <dir> [--run] [--run-id <id>]");
  process.exit(1);
}
const withRun = args.includes("--run");
const ri = args.indexOf("--run-id");
const runId = ri >= 0 ? args[ri + 1] : null;

const metaMod = await import(`./content/${contentDir}/meta.mjs`);
const dataMod = await import(`./content/${contentDir}/scene-data.mjs`);
const meta = metaMod.meta;
const scenes = dataMod.scenes;
if (!Array.isArray(scenes) || scenes.length === 0) {
  console.error(`no scenes in content/${contentDir}/scene-data.mjs`);
  process.exit(1);
}
console.log(`loaded ${scenes.length} scenes from content/${contentDir}`);

const pipelineId = meta.pipelineId ?? contentDir;
const { runTtsOnly, markTtsRunFailed } = await import("./lib/tts-only-run.mjs");
const { generateTTS } = await import("./lib/tts/registry.mjs");

// runTtsOnly allocates the run before TTS; the exit hook records a failure
// against that id instead of letting a half-run vanish.
let allocatedRunId = null;
process.on("exit", (code) => {
  if (code === 0 || !allocatedRunId) return;
  markTtsRunFailed({ root: __dirname, pipelineId, runId: allocatedRunId, code });
});

const t0 = Date.now();
const result = await runTtsOnly({
  root: __dirname,
  pipelineId,
  contentDir,
  scenes,
  meta,
  withRun,
  runId,
  generate: generateTTS,
  log: (line) => console.log(line),
  onRunCreated: (id) => {
    allocatedRunId = id;
    console.log(`🆔 Run ${id} allocated before TTS`);
  },
});
const ms = Date.now() - t0;

console.log(`\n=== TTS done in ${(ms / 1000).toFixed(1)}s ===`);
for (const r of result.results) {
  const id = r.sceneId ?? r.id ?? "?";
  const dur = typeof r.duration === "number" ? r.duration.toFixed(2) : r.duration;
  console.log(`  scene ${id}: dur=${dur}s status=${r.status ?? "?"}`);
}

if (result.runId) {
  console.log(`\n🆔 Run ${result.runId} → ${relative(__dirname, result.runDir)}`);
  console.log(`   materialized: ${result.materialized.timing.length} timing file(s)`);
  console.log(
    `\n下一步（可在干净目录执行）：node scripts/short-video/render-only.mjs --content ${contentDir} --run ${result.runId}`,
  );
}
