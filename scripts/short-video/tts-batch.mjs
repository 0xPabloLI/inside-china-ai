#!/usr/bin/env node
/**
 * #1528 R2: 跨视频批量 TTS —— 一个 Kaggle 内核，服务多个内容包。
 *
 * 现状（Round CCLI verify）：每跑一条视频，`main.mjs` 都独立冷启一次内核：
 * 模型加载 5–6 min + 排队风险，四条视频串行就付四次。内核本身在 #1515 已经
 * 支持「加载一次、服务后续 batch」，缺的只是生产侧没人跨包复用。
 *
 * 做法：选一个引擎实例，逐包调用 registry 的完整 TTS 流程（缓存规划、门禁、
 * 节奏阶梯、对齐、落缓存都在原地跑），只在包与包之间不关内核：
 *  - 第 2 条起打开 `setBatchMode({reuseLiveSession:true})`，把该包的 scene
 *    作为同一内核的后续 batch 下发；跨包 scene 的文本随命令走（#1528 的
 *    `_table` 覆盖），不再依赖 batch 1 的 manifest；
 *  - `keepLiveSession` 让 registry 不在每条结束时关会话，由本驱动收尾；
 *  - 单条失败只标记该 run 失败，继续下一条；会话若已死，下一条会自然冷启。
 *
 * 每条包仍走 `runTtsOnly`，所以产物就是 R1 的自包含 run：随后
 * `render-only --content <id> --run <runId>` 可在任意机器出片。
 *
 * Usage:
 *   node scripts/short-video/tts-batch.mjs --content a --content b --content c
 *   TTS_ENGINE=cosyvoice3-kaggle-cuda node scripts/short-video/tts-batch.mjs --content a --content b
 */
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const contents = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--content") {
    const value = args[i + 1];
    if (!value || value.startsWith("--")) {
      console.error("❌ --content needs a value");
      process.exit(1);
    }
    contents.push(value);
    i += 1;
  }
}
if (contents.length < 2) {
  console.error("usage: tts-batch.mjs --content <dir> --content <dir> [--content ...]");
  process.exit(1);
}

// Gate/alignment between two packs can outlast the 300 s default idle and
// would silently kill a kernel we still need. The driver owns the lifetime,
// so give the session room for a full pack tail before the next batch.
if (!process.env.TTS_KAGGLE_LIVE_IDLE_SEC) process.env.TTS_KAGGLE_LIVE_IDLE_SEC = "1800";

const { selectEngine, generateTTSWithEngine } = await import("./lib/tts/registry.mjs");
const { runTtsOnly, markTtsRunFailed } = await import("./lib/tts-only-run.mjs");

console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🎙️  TTS batch — ${contents.length} packs on one warm kernel`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

const engine = await selectEngine();
if (typeof engine.setBatchMode !== "function") {
  console.error(
    `❌ engine "${engine.name}" does not support batch mode (setBatchMode missing).\n` +
      "   Use cosyvoice3-kaggle-cuda / cosyvoice3-cuda for cross-video batching.",
  );
  process.exit(1);
}

const summary = [];

for (const [index, contentDir] of contents.entries()) {
  const isLast = index === contents.length - 1;
  let allocatedRunId = null;
  let allocatedPipelineId = null;
  try {
    const meta = (await import(`./content/${contentDir}/meta.mjs`)).meta;
    const scenes = (await import(`./content/${contentDir}/scene-data.mjs`)).scenes;
    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error(`no scenes in content/${contentDir}/scene-data.mjs`);
    }
    const pipelineId = meta.pipelineId ?? contentDir;
    allocatedPipelineId = pipelineId;

    console.log(
      `\n▶️  [${index + 1}/${contents.length}] ${contentDir} — ${scenes.length} scene(s)` +
        `${index > 0 ? " （复用热内核）" : " （首批，建立 manifest）"}`,
    );

    engine.setBatchMode({ reuseLiveSession: index > 0 });
    const t0 = Date.now();
    const result = await runTtsOnly({
      root: __dirname,
      pipelineId,
      contentDir,
      scenes,
      meta,
      withRun: true,
      generate: (scenesArg, cacheDir, options) =>
        generateTTSWithEngine(scenesArg, cacheDir, engine, {
          ...options,
          keepLiveSession: !isLast,
        }),
      log: (line) => console.log(line),
      onRunCreated: (id) => {
        allocatedRunId = id;
      },
    });
    const seconds = (Date.now() - t0) / 1000;
    summary.push({
      contentDir,
      pipelineId,
      runId: result.runId,
      scenes: scenes.length,
      seconds,
      status: "ok",
    });
    console.log(`✅ ${contentDir} → ${result.runId} (${seconds.toFixed(1)}s)`);
  } catch (error) {
    const seconds = 0;
    console.warn(`❌ ${contentDir} failed: ${error.message.split("\n")[0]}`);
    if (allocatedRunId) {
      markTtsRunFailed({
        root: __dirname,
        pipelineId: allocatedPipelineId ?? contentDir,
        runId: allocatedRunId,
        code: 1,
      });
    }
    summary.push({
      contentDir,
      runId: allocatedRunId,
      status: "failed",
      error: error.message,
      seconds,
    });
  }
}

// The driver owns the kernel lifetime. Even a run of failures must release GPU.
try {
  await engine.endLiveSession?.();
} catch (error) {
  console.warn(`  ⚠️ [TTS Live] session close failed: ${error.message}`);
}

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("📋 Batch summary");
for (const row of summary) {
  const dur = row.seconds ? `${row.seconds.toFixed(1)}s` : "-";
  console.log(
    `  ${row.status === "ok" ? "✅" : "❌"} ${row.contentDir} → ${row.runId ?? "-"} (${dur})` +
      `${row.error ? ` — ${String(row.error).split("\n")[0]}` : ""}`,
  );
}
const okCount = summary.filter((row) => row.status === "ok").length;
console.log(`\n${okCount}/${summary.length} packs produced a run.`);
console.log(
  "渲染（可与其他包的 TTS 重叠）：node scripts/short-video/render-only.mjs --content <dir> --run <runId>",
);

process.exit(okCount === summary.length ? 0 : 1);
