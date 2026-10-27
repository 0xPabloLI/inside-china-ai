# Whisper 重复循环的业界处置调研（#540）

> 研究票交付物。**不改生产默认**；所有建议都以「已证事实 / 未验证假设 / 代价」三栏分开写。
> 实测环境：M2 Pro 32GB，whisper.cpp **1.9.1**（Homebrew，`ggml` 0.18.0），模型
> `~/.cache/whisper/ggml-large-v3-turbo.bin`；对照运行时 MLX `mlx-whisper 0.4.3`
> （`~/.venvs/mlx-vlm`）与 `faster-whisper 1.2.1`（`~/.video-tts-env`）。
> 原始产物在 `.scratch/asr-repetition-research/`（gitignored）；关键证据已随报告提交（见 §1.2）。

## 0. 结论速览

| 轴 | 业界是否把它当标准处置 | 本地可复现结论 | 裁决 |
|---|---|---|---|
| **1. VAD 门控** | 是。WhisperX、faster-whisper、whisper.cpp 都内置；ICASSP 2025 的非语音幻觉论文把 Silero VAD 列为**单项最强**缓解手段 | 在真实生产循环音频上 **17 段 → 0 段**（14.3s → 1.8s）；在干净旁白上 54 → 52 词（相似度 0.9623）；在音乐/歌唱素材上 **62 → 16 词、86 → 2 词** | **不作全局默认**；只作为「已判定为不可收敛循环」的**二次确认探针** |
| **2. 解码参数** | 各后端各有一套；`repetition_penalty` 只存在于 faster-whisper 系 | whisper.cpp 无重复惩罚项；`-nf` / `-tp 0` / `-et 3.0` / `-nth 0.9` 全部**压不住**该循环；`-bo 1 -bs 1` 反而更差（19 段 / 16 次 "Thank you"） | **不值得改**生产解码；**不引入第三个 ASR 运行时** |
| **3. 检测判据** | OpenAI 用 30s 窗 compression ratio；BoH 用幻觉短语表；WhisperX 靠 VAD + 对齐 | 30s 窗 compression ratio 对该循环**完全漏检**（最大 0.84）；全文 ratio 3.8 能抓但误报 33/143；3-gram 计数 ≥6 命中 37/143、其中 21 例并非循环；**段级循环判据 10/143**：6 例护栏已修 + 4 例未修（3 例护栏完全未判 + FEMA 判了改不了），读文无假阳性 | **值得加**（仅检测、不改写）：把「交错多短语循环」作为独立形状写进护栏结果 |
| **4. 下游处置** | 无共识；各项目按消费方决定 | 固定视频/claim 的 A/B：不传 / 原始循环 / 收敛一次三档，relevance 与画面描述**一致**（302 字符灾难文本没有带偏 VLM） | **不值得改**默认：保留 guarded fullText + provenance，不按 `contaminated` 丢 transcript；唯一丢弃路径是 VAD 确认无语音；TTS 侧保持 fail-closed（§5.4） |

一句话：**该循环的根因是非语音段被当成语音解码，不是「解码器忘了惩罚重复」。** 所以能修的杠杆只有「别把非语音送进解码器」（VAD）和「在文本侧认出并标注这个形状」；调参数与换运行时都不触及根因。

---

## 1. 基线与证据口径

### 1.1 现状（本仓库）

- 生产转写唯一运行时：whisper.cpp `large-v3-turbo`，命令口径 `-t 8 -fa -mc 0`
  （ctx-off 来自 #418 的等价性实验；模型默认见 ADR-0020 §2）。
- 解码后护栏：`scripts/short-video/lib/asr-repetition-guard.mjs`（JS，whisper.cpp 出口）与
  `asr_repetition_guard.py`（Python，装载层出口），判据为**周期感知连续循环**：
  单元 ≤16 词、连续重复 ≥6 次、跨度 ≥18 词 → 保留首次 + `[重复×N已收敛]` 标记；
  另有污染判据（最坏周期运行 ≥6 次，或覆盖率 >0.5 且基数 ≥40 词）。
- 已知边界（`docs/video-production-runbook.md` §④b）：交错多短语循环「判得出、收不了」。
- 下游消费：`asset-sourcer` 把护栏后的 `fullText` 注入 VLM prompt（2000 字符上限）；
  `transcriptGuard` 只作为 provenance 记录，**不参与 prompt 决策**。
- 共享出口：`tts/quality-gate.mjs` 也用同一个 `transcribeVideo`，但消费的是 **segments**
  而非 `fullText`（关键差异，见 §5.3）。

### 1.2 语料与复现对象

| 语料 | 数量 | 用途 |
|---|---|---|
| `.scratch/keyframe-bench/asr_ctxoff/*.json` | 145 份 MLX ctx-off 转写（142 份非空） | 判据覆盖/误报统计 |
| `.scratch/keyframe-bench/asr/*.json` | 3 份 whisper.cpp 生产输出 | 现状核对 |
| `.scratch/keyframe-bench/cpp_loop/` | 1 份 whisper.cpp 生产循环原始音频 + 输出（488.65s） | 主复现对象 |

FEMA 循环的原始输出（本次复跑逐字复现，17 段 / 46 词）：

```text
"The End" ×1 / "For more information, visit www.fema.org" ×4 / "Thank you." ×12
（按 For-info → Thank you ×2/×5/×4/×1 交错排列，不是单调重复）
```

