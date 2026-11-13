# VLM Relevance 准确性测试方案（图片轨）

> **下游票**：#541（本文即该票的交付物）。阈值／prompt／pairwise 接口的落地改动不在本文范围内，需另立实施票并在授权后改 `lib/relevance-verdict.mjs` 与 `lib/vlm_analyzer.py`——本轮只交研究、脚手架与容忍度选项。
> **状态**：2026-11-13 重写。旧版（2026-10-10）按「2B 默认 + GLM 升级」的 cascade 前提写成，该路径已不存在；本文按当前 v6 prompt 与单引擎结构重新锚定，并记录旧版 6 处腐烂的实测证据。
> **关联**：#334（紧凑 claim prompt）、#294（40–59 二阶段判决）、#396（YuNet 焦点检测）、#310（素材库 epic）。路径除特指外均相对 `scripts/short-video/`。

## 1. 生产现状（v6-2026-10-27）

### 1.1 引擎与模型

单个 analyzer 进程只加载一个引擎，没有级联、没有升级路由（`lib/vlm-model.json`）：

| engine | modelId | videoInput | concurrency |
| --- | --- | --- | --- |
| `qwen3-vl-moe`（默认） | `~/models/Qwen3-VL-30B-A3B-Instruct-4bit` | native | 1 |
| `qwen3-vl-thinking` | `~/models/Qwen3-VL-30B-A3B-Thinking-4bit` | native | 1 |
| `minicpm` | `~/models/MiniCPM-o-4_5-4bit` | frames | 2 |

本机 `~/models/` 实盘为上述三个 + `cosyvoice3-mlx`。**没有** 2B，也**没有** GLM——旧版设计稿的对比臂（含「2B 不准就升级 GLM」）无法复现。

### 1.2 首轮 prompt 与判分口径

`build_semantics_prompt(is_video, claim)`（`lib/vlm_analyzer.py:485`）在 claim 模式下：

1. 前置 preamble：`Scene claim for relevance scoring:` + `Scene narration: "{voiceover}"` + `Desired visual: "{assetNeed}"`；
2. 任务体 `SEMANTICS_PROMPT_IMAGE_CLAIM`（`:307`）：Description / Subjects / Content Kind / Critical Edge Text / Fit；
3. 输出段 `## Relevance` + `## Relevance Reason`。

打分锚点是三档自由整数（`:524-539`）：**100 = 可见主体正是 claim 所指的公司/产品/人/地点/事件；50 = 同域但主体通用或不同；0 = 无关主体**。明确要求「判断可见主体，不要求画面拍到融资、战略这类抽象事件」，并写明「不同语言的画面文字本身不是负面证据」。

图片在进模型前会先做 9:16 cover 裁剪模拟（`simulate_crop`，`:1081`），裁剪锚点来自 focus 检测的 saliency 质心（`lib/crop-decision.mjs:321` `saliencyCropHint`）。**模型看到的是裁切后的画面，不是原图**——标注与实验臂必须核对裁切后的可见内容。

### 1.3 两阶段判决（#294）

首轮 40–59 分不构成判决。`lib/relevance-verdict.mjs` 定义：

- `DEFAULT_RELEVANCE_THRESHOLD = 60`（`:28`）、`BORDERLINE_FLOOR = 40`（`:34`）；
- `needsSecondPass()`（`:90`）：仅 `borderline` 且尚未检查过时触发；
- `isRelevanceAdmitted()`（`:149`）：`pass` 直接准入；`borderline` 只有在二阶段明确 `match` 时准入；其余（`no_match`、缺失、解析失败）保持关闭。

二阶段 prompt 是 `RELEVANCE_CHECK_PROMPT_IMAGE`（`lib/vlm_analyzer.py:372`），一问一答的严格枚举——`## Subject Match` 输出 `match` / `no_match`，理由是主体同类性，不是事件复现。调用点在 `lib/asset-sourcer.mjs:1925-1952`。

**两个消费方的规则并不相同**：sourcing 侧跑两阶段（`asset-sourcer.mjs`），B-roll gate（`lib/b-roll/gate.mjs:52-79`）只用首轮 `band === pass`，从不发 `relevanceCheck`。实验必须把这两条规则分开报，不能混成一个「生产准确率」。

