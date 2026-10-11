# 关键帧选帧研究（#391 评审主文档）

> 2026-10-05 整理：顶部为「一页纸当前结论」（评审只需读本节 + §20）；2026-09-27 的
> deep research 原件移至文末附录（多项判断已被 §13–§20 实测更新）。
> Session `20260928-keyframe-bench-1d663d` · PR #445 · handoff：主库 `.scratch/keyframe-bench/HANDOFF.md`

## 一页纸：当前结论（截至 2026-10-10）

**基准**：Video-MME short 92 视频 / 276 题（名义 100，8 个缺盘视频，口径见 §20.11）
+ medium 原档 28 视频 / 84 题、**扩样 53 视频 / 159 题**（2026-10-07，4–17 分钟）。全部结论为逐题配对（McNemar exact）。
**原生通路采样上限**：Qwen 系（VL/Omni）经 mlx-vlm 默认 2fps×768 帧封顶，阈值 384s——medium **66% 视频触顶**（有效 0.73–1.99fps），短档全部未触顶（Q35）。该 768 来自 **mlx-community 转换包 + mlx-vlm 库默认**，官方 Qwen 配置不声明帧数上限，也与机器显存无关（Q38③）。两模型**视觉 token 预算不同**（VL≈25.2M 像素/视频 vs Omni≈12.8M）：同帧数下 Omni 视觉 token 为 VL 的 1/2–1/3，是其「快但长视频弱」的机制（Q37）。**官方承认该预算保守**：Qwen3.8-27B 卡建议把 `longest_edge` 提到 469,762,048（≈224k token，为默认的 18.7×）（Q38④）。官方侧同向：Qwen3-Omni 报告自陈长视频为短板（位置外推 + 上下文长度两条约束），官方 Video-MME Omni-30B 70.5 亦低于上代 Qwen2.5-VL-72B 73.3；Qwen3-VL 则为长视频专门升级（256K 上下文 / 2048 帧 / Interleaved-MRoPE / 显式时间戳）。

| 轴 | 结论 | 关键数字 |
|---|---|---|
| 选帧方法（短档 16 帧） | **均匀 + 时长比例预算**；非均匀方法全部落噪声内 | uniform 70.7 vs kframes 72.5（NS）；三把尺详见 §20.6 |
| 帧预算（短档） | **拐点 32 帧**，之后全平 | 16→32 +5.4pp（p=0.0081）；64 +1.4pp、96 +1.1pp（均 NS） |
| 帧预算（medium） | **拐点 96 帧** | 16≈64 平（53.6/54.8）；96 63.1%（vs 64 p=0.0455）；128 66.7%（vs 96 NS） |
| 生产帧数规则（候选） | `帧数 = min(max(ceil(D/8), 32), 128)` | §20.9/§20.10；medium 的 1/8s 比例落在拐点区。**2026-10-10 起生产不适用**：原生采样由 mlx-vlm 按 `fps=2.0 / max_frames=768` 决定帧数（§Q41㉕） |
| 装载层（音频怎么进） | **转写文本 > 纯视觉 ≈ 波形单元 ≈ Omni 原生交织**；转写是唯一有效音频形态（跨家族三复验） | loader_block 83.0 vs official_units 76.4（p=0.0009）；Omni 纯音频 33.3%≈乱猜；**Omni 交织 vs pure 两档 p≥0.5（音频贡献≈0，Q36）** |
| 提取方式（C9） | 我方 loader 显著优于官方整文件路径；漂移已排除，机理剩 q88/解码器两嫌疑 | 79.0 vs 73.6（p=0.0007）；q88 定案臂可选未排（§20.10） |
| **loader 网格是否独立有效（Q41①）** | **无独立贡献——「uniform 公式 + 转写」与 loader 统计不可区分** | 同 64 帧同转写，换**网格 + 输入分辨率**两处（640×360 vs 448×252）：loader_block 83.0 vs uniform64+转写 80.8，Δ=+2.2pp **p=0.1796 NS**（n=276）。分解：网格逐值相同的 16 视频（只差分辨率）Δ=**0.0pp**；网格不同的 76 视频 Δ=+2.6pp（p=0.146）⇒ 分辨率无影响、差异跟着网格走。两臂**都是均匀采样**，故本对照不构成「选帧方法无关」的证据 |
| 跨模型（短档 276 题） | **四路线打平（新增 Omni 交织）** | MiniCPM 83.0 = Qwen 原生 83.0 = Qwen 外抽帧 81.5 = **Omni 看听交织 80.8**（223/276，p≥0.4）；Omni 23.4s/题最快（中位 21.9s），我方 loader 33.9s、Qwen 原生 55.6s（§20.11 Q34） |
| 跨模型（medium） | **Qwen 原生显著领先（扩样定案）**；Omni 交织 ≈ MiniCPM 档 | 原档 84 题（**注意各臂不同模型**）：Qwen 原生+转写 71.4 ≈ Qwen 纯视觉 72.4（87 题）> **MiniCPM** u96 63.1 > **MiniCPM** u64+转写 61.9 ≈ Omni 60.7；**Qwen 自家** u64+转写 = 69.0 ⇒ 同模型内「原生 vs 外抽帧」只差 **+2.4pp（p=0.75，不显著）**，不是 +9.5pp。扩样 159 题：Qwen 71.1 胜 **MiniCPM** u64+转写 62.3（p=0.020）与 Omni 61.6（p=0.017）——**跨模型**单比较显著、Bonferroni-3 边缘；vs **MiniCPM** u96 64.2 未过线（p=0.090，组合臂未测）（Q36） |
| 模态消融 | 转写独解 51.4%（半数量题）；「双模态 vs 仅文本」极显著 | 视觉独解 79.0；双模态 83.0（95/8 分歧，p<1e-5） |
| 选帧方法（medium） | **全部落噪声内——选帧方法不是长内容的杠杆**（用户直觉未获支持） | slice 53.6 / maxinfo_siglip 58.3 / kframes 60.7 vs uniform_64 54.8（n=84 配对 p=1.0/0.55/0.23，Bonferroni 0.0167 无过；见 Q32） |
| KFS 官方场景 GT | **两档 uniform 均居榜首梯队**；medium 上「挑帧型」方法漏场景显著更多 | short UKSS uniform 0.5537 / slice 0.5529；medium SHR uniform 0.9603 第一，maxinfo/kframes/tiered_v5/scene_008 跌至 0.80/0.84/0.73/0.43（见 Q33/§15A.4） |
| **分档选型（Q39）** | **短档 MiniCPM loader / 中档 Qwen3-VL 原生+转写** | 短档 loader_block 83.0% @33.9s = Qwen native 83.0% @55.6s（并列，快 1.6×）；中档 Qwen native 71.1% @76.4s > **MiniCPM** u64+转写 62.3% @37.4s（**跨模型**，非同路径对照） |
| **引擎统一（2026-10-10 裁决，落地 #542）** | **两档统一 Qwen3-VL 原生 + 转写**；帧网格/分窗在生产退役 | 短档：loader_block 83.0% ≡ native+转写 83.0%（16/16 分歧，**p=1.000**）⇒ 统一零损失；生产口径类比（MiniCPM u32 无转写 76.1%）→ native+转写 83.0% = **+6.9pp（p=0.0094）**。中档：71.1% vs MiniCPM u64+转写 62.3%（p=0.020）。代价：短档 33.9s → 55.6s/题（**接受**）。**帧网格还有相位敏感性**：同 32 帧、同窗、只挪相位，短档在 77.3–83.3% 间浮动（§Q41㉕） |
| **官方预处理 vs 我们抽帧（2026-10-09 核）** | **同模型内只有 +1.4~2.4pp 且不显著；且被帧数混淆——证据不足以说谁更好** | 同模型 Qwen、都带转写：短档 u64 帧 81.5 → 原生 83.0（Δ=+1.4pp p=0.50）；medium u64 帧 69.0 → 原生 71.4（Δ=+2.4pp p=0.75）。**混淆**：官方路径 `fps=2.0 / max_frames=768`，100s 视频 ≈ **200 帧**；u64 臂 **64 帧**。而 `max_pixels` 是整段预算（`_smart_resize_video` 只缩空间、不减帧数）⇒ 官方=「多而小」（≈126K px/帧），u64=「少而大」（≈393K px/帧）。**窗口路径（生产的实际形状）从未测过** |
| **评测协议合规（Q40）** | **提示词与官方一致；抽取器对推理型输出不够** | 提示词 = lmms-eval 官方 qwen3_vl `post_prompt`；`max_tokens` 8 vs 官方 16 等价；官方也按 videoID 聚类。差距在答案抽取器（官方结构化 vs 我们首个 A-D 字符），已加 `VM_THINK_STRIP` 专用通路 |
| **QA 的外部效度（Q40）** | **够选模型，不够选选帧方法** | 生产是分档窗（>30s 时 3 等分窗、每窗 ≤8 帧、单题 **≤24 帧**）/ 0-100 相关度阈值门禁，bench 是整片 64 帧 / 单字母 MCQ。帧预算差 ~2.7× ⇒ 短档「16→64 帧涨 6.8pp」不能直接搬到生产。精确对照见 §Q41⑳ |
| **像素预算 2×2（Q41②，n=159 定案）** | **两个模型都吃预算、幅度相近；VL 在两种预算下都领先 ~4-5pp（不显著）；预算默认值不动** | ext 表（n=159，**有效表**）：VL 71.1→66.7（Δ=+4.4pp p=0.143）；Omni 66.7→61.6（Δ=+5.0pp p=0.152）；DiD −0.6pp CI[−8.8,+7.5]；四对比无一过 Bonferroni(0.0125)。**base 表（n=84）的「VL 预算效应 Δ=0.0pp」是污染产物，已作废**（见 §Q41 补⑨）。**降 VL 预算的建议已撤回**（⑲：代价不能排除、速度收益从未受控测量、该轴在生产上不参与） |
| **VL/Omni 输入结构差（Q41⑦，6 视频探针）** | **预算拉平后视觉 token 逐位相等；差异只剩 VL 的纯时间戳文本（越长占比越大）** | 帧数 6/6 相同；`max_pixels` 对齐后视觉 token 双向逐位相同。prompt token 分解：Omni 文本恒 58；VL 额外 **8.85–9.87 token/时间块**，占视觉 token **13.4%（78 块）→ 65.8%（384 块）**。属能力差异（VL 文本读时间 vs Omni M-RoPE 位置编码），两侧皆官方口径，**不对齐** |
| **「仅文本」消融臂口径（Q41⑪）** | **报告值 50.0% 混了两种口径；仅覆盖子集是 51.4%** | `exp_text_only.py` 写死 ctx-on `asr/`，短档 **8/100 视频无转写** ⇒ 24 题静默退化成「只看题目」（33.3%），报告里仍叫「仅文本」。差 +1.4pp，**结论不翻**，但引用该臂的「转写贡献」类结论应改用 51.4% |
| **预算默认值溯源（Q41⑬）** | **25.1M（VL）/ 12.8M（Omni）都是官方值，转档未改；且是整段预算不是每帧预算** | 与 HF 官方仓逐字节一致。VL 的真实预算在 `video_preprocessor_config.json` 的 `size.longest_edge`（`max_pixels` 字段为 `null`），由 mlx-vlm 映射；`video_processing_qwen3_vl.py:55` 明写 per-frame = `min(..., longest_edge / num_frames)` ⇒ **只缩空间、不减帧数**。图像路径另有 16M |
| **VL 的时间轴机制（Q41⑭）** | **VL 放弃 TMRoPE，改 Interleaved-MRoPE + 文本时间戳；Omni 保留秒缩放** | 官方 README：「Text–Timestamp Alignment: **Moves beyond T-RoPE**」。源码：VL 的 t 轴是 `arange(llm_grid_t)` 纯序号、已移除 `second_per_grid_ts`；Omni 是 `arange(grid_t) * second_per_grid * position_id_per_seconds`。⇒ 解释了 §Q41⑦ 的文本时间戳开销，**两者不可对齐** |
| **Thinking 模式（Q41④）** | **机制可用，效果与 Instruct 无异，延迟 1.40×** | 6/6 解析全 `strict`、推理链 201–1232 tok 未触顶、中位 69.0s vs Instruct 49.2s；**同 6 题 5/6 对且逐题预测完全相同（含同一道错题）** |
| **Thinking 只跑错题（Q41⑱，n=47）** | **修回 14/47（+5.1pp 上界）⇒ 达预登记阈值，价值集中在「会做但没做对」** | 修回 **14/47**；分层：两模型皆错 32 题修回 5（16%），仅 Instruct 错 15 题修回 **9（60%）**；延迟中位 65.0s、合计 0.86h；解析 46 `strict`+1 `loose`。**+5.1pp 是上界**（未测 229 道基线正确题上的回退率；冒烟 6 题显示回退率 0，不足以定界） |
| **转写口径（Q41⑤）** | **短档用的是带重复幻觉的 ctx-on 转写；「转写贡献 ~3pp」是下界** | 两目录 92 个同名文件中 88 个不同（ctx-on 重复循环，最长重复 27→1）；短档全臂 = ctx-on，medium 全臂 = ctx-off ⇒ 跨档位不可直接比转写。**loader 裁决不受影响（两侧同一份转写）**；loader 缓存键曾把 ctx-on 内容标成 ctxoff（92 条中 86 条证伪），已改为由目录推导标签 |

**待裁决（2026-10-07）**：PR #445 联评（Q36 终稿已落档：fps 修复无增益、音频交织贡献≈0、medium 扩样定案 Qwen 原生领先）；生产落地（§18.2 清单——medium 选帧已判「无差异」+ 跨模型已定案，分窗+预算可直接实施）；q88 保真臂（可选）；短档 8 缺盘视频补下载（medium 扩样已完成 53/56）；u96/u128+转写组合臂（可选，如彻底定案 medium 天花板）。**阶段化新模型计划（用户 2026-10-08 同意）**：① Omni `max_pixels` 提到 VL 水平重跑 medium（**已完成，Q41②**）；② Qwen3.6-35B-A3B 子集探针（20v/60q，同速度档）；③ **Qwen3-VL-30B-A3B-Thinking**（冒烟 Q41④ + 错题臂 Q41⑱ **均已完成**）；④ Qwen3.8-27B 速度冒烟后再定。

**当前状态（2026-10-09 19:30 收盘）**

**已结题**：

| 项 | 结论 | 出处 |
|---|---|---|
| 装载层 | 帧 + 音轨 + 带时间戳转写；不做波形直喂、不做单元装载 | C1/C2/C3 |
| 选帧层 | 分窗计划 + 窗内均匀网格 + 1.0s 时长上限（cutwin32_cap） | §20.3 |
| 分档模型 | 短档 MiniCPM loader（33.9s，与 Qwen native 并列）；中档 Qwen3-VL 原生+转写 | Q39⑤ |
| medium 2×2 补跑 | **已完成**（n=159，16:48）；base 表 VL@Omni 格作废 | Q41⑨ |
| VL/Omni 输入结构 | 已定位：预算可对齐、时间轴机制不可对齐 | Q41⑦⑬⑭ |
| Thinking 错题臂 | **已完成**：14/47 修回（+5.1pp 上界） | Q41⑱ |
| 转写覆盖率门禁 | 三处臂收敛为单一实现 + 8 例种植违规验证 | Q41⑫ |
| 输入探针三档 | **已完成**（6 视频，视觉 token 双向逐位相等） | Q41⑦ |

**仍待用户裁决**：

1. ~~**生产档位是否按 §18.2 替换**（§Q41㉑）~~：**已由引擎统一取代（2026-10-10，#542）**
   ——生产不再建窗、不再抽帧，档位/预算轴在生产上不存在（§Q41㉕）。
2. **Thinking**：用户已决定不用（Q41⑱）。若日后重启，唯一未知是
   229 道基线正确题上的回退率（≈4.1h 可测）；引擎统一后该臂已标「不再做」。
3. **VL 像素预算是否降到 12.8M**：证据**不支持**改动（见 §Q41⑲）。
4. ~~**生产可退化成 `uniform` 公式 + 转写**（Q41①）~~：**已落地为更强的形式**
   （2026-10-10）——生产改用原生采样 + 转写，帧网格整体退出生产（§Q41㉕）。
5. **medium 是否补题到 200+**：n=159 已跑完，功效已翻倍；再补需下载新视频。
6. **转写是否切 ctx-off 重跑短档**（Q41⑤）：倾向不做（脏转写只影响绝对水平，
   不影响 loader 裁决）。
7. ~~**对齐 `grab()` 与 loader 的输入分辨率后重跑对照臂**（Q41⑥）~~：
   **不再做**——分辨率在 Q41① 已被证伪，帧网格退役后无对照意义（§Q41㉕④）。
8. ~~**窗口臂**（生产实际形状）——从未测过~~：**已跑（2026-10-10）**：
   prodwin 77.3% vs Qwen native 89.4%（p=0.0215）；且发现帧网格的相位敏感度
   （同 32 帧同窗，77.3–83.3%，§Q41㉕②）。
9. ~~**`191e4ba4`（重复护栏）合入 main**~~：已合入（`19bfc960`）并接到两个转写出口
   （2026-10-10，§Q41㉒ 结论 2）。
10. ~~**⚠️ PR #445 已 CONFLICTING，需先解冲突**~~：已解冲突并合入（`19bfc960`，2026-10-09 22:51）。

**㉔ 落地状态：PR #445 冲突（2026-10-09 21:00 核）**

> **已过时（2026-10-09 22:51 起）**：PR #445 已解冲突并合入 main（`19bfc960`），
> 护栏随之下线；本节保留为当时的快照。当前状态见 §Q41㉒ 结论 2 与结论 9/10。

| 项 | 值 |
|---|---|
| PR | **#445**（OPEN，非 draft，2026-10-01 开） |
| 规模 | 25 文件，+4706 / −176 |
| mergeable | **CONFLICTING**（`mergeStateStatus: DIRTY`） |
| 分支位置 | **落后 main 189 commit**，领先 83 commit；merge-base `316e41b3`（10-01） |

**冲突面 6 个文件**（双方自 merge-base 起都改过）：

| 文件 | 冲突性质 |
|---|---|
| `docs/research/keyframe-extraction-research.md` | **实质冲突** —— 见下 |
| `docs/research/model-sources-reference.md` | #418 改动 vs 本 session 改动 |
| `docs/issue-roadmap.md` | #418 闭票盘点 vs 本 session 记录 |
| `package.json` / `package-lock.json` / `osv-scanner.toml` | 机械冲突 |

**关键**：`#418` 的 session **改了本 session 一直在写的同一个文档**
（`1c5bcee1`、`6b4299cf` 两个 commit，落 §17.5 等价性与指针纠偏），
而本 session 在同一文件追加了 §Q41 系列 —— 所以这不是机械冲突，
**两侧都在同一文件加了内容**，解冲突时要保证双方内容都不丢。

**为什么值得优先处理**：护栏 `asr_repetition_guard.py` 只在分支上；
#418 的解码后循环问题（ctx-off 后最大重复 n-gram 仍到 9）**正等着它**。
PR 拖得越久，189 这个落后数只会变大。

**进行中**：无。所有已启动的链均已跑完（`exp_q41_ext_chain.sh` 16:48、
`exp_probe_chain.sh` 17:40、`exp_thinking_wrong.sh` 19:26）。


## 13. 双层判据研究与实证（2026-09-27，session `20260927-kf-criteria-5de54e`）

### 13.1 判据定义（handoff §〇 裁决落地）

- **层一·几何硬指标**（零模型成本，可入 CI）：Shot Recall ±0.5s / Max Temporal Gap ≤8s / pHash 冗余（near-dup 对 ≤4）。
- **层二·下游字段一致性**：Subjects Jaccard vs uniform 基线、ContentKind 一致率、逐帧 Fit 分布（生产 image 路径 9:16 crop 模拟）；**#397 焦点约束 = 人脸存在区间代表帧命中率**（focus_detector 生产模块原样调用）。

### 13.2 GT 方法论（本 session 的事故与教训）

- 合成素材用**构造数学 GT**（content_ABC_av 唯一切点 5.06；ABCx2 五切点 5.06/10.13/15.19/20.25/25.31；ui-demo 七变化事件 2/6/…/26）——机械通道，权威。
- unitree（真实素材）视觉标注 v1/v2 两版均在探针复核中被推翻，且本 session 图像读取通道 6 次返回异常（错配图像/注入文本/错配代码正文）→ **GT 降级为三机制机械共识**（ffmpeg scene 滤镜 ∩ I-frame pts ∩ 灰度帧差信号，任二独立机制 ±0.15s）：[8.76, 12.44, 14.0, 17.25, 23.4, 25.6, 27.96]，provenance 显式标注「视觉通道作废、待用户 HITL 终裁」。
- 教训：**GT 标注必须有 HITL 终裁**；视觉通道异常时降级为机械共识并显式标注 provenance，不得冒充视觉真值。

### 13.3 关键实证（6 配置 × 5 素材，criteria_matrix.json）

| 素材 | uniform | scene(3 阈值) | iframe | 关键失效 |
|---|---|---|---|---|
| ABCx2_30s（5 切点） | recall 0.4 | 1.0 | 1.0 | uniform 预算摊薄漏 3/5 转场 |
| unitree（共识 GT） | **0.778** | 0.444–0.556 | 0.556 | 「scene 全面占优」叙事被推翻 |
| talkinghead | gap 2.0s | gap 8.0s（踩线） | **gap 15.6s** | iframe GOP 盲区击穿 8s 底线 |
| ui-demo（7 事件） | recall 1.0 | **0.0** | 0.143 | scene mod(t,8) 相位与事件完全错开 |

- 失效模式④实锤：固定背景局部演示 scene 全漏；兜底网格相位对齐风险（4 帧全部落在事件之间）。
- **#397 判据价值实证**：ABCx2 第二人脸段 [26, 30.25] 在 scene/iframe 下零覆盖，而 Max Gap 仅 5.0s「合规」——gap 判据对此盲，人脸区间命中率判据捕获。

### 13.4 层二字段一致性

- ContentKind：全策略全素材一致（稳）。Subjects Jaccard：scene/iframe 在 ABCx2 塌缩至 0.167（只见第一 loop 语义）。Fit：UI 素材 contain 主导（边缘文本保全正确）、talkinghead 全 cover。
- iframe_even 在 unitree 上与 uniform 同为 3/9——零解码对照并非免费午餐。

### 13.5 裁决建议（待用户裁决，默认策略本票内不切）

1. **单一策略无法同时满足四类素材**：scene 在 UI 录屏 0/7 是硬伤，uniform 在多镜头漏 60%，iframe 有 GOP 盲区。
2. 候选方向：scene 为主 + `mod(t,8)` 兜底保留 + **兜底相位随机化**（避开与事件周期对齐）+ I-frame 作零成本预筛对照；UI 录屏类素材考虑 uniform 兜底或提高兜底密度。
3. 层二判据（Fit/Subjects 一致性 + #397 人脸命中率）建议纳入选帧策略验收门槛。
4. unitree GT 待用户视觉终裁（探针带在 `.scratch/keyframe-bench/contact-sheets/_probe_*.jpg`）后重算 recall。

### 13.6 证据链

- 判据计算器：`scripts/short-video/bench/keyframe/criteria_eval.py`（Pass A 几何 / B 焦点 / C 字段）
- 观测工具：`contact_sheet.py`（策略拼图 + GT 标注密集网格 + 0.1s 探针带）
- 素材构建：`make_assets.py`（talkinghead 循环 + PIL 合成 UI 录屏）
- bench 扩展：`run_bench.py`（5 档信号矩阵 + frame 落盘 + fit-pass + 断点续跑）
- 全部落盘：`.scratch/keyframe-bench/`（results 45 JSON + contact-sheets 33 张）

## 14. 关键帧方法全景深研（2026-09-27 web deep research，session `20260927-kf-criteria-5de54e`）

### 14.1 方法对比表（按信号档位）

| 方法 | 原理 | 成本 | 已知失效 | 新闻素材适配 |
|---|---|---|---|---|
| uniform 均匀 | 等时间距采样 | 零 | 多镜头漏切（实测 3/5 漏） | 录屏/图表类最优（实测 7/7） |
| scene 固定阈值 | 相邻帧 HSV/SAD diff > T | 零解码 | 渐变溶镜、局部小变动（录屏 0/7）、兜底相位对齐 | 硬切 B-roll 准 |
| scene 自适应阈值 | 滚动平均替代固定 T（PySceneDetect AdaptiveDetector） | 两遍计算 | 需调 window/threshold | 抗运镜误报，直接对症「固定阈值失效」[1] |
| HashDetector | 感知哈希帧间距离 | 极低 | 灰度化丢色彩变化 | 廉价第二信号 [1] |
| 分块 diff + 变化比例 | 与「最后保留帧」比较（非相邻帧）+ changedRatio 阈值 + 全程校准 + 运动区 mask | 低 | 重动画内容 | **录屏/图表专项解法**（video-slide-extractor 已产品化）[2] |
| shot 边界 + 段内代表帧 | 先切 shot 再每段选帧 | 中 | 单帧不足代表段 | InfoShot 双帧法：每 shot 选「典型帧+独特帧」[3] |
| embedding 聚类 | 帧特征聚类取代表（KTV question-agnostic） | 中（需推理） | 小目标/文字不敏感 | 解耦 query 裁决的学术支持 [4] |
| 信息密度划分 | 按 Semantic Energy Mass 划分而非均匀时间（SLICE，parameter-free σ=ln N） | 中 | 依赖特征质量 | 帧集中到复杂事件段 [5] |
| M-LLM 打分 | VLM 对候选帧打分 | 高（秒级） | 本地算力不可行（已排除） | FrameOracle 需训练，AC |
| 压缩原理 | 借编码器冗余分析选帧（KFFocus） | 中 | — | iframe 思路的学术化 [6] |

### 14.2 时序近似（最接近 TMRoPE 的可行路径）——**此前标「未验证」现在有论文证据**

- **NumPro**（arXiv 2411.10332）：每帧叠加帧号数字，VLM 靠内建 OCR「读」时间线做 temporal grounding，training-free 零额外成本 [7]
- **ViKey**（CVPR 2026, arXiv 2603.23186）：序号视觉提示 + 关键词-帧映射，20% 帧数逼近密集帧性能；并论证稀疏采样下位置编码退化正是时序感知差根因 [8]
- **TimeLens**（CVPR 2026）：交错**文本**时间编码全面优于视觉叠加与位置编码方案 [9]
- 含义：给选中帧叠帧号/时间戳（或文本交错）是低风险高性价比的时序近似，可直接在 #334 prompt 侧实验。

### 14.3 官方采样路线的战略发现（改变预算讨论前提）

- MiniCPM-V 4.6 官方：`max_num_frames=128`，短视频 **1FPS 逐秒**，长视频自动转均匀采样 [10]
- MiniCPM-V 4.5：`MAX_NUM_FRAMES=180` + `MAX_NUM_PACKING=3`，3D-Resampler 将 6 帧并 64 token（96×压缩，10FPS）[11]
- **官方答案是「多喂帧 + resampler 压 token 成本」，不做智能选帧**。我们当前 mlx-vlm 16帧@2fps 远低于官方 128-180 帧建议。帧数上升只增加解码+SigLIP 前向时间（线性），LLM token 数不变——「1fps 全覆盖 uniform」在官方架构下可能就是正解，智能选帧仅在帧预算真受限（解码/编码时间）时有价值。**需实测帧数-延迟曲线定夺。**

### 14.4 对本管线的适配建议（新闻素材）

1. 帧预算优先上探到官方建议域（64+），先实测 uniform@1fps 的延迟-质量曲线，再谈智能选帧
2. scene 保留但修两点：AdaptiveDetector 式滚动阈值 + 兜底相位随机化；录屏/图表类叠加分块 diff 信号
3. 时序近似走 #334：优先文本交错时间戳（TimeLens 证据），次选帧号叠加（NumPro）
4. iframe 退役为对照信号

### Sources

1. PySceneDetect Detectors 官方文档 — https://www.scenedetect.com/docs/latest/api/detectors.html — Tier 1
2. video-slide-extractor（分块 diff + 校准 + mask）— https://www.npmjs.com/package/video-slide-extractor — Tier 1
3. InfoShot: Shot-Aware Frame Sampling — https://arxiv.org/html/2603.17374v1 — Tier 1
4. KTV: Keyframes and Key Tokens Selection — https://arxiv.org/html/2602.03615v1 — Tier 1
5. SLICE: Information Density Partitioning — IEEE Access 10.1109/ACCESS.2026.3680314 — Tier 1
6. KFFocus — https://arxiv.org/html/2508.08989 — Tier 1
7. NumPro: Number it — https://arxiv.org/pdf/2411.10332v1.pdf — Tier 1
8. ViKey — https://arxiv.org/html/2603.23186v1 — Tier 1
9. TimeLens — https://papernotes.org/CVPR2026/multimodal_vlm/timelens_rethinking_video_temporal_grounding_with_multimodal_llms/ — Tier 3（解读，原文 CVPR 2026）
10. MiniCPM-V-4.6 模型卡 — https://modelscope.cn/models/OpenBMB/MiniCPM-V-4.6 — Tier 1
11. MiniCPM-V-4.5 模型卡 — https://ai.atomgit.com/OpenBMB/MiniCPM-V-4_5 — Tier 1

## 15A. tiered 选帧器实证与选帧 benchmark 版图（2026-09-28，同 session；原与 §15 重号，改 15A 以区分，子节 15A.1–15A.4）

### 15A.1 tiered 选帧器（bench-only，`scripts/short-video/bench/keyframe/exp_tiered.py`）

三阶段 + 两道护栏（对齐社区已验证形态，非自创五层）：

| 层 | 机制 | 实证依据 |
|---|---|---|
| L1 硬切锚点 | ffmpeg scene 0.08（含 8s 兜底 pts） | 多镜头素材召回骨架 |
| L2 出现且停住 | 块级：≥3% 像素强变（>40 灰阶）vs **最后保留帧**，且对**下一帧**稳定 | ui-demo GT **7/7**（@320×180 / 20×12 网格 / >40 / >0.03） |
| L3 去重 | cuts 用 pHash（仅 ±2s 窗口内合并）；locals 用**强度排序 + 1.5s 最小间隔** | pHash 不能区分「微小但有意义」与微动噪声（曾吃掉 ui-demo 14.0/26） |
| L4 覆盖兜底 | 盲区 >8s 取**中点**补帧 | 中点天然避开周期事件相位 |
| L5 预算封顶 | 显式优先级元组 cuts > fills > locals | 字典推导式会静默降级同时命中两层的 cut |
| 护栏·洪水降级 | L2 触发数 > 2×预算 → 判定该内容信号无选择性，退化为 cuts+兜底 | talking head 曾 16 帧全近重复（nearDup 108 → 6） |

### 15A.2 修复前后对照（5 素材 × 三层判据）

| 素材 | 指标 | tiered（修后） | uniform | scene |
|---|---|---|---|---|
| ABC_av | recall / 帧数 / nearDup | 1.0 / 5 / 0 | 1.0 / 16 / 7 | 1.0 / 4 / 1 |
| ABCx2 | recall / gap / nearDup | **1.0 (5/5)** / 5.06s / 3 | 0.4 / 2.0s / 10 | 1.0 / 5.06s / 8 |
| unitree | recall / nearDup | 0.857 / 1 | 0.857 / 4 | 0.857 / 1 |
| talkinghead | 帧数 / nearDup / gap | **4 / 6 / 8.0s** | 16 / 76 / 2.0s | 4 / 6 / 8.0s |
| ui-demo | recall / 帧数 / nearDup | **1.0 (7/7)** / 11 / 6 | 1.0 / 16 / 21 | **0.0** / 4 / 0 |

修复链路：ui-demo 0/7→7/7；ABCx2 recall 0.4→1.0、gap 11.4→5.06s；talkinghead nearDup 108→6。已知让步：ABCx2 第二人脸段 faceHit 0.5（uniform 1.0，代价是 10 对冗余）。

### 15A.3 夹具 bug（重要教训）

ui-demo 合成的第 6 秒事件原为空字符串行——**构造上不可见**，导致「7 事件 GT」天然不可能全中，并造成「隔一个命中」的假规律。已修为可见内容。**合成夹具必须验证每个标注事件真的可见**（对应 AGENTS.md「非空产出」证据卫生）。

### 15A.4 选帧 benchmark 版图（回答「谁最好 / 能否不本地测」）

| Benchmark | 性质 | 关键事实 |
|---|---|---|
| **KFS-Bench**（WACV 2026, NEC）[12] | **首个选帧专项 benchmark**，多场景 GT 标注 | 直接评测选帧质量而非仅 QA 精度；三大质量因子 **Precision / Coverage / Balance**——与本项目「recall / max-gap / 冗余」判据同构 |
| Video-MME [13] | 模型能力榜（900 视频 / 254h / 2700 QA），含 short<2min / medium / long 分段与 **Frames 列** | 公开 leaderboard 可看「同模型不同帧数」的边际收益 |
| LongVideoBench / MLVU / EgoSchema / MVBench / TemporalBench | 长视频 QA 常用集 | 选帧方法的通用评测场 |
| lmms-eval [14] | **统一评测 harness**（100+ 任务、30+ 模型、响应缓存） | 免自建评测管线；但不含选帧专项指标 |
| SumMe / TVSum50 | 视频摘要 F1 / fidelity / CR | 摘要范式，与 QA 范式不同 |

**三条关键结论**：

1. **不能靠读论文排名判断谁最好**。KFS-Bench 明确指出：既有 benchmark 缺关键帧标注，只能**间接**通过 QA 精度评估选帧，而「QA 最高分不等于选帧最优」——MLLM 的幻觉与错误给采样效果引入了随机性 [12]。各论文又各自用不同 backbone/帧预算/超参，跨论文数字不可比。
2. **但也不必一切从零本地测**。三层可复用：① KFS-Bench 的质量因子定义（Precision/Coverage/Balance）可直接采用，省去判据发明成本；② lmms-eval 提供现成 harness 与公开基线；③ 具体到 MiniCPM-V，MaxInfo 论文已在 MiniCPM-V 4.5 上实测 +3.44%（LongVideoBench）[15]，可作为直接对照数。
3. **本项目域与 benchmark 域存在系统性错位**：这些 benchmark 的收益主要来自**长视频稀疏采样**（分钟到小时）；本项目素材为 30s 级（Video-MME 的 short<2min 段），而该段位下 uniform 已接近饱和（本 session 实测：uniform 在 ui-demo 7/7、ABCx2 仅漏多镜头切点）。→ **本地五素材矩阵评测不可省**，但应把 KFS-Bench 因子作为对外可比口径。

### Sources（续）

12. KFS-Bench: Comprehensive Evaluation of Key Frame Sampling in Long Video Understanding（WACV 2026, NEC）— https://www.openaccess.thecvf.com/content/WACV2026/papers/Li_KFS-Bench_Comprehensive_Evaluation_of_Key_Frame_Sampling_in_Long_Video_WACV_2026_paper.pdf — Tier 1
13. Video-MME 官方站与 leaderboard — https://video-mme.github.io/home_page.html — Tier 1
14. lmms-eval（统一评测 harness）— https://www.lmms-lab.com/posts/lmms_eval/ — Tier 1
15. MaxInfo（MiniCPM-V 4.5 实测 +3.44%）— https://arxiv.org/html/2502.03183 — Tier 1

## 15. 全方法总对决（2026-09-28，session `20260927-kf-criteria-5de54e`）