`inspectTranscript` 对它的判定是 `contaminated=true`、`worstRun=1`、`coverage=0.522`
（top 3-gram `thank you thank` ×8，24/46 词）。注意 **0.522 只比 0.50 阈值高 0.022**：
这份生产循环是被覆盖率阈值「擦边」判中的，不是被形状判据判中的。

随报告提交的原始产物（体积很小，可直接复核）：

- `docs/research/whisper-repetition-loops-fema-baseline-2026-10.json` — 生产口径的 FEMA 原始输出（17 段）
- `docs/research/whisper-repetition-loops-fema-vad-2026-10.json` — 同一音频加 VAD（0 段）
- `docs/research/whisper-repetition-loops-vlm-ab-2026-10.json` — §5.2 的三档 A/B 结果
- `docs/research/whisper-repetition-loops-corpus-scan-2026-10.csv` — §4.2 的逐文件指标（143 行；
  `words` 是护栏的**空格切词**计数，与覆盖率同分母，不是正则 token 数）

（whisper.cpp 的 `-oj` JSON 只记录 `model/language/translate`，不记录 `-t/-fa/-mc` 或 VAD 参数；
命令口径以 §8 为准。）

**证据分级**：本地实测（命令与产物见 §8 与 `docs/research/` 下的附属文件）、上游文档/论文、
本报告推断，三类分开写。没有第三方复现，也没有逐段听音标注（见 §7 未知项）。

### 1.3 循环形状分类（runbook §④b 的四类 + 本次新增的子类）

`docs/video-production-runbook.md` §④b 已经把护栏实测边界列成四类；本报告沿用这个分类，
只在第 4 类下面再切出一个子类：

| # | 形状 | runbook 行为 | 本次是否出现 |
|---|---|---|---|
| 1 | 单 token 循环（`Kampung` ×26、`go` ×56） | 收敛 | 是（`0ag_Qi5OEd0` 的 Kampung、`3x8pvm0g5AU` 的 Kepala、`Gokw6n0qf-w` 的 지옥） |
| 2 | 多词短语循环（整句 ×N） | 收敛 | 是（`-XpJeDGh8No`、`3EQzRz-V7uE` 的整句重复） |
| 3 | 跨度 <18 词的连续重复 | 不动（即使 `contaminated=true`） | 本次没有出现「已判但不动」的该类；`1pHkv4KUiFY` 连判都没判（见 4′） |
| 4 | 交错多短语循环（多段交替出现） | 判得出、收不了（FEMA） | 是（生产 FEMA） |
| 4′ | **转写下限之外的循环**（本次新增子类） | 未覆盖：运行下限、分词或严格周期任一不满足即漏 | 是（`-gnfUTPmnNU`、`1pHkv4KUiFY`、`CwzjlmBLfrQ`） |

4′ 不是新形状，而是第 4 类在「短转写 / 额外 token / 无空格脚本」下的变体：形状肉眼可见
（连续 8–9 段只有 1–3 种文本），但严格周期运行立不起来（见 §4.3）。

---

## 2. 轴 1：VAD 门控

### 2.1 业界做法

| 实现 | VAD 的地位 | 默认/入口 | 来源 |
|---|---|---|---|
| whisper.cpp 1.9.1 | 内置 Silero VAD，CLI `--vad -vm <model>`，参数 threshold 0.50 / min speech 250ms / min silence 100ms / pad 30ms | **默认关闭** | 本机 `whisper-cli --help`；上游 `include/whisper.h` 的 `whisper_vad_params` |
| faster-whisper 1.2.1 | `vad_filter=True` 走 Silero；README 明说「默认只删 >2s 的静音」 | **默认 False**（batched 转写默认开） | 本地安装包签名；上游 README |
| WhisperX | 「VAD preprocessing, reduces hallucination」，VAD 切批 + 对齐；`condition_on_prev_text` 默认 False | VAD 是管线固有步骤 | 上游 README |
| OpenAI Whisper | 无 VAD；靠 `no_speech_threshold` + `compression_ratio_threshold` + 温度回退 | — | 上游 `whisper/transcribe.py` |
| ICASSP 2025（arXiv 2501.11378） | 在「语音 + 非语音」合成集上，Silero VAD 把 WER 从 104.8/112.0 降到 **8.0/10.8**，是单项最强；deloop+BoH 为 17.1/21.1，两者合为 6.5/9.4 | — | 论文 Table VII |

**结论（业界）**：VAD 前置确实是重复循环/非语音幻觉的标准处置，且被同行评审的合成集量化过。

### 2.2 本机实测（同一份生产音频）

命令口径与生产一致，只加 VAD：

```bash
# baseline（生产口径）
whisper-cli -m ~/.cache/whisper/ggml-large-v3-turbo.bin -f audio.wav -l en \
  -t 8 -fa -mc 0 -oj -of baseline
# VAD
whisper-cli ... --vad -vm ~/.cache/whisper/ggml-silero-v5.1.2.bin -oj -of vad
```

| 素材 | 基线 | VAD（默认 0.5） | 变化 |
|---|---|---|---|
| FEMA 循环（488.65s，视频 `0ag_Qi5OEd0`，画面实为钩针教程；runbook 归为低信噪/音乐段） | 17 段 / 46 词 / 14.3s | **0 段 / 0 词 / 1.8s** | 循环消失 |
| 干净旁白（`HmnKbBmYii8`，65s） | 5 段 / 54 词 / 2.7s | 6 段 / 52 词 / 1.7s | 词级相似度 0.9623；删 `at last`，`old`→`hole` |
| 歌唱 + 音乐（`-qTAeVGl_e8`，76s） | 7 段 / 62 词 | 3 段 / 16 词 | **−74% 词**（歌词被当非语音） |
| 歌曲（`026dzf-vc5g`，86s） | 12 段 / 86 词 | 1 段 / 2 词 | **−98% 词** |

