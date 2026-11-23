# `step-1-tts` 子步实测：573 s 本地尾巴里，68% 是「重试的第二次冷启」（2026-11-23，`#1514`）

> **上游票**：`#1512`（冷批四段取证，结论是「本地尾巴 573 s 没有子步计时」）。本报告只回答那个悬着的问题：尾巴里到底是谁在花钱。
> **下游票**：`#1515`（常驻内核复用失败场景，预期每次重试省 300–400 s）。

`#1512` 把一次冷跑拆成 ①排队 / ②内核 / ③下载 / ④本地尾巴，其中 ④ 中位 573 s、最长 1027 s，但没有子步计时，无法判断该优化谁。本票给 `step-1-tts` 装上 8 个子步（`tts-select`、`tts-plan`、`tts-engine`、`tts-engine-retry`、`tts-loudness`、`tts-verify`、`tts-align`、`tts-write`），用 4 个包、9 次冷内核 + 1 次热跑测出各自占多少。

## 结论

1. **本地尾巴里没有「贵」的本地计算。** 8 场景纯门验证 41.5 s（≈5 s/场景）、forced alignment 10.8–16.4 s（含 wav2vec2 加载）、响度 3.4–4.2 s、`tts-plan`/`tts-write` 合计 <50 ms。全部本地机械加起来约 60 s，占尾巴的 10%。
2. **贵的是重试。** 质量门每触发一次重跑，就要再 push 一次 kernel、再付一次完整冷启：`agnes-harness` 两条 `tts-engine-retry` 分别 406.3 s 和 333.5 s，重跑的场景只有 1–3 个，但 wall 与首跑同量级。**739.8 s / 1269.2 s = 58% 的 `step-1-tts` 墙钟花在「重跑也要重新装一遍环境」上。**
3. **所以「常驻 kernel」的正确靶子是重试，而不是首跑。** `#1512` 已经算过：首跑的内核里依赖导入占 78%，常驻/预热镜像最多拿下冷跑墙钟的 22–31%。但重试批次是 1–3 个场景，setup 摊薄效应最差（`agnes-harness` 的观察：8 场景首跑 483 s vs 2 场景重跑 406 s），把失败场景塞进同一个已热内核，每次重试可省 **300–400 s**（setup + 推包 + 下载）。
4. **对齐段的 setup 摊薄确实存在，但绝对值不值得动。** `text-align.py` 批处理一次加载 wav2vec2（约 8–9 s 固定），之后每场景 0.3–1 s；8 场景 10.8 s、7 场景 16.4 s（后者含一次冷加载偏慢）。与内核 5–6 min 的固定税差一个数量级，优化它收益 <20 s。
5. **纯门验证不是瓶颈，别为它做异步化。** 8 场景 41.5 s、5 s/场景，包含三次 attempt 的候选评分；它只是把「该不该重跑」问出来，重跑本身才是成本。

## 子步定义与数据来源

| 子步 | 定义 | 来源 |
| --- | --- | --- |
| `tts-select` | 引擎探测（本地 CLI / 云 kernel 可用性） | `selectEngine` 墙钟 |
| `tts-plan` | 读 content、算 keyEntities、切场景、查缓存 | 同段墙钟，meta 带 `scenes/cacheHits/pending` |
| `tts-engine` | 首跑：push + 排队 + 内核 + 下载 + 引擎侧后处理，扣除其后响度 | meta 带 `engineWallMs / queueMs / kernelMs`（`audio/.kaggle-kernel/poll-status.json`） |
| `tts-engine-retry` | 门内 self-heal / pacing 触发的重跑批次（含引擎后处理） | 每次重跑一条，meta 带 `engineWallMs`；从 `tts-verify` 里扣除，避免把第二次冷启算成验证成本 |
| `tts-loudness` | 整批响度归一（`cosyvoice3` hooks 回报） | `onSpan("tts-loudness", ms)` |
| `tts-verify` | 质量门判定：候选校验 + ASR 相似度 + 截断检测 + 重跑决策 | 门块墙钟 − cache settle − 重跑批次 |
| `tts-align` | forced alignment 尾巴（`tts-align-script` 批处理 + `tts-align-guards` 尾巴截断复核） | `runForcedAlignment` 拆分 |
| `tts-write` | 写 wav 缓存 + sidecar 落盘 | 缓存 settle 墙钟（音频实体化在 `step-1-tts` 之后） |

口径：所有子步都挂在已有的 `pipeline-profile.mjs` 上，`--profile` 未开时零开销、不改产出；外层 `step-1-tts` 与子步和之差 ≤0.2%（验收要求 ≤5%）。

## 实测（4 包 / 9 次冷内核 + 1 次热跑）

| 包（场景） | 跑法 | `step-1-tts` | engine（内核） | 重试批次 | verify | align | loudness | 和差 | 终局 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baidu-token-market（8） | 冷跑·带门 | 739.4 s | 391.2 s（356.2） | — | 343.0 s¹ | — | 4.2 s | −0.1% | hard block（scene 4 “switches” 截断） |
| zhipu-valuation（8） | 冷跑·带门 | 1190.5 s | 424.7 s（381.8） | — | 760.2 s² | — | 3.8 s | −0.2% | hard block（scene 1 相似度 72.7%） |
| agnes-harness（8） | 冷跑·带门 | 1269.2 s | 483.5 s（437.6） | **406.3 + 333.5 s** | 41.5 s | — | 3.4 s | −0.1% | hard block（scene 4 “twenty seventh”+“sys1” 45.2%） |
| deepseek-api-open（8） | 冷跑·跳门 | 449.2 s | 433.2 s（383.0） | — | — | **10.8 s** | 3.4 s | −0.0% | 通过（align 与 engine 同 profile） |
| agnes 7 approved | 热跑·跳门 | 17.6 s | 0（全缓存命中） | — | — | **16.4 s** | 0 | −0.0% | 通过 |

