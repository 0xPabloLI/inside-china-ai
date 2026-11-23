# 常驻内核复用实测：门内重试 63.9–71.5 s，冷启 351 s（2026-11-23，`#1515`）

> **上游票**：`#1514`（`step-1-tts` 子步实测，结论是门内重试重付完整冷启 406.3/333.5 s）。
> **下游票**：`#1515`（本文即该票的交付物；结论回写 `#1514` 的预期省秒区间）。

`#1514` 证明质量门重跑的贵点不是本地计算，而是每次重试都要再 `kaggle kernels push` 一遍、再付 5–6 min 冷启。本报告回答 `#1515` 的唯一问题：**把重试塞进同一个已热内核，真实能省多少、边界在哪**。所有数字来自 2026-11-23 的一次真实 Kaggle P100 运行（`xPabloLI/cosyvoice3-cuda-1515-live-multipack`，版本 1），不是模拟。

## 结论

1. **2 个包、3 次真实重试：63.9 s / 67.6 s / 71.5 s，中位 67.6 s。** 对照 `#1514` 的 406.3 s 与 333.5 s，单次省 335–342 s（-82% ~ -84%）；票面写的 `<60 s` 没有达到，稳定区间是 **60–90 s**（用户已口头接受按实测改口径）。
2. **冷启仍然要 351 s，一次都省不掉。** 4 个 scene 一次 push：从 push 到 batch 1 全部校验完 316 s，加上 4 条 wav 的响度后处理，`coldMs` 351.2 s；其中模型加载与依赖导入仍占大头。常驻内核只改变「第二次及以后」的单价。
3. **3 次重试全部走同一条热内核，0 次重推、0 次重下。** 每次只把 `{sceneIds,speeds}` 写进 secret gist、等内核合成后用 FLAC 经 `kaggle kernels logs -f` 回传；宿主逐条校验 FLAC sha256 + 解码 PCM sha256 后才晋级，3 条 wav 均落盘（307–542 KB）。
4. **控制面延迟是下限。** gist PATCH→raw 的传播实测 26.6 s，内核每 10 s 轮询一次，所以 60 s 里约 27–37 s 是「命令在路上」，真正合成本身只有 3–6 s。要再往下压，只能换控制面，不能靠优化 TTS。

## 实测

| 批次 | 包 | scene | 墙钟 | 产物 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 冷 batch 1 | baidu-token-market + deepseek-harness-desktop | 1 / 2 / 101 / 102 | **351.2 s** | 4 条 wav，303–418 KB | 一次 push、排队 0、模型只加载一次 |
| retry 1 | baidu-token-market | 2 | **63.9 s** | `scene-2.wav` 371,224 B / 4.21 s | 热内核 batch 2 |
| retry 2 | deepseek-harness-desktop | 101 | **67.6 s** | `scene-101.wav` 307,014 B / 3.48 s | 热内核 batch 3 |
| retry 3 | deepseek-harness-desktop | 102 | **71.5 s** | `scene-102.wav` 542,214 B / 6.15 s | 热内核 batch 4 |

冷 batch 1 的 4 个 scene 时长分别为 4.74 / 4.84 / 3.44 / 5.48 s；316 s 是 push→日志流校验完成，351 s 是引擎 `generate()` 返回（差额是 4 条 wav 的响度后处理与落盘）。

重试墙钟拆解（由日志顺序推断，非逐段计时）：

| 段 | 约值 | 依据 |
| --- | --- | --- |
| gist PATCH → raw 可见 | 27 s | 独立探针实测 26.6 s |
| 内核轮询命中 | 0–10 s | `TTS_KAGGLE_LIVE_CONTROL_POLL_SEC=10` |
| 合成 1 个 scene | 3–6 s | 内核日志 3.48 / 4.21 / 6.15 s |
| FLAC 流回传 + 解码 + PCM 校验 | 4–6 s | 单条 FLAC 约 0.3–0.5 MB，32 KB 分块 |
| 响度后处理 + 晋级 | 3–5 s | 与 batch 1 同一套 `promoteStagedBatch` |

## 协议与取证

```
host ──push（仅第一次）──▶ Kaggle kernel ──模型加载一次──▶ batch 1
  │                                                        │
  │◀──── FLAC + sha256 + PCM sha256（logs -f）──────────────┘
  │
  ├── secret gist PATCH {action:"retry", sceneIds, speeds} ──▶ 内核轮询
  │◀──── batch N 的 FLAC（logs -f）───────────────────────────┘
  └── PATCH {action:"stop"} ──▶ 内核退出、gist 删除
```