阈值敏感性（同一批文件）：

| 素材 | vt 0.50 | vt 0.20 | vt 0.10 | vt 0.05 |
|---|---|---|---|---|
| FEMA（非语音） | 0 段 | 0 段 | 1 段（"Thank you."） | 1 段（"*music*"） |
| `-qTAeVGl_e8`（歌唱） | 16 词 | 25 词 | **57 词** | 34 词 |
| `026dzf-vc5g`（歌曲） | 2 词 | 1 词 | 2 词 | 2 词 |

两个事实：

1. **非语音与歌唱在 Silero 眼里是同一类**。降低阈值能捞回一部分歌唱（vt 0.10 把
   `-qTAeVGl_e8` 从 16 词捞回 57 词），但捞不回 `026dzf-vc5g`（全曲只有 2 词），
   同时会把 FEMA 的非语音重新放进解码器（vt 0.10 立刻吐 "Thank you."）。
   **不存在一个同时满足两者的阈值。**
2. VAD 不是延迟成本：它跳过非语音，FEMA 反而从 14.3s 降到 1.8s。代价全在**内容损失**。

峰值内存（`/usr/bin/time -l`，同一音频、同一模型；第二轮回放，墙钟比 §2.2 首测低约 1s，属系统噪声）：

| 口径 | 墙钟 | 峰值 RSS |
|---|---|---|
| 基线 | 13.45s | 2.08 GB |
| VAD | 1.69s | 1.93 GB |

VAD 不增加内存：模型加载是主要项，跳过解码反而略降峰值。

**不要把 FEMA 的「0 段」当成 VAD 能治重复循环的证据**。runbook §④b 把这类循环的根因
归为**低信噪/音乐段**，而 FEMA 音频本身就是非语音：VAD 在这里做的是「确认没有语音」，
不是「把一段有语音的循环解码对了」。本报告没有做低信噪**人声**的负对照，
所以 §2.4 只把 VAD 当确认探针，不当解码修复。

### 2.3 与本仓库现状相比缺什么

- 缺的是「知道这段音频到底有没有语音」这一事实。当前管线只看 `asset.hasAudio`
  （有无音轨），而 FEMA 案例证明**有音轨 ≠ 有语音**。
- 缺的是消费侧的动作：即使护栏判 `contaminated=true`，转写仍原样进 VLM prompt；
  VAD 能提供「这段不该有转写」的证据，但当前没有任何地方消费它。

### 2.4 裁决

- **不作全局默认**：把 `--vad` 塞进 `transcribeVideo` 会让所有音乐/歌唱素材静默掉词，
  与「转写是升级、不是门」的现状契约冲突；这批素材正是 B-roll 的常见形态。
- **值得做的是「检测后确认」**：只在段级形状命中、且护栏没有改写文本
  （`segmentLoop && !changed`，覆盖 `contaminated=false` 的那 3 例）时，
  才对同一音频跑一次 **VAD 探针**：
  - VAD 返回 0 段 → 该转写不可信，下游按「无转写」处理（视觉仍然可用）；
  - VAD 返回 ≥1 段 → 说明音频里确有语音，保留现有转写与护栏行为。
  这样 FEMA 类（整段非语音）被拦住，而歌唱/音乐素材只要 VAD 认为有语音就仍走原文，
  不会因为「歌词不是语音」而丢词。探针只在稀有形状上付费（142 份 MLX + 1 份 cpp 里
  4 例），不进入常态路径。
- 不建议把 VAD 探针放进 `transcribeVideo` 本身：它同时服务 TTS 质检（共享出口），
  那里「有没有语音」的判据必须是 fail-closed 的 ASR 结果，不能被 VAD 的沉默改写。

---

## 3. 轴 2：解码参数

### 3.1 参数矩阵（本机安装版本实测）

| 参数 | whisper.cpp 1.9.1 | MLX whisper 0.4.3 | faster-whisper 1.2.1 | OpenAI whisper（上游 main） |
|---|---|---|---|---|
| `repetition_penalty` | **无** | **无**（`DecodingOptions` 字段表实测） | **有**，默认 1.0（=关闭） | 无 |
| `no_repeat_ngram_size` | **无** | **无** | **有**，默认 0 | 无 |
| 温度回退 | `-tp/-tpi`，可 `-nf` 关闭 | `temperature=(0,0.2,…,1.0)` | 同一套 + `prompt_reset_on_temperature` | 同一套 |
| compression ratio 门 | `-et`（entropy，默认 2.40） | `compression_ratio_threshold=2.4` | 同 | 同（30s 窗内） |
| logprob 门 | `-lpt`（−1.00） | `logprob_threshold=-1.0` | `log_prob_threshold=-1.0` | 同 |
| no-speech 门 | `-nth`（0.60） | `no_speech_threshold=0.6` | 同 | 同 |
| 束搜索 | `-bo 5 / -bs 5` | `best_of=5 / beam_size=5` | 同 | 同 |
| 静音跳过 | **无**（VAD 替代） | `hallucination_silence_threshold` | 同 | 同（需 word timestamps） |
| 跨段上下文 | `-mc/-no-context` | `condition_on_previous_text` | 同 | 同（默认 True） |