**两条路径连像素都不同**：sourcing 侧把 `cropFocus`（saliency 锚点）一起传给 analyzer，模型看的是裁切后的画幅；gate 侧 `scoreCandidates` 只传 `{claim}`，模型看的是中心裁切。同一素材、同一 claim，两条路径喂进去的画面不一样，分数不可直接互换。本实验按 sourcing 形态采集（`meta.framing = "saliency-crop"`）。

### 1.4 解析器契约（现行）

`_parse_relevance_value()`（`lib/vlm_analyzer.py:544`）只接受**首行整体就是分数**的形态：裸整数、`85/100`、`**70**`、`Score 0`、`70 - 说明`。首行以数字开头但整体不是分数的散文（如 `85 out of 100`、`3 examples of charts`）一律 fail-closed 为 `None`——这是防编造分数的既定行为，不是缺陷。

### 1.5 缓存

- Node 侧：`lib/vlm-cache.mjs:75` `VLM_CACHE_PROMPT_VERSION = "v6-2026-10-27"`；`VLM_CACHE_DISABLED=1` 关闭读取。
- B-roll 报告复用层：`b-roll-report.json` 会复用旧 winner，重跑需 `--force`（`lib/b-roll/report.mjs` 修复提示即 `generate-broll.mjs ... --force`）。
- 本轮脚手架**天然绕过两层**：直接对冻结文件调 Python analyzer，从不经过 Node 缓存，也不重跑生成器。

## 2. 旧设计稿的 6 处腐烂（已修）

| # | 旧陈述 | 实测（2026-11-13） | 处理 |
| --- | --- | --- | --- |
| 1 | `Qwen3-VL-2B` 默认，`should_escalate(claim_mode=True)` 升级到 `GLM-4.1V-9B-Thinking`（旧 §1.3 / §4.1） | `scripts/` 下 `should_escalate` 命中 0 个文件；`vlm-model.json` 只有上表三个引擎 | 删除 cascade 章节，改为单引擎事实 |
| 2 | 对比臂 = 2B / GLM-9B / 30B-A3B | `~/models/` 无 2B、无 GLM | 对比臂改为「同模型多采样 / 重启复测」；跨模型对比需另立票（模型不在盘，下载与许可是独立决策） |
| 3 | `"85/100"` 等变体返回 `None`（旧 §6 前置） | `_parse_relevance_value` 已支持 `/100`、`**70**`、`Score 0`、`70 - prose`；`test_claim_prompt.py:214` 明确断言 `85/100 → 85` | 改写为现行契约；同时记录：旧票评论里「`test_claim_prompt.py` 前置断言失败」已过时，该文件现 78/78 通过 |
| 4 | 完全没提两阶段判决 | 40–59 触发 `RELEVANCE_CHECK_PROMPT_IMAGE`，准入规则见 §1.3 | 新增 §1.3；实验按两段分别采集 |
| 5 | 没写缓存绕过 | 双层缓存（`VLM_CACHE_DISABLED` / `--force`） | 新增 §1.5，并在脚手架里以「不经过缓存」的调用形态固化 |
| 6 | 17 对「GT」写成 90–100 的精确分（如「A 就是 Alibaba 展台，GT 95」） | 逐图核对：A 实为「阿里中心」办公楼（不是展台）、B 是电子元件/电路板（不是芯片特写）、C 是通用柱状图海报、D 是俄文 HTML 源码、F 是无标识玻璃中庭 | GT 改为人工二值「可用／不可用」+ 三档设计意图（direct/generic/unrelated）；精确分一律废弃——人对绝对分同样不可靠，这是 2604.25235 结论在标注侧的镜像 |

> 第 6 条是本次最重要的发现：旧稿的 GT 数字不是任何人的标注，而是写文档时的推测，且与素材实际内容不符。用它当基准会把「模型判 65」误记为假低。

## 3. 实验设计

### 3.1 数据

