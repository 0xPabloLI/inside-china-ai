# 单内核多包 TTS 实测（#1528 R2，2026-11-26）

> **下游票**：#1528

## 结论

四条视频、八条 scene、**一次 push**：冷包 254.9 s，后三包 84.9 / 55.8 / 63.1 s，合计 458.7 s（7.6 min）。
对照「每条视频各冷启一次」的旧口径（4 × 250–400 s ≈ 17–27 min，且每次都要排一次队），省掉的是三次模型加载与三次 push 队列暴露；门禁/对齐/落 run 仍然逐包跑，没有被跳过。

## 测量

环境：Kaggle P100 / CosyVoice3-Kaggle-CUDA，live 会话（#1515），`TTS_KAGGLE_LIVE_IDLE_SEC=1800`（批模式默认）。夹具是四个 2-scene 的合成包（`smoke-1528-a..d`），文本为公开风格的英文短句，未复用任何真实包缓存。

| 包 | 角色 | 墙钟 | 内核批次 | 门禁 |
| --- | --- | --- | --- | --- |
| a | 首批（建立 manifest） | 254.9 s | batch 1（含 push + 模型加载） | 175 / 187 WPM，100% |
| b | 复用 | 84.9 s | batch 2，66.5 s 返回 | 193 / 185 WPM，100% |
| c | 复用 | 55.8 s | batch 3 | 100% |
| d | 复用 | 63.1 s | batch 4 | 100% |

- `grep -c "Pushing Kaggle kernel"` = **1**；只有 a 包触发 push/preflight，b–d 走 `generateLiveRetry`。
- 收尾：control gist 末态 `{"batch":4,"action":"stop"}`，`kaggle kernels status` 转为 `COMPLETE`——批驱动负责关会话，没有被 1800 s 空闲拖住。
- 每包都产出 R1 的自包含 run：2 × wav + 2 × `tts-meta` + `subtitle-timing.json` + `.meta.json`（6 个文件），`currency-rates.json` 在 run 根。

## 协议（为什么不是「合并 manifest」）

`#1515` 的内核只认 batch 1 的 manifest：后续 batch 的命令只有 `sceneIds` + `speeds`，文本按 id 回表。跨包合并 manifest 时，各包 scene id 从 1 开始，回表会串包；给 id 加命名空间又会把缓存、门禁、对齐、pacing 的身份一起改掉。

因此跨包 batch 改为**文本随命令走**：

- 宿主机 `generateLiveRetry` 在 `{action:"retry", sceneIds, speeds}` 之外带 `texts` / `instructs`；
- 内核 `_table` 优先用 payload 里的文本（`dict(_lookup())` 拷贝，不污染 manifest 表），并给「不在 manifest 里的 id」兜底建行；
- `engine.setBatchMode({reuseLiveSession:true})` 让第二个包的 `outputDir`（不同 content id）仍然复用同一内核；
- `generateTTSWithEngine({keepLiveSession:true})` 让 registry 不在每条视频结束时关会话，由 `tts-batch` 在最后一条之后统一 `endLiveSession`。

## 边界

- **文本走 secret gist**：控制通道以前只送 id/speed，现在跨包 batch 会送该包 scene 的 `text` 与 `instruct`（公开脚本行，非机密），但这是一次隐私口径的变更；同包的重试也带文本（与 manifest 一致，无信息增量）。
- **空闲上限 1800 s**：一包的本地尾巴（门禁 ASR + 对齐）超过 30 min 时内核会自尽，下一包回落冷启——仍是 ≤2 会话，但不再是一次。
- **pacing 未合并**：节奏阶梯、补偿、speed 覆盖仍逐包在 registry 里跑，没有跨包排序；本实测 8 条 scene 都未触发 pacing 重试。
- **渲染并发未测**：#1528 的「渲染并发」项仍未取数，本轮只做 TTS。
- **lane 账本未做**：Kaggle/Colab/Modal 的分配仍靠单进程选引擎，是 #1528 的 R3。

## 复现

```bash
# 在 scripts/short-video/ 下
PATH="/opt/homebrew/bin:$PATH" TTS_ENGINE=cosyvoice3-kaggle-cuda \
  node tts-batch.mjs --content smoke-1528-a --content smoke-1528-b \
                     --content smoke-1528-c --content smoke-1528-d

# 每条包的 run 可单独后置渲染
node render-only.mjs --content smoke-1528-a --run <runId>
```