**可移植性**：`repetition_penalty` / `no_repeat_ngram_size` 只存在于 faster-whisper
（CTranslate2 采样器），**无法移植**到 whisper.cpp 或 MLX；后两者的解码选项是 OpenAI
原版字段的子集。也就是说，业界最常被引用的「重复惩罚」在本仓库的生产运行时上不存在。

### 3.2 本机实测（FEMA 音频，均为生产口径 + 单变量）

| 变体 | 段数 | "Thank you" 次数 | 词数 | 结果 |
|---|---|---|---|---|
| baseline（`-mc 0`） | 17 | 12 | 46 | 复现生产循环 |
| `-nf`（关闭温度回退） | 18 | 11 | 71 | 仍是循环 |
| `-tp 0 -tpi 0`（不升温） | 18 | 11 | 71 | 仍是循环 |
| `-et 3.0`（放宽 entropy 门） | 17 | 12 | 46 | 不变 |
| `-nth 0.9`（收紧 no-speech 门） | 17 | 12 | 46 | 不变 |
| `-bo 1 -bs 1`（束搜索 1） | 19 | **16** | 54 | **更差** |

补充一条与文献的张力：ICASSP 2025 的 Table VI 报告 beam size 1 的幻觉率最低
（19.5/20.3% vs beam 5 的 28.2/37.4%）。那是在「语音 + 非语音」合成集上按**幻觉率**
统计；本机在「整段非语音」单例上 beam=1 反而更长。两者不矛盾——**beam=1 不是这个形状的解**。

时间轴：所有变体的总跨度都不变（0 → 488.6s），但**改了文本的变体也改了分段**
——`-nf` / `-tp 0` 的 18 个段起点里只有 `0.0` 与基线相同，`-bo 1 -bs 1` 一个都不相同；
`-et 3.0` / `-nth 0.9` 的 17 段起点与基线逐段相同（文本也没变）。
结论：这两个参数要么无效、要么在改变循环的同时重排时间轴，没有「只压重复、不动分段」的开关。

### 3.3 裁决

- **不值得改**生产解码参数：whisper.cpp 侧没有任何一个开关能压住该循环；能压住的参数
  （`repetition_penalty`）不在生产运行时里。
- **不值得**为这一个参数引入 faster-whisper：它违反 ADR-0020 §2 的「whisper.cpp 首选」
  与 runbook §⑤ 固定的「生产转写唯一运行时」（ADR 本身仍保留 WhisperX 做对齐，但那是
  alignment 路径，不是转写后端），
  增加第三个 ASR 运行时与模型权重，而且该参数作用于「已进入解码器的重复」，
  不解决「非语音被送进解码器」的根因。
- 若未来要做，唯一有文献支撑的 MLX 侧参数是 `hallucination_silence_threshold`
  （论文称「slight improvement」，需 word timestamps）——但 MLX 不是生产运行时，
  本票不据此提改动。

---

## 4. 轴 3：检测判据对照

### 4.1 公开判据

| 判据 | 作用粒度 | 判定 | 对 FEMA 循环 |
|---|---|---|---|
| OpenAI `compression_ratio_threshold=2.4` | **每个 30s 解码窗** | 窗内 gzip 压缩比过高即回退温度 | **漏检**（每个 30s 窗只有 1–2 句，实测最大 0.84） |
| 全文压缩比 | 整篇 | 有人用整篇近似 | 命中（3.8），但误报高（见 4.2） |
| 重复 n-gram 计数 | 整篇 | 某个 n-gram 出现 ≥K 次 | 命中（2-gram 12 次、3-gram 8 次），但单独使用误报高 |
| BoH（ICASSP 2025） | 短语表 | Aho–Corasick 匹配已知幻觉短语并删除 | **不命中**：论文明确把 `thank you` 这类高频短语过滤出 BoH（log p −9.22 > −10），而该循环 12/17 段就是 "Thank you." |
| WhisperX | 音频切分 + 对齐 | VAD 切批；`condition_on_prev_text=False` | 通过 VAD 前置避免（与本报告轴 1 同源） |
| 本仓库护栏 | 整篇 + 每段 | 周期运行 ≤16 词 / ≥6 次 / 运行 ≥18 词 / 覆盖率 >0.5（≥40 词） | FEMA：`contaminated=true`、`changed=false`（判得出、改不了）；`CwzjlmBLfrQ` 的 6× "Thank you." 尾巴只有 12 词，**根本没判**（FEMA 自身最长连续 run 是 5） |

### 4.2 本机语料统计（142 份非空 MLX + 1 份 cpp FEMA）

| 判据 | 命中数 | 说明 |
|---|---|---|
| 现有护栏 `changed` | 16/143 | 与 runbook 的 17/148 同量级（语料口径不同） |
| 现有护栏 `contaminated` | 20/143 | 含 FEMA |
| 全文 compression ratio >2.4 | **33/143**（英文 17/102） | 多语种/非拉丁脚本会天然高压缩比，不能当整篇门 |
| 全文 compression ratio >3.0 | 16/143 | 仍含大量真内容 |
| 任一 30s 段 ratio >2.4 | 11/143 | FEMA 的最大段 0.84，**不在其中** |
| 3-gram 出现 ≥6 次 | 37/143 | 含全部 16 例已改写循环，另 21 例不是循环 |
| 3-gram 出现 ≥10 次 | 18/143 | 含 14/16 例已改写循环，仍偏宽 |
| **段级循环判据**（≤3 种不同文本 / ≥6 个非空段 / 跨度 ≥120s） | **10/143** | 10/10 读文为真循环；其中 6 例护栏已改写、4 例未改写（3 例护栏完全未判 + FEMA 判了改不了） |