- 清单：`bench/relevance/cases.json`。6 张图片 × 13 个 claim 对（设计稿 17 对里的视频对按票面「图片轨」范围移出）。
- 素材位于 `assets/` 且被 `.gitignore` 的 `pexels-*` 规则忽略——**新 worktree 里没有这些文件**，必须 `--assets-dir` 指向有素材的 checkout。这是可复跑性的真实约束，不是配置洁癖。
- 分割：本集规模不足以切 dev/test（13 对），因此本轮定位是**链路验证 + 规模测算**，不是准确率定论。扩样与 dev/test 切分的判据见 §5.3。

### 3.2 标注协议（半自动，判断权在人手上）

1. `queue` 先跑 focus 检测（YuNet 人脸框 + saliency 质心），对每张图给出候选焦点与生产 9:16 裁切窗口，并渲染「原图 + 裁切后」两视图。
2. 人只做**接受／拒绝**：
   - 焦点项：主体是否落在候选裁切窗口内；
   - claim 项：该图（裁切后）能否**直接支撑**这句旁白——可用／不可用／不确定。
3. 检测器输出**不自动成为 GT**。`labels.json` 只由人导出；`eval` 对缺失标签的项按缺失处理，不猜。
4. 唯一的自动预判是几何事实：若检测到的主体框完全落在裁切窗口外，`framing-auto` 记为不可用——这是裁切几何，不是模型投票，且需要人对该素材焦点项点过「接受」才生效。
5. 标注页不展示任何模型分数（`test_relevance_bench.py::test_queue_never_carries_model_scores` 守着这条）。

### 3.3 实验臂

| 臂 | 形态 | 度量什么 | 为什么需要 |
| --- | --- | --- | --- |
| `intra` | 同一进程内重复 N 次 | 解码/传输确定性 | 生产 temperature = 0.0（`vlm_analyzer.py:955,980-985`），单进程重复**不是**独立随机样本 |
| `restart` | 每个重复一个全新进程 | 跨进程漂移 | #334 实测同一输入同一 claim 跨 run 出现 50 → 0；这是唯一被观察到的真实漂移 |
| `sampled`（未实现） | 采样解码 | 解码随机性 + 聚合收益 | 需要改温度 = 改生产路径；属另立票范围，本轮不做 |

默认 `--repeats 5 --restarts 2`。

### 3.4 可复跑与证据

每次运行落 `scores.json`（逐次 raw 输出、解析值、耗时、错误）与 `metrics.json`／`report.md`。`scores.json` 的 `meta` 记 analyzer sha256、`vlm-model.json` sha256、manifest sha256、引擎、阈值与温度——同一命令重跑应得同一分数矩阵；若不同，差异本身就是要观测的漂移。

### 3.5 指标定义

| 指标 | 定义 | 口径 |
| --- | --- | --- |
| GT | 人对 (图 × claim) 的二值判断 | `usable` / `unusable`；`unsure` 与缺失**排除**，不折算 |
| 误放（FP） | GT `unusable` 但模型准入 | FPR = FP / GT 不可用数 |
| 误拒（FN） | GT `usable` 但模型不准入 | FNR = FN / GT 可用数 |
| `sourcing` 规则 | 首轮 ≥60，或 40–59 且二阶段 `match` | 与 `isRelevanceAdmitted` 一致 |
| `gate` 规则 | 首轮 ≥60 | 与 `b-roll/gate.mjs` 一致（不发二阶段） |
| 解析失败 | `relevance === null` | 单列，不并入低分 |
| 稳定性 | 同 case 跨重复的分数集合 / 分差 / 跨 60 翻转 | 分臂报，不把重复数当独立样本量 |

区间一律 Wilson 95%；零事件时另报 rule-of-three 上界（`3/n`）。

## 4. 首次运行结果（2026-11-13）

> **GT 状态：人工标注已完成（2026-11-13，`labels.json`，可用 5 / 不可用 6 / unsure 2）。正式指标见 §4.5。** §4.2–§4.3 保留写 case 时的 `design` 标签视角，用于对照「设计意图 vs 人工判断」；它们本身不是准确性结论。

### 4.1 运行配置