13 方法 × 7 素材几何口径 + Video-MME short 24 视频 QA 口径，BUDGET=16 对齐。
数据源：`.scratch/keyframe-bench/results/{methods_bench,methods_bench2,exp_siglip,exp_videomme_qa}.json`（KFS-Bench 三因子口径已并入 criteria_eval Pass D）。

### 15.1 转场召回（4 类素材均值）

| 方法 | 均值 | 最强项 | 结构性盲区 |
|---|---|---|---|
| tiered（PySceneDetect 基座+护栏） | **0.964** | 四类素材全及格 | unitree 0.857（第二信号可补） |
| uniform（社区默认） | 0.814 | QA 精度冠军 66.7% | 多镜头漏切 0.4、口播冗余 76 |
| sd_hash / sd_histogram | 0.750 | unitree 唯一满分 1.0 | 无兜底盲区 30s、录屏 0 帧 |
| scene | 0.714 | 多镜头 1.0 省帧 | 录屏 0/7 |
| maxinfo/ktv（真 SigLIP） | 0.67-0.70 | info 高 | 多样性≠切点覆盖、口播洪水 dup 72 |
| sd_content/adaptive | 0.679 | 硬切准 | 录屏/口播全 0 帧（相邻帧范式失效） |
| sd_threshold | 0.036 | — | 淡入淡出专用，用途不符 |

### 15.2 关键结论

1. **没有单项冠军**：QA 冠军 uniform、召回冠军 tiered、unitree 冠军 sd_hash/histogram、零冗余 iframe/sd 全家。
2. **唯一全科及格 = tiered**（recall 0.964 + 盲区 ≤8s + 冗余 6 + QA 噪声区间内）。其成分：切点信号层全部来自社区（PySceneDetect），自研仅为组合护栏（兜底锚点/去重/洪水降级/分层优先级）——与「社区优先、solid 基座上增量」方向一致。
3. **QA 口径（Video-MME short，n=69）**：uniform 66.7% vs tiered 59.4%，差异 7.3pp < 统计噪声 ±8pp——不下结论；方向符合「QA 检索型任务 uniform 是强基线」。
4. **裁决**：uniform 保留 QA 检索默认位；tiered 定位为可选策略（几何覆盖需求用 tiered，QA 检索需求用 uniform），不切默认。
5. TMRoPE 近似（NumPro/ViKey 帧号烧录）机制验证通过：数字可穿 3D-Resampler 被读出（ui-demo 输出 "approximately 30 seconds"），零延迟代价；价值兑现需 prompt 侧明确要求（归 #334）。
6. 真SigLIP embedding 复测排除「代理特征太弱」伪象：多样性最大化与切点覆盖目标函数错位是结构性的。
7. 基础设施发现：本地无批量限流下载能力 → #405；MiniCPM 官方帧域（≤128s@1fps）远大于现生产 3窗×8帧上限 → 分窗重设计待 ticket。

### 15.3 待办（fresh session）

maxinfo_siglip QA 补跑（tvF 环境层 bug）；可选扩样本 ~100 视频求显著；push + PR；#405 实现；分窗重设计 ticket。

## 16. Session 3：tvF 根因更正、tiered v3 证伪、四方法入 harness（2026-09-28，session `20260928-keyframe-bench-1d663d`，PR #407）

数据源：`.scratch/keyframe-bench/results/{methods_bench3,exp_videomme_qa}.json`。
注：原有两个 `## 15` 重号已于 2026-10-05 修复——「tiered 选帧器实证」改为 §15A（子节 15A.1–15A.4，文内指针已同步）；「§15」的指代不变（仍指「全方法总对决」），已发布的 issue/HANDOFF 指针不受影响。

### 16.1 上一 session 的「日志通道不可信」是误判，tvF 有真实根因

- `tvF` 在磁盘上真实存在：`transformers/image_processing_backends.py:133`
  `image = tvF.pil_to_tensor(image)`，而 `tvF` 只在 `is_torchvision_available()`
  为真时绑定；`~/.venvs/mlx-vlm`（transformers 5.16.1）**没装 torchvision**。
  transformers 5 把 `SiglipImageProcessor` 硬接到 `TorchvisionBackend`，于是
  只有走 SigLIP 的臂炸，uniform/tiered 两臂根本不碰 transformers——「日志不可信」
  的观感来自这种选择性失败。`~/.video-tts-env`（4.57.6 + torchvision 0.24）里
  同一份代码是通的，这也解释了 exp_siglip 几何口径为何一直正常。
- 「`grab_frame` 进程内外行为矛盾」另有解释且可核：`exp_videomme_qa.py` 的
  `os.makedirs` 是 12:45 新加的，vm_qa4/5 三臂全报 `Errno 2 .../frames/*_00.jpg`，
  加上该行后 vm_qa6 起两臂正常。
- 陈旧字节码假说已排除：5 个 `.pyc` 头部记录的源 mtime+size 与 `.py` 逐条相符，
  `.pyc` 内 `tvF` 计数为 0。
- 修复不动生产 venv（不装包，避免重演 opencv 遮蔽事故）：加载器收敛到
  `exp_siglip.load_siglip/embed_images/maxinfo_pick`，两处版本差异就地归一化
  （PIL 后端优先；transformers 5 的 `get_image_features` 返回
  `BaseModelOutputWithPooling`，取 `pooler_output`）。

### 16.2 QA 口径四臂终值（Video-MME short 23 视频 × 3 题 = 每臂 69 题）

| 臂 | 正确 | 精度 | 几何口径 recall 均值 |
|---|---|---|---|
| maxinfo_siglip | 47/69 | 68.1% | 0.700 |
| uniform_16 | 46/69 | 66.7% | 0.814 |
| tiered（v2） | 41/69 | 59.4% | 0.964 |
| tiered_v3 | 39/69 | 56.5% | 0.964 |

逐题 McNemar 精确检验（69 题）：uniform vs tiered 不匹配对 10+5，p=0.302；
uniform vs tiered_v3 10+3，p=0.092；uniform vs maxinfo 2+3，p=1.000；
tiered vs maxinfo 4+10，p=0.180。唯一 p<0.05 的是 tiered_v3 vs maxinfo
（2+10，p=0.039），6 组两两比较的 Bonferroni 阈 0.0083 之下不成立。
**n=69 时 QA 口径分辨不出任何一对方法**（±8pp 噪声），这既是补跑 maxinfo 的
结论，也是必须扩样的理由。零 `ERR`/零 `?`，A/B/C/D 预测分布 64/89/60/63。

### 16.3 平坦段密度保底（tiered v3）：假设证伪

- 动机（上 session 记录）：v2 在口播素材只花 4/16 帧预算 → 猜 QA 落后来自「帧不够」。
- L6 只在 L5 封顶后花剩余预算、不驱逐任何锚点，所以几何口径按构造不变：
  recall 逐时间戳与 v2 一致（均值 0.964，unitree 0.857 仍是唯一漏点），
  最差盲区 8.00→6.16s，帧数 16/16；代价全落在冗余（dup 均值 5.8→22.4 对；
  ui-demo infoShare 0.417→0.188；talkinghead dup 6→72）。
- QA 口径：39/69 = 56.5%，比 v2 还少 2 题；v2 vs v3 只有 2 个不匹配对（p=0.5）。
  量过之后才知道为什么：**23 个 Video-MME 视频里 tiered v2 未满 16 帧的只有 2 个**
  （`6Z_XNM_iT4g`、`uF3zNOthLAg`，各 8/16），其余 21 个 v3 与 v2 选中集合完全相同
  （`v23_diff.log`）。也就是说这一轮几乎没有给「密度保底」出题的机会。
- 结论要分成两句：① 假设（QA 落后于帧数）**在 Video-MME 语料上不可检验**，因为
  该语料的 1-3 分钟素材本来就让切点+局部变化层把预算花满；② 短/平坦素材上
  帧数少是事实（口播 4/16、10s 素材 5/16），所以 v3 的真实定位是**短平坦素材的
  兜底**（盲区 8.00→6.16s 换 dup 5.8→22.4 对），不是 QA 修复。
- QA 差距的可检验假设换成「帧放在哪」：tiered 在真实素材上把多帧挤在 0.2-0.3s 内
  （如 18.8/18.9/19.1、41.1/41.3/41.5/41.6），而 uniform 铺开。→ tiered v4 =
  对整个选中集合加最小时间间距（spread guard），密度点只做兜底。
- v3 不进默认位：它买到的只有盲区，付出的是冗余，QA 未见收益。

### 16.4 四方法入 harness：先读原文，偏离写进 docstring

| 方法 | recall 均值(4 素材) | 最差盲区 | 冗余对均值 | 帧数 |
|---|---|---|---|---|
| slice | **0.964** | **4.00s** | 17.2 | 10-16 |
| tiered / tiered_v3 | 0.964 | 8.00 / 6.16s | 5.8 / 22.4 | 4-16 / 16 |
| uniform_16fps2 | 0.814 | 2.00s | 23.6 | 16 |
| kffocus | 0.650 | 2.98s | 26.4 | 16 |
| kframes（去 query 退化形） | 0.322 | 2.76s | 23.0 | 16 |
| infoshot | 0.243 | 25.80s | 15.8 | 10-12 |

- **SLICE**（IEEE Access 2026，全文 CC-BY 可读，无官方实现）：第 3-8 步照抄
  （σ=ln(N) 高斯平滑 → rectify → `p=S′+μ` 能量地板 → 逆 CDF 分 K 块 → 块内取
  **未平滑**原始分的 argmax）。第 2 步是 BLIP ITM 对 query 的相关性打分，与
  #391「抽帧层完全解耦 query」裁决冲突，替换为逐帧新颖度 `1−cos(emb_t,emb_{t−1})`
  ——所以被测的是它的**分配器**。结果：分配器本身就做到 tiered 的召回、且盲区
  更好（4.00s vs 8.00s）、冗余低于 tiered_v3。这是「社区基座优先」方向本轮最强
  的一条证据，已加入 QA 臂（`slice`）待扩样裁决。
- **InfoShot**（arXiv 2603.17374）：作者 repo（mengyu02/InfoShot）只有 60 字节
  README、无代码无许可证，公式全部取自正文（B_t 平衡划分、M=⌊K/2⌋、
  typical λ=0.7 / unique α=0.5、邻域 k=1）。偏离两处并写明：论文 10fps ResNet-50
  特征，我们用 5fps 灰度嵌入（1fps 下 30s 只有 30 候选，放不下 8 个镜头）；
  窗口 k 按段长缩放。0.243 与 §15 的 maxinfo_proxy 教训同型——**弱特征是结果
  的可能成因，故 0.243 只当下界**，要用它必须真特征复测。
- **K-frames**（arXiv 2510.13891）：核心是训练出来的 query 条件化分配（PeakClips
  = 直方图差切点 + Gemini 字幕 + LLM 相关性 → Qwen2.5-VL actor，SFT+GRPO）。
  去掉优先级层后 w≡1、`k_j∝ℓ_j`、段内等距，即论文自述的退化形态；实测 0.322
  显著低于同预算均匀网格 0.707，原因是「段内取中点」系统性避开切点。
  → 判**不适配本 harness**，移入「勿重复尝试」清单（附本次实测依据）。
- **KFFocus**（arXiv 2508.08989）：帧层 = 编码 I 帧 + 每个间隙插
  `⌊T_k/(δT)⌋` 张等距补偿帧（δ=5%），零模型成本；我们额外补首尾间隙（论文只列
  相邻 I 帧，会让首个 I 帧之前的整段无帧）。其另一半 CLIP top-α token 压缩
  （d1=2/d2=4）是 token 预算不是选帧，不入本 harness。实测与 iframe 家族一致：
  盲区极好（2.98s）、切点召回差（0.650）。

### 16.5 PR #407 bot review 六条 thread 的核实结论（判据与工件层）

1. `run_bench` fit pass `crop_cleanup` NameError — **为真**：25 个 run_bench 工件
   每帧多一条 error dict（生产字段一致性层的 Fit 分布被 50% 错误行稀释）。
   无已汇报数字消费它（`criteria_matrix.json` 无 layer2 段）→ 层二证据需重跑。
2. QA 答案解析 `re.search([ABCD])` — **为真**：实测 "The answer is C."→A、
   "I don't know"→D。已双写 `pred`/`pred_strict` + 存 `raw` + `parser_check` 汇总；
   但 23 视频这一轮的 raw 未落盘，**无法回溯重算**，扩样时全臂按两口径重算。
3. `count_frames_at_fps` 取首个 `frame=` 进度行 — **真隐患、零既成损害**：实测
   5 素材各只输出 1 行（20/61/60/60/60），磁盘上的 uniform 时间戳未被截断；
   分钟级 1fps 会中招 → 扩样前已修。
4. consensus 里 `derive_iframe_timestamps(...) if False else ...` — 死分支删除
   （其备选本身 `cap=None` 时 TypeError，正是它不该留的理由）。
5. `exp_siglip` main 重复解码/重复 embedding — 对旧代码成立；现每素材一次
   `decode_rgb` + 一次 forward。
6. `make_assets` 第 8 行 CODE_LINES 永不出现 — 缺陷为真，修法以「不动像素」为约束
   （GT 与全部 ui-demo 数字建立在已出货夹具上）：删死行 + 把常亮光标写成显式行为，
   重生成后解码 rgb24 流 md5 与出货素材相同（`0466a1b…`，1990656000 字节）。

### 16.6 下一步

1. 100 视频扩样：4 臂（uniform_16 / tiered / slice / maxinfo_siglip）写入
   `exp_videomme_qa_100.json`，69→300 题把噪声从 ±8pp 压到约 ±5pp；tiered_v3
   已证伪故不进扩样。
2. tiered v4 spread guard（16.3 留下的唯一可检验假设）。
3. KFS-Bench 直接判据轨道（自带多场景 GT，视频源 LongVideoBench，复用 #405 下载器）。
4. fit pass 重跑补层二证据（16.5-1）；分窗重设计 ticket；#405 通用串行下载器
   （本轮 bench 侧临时物 = `download_videomme.sh`）。

### Sources（再续）

16. SLICE: An Efficient and Tuning-Free Keyframe Sampling Framework for Long-Form Video Understanding — IEEE Access 14:51576-51588 (2026) — https://doi.org/10.1109/ACCESS.2026.3680314 — Tier 1（全文读）
17. Shot-Aware Frame Sampling for Video Understanding (InfoShot) — https://arxiv.org/abs/2603.17374 — Tier 1
18. K-frames: Scene-Driven Any-k Keyframe Selection for Long Video Understanding — https://arxiv.org/abs/2510.13891 — Tier 1
19. KFFocus: Highlighting Keyframes for Enhanced Video Understanding — https://arxiv.org/abs/2508.08989 — Tier 1
20. mengyu02/InfoShot（作者仓库，仅 README、无代码无许可证）— Tier 3（负面证据）

## 17. Session 4：统一分母与三条纠错（2026-09-30，session `20260928-keyframe-bench-1d663d`，PR #419 已合并）

本轮把三条判据轴跑成同一口径（选帧轴 22 法 × 几何 / KFS / QA / 描述四口径），并因此发现三处**静默口径错**。全部数字来自 `.scratch/keyframe-bench/results/*.json`，每条都能复算。

### 17.1 三条纠错（都改变已引用过的数字）

1. **QA 轴统一分母**：旧 harness 在"选帧为空"时跳过该视频的题，于是每臂只统计自己碰巧有输出的子集。**sd_threshold 有 56/92 个视频零帧**，先前口径报 45.4%（108 题子集），统一分母真值 **17.8%**（49/276）；其余 sd_* 差 1-2pp。现在零帧也出行（`pred=NOFRAMES`、`correct=false`、不调模型），FINAL 打出每臂无输出题数，整臂全空 → rc=2。
2. **KFS 的 K 预算**：`kframes`/`infoshot` 在方法内部硬编码 16 帧、`blockslide`/`sd_*` 完全不截断，却都打在 `k64` 标签下。**kframes UKSS 0.4301 → 0.5211**（跳到第 6 名，与 lvnet/maxinfo 同档），blockslide 0.5433 → 0.5416（多数素材原始输出本就 <64）。另：`kfs_summary_k64.json` 曾被部分重跑逐臂覆写（一度只剩 1 条），现为合并式写入。⚠️ KFS 的 per-video 协议偏差（官方 GT 是 per-question 的"答题必需场景"，我们按 #391 的 query 解耦裁决做 per-video 一份选择复用到该视频全部题）仍成立：方法之间可比，与作者参考（0.5644）的比较只能当指示，**不得当作 KFS-Bench 官方成绩对外引用**。完整论证见 `scripts/short-video/bench/keyframe/kfs_bench_eval.py` 的 module docstring（该口径的唯一真值处）。
3. **描述基准窗内选帧**：旧实现整片选 8 帧再过滤到事件窗，实测**平均只落 2.3 帧/事件**（median 1、15% 空窗）。改为窗口裁剪后窗内选帧（pHash 验证 seek 精确），平均 **7.8 帧、零空窗**。旧产物保留作诊断。

### 17.2 选帧轴终值（Video-MME 92 视频 / 276 题，16 帧预算，纯视觉）

kframes 72.5 ｜ maxinfo_siglip 71.7 ｜ lvnet_tsc 70.7 ｜ uniform_16 70.7 ｜ slice 69.6 ｜ blockslide 69.2 ｜ kffocus 68.1 ｜ iframe_even16 67.8 ｜ **tiered_v5 67.0** ｜ taksf 64.5 ｜ sd_adaptive 61.6 ｜ sd_histogram 61.6 ｜ sd_hash 61.2 ｜ tiered(v1/v2) 61.2 ｜ **tiered_v3 60.5** ｜ sd_content 60.5 ｜ infoshot 57.6 ｜ scene_008_cap16 57.2 ｜ sd_threshold 17.8。

两条读法约束（比数字更重要）：

- **QA 单轴不能用来选方法**。`kframes` 是去掉 query 后的退化形（按场景长度比例分配帧数 ≈ 长度加权 uniform），几何口径一直弱（§16.4 表：0.322）、KFS 也只在中游，却在 QA 轴排第一；`uniform` 也稳居前三。这正是 KFS-Bench 论文"QA 最高分不等于选帧最优"的本地复现——**QA 轴的有效用途是测装载层，不是排选帧**。（§19.3 补一刀：把论文的 query 条件完整恢复后，27 题里 24 题帧分配变了、答案一题没变——query 阶段在这个 QA 协议上的价值就是 0。）
- **tiered v3 的假设在此规模再次证伪**：densify 不加 floor = 60.5%，与 v1 的 61.2% 在噪声内；v5 的全部增益来自 floor 修复（67.0%，v5 vs v1 逐题 McNemar 显著）。与 §16.3 的 23 视频结论同向。

### 17.3 装载层轴（固定选帧，只改音频/文本喂法）

| 喂法 | 结果 | 判定 |
|---|---|---|
| 原声直喂（帧 + 整段波形） | 67.0% → 50.0%（−17pp，p=2.5e-06） | **有害**，无报错、分布正常，是内容层面被音频通道带偏 |
| ASR 转写文本进 prompt（slice，ctx-off 转写） | 69.6% → 73.2%（+3.6pp） | 单臂 McNemar **p=0.087 不显著**；显著性来自四方法合并检验（p=3.9e-05）。引用必须带这句 |
| 转写呈现格式（block / 带时间戳 / 不截断 / 放题后） | 73.2 / 73.2 / 73.2 / 71.4% | 测不出差别：ts 与 full 近乎逐题同分（ctx-off 后 92 份转写只有 2 份超 2000 字，截断与时间戳几乎不改变输入）；after 低 1.8pp 但 p=0.40 |
| 官方 omni 单元装载（1 帧 + 该帧到下一帧的音频段，逐对交织） | 23/30 vs 同帧纯视觉 24/30 | **无增益**，`units_only=0`（10 视频 / 30 题同帧同题，§19.2 官方码底盘）；loader 底盘复跑为 29/33 vs 31/33（§17.3 下） |

**官方单元经生产 loader 复跑（#417 验收 2，2026-09-30，`exp_omni_units_qa_loader.py`）**：
两臂共用**同一批 loader 帧**（官方抽帧规则：≤64s @1fps、>64s 10fps 后 linspace 采样 64），
只差音频单元进不进上下文——配对 33 题：

| 臂 | 结果 | 配对 |
|---|---|---|
| vision（只喂帧） | 31/33 = 93.9% | units_only=0，vision_only=2 |
| units（loader → `to_minicpm_units`） | 29/33 = 87.9% | McNemar p=0.50 |

即：**「音频不伤视觉」在这套 QA 协议上复现不了**——不是显著变差（2 题差异，p=0.50），
但也**一题都没赢**。与①③两轮同向（首轮官方产物 25/33 vs 26/33，units_only 3 / vision_only 4，
净 −1；§19.2 严格三臂 23/30 vs 24/30，`units_only=0`）。装载本身是准的：
对 12 份官方产物逐帧交叉校验，753 帧中 724 帧像素一致（MAD≤10），音频段长逐段 |Δ|≤0.026s。
结论不变——音频的价值在**转写文本**这条通道，单元装载留作引擎契约（#417 已实现并有适配器）。

音频通道的价值判定：MiniCPM-o 在 QA 轴上听得见内容却会被带偏（冒烟里它能答出"男子介绍 Jennifer Hudson 演唱"这类纯画面推不出的题），但**要把这份信息稳定用起来，目前唯一有效的形态是文本**。#417 装载层的接口设计据此定：帧 + 音轨 + 带时间戳转写，音频不做波形直喂。
### 17.4 描述质量轴（用户真实目标：把内容描述清楚）

ActivityNet Captions val_1，oracle 事件区间，per-event 一句英文描述，462 事件，评分用 pycocoevalcap 标准实现。**主报 METEOR 0.1214 ｜ ROUGE-L 0.1221**（用户 2026-09-30 裁决口径）。

CIDEr 必须分开报：预测 mean 41.9 词 vs 人工参考 13.8 词（总长比 3.04×），标准 σ=6 高斯长度惩罚把分数压到**无惩罚值的 4.4%**——CIDEr(σ=6) 0.0095 ｜ CIDEr(no-pend) 0.2162。即：这条指标在本数据上的读数由"话长"主导，不是由"没描述清楚"主导。裁决取舍：**不为对齐参考长度压缩生成**（目标是信息量，不是参考的简略风格），代价是此 CIDEr 不可与他人论文横比；若要可比，需另跑一版"限 ≤20 词"对照组。

**对照组已做（2026-09-30，`CAP_MAX_WORDS=20`，同 462 事件同 prompt）**：产物 `results/caption_anetc_v2_short.json` + `caption_metrics_caption_anetc_v2_short.json`，配对 bootstrap 见 `caption_bootstrap.json`（重采样事件、两臂同索引集，B=400）。

| 指标 | 无限制（41.9 词） | 限 ≤20 词（17.7 词） | Δ | 95% CI | p |
|---|---|---|---|---|---|
| CIDEr(σ=6 脚注) | 0.0095 | **0.1456** | +0.1361 | [+0.1137, +0.1529] | <0.001 |
| CIDEr(no-pend) | 0.2162 | **0.2543** | +0.0382 | [+0.0134, +0.0633] | <0.001 |
| BLEU-4 | 0.0067 | 0.0117 | +0.0050 | [+0.0012, +0.0086] | 0.015 |
| METEOR（主报） | **0.1214** | 0.1120 | −0.0094 | [−0.0143, −0.0053] | <0.001 |
| ROUGE-L（主报） | 0.1221 | **0.1487** | +0.0266 | [+0.0190, +0.0337] | <0.001 |

读法：长度口径一压到参考量级（1.28× vs 3.04×），CIDEr(σ=6) 从 0.0095 跳到 0.1456（15×），
**这才进入可与论文横比的范围**；no-pend 与 ROUGE-L 也升（+18% / +22%），说明被砍掉的词不是
内容重叠——长输出没有换来更高的 n-gram 命中。唯一下降的是 METEOR −0.0094（−7.7%，显著）：
METEOR 含召回项，长输出天然占便宜，属指标构造，不是信息损失。

因此**用户裁决不变**（生产仍不压缩生成）：本管线要的是描述信息量，而对照组证明的是
「CIDEr 不可横比是长度口径问题，不是描述质量问题」。若某次对外汇报需要可比数字，
按 `CAP_MAX_WORDS=20` 跑同一链即可复现上表。

### 17.5 ASR 运行时（#418 的速度与等价性维度）

2026-10-09 空机四格复测（4 视频、音频均值 78s、ctx-off、每格 2 次；数据 `.scratch/keyframe-bench/asr_timing_matrix.json`，与 `asr_timing_fair.json` 的 3 格互为对照；同配置前一次 run 各格相差 ≤6%，内存与 Metal 峰值逐格相同）：

| 引擎/档位 | 单次转写·冷进程（中位/最快） | 进程内首次（含加载） | 常驻（warm） | 峰值内存 |
|---|---|---|---|---|
| whisper.cpp turbo | **4.30s** / 3.60s | — | — | RSS 1.95GB |
| whisper.cpp large-v3 | 8.95s / 6.18s | — | — | RSS 4.11GB |
| MLX turbo | 4.69s / 4.16s | 3.27s | **2.87s** | RSS 1.82GB · Metal 峰值 2.52GB |
| MLX large-v3 | 8.80s / 5.90s | 7.09s | **6.11s** | RSS 3.59GB · Metal 峰值 3.99GB |

**口径修正（2026-10-09 复核）**：本表原先给 MLX 写「新进程墙钟 8.33s」，那是**同一进程内跑了两次转写**的墙钟（run1+run2），与 cpp 的单次墙钟并列比较，得出「MLX 慢 62%」。按生产形态（一次转写、冷进程）重算后是**持平**：turbo 4.30s vs 4.69s（cpp 快 9%），large-v3 8.95s vs 8.80s。harness 已新增 `single_call_s_median` / `single_call_s_min` / `mlx_startup_s_median` 三个键承载该口径，前一次 run 独立复现（4.21 / 4.57 / 8.97 / 8.98）。

**MLX 只在模型常驻时有确定优势**（2.87s vs cpp 单次计算量 4.22s，约 1.47×）；兑现常驻要新增 worker + venv 依赖，而 TTS 才是墙钟主导，故生产保持 whisper.cpp（ADR-0020），MLX 留在 bench 实验轴。**但「每次新进程 MLX 一定更慢」不成立**——它的固定开销实测只有 1.52s（turbo，`mlx_startup_s_median`）/ 1.48s（large-v3），在 78s 音频上不足以拉开差距。

**外部 benchmark 与长音频对照（2026-10-09 追加）**：网上主流结论与我们相反（Bill Mill 在 M1 Ultra 上测得 mlx-whisper 快 2.03×），本机（M2 Pro / 19 核 GPU）复现不出来；补测长音频后**只有 64-93s 那一行是结果**，更长的音频被并行负载与 cpp 解码方差污染（876s 与 1046s 两行方向相反）。差异方向与 GPU 宽度一致，已排除 `-fa`（他用的 revision 同样默认开启）与版本代差。完整表格、噪声披露与证伪记录见 `../video-production-runbook.md` ⑨。

**CoreML / ANE encoder 的收益上限**：两者都只加速 encoder，实测占总时长 37-56%；但上游唯一一组同机对比显示 CoreML 比 Metal **慢约 2×**（README 的「>3×」基准是 CPU-only，本机 CPU-only 慢到跑不完，不能外推），ANEForge 也只快 1.0-1.3×，且本机无 Xcode.app（`xcrun coremlc` 缺失）。**当前不引入**——完整占比表、上游数据与代价清单见 `../video-production-runbook.md` ⑩。

**等价性（本次补齐，ctx-off 生产口径）**：此前的 sim 0.55-0.76 是**默认上下文**下的数，量的是重复幻觉；两边都关跨段上下文后（`.scratch/keyframe-bench/asr_equiv_ctxoff.json`，4 素材、同权重 turbo），词级差异率 **0%–52.6%（均值 19.4%）**——纯语音段 0%、音乐段 52.6%。**同模型 ≠ 同输出，两侧转写不可混用**；且 ctx-off 压住了大循环但没压干净（最大重复 n-gram 仍到 9），差异集中在循环触发点不同的段落。运行口径、内存口径、backend 事实（cpp 默认走 Metal）、完整表见 `../video-production-runbook.md` §ASR 调用规范 ⑤-⑧。

### Sources（三续）

21. CIDEr: Consensus-based Image Description Evaluation — Vedantam, Zitnick & Parikh, CVPR 2015 — https://arxiv.org/abs/1411.5726 — Tier 1（σ=6 高斯长度惩罚的定义来源；本文 §17.4 的实测即针对该项）
22. ActivityNet: A Large-Scale Dataset for Video Context Understanding / Dense Video Captioning with Human-Uniformed Temporal Annotations — Yu et al. CVPR 2017；Zhou et al. ICCV 2017 — Tier 1（视频-密集描述基准与 per-event 评测协议的出处）
23. METEOR: An Automatic Metric for MT Evaluation with Improved Correlation with Human Judgments — Banerjee & Lavie, ACL Workshop 2005 — Tier 1（主报指标；对词序与长度较不敏感）
24. pycocoevalcap（实现真值）：本机 `~/.venvs/caption-metrics/lib/python3.14/site-packages/pycocoevalcap/cider/cider_scorer.py:158` 即 `val[n] *= np.e**(-(delta**2)/(2*sigma**2))`；§17.4 的 no-pend 值 = 同一实现把 σ 置为 1e9（惩罚项 → 1）重算，非另写指标。

### 17.6 下一步

1. **#414 分窗重设计**（16→32 帧；已做，见 §18）：依据是预算扫描产物
   `.scratch/keyframe-bench/results/exp_budget_scan.json`（4 素材均值：uniform 0.685→**1.000**、
   slice / tiered / tiered_v4 均 0.964→**1.000** @32，**64 帧无额外收益**；而选帧耗时/帧几乎不随
   预算变化（uniform ~0.47s、tiered ~5.0s），代价体现在冗余——near-duplicate 对 16→32 帧从
   2.2→4.0（tiered）与 5.8→26.7（slice），所以成本在喂模型的 token 而非选帧本身）。
   几何侧可离线验，不占 VLM。
2. **#417 装载层接口**：按 §17.3 结论——帧 + 音轨 + 带时间戳转写，不做波形直喂；与 #414 耦合（装载层是分窗的输入侧）。
3. **描述轴若要对外可比**：已做（§17.4 对照组表 + `caption_bootstrap.json`）；生产仍不压缩生成。
4. **用户已批准未实现**：ASR 锚点选帧、运动矢量信号（`ffmpeg -flags2 +export_mvs`）。
5. 生产默认策略仍未切（票边界，等用户裁决）；#415 三项代码修复属其它 session。


## 18. Session 4 续：分窗重设计横评（#414，2026-09-30，session `20260928-keyframe-bench-1d663d`）

#414 提案：窗长按硬切点边界划、每窗预算 32 帧（预算扫描的召回拐点）、任一窗内盲区 ≤8s 兜底。产物 `results/exp_windows.json`（16 素材 × 4 变体，纯几何）与 `results/exp_windows_e2e.json`（真模型延迟/token，§18.3）。

### 18.1 几何横评（`exp_windows.json`）

素材 = 4 个自建 + 1 个 302s 拼接长片 + 11 个 Video-MME 片段（几何口径无 GT，召回记 None）。变体：`legacy24`（生产 #360 口径镜像）、`cutwin32_unif`（提案计划 + 窗内均匀网格，**无**时长上限，即上限的 A/B 对照）、`cutwin32_cap`（同计划 + 时长感知每窗上限，§18.1.1）、`cutwin32_v5`（提案计划 + tiered v5 选帧）、`uniform32`（1fps 解码均匀子采到 32 帧，即预算扫描的 uniform 臂）。

| 变体 | 帧数均值 | GT 召回（5 素材均值） | 最大盲区（16 素材） | 近重复率均值（16） | 近重复率均值（15 单窗） |
|---|---|---|---|---|---|
| legacy24（现状） | 22.2 | 0.599 | 12.50s | 0.0704 | 0.0687 |
| cutwin32_unif | 33.9 | 0.837 | 4.88s | 0.0848 | 0.0833 |
| **cutwin32_cap** | **32.3** | **0.837** | **4.88s** | **0.0804** | **0.0786** |
| cutwin32_v5 | 33.8 | 0.925 | 13.81s | 0.0868 | 0.0830 |
| uniform32 | 30.1 | 0.820 | 10.00s | 0.0783 | 0.0773 |

**验收 1（recall 不降）✅**：5 个有 GT 素材逐一不降——content_ABC_av 0.00→1.00、content_ABCx2_30s 1.00→1.00、unitree 0.86→1.00、ui-demo 1.00→1.00、302s 长片 0.14→0.19；加上限后逐素材召回**完全不变**（上限只削冗余不削覆盖）。

**验收 1（盲区 ≤8s）✅（仅 `cutwin32_unif` / `cutwin32_cap` 组合）**：全 16 素材最大盲区 4.88s（302s 长片两窗 151.25s × 32 点均布）。现状破线：302s 长片 12.50s；`uniform32` 10.00s；`cutwin32_v5` 13.81s（302s）与 10.21s（videomme 6NVr0cNiHPM 单窗 32 帧仍出等距缝）。v5 破线的原因：tiered 的 8s floor 只在窗内选帧生效，不覆盖窗缝与覆盖边界（首帧到 0、末帧到时长）——「计划 + 均匀喂」是按构造保线的唯一组合，与票边界（选帧策略不在本票）一致。上限实现里 `cap_i = max(floor_i, …)` 让 8s 盲区下限**永远优先**于冗余裁剪。

> **口径更正（§19.4，2026-09-30）**：v5 的 13.81s 不是窗缝造成的（302s 长片实际窗缝 0.00s），
> 而是 v5 在第 0 窗选帧时右端覆盖不足。本节「不覆盖窗缝」的措辞按「不覆盖窗缝**与选帧集合
> 右端覆盖边界**」读，数字不变。

**验收 1（冗余不高于 uniform_32）✅（加上限后成立，用户 2026-09-30 裁决「加时长感知上限」）**：逐资产近重复率（pHash 汉明 ≤4 对数 / 总对数）——15 个单窗素材均值：无上限 0.0833 vs uniform_32 0.0773（+0.0060，票内一度判 ⚠️）；**加上限后 0.0786（+0.0013）**。差距原本全部来自短素材的帧数差：10s 素材现状只喂 5 帧（0.5fps 档）、`uniform32` 只喂 10 帧（1fps 解码上限），提案按每窗预算喂满 32 帧（0.32s 一帧）。上限把它压到 11 帧（1.0s 一帧），与官方 1fps 采样密度同档。详见 §18.1.1。

### 18.1.1 时长感知每窗上限（`exp_windows_cap.json`）

规则：`cap_i = max(floor_i, floor(w_i / min_spacing) + 1)`，`floor_i` 仍是 8s 盲区下限
（`ceil(w_i/8)+1`）——两者冲突时下限赢（稍密的网格永远比盲区便宜）。取 `min_spacing = 1.0s`
的依据是同一批 16 素材的 spacing 扫参（`results/exp_windows_cap.json`，5 档 × 全素材几何 +
11 个受影响素材的逐档 pHash）：

| min_spacing | 帧数均值（15 单窗） | GT 召回均值 | 最大盲区 | 近重复率均值（15 单窗） | vs uniform_32 |
|---|---|---|---|---|---|
| 无上限（pre-cap） | 31.9 | 1.000 | 4.21s | 0.0833 | +0.0060 |
| **1.0s（采用）** | **30.3** | **1.000** | **4.21s** | **0.0786** | **+0.0013** |
| 1.5s | 27.2 | 0.793 | 4.21s | 0.0803 | +0.0030 |
| 2.0s（首猜） | 24.5 | 0.457 | 4.21s | 0.0687 | −0.0086 |
| 3.0s | 20.3 | 0.193 | 4.21s | 0.0643 | −0.0130 |