「不同文本数 ≤ 窗口段数一半」的变体（按比例的版本）会命中 **16** 份，但混入真对话
（`1NcGHbFWBFA` 的 "oh my god / what is it / it's a pigeon on your head"）与字幕署名
（`2za5RwplXdI` 的 "sous titrage mfp"），所以采用绝对上限 3 而不是比例上限。

段级判据命中的 10 份（全部是「连续多段只有 ≤3 种文本」）：

| 文件 | 循环窗口 | 现有护栏 | 复核 |
|---|---|---|---|
| `-XpJeDGh8No`（en） | 19 段 / 235s / 3 种 | 已改写 | 真循环 |
| `-gnfUTPmnNU`（km） | 8 段 / 240s / 3 种 | **未判**（`contaminated=false`） | 高棉文垃圾串；**VAD 0 段**，整段非语音 |
| `0FM64MrRuZE`（ko） | 11 段 / 570s / 3 种 | 已改写 | 真循环 |
| `0ag_Qi5OEd0`（jw） | 26 段 / 508s / 3 种 | 已改写 | Kampung ×26 |
| `1pHkv4KUiFY`（en） | 9 段 / 267s / 1 种 | **未判**（`contaminated=false`） | 9 段 "Thank you."；**VAD 0 段**，整段非语音 |
| `3EQzRz-V7uE`（si） | 12 段 / 358s / 3 种 | 已改写 | 真循环 |
| `3x8pvm0g5AU`（jw） | 32 段 / 385s / 3 种 | 已改写 | Kepala ×N |
| `CwzjlmBLfrQ`（en） | 8 段 / 232s / 3 种 | **未判**（`contaminated=false`） | 真人旁白 + 6× "Thank you." 尾巴；**VAD 保留旁白、丢掉尾巴** |
| `Gokw6n0qf-w`（ko） | 67 段 / 373s / 3 种 | 已改写 | 지옥 ×N |
| `[cpp FEMA loop]` | 17 段 / 489s / 3 种 | 判坏未改写（`contaminated=true`、`changed=false`） | 生产循环本体 |

结论：段级判据补上的不只是「判得出、改不了」，还有**三类护栏完全没判的转写**
（护栏词数 11–92，见下）：护栏要求「≥18 词的严格周期运行」，而这三例各自缺一样——
高棉文按空格切只剩 11 个 token（重复落在 token 内部，3-gram 没有可比单元）、
`¶¶` 作为额外 token 打断周期、6× "Thank you." 只有 12 词（低于运行下限）。
它们在段级形状上却非常显眼（连续 8–9 段只有 1–3 种文本）。
在这批语料上 10/10 读文为真循环，**但没有听音标注，不能声称召回率**。

三个「护栏未判」案例的 VAD 复核是独立证据：`1pHkv4KUiFY` 与 `-gnfUTPmnNU` 的 VAD 输出
均为 0 段（整段非语音）；`CwzjlmBLfrQ` 的 VAD 输出保留 Sir Simon Rattle 旁白、
删除 "Thank you" 尾巴（尾巴是非语音/掌声）。

### 4.3 与本仓库现状相比缺什么

- 缺一个**可机读的形状标签**。`contaminated` 只在 FEMA 这类被覆盖率「擦边」判中的样本上
  为 true；另外 3 例连 `contaminated` 都没有，provenance 里没有任何痕迹。
- 护栏的绝对下限（≥6 次重复、运行 ≥18 词、覆盖率基数 ≥40 词）都是为长转写调的。
  实测三种漏判机制：
  - **运行太短**：6× "Thank you." 只有 12 词，周期运行不成立（`MIN_RUN_WORDS=18`），
    覆盖率基数也不够（12 < 40）。
  - **额外 token 打断周期**：`¶¶` 不在 `STRIP_CHARS` 里，归一化后不是空，
    因此作为**普通 token**（不是占位符）进入序列，把「thank you」的严格周期打断；
    同一文本去掉 `¶¶` 后 `contaminated` 立刻为 true
    （本机复现：9× "Thank you." = 18 词 → true；插入 `¶¶` 后 19 词 → false）。
  - **无空格脚本切不出词**：高棉文按空格切只剩 11 个 token，重复落在 token 内部，
    3-gram 没有可比单元（CJK 则直接走 `wordless-script` 跳过）。
- FEMA 的覆盖率余量只有 0.022（0.522 vs 0.50），同一形状稍短一点就会掉出判定。
- **无空格脚本是另一条盲区**：护栏对 CJK 直接跳过（`skipped: "wordless-script"`），
  中文/日文转写根本不进入周期判据；高棉文虽然不被跳过，但按空格切只剩 11 个 token，
  周期判据同样失效。本批语料里 ko/si 有空格、走的是正常路径；zh/ja 没有语料，
  段级判据（按段计数，不依赖分词）是那边唯一现成的形状信号。
- 段级判据不依赖词数、覆盖率或严格周期，只数「连续多段里有几种文本」，因此这 4 例都命中。

### 4.4 裁决