| 项 | 值 |
| --- | --- |
| 引擎 / 温度 | `qwen3-vl-moe`（Qwen3-VL-30B-A3B-Instruct-4bit）/ 0.0 |
| 阈值 / 边界带 | 60 / 40–59 走 #294 二阶段 |
| 裁切形态 | `saliency-crop`（与 sourcing 一致，传 `cropFocus`） |
| 重复 | intra 5 次 × 13 例 + restart（全新进程）2 次 × 13 例 = **91 次首轮** + 边界例二阶段 |
| analyzer sha256 | `9a01ed841dbd…`（`lib/vlm_analyzer.py`，v6 prompt 版本周期内） |

### 4.2 分数矩阵

所有重复结果完全一致，故每例只列一个分数（`首轮 → 二阶段`）：

| case | 素材 | design | 首轮 | 二阶段 | 生产判定 | 模型给的理由（节选） |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | alibaba-01 | 可用 | 50 | match | 放行 | 「是 Ali Center，与阿里相关，但它是建筑而非产品」 |
| A2 | alibaba-01 | 不可用 | 0 | — | 拒绝 | 「阿里中心与 DeepSeek 模型无关」 |
| A3 | alibaba-01 | 可用 | 80 | — | 放行 | 「阿里中心是中国科技公司总部」 |
| B1 | ai-chip | 可用 | 50 | match | 放行 | 「主板属于可承载 AI 芯片的硬件」 |
| B2 | ai-chip | 不可用 | 0 | — | 拒绝 | 「硬件但没有定价/界面信息」 |
| C1 | chart-01 | 可用 | 50 | match | 放行 | 「图表可比对数据，与 benchmark 相关」 |
| C2 | chart-01 | 不可用 | 0 | — | 拒绝 | 「通用图表，没有 OpenAI 信息」 |
| D1 | code-02 | 可用 | 50 | match | 放行 | 「代码截图与开源主题相关」 |
| D2 | code-02 | 不可用 | 0 | — | 拒绝 | 「HTML 代码与芯片产线无关」 |
| E1 | dc-server | 可用 | 80 | — | 放行 | 「机房与智算中心直接相关」 |
| E2 | dc-server | 不可用 | 0 | — | 拒绝 | 「机架与模型能力无关」 |
| F1 | architecture-03 | 可用 | 0 | — | **拒绝** | 「通用现代建筑，无可识别机构标识」 |
| F2 | architecture-03 | 不可用 | 0 | — | 拒绝 | 「建筑没有语音助手界面」 |

混淆矩阵（design 标签，n 可用 7 / 不可用 6，两条臂相同）：TP 6 · FN 1 · FP 0 · TN 6 → FPR 0（[0, 39%]）、FNR 0.143（[0.026, 0.514]）、accuracy 0.923。

### 4.3 结论

1. **零漂移，两个臂都是 13/13。** 同一份素材字节、同一 v6 prompt、温度 0，在 5 次同进程重复与 2 个全新进程之间分数完全一致。旧设计稿/#334 评论里记录的 50 → 0 **在本集 13 例上不能复现**——至少在这批输入上，它不是解码随机性，也不是进程重启抖动；#334 当时的差异更可能来自 prompt 版本变更本身（该评论比较的正是改动前后）。13 例不足以证明「所有输入都稳定」，但足以推翻「中间分天生抖动」这个笼统前提。
2. **绝对分是离散标签，不是刻度。** 91 次首轮只出现 **{0, 50, 80}** 三个值：不可用一律 0，可用但主体泛化一律 50，主体直接对应（总部大楼/机房）80。**没有任何 60–79 分，也没有 1–49 分**。这与「VLM 会排序、不会打分」一致：60 这条线实际上在问「模型是否给到 80 档」，而 40–59 边界带就是 50 档。
3. **边界带事实上由二阶段决定。** 4 个 50 分例全部走二阶段，且全部得到 `match`（0 个 `no_match`）。在 sourcing 规则下二阶段不是兜底而是**主要通道**之一：整条链路里 4/7 可用例靠它放行。
4. **唯一与 design 不符的是 F1**（玻璃中庭 vs「研究机构建筑外观」，模型给 0 并说明「无机构标识」）。这一例正好说明 GT 必须由人给：模型判 0 与设计者判「可用」都能自圆其说，谁对取决于标注口径，不是模型能力。
5. **同素材换裁切会改变准入。** 同一模型在 center-crop 下把 B1 判成 `no_match`，在 saliency 裁切下判成 `match`（其余 12 例一致）。像素不同 → 结论不同，gate 与 sourcing 的分数不可互换（§1.3、§7.7）。
6. **成本**：首轮稳态 8–18 s/例（冷启动首例 183 s），二阶段 8–15 s；91 次首轮 + 边界二阶段约 40 分钟，`--resume` 可中断续跑。