结论：**1.0s 是「白拿」的点**——召回与盲区一分不动，冗余回到与 uniform_32 基本持平；再往上就是拿
召回换冗余（2.0s 直接把召回砍半，因为 GT 判据的容差只有 0.5s，网格一旦明显疏于官方 1fps 密度
就开始漏切点）。上限只在 `w_i < (budget_max−1)×min_spacing = 31s` 时生效，即恰好是被过采样的那些
素材（10s 素材 32→11 帧；30s 素材 32→31 帧；≥31s 一律不变）。`test_window_plan.py` 把
`MIN_SPACING == 1.0`、上限公式、下限优先与「任何计划都不破 8s」都钉住了；要放松上限必须重跑本扫参。

### 18.2 生产变更点与 S1 断言（验收 3）

> **✅ 已落地（2026-10-09，`session/20261009-414-prod-window-plan-5a0bf1`）**：
> `asset-sourcer.mjs` Phase 2.5 的四档逻辑已换成 `buildWindowPlan()`，与
> `bench/keyframe/window_plan.py::plan_windows` **逐值对齐**（跨 17 个时长对比
> 逐字节一致）。真实数据冒烟（25 个素材，生产 `probeMedia` 实测时长）：
> **破 8s 盲区线 旧 12/25 → 新 0/25**，最差盲区 7.88s；30.2s 素材
> 3 窗 24 帧 → **1 窗 31 帧**（调用数同时下降）；帧数 575 → 1457（补回旧方案
> 饿死的覆盖）。
>
> **第 2 条（`DEFAULT_MAX_FRAMES` 16→32）未采纳，理由不成立**：窗口路径走
> `extract_frames(fps=sample_fps, …)`，**只读 `sample_fps`、从不读 `max_frames`**
> （`vlm_analyzer.py:961`）；`max_frames` 只作用于非窗口的
> `_extract_minicpm_frames` 与 scene 路径。⇒ 预算不会被调用侧 cap 截断，
> 抬它只会改动另一条路径。预算精确性由 `sampleFps` 单独保证
> （`n = ceil(span × fps)` 恰好等于 `b_i`；刻意不做 2dp 取整——取整会让
> 249s 的窗吐 33 帧）。
>
> 第 3 条（缓存）与第 4 条（S1 结构等价）按原判断成立：`n=1` 时仍发
> `window`（单数）、不产生 `windows` 数组。

落地清单（本票不改生产默认，以下为落地 PR 的变更点）：

> ⚠️ **以下清单是落地前的状态描述**，其中引用的常量与行号**已被上面的落地改动取代**
> （`LONG_TIER_MAX_MS` / `REDUCED_SAMPLE_FPS` / `MAX_SEGMENTS` /
> `MAX_FRAMES_PER_SEGMENT` 已删除，Phase 2.5 现在从 `buildWindowPlan()` 起）。
> 保留它是为了记录「为什么这样改」；要核对当前实现请读 `asset-sourcer.mjs`
> 的 `buildWindowPlan()` 与 §18.1.1 的上限公式，不要按下面的行号去 grep。

1. **`scripts/short-video/lib/asset-sourcer.mjs` Phase 2.5（`:1180-1230`）**：`DEFAULT_WINDOW_END_MS=8000`（`:1188`）/ `LONG_TIER_MAX_MS=30000`（`:1190`）/ `REDUCED_SAMPLE_FPS=0.5`（`:1191`）/ `MAX_SEGMENTS=3`（`:1192`）/ `MAX_FRAMES_PER_SEGMENT=8`（`:1193`）四档逻辑 → window plan（`n=ceil(D/248)`、边界吸附 ±min(15s, 10%·D/n)、每窗预算 `clamp(比例项, ceil(L/8)+1, min(32, floor(L/1.0)+1))`（§18.1.1 的时长上限）、单窗下限 `ceil(L/8)+1`）。窗口对象形状不变 `{startMs, endMs, sampleFps}`，`sampleFps = budget / 窗长`（≤8s 素材 1.0 → 4.0；10s 素材 1.1 而非 3.2）。
2. **`scripts/short-video/lib/vlm_analyzer.py`**：`DEFAULT_MAX_FRAMES=16`（`:125`）抬到 32，否则每窗预算被调用侧 cap 截断；`MAX_VIDEO_SECONDS=8`（`:115`）语义不变（单窗直喂档上限）；`normalize_windows`（`:1033`）字段契约不动。
3. **缓存**：`vlm-cache.mjs`（`:86-102`）已把 `window`/`windows` 纳入 key → 计划一变 key 必变，无 stale 命中，无需手工 bump `VLM_CACHE_PIPELINE_VERSION`。
4. **S1 等价性断言（`asset-sourcer-visual-integration.test.mjs`）**：S1（`:1132`「byte-identical single window」）的**结构**等价可保——`plan_windows` 在 D≤248s 时 n=1，单窗覆盖 `[0, dur]`、不产生 `windows` 数组；**payload 必然变**（sampleFps 1.0→4.0），断言改成「单窗 + 全跨度 + `sampleFps=budget/时长`」。同文件 S2（`:1153` 8-30s 单窗降 fps）、S3（`:1174` >30s 多窗）、S4（`:1220` 缺 durationMs 回退）与 `:1120` 的 10s 素材 `sampleFps:0.5` 断言都按新计划重推。新增断言：每窗 `L/(b-1) ≤ 8`、窗序列连续且覆盖 `[0, dur]`、计划变则缓存 key 变（S5）。
5. **默认不切**：`FRAME_STRATEGY` 与选帧策略（uniform/tiered/slice 谁做默认）属 #391 的另一项裁决；本票只交「分窗 + 预算」提案与数据。

### 18.3 E2E 延迟与 token 成本（验收 2）

产物 `results/exp_windows_e2e.json`（3 素材 × 3 臂，真 minicpm 调用：`temperature 0`、
`max_tokens 1000`、生产 `SEMANTICS_PROMPT_VIDEO`；空机单次测量，首帧数形态含 Metal
kernel 编译，不是重复基准）。

| 素材 | 时长 | 臂 | 调用数 | 帧数 | 墙钟 | prompt tok | gen tok |
|---|---|---|---|---|---|---|---|
| unitree 30s | 30.2s | legacy | 3 | 24 | 22.3s | 1974 | 184 |
| | | cut32_u | **1** | 31 | 21.2s | 2176 | 54 |
| | | cut32_v5 | **1** | 32 | 22.0s | 2242 | 53 |
| videomme -ApL8d6tX5U | 93.2s | legacy | 3 | 27 | 24.1s | 2172 | 178 |
| | | cut32_u | **1** | 31 | 22.5s | 2176 | 87 |
| | | cut32_v5 | **1** | 32 | 22.7s | 2242 | 76 |
| videomme -O6mJ0VBTc4 | 73.5s | legacy | 3 | 27 | 23.0s | 2172 | 154 |
| | | cut32_u | **1** | 31 | 21.0s | 2176 | 50 |
| | | cut32_v5 | **1** | 32 | 22.3s | 2242 | 58 |

**结论**：调用数 3 → 1（长素材现状按 `LONG_TIER_MAX_MS` 切 3 段，提案计划在 ≤248s 内只出 1 窗）；
墙钟 −5%~−9%（22.3→21.2s / 24.1→22.5s / 23.0→21.0s）——32 帧一次 prefill 与 3×8 帧三次相当，
省下的是每次调用的固定开销；**生成 token 降到 1/2~1/3**（184→54、178→87、154→50），因为一次
出完整描述，替代了「3 段各自描述 + 下游合并」。prompt token 基本持平（+0.2%~+3.2%）。
即：验收 2 的成本维度不是「更贵」，而是少 2 次调用、少一半以上输出 token、且下游不再需要
跨窗合并。


## 19. Session 4 续二：官方包严格装载层 + K-frames 恢复 query 条件（2026-09-30，session `20260928-keyframe-bench-1d663d`）

触发：用户对「官方装载层到底有没有增益」两次追问口径——(a) 此前只有我方复现装载层、官方代码
没有作为输入进 QA；(b) `m_kframes` 丢掉论文的 query 优先级后「和均匀采样没区别，测它有什么意义」。
本节是这两项的收口。

### 19.1 官方包可跑性（先决事实）

`~/.venvs/omni-official` 装着官方 `minicpmo 0.1.2` + `decord2 3.4.0`。官方
`get_video_frame_audio_segments` 用 ffmpeg 路径解码整片（短视频 `fps=1`，长视频 `fps=10` +
`uniform_sample(64)`），**没有接受外部时间戳列表的参数**——即官方 API 是「解码器」而非「选择器」，
query-conditioned 选帧无法在不改官方代码的前提下注入。`precompute_official_units.py` 在这个 venv
里真跑官方代码，产出 12 套 `official_units/<vid>/` 落盘产物（manifest + 帧 JPEG + 段音频 npy）。

### 19.2 三臂配对：官方码×2 + 我方 loader×1（`exp_omni_units_qa_official.py`）

> **命名澄清（用户 2026-10-01 指正）**：本实验**不全是「官方」**。三臂里两条用官方包产物，
> 一条是**我方 loader 作对照臂**——对照的就是「帧由谁解码」这一件事。叫「官方三臂」是误导，
> 准确说法是「官方码×2 + 我方 loader×1 的三臂配对」。

三臂同题配对，每条臂差一个变量：

| 臂 | 帧由谁产出 | 音频 | 隔离的变量 |
|---|---|---|---|
| `official_units` | 官方包 `get_video_frame_audio_segments` | 官方逐段音频（float16 npy） | 基准臂 |
| `official_vision` | 官方包（同上，**帧与基准臂完全相同**） | 不喂 | 音频进不进 context |
| `loader_vision` | **我方 `lib/video_loader`** | 不喂 | 帧由谁解码/抽取 |

口径 = Video-MME `bench_subset_100.csv` 交集视频里有官方产物的前 10 个、30 题、严格四选一、
`temperature 0`。产物 `results/exp_omni_units_qa_official.json`。

**我方 loader 在本实验里怎么用**：先按官方采样规则算出时刻表（≤64s 视频 1fps；>64s 按 10fps
解码后 `linspace(..., dtype=int)` 取 64 个时刻），再把时刻表交给 `load_video()`。
**两条分支实际走的是不同取帧路径**（实测 2026-10-09：`21q-lDikdBg` 52.91s 命中批路径，
`-ApL8d6tX5U` 93.15s 回落逐点 seek）：

| 分支 | 时刻表形状 | 实际路径 |
|---|---|---|
| short（≤64s） | `[0,1,2,…]`，步长恒 1.0s | **单次 `-vf fps=` 批解码**——`_try_batch_grid` 等差判据命中，产物 `batch_NNN.jpg` |
| long（>64s） | `linspace(0,n-1,64,dtype=int)/10`，整数截断让步长在 1.4/1.5 间跳 | **逐点 `-ss` 精确 seek**——等差判据（容差 1e-3）不过而回落，产物 `frame_NNN.jpg` |

loader 本身不做任何选帧决策（见 §20.1 的 loader 说明）。

**关于「加音频反而效果差」（用户质疑，2026-10-01）**：本实验里加音频**不是**「显著更差」。
首轮 30 题是 23/30 vs 24/30（p=1.0，方向微负），276 题终审是 14/6（p=0.115，方向翻成微正）——
两轮合起来读就是**「零点附近的噪声，任何方向都测不出显著效应」**。显著有害的是另一种音频
形态：**原始波形整段直喂**（−17pp，C1）。三种音频形态的对照见 §20.2 的 C1–C3。

**结果（10 视频 / 30 题，`temperature 0`，30 次推理零 ERR）**：

| 臂 | 帧来源 | 音频 | 正确 | 与相邻臂的逐题配对 |
|---|---|---|---|---|
| `official_units` | 官方码（≤64 帧） | 官方逐段音频 | 23/30 = 76.7% | vs `official_vision`：units_only 0 / vision_only 1，p=1.0 |
| `official_vision` | 官方码（≤64 帧） | 无 | 24/30 = 80.0% | vs `loader_vision`：official_only 0 / loader_only 5，p=0.063 |
| `loader_vision` | `lib/video_loader` | 无 | 29/30 = 96.7% | vs `official_units`：loader_only 6 / units_only 0，p=0.031 |

三条读法，按证据强度排：

1. **官方单元装载无增益，且方向为负**：同帧、同题、唯一差别是音频进不进 context，
   `official_units` 23/30 vs `official_vision` 24/30，**一题都没赢**（units_only=0）。
   与 §17.3 loader 底盘复跑（29/33 vs 31/33）及首轮官方产物（25/33 vs 26/33）同向——官方码
   底盘、复现装载两种底盘下「单元装载无一题获胜」都成立。
2. **我方 loader 的帧比官方解码器多赢 6 题（p=0.031，唯一过 0.05 的比较）**：两组都只用各自
   底盘产出的帧喂模型，官方解码走整片 `fps=1`/`fps=10` + `uniform_sample(64)`，我方 loader 走
   `frame_times` 选帧后再逐时刻 seek 抽帧。这不是「官方差」的结论——官方 API 是解码器、不接外部
   时间戳（§19.1），拿外部的选帧方案比它的均匀采样，**赢在选帧不在装载**。§18 的计划（每窗
   预算 + 盲区下限）正是 `frame_times` 这一侧的输入。
3. **30 题规模下的分辨率上限**：p=0.031 是 30 题里 6/0 的分裂，Bonferroni 校正 3 次比较阈值
   0.0167 之下不成立；引用 loader-vs-官方这条必须带校正后的判词。装载本身（音频）的 0/1 在
   任何校正下都远不显著——**所有增益和代价都在选帧侧，不在装载侧**。

**全量扩样结果（92 视频 / 276 题，与 §17.2 主轴同一批，2026-10-02 落地，828 次推理零 ERR）**：

| 臂 | 帧来源 | 音频 | 正确 | 与相邻臂的逐题配对 |
|---|---|---|---|---|
| `official_units` | 官方码（64 帧） | 官方逐段音频 | 211/276 = 76.4% | vs `official_vision`：units_only 14 / vision_only 6，p=0.115 |
| `official_vision` | 官方码（**帧与上行完全相同**） | 无 | 203/276 = 73.6% | vs `loader_vision`：official_only 2 / loader_only 17，**p=0.0007** |
| `loader_vision` | 我方 loader（**同一份时刻表**） | 无 | 218/276 = 79.0% | vs `official_units`：units_only 13 / loader_only 20，p=0.296 |

产物 `results/exp_omni_units_qa_official_full.json`。按 §20.4 预登记标准的判定：

1. **C3 维持（单元装载无显著增益）**：276 题上 units_vs_vision 14/6、p=0.115，不显著。
   方向相对 30 题轮（0/1 微负）翻成了微正——两个方向都在零点附近抖，稳健表述是
   「任何方向都测不出显著效应」；加上 5–10 倍的生成成本，排除判定不变。
2. **新确认：帧「提取」方式本身显著影响 QA（C9）**：`official_vision` 与 `loader_vision`
   喂的是**完全相同的时刻表**，只差帧由谁产出——官方整片 `fps=` 均匀解码 vs 我方 loader
   逐时刻 seek。配对 17/2、**p=0.0007，过 Bonferroni**（3 次比较阈值 0.0167）。
   30 题轮只是提示（0/5，p=0.063），276 题确认。机制未拆解（fps 滤镜的取帧舍入 vs
   JPEG 质量/分辨率差异），但同时间戳设计把结论钉在「提取」而非「选择」。
3. `official_units` vs `loader_vision`（13/20，p=0.296）混合了帧来源与音频两个变量，
   被 C9 的帧效应主导，不单独解读。

### 19.3 K-frames 恢复 query 条件（`exp_kframes_query.py` + `exp_kframes_query.json`）

按 arXiv 2510.13891 的 P1/P2 原文实现：分段（场景切点）→ **段描述**（本地 MiniCPM-o 4.5，不用
Gemini，所以管线离线可复现）→ **段与问题的相关性分**（同一模型，A/B/C/D 四档 → 权重 4/3/2/1）
→ D.2 分配 `k_j ∝ w_j·ℓ_j`（最大余数法补齐到预算）。对照臂 `kframes_queryfree` 即 `m_kframes`
的 `w≡1` 退化形式。两臂同题、同预算 16 帧，唯一差别是相关性阶段跑不跑。

**两处必须记录的 harness 缺陷**（都是静默降级，会把「没测」伪装成「没差别」）：

1. `bench_common.grab_frame(size_w=None)` 会构造 `scale=None:-2`，ffmpeg 报错返回 `None`，
   而调用方把它当「无帧」继续用零张图生成——模型会照样编出一句描述。第一轮 pilot 因此拿到
   44.4% vs 44.4% 的假平局（全部 caption 为空、相关性全 1.0、两臂分配逐题相同）。修法：抽帧
   固定 `size_w=480`，并给 `generate()` 加空帧守卫（无帧直接抛错，不出文字）。产物保留为
   `exp_kframes_query.invalid-zero-image-pilot.json`，不对应任何结论。
2. Video-MME 这批是解说/字幕型素材，0.08 阈值切出 80–98 段、其中 82 段亚秒长。论文的 P1 单位是
   「可描述的 clip」，亚秒段没内容可描述，所以把短于 `MIN_SEG=2.0s` 的段并入**前邻**（末段无
   后继、向后折叠；80→14、98→10、91→7 段）。这是有意偏离 `m_kframes` bench arm 的设计，在此
   明写。（PR #443 review 勘误：实现一直是并入前邻，初稿误写「并入后邻」。）

**两轮 pilot（先无效后有效），再扩样**：

- **第一轮 pilot 无效**（3 视频 9 题）：44.4% vs 44.4% 假平局——当时 `grab` 拿零张图生成（上文
  缺陷 1），caption 全空、相关性全 1.0，两臂分配**逐题相同**（0/9 不同），是同一个退化分配的
  对影。产物另存 `exp_kframes_query.invalid-zero-image-pilot.json`，只作踩坑记录。
- **第二轮 pilot 有效**（修复后重跑，3 视频 9 题）：`kframes_query` 6/9 = 66.7% vs
  `kframes_queryfree` 6/9 = 66.7%；配对 `query_only=0 / queryfree_only=0`、p=1.0；**7/9 题帧
  分配不同**（captions 14/10/7 段全非空、相关性取值 1.0–4.0）。方向提示但 n=9 不定案。
- **扩样到 10 视频（9 个本地有 mp4，27 题，`results/exp_kframes_query_10v.json`）**：

| 臂 | 正确 | 逐题配对 |
|---|---|---|
| `kframes_query`（P1 描述 + P2 相关性 → `k_j ∝ w_j·ℓ_j`） | 21/27 = 77.8% | query_only **0** / queryfree_only **0**，McNemar **p=1.0** |
| `kframes_queryfree`（`w≡1`，即 `m_kframes`） | 21/27 = 77.8% | 同上 |

**这不是「测不出差别」，是「真的零差别」**：27 题里 **24 题的帧分配两臂不同**（相关性权重取值
覆盖 1.0/2.0/3.0/4.0，captions 每段都非空、相关性零报错），但**正确答案一题都没变**。
即把论文的 query 条件阶段完整跑一遍（描述 → 相关性 → 按相关性重排帧的分配），换来的是
「帧的位置动了、答案没动」。

三条结论：

1. **`m_kframes` 的退化形测的不是白卷**：它测的是「论文的 query 阶段在这套 QA 协议上值多少」，
   答案是 **0 题**。所以 §17.2 那张表里它的 QA 第一（72.5%）与 query 无关，纯粹来自
   `k_j ∝ ℓ_j` + 段内中点这个分配形状——这恰好解释了它为什么 QA 第一而几何倒数（0.322）：
   中点系统性地离开切点，但 Video-MME 的题多数不要求切点帧。
2. **不要再为该方案扩样或加 Gemini**：27 题、24 题分配不同、0 题翻转，再往上加样本或换成
   Gemini 打分都不改变「query 阶段对答案无影响」这个结论；要动它得先有别的轴（如 KFS、
   per-question GT）显示它有用。**该项结题。**
3. **顺带纠正一个可能的误读**：两臂点数相同不等于实现相同——pilot 里 `grab` 缺陷让两臂都退化成
   同一分配，那一轮是无效产物；本轮 24/27 题分配不同、相关性取值有区分度，才是有效比较。

**全量扩样（92 视频 / 276 题，2026-10-02 落地，`results/exp_kframes_query_full.json`）**：
`kframes_query` 202/276 = 73.2% vs `kframes_queryfree` 203/276 = 73.6%；配对
`query_only=8 / queryfree_only=9`、**p=1.0**；**231/276 题两臂选帧不同**，相关性管线全程
零降级。按 §20.4 预登记标准落锤：17/276 = 6.2% 的翻转率、8/9 的对称分裂——query 阶段
大量移动帧的位置（84% 的题分配不同），但对答案的影响是纯噪声。**C5 结题成立，该项终审
关闭。**

### 19.4 tiered v5 的 13.81s 盲区定位（窗缝 ≠ 盲区）

§18.1 把 `cutwin32_v5` 的 13.81s 记在「窗缝」名下，本 session 复查发现**记错了**：302s 长片两窗
边界 151.25s 的实际缝是 **0.00s**（前窗末帧与后窗首帧重合，`even_grid` 含端点）。真因在选帧侧：
v5 在第 0 窗抽出 **33 帧（预算 32）**，末帧落在 137.44s，到窗尾 151.25s 空出 13.81s。
即「8s 盲区下限」只在 tiered 自己的窗内成立，不覆盖**选帧集合的右端**——这是选帧器的覆盖
边界问题，不是分窗计划的问题（`cutwin32_unif`/`cutwin32_cap` 同一计划下最大盲区 4.88s，两者
相差的只有喂帧方式）。§18.1 的表与结论按「计划保线、选帧不保线」读，数字不变。

### 19.5 本轮其余待跑项的裁决（不跑，理由写在证据里）

| 待跑项 | 裁决 | 依据 |
|---|---|---|
| **slice + 官方单元**（换强选帧器配官方装载） | **不跑** | 官方装载轴 ②③ 两轮 `units_only=0/0`（去重 63 题，计数口径见 §C3）——这两轮里「音频经单元装载进 context」一题没赢；四轮合计**零显著**（最小 p=0.115）。换选帧器只改视觉输入、不改音频通道的结论；要提升 slice 有更便宜的轴（§17.2 的纯视觉臂）。 |
| **best-combo 单臂显著性**（slice+ASR 73.2% vs uniform 70.7%，p=0.10） | **不跑（成本/收益不成比例）** | 需把 92 视频 / 276 题的 slice+ASR 臂补到能将 +2.5pp 推到 p<0.05，按本轮单臂 ~50s/题估算需扩到 ~700 题（≈10h 机时）。该臂的 ASR 增益已由四方法合并检验（p=3.9e-05）覆盖，单臂显著性只是把同一结论再报一遍。 |
| **fit pass 层二重跑** | **作废** | 原判「`crop_cleanup` NameError 污染 25 个工件」**实测不成立**：30 个带 `frameFields` 的工件 276 帧全零 error，`fit` 取值仅 {cover 205, contain 71}，无全 None 行。那条 traceback 属于 `run_bench.py` 尾部 index 重建（`'list' object has no attribute 'get'`），与 fit pass 无关。 |
| **tiered v5 窗缝覆盖** | **转办为选帧器缺陷** | 见 §19.4：窗缝实测 0.00s，缺陷在 v5 选帧集合右端（第 0 窗 33 帧超预算、末帧 137.44s 距窗尾 13.81s）。属选帧策略票，修法是选帧后按窗预算截断 + 保证末帧落在窗尾附近，不是改分窗计划。 |

### 19.6 本轮的通用教训（两条 harness 缺陷，都是静默降级）

1. **零输入也要报错，不许生成**。`grab` 失败 → `[]` → 模型仍输出文字，是这次假平局的根因
   （44.4% vs 44.4%，实际两臂是同一个退化分配）。已加空帧守卫。规律：任何「输入为空」的分支
   都必须让上游看见，而不是让下游模型去猜。
2. **常量降级比抛错更危险**。相关性打分失败原本回落到 `1.0`（"no relation"），把「没测到」
   伪装成「测到了、不相关」。现在失败显式记 `_relevance_error` 并打印警告，pair 不再被引用。


## 20. 结论总表与选型理由（评审用，2026-10-01，session `20260928-keyframe-bench-1d663d`）

> 本节为**联评**而写，自包含、不依赖前文：先讲清实验平台（模型 / benchmark / loader / 样本量），
> 再列全部结论（每条带数字、证据产物、置信度与依据链），最后给选型建议与理由。
> 评审时若有任何一条「讲不清依据在哪」，视为该条证据链有缺陷，当场补证或降级。

### 20.1 实验平台（自包含）

**背景**：短视频生产管线把素材视频喂给视觉语言模型（VLM）做语义分析。有两层决策要定：
**装载层**（解码成什么形态喂模型：几帧、什么分辨率、音频喂不喂、以什么形态）与
**选帧层**（选视频里哪些时间点的帧）。两层解耦：选帧只产时刻表，装载按时刻表取帧。

**被测模型**：MiniCPM-o 4.5（8B），MLX 框架（mlx-vlm 0.7.2），本机 Apple M2 Pro 32GB，
全部实验 `temperature=0`。这是生产管线在用的 VLM，所有结论只对它负责。

**四个 benchmark**：

| benchmark | 内容与规模 | 测什么轴 |
|---|---|---|
| Video-MME | 官方视频 QA 数据集，每视频 3 道四选一题。取官方 test 集的 100 视频子集（`bench_subset_100.csv`），本地有 mp4 的 92 个 → **92 视频 / 276 题** | 喂不同帧/音频组合看答题正确率。**装载层的主裁决尺**；对选帧层只作终审不作筛选（C4） |
| ActivityNet Captions val_1 | 官方密集描述数据集，110 视频 / 462 事件段，每段有人工参考描述 | 生成描述 vs 人工描述打分（CIDEr/METEOR/ROUGE-L）。**描述质量轴** |
| KFS-Bench | 学术关键帧 benchmark，GT =「答题必需场景」 | 选帧方法打分（UKSS）。**选帧层第二筛** |
| 自建几何判据集 | 16 素材（口播 / UI 录屏 / 拼接长片等）。**GT 覆盖 5/16**（`exp_windows.json` 实测：`content_ABC_av` 1 切点、`content_ABCx2_30s` 5、`content_ABCx2_302s` 59、`ui-demo` 7 事件、`unitree` 7）；其余 11 个（`talkinghead` + 10 个 Video-MME 片段）**无几何 GT**。**GT 来源（§13.2，无人工视觉标注幸存）**：4 个合成素材用构造数学 GT——切点 = 拼接时刻，机械权威；`unitree`（真实素材）视觉标注两版均被探针复核**推翻**，GT 降级为**三机制机械共识**（ffmpeg scene ∩ I-frame pts ∩ 灰度帧差，任二独立机制 ±0.15s），provenance 标注「待用户 HITL 终裁」——**联评时请裁** | 场景召回（±0.5s，**只对 GT 覆盖的 5 个素材有意义**）、最大盲区（16）、pHash 近重复率（16）。**选帧层第一筛**（零模型成本） |

**「我方 loader」**= `scripts/short-video/lib/video_loader.py`（#417 落地的统一装载层）：

- **接口**：`load_video(video_path, request)`，调用方必须传 `frame_times`（绝对秒列表）。
  **loader 不做任何选帧决策**——选哪些时刻是上游（分窗计划 / 选帧算法）的输入。
- **契约**：帧时刻 ⊂ 音频段边界 ⊆ 转写段边界，全管线一条时间轴。

代码级细节（评审时逐条可查源码）：

- **抽帧两条路径**。时刻表为等差数列（生产常态）→ 整片单次解码
  `ffmpeg -ss <首帧> -i 视频 -t <跨度> -vf fps=1/<步长> -q:v 2`，产出帧数必须精确等于
  请求数，否则整批删除回退逐帧路径（防帧错位）；任意时刻表 → 逐时刻精确 seek
  `ffmpeg -ss <t> -i 视频 -frames:v 1 -q:v 2`。`-q:v 2` = JPEG 质量第 2 档（0–31）。
  **loader 不缩放**，出原分辨率 JPEG；≤512px 缩放发生在下游 VLM 封装层。
  t 恰为视频末尾时 `-ss` 拿不到包，回退 `-sseof -0.5` 取最后一帧。
- **音频切段**：相邻帧时刻之间切一段，1 帧对 1 段：
  `ffmpeg -ss <t_i> -i 视频 -t <t_{i+1}-t_i> -vn -ac 1 -ar 16000 -c:a pcm_s16le`，
  即单声道 16kHz 16-bit PCM WAV，最后一段到视频末尾。
- **喂模型三适配器**：`to_text_interleaved`（生产用：帧 JPEG 路径 + 转写文本进 prompt，
  block 模式截 2000 字；即 C2 验证的形态）/ `to_minicpm_units`（官方引擎契约路线：单元 i =
  帧 i + 音频段 i 波形交错，实测零增益）/ `to_qwen_omni`（整片原样传、模型自解码，
  loader 时刻表**不生效**，不进生产）。
- **转写引擎不在 loader 里**：loader 只留注入口 `asr_runner`。生产引擎 =
  **WhisperX（faster-whisper 后端），模型 large-v3，CPU**（`asr_worker.py`；模型档位为
  ADR-0020 全仓默认，CI 门禁禁降档）。loader 把引擎分段按**中点**归入时间格
  `[t_i, t_{i+1})`——不切词、不复制、不丢；引擎缺失/抛错 → `status="unavailable"` + 原因，
  绝不静默当静音。
- **缓存**：key = sha256(视频字节) + frame_times + 音频开关 + 采样率 + ASR 参数 +
  loader 版本；manifest 列出的文件缺一个即 miss。
- **旋转 metadata**：无专门处理，靠 ffmpeg 默认 autorotate（按容器 display matrix 转正），
  未传 `-noautorotate`，代码中无旋转分支。

**「官方装载」**= 官方包 `minicpmo.utils.get_video_frame_audio_segments`（venv
`~/.venvs/omni-official`，minicpmo 0.1.2）。它是**解码器不是选择器**：整片 `fps=1`（≤64s）
或 `fps=10` + 均匀取 64（>64s），**不接受外部时间戳**。产物由 `precompute_official_units.py`
用官方代码真跑落盘（`official_units/<vid>/`，现在已覆盖全部 92 个本地视频）。

**样本量与统计功效（诚实表）**：

| 实验 | 规模 | 功效判定 |
|---|---|---|
| 选帧轴 QA 横评 | 92 视频 / 276 题 | 够装载层裁决（−17pp 轻松显著）；**不够选帧方法排序**（+3.6pp 才 p=0.087）——这本身是结论 C4 |
| 官方三臂配对（首轮） | 10 视频 / 30 题 | **偏少**：只够排除大增益。可信度建立在**四轮零显著**（①②③ 去重 63 题 + ④ 276 题，口径见 §C3）+ 跨底盘同向 |
| kframes query 恢复（首轮） | 9 视频 / 27 题 | **pilot 量级**：0/27 翻转 → 真实翻转率 95% 上界 ~11%，不足以证明严格等价 |
| ActivityNet | 110 视频 / 462 事件 | 够（配对 bootstrap B=400） |
| 几何判据集 | 16 素材 | 只作第一轮筛，不作最终裁决 |

→ 用户 2026-10-01 指正「样本特别少」，两个小样本实验已于 2026-10-02 按**与主轴相同的
92 视频 / 276 题**完成终审（三臂 828 次、kframes 552 次推理，均零 ERR；判定见 §20.4）。
表中「首轮」行保留作功效演算的历史依据。

### 20.2 结论总表（每条：结论 → 数字 → 证据 → 置信度）

**C1｜原始波形直喂有害，永久排除。**
帧+波形同喂 50.0% vs 纯视觉 67.0%（**−17pp**，McNemar p=2.5e-06，n=276）。模型不报错、
输出分布正常——是内容层面被音频通道带偏，不是工程故障。产物 `exp_videomme_qa_100_audio.json`。
置信度：**高**（大效应 + 大样本 + 配对显著）。

**C2｜音频信息的唯一有效形态是「转写文本」。**
ASR 转写进 prompt：69.6% → 73.2%（+3.6pp）。单臂 p=0.087 不显著，四方法合并 p=3.9e-05 显著。
呈现格式（整块/带时间戳/不截断/放题后）测不出差别。产物 `exp_videomme_qa_100_asr*.json`。
置信度：**中高**（合并检验显著；引用必须带「单臂不显著」）。

**C3｜官方 omni 单元装载（逐帧配段音频）无增益。**
**计数口径（显式声明）**：① 与 ② **同题集**（各 33 题，产物实测交集 33）；③ 的 30 题
**全部落在 ④ 的 276 题内**（实测交集 30）。故 **①②③ 去重 63 题**（33+30），④ 是独立扩样轮。

| 轮 | 臂（units vs 同帧纯视觉） | 题数 | 配对 | McNemar p |
|---|---|---|---|---|
| ① 官方码产物（11 视频） | 25/33 vs 26/33 | 33 | units_only 3 / vision_only 4 | 1.00 |
| ② 我方复现装载（loader 底盘） | 29/33 vs 31/33 | 33（=①） | units_only 0 / vision_only 2 | 0.50 |
| ③ 官方码×2 + loader×1 三臂 | 23/30 vs 24/30 | 30（⊂④） | units_only 0 / vision_only 1 | 1.00 |
| ④ 276 题终审 | 211/276 vs 203/276 | 276 | units_only 14 / vision_only 6 | 0.115 |

**四轮全部零显著**（最小 p=0.115）；但**「零胜」只对 ②③ 成立**——① units 赢 3 题、④ 赢 14 题。
方向在 ③④ 之间翻号（③ 微负、④ 微正），两轮都在零点附近抖，任何方向都不显著。
单次生成 ~76s（纯视觉 5–10 倍）。产物 `exp_videomme_units{,_loader}.json` 与
`exp_omni_units_qa_official{,_full}.json`；①② 的纯视觉对照臂取自
`exp_videomme_qa_100.json` 的 `tiered_v5`。
置信度：**高**（276 题终审 + 四轮同向「零显著」）。


**C4｜QA 正确率不能给选帧方法排序；它的用途是裁决装载层。**
分辨率论证：276 题下 +3.6pp 才 p=0.087，方法间 3pp 内的差距分不开。背离证据：kframes
QA 第一（72.5%）/ KFS 中游 / 几何倒数第三（0.322）——QA 对「帧选在哪」不敏感。
产物 `exp_videomme_qa_100.json` + `kfs_summary_k64.json` + 几何产物。置信度：**高**。

**C5｜kframes 论文的 query 阶段（字幕+相关性打分）在这套 QA 协议上价值为零。**
恢复论文 P1/P2 完整管线（段描述 → 段-问题相关性 → D.2 分配）后：27 题里 24 题选帧不同、
0 题翻转（p=1.0）；**276 题终审：231/276 题选帧不同、17 题翻转且分裂 8/9（p=1.0）、
相关性管线零降级**。它的 QA 第一完全来自分配形状（`k_j ∝ ℓ_j` + 段内中点），
这同时解释了它的三口径背离（C4）。产物 `exp_kframes_query{,_10v,_full}.json`。
置信度：**高**（276 题终审，按 §20.4 预登记标准结题）。