- **值得加（仅检测）**：在护栏结果里增加段级循环形状（例如
  `shape: "interleaved-segments"` + `segmentLoop: {segments, spanSeconds, distinctTexts}`）。
  **不改写文本**：交错循环的「该删哪段」没有可靠答案，删错就是篡改真实内容。
  收益：4 例新增有标签（其中 3 例连 `contaminated` 都没有），下游与 VAD 探针都能据此
  分支；成本：纯文本计算，JS/Python 双实现 + 跨语言向量测试
  （沿用现有 `asr-repetition-guard.test.mjs` 的模式）。
- **不值得**上 BoH 短语表：论文自己的设计就把它过滤掉了 `thank you`（避免误删真实致谢），
  而本仓库的循环主体正是 `thank you`；引入它既抓不到该形状，又会与「真实内容不改写」
  的保守方向冲突。
- **不值得**用全文 compression ratio 当门：英文语料 17/102 误报，非拉丁脚本更差。

---

## 5. 轴 4：下游处置

### 5.1 实际消费形态（代码已核）

- **VLM 资产分析**：`asset-sourcer.mjs` 把 `guarded.fullText` 传给 `vlm_analyzer.py`；prompt 里
  transcript 是**前置块**（`视频的语音转写（可能不完整、可能有错）：` + 前 2000 字符），
  后接 claim 块与 base 指令。**没有段边界、没有时间戳**——下游拿到的是一个字符串。
- **provenance**：`transcriptGuard`（`contaminated/changed/worstRun/collapsedSegments`）
  只被记录，没有任何消费者据此分支。
- **缓存**：`computeCacheKey` 的输入含 transcript 文本，所以任何「改写/丢弃」策略都会让
  受影响素材的分析缓存失效。
- **TTS 质检**：同一个 `transcribeVideo`，但 `quality-gate.mjs` 读 `result.segments`，
  不读 `fullText`；`guardTranscript` 会改写**段内**循环（见 5.3 实测）。

### 5.2 A/B：同一视频、同一 claim、同一 prompt、同一引擎

设置：`0ag_Qi5OEd0.mp4`（488.65s，FEMA 循环音频，画面是钩针教程）；claim
`{voiceover: "The agency explains how to get disaster relief after the hurricane",
assetNeed: "official emergency relief information"}`；Qwen3-VL-30B-A3B-Instruct-4bit；
`build_semantics_prompt(is_video=True, claim, transcript)`。三档 transcript：

| 变体 | transcript | 字符 | relevance | 描述要点 | 墙钟 |
|---|---|---|---|---|---|
| no_transcript | 不传 | 0 | 0 | 钩针八爪鱼钥匙扣，蓝色毛线 + 罐头盖做圈 | 167.3s（含首轮预热） |
| raw_loop | **生产实际送入 prompt 的 guarded fullText**（302 字符，`changed=false`，4× For-info + 12× Thank you） | 302 | 0 | 同上，另提 loom / 眼睛 / 钥匙圈 | 96.4s |
| collapsed_once | 手工收敛为 `The End. For more information, visit www.fema.org. Thank you.` | 61 | 0 | 同上，另提棉签 / 热熔胶（纯视觉细节） | 92.5s |

观察：

- 三档 relevance 都是 0，描述都以画面为准。`raw_loop` 的 `relevanceReason` 甚至明确写了
  "no connection to disaster relief or FEMA … completely unrelated to the scene claim
  about hurricane relief"——**transcript 确实被读进了 relevance 推理**，结论仍是 0。
- 模型确实读到了 transcript：透传的 `transcriptChars` 与 prompt 一致（302/61），没有被截断。
- 三档描述差异（棉签/热熔胶/loom）来自视觉采样随机性，与 transcript 内容无关。
- **n=1，不能外推**。本视频画面语义无歧义；当画面模糊、必须靠语音定题时，
  transcript 的权重可能完全不同——这正是 §7 要留的复测协议。

### 5.3 「同出口不同策略」的实测

- `guardTranscript` 对 6 个完全相同的段（跨段循环）实测：`segments` **不变**
  （`collapsedSegments=0`），只有拼接后的 `fullText` 被收敛并加 `[重复×N已收敛]`。
- 因此 TTS 质检读 segments 时，**跨段重复仍会被它看到**（这是好事）；但**段内**循环
  会在到达质检前被护栏改写，质检只能看到收敛后的文本。若将来要以「重复」作为 TTS 失败
  信号，必须拿 raw segments 或 `guard.changed`，不能只看 guarded segments。
- 结论：**共享 `transcribeVideo` 出口 ≠ 共享失败策略**。VLM 侧 fail-open（transcript 只是
  上下文），TTS 侧必须 fail-closed（现有实现已如此，保持）。
- **raw 目前不落盘**：`asset-sourcer` 把 ASR 产物写进 `mkdtemp` 目录，`finally` 里
  `rmSync` 删除；`transcriptGuard` 只留下判定结果，raw 文本与段边界都不留。
  所以 (e) 要求的「raw + processed + provenance」目前只满足后两项——发生改写或形状命中时，
  事后能看到的只有 `asset-analysis.json` 里的 `transcriptChars` 与 guard 计数。

### 5.4 裁决

- **「时间轴留空」在现状里不存在**：transcript 从来不带时间轴进 prompt，所以这个选项
  无法实现为 A/B 的一种；能做的只是「整段不传」。
- **「整段不传」不值得作为通用默认**：本实验里没有可测收益（relevance 与描述三档一致），
  却会让「画面模糊、靠语音定题」的素材失去唯一线索，且让缓存全量失效。