### 4.4 这组数据不能证明什么

- §4.2–§4.3 的 GT 是设计意图，不是人工标注；正式 FPR/FNR 见 §4.5。
- 不外推到 Thinking 引擎或 MiniCPM-o（单模型）。
- 不覆盖含人物素材（本集 YuNet 0 人脸），也不覆盖视频轨。

### 4.5 正式 GT（人工标注）结果

标注（`labels.json`，2026-11-13，人只做接受/拒绝）：可用 5（A1/A3/B1/E1/F1）、不可用 6（A2/B2/C2/D2/E2/F2）、`unsure` 2（C1/D1，排除不折算）。

按生产准入规则（首轮 ≥60，或 40–59 二阶段 `match`），两个臂结果相同：

| 指标 | 点估计 | Wilson 95% |
| --- | --- | --- |
| FPR | 0/6 = 0.000 | 0.000–0.390 |
| FNR | 1/5 = 0.200 | 0.036–0.625 |
| accuracy | 10/11 = 0.909 | — |

- **唯一错判是 F1**（玻璃中庭 vs「研究机构建筑外观」，模型 0 分、理由「无机构标识」）。人判可用、模型判不可用，两边理由都成立——分歧在「泛化占位算不算支撑」这条口径上，不是随机抖动。
- **边界带的作用被证实**：A1/B1 首轮 50，靠二阶段 `match` 放行；C1/D1 同为 50 但被标 `unsure` 排除，正好是「模型与人都拿不准」的那类。只看首轮 ≥60（`gate` 规则）时 TP 2 / FN 3（FNR 60%），二阶段把 FNR 降到 20% 且 FP 仍为 0——同一条准入链里，二阶段承担了 2/4 的可用例。
- **逐条判定**：`report.md` 的「逐条判定」表给出每例的 GT、首轮分、二阶段 verdict、准入与 TP/FP/FN/TN，F1 的 FN 不会被汇总数字藏掉。
- **文字标签与人工判断的差异**：design 与人工标注在 C1/D1 上不一致（design 判可用，人判 unsure），说明「设计意图」不能替代标注——这正是 §2 第 6 条腐烂的同一类错误。
- **结论边界**：6 个不可用样本上「0 误放」的 Wilson 上界是 39%，因此**不能**断言已满足 10% 容忍度；要验证 10% 需 ≥30 个不可用样本（零错误），要与 20% 区分需 ≥199 个（§5.2）。

## 5. 容忍度：建议值与敏感性区间（需用户裁决）

### 5.1 两侧代价不对称

- **FPR（误放）**：不相关素材进成片 → 观众出戏，是可见质量事故。
- **FNR（误拒）**：好素材被挡 → B-roll 池变窄，观众只会觉得镜头偏素；且 sourcing 侧的二阶段会救回一部分 borderline。

因此建议 FPR 严于 FNR，不建议两者取同一数值。

### 5.2 选项与当前样本能分辨到什么程度

`11` 个有效对（人工 GT：可用 5 / 不可用 6，`unsure` 2 例排除）下的分辨率：

| 目标 | 不可用侧允许错误数 | 该目标下的实测上限（95% CI） | 可用侧允许错误数 | 零错误所需 n | 区分 2×目标所需 n |
| --- | --- | --- | --- | --- | --- |
| 5% | 0 | 0%（[0, 39%]） | 0 | 60 | 435 |
| 10% | 0 | 0%（[0, 39%]） | 0 | 30 | 199 |
| 15% | 0 | 0%（[0, 39%]） | 0 | 21 | 121 |
| 20% | 1（17%） | 17%（[3%, 56%]） | 1（20%） | 15 | 82 |