**C6｜tiered v5 的盲区修复是真的，但右端覆盖有缺陷。**
v5 67.0% vs v1 61.2% 逐题显著。但 302s 素材第 0 窗抽出 33 帧（预算 32），末帧 137.44s
距窗尾空 13.81s——「8s 盲区下限」只保它自己窗内，选帧集合右端不保。
（初判归因「窗缝」是错的：302s 实际窗缝 0.00s，§19.4。）产物 `exp_windows.json`。
置信度：**高**。

**C7｜分窗计划 + 窗内均匀网格 + 1.0s 时长上限（cutwin32_cap）三项几何指标同时达标。**
16 素材：召回 0.599→**0.837**、最大盲区 12.50s→**4.88s**（唯一 ≤8s 达线组合）、
近重复率 0.0786 ≈ uniform_32 的 0.0773。1.0s 上限来自扫参（2.0s 召回砍半至 0.457，
因 GT 容差 0.5s）。E2E：调用 3→1、墙钟 −5~−9%、生成 token 184→54 / 178→87 / 154→50。
产物 `exp_windows.json` + `exp_windows_cap.json` + `exp_windows_e2e.json`。置信度：**高**。

**C8｜描述质量：CIDEr 低是长度口径问题，不是没描述清楚。**
预测 41.9 词 vs 参考 13.8 词；CIDEr(σ=6) 长度惩罚压到无惩罚值的 4.4%。限 ≤20 词对照：
CIDEr 0.0095→0.1456（15×），METEOR 微降。裁决：不为横比压缩生成。
产物 `caption_anetc_v2*.json` + `caption_bootstrap.json`。置信度：**高**（配对 bootstrap B=400）。

**C9｜帧「提取」方式本身显著影响 QA：同时间戳下，我方 loader 的逐时刻 seek 胜官方整片均匀解码。**
92 视频 / 276 题三臂终审：`official_vision` 与 `loader_vision` 喂**完全相同的时刻表**，
只差帧由谁产出——官方码整片 `fps=` 均匀解码 73.6% vs 我方 loader 79.0%，配对 17/2、
**p=0.0007，过 Bonferroni**（3 次比较阈值 0.0167）。30 题首轮只是提示（0/5，p=0.063），
276 题确认。机制未拆解（fps 滤镜取帧舍入 vs JPEG 质量/分辨率），但同时间戳设计把结论
钉在「提取」而非「选择」。产物 `exp_omni_units_qa_official_full.json`。置信度：**高**。

**工程事实（支撑 C3 的独立性）**：我方复现装载 vs 官方产物逐帧交叉校验：753 帧中 724 帧
像素一致（MAD≤10）、音频段长 |Δ|≤0.026s——C3 不是「我方装载做错」导致的假阴性。

### 20.3 选型建议与理由

**装载层（已定，#417 落地，本轮加固）**：生产接口 = **帧 + 音轨 + 带时间戳转写**三件套；
不做波形直喂（C1 有害）；不做单元装载（C3 四轮**零显著**、且慢 5–10 倍）；音频信息走转写文本（C2）。
抽帧用我方 loader：同时间戳下提取质量显著优于官方整片均匀解码（C9，p=0.0007），
且官方 API 根本不接受外部时间戳（§19.1）。

**选帧层（建议，待用户拍板生产落地）**：**分窗计划 + 窗内均匀网格 + 1.0s 时长上限**
（cutwin32_cap），`DEFAULT_MAX_FRAMES` 16→32。

理由链：
1. **唯一按构造保住 8s 盲区下限的组合**（C7：4.88s）。tiered v5 右端破线（C6）、
   legacy24 现状 12.50s、uniform32 10.00s——都超线。
2. **三指标同时不劣于现状**：召回 0.599→0.837；冗余经 1.0s 上限回到 uniform_32 水平；
   上限取 1.0s 是扫参白拿点，不是拍脑袋（C7）。
3. **更便宜**：调用 3→1 次、生成 token 降到 1/2–1/3（C7 E2E）。
4. **不选论文/神经选帧法做默认**：QA 分不出方法差距（C4），几何+KFS 上无 convincing 优势，
   而「计划+均匀网格」最简单、可构造验证；kframes query 阶段零价值（C5）。

**保留项（属选帧策略票，默认未动）**：tiered v5 需先修右端覆盖才可用；slice 是 QA 轴上
最稳的自研候选（+转写 73.2%）但同样不保证几何下限。**联评注（2026-10-02）**：KFS@32
短名单上 slice 0.5576 / uniform 0.5520 领先、cutwin32_cap 0.4646 落后（§20.7）——
若几何轴退役出排序，选帧默认应重议为 uniform_32 或 slice（slice 需补盲区自检）。

**模型与预算（2026-10-09 追加，Q41 收盘）**：

| 轴 | 结论 | 依据 |
|---|---|---|
| 短档引擎 | **MiniCPM loader_block**（33.9s/题，83.0%） | Q39⑤：与 Qwen native 并列（配对 229=229、**p=1.0**），快 1.6× |
| 中档引擎 | **Qwen3-VL-30B-A3B + 转写**（71.1%） | Q39⑤：唯一显著领先（vs u64 p=0.020、vs Omni p=0.017） |
| Omni 的地位 | **不是「用不到」——它是短档最快的（23.4s/题）且精度并列（80.8%，p≥0.4）** | 见下方「Omni 的真实地位」 |
| 像素预算 | **不动**（VL 保持 25.1M） | Q41⑲：代价 −4.4pp 不能排除，速度收益从未受控测量，且该轴在生产上不参与 |
| 位置编码/时间戳 | **不改处理器** | Q41⑭：VL 用 Interleaved-MRoPE + 文本时间戳，Omni 用秒缩放 M-RoPE，属各自官方口径 |
| Thinking 模式 | **用户已决定不用** | Q41⑱：错题臂 14/47 修回，但 +5.1pp 是上界 |

**Omni 的真实地位（回答「omni 就完全用不到了吗」）**：不是。短档四条路线打平
（MiniCPM 83.0 = Qwen 原生 83.0 = Qwen 外抽帧 81.5 = **Omni 看听交织 80.8**，
p≥0.4），而 **Omni 是最快的：23.4s/题**（中位 21.9s）vs MiniCPM 33.9s、
Qwen 原生 55.6s。所以它是一个**可行的速度优先选项**。

它没被选中的原因是**它的独有功能是废的**：Omni 唯一区别于另两个模型的是音频塔
（原生听波形 + 交织），而 Q36 定案「**音频交织贡献 ≈0**」（interleave vs pure
两档 p≥0.5）。即 Omni = 一个更重的模型（30B vs MiniCPM 8B），独有功能零贡献，
精度并列 —— 没有理由为它换引擎。**它作废的是「音频塔」，不是模型本身。**

**⚠️ 本表的最大前提**：以上全部结论建立在「整片喂 64 帧」的 bench 形态上，
而生产是分档窗（>30s 时 3 等分窗、每窗 ≤8 帧、**单题 ≤24 帧**）。
**窗口臂从未测过**（§Q41⑳ #1）——在它跑出来之前，bench 的绝对分数（71-83%）
**不能直接当作生产预期**。


### 20.4 扩样判定结果（预登记标准 → 2026-10-02 落地执行）

两个小样本实验已在**与主轴相同的 92 视频 / 276 题**上完成终审（2026-10-02，三臂 828 次 +
kframes 552 次推理，均零 ERR）。判定严格按 2026-10-01 预先登记的标准执行：

| 扩样 | 产物 | 预登记标准 | 判定结果 |
|---|---|---|---|
| 官方码×2 + loader×1 三臂 | `exp_omni_units_qa_official_full.json` | units 显著为正 → 推翻 C3；否则维持 | 211/276 vs 203/276，配对 14/6、p=0.115 → **C3 维持**；附带发现帧提取方式显著（17/2，p=0.0007）→ **新增 C9** |
| kframes query vs w≡1 | `exp_kframes_query_full.json` | 翻转率可忽略且不显著 → C5 结题；显著翻转 → 重开 | 202 vs 203，配对 8/9、p=1.0、231/276 题分配不同 → **C5 结题成立** |

§19.2 / §19.3 / §20 的数字已同步为全量口径。两项扩样各自产出一个副产物：C9（帧提取
质量显著影响 QA，本节新增）与 kframes 的 84% 分配差异 + 零答案效应（C5 的机制证据）。

### 20.5 官方装载 vs 我方装载逐层对照（联评问答，2026-10-02）

用户联评四问的落档。官方侧逐层描述以
`~/.venvs/omni-official/.../minicpmo/utils.py` 源码为准（`use_ffmpeg=True` 路径，
即 bench 实际跑的分支）。

| 层 | 官方 `get_video_frame_audio_segments` | 我方 `load_video` |
|---|---|---|
| 时刻表 | **内置策略，不接受注入**：≤64s（`MAX_NUM_FRAMES=64`）整秒网格 `[0..⌈dur⌉-1]`；>64s 先按 0.1s 网格，抽帧时 `uniform_sample(·, 64)`（`np.linspace` 等距索引） | **外部输入**（`frame_times`）；loader 不选帧 |
| 抽帧 | 整片解码一次：`ffmpeg -i v -vf fps=1`（短）/ `fps=10`（长）→ 全帧 JPEG 进临时目录 → 长视频 linspace 挑 64 张 → PIL RGB | 等差时刻表走同款 `-vf fps=` 单次解码（帧数不精确匹配整批废弃回退）；任意时刻表逐时刻 `-ss <t>` 精确 seek 单帧；`-q:v 2` 原分辨率；t=视频末尾 `-sseof` 回退。**注意**：官方时刻表的短/长两分支落在这条判据的两侧，实测见 §19.2 |
| 音频 | 整轨 `ffmpeg -vn -ac 1 -ar 16000` → librosa 读成**整条 float 波形** → 按时刻切片成 np 段；末段 <1600 采样补零 | 逐段独立切 16kHz mono s16 **WAV 文件**；帧 i ↔ 段 i，1:1 |
| 转写 | **无**——模型自己听波形（omni 音频编码器） | 注入 `asr_runner`（生产 WhisperX large-v3 CPU）；引擎分段按**中点**归入帧网格格 `[t_i, t_{i+1})` |
| 喂模型 | 波形段进模型**音频编码器**（单元交错：frame 0, audio 0, frame 1, …） | 生产：帧 JPEG + 转写全文进 prompt（文本通道）；波形不喂 |
| 缓存 | 无（每次重解码） | key = sha256(视频字节)+时刻表+参数+loader 版本，manifest 逐文件校验 |

**问 1｜转写是全文镜吗？标注帧对应吗？**
生产适配器 `to_text_interleaved` 的 block 模式 = ASR 引擎对整条音轨的全文（截 2000 字），
**不标注帧对应**。但 loader 的 `transcript.segments` 在结构上已经按帧网格切好——格 i 就是
「帧 i 到帧 i+1 之间说的话」；现成的标注形态有两种：`ts` 模式（`[MM:SS.s] 文本` 每格一行）
和 `frames_with_text()`（帧 i 直接配格 i 的文本字段）。bench 把 block/ts/full/after 四种
呈现都测过（§17.2 的 `_asr_ts/_asr_full/_asr_after`），彼此无差别——增益来自「有转写」
本身（C2），不来自呈现形式。

**问 2｜我们的装载根本没用 Omni 模型的音频能力？**
对。生产装载**完全绕过模型的音频编码器**：模型收到的只有图像 token + 文本 token。
音频能力只在实验臂里被真正用过——`to_minicpm_units`（波形段进 audio encoder，
镜像官方单元交错），实测无增益且慢 5–10 倍（C3）；波形直喂有害（C1）；文本是唯一
有效形态（C2）。所以「绕过」不是遗漏，是被四轮实验推出来的决策。

**问 3｜第 0 层选完帧就已固定 32 个时刻，为什么还要抽帧？**
选帧层产出的是**时间戳数字**，模型要吃的是**像素**。抽帧就是把每个时刻真的解码成
JPEG 的执行层（含边界处理：越界报错、末尾回退、等差快路径）。计划 ≠ 执行：
C9 实测同一份时刻表，执行方式的好坏差 5.4pp（79.0% vs 73.6%，p=0.0007）。

**问 4｜测试时第 0 层就是 uniform 吗？**
分实验：①三臂终审（昨夜 92v/276q）**是**——三条臂共用官方规则生成的均匀时刻表
（≤64s 整秒；>64s linspace 64），这是控制变量的刻意设计，保证差异只能来自提取；
②选帧层横评（§17/§18）**不是**——uniform_16/32 只是两条基线，非均匀方法测过
tiered v1/v5、cutwin32_unif/cutwin32_cap、slice、kframes、kframes query 共 8 种，
最终推荐的是**分窗计划 + 窗内均匀网格 + 1.0s 上限**（cutwin32_cap），不是全局均匀。

**问 5｜「两方差别就是送不送原始音频」？**
不完整，差别有两条轴：①**帧提取方式**——同时间戳下我方 loader 显著胜官方整片解码
（C9，与音频无关）；②**音频形态**——官方送波形进音频编码器（实测无增益 C3、
直喂有害 C1），我方送转写文本（实测 +3.6pp C2）。实验里官方形态的波形**真喂过**，
不是没试。

**追问（2026-10-02 续）**

**问 6｜选帧层是不是已把「抽哪个时刻」定死？**
是。选帧层的唯一产出 = `frame_times` 绝对秒列表；loader 只做校验（去重 / 排序 /
毫秒取整 / 越界报错），不增删改任何时刻。

**问 7｜为什么不把选帧和抽帧合成一步？**
①变更轴不同：选帧是策略层（横评迭代了 8 种方法），抽帧是机械层（ffmpeg / 缓存 /
边界处理，写一次验证一次）；②缓存复用：cache key 含时刻表，所有选帧实验共享同一批
解码产物；③可测性：S1 等价断言与时间轴不变量都打在这个接口上；④实证——**C9 之所以
能被发现，正是因为抽帧藏在同一接口后可替换**：同一时刻表换提取实现差 5.4pp。
合成一步，这个变量永远测不出来。

**问 8｜不喂音频时，Omni 模型就等于普通 VLM？**
功能上对：生产配置下模型只收图像 token + 文本 token，音频塔闲置；同一套权重，
omni 的听/说能力全部未用。且这不是假设——四轮实验真用过音频能力（单元臂），
无增益且慢 5–10 倍（C3），波形直喂有害（C1）。「绕过音频塔」是被数据推出来的决策。

**问 9｜官方网格内挑哪一张是怎么挑的？按帧质量吗？**
**不看质量、不看内容，纯下标算术**：整片解码出 N 帧后
`uniform_sample(range(N), 64)` = `np.linspace(0, N−1, 64, dtype=int)` 等距取下标
（≤64s 视频则整秒网格全取，至多 64）。全链路没有任何清晰度 / 美学 / 信息量打分。
「看内容选帧」在我们的横评里对应 slice（学习打分器）与 kframes（描述+相关性），
那才是内容驱动。

**问 10｜生产喂转写文本，为什么 loader 还会切 WAV？是在模仿官方音频处理吗？**
不是模仿，是**产物与适配器分离**：loader 产全套对齐产物（帧 + 段 WAV + 转写），
适配器决定消费哪些。切 WAV 的存在理由：①**转写网格的骨架**——ASR 归格用的时间格
就是音频段链 `[t_i, t_{i+1})`，没有这条链就没有帧↔文本对齐；②units 引擎契约路线
直接读这些 WAV（C3 实验臂）；③**当前生产连 WAV 都不切**——`vlm_analyzer` 传
`want_audio=False`，音频段与转写都不产。与官方唯一的对齐点是「1 帧 1 段」这个规格
（spec S4，官方单元包的形状要求），实现完全独立（逐段 ffmpeg s16 WAV，
非 librosa 整轨切片）。

**追问二（2026-10-02）**

**问 11｜生产阶段是否不需要「选帧/抽帧」两步？**
两步**现在就在生产里**，不是测试专用：`vlm_analyzer` 先算时刻网格（现状 = 均匀网格；
#414 计划把它换成 cutwin32_cap 分窗计划），再调 `load_video(frame_times)` 抽帧，
两侧各自缓存。可以加「一次调用」的便捷封装（`load_video(video, budget)` 内部先计划
再抽帧），但那是 API 糖不是架构合并。分开的生产理由：计划只依赖元数据（便宜、可
预先算好缓存）；抽帧是昂贵解码（按 视频×时刻表 缓存复用）；换选帧策略时抽帧层
零改动——#414 正是只换计划侧。

**问 12｜选帧样本够了吗？哪种最好？**
**几何轴：够下推荐**——16 素材、三硬门槛（召回、8s 盲区下限、近重复率）只有
cutwin32_cap 全过（0.837 / 4.88s / 0.0786），1.0s 上限来自扫参；但 16 素材是首轮筛
量级，不是终审量级。**QA 轴：按设计排不出序**（C4：276 题下 3pp 内不可分辨；
kframes 终审 8/9 平是直接证据）——「QA 选不出最好」本身就是结论。选型依据 =
几何门槛 + 成本，不指望 QA 排名。

**问 13｜Omni 的「说」是 TTS 吗？能生图/生视频吗？**
「说」= 语音生成（流式语音对话，与 TTS 同类）。生图/生视频：**都不能**——MiniCPM-o
是理解型 omni 模型（看/听/读 + 语音输出），没有图像或视频生成头；生视频在我们栈里
是另一个模型（Wan 1.3B FastVideo，B-roll 用），TTS 也是独立引擎（CosyVoice3/F5），
不用模型自带语音输出。

**问 14｜librosa 是什么？**
Python 的音频信号处理库（读音频→float 数组、重采样、特征提取）。官方 loader 用
`librosa.load(video, sr=16000, mono=True)` 把整条音轨读进内存再按下标切片。
我方 loader 不用它——逐段 ffmpeg 直接出 16kHz s16 WAV 文件，零第三方解码依赖。

**问 15｜「1 帧 1 段」对齐在我们的实验里其实没用？**
分三层：①**对齐结构（段边界 = 时间格）是承重的**——C2 转写归格、C3 单元配对全靠它；
②**WAV 文件本身**只在单元臂被消费；③生产现状（帧-only）整条音频链都不产。
真正「没用」的是**喂波形**这件事（C1 有害 / C3 无益），不是对齐结构——推荐的生产
形态（帧 + 转写）仍要时间格对齐帧↔文本。

**问 16｜「按时间格对齐帧与文本、把文本送进模型」测过吗？**
测过一种形态：**时间戳行文本**（`ts` 模式，`[MM:SS.s] 文本` 每格一行，时间戳即帧时刻）
= §17.3 的 `_asr_ts` 臂，73.2% 与整块文本完全持平。**没测过的形态是逐帧交错**（帧 i
图像后紧跟它那格的文本，构成图文交错序列）——适配器 `frames_with_text()` 已实现并有
单元测试，但没有任何 bench 用它喂过模型。**补测已启动（2026-10-02，用户指示）**：
`exp_loader_feed_qa.py` 两臂（`loader_block` 整块文本 / `loader_interleaved` 逐帧交错）
跑同一 92v/276q，与终审三臂同帧同题配对（official_units 76.4% / official_vision 73.6% /
loader_vision 79.0%）；ASR 不重跑（注入预计算 ctx-off 转写，loader 的 `asr_runner`
缝隙吃存储产物）。几何/KFS 对喂法实验是常量（帧集合与时刻表不变），不重跑。
mlx-vlm 的 minicpmo 模板只支持「image token 前缀」，交错臂绕过模板内联
`<image>` 标记（烟囱测试零 ERR、答案与 block 臂逐题一致，对齐有效）。

**问 17｜`loader_block` 跟以前跑过的「我方 loader」是一个东西吗？为什么再跑？**
不是一个东西。同题集上跑过的两条：`loader_vision`（79.0%）是**只喂帧**、没有文本；
旧的整块转写臂（73.2%）是 **slice / 16 帧预算 / 448px 截帧**的另一套底盘。
「这批 64 帧 loader 帧 + 整块转写」从未跑过。必须补跑的原因：交错臂的对照必须是
**同帧的整块文本臂**——否则「交错 vs 整块」的差异会和帧来源差异（64 帧官方时刻表
vs 16 帧 slice）搅在一起，测出来的就不是对齐的价值。

**问 18｜ASR 不重跑，旧转写能对上时间戳吗？**
能，已验证。预计算转写的每个分段自带 `start/end` 秒（例：
`{"start": 0.0, "end": 0.8, "text": "Say hi."}`；-ApL8d6tX5U 共 47 段）——
WhisperX 输出本身就是带时间戳的分段转写。loader 按**段中点**归入时间格
`[t_i, t_{i+1})`；烟囱测试 meta 实证归格发生（64 帧 / 45 格非空）。
粒度是段级（句/短语），不是词级——对帧格对齐够用，词级对齐没有测过也没有场景。

### 20.6 选帧方法总表（联评用，2026-10-02 汇总）

**口径与覆盖（诚实声明）**：QA 轴 = Video-MME 92v/276 题、16 帧预算、纯视觉（§17.2），
上过 **19 个方法**；几何轴 = 16 素材（4 自建 + 302s 拼接长片 + 11 Video-MME 片段），
召回按 5 个有 GT 素材均值、盲区/重复率按 16 素材（§18.1/§18.1.1），只上过 **5 个分窗
变体**（+ tiered 系与 kframes 的单项几何分，§16）。两轴不是同一批方法——几何是决赛圈
筛选，不是全方法普查。KFS-Bench 轴数字见 §15A.4 版图。

**表一｜QA 轴（276 题，降序，数字原样引自 §17.2）**

| # | 方法 | QA 正确率 |
|---|---|---|
| 1 | kframes（w≡1 退化形） | 72.5 |
| 2 | maxinfo_siglip | 71.7 |
| 3 | lvnet_tsc | 70.7 |
| 4 | uniform_16 | 70.7 |
| 5 | slice | 69.6 |
| 6 | blockslide | 69.2 |
| 7 | kffocus | 68.1 |
| 8 | iframe_even16 | 67.8 |
| 9 | tiered_v5 | 67.0 |
| 10 | taksf | 64.5 |
| 11 | sd_adaptive | 61.6 |
| 12 | sd_histogram | 61.6 |
| 13 | sd_hash | 61.2 |
| 14 | tiered v1/v2 | 61.2 |
| 15 | tiered_v3 | 60.5 |
| 16 | sd_content | 60.5 |
| 17 | infoshot | 57.6 |
| 18 | scene_008_cap16 | 57.2 |
| 19 | sd_threshold | 17.8（退化臂，作废数据下界） |

**表二｜几何轴（16 素材，§18.1）**

| 变体 | 帧数均值 | GT 召回（5 素材） | 最大盲区 | 近重复率（16） |
|---|---|---|---|---|
| legacy24（生产现状 #360） | 22.2 | 0.599 | 12.50s | 0.0704 |
| cutwin32_unif（提案，无上限） | 33.9 | 0.837 | 4.88s | 0.0848 |
| **cutwin32_cap（提案 + 1.0s 上限）** | **32.3** | **0.837** | **4.88s** | **0.0804** |
| cutwin32_v5（提案计划 + tiered v5 选帧） | 33.8 | 0.925 | 13.81s | 0.0868 |
| uniform32（1fps 均匀子采） | 30.1 | 0.820 | 10.00s | 0.0783 |

**表三｜1.0s 上限扫参（15 单窗素材，§18.1.1）**：pre-cap 31.9 帧/0.0833 → **1.0s
30.3 帧/0.0786**（召回与盲区零损失）→ 1.5s 27.2/0.793 召回开始掉 → 2.0s 24.5/0.457
（砍半，GT 容差仅 0.5s）→ 3.0s 20.3/0.193。

**三条读法**：

1. **QA 轴排不出「最好选帧」**：uniform_16 排第 4、kframes 排第 1 但几何倒数第三
   （0.322，§16.4）、终审 8/9 平——276 题的分辨率 + 任务不敏感双证。
   「视频多样性不足」不是主因：92 视频的时长/领域覆盖是够的，瓶颈在**题型**——
   Video-MME 大多是全局理解题，任何合理覆盖都能答对；要对帧位置敏感，需要
   per-question GT 类的尺（KFS 思路），不是同一把 QA 尺加样本。
2. **几何轴有明确结论**：三硬门槛（召回不降、盲区 ≤8s、冗余 ≤ uniform_32）只有
   cutwin32_cap 全过；v5 召回最高（0.925）但右端破线（13.81s）。
3. **推荐 = cutwin32_cap**：分窗计划 + 窗内均匀网格 + 1.0s 时长上限；机制见
   `window_plan.py`（窗数 n=ceil(D/248)、边界吸附切点 ±min(15s, 10%·D/n)、
   每窗预算 clamp(32·n·w_i/D, ceil(w_i/8)+1, floor(w_i/1.0)+1)、窗内含端点等距网格）。

### 20.7 KFS 主尺复核与几何轴退役讨论（2026-10-02，用户裁决讨论）

用户 2026-10-02 质询：几何轴无人工标注（GT 来源见 §20.1 表：构造数学 GT 是精确的，
unitree 共识是近似且待终裁），且**自建自判**（算法我们写、判据我们定）——提议退役出
方法排序，用现成 benchmark。执行：

**表四｜KFS@64 全方法（85 行/方法，官方 eval.py 打分；补跑 cutwin 两行）**

| 方法 | UKSS | Scene Hit Rate | 备注 |
|---|---|---|---|
| uniform | 0.5537 | 1.0000 | |
| slice | 0.5529 | 1.0000 | |
| blockslide | 0.5416 | 1.0000 | |
| maxinfo_siglip | 0.5318 | 0.9868 | |
| lvnet_tsc | 0.5231 | 0.9824 | |
| kframes | 0.5211 | 1.0000 | |
| kffocus | 0.4982 | 0.9725 | |
| tiered_v5 | 0.4818 | 0.9868 | |
| **cutwin32_cap** | **0.4646** | **0.9588** | **非 K 匹配臂**：帧数由计划决定（92 素材实测均值 31.5、范围 12–32），KFS 的 K=64 只是标称 |
| iframe_even16 | 0.4179 | 0.9137 | |
| tiered | 0.3615 | 0.8980 | |
| taksf | 0.3529 | 0.8848 | |
| scene_008_cap16 | 0.2936 | 0.8314 | |
| sd_adaptive | 0.2543 | 0.7843 | |
| infoshot | 0.1009 | 0.5338 | |
| sd_*（4 个） | nan | — | 该族 UKSS 计算在官方 eval 下无值，SHR 可读 |

**表五｜KFS@32 短名单（生产预算，K 匹配，85 行/方法）**

| 方法 | UKSS | Scene Hit Rate |
|---|---|---|
| **slice** | **0.5576** | 0.9941 |
| uniform | 0.5520 | 0.9985 |
| blockslide | 0.5178 | 0.9824 |
| kframes | 0.4996 | 0.9701 |
| **cutwin32_cap** | **0.4646** | **0.9588** |
| cutwin32_unif | 0.4643 | 0.9588 |
| tiered_v5 | 0.4049 | 0.9142 |

**读法（联评必须裁的张力）**：

1. **KFS 主尺下，cutwin32_cap 排 5/7，落后 uniform 8.7pp SHR**（0.9588 vs 0.9985）——
   均匀覆盖在「答题必需场景」的命中率上占优；分窗计划把预算向窗口端点倾斜的形状
   在这把尺上是**代价**不是收益（cap/unif 两臂 SHR 相同——1.0s 上限不影响场景命中）。
2. **几何轴退役 = 推荐依据改变**：C7 的「唯一三门槛全过」是自建轴上的结论；若排序
   只认现成 benchmark，**默认候选应回到 uniform_32 或 slice**（slice 双榜第一：
   KFS@32 0.5576 + QA+转写 73.2%，但其几何盲区未测，须补一次零成本自检）。
3. **不能丢的一条**：「8s 盲区下限」是生产自己的硬约束（v5 的 13.81s 是真实事故，C6），
   外部 benchmark 没有这一项。无论排序尺换成什么，**建议保留几何轴的盲区自检**
   （只验约束、不参与排序）；uniform_32 的 10.00s 盲区破线是否可接受 = 联评裁决点。
4. QA 轴照旧不能排序（C4）；喂法实验（§20.5 问 16）与选帧轴正交，运行中另行汇报。

### 20.8 喂法五臂终局（2026-10-03 落地，92 视频 / 276 题，552 次新推理零 ERR）

问 16 的补测 + 终审三臂合成**五臂同题配对**（同一份官方时刻表 / 同一批 loader 帧，除
`official_*` 两臂用官方产物帧）：

| 臂 | 喂法 | 正确 | 关键配对（McNemar exact） |
|---|---|---|---|
| **loader_block** | 64 帧 + 转写整块文本（截 2000 字） | **229/276 = 83.0%** | vs `loader_vision` 18/7 **p=0.043**；vs `official_units` 23/5 **p=0.0009** |
| loader_interleaved | 64 帧 + 逐帧交错（帧 i 后跟其格文本） | 223/276 = 80.8% | vs `loader_block` 4/10 p=0.180 |
| loader_vision | 只喂 64 帧 | 218/276 = 79.0% | vs `official_vision` 17/2 p=0.0007（C9） |
| official_units | 官方帧 + 官方逐段波形进音频编码器 | 211/276 = 76.4% | vs `official_vision` 14/6 p=0.115（C3） |
| official_vision | 官方帧，纯视觉 | 203/276 = 73.6% | — |

判定（本批 3 次比较，Bonferroni 阈 0.0167）：

1. **转写增益在 64 帧底盘复现**：+4.0pp（79.0→83.0），单次比较 p=0.043 显著、校正后不
   显著——与 C2 合并检验（p=3.9e-05）互证，转写文本是可复现的正向成分。
2. **逐帧交错对齐无增益、方向为负**（−2.2pp，p=0.18）——「按时间格把文本拆到每帧后面」
   不如整块文本。问 16 的补测结题：帧文本对齐喂法在此协议上不值得；C2 的「呈现格式
   无差别」升级为「整块 ≥ 交错」。
3. **我方全链（帧+转写文本）显著胜官方全链（帧+波形单元）**：23/5、**p=0.0009 过
   Bonferroni**——同一份信息（音频内容）以文本形态进 context 显著优于以波形形态进
   音频编码器。装载轴的最终排序：**转写文本 > 纯视觉 ≈ 波形单元**。

**回答「跟现有生产比是什么水平」**：生产现状 = legacy24 帧 + 无转写（`want_audio=False`，
≈ §17.2 的 uniform_16 70.7% 口径）。「legacy24 + 转写」未测过，补测 ≈ 4h GPU；与
83.0% 的差距里混着帧预算（16/24 vs 64）与底盘差异，精确归因需该臂落地。

slice 的成本更正（§20.7 讨论中的「嵌入」易误读为神经网络）：`m_slice` 的逐帧向量 =
1fps 灰度解码 + cv2 缩放扁平化 + L2 归一（感知哈希家族，非神经网络嵌入），成本 =
一次 1fps CPU 解码通过（秒~分钟级/素材），比 uniform（零计算）贵、比任何 VLM 调用
便宜数个量级。

### 20.9 联评问答三（2026-10-03）：Uniform 主张与预算曲线

**时间戳事实**：五臂里**模型从未收到帧时刻元数据**——帧只有像素；`loader_block`（83.0%）
的转写是**不带时间戳的纯文本**（截 2000 字）；带时间戳的形态（`ts` 模式、交错臂格文本）
都测过且不优于整块。MiniCPM-o 侧无「模型最大帧数」的架构上限——帧数是我们喂多少算多少
（图像切块进 context）；实际约束 = 显存（64 帧 + 缓存不清理已遇 OOM，修复为每题清
Metal 缓存）+ 延迟（~40s/次 @64 帧 vs ~25s @16 帧，线性）。官方包的 `MAX_NUM_FRAMES=64`
是**它自己的采样参数**（env 可调），不是模型架构限制。

**「K 匹配」「严格配对检验」术语**：K 匹配 = 参比的各方法每视频选**同样帧数**，否则
「帧少」和「选得差」混在一起（cutwin 的 KFS 行因此标注非 K 匹配：帧数由计划决定
12–32）。严格配对检验 = 对**同一道题**上两方法的命中/未命中做 McNemar（只数分歧对），
而不是比较两个聚合分——当前官方 eval 只出聚合分，逐行分歧要重取其输出（可做项；
85 行上 slice vs uniform 的 0.6pp 无论怎么检验都到不了显著）。

**Uniform 主张（用户的读法，本轮数据支持）**：

- 三把尺上 uniform 无一劣势：KFS@32 0.5520（与第一并列噪声内）、QA uniform_16 70.7
  （前四）、成本零。
- **slice 不值得**：KFS@32 +0.6pp（85 行不可分辨）、场景命中率反而略低（0.9941 vs
  0.9985）、QA 低 1.1pp、多一次全片 1fps 解码。按现有证据结出：不采用。
- **盲区守卫在「按时长比例分配」下冗余（用户洞察，采纳）**：uniform 若让帧数随时长走
  （`帧数 = ceil(D / 目标盲区)`，如 302s @8s → 38 帧），间距按构造 ≤ 目标值，
  无需任何守卫；守卫只在**总预算封顶**后才有意义（封顶后长片间距必然超标——那是
  接受 gap 还是加预算的产品决策）。cutwin 的「每窗 32 帧」本质就是这种时长比例分配
  加了 248s 的封顶；其边界吸附切点在几何上只值 +0.017 召回（0.837 vs uniform 0.820）。
  **简化后的选帧默认主张：均匀网格 + 帧数 = ceil(D/目标盲区) + 总量封顶**；
  分窗的真实职责是**上下文切分**（模型调用维度），不是选帧维度。

**补测（排队执行，同 harness 同底盘可比）**：

| 臂 | 状态 | 回答的问题 |
|---|---|---|
| legacy24 + 转写整块（24 帧原样，`VM_BUDGET` 旋钮） | **运行中**（~3h） | 生产原样 + ASR 的真实水平（用户指示） |
| uniform_32 / uniform_64 纯视觉（PRECOMPUTED 接口，零代码改动） | **排队**（前臂结束自动接力，~5h） | 预算曲线 16→32→64：多少帧开始饱和、64 值不值 |

**补测结果（legacy24+ASR，2026-10-03 当日落地）**：**203/276 = 73.6%**——与 slice+ASR
（73.2%）持平，即「生产分帧 + 转写」≈「16 帧自研选帧 + 转写」；配对
`exp_loader_feed_qa.json` 的五臂：vs `loader_block`（64 帧均匀 + 转写）**legacy_only=4 /
block_only=30，p<0.0001**；vs `loader_interleaved` 8/28 p=0.0012。**「现有 VLM+ASR」与
新方案不是差不多——新方案 +9.4pp 且极显著**。增益来源 = 帧预算（~25 → ~64）+ 装载
底盘（448px 截帧 → loader 原分辨率）两者混合；纯预算维度由在跑的 uniform 曲线拆开。

### 20.10 联评问答四（2026-10-03）：时长分布、分带预算效应与成本实测

**基准时长分布（此前未明说，关键事实）**：92 视频 = **11s–131s，中位 81s，均值 81s**
（98% ≤ 120s）。本基准只考验 ≤2 分钟的内容；「长视频分段」问题在当前基准里**测不到**
（最长 131s 单次调用即可）。生产线短视频同样 <2min——基准与生产时长域匹配。

**分带配对（用户假设「短视频 16 vs 64 帧看不出区别」——证实）**，uniform_16（448px）
vs loader_vision（64 帧全分辨率，底盘混合看方向）：