- **「收敛改写」只对可判定的重复形状成立**；交错循环无法安全改写（§4.4）。
- **「保留但打标」是唯一不引入新风险的选项**：不改文本、不改缓存语义，只把
  「这条 transcript 判过、属于哪种形状」写进 provenance，供未来策略与审计使用。
- **唯一的「不传」例外是 VAD 确认无语音**（§2.4）：VAD 0 段时，空转写不是信息损失，
  而是对「这段音频没有说话」这一事实的纠正；它由 VAD 证据触发，**不由 `contaminated` 触发**。

因此 Q4 的回答是：**默认维持现状（保留 guarded fullText + provenance）；不因
`contaminated` 丢 transcript，不新增「按标记丢弃/留空」分支**；把 §6 建议 1 的形状标签
与建议 2 的 VAD 确认作为唯一增量。若未来出现「画面模糊 + 语音定题」的素材，
按 §7 的协议重跑 A/B 再决定。

---

## 6. 建议清单

> 本节是后续票的输入，不是本票授权的改动；真要实施时按 `implementation-workflow.md`
> 重新做 scale/risk 判定与 TDD。

| # | 建议 | 改动点 | 预期收益 | 代价/风险 | 验证 |
|---|---|---|---|---|---|
| 1 | 段级循环仅检测 | `lib/asr-repetition-guard.mjs` + `asr_repetition_guard.py` 的 `inspect`/`guard` 结果；`transcriptGuard` 由 ASR 侧重算、不进 VLM 缓存键，无需 bump `VLM_CACHE_*_VERSION` | 4 例新增可识别（142 份 MLX 中 3 例护栏完全未判 + 生产 FEMA 判了改不了），下游与 VAD 探针可据 `shape` 分支 | 纯文本计算；需双实现一致性测试 | 现有跨语言向量 + 新增 10 例语料回归 |
| 2 | VAD 二次确认 | 只在 `shape === "interleaved-segments" && !changed` 时，由 **asset-sourcer 调用方** 跑 VAD 探针，结果写 provenance（`vadProbe: "no-speech"` / `"speech-present"`）；`no-speech` 时下游按无转写处理，`speech-present` 时保留原转写 | 让「判得出、改不了」可归因（本次 3 例全是非语音），并给「无语音」一个由证据触发的丢弃路径；对正常人声零影响 | 稀有路径多一次 VAD 进程（1.7s / +0 GB 峰值）；需新增 `vadProbe()` 叶子函数；改动只在 asset-sourcer 调用方，不进 `transcribeVideo` | FEMA/1pHk/gnf/Cwzj 四例 + 干净旁白对照 |
| 3 | 不改全局 VAD / 解码参数 / 运行时 | — | 避免音乐/歌唱素材静默丢词；保持 ADR-0020 §2 的 whisper.cpp 首选与 runbook §⑤ 的唯一生产运行时 | — | 本报告 §2.2/§3.2 |
| 4 | 保留 raw（仅形状命中或改写时） | `asset-sourcer` 在 `rmSync(asrDir)` 前把 raw 文本（或 hash + 截断）写进 provenance；`transcribeVideo` 已能返回未改写的 segments | 补齐「raw + processed + provenance」；事后能审计护栏改了什么 | 只对稀有样本落盘；不进 VLM prompt、不进缓存键 | FEMA/1pHk/gnf/Cwzj 四例 + 干净对照 |

---

## 7. 未知与未做

- **未做逐段听音**：148 份语料的人工标注需要听音，本报告用「文本形状 + VAD 复核」
  三角化（10 个段级判据命中中 4 个有 VAD 独立证据），但没有人工听音标注，
  不能声称召回率。逐文件指标已随报告提交：
  `docs/research/whisper-repetition-loops-corpus-scan-2026-10.csv`。
- **VAD 在「音乐 + 人声」上的收益只测了 2 份素材**；没有覆盖「低信噪人声」「重叠说话」。
- **内存只在 FEMA 上测了一次**（2.08 → 1.93 GB 峰值）；没有在长音频、并发或音乐素材上
  复测 VAD 的额外占用。
- **raw 文本不落盘**：生产在 `rmSync` 后只剩 guarded 文本与 guard 计数（§5.3）。
  本报告用 §1.2 的附属文件补 raw 一侧，但那是研究产物，不是生产保留。
- **TTS 质检的共享出口未动**：段内循环会在到达质检前被护栏改写（§5.3）。
  要不要把 raw segments 或 `guard.changed` 透传给质检，属于独立的后续票，
  本报告只记录风险，不据此提改动。
- **zh/ja 没有语料**：护栏对无空格脚本走 `wordless-script` 跳过路径，本报告没有验证
  段级判据在中文/日文转写上的假阳性率。
- **BoH 未在本地语料上跑**：只核对了论文的过滤规则与命中形状；未下载其短语表做 A/B。
- **Q4 的 A/B 目前是单视频单 claim**（见 §5），不足以给出跨内容包的统计结论。
  复测协议：出现「画面模糊、必须靠语音定题」的素材时，用该素材跑
  `no_transcript / raw_loop / collapsed_once` 三档，claim 取真实定题，
  判定看 relevance 与 `description` 是否随 transcript 变化；只有出现明显差异才重开下游策略。
- **whisper.cpp 1.9.1 与上游 master 的 VAD 时间轴映射**：本机实测跨度 55.2s → 55.3s、
  段边界改变；上游 `whisper.h`（master）文档说明 token 时间会映回原始时间轴。
  本报告按本机 1.9.1 行为陈述，不把 master 文档当作 1.9.1 的保证。