读法：在 n=6 个不可用样本上，「0 个误放」的 95% 上界是 **39%**（Wilson），所以本集**无法**验证 10% 这种目标，只能验证「有没有系统性误放」。要证明 10% 需要 ≥30 个不可用样本（零错误），或 ≥199 个才能把它与 20% 区分开。

（上表数值由 `tolerance_table()` 生成，n 变化后重跑即更新。）

### 5.3 建议（不代替裁决）

1. **先扩样再定目标值**：本集只回答「是否存在方向性错误」。建议扩到 ≥40 可用 / ≥40 不可用（票面评审的起步规模），再裁 FPR。
2. **候选目标区间**：FPR 10–15%、FNR 20–25%。这是「用现有 8 素材规模做判断」的可操作区间，不是统计效力保证。
3. **分割要求**：扩样后按内容包 / 场景 / 近重复分组切 dev/test，同图换 claim、同场景 seed 不跨集合。
4. **两侧共用一把尺**：`relevance-verdict.mjs` 同时服务 sourcing 与 gate，改阈值必须两侧同步；gate 侧没有二阶段，阈值语义不同，不能只改一处。

## 6. 脚手架

```
scripts/short-video/bench/relevance/
  cases.json            # 素材 + 13 个 (图 × claim) + 设计意图（非 GT）
  relevance_bench.py    # queue / score / eval 三个子命令
```

```bash
ASSETS=/path/to/checkout/scripts/short-video/assets   # 默认指向本仓库 assets，但 pexels-* 被 gitignore

# 解释器默认 ~/.venvs/mlx-vlm/bin/python（需要 mlx-vlm + opencv + Pillow）；换路径用 --python
python3 scripts/short-video/bench/relevance/relevance_bench.py queue \
  --assets-dir "$ASSETS" --out .scratch/relevance-bench
# 打开 .scratch/relevance-bench/queue.html，接受/拒绝，导出 labels.json

python3 scripts/short-video/bench/relevance/relevance_bench.py score \
  --assets-dir "$ASSETS" --out .scratch/relevance-bench --repeats 5 --restarts 2
# 长跑可中断：--resume 从 scores.json 续跑

python3 scripts/short-video/bench/relevance/relevance_bench.py eval \
  --out .scratch/relevance-bench --labels labels.json
```

本轮实测（2026-11-13）：queue 生成 6 张图 + 13 对，全部 6 张图 YuNet 检出 **0 张人脸**——本集素材以建筑/机房/图表/电路板为主，半自动候选实际只由 saliency 提供。人脸接受/拒绝路径在本集未被覆盖，需要带人物的素材才能验证（见 §7 风险）。`score` 从 `queue.json` 读取每张图的 `cropFocus`，与 sourcing 形态一致；没有 queue 时退回中心裁切并在 `meta.framing` 里标明。

## 7. 未解决风险

1. **样本量**：13 对只够验证链路与方向，不够验证任何 10% 级容忍度（§5.2）。
2. **YuNet 候选缺位**：本集 0 张人脸，焦点候选退化为 saliency 单源；「人脸框接受/拒绝」这条半自动路径需要在含人物的素材上补测。
3. **单模型**：结论不能外推到 Thinking 引擎或 MiniCPM-o；跨模型结论需另立票（模型不在盘）。
4. **temperature 0 的解释边界**：intra 臂的零方差只证明该进程内可重复，不能证明「模型稳定」；restart 臂才是漂移证据。
5. **裁剪信息损失**：模型只看 9:16 裁切。若主体被裁掉，低分是**预处理**结论而非模型判断失准——`framing-auto` 只覆盖「人脸框完全出框」这一可证伪的部分，其他裁切损失仍靠人标注。
6. **gate 侧无二阶段**：`b-roll/gate.mjs` 只用首轮分。若结论建议依赖二阶段，gate 侧需要单独的接口决策，本轮不动。
7. **两条路径不同像素**：本实验只覆盖 sourcing 形态（带 `cropFocus`）。gate 的中心裁切形态没有单独测量，其分数与本文矩阵不可互换——若要用同一套容忍度约束 gate，需补一条 center-crop 臂（脚手架已支持：删掉 `queue.json` 重跑 `score` 即得中心裁切结果，`meta.framing` 会标 `center-crop`）。