| 时长带 | n | uniform_16 | loader_vision | 分歧 | p |
|---|---|---|---|---|---|
| 短 <60s | 57 | 68.4% | 71.9% | 3/5 | **0.727 无差** |
| 中 60–100s | 147 | 72.1% | 82.3% | 3/18 | **0.001 显著** |
| 长 100s+ | 72 | 69.4% | 77.8% | 2/8 | 0.109 方向正、样本不足 |

选帧效应分带（uniform_16 vs slice，同 16 帧 448px）：三带全部噪声（p=0.58–0.82）——
16 帧下 slice 相对 uniform 没有任何时长带优势。预算曲线（uniform 32/64 同底盘）落地后
重做本表可去掉底盘混合。

**延迟实测（同一日志的逐题计时）**：loader_block 均值 **33.9s**/题 vs
loader_interleaved **34.5s**（+1.8%，可忽略）——时间戳富集不省钱也不贵，只是没用
（16 帧底盘 ts-block 平手、64 帧底盘 interleaved 反而 -2.2pp）。

**抽帧成本微基准（同 64 帧时刻表，冷缓存，9 视频覆盖全时长域）**：
官方 `get_video_frame_audio_segments`（decord 整文件解码 + librosa 音频切分，一次过）
**1.5s/视频**；我方 loader 逐时刻 ffmpeg seek：帧-only **2.2s**、帧+音频 **4.0s**。
**官方反而更快**（整文件一遍解码 vs 64 次精确 seek），但两者相对模型推理（~34s）都是
零头。结论：C9 的 5.4pp 质量差**不是**用成本换来的——我方逐时刻 seek 的质量收益免费。
机理未分解（官方 JPEG q88 + 索引取样 vs 我方 PNG 无损 + 精确 seek 的贡献各占多少，
需 2 个新臂），列为可选。

**内存上限压测（排队，预算曲线后自动爬坡）**：`exp_stress_frames.py` 对最长视频
N∈{96,128,160} 单次推理，每档新进程（OOM 在 C++ 层不可捕获，失败即停），
记录墙钟 + Metal 峰值内存。64 帧已知可行（每题清缓存后零 OOM）。**结果（2026-10-04）**：96 帧 55.2s/8.96GB；128 帧 74.5s/9.95GB；160 帧 93.8s/10.71GB（均正确描述）——**无内存墙**（峰值 ~11GB），瓶颈是延迟（~0.65s/帧线性）。

**盲区有无业界规范**：没有固定阈值标准。文献惯例是「uniform 采样 + 固定 K」
（LongVideoBench 64 帧、Video-MME ~1fps），不规定最大间距；我们的 8s 地板来自
tiered v5 的生产启发式（L7 守卫），非外部规范。§20.9 的「帧数 = ceil(D/目标盲区)」
把盲区变成显式参数，由预算曲线标定其性价比。

**社区/架构口径（2026-10-03 查证）**：官方 transformers 用法（MiniCPM-V 4.6 起文档化）
`max_num_frames` **默认 128**，视频场景 `max_slice_nums` 推荐 1；vLLM-omni 对聊天视频
同样按 128 帧封顶。本地 MiniCPM-o 4.5 4-bit 配置：`max_position_embeddings=40960`、
`slice_config.max_slice_nums=1` → **每帧按「面积预算 ≈448²、保比例」bicubic 缩放
（14px 网格取整，如 640×360 → 598×336），重采样 ≈96 token**（源码
`_find_best_resize`：不是拉成方形；「切分成多块」路径仅静态大图 max_slice_nums>1
时启用，视频帧一律缩放）→ context 理论容量 ≈ 400 帧；实际上限由内存/延迟决定
（压测爬坡实测中）。预先缩小帧不省模型算力（token 数不变），只省亚毫秒级 JPEG
编码；且会锁死未来多块路径——不采纳。

**C9 机理的修正（重要，含两处自我纠错）**：`max_slice_nums=1` 意味着**模型入口把每帧
缩到 448 处理**——「分辨率」轴在模型侧被抹平；实测两边帧同为 640×360（源分辨率），
且**我方落的也是 JPEG**（`-q:v 2`，接近无损）而非先前误写的「PNG 无损」。
**落点漂移嫌疑已被实测排除**：感知哈希比对同刻表两臂的帧，CFR 与 VFR 视频各抽 2 个、
共 224 对，223 对匹配（≤10/64 位汉明距）——decord 索引取样与 ffmpeg 10fps 复刻网格
落在同样的帧上（全库 VFR 37/92，但两者帧数一致时网格重合）。
**因此 C9 的 5.4pp 只剩两个嫌疑：JPEG 压缩保真度（官方 PIL q88 + 4:2:0 色度抽样 vs
我方 ffmpeg `-q:v 2` 近无损）与解码器色彩管线差（decord/PyAV vs ffmpeg swscale）**。
要钉死需一个专用臂（我方帧重存 q88 重跑 QA，~4h，可选）。工程含义：q88 与 q:v 2
成本相同（都是一次编码），近无损免费，保持现状即可。

**关于「学官方整文件解码」**：我方 loader 已内置单次解码快路
（`_try_batch_grid`：等差数列时刻表 → 一次 `fps=` 解码 + 严格计数校验，不匹配回落
逐时刻 seek）。uniform 网格因 0.01s 舍入非严格等差而回落逐 seek，成本 2–4s/视频，
相对模型推理 ~34s 可忽略；不为省 1 秒降质。

**排队的新臂（接力链：预算曲线 → 压测 → 两臂）**：uniform_96（MiniCPM，纯视觉，
续预算曲线）+ **Qwen3-VL-30B-A3B**（`VM_ENGINE` 旋钮，uniform_64 + 转写整块，
与 loader_block 同内容跨模型对比：效果 + 逐题耗时，Qwen 4-bit 本地已就绪，
MoE 128 选 8 专家、context 256k、仅视觉）。

**预算曲线收官（2026-10-04，短档 92v/276q，同 448px 底盘、纯视觉、逐题配对）**：

| 帧预算 | QA | 增量 | p（配对） |
|---|---|---|---|
| uniform_16 | 70.7% | — | — |
| uniform_32 | 76.1% | **+5.4pp** | **0.0081 显著** |
| uniform_64 | 77.5% | +1.4pp | **0.4240 不显著** |
| uniform_96 | 78.6%（217/276，42.2s/题） | +1.1pp | **0.4497 不显著** |
| （16→64 全程） | | +6.8pp | 0.0009 |
**拐点后曲线全平（2026-10-04 追加 96 帧点）**：uniform_96 vs uniform_64 逐题配对
仅 2/5 分歧（p=0.450）。关键对照：**96 帧纯视觉（78.6%、42.2s/题）< 64 帧+转写
块（83.0%、33.9s/题）**——膝点之后加帧不如加模态：转写块 +4.4pp 且更快，96 帧
再投 32 帧只买 +1.1pp 噪声。短档结论定稿：**拐点 32；模态增益 > 帧数增益**。

**拐点 = 32 帧**：短内容上 32 帧拿到 16→64 总增益的 79%，64 帧的追加增益统计
不可分。用户「省帧」主张在短内容上成立（32 帧 = 一半推理时间拿八成收益）；
「上线定 128」在 ≤2min 内容上大概率是浪费——128 与否交给 medium 档（4–15min）
曲线与压测裁决：若长内容拐点同样在 32–48，生产默认应定 **32–48 + 按时长比例**，
128 留给未来长内容。省帧的「活动感知预算」（静段少给）是否还有额外空间，
同样由 medium 曲线平坦度决定（剪辑密集内容静段少，预期有限）。

**Qwen3-VL 原生视频的时间机制（配置查证）**：`rope_scaling: {mrope_interleaved:
true, mrope_section: [24,20,20]}` = **M-RoPE（多模态 RoPE）交错变体**，位置编码按
时间/高/宽三段分解——帧的时间顺序在**架构内部**携带（用户所记「Time RoPE」即此）。
注意两点：这是**位置编码**，不是文本时间戳（与我们测过的「文本时间戳无增益」
不同层）；且 Qwen3-VL 无音频塔，原生视频输入同样没有声音理解。基准臂保持
「64 帧均匀 + 转写整块」（短档 92v）；medium 档 Qwen 臂未排（可选）。

**长视频档补测（用户 2026-10-03 批准）**：Video-MME `medium` 档（4–15 分钟）
前 30 个视频（90 题）→ `bench_subset_medium.csv`，串行下载（GAP=6，可续传，
2026-10-04 已全部到盘）；
预算三点 `uniform_16/64/96` 纯视觉（`bench_subset_medium.csv` 子集，
`exp_videomme_qa_medium_budget.json`）——专测「帧预算斜率在长内容上是否变陡」，
即 16 帧在 4–15 分钟上会不会像 60–100s 段那样被 64 帧拉开（排队于全链之后）。
**medium 终表（2026-10-05 午后全部落地，28 视频 / 84 题）**：
| 臂 | 正确率 | 配对 |
|---|---|---|
| uniform_16 | 53.6% | vs u64 7/8 p=1.0 |
| uniform_64 | 54.8% | — |
| uniform_96 | 63.1% | vs u64 1/8 **p=0.0455** |
| uniform_128 | **66.7%** | vs u96 6/3 p=0.505（平）；vs u64 11/1 **p=0.0094** |
| MiniCPM u64+转写 | 61.9% | vs u64 纯 8/2 p=0.114（+7.1pp 方向正，84 题不显著） |
| Qwen u64+转写 | 69.0% | vs MiniCPM u64+转写 9/3 p=0.149（方向 Qwen） |
| Qwen u64 纯视觉（晨间误标臂） | 70.2% | vs MiniCPM u64 纯 17/4 **p=0.0088** |
**medium 拐点 = 96**（64→96 +8.3pp 显著；96→128 平）——**比短档的 32 右移**，
用户「时长比例」规则 `min(max(ceil(D/8),32),128)` 在 medium 上自动落在 75–96
（10–17 分钟片），恰好住进拐点区——**比例规则跨档成立，无需分档特判**。
medium 转写增益不显著（MiniCPM +7.1pp / Qwen −1.2pp，n=84 功效不足）；
medium 跨模型生产形状 Qwen 69.0 vs MiniCPM 61.9（NS 方向 Qwen），叠加
纯视觉显著差（p=0.0088），证据权重：**长内容 Qwen ≥ MiniCPM 约 7–15pp**。
**首轮记录（u16 作废事故，2026-10-05 晨）**：uniform_64 = **54.8%**（46/84）、
uniform_96 = **63.1%**（53/84，逐题配对 1/8，
p=0.0455 显著）；**uniform_16 臂无效**——时间表文件缺 `uniform_16` 键，harness
静默 fallback 让它吃了 uniform_96 的输入（84 题 raw 逐字节全同、secs 不同才是
重跑痕迹），已修复两处：①`_precomputed` 缺键改 raise（fail-fast，不许 fallback）；
②时间表补齐 uniform_16（`true_uniform_timestamps` 1fps 网格，重生成可复现），
u16 重跑**已落地（2026-10-05 晨）= 53.6%**（45/84）——**medium 曲线成形：
16≈64 平坦**（53.6 vs 54.8，7/8，p=1.0）**、96 帧跳涨**（63.1；vs u64 1/8
p=0.0455 显著、vs u16 4/12 p=0.080 边缘）——与短档「32 帧饱和」不同，长内容
64 帧之后还在奖励帧数；u128 已排队钉死斜率（64<96 非单调提示 84 题噪声不小，
引 medium 数字须带区间感）。medium Qwen 臂
（uniform_64，**原标注 asr 有误**：medium 转写当时不存在，prompt 头为空，实为
纯视觉）= **70.2%**（59/84）——**medium 档跨模型（纯视觉口径）：Qwen 30B 显著
胜 MiniCPM 8B**（vs u64 17/4，p=0.0088；vs u96 14/8，p=0.29）——长内容上
Qwen 的多块高分辨率底盘拉开差距，与短档打平形成对照。medium 转写补录
（asr_ctxoff，#418 口径）与 MiniCPM medium u64+转写臂排队中——补齐
「转写在长内容上的增益」与生产形状的 medium 跨模型对照。

**Qwen Omni 深查结果（用户质疑「居然没有 MLX 版」，2026-10-04）——质疑成立**：
`mlx-community/Qwen3-Omni-30B-A3B-Instruct-4bit` 存在（2025-12-24 上架，另有
5/6/8bit/bf16），且**本仓 harness venv 的 mlx-vlm 0.7.2 自带 `qwen3_omni_moe`
架构实现**（AudioModel 音频塔完整、处理器吃 `audio=` 波形、支持
`use_audio_in_video`）。新基准臂 `exp_qwen_omni.py`（模型直接听整段 wav，
无选帧无转写——对照「转写文本进 prompt」路线跨家族复验 C2/C3）已写好，
排全链末位（下载 17GB 过代理中，92 个 wav 音频现成）。
生产引擎事实澄清：`vlm-model.json` 主引擎 = **MiniCPM-o 4.5**；`qwen3-vl-moe`
是登记在案的**第二引擎**（仅视觉，手动指定用，无自动故障切换）；两者的速度
对比历史上从未正式跑过——正在跑的 Qwen 三臂（帧/原生/换 Omni 恐是首个）。

**Qwen 原生视频的采样可控性 + Omni 内存差（2026-10-04 查证）**：Qwen3-VL 处理器
（`processing_qwen3_vl.py`）构造参数 **`fps=2.0`、`max_frames=768`**——原生视频
路径的**密度与总量都可调**（Omni 处理器同理，`fps=1.0`）；不可控的只是「具体
时刻」（内容感知逐时刻选择仍是帧抽取路线的独占能力）。内存：Qwen3-VL-30B-A3B
4bit 本地 **17GB**；Qwen3-Omni-30B-A3B-Instruct-4bit **≈20GB**（多 ~3GB =
音频塔 + Talker 输出头；Talker 仅语音输出用，理解任务白载）——32GB 上可独占
运行。历史无「Omni 因内存被否决」记录：此前否决的是 MiniCPM 官方单元装载
（C3 零增益）；「没有 MLX 移植」是本档 2026-10-03 的错误判断（已纠正）。

**`use_audio_in_video` 机制（源码）**：开启后视频的音轨按 `seconds_per_chunk=2.0`
切条，**与视频帧组按时间位置交错插入同一序列**，音频每秒占
`position_id_per_seconds=13` 个位置 id——与 M-RoPE 时间轴（mrope_section
[24,20,20] 的「时间」段）配合完成音画对齐。即：交错序列给「顺序」，M-RoPE
给「坐标」，两者相辅相成。

**跨模型首战收官（2026-10-04 中午）——平局**：Qwen3-VL-30B-A3B（原生视频
2fps 自采样 + M-RoPE + 转写整块）**229/276 = 83.0%**，与 MiniCPM-o 8B
（64 帧均匀 + 转写）**逐题配对 16/16 分歧，p=1.0000——精度分毫不差**；
但 MiniCPM **55.6s → 33.9s（快 64%）**、显存 5GB vs 17GB。**8B + 我们的
装载路线 = 30B MoE 原生视频的精度、更低成本**——生产线维持 MiniCPM 的依据
（转写路线把 4 倍参数差抹平了）。

**三个架构问答（联评用）**：
### 20.11 联评答疑与进展汇编（Q19–Q33，持续追加）

- **Q19：MiniCPM 为何不吸收 M-RoPE？** 三重原因：① 视觉 token 经 resampler
  重采样（96/帧），patch 级 2D 结构已被压缩掉，M-RoPE 的多维坐标没有自然挂点；
  ② 换位置编码 = 重训对齐，成本极高；③ MiniCPM-o 对时间对齐走了**另一条
  路线**——TDM 时分复用（全双工流式交互，1Hz 决策），解的是「实时」问题；
  M-RoPE 解的是「离线对齐」问题。设计目标不同，非技术落后。
- **Q20：不让音频原生进，还算 Omni 吗？** 前提有误——**MiniCPM-o 原生就支持
  波形进**（内置 Whisper-medium 编码器 + 全双工语音），官方路线
  （`to_minicpm_units`）就是波形喂法；是我们**基准实测它输了**（76.4% vs
  83.0%，C3+块文本 p=0.0009）之后**生产线主动关掉了它**（want_audio=False）。
  按「我们怎么驱动它」它此刻在扮演多模态模型；按能力它是真 Omni。命名批评
  适用于用法，不适用于模型。
- **Q21：`processing_qwen3_omni_moe.py` 是谁的？** 是 **mlx-vlm 第三方库**
  （Blaizzy/mlx-vlm，装在我们的 `~/.venvs/mlx-vlm`）里的**模型预处理代码**——
  HF 官方 transformers 逻辑的 MLX 移植，负责「原始输入 → 张量」的翻译，忠实
  复刻官方行为，不是我们的策略。我们的策略层是 `vlm-model.json`（引擎选择）+
  基准脚本（喂什么、怎么评）；库管「怎么喂得对」，我们管「喂什么」。
- **Q22：MiniCPM 路线的 trade-off（vs Qwen 原生视频路线）**：
  | | MiniCPM 路线（外抽帧+重采样+TDM） | Qwen 路线（原生视频+M-RoPE） |
  |---|---|---|
  | token 效率 | 极高（96/帧，context 可控） | 重（每帧数百 token，prefill 慢） |
  | 延迟/显存 | **33.9s、5GB** | 55.6s、17GB |
  | 时间对齐 | 帧 1D 顺序（无显式时间坐标） | M-RoPE 三维坐标（帧级） |
  | 视觉细节 | 448 单块上限（小字弱） | 多块高分辨率（细节强） |
  | 实时流式 | TDM 全双工（主打） | 无（离线为主） |
  | 采样控制 | 外部全权（时刻级） | 参数级（fps/max_frames，无时刻级） |
  | 失败面 | 外部抽帧质量依赖（C9 的 5.4pp 即此接口的代价与机会） | 库内解码黑盒 |
  实测净结果：QA 精度打平（83.0 vs 83.0），MiniCPM 成本 1/3。
- **Q23：TDM 与 M-RoPE 的时间对齐对比**：M-RoPE 是**推理内坐标系**——每个
  token 携带（时间t, 高y, 宽x）三段 RoPE 位置，attention 层面直接感知「这是第
  几秒的画面」，离线、帧粒度。TDM 是**流式调度协议**——视频/音频/文本三路流
  按小周期时间片轮转串行化进 LLM，对齐靠「同一时间片 = 同一时刻」，面向实时
  全双工（1Hz 决策），token 本身没有时间坐标。我们的离线 QA 两者都用不上：
  帧的 1D 顺序即时间（文本时间戳注入无增益是旁证）。
- **Q24：MiniCPM「不支持原生视频」的说法要修正**——**官方 PyTorch 路线支持**
  （`get_video_frame_audio_segments` 内部自己解码采样视频文件）；不支持的是
  **mlx-vlm 移植**（minicpm 引擎无 video processor 路径，`generate_response`
  对 video_path 直接 raise）。Omni 的定义关于**模态覆盖**（听/看/说），不关于
  推理库的接口形态——MiniCPM-o 是真 Omni，我们在 MLX 上把它当多模态用。
  「Qwen-Omni 值不值得用」的裁决臂：第一版听波形（audio-only，C2/C3 跨家族
  复验）已排队；看+听交织版（`use_audio_in_video`，走 generate/dispatch 的
  video 通路）待第一版落地后验证成熟度再加。medium 臂键名坑重蹈一次
  （uniform_64/96 vs uniform64/96，84 行有效、56 行空跑报废）——已修正重排
  （fixer→omni→medium-redo 串行，全部盯 PID 退出，无 pgrep）。
- **Q25：MLX 版 MiniCPM 到底有没有原生视频？深查结果（2026-10-04）**：
  **分模型而异**——同库中 `minicpmv4_6`（1.3B 新模型）**有**完整
  `MiniCPMVVideoProcessor`（模型目录可带 `video_preprocessor_config.json`
  前置配置）；`minicpmo`（我们的 8B）**没有**（目录只有
  `preprocessor_config.json`，音频塔/TTS 齐备、视频处理器缺失）——是**移植
  覆盖面问题**，不是模型设计拒绝视频。4.6 处理器的原理：接受外部解码好的
  帧序列 → `_select_frames` 用 **np.linspace 均匀采样**到 `max_num_frames`
  → 逐帧走图像管线（必要时拼网格图）——**采样哲学与 Qwen 同宗
  （均匀 + 上限），差别在谁负责解码（4.6：调用方解码；Qwen：库内解码）与
  位置编码（1D 顺序 vs M-RoPE 时间坐标）**。我们的 8B 若要原生视频 = 给
  mlx-vlm 补 minicpmo 的 video processor（工程项，且 C9 已证外部抽帧质量
  更高，补的动力不足）。
- **Q26：为什么专门跑「听波形」臂？** 因为它是 **C2/C3 跨家族复验的最小
  对照**：Qwen3-Omni（听波形）与 Qwen3-VL（读转写文本）**同一 30B-A3B
  骨干**，唯一差异 = 音频形态（波形过音频塔 vs 文本过分词器）。MiniCPM 家族
  上转写极显著胜出（83.0 vs 76.4，p=0.0009）——若 Qwen 家族复现，C2 升格为
  跨模型规律；若波形追平/反超，则 C2 是模型特定（音频塔质量因家族而异），
  Qwen-Omni 路线才有价值。这正是用户「Qwen Omni vs Qwen3-VL+ASR」之问的
  直接实验。看+听交织（`use_audio_in_video`）为第二版（走 generate/dispatch video 通路）；2026-10-05 v3 通路已修通并在 selmed 链排队跑（见 §20.11 文末）。
- **Q27：产品线厘清——「最新 MiniCPM」与「最新 Omni」是两条线**：V 线最新 =
  **MiniCPM-V 4.6**（1.3B：SigLIP2 + Qwen3.5-0.8B，**看视频但不听**——架构无
  音频塔，mlx-vlm 端口纯视觉，视频处理器只吃图像帧、音轨根本没有入口）；
  O 线最新 = **MiniCPM-o 4.5**（9B：+ Whisper-medium 音频塔 + CosyVoice2 语音，
  看听说全有但 mlx 端口缺视频处理器）。两条线互补地各自缺一半：**4.6 有视频
  没音频，o 4.5 有音频没（MLX）视频处理器**；「同时原生视频+音频」在 MLX 上
  目前只有 Qwen-Omni 一家。另： mlx-vlm 的 `select()` 在查表前会剥 `_asr*`
  装载后缀（代码注释即此坑的纪念碑），时间表键用裸方法名即可。
- **Q28：多模态「合成理解」的机制（VL 与 Omni 同理）**：没有「各自理解再合并」
  的融合模块——**所有模态先变成同一个 token 流**：帧 → 视觉塔 → （resampler/
  patch-merge）→ 视觉 token 占位插入；音频 → 音频塔 → 音频 token 占位插入；
  转写/问题 → 普通文本 token。「合成」发生在 LLM 的**全注意力**里（每个 token
  都能 attend 所有模态的 token），对齐能力来自训练。差异只在「占位的顺序与
  位置坐标」：Qwen 原生视频 = 帧组 + 音频条按时间交错 + M-RoPE 坐标；
  MiniCPM 官方 = （帧 i + 音频段 i）逐对交织 + 1D 顺序；我们的臂 = 帧流 +
  转写文本块（块前置）。
- **Q29：模态消融矩阵（用户「有些样本单模态就够」之问，2026-10-04 补格）**：
  已有格 = 仅视觉（loader_vision 79.0）/ 视觉+转写（loader_block 83.0，
  p=0.043）——转写净增 +4.0pp 是**混合题集**上的平均。**纯音频格已落地（Qwen 侧
  Qwen-Omni 听波形 = 33.3%，见 Q30——音频独立解题能力≈零，用户「单模态就够」
  的疑虑在音频侧不成立）**；**Qwen 纯视觉格已落地**：native_pure 79.3%（219/276）
  vs native_asr 83.0%——Qwen 侧转写增益 +3.7pp 方向正、不显著（9/19，p=0.089），
  与 MiniCPM 侧 +4.0pp（p=0.043）同向——转写在两个家族都有正贡献，幅度都在
  +3.7~4pp 一带。矩阵已落格（2026-10-05 更新）：**仅文本**（`exp_text_only.py`）**51.4%（142/276 同题口径）**——约一半题可仅凭转写解出（「单模态就够」在文本侧成立）；**Qwen 原生纯视觉** 79.3%（对照 native_asr 83.0 量化净贡献，见 §20.11）；**medium 档 Qwen 帧臂与转写臂**均已落（§20.10/§20.11）。逐题归属（图像独解 / 文本独解 / 双模态互证 / 双缺）待汇总。
- **Q30：跨模型装载终表（2026-10-04 晚，全部 276 题逐题配对）**：
| 路线 | 正确率 | 成本 | 配对 |
|---|---|---|---|
| MiniCPM-o 8B + 我方喂养（64 帧+转写块） | **83.0%** | 33.9s/题、5GB | — |
| Qwen3-VL-30B 原生视频+转写 | **83.0%** | 55.6s/题、17GB | 16/16，p=1.0 |
| Qwen3-VL-30B + 我方喂养（外部 64 帧+转写块） | **81.5%** | 64 帧外抽帧 | vs 上两行 p=0.50/0.60 |
| Qwen3-Omni 纯音频（波形进音频塔，零帧） | **33.3%**（92/276） | ~2s/题 | ≈ 乱猜（4 选 1=25%） |
  ① **打平三角成立**：三个「视+文」路线两两配对全不显著——我方外部抽帧喂养移植到
  Qwen 30B **与原生视频输入无损互换**（官方 2fps 自采样无优势），时刻级选帧自主权
  保留在我方手里；MiniCPM 以 1/3 参数量、64% 更快、1/3 显存拿到同分。
  ② **纯音频 ≈ 乱猜（C2 跨家族极端复验）**：同一 30B 骨干，读转写 83.0 vs 听波形
  33.3。注意该臂 raw 混有模板伪影（`<|endoftext|><|im_start|>`，18 题解析失败），
  33.3% 应读作**上界**——但即便模板修满，也不存在「波形逼近转写」的空间：音频
  波形在 Video-MME short 上不是可独立解题的模态，**转写文本是唯一有效音频形态**
  这条在两个家族均成立。
  ③ **harness 修复**：FINAL 汇总遍历 results 键时对 no_frames/sel_* 改用 `.get()`
  ——同文件跨次运行的幽灵键（昨晚 underscore 失误臂残留的 276 行 SELERR）曾使
  qwen-frames 臂在 FINAL 后 KeyError 崩溃；真实数据无损，产物已清除幽灵行。
  ④ **medium 档（28 视频 / 84 题，纯视觉口径，2026-10-05 晨）**：Qwen u64 **70.2%**
  显著胜 MiniCPM u64 54.8%（17/4，p=0.0088）、vs u96 63.1% 不显著——**短档打平、
  长档 Qwen 胜**：多块高分辨率底盘在长内容上开始值钱（小字/UI/远景细节随片长
  累积）。帧预算斜率待 u16 重跑（u16 臂作废事故见 medium 块）。
  ⑤ text-only 臂首跑 27s 即崩（`import vlm_analyzer` 缺 lib 路径）——补
  `sys.path`（与主 harness 同款）后重排。
  ⑥ **成本口径更正（联评必读）**：「MiniCPM 快 64%」只对 Qwen **原生路线**成立
  （55.6s/题 = 内部 2fps 自采 ≈160+ 帧 + M-RoPE prefill）。**同等 64 帧外喂预算
  下 Qwen 反而更快**：medium 26.8s vs MiniCPM 36.2s；短档 25.9s vs 33.9s——
  多块高分辨率的 prefill 在 MLX 上并不慢。MiniCPM 的真实优势只剩**显存**
  （5GB vs 17GB）与部署体积（8B vs 30B 下载面），不在推理延迟。Q22 表的
  延迟列按此口径读（该行对比的是 Qwen 原生操作点）。
  ⑦ **「Qwen 没有 u64」之问（用户，2026-10-05）**：medium Qwen 臂**不是**原生
  视频输入——它走 `VM_PRECOMPUTED` 时刻表（我方 loader 的 64 帧）+ Qwen 引擎，
  VM_NATIVE_VIDEO 未开；「u64」是我们外部抽的 64 帧，两引擎吃同一批帧，公平。
  Qwen 的**原生**路线只在短档跑过（2fps、max_frames=768，~81s 视频自采
  ≈160 帧——是 MiniCPM 64 帧的 2.5 倍仍打平，这本身说明它多花帧没买到分）。
  medium 档「对称化」的两个新臂已排：MiniCPM u128（补斜率：medium 上 64→96
  还在涨，128 是否继续涨）+ Qwen u64+转写重跑（转写录好后补生产形状对照）。
  MiniCPM 物理上追不了 Qwen 原生的帧数（resampler 96 token/帧，context 40960
  ≈400 帧上限；Qwen 原生 768 帧在 medium 10 分钟片上 prefill 也要数百秒，
  两家的原生操作点在中长内容都不可行，外喂均匀帧才是现实操作点）。
- **Q31：「原生视频输入」测过哪里？（用户 2026-10-05 之问的对账）**：
  | 原生形态 | 短档 276q | medium 84q |
  |---|---|---|
  | Qwen3-VL 原生视频+转写 | ✅ **83.0%**（55.6s/题） | ✅ **71.4%**（60/84，87s/题，2026-10-05） |
  | Qwen3-VL 原生纯视觉 | ✅ **79.3%** | — |
  | Qwen3-Omni 纯音频（无视频） | ✅ **33.3%** | — |
  | Qwen3-Omni 看听交织（真原生 Omni） | ✅ **80.8%**（223/276，23.4s/题） | ✅ **60.7%**（51/84，33.0s/题） |
  | Qwen3-Omni 纯视频（无音频） | ❌ 未测（诊断臂，价值上升，建议补） | — |
  | MiniCPM 官方波形单元 | ✅ 76.4% | — |
  | MiniCPM 原生视频（MLX） | ❌ 永不可测——mlx-vlm 移植缺 video processor（官方 PyTorch 有，Q25） | 同左 |
  Omni 交织臂走新脚本 `exp_qwen_omni_video.py`（v3 通路：直调处理器拿
  use_audio_in_video 交错展开的 token 序列 + input_ids 旁路喂 generate；零转写
  注入——它自己看自己听；首题响亮失败防模板坑；三段修复史见文末）。selmed 链
  2026-10-06 03:40 收官：短档 223/276（80.8%）、medium 51/84（60.7%）。
  **分母对账（2026-10-05）**：`bench_subset_100.csv` 名义 100 视频，其中 8 个
  （0IdYJGBmguM 等 8 个 short 视频）**从未下载到盘**——所有需要视频文件的臂
  实际分母 = **盘上 92 视频 / 276 题**（盘上短档 92 + medium 28 = 120 个视频
  文件，与各臂 FINAL 完全吻合）；text-only 是唯一不需要视频文件的臂，跑了
  全 100 视频（300 题）——**跨臂对比一律取 276 题交集（text-only 同题口径
  = 51.4%，142/276）**；150/300 是含 24 题超集的口径。8 个缺盘视频要不要
  补下载待定（补了会破坏与存量 276 题体的直接可比性，除非全臂重跑）。



**帧数规则的综合裁决（待 medium 曲线补全）**：QA 拐点 32（短档实测）+
盲区承诺下限 1/8s + 官方封顶 128 → 统一规则候选
**`帧数 = min(max(ceil(D/8), 32), 128)`**（120s→32 帧 @3.75s 间距；
302s→38 帧 @8s；1046s→128 帧 @8.2s）。「官方 1fps 到 128」在短档被实测否决
（1fps = 120 帧 >> 拐点 32，多花 ~3 倍延迟买不到显著增益）；medium 档若拐点
上移则回改。

- **Q32：medium 档「选帧方法」横评（用户 2026-10-05 直觉的 direct 检验；设计 +
  预注册）**：短档 16 帧预算上非均匀选帧与均匀无显著差异（kframes 72.5 vs
  uniform 70.7 = 噪声；query 恢复不改答案），且**横评从未在 medium 上做过**——
  用户直觉「长内容单帧代表更长时段、选哪帧更讲究」是对该空白的直接质疑。
  设计：medium 28 视频 / 84 题，**K=64 与 uniform_64（54.8%）同预算配对**；三臂
  = slice（2D 感知切分）/ maxinfo_siglip（SigLIP 帧间信息增益贪心）/ kframes
  （Qwen 系关键帧）。选帧先经 `make_selection_ts.py` 预计算成时刻表（1fps 解码 +
  SigLIP 嵌入一次性摊销，逐视频落盘可断点续传），QA 臂只读表推理；缺键
  fail-fast（u16 事故防线）。**预注册判据**：每臂 vs uniform_64 逐题配对
  McNemar（n=84），α=0.05；三臂齐测故并列给出 Bonferroni 校正阈值 0.0167 作
  严格口径；报告 pp 差 + discordant 对数。**成本披露**：预计算 28 视频 ≈35 分钟
  （maxinfo_siglip 25-46s/视频为重头，slice 4-10s，kframes 2-8s）；3 个 QA 臂
  ≈2.5h（MiniCPM ~35s/题 × 84 × 3）；全部本地 MLX，零云端费用。**读法**：三臂
  全部落噪声内 →「选帧无关」从 16 帧短档正式外推到 medium-64，选帧轴关闭并
  写入 PR #445 联评；任一臂显著为正 → 选帧升级为正式杠杆，改写 §20 推荐。
  **结果（2026-10-06，selmed 链收官）**：slice 45/84=53.6%、maxinfo_siglip 49/84=58.3%、kframes 51/84=60.7%（基线 uniform_64 46/84=54.8%）；配对 discord slice +6/−7（p=1.000）、maxinfo +7/−4（p=0.549）、kframes +8/−3（p=0.227）——**预注册判据下三臂全部不显著**（Bonferroni 0.0167 无一过）。与 KFS 官方 GT 轴互证（Q33）。**裁决：选帧方法轴在 medium 关闭**——「长内容选帧更讲究」的直觉未被数据支持；kframes 的 +5.9pp 是方向性趋势（n=84 检验力有限），不足以改默认；生产维持均匀 + 时长比例预算。

- **Q33：KFS-Bench medium 复用（用户：KFS 不是独立项目，轨道可以再投入）**：
  KFS-Bench 提供官方 **query 条件场景 GT**（`vidmme_anno.csv`），medium 子集
  覆盖 **16/28 在盘视频**（question_id 经 q2v 映射）；短档已全量跑过 20 策略
  （k64 uniform UKSS 0.5537 榜首）。medium 轴取 9 个代表策略（uniform / slice /
  maxinfo_siglip / kframes / blockslide / scene_008_cap16 / cutwin32_cap /
  cutwin32_unif / tiered_v5），其中 **slice / maxinfo_siglip / kframes 直接复用
  Q32 的预计算时刻表**（`KFS_TS_JSON` 旋钮）——与 QA 臂同一选帧实例、零重复
  计算，其余 6 个为 CPU 场景检测。成本 ≈1h CPU + 0 GPU。**读法**：query-free
  选择对 query 条件 GT 的打分是下界口径；关注短/medium 两档排名的稳定性，与
  QA 臂结论是否互证（两个正交标尺同向 → 结论可直接进联评）。
  **结果（2026-10-06）**：medium KFS（16 视频 / 21 行）UKSS：slice 0.4177 ≈ uniform 0.4024 > cutwin32 0.3277 > kframes 0.2967 > blockslide 0.2870 > maxinfo_siglip 0.2487 > tiered_v5 0.1902 > scene_008_cap16 0.0714；**Scene Hit Rate：uniform 0.9603 居首**（slice 0.9365、cutwin32 0.9048；maxinfo / kframes / tiered_v5 / scene_008 = 0.7976 / 0.8413 / 0.7341 / 0.4325——「挑帧型」方法在长内容上漏 GT 场景显著更多）。两把正交标尺同结论：uniform 榜首梯队，其余噪声内。

