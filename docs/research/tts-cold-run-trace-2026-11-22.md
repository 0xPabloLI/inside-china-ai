# TTS 冷批四段取证：冷跑墙钟到底花在哪（2026-11-22，`#1512`）

> **下游票**：无下游：本文只是测量，下一步「本地尾巴子步计时」的立票待用户拍板，立项后再回填票号。

一次「冷跑」= 包内 `step-1-tts` 没有缓存命中、必须把整批场景推上 Kaggle 重算的那一跑。近 9 天 25 次冷跑合计 539 min（中位 16.1 min、最长 106 min），而 TTS 命中缓存的重跑渲染合计只有 34.3 min——所以本报告只回答一个问题：那 16.1 min 里，排队、内核装配、推理、回传各占多少。

## 结论

1. **内核只占 42%，下载后的本地尾巴占 56%。** 8 次可对账冷跑的中位：墙钟 1023 s（17.0 min）、Kaggle 内核 405 s（6.8 min）、本地尾巴 573 s（9.6 min）、下载 13 s、排队 0。
2. **内核内部：依赖导入吃掉 78%。** 5 份可对齐日志里，依赖导入 211–309 s、模型加载 31–45 s、合成 11–44 s、脚本收尾 10–14 s。也就是说「常驻 kernel / 预热镜像」这条路最多拿下内核里那 3.5–5 min 依赖导入 ≈ 冷跑墙钟的 22–31%，**砍不到本地尾巴半分**。
3. **本地尾巴是最大的单块，且完全没有子步计时。** 同样是下载完成到 step 结束，最小 429 s、最大 1027 s（2.4× 波动）。在它被拆开之前，任何「换后端 / 常驻 kernel」的收益上限都只能落在第 2 条那 25% 里。
4. **排队通常为 0，但会整段吞跑。** `anthropic-ipo-china-ai`（`queuedMs` 30.4 min）与 `tencent-hy4`（40.4 min）都停在排队、`runningMs = 0` 一次没跑起来——常驻 kernel 对这类塌方同样无效。

## 四段定义与数据来源

| 段 | 定义 | 来源 |
| --- | --- | --- |
| ① 排队 | 提交到内核启动 | `audio/.kaggle-kernel/poll-status.json` 的 `queuedMs` |
| ② 内核 | 内核启动到脚本退出（含依赖导入 + 模型加载 + 合成 + 收尾） | 同上 `runningMs`；内部拆分用 `kaggle kernels logs` 的 `Loaded in Xs`、`x.xs in y.y s, RTF`、`=== Done` |
| ③ 下载 | 内核判定完成到产物落到本地 `downloads/` | `downloads/` 目录 mtime − `poll-status.json` 的 `updatedAt` |
| ④ 本地尾巴 | 下载完成到 `step-1-tts` 结束（候选校验/重跑、响度、字幕对齐、写 wav 与 sidecar） | `profile-*.json` 的 `step-1-tts` 墙钟减去 ①②③ |

对账规则：只认「内核 `updatedAt` 落在该 `profile` 的 `step-1-tts` 窗口 ±3 min 内」的配对，一对多或多对一的全部丢弃。

## 实测（8 次冷跑 / 8 个包）

| 包 | 冷跑起点（UTC） | TTS 墙钟 | ① 排队 | ② 内核 | ③ 下载 | ④ 本地尾巴 |
| --- | --- | --- | --- | --- | --- | --- |
| deepseek-astra-distillation | 10-29 07:38 | 948 s | 0 | 446 s | 11 s | 492 s |
| qwen4-gamefeel | 11-09 04:42 | 1323 s | 0 | 372 s | 28 s | 923 s |
| baidu-token-exchange | 11-13 07:39 | 1030 s | 0 | 322 s | 9 s | 699 s |
| minimax-h3-image | 11-12 23:29 | 1444 s | 17 s | 383 s | 17 s | 1027 s |
| baidu-token-market | 11-13 08:33 | 870 s | 0 | 429 s | 12 s | 429 s |
| zhipu-valuation | 11-15 00:38 | 1860 s | 0 | 1266 s | 11 s | 583 s |
| deepseek-api-open | 11-19 04:32 | 1015 s | 0 | 427 s | 25 s | 563 s |
| qwen4-max-release | 11-19 03:19 | 900 s | 0 | 339 s | 15 s | 546 s |
| **中位** | — | **1023 s** | **0** | **405 s** | **13 s** | **573 s** |

占比：内核 42.4%、本地尾巴 56.0%、下载 1.4%、排队 0.2%。

## 内核内部（5 份可对齐日志）

| 包 | 场景 | 内核总时长（脚本） | 依赖导入 | 模型加载 | 合成 | 收尾 |
| --- | --- | --- | --- | --- | --- | --- |
| minimax-h3-image | 1 | 319.5 s | 258 s | 39 s | 11 s | 12 s |
| baidu-token-market | 1 | 288.1 s | 234 s | 31 s | 11 s | 11 s |
| zhipu-valuation | 1 | 316.4 s | 250 s | 43 s | 13 s | 11 s |
| qwen4-max-release | 2 | 390.2 s | 309 s | 45 s | 21 s | 14 s |
| deepseek-api-open | 5 | 296.3 s | 211 s | 32 s | 44 s | 10 s |

依赖导入 78.4%、模型加载 11.8%、合成 6.3%、收尾 3.5%。合成随场景数线性增长（RTF 0.9–1.6），场景越多，setup 这份固定税摊得越薄——8 场景的包合成都只有 81 s。

## 口径与偏差

- **日志只取各 kernel 的最新 version**，同一包多次冷跑只能用最近一次；`zhipu-valuation` 的 `runningMs` 1266 s 与最新日志 316 s 明显不是同一跑（该跑含第二轮/重试），所以「② 内核」按 `poll-status` 计、内核内部表按日志计，两表不做同轮相减。
- `poll-status` 的 `runningMs` 是容器生命周期，比脚本末事件多 60–100 s 的收尾（`!kaggle` 打包/版本落地），因此内核内部四列加起来略小于「② 内核」。
- `linger-final`、`suno-visuals` 的内核日志被 Kaggle 拒绝（`Permission 'kernels.get' was denied`），不入表。
- 下载段只能测到「目录 mtime」这个写完时刻，误差上限是一个 poll 间隔；实测 8–29 s，量级上不构成瓶颈。
- 本地尾巴是减法得到的残差，没有子步计时，因此**无法区分**其中候选校验、重跑、响度、对齐各占多少——这正是第 4 条结论的来处。

## 复现

```bash
# 四段的锚点（每包）
cat scripts/short-video/output/<slug>/audio/.kaggle-kernel/poll-status.json   # queuedMs / runningMs / updatedAt
ls -lT scripts/short-video/output/<slug>/audio/.kaggle-kernel/downloads      # 下载完成时刻
node -e 'const p=require("./scripts/short-video/output/<slug>/profile-*.json")' # step-1-tts durationMs
# 内核内部分段
/opt/homebrew/bin/kaggle kernels logs xPabloLI/cosyvoice3-cuda-<slug>[/<version>]
```

## 下一步（建议，未立项）

给 `step-1-tts` 加子步计时（engine 调用 / 候选校验 / 响度 / 对齐 / 写盘），一轮 3–5 个包就能把 9.6 min 的残差拆到分钟级；拆完再决定是「常驻 kernel」「预热镜像」还是「换后端」。在本地尾巴被拆开之前，这三条都只能争内核里那 25%。