- **宿主→内核**：secret gist 的稳定 raw URL（不能带版本 sha，否则 PATCH 不可见），带 `?cb=` 破缓存；payload 只有 `requestId / batch / action / sceneIds / speeds`，**没有文案、没有脚本、没有凭据**。
- **内核→宿主**：`kaggle kernels logs -f`。平台探针确认 mid-run `kaggle kernels output` 返回 0 文件、宿主→内核无原生通道；2 MB 行可完整到达，但单行会被切成 102,400 字符，所以分块取 32 KB（base64 后约 43 KB）。
- **产物身份**：每个 take 以 FLAC（PCM_16）回传，宿主先校验 FLAC sha256，再 ffmpeg 解码成 wav、按 RIFF `data` chunk 取 PCM 与内核侧 `pcmSha256` 比对；不一致直接拒绝晋级。`promoteStagedBatch` 仍是唯一晋级路径，requestId、scene 覆盖、RIFF/WAVE 完整性门一条没少。

## 边界与代价

1. **重试 scene 必须来自首次 push 的 manifest。** 内核用 manifest 查文本与 instruct；生产里质量门重试的 scene 本来就在首跑 manifest 里，所以成立。跨包拼 manifest 只用于验收（见复现），生产不这么做。
2. **空闲窗口 300 s。** batch 1 之后内核最多等 `TTS_KAGGLE_LIVE_IDLE_SEC`；质量门在 batch 1 与重试之间做验证/对齐超过 5 min 时内核会自尽，宿主回退经典路径。本次 3 次重试都在 batch 1 后 1–2 min 内发出。
3. **排队是不可控项。** 同一天 90 min 队列预算的一次 smoke 在 90m3s 超时（账户 GPU 配额当时仍有 26.25 h，不是配额问题）；下一次 push 却立即 RUNNING。常驻内核省的是**重试**冷启，不解决 GPU 容量拥堵；队列塌方时首跑仍会整段停在 QUEUED。
4. **控制面是 secret 而非私有。** gist 只靠 URL 保密，泄露也只是一批 scene 编号与速度；`endLiveSession()` 会 stop + 删 gist，删除失败最迟由 300 s 空闲超时收尾。
5. **测试与生产共用 seam。** `deps.exec` 注入即关闭 live（保持原 hermetic 测试）；真实 CLI 默认 `TTS_KAGGLE_LIVE=1`，`0` 可一键回到经典一次性内核。live 失败后走同一个 kernel 的 COMPLETE + `kaggle kernels output`，**不重推**。
6. **进程收尾。** `waitForExit` 的 90 s 竞速计时器原先不会在「内核先退出」时清除，验收驱动在 RESULT 后多活了 90 s；已改为退出即 `clearTimeout`。

## 与 `#1514` 对账

| 指标 | `#1514` 基线 | 本次 `#1515` | 变化 |
| --- | --- | --- | --- |
| 单次 `tts-engine-retry` | 406.3 s / 333.5 s | 63.9 / 67.6 / 71.5 s | -82% ~ -84% |
| 一个包两条重试 | 739.8 s | 约 131–143 s | 省约 10 min |
| 首跑冷启 | 330–406 s | 351 s（4 scene） | 不变 |

## 复现

```bash
cd /Users/pabloli/Documents/code/inside-china-ai-wt/20261123-1515-live-kernel-f687bf
PACKS=baidu-token-market,deepseek-harness-desktop RETRY_COUNT=3 \
  SMOKE_ID=1515-live-multipack \
  COSYVOICE3_KAGGLE_QUEUE_TIMEOUT_MS=21600000 \
  PATH="/opt/homebrew/bin:$PATH" \
  node scripts/short-video/kaggle/live-reuse-smoke.mjs
```

结果：`scripts/short-video/output/1515-live-multipack/result.json`；日志：当次终端输出（本次为 `/tmp/1515-live-multipack.log`）。驱动只调引擎入口，不跑 registry，目的是把 `tts-engine-retry` 的 engine wall 与门/对齐/响度分开；registry 的 span 包的是同一个 `engine.generate()` 调用。

## 后续

- 票面 `<60 s` 改成实测口径 **60–90 s**；`docs/video-production-runbook.md` 与 `#1514` 回写同步。
- 若要把下限再压 27 s，需要换控制面（例如内核侧长轮询对象存储）；不建议在本票继续。
- 队列容量是平台侧风险，已有 `#1512` 的排队归因；本票不处理。