**Omni 交织臂通路修复（2026-10-05 深夜，v1→v3 三段式）**：v1 `act()` 模板不含
视频占位符（`tokens 0 vs features 5580`）；v2 改 HF messages 模板修好视频占位符，
但 **mlx-vlm `process_inputs` 只按签名白名单转发 kwargs**，而补丁版处理器签名为
`(text, images, videos, audio, **kwargs)` → `use_audio_in_video` 被静默丢弃 →
音频占位符 0、模型侧 `audio_features` 无处散播（`800768 vs 0` 广播崩溃）；**v3**
直调处理器拿交错展开的 token 序列，再用 input_ids 旁路把张量喂给 `generate`
——冒烟通过（30s 视频 audio_pad=390，首题 1/1）。副产物：`AutoProcessor.
from_pretrained` 裸调会因缺 torchvision 失败（Qwen2VLVideoProcessor 回退路径），
必须让 mlx-vlm 模型模块先 import 安装处理器补丁——这就是 `mlx_vlm.load()` 的
隐藏顺序。

- **Q34：跨模型综合裁决：样本量、多样性与速度体检（用户 2026-10-06 之问）**：Q30 数字
  补齐 Wilson 95% CI + 配对检验力（MDE），并给两档速度与题目构成——回答「差距是否
  可信、样本够不够、多样性够不够」。

  **短档 276 题（92 视频）**：loader_block **83.0%** CI[78.1,86.9]（229/276）·
  Qwen 原生+ASR **83.0%** CI[78.1,86.9] · Qwen 64帧+ASR 81.5% · Omni 交织 80.8%。
  配对：loader vs 原生 **+16/−16，p=1.000**（严格平手）；vs Omni +25/−19 p=0.451；
  Omni vs 原生 +16/−22 p=0.418。**四路并列判决在 276 题上可分辨 ≥4-6pp 的差距——
  站得住。**（floor：text_only 51.4%；Qwen 原生纯视觉 79.3%。）

  **medium 84 题（28 视频）**：Qwen 原生+ASR **71.4%** CI[61.0,80.0] >
  Qwen 64帧+ASR 69.0% > MiniCPM u128 66.7% > u96 63.1% ≈ u64+ASR 61.9% ≈
  Omni 交织 60.7%（基线 u64 54.8%）。配对全在灰区：原生 vs u64+ASR +13/−5 p=0.096、
  vs Omni +14/−5 p=0.064、**同帧 64+ASR 换模型（Qwen vs MiniCPM）+9/−3 p=0.146**。
  **84 题在典型不一致数（18-23）下只能分辨 ≥10-14pp**——7-9pp 差距是「证据指向、
  未定案」；定案 8pp 需 ~160 题（≈54 视频×3），5pp 需 ~400 题。

  **多样性体检**：短档 92 视频 = Film&TV 17 / Artistic 17 / Knowledge 16 / Sports 16 /
  Life 16 / Multilingual 10，12 种 task_type 全覆盖；medium 28 视频偏 Life Record（9）、
  Multilingual 仅 1，task_type 长尾薄（Spatial Reasoning 1 / Temporal Perception 1），
  KFS 官方 GT 覆盖 16/28——medium 结论按「方向可信、定案需扩样」读。

  **速度（每题端到端，M2 Pro MLX；中位/均值）**：短档 Omni **21.9/23.4s** 最快 <
  Qwen 64帧+ASR 27.7/25.9s < loader_block 33.9s（均值，逐题计时）< MiniCPM u96
  44.3/42.2s < Qwen 原生 56.5/55.6s。medium：Omni **24.0/33.0s** < Qwen 64帧+ASR
  33.8s < MiniCPM u64+ASR 41.3s < u96 53.3s < u128 72.1s < Qwen 原生 85.2s。
  **读法**：Omni 交织两档都最快（原生通路省掉我方抽帧/拼图预处理）且短档质量并列
  ——速度×质量甜点；Qwen 原生反而最慢（原生 video token 化在 MLX 上偏重）；medium
  性价比点是 Qwen 64帧+ASR（69.0%、33.8s）。Omni 在 medium 质量掉队（60.7）成因未
  拆（其内部抽帧策略 vs 交织本身），纯视频诊断臂可选。

- **Q35：原生通路采样解剖 + Omni 交织臂 fps 元数据错配（用户 2026-10-06 之问）**：
  ① **基线 u64 是我方自定义**：uniform_64 = 1fps 解码 → 均匀子采 64 帧（我方脚本口径），
  MiniCPM-o 4.5 引擎 + 我方 QA harness——不是任何模型的官方推荐，只是预算曲线上的一个点
  （medium u16 53.6 → u64 54.8 → u96 63.1 → u128 66.7）。
  ② **原生帧数限制（实测）**：Qwen3-VL 与 Qwen3-Omni 处理器均声明 `fps=2.0, min_frames=4,
  max_frames=768`（mlx-vlm 默认 + 模型 processor 配置；Omni 官方 `video_processor.fps=None`，
  约定由调用方传实际采样率）。**帧数公式 = min(⌊时长×2⌋, 768)，触顶阈值 384s**；实测
  93s→186 帧、1046s→768 帧封顶（有效 0.73fps、帧距 1.36s）。**触顶面（10-07 全量核对）**：
  medium 在盘 53 视频 **35 个（66%）触顶**（有效 0.73–1.99fps、帧距 0.5–1.36s），18 个
  未触顶；短档 92 视频（最长 131s→261 帧）**全部未触顶**。我方 MiniCPM 臂不走此通路
  （1fps 解码 + 均匀子采 K，无 768 限制）。「原生输入」≠无限帧，是 2fps × 768 帧双重上限。
  ③ **原生慢的归因**：不是 ASR 慢——native_pure 54.2s vs native_asr 56.5s（中位，ASR
  仅 ≈+2s）；慢在原生通路本身（186-768 帧 vision token 的 prefill/内存：17GB vs MiniCPM
  5GB）。我方 u64 臂 27.7s 是「小预算」的另一端。
  ④ **Omni v3 旁路 fps 元数据错配（新发现，待修）**：mlx-vlm 官方 `process_inputs` 把真实
  采样率 `fps=metadata.sampled_fps` 转发给处理器（`utils.py:2513`），Qwen3-VL 原生臂时间轴
  自洽；我方 v3 为修 `use_audio_in_video` 直调处理器时**未传 fps** → 处理器缺省 1.0 →
  `video_second_per_grid=2.0s`，而帧实际 2fps（短档时间轴 2× 拉伸）/封顶后 0.73fps
  （≈1.37× 压缩）。**影响：Omni 两档成绩可能被时间轴错配低估**——修复（传
  `fps=meta.sampled_fps`）后需重跑再裁决；这也是「Omni medium 为何 60.7 vs Qwen3-VL
  71.4」的 harness 侧解释候选（另一候选是音频交错挤压 vision token，需纯视频臂拆分）。
  ⑤ **ASR 增益 vs context**：数据方向与「context 越大 ASR 越弱」相反——短档 Qwen
  pure→+ASR +3.7pp（p=0.087）、medium MiniCPM u64→u64+ASR **+7.1pp**（p=0.109）；转写是
  短文本（占 context 比例小），未见稀释；「帧数暴涨后 ASR 边际变小」未专测（可选实验）。
  ⑥ **未测过的组合**：Omni 纯视频（无音频）、Omni+我方 ASR 文本——均未跑。
  ⑦ **medium 检验力**：n=84 只能分辨 ≥10-14pp（Q34）；定案 8pp 需 ~160 题。

- **Q36：Q35 裁决执行——fps 修复对照 + pure/asr 拆分 + medium 扩样（收官，2026-10-07）**：

  **① fps 修复对照：质量无增益、成本上升，错配假设排除。** medium 修复版 51/84 = 60.7%
  与修复前**完全同分**（84 题 78 预测不变、6 翻转净 0）；短档 219/276 = 79.3% vs 修复前
  223/276 = 80.8%（+4/−8，p=0.388）。**裁决：fps 元数据错配不是 Omni 弱势成因**，修复按
  元数据保真保留。**成本勘误（10-07 受控实验）**：fps 参数不改变 token 数（同题 seq
  5659 vs 5659 完全一致）→ 无系统性代价机制；单题耗时受机器状态支配（同一调用重跑
  20.7–68.8s，×3 级抖动）——A/B 臂的慢化（52.1/37.5s 中位）判为**机器噪声，非修复
  代价**；ext 干净跑 23.6s ≈ 旧版 24.0s 同向。**跨臂耗时对比需按 ±30%+ 抖动读。**

  **② Omni 音频消融：原生看听交织的音频贡献 ≈ 0（两档）。**
  短档：pure（无音频）78.6% vs 交织 79.3%（+14/−12，p=0.845）；我方 ASR 文本 81.9%
  （221/270，vs 交织 +10/−16 p=0.327）。medium：pure 63.2%（55/87）≈ 交织 60.7% ≈
  ASR 64.3%（54/84），两两 p≥0.5。**「自己看自己听」在两档上都无可测增益；其有效音频
  形态与我们所有其他路线一致——转写文本。跨家族再复验「转写是唯一有效音频形态」（Q30）。**

  **③ Qwen3-VL vs Qwen3-Omni 同族差异：差距在「长内容」上、在模型侧，不在音频交织。**
  纯视觉对照（同处理器采样 2fps×768 帧）：短档 Omni pure 78.6 ≈ Qwen3-VL pure 79.3
  （打平）；medium Omni pure 63.2（55/87）vs Qwen3-VL pure **72.4%（63/87）——9pp**
  （+14/−6，p=0.115，方向一致）。**短档两模型视觉对等；medium 差距出现在 Omni 侧
  （pure 模式无音频仍低）——指向 Omni 模型的长视频能力劣势（或旁路通路长序列残余），
  不是音频交织本身；**机制已由 Q37 定位：视觉 token 预算 1/2–1/3**。**

  **④ medium 扩样收官（n=159）：Qwen 原生领先升格为显著。** 56 视频名义、盘上 53
  （3 个下载失败：1sTNqJVrqx8 / 6DAFkaGUiT4 / I5cFBi02O34；1NcGHbFWBFA 重试成功）；
  159 题逐题配对：
  - **Qwen 原生+转写 113/159 = 71.1%**
  - MiniCPM u96（无转写）102/159 = 64.2% ｜ u64+转写 99/159 = 62.3% ｜ Omni 交织 98/159 = 61.6%
  配对：Qwen vs u64+转写 **+23/−9 p=0.020**；vs Omni **+25/−10 p=0.017**；
  vs u96 +23/−12 p=0.090（6.9pp 未过线；u96/u128+转写组合未测，如彻底定案可补一臂）。
  **统计口径两读**：按单比较 α=0.05 两项均显著；按三臂 Bonferroni（0.0167）恰在阈外
  （0.020/0.017，差 0.0033/0.0003）——记「单比较显著、最严口径边缘」，方向 + 效应量
  （8.8pp）+ 分层一致性三者同向，生产决策建议按已定案采纳。
  分层复核（老 29 视频 87 题 vs 新增 24 视频 72 题）：Qwen 领先两半一致（69.0 vs 59.8 /
  73.6 vs 65.3）——**领先不是扩样构成的伪影**。
  **裁决：medium「Qwen 原生 > MiniCPM u64+转写」由 n=84 灰区（p=0.096）升格 n=159 显著
  （p=0.020）——定案；「Qwen 原生 > Omni」p=0.017 定案。**

  **⑤ 短档四路线不变**：loader_block 83.0 = Qwen 原生 83.0 仍居顶，Omni 家族
  78.6–81.9，fpsfix vs loader p=0.203——短档判决不受本轮影响。

- **Q37：机制三连——loader_block 分解 / 触顶分层 / VL vs Omni 的 token 预算（用户 2026-10-08 之问）**：

  **① loader_block ≠ 纯 ASR：是三件套。** 它的实测优势由三部分构成——(a) **loader 提取
  路径**（C9 轴：同帧表、无 ASR、同题配对，loader 79.0 vs 官方整文件路径 73.6，p=0.0007，
  ≈+5.4pp）；(b) 64 帧预算（预算曲线 64≈96 平）；(c) **ASR 整块转写**（vs 96 帧纯视觉
  83.0 vs 78.6 ≈+4.4pp；转写独解 51.4%）。逐帧对齐形态（loader_interleaved）80.8 无增益
  ——**「整块转写置帧前」即最优形态**。所以「主要是 ASR」只对一半：ASR 是最大单项内容
  增益，loader 帧管线本身也是实测优势。

  **② 触顶分层：触顶不改变排序，也不是 medium 低分的主因。** 53 视频 35 触顶（66%），
  其中 **重触顶（eff<1.0，>12.8 分钟，5 视频 18 题）全臂崩溃**：native 38.9% / u96 33.3% /
  u64+ASR 33.3% / Omni 27.8%——**MiniCPM 无 768 上限同样崩**，这是长视频固有难度，不是
  上限效应。未触顶−触顶差：native +7.4pp / u96 +6.6pp / Omni +7.6pp / u64+ASR −1.7pp
  （长度混杂）；**native 在两桶均领先**（capped +16/−9 p=0.230；uncapped +7/−3 p=0.344）
  ——触顶不解释跨模型差距。medium 整体低于短档的主因是内容难度（MiniCPM 无上限也低）。
  上限更可能让 native 少拿分（帧预算仍是杠杆：medium u64→u128 +11.9pp），>768 帧在本机
  不可行（显存/时间）。

  **③ VL vs Omni 的机制答案：同帧数、不同 token 预算。** 实测（处理器级、同视频同采样，
  `token_budget_diag.py`）：
  - 93s/186 帧：VL grid[93,16,30]→**11,160 视觉 token**（seq 12,064）；Omni [93,12,20]→
    **5,580**（seq 5,659）；
  - 1046s/768 帧：VL [384,8,16]→**12,288**（seq 16,176）；Omni [384,4,10]→**3,840**
    （seq 3,914）。
  机制：两处理器的像素预算都是**全视频总量**（每帧像素 ≈ 预算/帧数）：VL max_pixels≈25.2M
  vs Omni ≈12.8M（各自模型包配置）→ Omni 视觉 token 为 VL 的 **1/2（短）至 1/3（长）**。
  推论：**Omni 的「快」（23.6 vs 76.2s/题，序列 4× 短）与「长视频弱」（medium 61.6 vs 71.1）
  是同一事实的两面**；短档信息够用（打平），长档成信息瓶颈（17 分钟视频仅 3,840 token
  ≈3.7 token/秒视频 vs VL 11.7）。音频交织与 fps 元数据此前已排除（Q36）。**两模型同构
  MoE**（48 层/128 专家/8 per-tok；视觉塔 depth27/hidden1152）——速度差不是 MoE vs dense。

  **④ 上限一致性**：帧数上限一致（两处理器实测均 2fps×768 封顶、同帧数解码），差异在
  **像素预算**（12.8M vs 25.2M）——即「同帧数、不同清晰度」。

  **⑤ 官方基准佐证（外部锚点）**：Qwen3-Omni 技术报告（arXiv:2509.17765）**自陈长视频是短板**——
  「A limitation of the current model is its suboptimal performance on long video benchmarks.
  This deficiency stems from two architectural constraints: a limited capacity for positional
  extrapolation and a restricted context length.」官方 Video-MME w/o sub：Qwen3-Omni-30B-A3B
  Instruct **70.5** / Omni-Flash 71.4 / Gemini-2.0-Flash 72.4 / **Qwen2.5-VL-72B 73.3**——
  Omni 在官方自己的表里就输给上一代 VL 大模型；Omni-Thinking 更低（69.7）。对照 Qwen3-VL
  报告（arXiv:2511.21631）：VideoMME 评测配置 2fps、**2048 帧/视频上限**、≤640 token/帧，
  原生 256K 上下文，且三项架构升级直指长视频（Interleaved-MRoPE 均衡频谱、显式时间戳 token
  取代 T-RoPE 绝对时间位置 ID、S3 阶段 262,144 序列超长上下文适配）——而 Omni 用的 TM-RoPE
  正是把绝对时间绑到位置 ID 的路线。**故本地测到的「同帧数、Omni 视觉 token 仅 VL 的 1/2–1/3」
  不是偶然的默认参数差异，而是两代设计目标的投影**：VL 为长视频/长上下文优化，Omni 为实时
  多模态交互（低首包延迟、MoE 高并发、压缩优先）优化。边界：官方数字与本地不同 harness
  （帧率/帧数/分辨率不同），只作方向性佐证，不可直接比数。

- **Q38：loader vs uniform 的技术差 / token 预算的算法 / 上限归属 / 时间编码 / 换模型决策
  （用户 2026-10-08 追问）**：

  **① `loader_*` 与 `uniform_K` 是四个维度同时不同，不是一件事。**
  - *采样网格*：`uniform_K` = 1fps 解码网格上 `idx=round(i·(N−1)/(K−1))`，取整数秒
    （`bench_common.true_uniform_timestamps`，落盘于 `medium_budget_ts.json` 等）；
    `loader_*` = 官方 MiniCPM 规则（≤64s 每帧 1fps；>64s 整片 10fps 解码后
    `official_uniform_sample` 取 64，时间戳精确到 0.1s）。
  - *解码方式*：`uniform_K` = `bc.grab_frame` 逐时刻 accurate seek（`-ss t -i`，
    `scale=448:-2`，q:v 3）；`loader_*` = `lib/video_loader.load_video`（网格是等差数列时
    一次性 `-vf fps=` 批解码 `_try_batch_grid`，否则逐点 seek，**全分辨率** q:v 2）。
  - *分辨率*：448px 宽 vs 原分辨率——**这是 C9 效应的直接嫌疑**。
  - *上下文装配*：`loader_block` 额外前置整块转写（2000 字）；`uniform_K` 纯视觉
    （`_asr` 变体才加转写）。
  已跑过的受控比较只有 **C9**（同网格、只换提取器）：`loader_vision` 79.0 vs
  `official_vision` 73.6（p=0.0007，+5.4pp）。`loader_vision`(79.0) vs `uniform_64`(77.5)
  **没有做过配对检验**，两者网格与分辨率同时不同，属混杂比较，不单独解读。

  **② token 数字的来源与算法**：`token_budget_diag.py`（2026-10-08 新写，**此前无任何统计**）。
  只载处理器不载权重：各处理器用 `resolve_video_sampling` 解析自己的采样 → `load_video`
  解码同一 mp4 → 直接调 `processor(text=[...], videos=[arr], fps=meta.sampled_fps)` →
  读 `input_ids.shape[-1]` 与 `video_grid_thw`，token 数 = `prod(t,h,w)/merge_size²`。
  n=2 视频（93s / 1046s），单次运行。数字是处理器输出的精确计数（确定性），但"全视频成立"
  靠的是机制（预算是全片总量），不是样本量。像素↔token 换算比 = **2048 px/token**
  （25,165,824 px ↔ 12,288 token 实测吻合）。

  **③ 上限归属：768 不是我们的配置，也不看设备。** 优先级是
  调用方 > 处理器 > 库默认（`mlx_vlm.utils.resolve_video_sampling`）：
  - 官方 `Qwen/Qwen3-VL-30B-A3B-Instruct` 的 `video_preprocessor_config.json` **只有
    `size.longest_edge`**，没有 fps/max_frames；
  - `fps=2 / min_frames=4 / max_frames=768` 出现在 **mlx-community 转换包**的
    `video_preprocessor_config.json`（我们用的 `~/models/Qwen3-VL-30B-A3B-Instruct-4bit`
    即 mlx-community 转换）；
  - mlx-vlm 库默认 `DEFAULT_VIDEO_SAMPLING = fps 2.0 / min_frames 4 / max_frames 768 /
    frame_factor 2`（`utils.py:2029`），两者数值恰好一致；
  - 官方 `Qwen/Qwen3-Omni-30B-A3B-Instruct` 仓库**根本没有 video_preprocessor_config.json**，
    `preprocessor_config.json` 里也没有 max_frames；Omni 的 768 同样来自 mlx-community
    的 `processor_config.json`。
  **结论：768 是 MLX 侧（转换包 + 库默认）的约定，与机器显存无关；官方 Qwen 配置不声明帧数上限。**

  **④ 像素预算：官方明说"保守"，且给了推荐值。** Qwen3.8-27B 模型卡 Best Practices 第 4 条
  原文：released `video_preprocessor_config.json` 的 `size` 是 conservatively configured，
  建议把 `longest_edge` 提到 **469,762,048**（≈224k video tokens）以支持小时级视频的高帧率
  采样。换算：默认 25,165,824 px ÷ 2048 = **12,288 token**；推荐值 ÷ 2048 ≈ **229k token**
  （官方称 224k）——**默认比推荐低 18.7×**。Omni 的 `max_pixels`=12,845,056 px
  （官方 `Qwen/Qwen3-Omni-30B-A3B-Instruct/preprocessor_config.json` 原值）≈ **6,272 token 上限**。
  实测 93s 用满（5,580/6,272），1046s 被每帧下限卡在 3,840。
  → 「调大 max_pixels 有没有用」在 VL/3.8 系有官方背书；**但 Omni 的预算是它自己训练时的
  设定，调大属分布外推理**，可能更好也可能更差，须实测。

  **⑤ 显式时间戳 vs 绝对时间位置（两条技术路线）**：
  - *绝对时间位置*（Qwen2.5-VL 的 T-RoPE / Qwen3-Omni 的 TM-RoPE）：把 RoPE 角度维度切成
    t/h/w 三组，t 维 position id 直接编码绝对时间（Omni：每 80ms 一个 temporal ID）。
    后果（Qwen3-VL 报告原文）：长视频里 temporal id **极大且稀疏**，位置外推能力受限；
    训练必须覆盖大量 fps 采样才能学会读这些 id，数据构造成本高。Omni 报告自陈的两条限制
    （positional extrapolation + context length）正对应此路线。
  - *显式时间戳 token*（Qwen3-VL / Qwen3.8）：每个视频时间块前缀一个格式化字符串
    （如 `<3.0 seconds>`），作为**普通文本 token** 进序列。位置 id 不再随时长爆炸，时间像
    文字一样被读取推理，训练不需穷举 fps；代价是**多一点上下文长度**（报告原文
    "incurs a modest increase in context length"）。

  **⑥ 换模型决策：现有开放权重里没有更新的 Omni；真正的"新模型"候选是同代 VL 系。**
  时间线（HF 仓库 createdAt / arXiv）：Qwen3-Omni-30B-A3B **2025-09-20**（arXiv 2509.17765）
  → Qwen3-VL-30B-A3B **2025-11-26**（arXiv 2511.21631，比 Omni 晚约 2 个月）→ MiniCPM-o 4.5
  **2026-04-29**（arXiv 2604.27393，三者中最新）。更新的 Omni **均无开放权重**：
  Qwen3.5-Omni-Plus 托管于 DashScope；Qwen3.8-Omni-Flash（arXiv 2609.25611，2026-09-18）
  为 API-only。Qwen 名下开放权重的 Omni 最新仍是 2025-09 那个（HF `author=Qwen&search=Omni`
  只有 Qwen2.5-Omni-* 与 Qwen3-Omni-30B-A3B-*）。
  可测的"新模型"实为两条 VL 系后裔，均 Apache 2.0、原生视频、同 `longest_edge` 默认、
  mlx-vlm 已支持（`qwen3_5_moe` / `qwen3_5`）且有 MLX 4bit 转换：
  | 候选 | 发布 | 结构 | 相对本机速度 | 视频 benchmark |
  |---|---|---|---|---|
  | Qwen3.6-35B-A3B | 2026-04-15 | MoE 35B-A3B（3B 激活） | **同档**（与现 30B-A3B 同激活量） | 模型卡无 |
  | Qwen3.8-27B | 2026-08-14 | dense 27B（27B 激活） | 约慢 9×（激活参数比） | 模型卡无 |
  **建议顺序**：先做 2h 的 Omni `max_pixels` 实验（纯配置改动，分离「压缩率 vs 训练差异」，
  无论结论都把 Q37 钉死）；再用 20 视频 / 60 题的**子集探针**试 Qwen3.6-35B-A3B
  （同速度档、可顺带验证官方 `longest_edge` 推荐值是否真的有效）；Qwen3.8-27B 因 dense
  27B 的激活量先做速度冒烟再决定。**不建议**追 Qwen3.8-Omni-Flash——API-only，与
  「本地优先」硬件路由冲突。

- **Q39：压缩的确切含义 / 三个 Omni 变体 / VL 的 Instruct-Thinking / 时间戳两义 / 分档选型
  （用户 2026-10-08 追问）**：

  **① 「压缩率」= 空间分辨率压缩，不是视频编码。** 帧数、时间戳、时序完全一致（两模型同
  2fps×768 解码），差别只在**每帧被缩到多大**再进视觉塔。按实测 grid 反推（patch 16px、
  temporal_patch_size 2、merge 2×2）：
  | 视频 | VL 每帧 | Omni 每帧 |
  |---|---|---|
  | 93s / 186 帧 | 122,880 px ≈ 350×350 | 61,440 px ≈ 247×247 |
  | 1046s / 768 帧 | 32,768 px ≈ 181×181 | 10,240 px ≈ 101×101 |
  长视频里 Omni 每帧只有 101×101——**17 分钟的视频，模型看到的是约 100×100 的缩略图**。
  机制是像素预算按**全片总量**分配（每帧像素 ≈ 预算/帧数），所以视频越长每帧越小；
  Omni 预算 12.8M 只有 VL 25.2M 的一半，于是每帧分辨率减半。与 H.264 之类的编解码无关。

  **② Qwen3-Omni-30B-A3B 确有三个开放权重，我们只用了 Instruct。**
  | 变体 | 用途 | 我们测过 | 本地可跑性 |
  |---|---|---|---|
  | **Instruct** | 直接作答 | ✅ 全部 Omni 臂 | mlx-community 4/5/6/8bit/bf16 齐全 |
  | Thinking | 长推理链 | ❌ | **无 MLX 转换**（只有 cyankiwi AWQ-4bit，走 vLLM）；且长推理与
    我们 `max_tokens=8` 的 harness 冲突，需另写评分流程 |
  | Captioner | 音频描述专用微调 | ❌（不适用） | 音频 captioning 任务，不做视频 QA |
  **结论：不是「漏测」，是后两个对本 bench 不适用或不可跑。**

  **③ VL 同样分 Instruct / Thinking，且 Thinking 有 MLX 可测。** Qwen3-VL-30B-A3B-Instruct
  （我们用）与 Qwen3-VL-30B-A3B-Thinking 同代发布；`mlx-community/Qwen3-VL-30B-A3B-Thinking-4bit`
  （2025-10-14）存在。**这是比 Qwen3.6/3.8 更便宜、更对症的一个候选**——同架构、同分辨率
  默认、只换后训练，能直接回答「推理链对长视频 QA 有没有用」。同样受 `max_tokens=8` 限制，
  需放宽输出预算才公平。

  **④ 「显式时间戳」有两个意思，我们测过的那个没有增益。**
  - *喂法侧*（我们能开关的）：`ts` 模式 `[MM:SS.s] 文本` 每格一行 = 73.2%，与整块纯文本
    **完全持平**；逐帧交错 `loader_interleaved` 80.8% 也劣于整块 `loader_block` 83.0%。
    → **「把时间戳喂给模型」在我们的实测里没有增益**，C2 的增益来自「有转写」本身。
  - *架构侧*（模型训练时定死，我们无法开关）：Qwen3-VL 把时间编码成文本 token
    （`<3.0 seconds>`）写进训练数据，取代 Qwen2.5-VL/Omni 的 T-RoPE/TM-RoPE 绝对时间位置 ID。
    这是 Q38⑤ 讲的两条**设计路线**，不是可切换的喂法。**不能用它推断「我们加时间戳会更好」。**

  **⑤ 分档选型（现有数据直接支持，无需新实验）：**
  | 档位 | 首选 | 质量 | 速度 | 依据 |
  |---|---|---|---|---|
  | **短档**（92v/276q） | **MiniCPM-o 4.5 + 我们的 loader（`loader_block`）** | 83.0%（并列第一） | **33.9s/题** | 与 Qwen native 并列 83.0%，但快 **1.6×**；且全本地、无跨模型依赖 |
  | **中档**（53v/159q） | **Qwen3-VL-30B-A3B + 原生通路 + ASR** | **71.1%**（唯一显著领先） | 76.4s/题 | vs u64+ASR p=0.020、vs Omni p=0.017；native 在触顶/未触顶两桶均领先 |
  | 中档（成本优先） | u64+ASR（MiniCPM） | 62.3% | 37.4s/题 | 质量低 8.8pp，速度 2× |
  **即：MiniCPM 守住短档，Qwen3-VL 拿中档。** 两档都已有充分配对证据，不必等新模型。

  **⑥ 阶段链启动（2026-10-08 19:57，用户「启动吧」）**：两臂串行（MLX 单机，并行争显存），
  日志 `.scratch/keyframe-bench/q39_chain.log`，脚本 `exp_q39_chain.sh`。

  *预检（launch 前已实测，决定实验是否干净）*：把 Omni 的 `max_pixels` 从仓库原值
  12,845,056 提到 VL 的 25,165,824，1046s 视频的 grid 从 `[384,4,10]`（3,840 vtoks）变成
  **`[384,8,16]`（12,288 vtoks）——与 Qwen3-VL 逐位相同**；93s 视频同样 `[93,12,20]`→
  `[93,16,30]`（5,580→11,160，= VL）。**两处理器是同一份代码（Omni 复用
  `Qwen3VLVideoProcessor`），差别只在配置值** ⇒ 视觉输入可变成同一份，实验只剩模型权重
  一个变量。这比原计划设想的更干净。
  *机制确认*：`_smart_resize_video` 的判据是 `t_bar*h_bar*w_bar > max_pixels`，即
  **max_pixels 是全视频总量**（Q38④ 的说法得到源码验证），故 bump 后每帧像素随帧数摊薄，
  长视频受益最大。

  *臂 1（回答 Q39-⑤）*：MiniCPM + `uniform64` 时刻表 + 整块转写，short 档。
  现状缺口 = loader_block（83.0，64 帧官方时刻表 + 转写）与 uniform64（77.5，纯视觉）
  之间从未做过「同帧数 + 同转写、只换网格」的配对。
  **关键：≤64s 视频两套时刻表完全相同，>64s 才分叉**（实测 81s 视频仅 5/64 点重合、
  100.7s 仅 2/64），故本臂只在长视频上构成真正的网格对照。
  读法：若 uniform64+转写 ≈ 83.0 → loader 的网格/提取无独立贡献，生产可退化成
  「uniform 公式 + 转写」；若明显低于 83.0 → loader 网格有独立价值。

  *臂 2（回答 Q37 悬置问题）*：Omni `max_pixels` = VL 水平，medium 28v/84q。
  读法：bump 后 ≈ Qwen VL 71.1 → Omni 弱在压缩；仍 ≈ 61.6 → 弱在训练。

  *规模口径*：`bench_subset_100.csv` 名义上有 **100 个视频 ID / 300 题**，但其中
  8 个视频文件**仍不在盘上**（`0IdYJGBmguM` `44ivpEIcBhE` `54YD3Gv-3MI`
  `5_fXicEnKKk` `6EIrArTyLVU` `8e05W-wi38g` `913JhnW28U4` `HwnB8aCn8yE`），
  故实际跑 **92 视频 / 276 题**——与历史各臂口径**完全一致**，配对无需取交集。
  （2026-10-08 我先按「8 个视频已补下载」记成 100/300，是错的：那次核验只比对了
  parquet 里的题目集合，没有检查视频文件是否存在。已更正。）

---

### Q40：2×2 预算对照 / 评测协议合规性 / 完整帧率公式 / 模型内部如何处理视频与转写 / QA 与生产场景的外部效度

**① 把 VL 和 Omni 放到同一个水平比较（2×2 因子表）**

单跑「Omni bump 后变好没有」只能得到一个格子，分不清是「预算确实重要」还是
「Omni 特别吃预算」。要分辨，必须两个模型 × 两个预算都跑到：

| | Omni 预算 12,845,056 | VL 预算 25,165,824 |
|---|---|---|
| **Qwen3-VL** | **← 臂 3（本次新增）** | 60/84 = **71.4%** ✅已有 |
| **Qwen3-Omni** | 51/84 = **60.7%** ✅已有 | ← 臂 2（在跑） |

读法：**行内差 = 预算效应，列内差 = 模型效应。** 若 VL 降到 Omni 预算也大跌 ⇒ 预算主导
（Omni 的短板是压缩率，不是模型）；若 VL 基本不动而 Omni 大跌 ⇒ Omni 的视觉编码/对齐
训练确实更弱。两种结果指向完全不同的生产决策（调参数 vs 换模型）。

*预检已证 2×2 是干净的*（`vl_budget_precheck.py`，处理器级不载权重）：VL 与 Omni 的视觉
网格在两个预算上**互为镜像、逐位相同**——

| 视频 | VL@VL | VL@Omni | Omni@Omni | Omni@VL |
|---|---|---|---|---|
| 93s | `[93,16,30]` 11,160 | `[93,12,20]` 5,580 | `[93,12,20]` 5,580 | `[93,16,30]` 11,160 |
| 1046s | `[384,8,16]` 12,288 | `[384,4,10]` 3,840 | `[384,4,10]` 3,840 | `[384,8,16]` 12,288 |

两模型共用同一份 `Qwen3VLVideoProcessor` 代码，差别只在配置值 ⇒ 视觉输入可精确对齐，
实验只剩「预算 × 权重」两个变量。**注**：VL 的 `image_processor.max_pixels` 是
16,777,216，与 `video_processor` 的 25,165,824 本来就不同；旋钮把两者一起设成同一值，
本实验只喂视频故不受影响，但这一点在别处复用旋钮时要注意。

**② `max_tokens=8` 是否合理？——是，而且提示词就是官方推荐的**

对照官方评测栈 `lmms-eval` 的 `videomme.yaml`（Video-MME 官方 README 指定
`VLMEvalKit` / `LMMS-Eval` 两条管线）：

| 项 | 官方 | 我们 | 判定 |
|---|---|---|---|
| 输出预算 | `max_new_tokens: 16` | `max_tokens=8` | 等价——答案是单个字母，8 与 16 都远超所需 |
| 采样 | `temperature: 0, do_sample: false` | `temperature=0.0` | 一致 |
| 提示词 | qwen3_vl 专用 `post_prompt: "Answer with the option letter only."` | `Answer with the option letter only (A, B, C, or D).` | **一致**（我们多列了字母，更明确） |
| 答案抽取 | `extract_mcq_answer`（结构化 MCQ 抽取器） | `parse_lenient` = 首个 A-D 字符 | **有差距**，见下 |
| 相关性聚类 | `cluster_key: videoID # questions from same video are correlated` | 按视频配对 / 聚类 | **一致**（官方注释直接支持我们的做法） |

*抽取器的真实差距*：官方用结构化抽取器，我们用「首个 A-D 字符」。这条规则在
`raw` 为单字母时无害，但**推理型输出会踩雷**——实测 `parse_lenient("The answer is C")`
返回 `"A"`（"answer" 里的 a）。历史臂的数字已落盘、抽取器不能动，所以新增了
`VM_THINK_STRIP` 专用通路：剥掉 ` thinking` 块 → 严格匹配 → 「不贴字母的独立大写 A-D」
正则，并把命中的层级（`strict`/`loose`/`none`）逐行记录，让「靠宽松规则得分」的
比例可见而不是静默。已实测 8 例全过。