¹ 旧代码口径：`tts-verify` 含 1 次 2 场景重跑内核；纯门部分约 50–90 s。
² 旧代码口径：`tts-verify` 含 2 次重跑内核；纯门部分约 60 s。

冷内核区间 356.2–437.6 s（与 `#1512` 的 405 s 中位一致）；`engine − kernelMs` = 35–50 s，就是下载 + 回传 + 解包。

### 尾巴的构成（`agnes-harness`，唯一一条走到 3 次 attempt 的完整链路）

| 段 | 秒 | 占 `step-1-tts` |
| --- | --- | --- |
| 重试批次 ×2 | 739.8 | 58% |
| 质量门（3 attempt） | 41.5 | 3% |
| 响度 | 3.4 | 0.3% |
| plan + write + select | ~0 | 0% |
| 首跑 engine | 483.5 | 38% |

`#1512` 的中位尾巴 573 s ≈ 一次重试冷启（300–400 s）+ 本地机械（~60 s）+ 下载（~40 s）+ 余量；`zhipu-valuation` 的 760 s 尾巴则是两次重试。**结论：尾巴的方差来自重试次数，而不是本地子步的快慢。**

### setup 摊薄：两个尺度

| 尺度 | 固定税 | 单场景边际 | 摊薄表现 |
| --- | --- | --- | --- |
| TTS 内核 | 5–6 min（dataset mount + 依赖导入 211–309 s + 模型加载 31–45 s） | ~10–30 s（RTF 0.9–1.6） | 8 场景首跑 483 s；**2 场景重跑仍要 406 s** —— 摊薄效应在重试里几乎消失 |
| forced alignment | ~8–9 s（wav2vec2 加载） | 0.3–1 s | 8 场景 10.8 s、7 场景 16.4 s；固定部分只占一半，但总量太小 |

同一形状、不同量级：内核的摊薄失效是灾难（+300 s），对齐的摊薄失效是噪声（+9 s）。这解释了为什么「换后端 / 优化对齐」都不该排在第一位。

## 口径与偏差

- **`agnes-harness` 是主 checkout 里未提交的包**，只存在于 `content/agnes-harness`，故测量用 `--content-dir` 指向主 checkout；该包实际 8 场景，不是 7。
- **三次带门冷跑都撞上硬门，走不到对齐段**（baidu 截断、zhipu 相似度、agnes 截断+相似度）。align 证据因此来自两条跳门链路：`deepseek-api-open` 冷跑（8 场景 10.8 s）与 agnes 7 个 approved 场景热跑（16.4 s，含冷加载）。冷/热两类证据在表中分开标注，不混算。
- **`deepseek-api-open` 第一次跳门冷跑 41.8 s 失败**：日志 `✓ Kaggle kernel version unknown pushed` 后 status 直接 COMPLETE，download 拿到旧版本产物，被 identity gate 拒绝（`summary does not belong to this run … got 93465cdc…`）。判为并发队列把 kernel 推到旧 version，**未消耗 GPU**；本次表格用的是第二次成功的跑。这本身也是「重试/并发会静默浪费一轮」的旁证。
- **热跑需要删三件缓存**才能强制重跑对齐：`audio/subtitle-timing.json`、`subtitle-timing.meta.json`、`whisper-manifest.json`；只删其一会命中缓存、align 记 0 s。
- `poll-status.json` 每次 push 会被覆盖，因此重试批次的 `kernelMs` 拿不到可靠单项，重试只报 `engineWallMs`（含推包 + 内核 + 下载），比纯内核略高 35–50 s，方向上让「重试成本」估计偏保守（更不可能低估）。
- 测量目录 `/tmp/tts-substep-1514/<slug>`，不写生产 `output/`；测量所用 TTS 代码与 `origin/main` 无 diff，与生产同源。

## 一条可执行的下一步

**`#1515`：把门内重跑塞进同一个已热内核（常驻 kernel 复用，而非重推）。**

- 做法：质量门判出失败场景后，不重新 `kaggle kernels push`，而是把失败场景（通常 1–3 个）追加到仍在运行的内核的输入队列（或保持在同一次 kernel session 里做第二批合成），跑完再一次性下载。
- 预期省秒：**每次重试 300–400 s**。按 `#1512` 中位尾巴 573 s、实测「1 次重试」的共同形态，尾巴应降到 ~150–200 s；`agnes-harness` 这类 2 次重试的包省 ~740 s（19.7 min → ~9 min）。
- 不做的事：不改默认后端（仍是 Kaggle CUDA）；不改 registry 顺序；不新增 Kaggle 配额（复用同一 kernel，反而少 push 次数）；不动 forced alignment 与质量门判定（`#421` / `#423` / `#827`）。
- 风险：内核空闲超时与看门狗需要先确认；失败场景的中间产物必须留在容器内（当前是下载到本地再重推，改后要改成留容器）。这也是 `#1515` 要回答的第一件事。

## 复现

```bash
# 单个包，带门冷跑，输出子步占比与误差
node scripts/short-video/tts-step-profile.mjs \
  --content <slug> --content-dir scripts/short-video/content --out /tmp/tts-substep-<slug>

# 跳门（只想拿 engine + align 的绝对耗时）
TTS_SKIP_QUALITY_GATE=1 node scripts/short-video/tts-step-profile.mjs ...
```

profile 落 `<out>/profile-tts-substep-<TS>.json` 与 `last-profile.json`；`--no-alignment` 可单独关掉对齐尾巴做对照。