---

## 8. 复现

以下命令假设 `.scratch/keyframe-bench/` 的语料与音频还在本机（gitignored，不随仓库分发）。
仓库内可直接复核的是 §1.2 的三个 JSON 与 CSV；判据统计脚本是 scratch 里的临时助手，
其判据已在 §4.2 写成一句话（≤3 种不同文本 / ≥6 个非空段 / 跨度 ≥120s）。

```bash
# 语料与 FEMA 原始音频（主 checkout 的 .scratch，gitignored）
ls .scratch/keyframe-bench/asr_ctxoff | wc -l          # 145
ffprobe .scratch/keyframe-bench/cpp_loop/audio.wav      # 488.65s

# VAD 模型（whisper.cpp 官方脚本的同一来源）
curl -L -o ~/.cache/whisper/ggml-silero-v5.1.2.bin \
  https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin

# 基线与 VAD（生产口径 + 单变量）
whisper-cli -m ~/.cache/whisper/ggml-large-v3-turbo.bin -f audio.wav -l en \
  -t 8 -fa -mc 0 -oj -of baseline
whisper-cli -m ~/.cache/whisper/ggml-large-v3-turbo.bin -f audio.wav -l en \
  -t 8 -fa -mc 0 --vad -vm ~/.cache/whisper/ggml-silero-v5.1.2.bin -oj -of vad

# 峰值内存（§2.2 的 2.08 / 1.93 GB）
/usr/bin/time -l whisper-cli ... -mc 0 -oj -of baseline    # maximum resident set size

# 判据统计（段级形状 + 压缩比；CSV 即报告附表）
CSV_OUT=docs/research/whisper-repetition-loops-corpus-scan-2026-10.csv \
  node .scratch/asr-repetition-research/scan.mjs

# 下游 A/B（Qwen3-VL-30B，三档 transcript；结果 vlm_ab.json）
~/.venvs/mlx-vlm/bin/python .scratch/asr-repetition-research/vlm_ab.py
```

判据本体（不依赖 scratch 脚本，`segs` 为 `{start,end,text}[]`）：

```js
const norm = (t) => (String(t).toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).join(" ");
function loopWindow(segs, maxDistinct = 3, minSegs = 6, minSpanS = 120) {
  let best = null; // 取非空段最多的窗口，与 CSV 的「窗口」列一致
  for (let i = 0; i < segs.length; i += 1) {
    const seen = new Set();
    let nonEmpty = 0;
    for (let j = i; j < segs.length; j += 1) {
      const key = norm(segs[j].text);
      if (key && !seen.has(key)) {
        if (seen.size + 1 > maxDistinct) break; // 再延伸只会更多种
        seen.add(key);
      }
      if (key) nonEmpty += 1;
      const span = segs[j].end - segs[i].start;
      if (nonEmpty >= minSegs && span >= minSpanS && (!best || nonEmpty > best.nonEmpty)) {
        best = { nonEmpty, span, seen };
      }
    }
  }
  return best;
}
```

---

## 9. 来源

网页与仓库来源在 2026-10-27 访问；本机签名/`--help` 类来源只在对应版本上成立（见文首环境）。

1. whisper.cpp 1.9.1 本机 `whisper-cli --help`（VAD/解码参数与默认值）。
2. whisper.cpp `include/whisper.h`（master）：`whisper_full_params`、`whisper_vad_params`、
   VAD token 时间轴映射说明。https://github.com/ggml-org/whisper.cpp
3. whisper.cpp `models/download-vad-model.sh` 与 Hugging Face `ggml-org/whisper-vad`
   （VAD 模型来源与可用版本 silero-v5.1.2 / v6.2.0）。
4. OpenAI Whisper `whisper/transcribe.py`（上游 main）：温度回退、30s 窗
   `compression_ratio_threshold=2.4`、`condition_on_previous_text`、
   `hallucination_silence_threshold`。https://github.com/openai/whisper
5. faster-whisper 1.2.1 本机 `WhisperModel.transcribe` 签名（`repetition_penalty=1`、
   `no_repeat_ngram_size=0`、`vad_filter=False`、`hallucination_silence_threshold=None`）
   与上游 README（Silero VAD、默认只删 >2s 静音）。
   https://github.com/SYSTRAN/faster-whisper
6. mlx-whisper 0.4.3 本机 `DecodingOptions` 字段表（无 `repetition_penalty` /
   `no_repeat_ngram_size`）与 mlx-examples `whisper` README。
   https://github.com/ml-explore/mlx-examples/tree/main/whisper
7. WhisperX README（VAD preprocessing reduces hallucination；`condition_on_prev_text`
   默认 False）。https://github.com/m-bain/whisperX
8. Barański et al., “Investigation of Whisper ASR Hallucinations Induced by Non-Speech
   Audio”, ICASSP 2025（BoH 定义与 `thank you` 过滤、Table VI/VII 参数与缓解对比）。
   https://arxiv.org/abs/2501.11378
9. 本仓库 `docs/video-production-runbook.md` §④b（148 份语料行为表）、
   `scripts/short-video/lib/asr-repetition-guard.mjs`、
   `scripts/short-video/lib/asr_repetition_guard.py`、
   `scripts/short-video/lib/asset-sourcer.mjs`、`scripts/short-video/lib/tts/quality-gate.mjs`。