*另一处已量化的差异*：原生视频臂的输出**不是单字母**，而是回显选项文本
（如 `'C. The Lehman Trilogy.'`）。说明原生视频通路下模型对「只答字母」的遵从度更低。
这不影响判分（首字母仍在最前），但提醒：**原生视频臂与帧臂差的不仅是采样，还有输出
遵从度**——它不是纯粹的「采样策略」单变量。

**③ 完整帧率公式**

*原生视频通路*（`mlx-vlm` 库级，`utils.py`）：

```
fps        = 2.0     (DEFAULT_VIDEO_SAMPLING)
min_frames = 4
max_frames = 768
frame_factor = 2      # 帧数必须是对齐单位

lo = ceil(min_frames / 2) * 2                  = 4
hi = floor(min(max_frames, total_frames) / 2) * 2
n  = floor(clamp(duration * fps, lo, hi, total_frames) / 2) * 2
indices = linspace(0, total_frames - 1, n).round()
```

优先级：调用方 > 处理器声明 > 库默认（`resolve_video_sampling`）。768 这个上限来自
**mlx-community 的转换仓库 + mlx-vlm 库默认**，Qwen 官方仓库不声明帧上限。

*uniform 选帧通路*（我们的 bench，`bench_common.true_uniform_timestamps`）：

```
idxs = [round(i * (N - 1) / (K - 1)) for i in range(K)]     # N=解码帧数, K=预算
ts   = [round(idx / fps, 3) for idx in idxs]                # fps = 视频真实帧率
```

即 **在解码帧轴上等分，再折算成秒**——不是「在时间轴上等分」。两者只有在 `N` 能被
`K-1` 整除时才重合。这就是 >64s 视频上官方时刻表与 uniform_64 几乎不重合的机制：
官方是 0.1s 精度的时间轴等分，我们是对齐到整数解码帧。

**④ 模型内部如何处理「视频」与「转写」——这解释了为什么原生视频臂更强**

*原生视频通路*：处理器按**时间块**渲染，每 2 帧（`temporal_patch_size`）一组，组前插入
一个**显式时间戳文本 token**：

```
<0.0 seconds><|vision_start|><|video_pad|>×frame_seqlen<|vision_end|>
<1.0 seconds><|vision_start|><|video_pad|>×…<|vision_end|>
…
```

时间戳取该组首末帧的均值（`_timestamped_video_placeholder`）。处理器源码里有一句
直白的注释：**「没有这些标记，模型看到的是一整块无时间的帧，会把运动描述成空间拼贴」**。

*帧通路（我们的 uniform / loader / slice 臂）*：N 张图各自成为
`<|vision_start|><|image_pad|><|vision_end|>` 块，**完全没有时间戳**。模型既不知道每帧
在什么时候，也不知道这些是「一段视频」而非「N 张互不相关的照片」，只能从序列顺序推断。

*转写文本*：与问题、选项、指令拼在同一个文本上下文里，**与帧没有任何结构对齐**——
没有把某句字幕绑到某帧。所以「说完 X 之后做了什么」这类题，模型必须自己做时间对齐，
而帧通路连时间轴都没有。我们的转写还带一个中文标签头
（`视频的语音转写（可能不完整、可能有错）`），与官方 `This video's subtitles are listed
below:` 不同——这会改变提示的语言上下文，是一个尚未对照过的变量。

**⑤ 问答式 benchmark 对我们的场景是否适用？——部分适用，但结论不能直接搬**

生产任务（`asset-sourcer.mjs` + `vlm_analyzer.py`）实测形态：

| 维度 | Video-MME QA 臂 | 生产相关度判定 |
|---|---|---|
| 任务 | 4 选 1，有唯一正确答案 | 给 scene claim（`voiceover` + `assetNeed`）打 **0-100 相关度**，阈值 60 门禁 |
| 输出 | 8 token，单个字母 | 结构化 Markdown，**8 个必填键** + 相关度整数 + 一句理由（`max_tokens=1000`） |
| 输入长度 | **整片**，short 最多 64 帧 / 中档 1046s 视频 | **分档窗**：≤8s→1 窗 1fps、8-30s→1 窗 0.5fps、**>30s→3 等分窗**（窗长 D/3，非 ≤30s）、**每窗 ≤8 帧**（精确对照见 §Q41⑳） |
| 判断题性质 | 判别式（4 选 1，25% 地板） | 绝对评分 + 阈值（校准问题，非判别问题） |
| 错误代价 | 对错对称 | 不对称：假阳（配错素材）远贵于假阴（拒绝后重搜） |
| 是否需要排序 | 不需要 | 需要（N 个候选里挑最好的） |

**重叠的能力**：都要「读出画面里的显著内容」「读屏上文字」「理解动作」——所以
Video-MME 是「模型能不能读这段视频」的合理代理。

**不重叠的部分，而且恰好踩在我们的决策上**：

1. **帧预算差一个量级**。我们的短档结论「16→64 帧涨 6.8pp」是在 64 帧下测的，
   而生产**每次调用最多 15 帧**。帧数-收益曲线在这个区间是否还单调，bench 没测。
2. **窗口 vs 整片**。生产是分档窗（>30s 时 3 等分窗、单题 ≤24 帧），
   bench 是整片抽帧（64 帧）。精确对照见 §Q41⑳。
   选帧方法在「短窗内选 8 帧」和「长片内选 64 帧」上的排序不保证一致。
3. **评分制 vs 判别制**。相关度打分要的是**校准**，MCQ 要的是**排序**。一个方法可能
   在「找对那一个细节」上赢、在「判断整体是否切题」上输。

**结论**：Video-MME 足以支撑「哪个模型/哪条通路更能读视频」，**不足以支撑「哪套选帧
方法在生产形态下更好」**。后者需要一次生产形态的对照实验（见下方提案）。

*已有的生产钩子*：`visual-analyzer.mjs:510` 已经接了 #391 的 `frameStrategy:
"uniform"|"scene"` 与 `maxFrames` 透传（缺省 = 现行为），`vlm_analyzer.py:1432` 已接
CLI。**钩子在了，但没有一条实验在这个形态下跑过。**

**⑥ 提案：生产形态的相关度对照臂（待用户裁决，未启动）**

目的：把「哪套选帧方法在生产形态下更好」从推断变成实测。设计要点：

- **任务形态照抄生产**：`build_semantics_prompt(is_video=True, claim={voiceover,
  assetNeed})`，输出 0-100 相关度 + 理由，阈值 60。
- **帧预算照抄生产**：每窗 ≤8 帧、窗按 `asset-sourcer.mjs` 的 4 档划分
  （>30s 时窗长是 D/3，不是 ≤30s；见 §Q41⑳），而不是 bench 的 64 帧整片。
- **唯一变量**：`frameStrategy`（uniform vs scene）+ `maxFrames`。
- **判据**：不能用「答案对不对」（没有唯一答案），要用**排序**——同一 scene 的正确素材
  是否被排在干扰项之上（AUC / top-1 命中率），以及**假阳率**（错误素材过 60 线）。
- **数据缺口（这是真正的成本）**：现成标注只有
  `deepseek-harness-desktop/stock-relevance-report.json`，**仅 3 行候选、2 行有分**，
  远不够。要跑就得先造一个有正负样本的 scene×asset 集（23 个 content 目录的
  `scene-data.mjs` 里已有「人选中的素材」= 正样本，负样本需要从候选池补）。
- **成本**：造数据集是主要成本；推理本身便宜（每 scene 几次 ≤8 帧调用）。

**这一条不并入当前阶段链**——它需要先决定「造数据集」这件事值不值得，属于用户裁决项。

---

### Q41：阶段链结果（2026-10-09 凌晨跑完）——loader 裁决 + 2×2 预算对照 + Thinking 冒烟

**① 臂 1 裁决：loader 的网格/提取没有独立贡献（用户 Q39-⑤ 的怀疑成立）**

short 档 92 视频 / 276 题，MiniCPM，同 64 帧、同整块转写，**换两处：帧时刻网格 +
输入分辨率**（2026-10-09 更正：原写「只换网格」不准确）：

| 臂 | 分数 | vs loader_block |
|---|---|---|
| `loader_block`（官方时刻表，帧取全分辨率 640×360） | 229/276 = **83.0%** | — |
| `uniform64` + 转写（新增，帧走 `grab()` → 448×252） | 223/276 = **80.8%** | Δ=+2.2pp，b=10 c=4，**p=0.1796 不显著** |

⇒ **「uniform 帧率公式 + 转写」与 loader 在统计上不可区分。** 生产可以退化成
`uniform` 公式 + 转写，少一层自定义 loader，代价在噪声范围内。
但这是「**统计上分不出**」，不是「uniform 更好」——简化买到的是**少一层复杂度**，
不是分数。

*两处差异的分解（2026-10-09 补做，用两臂各自的真实帧表）*：帧时刻表在
**16/92 个视频上逐值相同**（都是 ≤64s 的视频），这 16 个视频上两臂只差**输入分辨率**：
48 题里 85.4% vs 85.4%，Δ=0.0pp（b=1 c=1）。另 76 个视频网格不同（>64s 用 10fps
解帧后 linspace 取 64 点、亚秒分辨率；uniform 是 1s 分辨率整数点——81s 视频实测
仅 5/64 点重合），这 76 个视频上 Δ=+2.6pp（b=9 c=3，p=0.146）。
⇒ **分辨率差异单独看没有可测影响；那 +2.6pp（仍不显著）跟着网格走。**
两臂的网格**都是均匀采样**，差别只是取点位置差零点几秒——所以本对照测的是
「均匀采样的取点细节无关紧要」，**不能**读成「选帧方法无关」。

*参照*：`uniform64` 纯视觉 214/276 = 77.5% → 加转写 Δ=+3.3pp（p=0.0931）。
即 64 帧下**转写贡献约 3pp（下界，见 ⑤），loader 网格贡献约 2pp 且不显著**。

*一个方法论注记*：`loader_interleaved`（223/276）与 `uniform64_asr`（223/276）
不仅总分相同，**逐题正确性 92.8% 一致**。两条完全不同的通路给出几乎相同的错误模式，
说明这一档的残余误差主要由**题目难度**决定，而非选帧方法——这是「选帧轴在该档已饱和」
的又一证据（与 C4 结论一致）。

**② 臂 2/3 与 2×2 因子表（回答 Q40①）**

medium 档，四格齐（配对取交集 n=84）：

| | Omni 预算 12,845,056 | VL 预算 25,165,824 |
|---|---|---|
| **Qwen3-VL** | 60/84 = **71.4%** | 60/84 = **71.4%** |
| **Qwen3-Omni** | 51/84 = **60.7%** | 57/84 = **67.9%** |

配对 McNemar（Bonferroni α=0.05/4=0.0125）：

| 对比 | Δ | b/c | p | 判定 |
|---|---|---|---|---|
| VL 的预算效应 | **+0.0pp** | 5/5 | 1.0000 | 无效应 |
| Omni 的预算效应 | **+7.1pp** | 9/3 | 0.1460 | 不显著 |
| 模型效应 @ Omni 预算 | +10.7pp | 13/4 | 0.0490 | 名义显著、校正后不显著 |
| 模型效应 @ VL 预算 | +3.6pp | 8/5 | 0.5811 | 不显著 |
| **交互 DiD** | **−7.1pp** | — | CI [−16.7, +2.4] | 跨 0 |

**读法**：把 Omni 的预算提到 VL 水平后，模型差距从 **10.7pp 缩到 3.6pp**，
而 VL 自己**一分不涨**。方向支持「Omni 的短板有相当一部分是压缩率而非训练」——
与官方报告自认的长视频弱点（Q37⑤）一致。

**但 n=84 撑不住结论**：四个对比无一通过 Bonferroni，DiD 的 CI 跨 0。
诚实表述是「效应量与方向一致，样本不足以判定」。medium 档要坐实 7pp 级差异，
按本轮方差外推需约 200+ 题。

**③ 一个意外细节：预算改变的是「哪些题对」，不是「对几题」**

VL 在两个预算下总分**完全相同**（60/84），但逐题并不同（b=5、c=5，恰好对称抵消）。
即像素预算改变了模型能看清的**具体细节**，只是净正确数不变。
对生产有直接含义：若场景关心的是**特定内容**（如读屏文字、某个物体），
聚合准确率不动并不代表该内容不受影响——需要按内容类型分别验证，不能只看总分。

**④ Thinking 冒烟（用户「我想试一下这个模式」）——机制通，效果与 Instruct 无异**

模型：`mlx-community/Qwen3-VL-30B-A3B-Thinking-4bit`（本地 18.25GB，4 分片）。
下载经 ModelScope + aria2c，四个分片 sha256 与 HF 公布的 LFS 哈希**逐一比对通过**。

*机制验证（三问全过）*：

| 项 | 结果 |
|---|---|
| 是否吐 thinking 块 | 是，模板自带 `assistant\n thinking\n`，无需开关 |
| 剥块后解析命中层级 | **6/6 全部 `strict`**，无一依赖宽松规则 |
| 推理链长度 | 201–1232 token（中位 264），**未触顶 2048** |
| 延迟 | 中位 **69.0s/题**（min 59.8 / max 82.4） |

*效果对照*（同 6 题、同 native 视频 + 整块转写）：

| 臂 | 分数 | 中位延迟 |
|---|---|---|
| Instruct（native+ASR） | 5/6 = 83.3% | 49.2s |
| **Thinking（native+ASR）** | 5/6 = **83.3%** | **69.0s**（1.40×） |
| MiniCPM u64+ASR（参照） | 3/6 = 50.0% | 36.7s |

**逐题预测完全相同**，包括那道双方都答错的（q182-2，双方都选 B，答案是 A）。
即：推理链没有改变任何一个答案，只增加了 40% 延迟。

*判读的边界*：n=6 远不足以断言等价，但足以说明**这不是一个能「免费」提升的模式**。
若要坐实，最有信息量的做法不是全量重跑（276 题 × 69s ≈ 5.3h 机时，
且冒烟提示上行空间很小），而是**只在 Instruct 答错的题上跑 Thinking**——
推理链如果有用，只可能用在那里；若在那里也修不回来，这个模式就可以关闭。
为此已加 `VM_ONLY_QUESTIONS`（见 ⑤）：276 题里只有 47 题答错，只跑错题
≈ **0.9h**，比全量省 83%。**该臂已按用户裁决（2026-10-09）取消，未运行。**

**⑤ 转写目录口径核对（2026-10-09 补做）——发现两处口径隐患**

跑 ④ 的「只跑错题」前先核对「拿哪个转写当基线」，结果查出两件事。

*(a) 两个转写目录内容不同，短档用的是有重复幻觉的那一份。*

| 目录 | 生成配置 | 文件数 | 用途 |
|---|---|---|---|
| `.scratch/keyframe-bench/asr/` | ctx-**on**（默认，跨段带上下文） | 92 | **短档全部臂** |
| `.scratch/keyframe-bench/asr_ctxoff/` | ctx-**off**（`condition_on_previous_text=False`） | 145 | medium 档全部臂 |

两目录同名文件 92 个中 **88 个内容不同**。差异是 ctx-on 的重复幻觉：
`asr_batch.py` 的文件头已记录「ctx-off 抽查最长重复 27→1」。
典型如 `-ApL8d6tX5U`：ctx-on 1225 字符 / 47 段，ctx-off 792 字符 / 37 段。
即短档的转写是**被重复循环污染的那一份**。

*(b) loader 臂的缓存键把转写来源标错了，而且指向的就是上面那份脏转写。*

`exp_loader_feed_qa.py` 的 `ASR_DIR` 指向 ctx-on 的 `asr/`，但缓存键里写死
`{"source": "asr-ctxoff-precomputed"}`，而函数 docstring 也自称「ctx-off engine output」。
**逐条核验**：缓存里 `asr` 标签等于该值的条目共 92 条，其中 **86 条经文本比对确认
实际是 ctx-on 内容**，其余 6 条两目录相同、不可区分，**0 条是 ctxoff**。

危害是**潜在但静默的**：缓存里存的是转写原文，键又由这个标签决定，
所以「把 `ASR_DIR` 改成 `asr_ctxoff/` 来纠正」不会生效——键不变 → 直接命中旧缓存
→ 继续用 ctx-on 转写；而且 loader 的「缺文件就大声跳过」守卫**不会触发**（缓存先命中）。
已改为**由 `ASR_DIR` 推导标签**（`precomputed:asr` / `precomputed:asr_ctxoff`），
并让 `ASR_DIR` 可用 `LFQ_ASR_DIR` 覆盖（此前写死，改目录要动代码）——
两者键不同，改目录即换缓存，不再有静默复用。

*对既有结论的影响*——**loader 裁决不受影响，但转写增益是下界**：

- 臂 1 的对比（`loader_block` 83.0% vs `uniform64_asr` 80.8%，b=10/c=4，p=0.1796）
  **两侧用的是同一份 ctx-on 转写**，头对头公平，裁决成立。
  注：`loader_block vs loader_interleaved` 恰好也是 b=10/c=4、同一个 p 值——
  两者是**独立算出来的巧合**，不是把同一个检验写了两遍。
- 「转写贡献 ~3pp」（`native_pure` 79.3% → `native_asr` 83.0%）是在**脏转写**上量的，
  故是**下界**；换成 ctx-off 后真实贡献只会更大。这条对生产选型是利好方向：
  若生产用 ctx-off，转写这一路的收益比文档现有数字更好。
- **跨档位不可直接比转写**：短档 ctx-on、medium 档 ctx-off，两档的「加不加转写」
  差额不同源。

*(c) 顺带验证：n=159 补跑是干净的父集扩展。*

medium 原档 84 题 ⊂ 扩样 159 题。greedy 解码下，若两次配置一致，
交集上的**逐题预测必须完全相同**。实测：

| 对照 | 交集 | 预测不同 |
|---|---|---|
| VL@VL（原档 vs 扩样） | 84 | **0** |
| Omni@Omni（原档 vs 扩样） | 84 | **0** |

两格都 0 差异 ⇒ 原档与扩样同配置（含转写目录、帧表、预算），
故正在跑的另两格补齐后，n=159 的 2×2 是**有效的父集扩展**，
而不是把两种配置混在一张表里。

**⑥ 对照卫生：`grab()` 臂与 loader 臂的输入分辨率不同（2026-10-09 发现）**

上一节 (b) 的分解过程中发现一个**系统性的对照问题**，不只是 Q41① 一例：

| 取帧通路 | 缩放 | JPEG | 典型帧尺寸 |
|---|---|---|---|
| `video_loader.load_video`（loader 臂） | **不缩放**，源分辨率 | `-q:v 2` | 640×360（Video-MME 源尺寸） |
| `bc.grab_frame` + PIL（所有 `VM_METHODS` 臂） | `scale=448:-2` | `-q:v 3` 再存 q88 | 448×252 |

即：**凡是「loader 臂 vs 方法臂」的对比，都同时换了时刻网格和输入分辨率**。
本次分解显示分辨率单独看无影响（网格相同的 48 题 Δ=0.0pp），故**已有结论不被推翻**；
但这是一个**应当显式声明的对照变量**，历史表格里凡未声明的都属口径不清。

*待办（未做）*：把 `grab()` 的 `size_w` 与 loader 对齐（或反之），重跑一条对照臂坐实
「分辨率无关」。当前只有 16 个视频 / 48 题的证据，且都来自 ≤64s 短视频。

**⑦ 控制变量纪律已成文（2026-10-09 用户裁决「以后都这么执行」）**

同一天又查出第三处同类混杂：**prompt 文本在两个脚本里各写了一份**
（`exp_videomme_qa.py` / `exp_qwen_omni_video.py`）。两份当时**逐字节相同**
（已核：带转写 1540 字符、纯视觉 316 字符，逐题 × 逐模式 2400/2400 一致），
故已有结果不受影响 —— 但「当时相同」不是保障，改一边忘一边不会有任何信号。

三处混杂（`max_pixels` 1.96×、`grab()` 分辨率、prompt 双份）的共同点是
**分数照常产出、混杂无信号**。落地纪律见 **spec D6**（`spec-keyframe-selection-391.md`）：
共享 prompt 模块 + 溯源必落盘 + 新增臂前先报控制变量表。

已交付：`bench_prompt.py`（prompt/转写/打分器单一事实来源，`PROMPT_VERSION`）、
`bench_provenance.py`（输入侧事实落盘，含 `prompt_version`）、
`probe_vl_omni_inputs.py`（VL/Omni 输入探针，`--match-budget` 拉平预算）。

**探针实测（2026-10-09，6 视频三档对照，链 `exp_probe_chain.sh` 17:40 跑完）**：

| 维度 | VL | Omni | 判定 |
|---|---|---|---|
| 帧数（三档全同） | 648/222/232/768/156/768 | 同左 | **6/6 完全相同**（采样默认一致：fps=2.0, min 4, max 768） |
| 视觉 token（各自预算） | 41472…44928 | 19440…23040 | **差 2.13×**，根因是自带 `max_pixels` 差 1.96× |
| 视觉 token（都拉到 25.1M） | 41472…44928 | **逐位相同** | ⇒ 预算维可完全对齐 |
| 视觉 token（都压到 12.8M） | **逐位相同** | 19440…23040 | ⇒ 双向都对得上 |
| prompt 字符串 | 256 字符 | 256 字符 | **逐字节相同** |
| 视频占位展开 | 324 段 × 15 占位，每段前缀 `<N.N seconds>` | 单段 4860 占位，无文本时间戳 | **机制不同，不可对齐** |

**prompt token 逐项分解**（本次新增，`prompt_tokens = 视觉/4 + 文本`）：

| 侧 | 视觉（合并后） | 文本残差 | 构成 |
|---|---|---|---|
| Omni | `vision/4` | **恒为 58** | 题目+选项，与视频长度无关 |
| VL | `vision/4` | **8.85–9.87 token / 时间块** | 58（题目）+ 时间戳文本 |

⇒ 预算拉平后**视觉 token 逐位相等，但 VL 的 prompt 仍恒定多出一段纯时间戳文本**：
每时间块约 9.4 token，占总视觉 token 的 **13.4%（78 块）→ 65.8%（384 块）**，
**视频越长占比越高**（块数随帧数涨，而每帧像素被预算压住）。

这不是 harness bug，而是**能力差异**：VL 能从文本读到绝对时间（`<324.9 seconds>`），
Omni 只能靠 M-RoPE 位置编码（`seconds_per_chunk`/`position_id_per_seconds`）。
两侧都是各自的官方口径（`processing_qwen3_vl.py:75` 注释明写「不加标记模型会把
运动看成静帧拼贴」），**不应为了对齐而改一侧处理器**。

⇒ **推论**：默认设置下的「VL 比 Omni 准」被分辨率预算混杂 —— VL 用自己的 25.1M、
Omni 用 12.8M，不是同条件。**该混杂已由 2×2 因子表覆盖**（见下方），
结论见 §Q41 补⑨⑩。


**⑧ 已有同预算对照盘点（2026-10-09 核）**

「是否已测过同一 max_pixels」——**已测，且是 2×2 因子表的设计核心**：

| 文件 | 模型 | 预算 | 模式 |
|---|---|---|---|
| `exp_videomme_qa_medium_qwen_native_asr.json` | VL | 自有 25.1M | native+转写 |
| `exp_videomme_qa_medium_qwen_native_asr_omnibudget.json` | VL | **Omni 12.8M** | native+转写 |
| `exp_videomme_qa_qwen_omni_video_medium_fpsfix.json` | Omni | 自有 12.8M | interleave |
| `exp_videomme_qa_qwen_omni_video_medium_maxpix.json` | Omni | **VL 25.1M** | interleave |

**注**：行内两格已对齐预算，但**行间（VL vs Omni）在默认设置下仍不同预算** ——
故「VL 比 Omni 准 7.1pp」这个说法要读成「VL 在自有预算下比 Omni 在自有预算下准」。
同预算的模型对比是 `VL@VL vs Omni@VL` 与 `VL@Omni vs Omni@Omni`。

---

### Q41 补（2026-10-09）：base 表作废 + 输入结构 + 有效清单 + 预算更正

**⑨ base 表（n=84）的 VL@Omni 格是污染格，整表作废**

base 表里「VL 预算效应 Δ=0.0pp p=1.0（VL 对预算不敏感）」与 ext 表的 +4.4pp 矛盾。
追根因：**`exp_q39_arm3.sh` 设了 `VM_ASR=1` 但漏设 `VM_ASR_DIR`**，
脚本回落默认目录 `.scratch/keyframe-bench/asr`（**ctx-on，短档专用，medium 覆盖 0/56**），
于是这一格**转写是空的**；其余三格都拿到转写。

证据链：

| 证据 | 结果 |
|---|---|
| `q39_arm3.log` | 无 `VM_ASR_DIR` 行，但有 `[max_pixels] video25165824->12845056` |
| 覆盖率清点 | `asr/` 对 medium **0/56**；`asr_ctxoff/` 对 medium 53/56（short 两者都 92/100） |
| 预测一致性矩阵（medium 84 题） | base `VL@Omni` vs ext `VL@Omni`：**11/84 不同**；其余三格 base vs ext：**0/84 不同** |

后一条是决定性证据：同配置同题，只有这一格变了，其余三格逐题一致。

**ext 表（n=159，全程 `VM_ASR_DIR=asr_ctxoff`）是唯一有效表**：

| 格 | 预算 | 正确 | 视频中位延迟 |
|---|---|---|---|
| VL | 25.1M | 113/159 = **71.1%** | 76.6s |
| VL | 12.8M | 106/159 = **66.7%** | 70.3s |
| Omni | 12.8M | 98/159 = **61.6%** | 31.9s |
| Omni | 25.1M | 106/159 = **66.7%** | 94.9s |

- VL 预算效应 Δ=+4.4pp（p=0.143）；Omni 预算效应 Δ=+5.0pp（p=0.152）
- 模型效应：VL@12.8M vs Omni@12.8M +5.0pp（p=0.256）；VL@25.1M vs Omni@25.1M +4.4pp（p=0.230）
- 交互 DiD **−0.6pp** CI[−8.8,+7.5]（base 表是 −7.1pp）⇒ 交互基本消失
- **四对比无一过 Bonferroni(0.0125)**

⇒ 修正后的读法：**两个模型都吃预算，幅度相近（+4~5pp，都不显著）**；
**VL 在两种预算下都领先 ~4-5pp（同样不显著）**。「VL 对预算不敏感」是污染格造成的假象。

**⑩ 预算-速度最佳点：VL 降预算在 base 配对上是纯赚**

> **⚠️ 2026-10-09 19:30 整节作废 —— 两侧都取自污染格。**
> 见 **§Q41⑲**。这里保留原文只为记录当时的推理路径。
base n=84 上 VL 两档预算**逐题配对**（同题、同 prompt、只换 `max_pixels`）：

| | 25.1M | 12.8M |
|---|---|---|
| 正确 | 60/84 = 71.4% | 60/84 = **71.4%** |
| 视频中位延迟 | 85.2s | **48.4s** |
| McNemar | b=5 / c=5（**完全对称**） | |

⇒ ~~**正确率一模一样、速度快 1.73–1.76×**~~（**作废**：12.8M 格转写为空，
延迟 49.3s 对比干净跑的 76.3s 快 1.55×，污染程度无法用「少 600 token」解释；
且四个文件来自四个不同日期，跨批次比延迟不成立）。
ext n=159 上 VL 降预算的代价是 −4.4pp（p=0.143，不显著）。


**结论（用户提问「VL 降预算找速度/结果最佳点」）**：

> **⚠️ 2026-10-09 19:30 更正**：下面第 1 条的「零代价提速 1.73×」**不成立** ——
> 该数字两侧都取自污染格（base 12.8M 转写为空），且四个文件来自四个不同日期，
> 延迟从未被受控测量。修正后的建议是**不动预算默认值**，完整论证见 **§Q41⑲**。
> 第 2-4 条仍然成立。

1. ~~**方向成立**~~：VL 自有预算是 25.1M，是四格里最慢的一格（76.6s）；降到 12.8M 后
   在 base 上是零代价提速 1.73×，在 ext 上是 −4.4pp（不显著）。**← 已作废**
2. **不要据此断言「12.8M 就是最佳点」**：预算效应点估计 +4.4pp 与 n=159 的功效
   （MDE 约 8-9pp）不匹配，**当前数据无法排除一个真实的 4pp 损失**。
3. **落地建议**：**保持 25.1M 默认**；`VM_MAX_PIXELS` 开关保留供实验用。
   预算轴在生产上根本不参与（生产走帧 → 图像处理器，无原生视频通路），
   无需为它做取舍。
4. **顺带**：12.8M 拉平后 VL 与 Omni 视觉 token 逐位相等（§Q41⑦），
   故「VL@12.8M」与「Omni@12.8M」是**同输入预算的干净模型对比**，
   差距 +5.0pp（p=0.256）—— 这是目前最干净的「VL vs Omni」数字。

**⑪ 同类静默的第三处：纯文本臂的「仅文本」名字当时是假的**

`exp_text_only.py` 是模态消融矩阵的「仅文本」格（零帧零音频，转写是唯一模态输入）。
它当时写死 ctx-on `asr/`，短档 **8/100 视频无转写** ⇒ 那 24 题的 `head` 是空串，
这一臂**静默退化成「只看题目」**，而报告里它仍叫「仅文本」。

| 分组 | 正确率 |
|---|---|
| 有转写（276 题） | 142/276 = **51.4%** |
| 无转写、静默退化（24 题） | 8/24 = **33.3%** |
| 报告值（混合两种口径） | 150/300 = **50.0%** |

⇒ 差异仅 **+1.4pp，结论不翻**，但口径是混的。**「转写贡献」类结论若引用该臂，
应改用 51.4% 这个仅覆盖子集的值。**

**⑫ 门禁已收敛为单一事实来源（三处臂共用）**

上述三处（VL 臂空转写、Omni 臂安静变小的分母、纯文本臂静默退化）是同一个
「缺失转写无信号」的三种投影。守卫实现已收敛到 `bench_prompt.check_asr_coverage()`
（`asr_coverage()` 返回 `(有转写的视频, 覆盖率)`），三处臂只做委托。

门禁语义：开跑前打印覆盖率；低于 `VM_ASR_MIN_COVERAGE`（默认 50%）**直接 SystemExit**
（低覆盖 = 跑错目录，是环境错误不是数据稀疏）；逃生开关
`VM_ASR_ALLOW_LOW_COVERAGE=1` 让有意为之的降级在命令行留痕。

**种植违规验证 8 例**（三处臂各测拦截/放行 + 逃生开关）：

| 用例 | 结果 |
|---|---|
| VL / Omni / 纯文本 臂 × medium + 短档 `asr/`（0%） | **三处均 exit 1** |
| VL 臂 × medium + `asr_ctxoff`（95.8%） | 放行 |
| 纯文本臂 × short + `asr_ctxoff`（89.0%） | 放行 |
| 逃生开关 × medium + `asr/` | 放行到下一步 |

**⑬ 预算默认值溯源：25.1M / 12.8M 都是官方值，转档未改**

拉官方仓逐字节核对（2026-10-09）：

| 模型 | 文件 | 字段 | 值 | 与本地 |
|---|---|---|---|---|
| `Qwen/Qwen3-VL-30B-A3B-Instruct` | `video_preprocessor_config.json` | `size.longest_edge` | **25165824** | **逐字节一致** |
| `Qwen/Qwen3-Omni-30B-A3B-Instruct` | `preprocessor_config.json` | `max_pixels` | **12845056** | **逐字节一致** |

三点口径澄清（此前文档只说「自带声明」，未说清是哪一层）：

1. **VL 的预算不在 `max_pixels` 字段里。** VL 的 `preprocessor_config.json` 该字段是
   `null`；真实预算是 `video_preprocessor_config.json` 的 `size.longest_edge`。
   是 mlx-vlm 的加载器把它映射过去（`mlx_vlm/models/qwen3_vl/processing_qwen3_vl.py:646`
   `if size.get("longest_edge") is not None: out["max_pixels"] = size["longest_edge"]`），
   探针里打印的「自带声明 max_pixels」就是这么来的。
2. **它是整段预算，不是每帧预算。** `transformers/models/qwen3_vl/video_processing_qwen3_vl.py:55`
   明写 per-frame pixels 被限制为 `min(max_video_tokens * factor**2, size["longest_edge"] / num_frames)`
   —— 只缩空间，**不减帧数**。这解释了探针里「帧数 6/6 相同、视觉 token 差 2.13×」。
3. **同一模型内图像路径是另一个值。** VL 的 `preprocessor_config.json`
   `size.longest_edge = 16777216`（16M）⇒ 探针打印的
   `{'video_processor': 25165824, 'image_processor': 16777216}` 即此。
   故「VL 预算」在说视频时必须指明是 25.1M 那个。

**⑭ VL 不用 TMRoPE：改用 Interleaved-MRoPE + 文本时间戳（源码直证）**

官方 README「Model Architecture Updates」第 3 条明写：

> **Text–Timestamp Alignment:** Moves beyond T-RoPE to precise, timestamp-grounded
> event localization for stronger video temporal modeling.

三处源码互证：

| 证据 | 内容 |
|---|---|
| `transformers/models/qwen3_vl/modeling_qwen3_vl.py:1483` | 注释 `# Overwritten -- Qwen3VL use timestamps and remove second_per_grid_ts` |
| `mlx_vlm/models/qwen3_vl/language.py`（t 轴索引） | `t_index = mx.arange(llm_grid_t)` —— **纯序号，无秒缩放** |
| `transformers/models/qwen3_omni_moe/modeling_qwen3_omni_moe.py:376,393` | `arange(grid_t) * second_per_grid * position_id_per_seconds` —— **保留秒缩放** |

即两侧的时间轴机制**根本不同**，不是同一算法的两种配置：

| | 位置编码 | 时间信息来源 | 秒参数 |
|---|---|---|---|
| Qwen3-VL | Interleaved-MRoPE（`mrope_interleaved=true`，`mrope_section=[24,20,20]`） | **文本** `<N.N seconds>` | 已移除 `second_per_grid_ts` |
| Qwen3-Omni | 同款 M-RoPE 结构 | **位置编码** | `position_id_per_seconds=13`、`seconds_per_chunk=2` |

⇒ 这是 §Q41⑦「VL 每时间块多 8.85–9.87 token 纯时间戳文本」的**源码级解释**：
VL 必须把时间写进文本，因为它没有秒缩放的 t 轴；Omni 不需要写，因为它的 t 轴带秒。
**两者不可对齐，且不应为对齐而改一侧处理器。**

**⑮ 有效对比清单（2026-10-09 收盘）**

**有效**（口径已核，未被已知混杂污染）：

| 对比 | 结果 | 显著性 |
|---|---|---|
| 短档：纯视觉 → +转写（VL 原生视频） | 79.3% → 83.0%（+3.6pp） | p=0.087（单臂不显著） |
| 短档：u64 抽帧 → 原生视频（都带转写） | 81.5% → 83.0%（+1.4pp） | p=0.503 |
| 短档：Omni 纯视觉 → +转写文本 | 78.9% → 81.9%（+3.0pp） | p=0.134 |
| 短档：VL 原生+转写 vs Omni+转写（跨模型） | 83.7% vs 81.9%（−1.9pp） | p=0.442 |
| 短档：波形直喂 vs 纯视觉（C1） | 79.3% → 33.3%（**−46.0pp**） | **p<1e-4** |
| 中档 ext 2×2（n=159，全程 `asr_ctxoff`） | 见 §Q41⑨ | 四对比均不显著 |
| Thinking 只跑错题（n=47，ctx-on 对齐基线） | 0/47 → **14/47**（+5.1pp 上界） | 达预登记阈值（§Q41⑱） |
| 探针三档输入结构（6 视频） | 见 §Q41⑦⑬⑭ | 确定性观测 |

**作废 / 降级**：

| 项 | 状态 |
|---|---|
| base 2×2 表（n=84）VL@Omni 格 | **污染格**（转写为空）⇒ 该格的「VL 预算效应 Δ=0.0pp」作废 |
| base 2×2 表其余三格 | 与 ext 逐题一致（0/84 差异），数字有效但已被 n=159 取代 |
| **「VL 降预算零代价提速 1.73×」** | **撤回**：两侧都取自污染格，且延迟从未受控测量（§Q41⑲） |
| 「仅文本」臂报告值 50.0% | 口径混杂；**有效值 51.4%**（仅覆盖子集） |
| 短档「转写贡献 ~3pp」 | 建立在 ctx-on 脏转写上 ⇒ 是**下界** |


**⑯ 第四次「默认值静默偏离」：排队脚本依赖默认值**

Thinking 错题臂（`exp_thinking_wrong.sh`）的注释写「不设 `VM_ASR_DIR`，
沿用默认 `asr/` 与基线对齐」。但当天 `VM_ASR_DIR` 的默认已改成 `asr_ctxoff`
（生产口径，见 §Q41⑤）⇒「沿用默认」**静默变成 ctx-off**，与基线错配，
而这一臂的设计前提正是「只换一个变量」。

影响面已核：47 题分布在 36 个视频，其中 **33 个视频**在 `asr/` 与 `asr_ctxoff/`
里内容不同（如 `-ApL8d6tX5U` 1225 vs 792 字符）⇒ 不是无关紧要的细节。

**覆盖率门禁抓不到这一类**：短档两个目录的覆盖都约 90%（92/100 vs 89/100），
都过 50% 阈值。门禁是「跑错到近 0% 覆盖的目录」的**地板**，不是「目录是否与基线
一致」的完整检查。完整防线是两条：

1. 排队脚本**显式**写 env，不依赖默认值（本次修正）；
2. 结果文件记 `asr_provenance`（今天已加），事后可与基线 diff。

⇒ 这是本 session 第四次遇到同一模式（前三次：`max_pixels` 1.96×、`grab()` 分辨率、
prompt 双份）。四次的共同点仍是**分数照常产出、混杂无信号**，但本次多一个变体：
**不是代码写错，是「依赖的默认值被改了」**。故 D6 纪律补一条：
排队脚本的环境变量一律显式写死，默认值只服务于交互式使用。

**⑰ 排队 watcher 无守护 ⇒ 臂静默不跑**

`exp_thinking_wrong.sh` 用「等 `pgrep` 判空」排队（等 ext 链结束）。日志停在
`09:24:09 waiting for ext chain`，ext 链 16:48 结束后本应自动开跑，但 watcher
进程已被回收 ⇒ 47 题臂**从未运行**，且没有任何信号——「安静地不跑」与
「安静地跑错」是同一类失败的两个投影。

修正：改用 `fireAndForget` 启动（进程归 harness 所有，跨 session 存活）。
已确认重启成功：`[asr] dir=.scratch/keyframe-bench/asr coverage=90/100`、
`300 -> 47 题`、`47 QA pairs in scope`。

**⑱ Thinking 只跑错题：14/47 修回，达预登记阈值（2026-10-09 19:26 跑完）**

预登记口径（写于运行前，见 `exp_thinking_wrong.sh` 头注）：
修回 ≥5 题 → 模式有净价值；1–4 题 → 收益与 1.40× 延迟不成比例；0 题 → 关闭。

| 项 | 值 |
|---|---|
| 修回 | **14/47 = 29.8%** |
| 对 276 题总分 | **+5.1pp**（**上界**，见限定 1） |
| 延迟 | 中位 **65.0s**，合计 0.86h |
| 解析层级 | 46 `strict` + 1 `loose` |
| 分布 | 12 个视频 |

**分层与预登记预测一致**：

| 子集 | 题数 | 修回 | 修回率 |
|---|---|---|---|
| 两模型皆错（MiniCPM u64 也错） | 32 | 5 | 16% |
| 仅 Instruct 错 | 15 | **9** | **60%** |

预登记写「47 题里 31 题连 MiniCPM 也错……这部分修不回来是预期内的；有信息量的是
那 16 题」——实测 32/15 与 31/16 几乎重合，且修回**集中在「仅 Instruct 错」的那半**。
⇒ 推理模式的价值集中在**「会做但没做对」**的题上，而不是「两模型都不会」的题上。

**两点诚实的限定**：

1. **+5.1pp 是上界。** 它假设 Thinking 在那 229 道基线正确的题上不产生回退；
   本臂按设计只跑了错题，故回退率**未测**。冒烟（6 题，其中 5 题基线正确）显示
   逐题预测与 Instruct 完全相同 ⇒ 小样本下回退率 0，但不足以定界。
   要坐实需再跑 229 题（约 4.4h）。
2. **2/47 输出极长**（7891、8227 字符），其中 `q217-2` 由 `loose` 路径取到字母、
   非真实作答（尾部停在 `…Chinese acrobats perform`，疑触 2048 token 上限）。
   两题本来都答错，故不影响本次计数，但记录在案。

**⑲ 更正：「VL 降预算零代价提速 1.73×」不成立（延迟从未被受控测量）**

§Q41 补⑩ 曾报「base 配对 VL 25.1M vs 12.8M：71.4% vs 71.4%、85.2s vs 48.4s、
b=5/c=5 ⇒ 零代价提速 1.73×」。该结论**两侧都取自污染格**，现更正：

| 文件 | 日期 | 状态 | 84 题交集正确率 | 同交集延迟 |
|---|---|---|---|---|
| base 25.1M | 10-05 21:46 | 干净 | 60/84 = 71.4% | 85.4s |
| base 12.8M | 10-09 02:32 | **污染**（转写为空） | 60/84 = 71.4% | **49.3s** |
| ext 25.1M | 10-07 11:11 | 干净 | 60/84 = 71.4% | 76.7s |
| ext 12.8M | 10-09 12:20 | 干净 | 58/84 = 69.0% | 76.3s |

三个问题：

1. **污染格快得不合理**：base 12.8M 在同题上 49.3s，而干净的 ext 12.8M 是 76.3s
   （**1.55×**）。空转写只少约 600 token，解释不了 27s 的差 —— 说明该格的延迟
   与正确率一样不可用。
2. **没有任何一对是同一批次跑的**：四个文件来自四个不同日期
   （10-05 / 10-07 / 10-09 凌晨 / 10-09 中午）。MLX 在笔记本上的墙钟受热状态、
   内存压力、后台负载影响很大，跨批次比延迟不成立。
3. **唯一干净的 ext 对比**（10-09 12:20 vs 10-07 11:11，仍跨批次）给出：
   76.2s → 67.1s = **1.14×**，代价是 **−4.4pp**（p=0.143）。

⇒ **修正后的建议：不动 VL 的预算默认值。** 理由是三条独立的：

- 正确率代价 −4.4pp 虽不显著，但点估计与 n=159 的功效（MDE ≈8-9pp）不匹配，
  排除不了一个真实的 4pp 损失；
- 速度收益**从未被受控测量**，现有数字从 1.0× 到 1.7× 都有，取决于跟哪一批比；
- **该轴在生产上根本不参与**：生产引擎是 MiniCPM，`vlm_analyzer.generate_response`
  的 MiniCPM 分支**没有原生视频通路**（docstring 明写「No native video — video
  callers pass ffmpeg-extracted frames as `image_paths`」），帧走的是**图像**
  处理器，而视频预算（25.1M / 12.8M）属于 `video_processor`。
  ⇒ 预算是「整片原生视频喂几百帧」这个 **bench 形态独有**的变量。

若日后确要量化，需要**同批次交替跑**的 A/B（不是「今天跑 A、明天跑 B」）。

**⑳ 剩余测试与时间估算（2026-10-09 收盘）**

| # | 待做项 | 性质 | 机器时间 | 说明 |
|---|---|---|---|---|
| 1 | **窗口臂**（生产实际形状） | **外部效度缺口** | **实现 1-2h + 跑 1.7h（短档）** | 见下方「为什么它是第一优先」；建议先只做短档 |
| 2 | Thinking 229 题回归 | 定界 | **≈4.1h** | 229 × 65s（错题臂实测中位）。把 +5.1pp 从「上界」变成实测值 |
| 3 | `grab()` 分辨率对齐臂 | 控制变量 | ~0.5h | 坐实「分辨率无关」；当前证据仅 48 题（Q41⑥） |
| 4 | 官方@64 帧对齐臂 | 控制变量 | ~1h | 分离「官方路径 vs 我方抽帧」与「帧数 64 vs 200」的混淆 |
| 5 | ~~#418 cpp large-v3 计时槽~~ | **已完成** | — | **#418 已于 10-09 12:25 关闭，四格矩阵全跑完**（见 §Q41㉒） |
| 6 | A1 转写接线 | 生产落地 | 依赖 #1 | 阻塞在「可用 ASR 路径」（#418） |

**为什么窗口臂是第一优先**：现有的三个 windows 脚本**都不做答题** ——
`exp_windows.py` / `exp_windows_cap.py` 只算几何（召回/冗余/盲区），
`exp_windows_e2e.py` 只测延迟与 token 成本（3 素材）。**没有一条 QA 结论
是在生产形状下测出来的。**

三种形状的精确对照（2026-10-09 逐行核 `asset-sourcer.mjs:1188-1233`）：

| | bench（现有 QA 结论） | **生产现状**（4 档，`asset-sourcer.mjs`） | 生产提案（§18.2，**未落地**） |
|---|---|---|---|
| 窗划分 | 整片单窗 | ≤8s：1 窗；8-30s：1 窗 0.5fps；**>30s：3 等分窗** | `n=ceil(D/248)` ⇒ **D≤248s 即 1 窗全片** |
| 窗长（93s 素材） | 93s | **31s × 3** | 93s × 1 |
| 单题总帧数 | **64** | **≤24**（3 窗 × 8） | **≤32** |
| 调用数 | 1 | **≤3** | 1（≤248s） |
| 覆盖 | 全片 | 全片（窗等分tile） | 全片 |

> 口径更正：本节初稿写「生产 = ≤30s 窗口 / 每窗 ≤8 帧」——**>30s 的窗长是 D/3，
> 不是 ≤30s**（93s 素材 → 31s/窗；1046s 素材 → 349s/窗）。「≤30s」只是 8-30s
> 那一档的单窗。每窗 8 帧则是对的（`sampleFps = min(1.0, 8/窗长秒)`，>30s 时
> 窗长 >10s ⇒ 恒为 8 帧/窗）。

⇒ 真正要测的差距是 **24 帧/3 调用（现状）** 与 **32 帧/1 调用（提案）**，
对比 bench 的 **64 帧/1 调用**。在窗口臂跑出来之前，bench 的 71-83%
**不能当作生产预期**；「转写 +3.6pp」「u64→原生 +1.4pp」也不知道
在 24-32 帧底盘下是否复现。

**时间估算依据**：§18.3 E2E 实测「3 调用 ≈ 22-24s/题」「1 调用 ≈ 21-23s/题」
（调用数对单题墙钟影响很小，省的是固定开销）。故：

| 档 | 题数 | 估算 |
|---|---|---|
| 短档 | 276 | **≈1.7h**（276 × 22s） |
| 中档 | 159 | **≈1.1h**（159 × 24s），但视频最长 1046s，解码时间可能推高 |
| 实现 | — | **1-2h**（新脚本，复用 `window_plan.py` + `bench_prompt.py`） |

合计 **跑 3-5h + 实现 1-2h**。建议**先只做短档**（1.7h，且短档是多数结论的所在），
看结论是否复现再决定是否补中档。

**优先级判断**：**#1 窗口臂 > #2 Thinking 回归 > 其余**。理由是 #1 直接决定
「bench 的 71-83% 能不能代表生产」，而 #2 只影响一个可选的推理模式开关。
#3-#5 都是补控制变量，价值在于把已有结论钉死，不改变方向。

**㉑ 生产档位实测：中长视频被严重饿死（2026-10-09，逐视频核算）**

按 `asset-sourcer.mjs:1188-1233` 的四档公式与 §18.2 提案公式，对真实素材逐视频核算：

| 档 | 素材 | 时长中位 / max | **生产现状帧数** | **提案帧数** |
|---|---|---|---|---|
| 短档 | 92 视频 | 80s / 131s | 中位 **27**，max 27 | 中位 **32**，max 32 |
| 中档 | 53 视频 | **546s / 1046s** | 中位 **24**，max **30** | 中位 **96**，max **160** |

最长的几个视频：

| 时长 | 生产现状 | 提案 |
|---|---|---|
| **1046s** | 3 窗 × 7 帧 = **21 帧**（帧间隔 **49.8s**） | 5 窗 × 32 帧 = **160 帧**（间隔 **6.5s**） |
| 894s | 3 窗 × 9 帧 = 27 帧（间隔 33.1s） | 4 窗 × 32 帧 = 128 帧（7.0s） |
| 877s | 3 窗 × 9 帧 = 27 帧（间隔 32.5s） | 4 窗 × 32 帧 = 128 帧（6.9s） |

**结论：生产档位对中长视频不合理，应当用 §18.2 提案替换。** 三条独立理由：

1. **破了自家验收线**。§18.1 验收 1 要求「最大盲区 ≤8s」，而生产现状在 1046s
   视频上是 **49.8s** 帧间隔 —— 超线 **6.2×**。§18.1 里 legacy24 的 12.50s
   已经在「破线」栏，但那是在 302s 长片上量的；真实中档视频更长，实际更糟。
2. **根因是 `MAX_SEGMENTS = 3` 这个硬顶**。`segments = min(ceil(D/8s), 3)`
   ⇒ 无论视频多长都只有 3 窗，窗长 = D/3（1046s → 349s），再按 8 帧/窗摊，
   间隔必然是 D/24。这是一个**对时长不设补偿**的公式。
3. **短档差异小、中档差异大**：短档 27→32 帧（+19%），中档 24→96 帧（**+300%**）。
   即该缺陷主要伤害中长内容 —— 恰是「长视频理解」最需要帧的地方。

**替换成本已测**：§18.3 E2E 显示提案的墙钟**不更贵**（3 调用 22-24s → 1 调用
21-23s，调用数对单题影响很小），生成 token 反而降到 1/2-1/3。

**㉒ #418 已关闭（10-09 12:25）——对本 session 的三条影响**

结论：**保留 whisper.cpp，不做运行时/档位变更**。对本 session：

1. **我列的「#418 cpp large-v3 计时槽」已作废** —— 该票自己跑完了四格矩阵
   （`asr_timing_matrix.json`）：cpp/turbo 5.13s、**cpp/large-v3 13.19s**、
   MLX/turbo 8.33s、MLX/large-v3 14.68s（cold wall 均值，各 n=8，ctx-off）。
   ⇒ 计时缺口已补，§Q41⑳ 的 #5 项划掉。
2. **我的重复护栏 `191e4ba4` 是该票的互补件，已合入并接线（2026-10-10）。**
   #418 结论②：「ctx-off 必要但不充分 —— 两边都关跨段上下文后仍会循环
   （最大重复 n-gram 到 9）。解码层参数在两个后端都不存在，护栏只能放在解码之后
   —— 后端无关的重复护栏已由另一 session 在 `191e4ba4` 交付」。
   **接线状态**：护栏先随 PR #445 合入 main（`19bfc960`），随后接到两个转写出口
   —— whisper.cpp 出口（`lib/asr-repetition-guard.mjs`，`transcribeVideo` 返回值带
   `guard` 字段）与装载层出口（`lib/asr_repetition_guard.py`，
   `transcript.repetition_guard`；loader 版本升到 2 使 v1 缓存失效）。
   **接线时实测的边界（147 份真实转写）**：单 token 循环收敛 10/147；多词短语
   循环判得出收不了 —— 生产 whisper.cpp 在 `0ag_Qi5OEd0` 上吐出的 FEMA 循环
   （488s / 17 段 / 仅 4 种文本）`contaminated=true` 而文本不变；`worst_run` 只统计
   最高频 n-gram，`7E6i3E-fsj4` 的 "Hard." ×20 因此漏判。三条边界用测试钉住
   （`__tests__/asr-repetition-guard.test.mjs`，含 Python ↔ JS 向量对照）。
   **同日规则扩展（2026-10-10，本 session）**：上表两条缺口已补 —— 收敛改为
   周期感知（单元 ≤16 词、重复 ≥6 次、跨度 ≥18 词，保留首次出现 + 标记），
   `worst_run` 改取所有 n-gram 的最大连续次数。148 份真实转写（145 MLX ctx-off
   + 3 whisper.cpp）复核：改写 17/148（旧判据 10/148），逐份人工核过全是解码
   循环；真内容 "Goal!" ×10 / "Bang," ×14 / "Thank you." ×8 因跨度 <18 词保留
   未动；FEMA 交错循环仍只判不改（VAD 领域）。JS ↔ Python 逐字段零分歧。
   loader 版本随之升到 3（v2 缓存里可能留着短语循环）。
3. **A1 转写接线的阻塞已解除**：ASR 路径问题（§Q41⑳ #6 的「依赖 #418」）
   已有定论（whisper.cpp + 新 `asr-preflight.mjs` Step 0.3 硬门禁）。
   另注：#418 的 backend 事实纠正 —— whisper.cpp **默认走 Metal**（不带
   `--no-gpu`），「cpp 走 CPU 不抢 GPU」不成立。


**㉓ 「窗口公式只有 MiniCPM 才有」是误解**

帧数公式是 `extract_frames`（`vlm_analyzer.py:611`）：
`n = max(1, ceil(span × fps))`，帧时刻 `start + k/fps`。它是**引擎无关**的。

关键在 `run_vlm_inference`（`:1205`）先 `normalize_windows(windows)`，再以
`start_ms/end_ms` 调窗口分支 —— 而窗口分支的注释明写
**「Windowed analysis — frame extraction (no engine can seek natively)」**，
即**给窗时两个引擎都抽帧**。只有**不给窗**的路径才分叉：

| 调用形态 | MiniCPM | Qwen3-VL |
|---|---|---|
| **有窗**（生产必走） | 抽帧 → `image_paths` | **同样抽帧** → `image_paths` |
| 无窗 | 抽帧 → `image_paths` | 原生视频 → `video_path` |

⇒ 生产的窗口问题是**两个引擎共有**的，不是 MiniCPM 独有。
Qwen 的「原生视频」优势只在无窗路径上存在，而生产**从不用无窗路径**。
这同时解释了为什么「官方预处理 vs 我们抽帧」在 bench 上只差 +1.4~2.4pp（不显著）：
bench 的 Qwen 臂走无窗原生通路，生产走有窗抽帧通路，**两者本就不同**。

> **2026-10-10 更新**：本节的前提（「生产必走有窗路径」）已被 #542 推翻——
> 引擎统一到 `native` 后生产不再建窗，原生通路的优势第一次成为生产事实。
> 本节保留为当时的口径快照。

**㉕ 引擎统一落地（2026-10-10，落地票 #542）——三条测量 + 一次裁决**

**① 生产口径的对照跑完了（Q41⑧ 缺口关闭）**。之前所有短档结论都建立在整片 64 帧
上，生产实际形状（`buildWindowPlan` → `extract_frames` 网格）从未测过。本轮补上：
`precomputed_prodwin.json` 逐视频materialise 生产时刻表（92 视频，中位 32 帧、最大
窗内间隔 4.08s、全为单窗），跑 MiniCPM 与 Qwen 两条臂：

| 臂（同 66 题） | 精度 | 每题墙钟 |
|---|---|---|
| **prodwin**（生产网格，MiniCPM） | 51/66 = 77.3% | 15.8s |
| **Qwen native**（原生 + 转写） | 59/66 = 89.4% | 63.1s |
| uniform32（Oct-4 臂，重跑） | 59/66 = 89.4% | — |

prodwin vs Qwen native：**Δ=+12.1pp，McNemar p=0.0215**，4.0× 慢。全 276 题上
生产口径类比（MiniCPM u32 无转写 76.1%）→ native+转写 83.0% = **+6.9pp，p=0.0094**。

**② 「生产 32 帧形状被饿死」这个读法不成立**。prodwin 与 uniform32 都是 32 帧网格，
却差 12pp；uniform32 重跑**逐题复现**（66/66 相同 ⇒ 解码确定，不是抖动）。于是造了
相位扫臂（同窗、同 step=L/b，网格整体平移 φ 个间隔）直接量相位敏感度：

| 臂（同 66 题，MiniCPM） | 精度 | 末帧位置（中位） |
|---|---|---|
| prodwin ≡ φ=0 | 51/66 = **77.3%** | 0.969·D |
| phase75 | 53/66 = 80.3% | 0.992·D |
| phase50 | 54/66 = 81.8% | 0.984·D |
| phase25 | 55/66 = **83.3%** | 0.977·D |
| uniform32（D/31，含两端点） | 59/66 = **89.4%** | 1.000·D |

两条硬事实：**prodwin 与 φ=0 的时刻表逐视频完全相同（92/92）**，所以 prodwin 就是
相位族在 φ=0 的一次抽样；**相位族内部两两 McNemar 全不显著**（p=0.34–1.00），族内
跨度 6pp。唯一显著的对比仍是 prodwin vs uniform32（p=0.0215），而后者是**唯一覆盖
片尾**（末帧 = 1.000·D）的臂。

⇒ 修正后的结论：**帧网格的精度对「帧落在哪」敏感（相位 + 尾部覆盖），幅度与我们要
检测的效应同量级；「帧数不足」不是证据支持的解释**。这也是统一到原生采样的一个
正面理由——原生路径没有可调的网格相位，采样由库按整段 linspace 决定，端点在覆盖内。

**③ 生产落地面**（#542 交付）：`vlm-model.json` 引擎改 `qwen3-vl-moe` + 每引擎声明
`videoInput`（`native`/`frames`，两侧加载时 fail-fast）；`asset-sourcer` Phase 2.5
只在 `frames` 时建窗；**A1 转写接线**（`transcribeVideo` → `opts.transcript` →
`build_semantics_prompt`，口径与 bench `block` 模式逐字一致，转写进缓存键）；
`sourceMode` 新增 `native`；`transcriptChars`/`transcriptGuard` 进产物。装载层生产
调用者归零（`extract_frames` 仅 `frames` 引擎可达），保留为回退 + 引擎契约。逐项
审计（用户 2026-10-10 裁决：全部保留、只记事实）：

| API / 能力 | 生产调用者 | bench / 测试 |
|---|---|---|
| `load_video` | `extract_frames`（仅 `frames` 引擎或带窗请求） | `test_video_loader.py` |
| `load_video` 的 `cache_dir` / manifest 缓存 | **无**（生产调用只传 `frame_times` + `want_audio: False`） | 测试 |
| `load_video` 的 `asr` / `asr_runner` 转写通道 | **无**（转写走 JS `transcribeVideo`） | 测试 |
| `to_text_interleaved` | **无** | 测试 |
| `frames_with_text` | **无** | `exp_loader_feed_qa.py` |
| `to_minicpm_units` | **无**（单元路线实测无增益且慢 5-10×） | `exp_omni_units_qa_official.py` / `exp_omni_units_qa_loader.py` |
| `to_qwen_omni` / `process_qwen_mm_info` | **无**（Omni 交织贡献≈0） | 测试 |

保留的理由：`frames` 引擎（`--engine minicpm`）仍是可选的回退路径，装载层是它的
解码入口；四组适配器是「引擎契约」的实测证据，删掉后重测要重写。**下次动它之前先
确认 `--engine minicpm` 已无人使用**——那时整块可以一次性退役。

**③b 真实数据冒烟抓到的一个生产阻断（同票修掉）**：进程池默认
`VLM_CONCURRENCY=2` 是给 5GB 的 MiniCPM 定的；换成 17GB 的 Qwen3-VL 后
**两个实例（34GB）在 32GB 机器上触发 Metal OOM**
（`kIOGPUCommandBufferCallbackErrorOutOfMemory`，第二个 worker 的 warmup 死掉），
而失败是**静默降级**——两个资产的描述都变空串，退出码 0。修法同 L1：把
`concurrency` 也变成引擎声明（qwen=1 / minicpm=2，`VLM_CONCURRENCY` 仍可覆盖），
加载时 fail-fast。冒烟复跑（无 env 覆盖、缓存禁用）：两个视频全 PASS，
墙钟 155.9s（含模型加载），无 OOM。教训与 Q41 系列一致：**换引擎要连带换它的
资源事实，不能只换权重路径**。

**④ 引擎决定后失效的可选臂（不再做）**：

| 臂 | 为何不再做 |
|---|---|
| 对齐 `grab()` 与 loader 的输入分辨率（Q41⑥） | 分辨率在 Q41① 已被证伪（网格逐值相同的 16 视频 Δ=0.0pp），帧网格整体退役后无对照意义 |
| 官方预处理 @64 帧 | 「官方 vs 我们抽帧」的两条通路之一（抽帧）退出生产；同模型内差异本就只有 +1.4~2.4pp（NS） |
| Thinking 229 道基线正确题的回退率（Q41⑱） | 用户已决定不用 Thinking；回退率只对「是否采用」有意义 |

仍然开放：**#540**（whisper 重复循环的业界处置：VAD 门控 / 解码参数 / 检测判据 /
下游处置——护栏现状是「判得出、收不了」）；短档 8 缺盘视频补下载（只为未来满 100
视频臂）；medium 补题到 200+（n=159 功效已翻倍）。






---

## 附录 · 2026-09-27 原始 deep research 原件（历史起点；判断以一页纸与 §20 为准）

## Deep Research: VLM 长视频关键帧选帧（TMRoPE walk around）与 focus_detector 升级评估

> 2026-09-27 · Session `20260926-360-long-video-ce7702` · 触发：用户要求 web deep research 验证 HANDOFF §二.5/§三.5（mlx_vlm #294 ffmpeg scene detection 选帧）的时效性与可靠性，连带评估 `focus_detector.py` 是否需要优化。

### Executive Summary

对 MiniCPM-o 4.5（mlx_vlm 0.7.2，本机 M2 Pro）长视频语义分析中的帧采样问题做了三线验证：一手 issue 考古、官方文档/论文、本机源码与真素材冒烟。结论一：**mlx_vlm Issue #294 的 ffmpeg scene detection 配方不是"社区验证的方案"**——它是提问者 tmoroney 自己的既有做法（2025-04-11 发布，2025-04-23 后无活动，closed 无人采纳），maintainer 只回了模型推荐，配方没有任何对比基准。HANDOFF 中"社区验证有效"应降级为"社区分享、无数据"。结论二：但**轻量信号选帧的方向本身是对的**——CVPR 2025 起的学术工作（AKS 等）一致把 naive uniform sampling 当作要打败的基线，且都强调 temporal coverage；对本项目"无 query 的素材语义描述"场景，场景切换信号 + 时间覆盖兜底是性价比最高的一档，神经选帧（AKS/M-LLM 选帧）属于过度设计。结论三：**本地实测配方可行**——30s 真素材 0.36s 选出 11 帧（6 次场景切换 + 首帧 + 每 8s 兜底，行为与设计吻合），零新依赖。结论四：`focus_detector.py` 的 Haar Cascade（2001 年 Viola-Jones 系）有零依赖升级路径——OpenCV 官方实证 YuNet（FaceDetectorYN）全面优于 Cascade，本机 `~/.video-tts-env` cv2 4.14.0 已内置，仅需下载 opencv_zoo 的 YuNet onnx 模型（~345KB，MIT，repo 活跃）。另注意：`~/.venvs/mlx-vlm` 的 cv2 已是 5.0.0 且 **saliency 模块消失**——focus_detector.py 必须钉在 video-tts-env。

### Key Findings

1. **#294 考古（用户问题："294 是多久以前的 issue 了？"）**：Blaizzy/mlx-vlm#294，2025-04-11 创建，2025-04-23 最后评论，closed，4 条评论。[Tier 1：GitHub API 原文] 内容是 tmoroney 征询 <1B 视频 captioning 模型推荐，ffmpeg 关键帧提取只出现在他自己的代码里（`select='gt(scene,0.08)+eq(n,0)+not(mod(t,8))'`，cap 6 帧）；Blaizzy 的回复全是模型推荐（Qwen2.5-VL 3B / InternVL3 1B&2B / NanoLlava / 4bit vs 8bit），**未对选帧配方表态，也未采纳任何选帧 PR**。配方自带 max_frames=6 是为 2B 模型省算力，不适用我们的 8B 场景。**"社区验证有效"不成立，最多算"社区分享"。**

2. **但"均匀采样是下界"有学术共识**：AKS（CVPR 2025, arXiv:2502.21271）明确以 uniform sampling 为基线做 query 相关性 + temporal coverage 的 split-and-judge 选帧；M-LLM Based Video Frame Selection（CVPR 2025, arXiv:2502.19680）与 From Frames to Clips（arXiv:2510.02262, 2025-10）、Focus（arXiv:2510.27280, 2025-10）同路线。共同点：(a) uniform 采样对静态/低密度视频浪费帧预算；(b) **temporal coverage 必须显式保证**（这正是 scene-detection 配方里 `not(mod(t,8))` 兜底帧的作用）；(c) query-aware 神经选帧收益最大但需要额外打分模型——我们的素材描述场景无 query，收益打折。**结论：轻量信号选帧 + 覆盖兜底是本用例的正确档位；AKS 类方法记为远期候选。**

3. **帧率/帧数配置（用户问题："考虑下 2fps 1fps 的配置"）**：MiniCPM-V 4.5 官方文档（OpenBMB，Tier 1）给出 3D-Resampler：6 帧 448×448 联合压缩成 64 token（96× 压缩），**LLM 侧 token 成本不随帧数线性涨**，官方主打 high-FPS（up to 10FPS）视频理解；官方视频 demo 传统配置 `MAX_NUM_FRAMES=64`（≈1fps）。视觉 encoder 成本仍随帧数线性（SigLip2 每帧一次）。本机 mlx_vlm 0.7.2 源码（video.py:68-103）：`subsample_evenly` + 默认 `max_frames=16`（≈2fps@8s 窗口），比官方保守 4×。**实验矩阵应含 策略∈{uniform, scene-detect} × cap∈{16,32} × fps∈{1,2} 的组合，实测质量/时延曲线后决策。**

4. **配方本地实证（proposal-review 双源之本地侧）**：content_ABCx2_30s.mp4（HANDOFF 真素材）上 `select='gt(scene,0.08)+eq(n,0)+not(mod(t,8))'` + 480p 下采样，**0.36s wall-clock 选出 11 帧**（约 6 切换 + 1 首帧 + 4 兜底，与素材结构吻合），176KB mjpeg。ffmpeg 为管线既有依赖，`select` V->V 滤镜存在。零新 pip 依赖，CPU 完成。

5. **focus_detector.py 优化评估（用户要求"连带看下"）**：现状 = Haar Cascade `haarcascade_frontalface_default.xml`（focus_detector.py:115-116，Viola-Jones 系，2001）+ Static Saliency Spectral Residual。OpenCV 官方博客（opencv.org, 2022-11, Tier 1）实证 **YuNet（FaceDetectorYN）在准确率/鲁棒性上全面优于 Cascade Classifier**（侧脸、小脸、光照）。本机事实：`~/.video-tts-env` cv2 4.14.0 **已内置 FaceDetectorYN**（零 pip 新依赖），模型文件来自 opencv/opencv_zoo（MIT，活跃：pushed 2026-05-28），face_detection_yunet onnx 约 345KB 一次性下载；`saliency` 模块同 venv 可用。**升级路径低风险**：YuNet 输出带置信度与 5 点 landmark，可平滑替换 Haar 调用点。**风险**：`~/.venvs/mlx-vlm` 的 cv2 已升 5.0.0 且 **saliency 模块缺失**——focus_detector.py 必须钉在 `~/.video-tts-env`（现状即如此，AGENTS.md 注记需更新防误配）。

### Contrarian Views & Risks

- **scene threshold 0.08 未必跨内容鲁棒**：talking head（渐变光照/微动作）可能整段低于阈值只剩兜底帧；高速运动素材可能帧数打满 cap。0.08 是 tmoroney 为其素材调的值，无公开敏感度分析——实验须覆盖 talking head / 高密度两类素材各至少一个。
- **MiniCPM-o 无时序训练**：换关键帧喂入不会让它"理解"时序（HANDOFF §二.5 结论仍有效），选帧只是提升"每帧信息密度"。时序理解仍靠 #360 分窗 + 未来 Qwen3-VL 路线，不要在选帧上过度投资。
- **给帧配时间戳文本标记是否有效未验证**（MiniCPM-o 没学过时间戳 token）——列为 open question，实验不做此项。
- YuNet onnx 是新引入的模型文件（~345KB）：走 model-sources 准入（license MIT / opencv_zoo 活跃 / 原始仓库即官方），入库 `scripts/short-video/models/` 或跟随 content 目录需再定。

### Open Questions

1. scene_threshold 对本项目素材分布（新闻播报 / 实拍 / 屏幕录制）的最优值——实验产出敏感度数据后再定，不预设 0.08。
2. cap=32 时 vision encoder 时延增幅是否被 LLM 侧 3D-Resampler 抵消（官方称 token 不涨）——实验测端到端时延曲线。
3. focus_detector.py 的 saliency 输出是否值得同时升级（SSR → 深度显著性）——当前文本保护区用途下 SSR 够用，暂不动。

### Sources

1. https://github.com/Blaizzy/mlx-vlm/issues/294 — 原文与评论，配方出处与未采纳证据 — Tier 1
2. 本机 `~/.venvs/mlx-vlm/.../mlx_vlm/generate/video.py:68-103` — subsample_evenly / max_frames=16 默认 — Tier 1（代码源）
3. 本机 `~/.video-tts-env` cv2 4.14.0（FaceDetectorYN/saliency 可用）与 `~/.venvs/mlx-vlm` cv2 5.0.0（saliency 缺失） — Tier 1（代码源）
4. https://opencv.org/blog/opencv-face-detection-cascade-classifier-vs-yunet/ — OpenCV 官方对比博客 — Tier 1
5. https://github.com/opencv/opencv_zoo — YuNet 模型来源，活跃维护 — Tier 1
6. https://github.com/OpenBMB/MiniCPM-V/blob/main/docs/minicpm_v4dot5_en.md — 3D-Resampler / high-FPS 官方文档 — Tier 1
7. https://arxiv.org/abs/2502.21271 — AKS, CVPR 2025 — Tier 1（同行评审）
8. https://arxiv.org/abs/2502.19680 — M-LLM Based Video Frame Selection, CVPR 2025 — Tier 1（同行评审）
9. https://arxiv.org/html/2510.02262v1 — From Frames to Clips, 2025-10 — Tier 1（预印）
10. https://arxiv.org/html/2510.27280v1 — Focus keyframe selection, 2025-10 — Tier 1（预印）
11. 本地冒烟：content_ABCx2_30s.mp4 0.36s/11 帧（本 session 实测） — Tier 1（实验）
12. `.scratch/len-compare/HANDOFF.md`（361 worktree）— 前序基准与配方引入处 — Tier 1（内部）
