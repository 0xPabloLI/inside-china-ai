# Deep Research: FastMetal-5B-QAD 升级候选核查（#298 B-roll T2V 画质升级）

> 调研日期：2026-09-25（Standard 档：SCOPE → PLAN → RETRIEVE → TRIANGULATE → SYNTHESIZE → PACKAGE + 本地代码验证轨）
> 触发问题：#298 阶梯第一档「本地 MLX 更大模型」应下谁？FastMetal-5B-QAD（19.5GB）是否值得下载？FastMetal-14B 在 32GB M2 Pro 上有无可行性？
> 关联：#298（Dominant）、#157（dormant，质量档横评先例）、#290（文字场景并入）、open-source-video-generation-landscape-2026.md

## Executive Summary

FastMetal-5B-QAD 是当前唯一同时满足「本地可跑 + 明确画质跃迁 + 零成本」的 1.3B 升级路径。官方基准（M4 Max 36GB）：720p（704×1280×81f）端到端 151.4s、**峰值仅 9.34 GiB**——在 32GB M2 Pro 上内存余量极大，带宽折算预估 5-8 分钟/条，与现役 1.3B 出 480p 的耗时同量级。官方三档定位中 5B 就是"Mid — 720p"档，16GB+ 即可跑。

FastMetal-14B-QAD 官方峰值 21.68 GiB（480p）：32GB 机可用约 24-26 GiB，**数学上放得下但无任何 32GB 用户实证**（官方目标 36GB+；24GB 机官方明确放不下）。且 M4 Max 上都要 602s/条，M2 Pro 估 25-30 分钟/条。结论：14B 不是本次下载对象，留作 5B 画质不足时的有界试验（跳过 EMA 副本 ~27GB）。

社区独立实测出现一个重要反方信号：CSDN（M1 Max 64GB）四段横评认为"1.3B 成片更干净"，但作者自述 5B 被压到 448×832 低于原生分辨率跑——恰是官方定位中 5B 优势（720p 原生）释放不了的跑法。矛盾可调和，同时把评测设计定死：**5B 必须在原生 704×1280 评，不得与 1.3B 在 1.3B 的原生分辨率下比**。

代码验证轨确认了集成暗坑：5B 入口 `mlx_wan22_generate.py` 是单发脚本（无批量模式）、T2V-only（I2V 未接 MLX 路径）；taehv 解码器权重 `taew2_2.pth` 首次运行用裸 urllib 从 GitHub 拉取（sha256 校验、缓存 `~/.cache/fastvideo/taehv/`），**不受 `HF_HUB_OFFLINE=1` 约束但离线时必挂**——下载权重时须一并预取该文件。

## Key Findings

1. **5B 内存与速度对 32GB 机器友好（High，官方 Tier 1 + 官方 M5 Air 旁证）**。官方 M4 Max 36GB：5B 720p 端到端 151.42s / 峰值 9.34 GiB；fast 模式 47.24s / 7.97 GiB。官方在无风扇 M5 Air（24GB，10 核 GPU）复测：5B baseline 200.1s / 峰值 9.54 GiB——内存与 Mac Studio 相差几百 MiB，只慢 1.3-2x。M2 Pro（200GB/s 带宽，介于两者之间偏弱）估 5-8 分钟/条 [1]。
2. **14B 官方数据：画质最强档但本机边缘（High 官方数据 / Low 本机可行性）**。480×832×81f 端到端 601.82s、峰值 21.68 GiB（M4 Max 36GB）。官方原话：峰值"close enough to a 24 GB Mac's real ceiling that we target it at 36 GB and above"。32GB 机总 29.8 GiB、扣系统约 24-26 GiB 可用，数学上可容纳 21.68 GiB 峰值，但无社区实证、且预估 25-30 分钟/条 [1]。
3. **5B 与 1.3B/14B 不是同一入口（High，代码验证 Tier 1）**。5B（Wan2.2 潜空间几何 + 48 通道 VAE + timestep conditioning 不同）走 `mlx_wan22_generate.py`：`--mlx-checkpoint / --text-encoder-root / --vae-root`，**没有 `--model-root`**；1.3B/14B 走 `mlx_wan_prompt_to_video.py`。现役 `lib/b-roll/mlx_wan_batch.py` 直接 import 了后者的 helper，**5B 不是换权重 drop-in，需要移植 batch driver**（swap 加载器为 `mlx_wan22_dit_from_mlx_checkpoint`、采样器为 `sample_wan22_dmd` + `build_wan22_dmd_schedule`）[2][3]。
4. **5B 入口是 T2V-only，I2V 未接（High，代码验证）**。`mlx_wan22_generate.py` 无任何 image-ref 参数；MLX `wan22.py` 模块头注释说明了 I2V 机制（首帧 latent 替换 + t=0），但入口脚本从未调用该路径。官方博客亦把 image-to-video 列为 "next step"。支持矩阵里 "TI2V 5B I2V 有质量问题" 是 docs-only 注记，无 issue/代码上下文，且只涉及 CUDA 路径 [1][2][3]。
5. **社区独立实测的反方信号及其局限（Medium，Tier 3 单源）**。CSDN（M1 Max 64GB）实测 5B 跑通但四段横评"1.3B 成片更干净、更贴合预期"；作者自行列出四点成因，其中关键是 5B 被压到 448×832/480×832 低于原生 704×1280、以及 fast 模式下 RIFE 占比过大导致边缘偏软。该文不是严格基准（提示词/分辨率/模式均不一致），且与官方"5B 是 720p 中端档"的定位不矛盾——**分辨率匹配是 5B 出画质的前提** [4]。
6. **集成暗坑：taew2_2.pth 预取（High，代码验证）**。taehv 解码权重不在任何 HF 仓库内，首次运行从 `raw.githubusercontent.com/madebyollin/taehv` 裸 urllib 下载（sha256 钉死 `d053e216…74c559a`），缓存到 `~/.cache/fastvideo/taehv/taew2_2.pth`；可用 `--taehv-checkpoint-path` 指定。无 `HF_HUB_OFFLINE` 守卫——离线且未缓存时直接抛异常。管线 runner 默认 `HF_HUB_OFFLINE=1`，**必须预取** [3]。
7. **吞吐面口径差异（High）**：5B 默认 121 帧 @24fps（≈5.04s），现役 1.3B 链路 81 帧 @16fps（≈5.06s）——时长相当但帧率/帧数不同，对比时按"成片时长"对齐而非帧数。5B flow-shift 5.0，1.3B 是 8.0（各自入口默认即发布配置，不跨模型套用）[1][3]。

## Detailed Analysis

### 三角化：官方与社区结论如何调和

官方博客给出清晰的分层定位（1.3B=最快 / 5B=720p 中端 / 14B=最强画质）与完整基准表，但其对比图在同一 prompt 下跨档展示，未见"5B 在低分辨率下反而不如 1.3B"的官方说法。CSDN 实测提供了唯一的独立第三方数据点：跑通性（5B 在 M1 Max 上 252.59s 出片，其中 DiT 去噪仅 33.0s、RIFE+VAE+导出约 187s）、内存（进程 RSS 峰值 19.34 GiB 含 UMT5 常驻——**高于官方 MLX 峰值口径**，因他把编码器留在内存）与画质反直觉（低分辨率下 1.3B 更稳）。两源在"5B 必须原生分辨率"上其实一致：官方从未宣称 5B 在 448×832 占优，CSDN 作者把低分辨率列为第一条成因。可信结论：5B 的画质跃迁以 704×1280 原生分辨率为前提，这正是我们管线可用的（竖屏 9:16 类）。

### 14B on 32GB 的可行性账

官方 21.68 GiB 峰值是 MLX 去噪段口径（`mx.reset_peak_memory` 之后）；CSDN 实测提示进程整段 RSS 会更高（UMT5 12.4GB 若常驻）。我们现役 batch 脚本的内存编排（先 UMT5 编码→释放→再载 DiT）与官方"memory choreography"同构，5B 入口亦是 encode→load→denoise→del+clear_cache→decode 的分阶段设计。32GB M2 Pro 若关掉大内存占用进程，21.7 GiB 峰值应可容纳，但换页抖动风险真实存在；且 480p 单条 25-30 分钟意味着评测矩阵成本是 5B 的 4-6 倍。裁决：**不随本次下载**；5B 画质不足时再做「跳过 EMA（-15.2GB）有界单条试验」。

### 评测矩阵设计要点（精简版，用户已裁决）

- **对齐维度**：复用既有 `b-roll-report.json` 的真实 prompt + seed（如 `ant-lingbot-world-13b` scene-2/3/4/5），覆盖 triage 要求的三场景族（科技概念背景 / 人物访谈剪影 / 文字数据展示）。
- **5B 原生 704×1280，帧数按发布配置 121f@24fps**（5.04s，与 1.3B 成片时长对齐——执行口径见评测报告；81f 亦为合法配置但非本次评测所用，官方基准表为 81f 是因为其对比在同一时长约束下做）。1.3B 基线用既有样片，不重跑。
- **评分**：`lib/b-roll/gate.mjs` 纯函数（`scoreCandidates`/`pickWinner`）+ `lib/visual-analyzer.mjs`（Qwen3-VL-8B）同一评分器打两侧；维度对齐 T2I 横评模板（prompt adherence / visual quality / B-roll suitability / defects）。PSNR 对比器（`mlx_wan_video_quality.py`）仅当需要同分辨率逐像素时作补充，跨分辨率下无意义。
- **过程记录**：每条记录 prompt encode / denoise / decode 耗时与峰值内存（`mx.reset_peak_memory` 口径），换算 RTF。

### 工程量评估（若 5B 胜出）

port `mlx_wan22_batch.py`（复用现役 batch 的 warm-up/预编码/延迟解码骨架 + wan22 加载器/采样器）、runner 增加后端选择（`BROLL_T2V_BACKEND=fastmetal-5b` 之类）、orchestrator `assignWinner` 标签动态化、`EST_SECONDS_PER_CLIP` 按 5B 实测重校。属 R3 管线路径，走完整 verification gate。

## Contrarian Views & Risks

- **CSDN 反方**：5B 低分辨率下不如 1.3B——规避方式是原生分辨率评测；若 5B 在原生分辨率仍不达预期，这条反方证据就从"跑法问题"升级为"档位问题"，届时直接跳 14B 有界试验或云端档。
- **3-step DMD 蒸馏的文字渲染风险**：#290 的痛点是数字/文字场景。蒸馏小模型普遍文字更差，5B 大概率仍不能渲染可读文字——文字数据场景的期望应放在"背景更干净"而非"文字可读"（官方 5B 训练集是 Wan2.2-Syn 合成数据，无 OCR 强化证据）。
- **单源社区数据**：5B 独立实测只有 CSDN 一篇（415 阅读）。画质结论主要靠我们自己的 VLM 评分矩阵兜底，社区口碑只作跑通性旁证。
- **磁盘**：5B 19.5GB + 预取文件，606GB 可用无压力；但 14B 若未来加入再 +27GB。

## 补充查证（2026-09-25 用户追加问题）

### HunyuanVideo 有无 MLX 版？——无

HF API `search=hunyuan video mlx` 返回**空**；SearXNG 全网广扫（211 结果，quark 引擎挂外其余健康）命中的 Mac 玩法全部是 ComfyUI/MPS 路线（YouTube workflow 帖、HF discussion「Can you run it on mac?」）——非 MLX 原生，速度不可用。混元 1.5（8.3B，SSTA 架构）维持 landscape 结论：质量梯队更高但 **CUDA-only，Mac 本地无门**，归云端档 [6][7]。

### FastH3 有无更小版本适合 32GB？——没有，反而更大

FastH3 基于 **MiniMax-H3 33.1B**（BF16 transformer 13 分片 ≈ 33GB，text encoder 是 Qwen3-VL-32B 官方 14 分片）——比 5B 大一个数量级，不存在「小杯」[8]。官方 MLX-INT4/INT6/INT8 仓库确实存在（`FastVideo-FastH3-4-step-Preview-v1-Dense-DataFree-MLX-INT4` 等，2026-09-01），但文件清单只有 `mlx_h3_dit.json` + `conversion_manifest.json`——**是转换清单仓库，不是可运行权重**（对应支持矩阵 "source runtime + local DiT conversion"）；且为 preview 质量档、许可为 `minimax-h3-community-license-agreement`（**非 Apache**；大陆在许可区内但年营收 >$20M 商用须书面授权、产品 UI 须署名，详见下文许可节）。32GB 本地生产采用：不合适，不进入候选。

### 5B 相比 1.3B「内容种类」有无增加？——模式无增加，具体内容还原能力应提升

生成模式两者相同（prompt→5s 竖屏 T2V，I2V 均未上 MLX 路径），没有新增内容类型。但「只能生成抽象视频」的体感是 1.3B 容量 + 480p 分辨率的复合结果：5B 容量 4 倍、Wan2.2 代、训练集为 720p 合成数据（`FastVideo/Wan2.2-Syn-121x704x1280_32k`），对具体主体（人物/产品/场景物件）的语义还原能力应显著更好 [1][2]。定量答案由评测矩阵的真实实体 prompt + VLM 语义匹配分给出。注意：「生成的 B-roll 与场景不相关」的另一半问题属匹配层（#294/#297），模型升级只解决「质量差」那一半。

### taew2_2.pth 是什么？——TAEHV 视频解码器权重（Wan2.2 48 通道版）

DiT 去噪在压缩潜空间进行；TAEHV 解码器负责把潜空间帧还原为像素帧（替代大体积的 Wan VAE 全量解码，MIT 许可、几百 KB 级）。FastVideo 内置解码器**代码**，但 Wan2.2 版**权重**（`taew2_2.pth`）首次运行时从 `raw.githubusercontent.com/madebyollin/taehv` 下载（sha256 钉死 `d053e216…74c559a`），缓存于 `~/.cache/fastvideo/taehv/` [3]。管线 runner 默认 `HF_HUB_OFFLINE=1`，故该文件必须随模型预取，否则离线首跑必挂。

### 混元 MLX 社区追踪（2026-09-25 二次查证）：无时间表、无在途移植

- HF 官方讨论帖 `tencent/HunyuanVideo#13`（2024-12 → 2025-04）全程无官方回复：Mac 可行路径只有 ComfyUI MPS/GGUF——128GB M3 Max 跑 73 帧约 60 分钟；32GB 机 GGUF 量化 12 步能跑（~31GB 内存）但低步数低质量；第三方 `gregcmartin/HunyuanVideo_MLX` 尝试 54 分钟后崩溃（VAE decode bug）且不比 ComfyUI 快 [9]。
- FastVideo 仓库 MLX 轨道 issue 检索（2026-09-25）：MLX 移植只覆盖 **Wan（FastMetal）与 MiniMax H3（FastH3）**两个家族——#1638（Wan MLX runtime）→ #1758/#1736（FastMetal 修复）→ #1770-#1794（H3 MLX T2VA/attention/decoder）→ #1863（FastH3 8-Step V2 MLX 推理，已关闭=落地）→ #1884（V2 cookbook，开放中）。**无任何 HunyuanVideo MLX 议题** [10]。
- 自行移植评估：不好改。FastMetal 博客明确 MLX runtime 的架构前提是「MLX-first DiT + dense attention（`mx.fast.scaled_dot_product_attention`）」——MLX 无生产级稀疏 attention kernel，而混元 1.5 的核心架构恰是 SSTA 稀疏注意力；另需移植 VAE、文本编码器与精度 parity 验证（FastVideo 内部有 SSIM parity 测试体系）。参照 FastVideo 团队移植 Wan 的投入（#1638 起 30+ issue 的专项工程），混元 1.5 MLX 端口是**数周级工程**，非 PR 级贡献 [1][10]。
- 跟踪方式：watch `hao-ai-lab/FastVideo` releases + `tencent/HunyuanVideo` HF；混元 MLX 若出现，大概率同样经 FastVideo MLX 轨道或 mlx-community 落地。

### FastH3 许可证实地审查（2026-09-25 LICENSE 全文核对，含更正）：排除的是欧美韩四地，大陆在许可区内

**更正**：本节初稿据 QA 标题误读为「许可仅限 EU/UK/KR/US 四区、大陆被排除」。LICENSE 法定文本（`MiniMax H3 Community License Agreement`，许可日 2026-08-02）定义相反：**Applicable Territory = 全球、排除四地（Excluded Territories = EU、UK、韩国、美国）**。SCMP（2026-08-04）报道口径一致："MiniMax curbs overseas access…licensing carve-outs restrict use in US, EU, UK and South Korea"——被排除的正是欧美韩四地，中国大陆在开放权重许可区内。QA 正文中列出的理由（EU AI Act 执行、美国有涉生成视频的版权诉讼在身）正是这四地被排除的原因，其标题 "limited to" 实为 "limited **in**"（在四地受限）之意。

对美国的准确回答：**在美国，开放权重许可完全不适用（被排除）——不只是「商用要申请」，是任何部署都要走 formal license**：经 `platform.minimax.io/h3-license` 申请（LICENSE §II：被排除地区者"welcome to contact us about obtaining a license"，按 robust controls + 当地合规个案授权）。对许可区内商用（含中国大陆）：社区许可直接覆盖，年营收 **≤ 2000 万美元无需申请**；超过则须事先书面授权（联系 api@minimax.io，主题 "MiniMax H3 licensing - authorization request"）；且商用产品 UI 须醒目标注 "MiniMax H3"（§IV），模型输出不得用于改进其他模型（§V.3），争议适用香港法（§IX）。

对 FastH3 候选资格的影响：许可从「地域硬阻断（误判）」降级为「**非阻断项（大陆在许可区内）**」——但采用障碍依旧成立：32GB < 官方验证下限 36GB（M4 Max）、需下载 ~33GB bf16 基座自行转换 DiT（manifest 仓库非可运行权重）、preview 质量档 [11]。

### 混元 Video 发布时间线澄清

用户所指「去年 4 月」是讨论帖最后活动时间（该帖聊的是 1.0）。实际时间线：**1.0**（2024-12）→ I2V（2025-03）→ Avatar（2025-05）→ Foley 音频（2025-08）→ **1.5（2025-11，8.3B SSTA，当前最新视频模型，license:other）**。1.5 之后 10 个月无新视频基座。混元 MLX 版本至今不存在、无在途移植（见上节）[12]。

### 稀疏注意力的意义与 MLX 的取舍

视频 DiT 注意力 token 数 ≈ 帧数 × 空间 patch 数，动辄数万——Dense attention 计算与内存 O(N²)，长序列下爆炸；稀疏注意力（混元 1.5 的 SSTA、H3 的 VSA）只计算最相关 token 对，换来更长时长/更高分辨率/更快速度，代价是需专用 kernel 且可能丢失远距离相关。**MLX 只有 dense 快速路径**（`mx.fast.scaled_dot_product_attention`），FastMetal 因此走「dense + DMD2 蒸馏 3 步 + INT8」的路线换取 Mac 可行性；混元 1.5 若移植 MLX 必须先解决稀疏 kernel 缺失——这是「好改吗」的否答案的架构级根因 [1][10]。

### 为何 H3 用 Qwen3-VL 做文本编码器

代际设计而非缺陷：新一代视频模型（混元 1.5、H3）用 MLLM/VLM 替代传统 T5 系文本编码器，复杂 prompt 指令跟随与图像条件理解更强，且天然支持 I2V 图像输入（Qwen3-VL 即条件器）。**Qwen3-VL 不是 FastVideo 的替代品，而是 H3 官方架构的原生组件**——LICENSE 附注原文："the encoder of MiniMax H3 uses Qwen3-VL-32B, which is licensed under Apache 2.0"（Apache 2.0 许可使 MiniMax 可自由集成商用）；官方仓库 `text_encoder/config.json` 实证 `architectures: ["Qwen3VLForConditionalGeneration"]`，14 分片 ≈ 66GB bf16 与 32B 规模吻合。FastH3 沿用 Qwen3-VL 即是忠实移植官方架构（也解释了官方仓库的 Ref2VA/FL2VA 入口与 `transformer_ref/` 参考图分支）。代价是编码器体积大；H3 的真实短板是：33B 太大、蒸馏档 preview/V2 质量 [8][11]。

### FastH3 量化版在 32GB 机的现实约束（追加）

技术上 INT4 DiT（~17-20GB）+ 分阶段加载**可能**跑起来（#1863 已在 FastVideo 源码落地 V2 MLX 推理），但四个约束使其不适合当前采用：① 需先下 ~33GB bf16 基座自行转换 DiT（manifest 仓库非可运行权重）；② preview/V2 质量档；③ 32GB < 官方验证下限 36GB（M4 Max，支持矩阵明载）——内存是首要硬件障碍但非绝对（INT4 + 分阶段加载是官方为内存受限场景设计的能力）；④ text encoder 为 Qwen3-VL 系（官方 14 分片 ≈ 66GB bf16，LICENSE 附注确认 Qwen3-VL-32B），内存雪上加霜。许可**不是**障碍（大陆在许可区内，见上文更正）。结论维持：不进候选，理由是内存验证缺口 + 转换工程 + preview 质量，而非许可 [8][10][11]。

## Open Questions

1. 5B 在 M2 Pro（非 M4/M5）上的真实端到端时长——官方只有 M4 Max 36GB 与 M5 Air 24GB 两点，本机首条实测即答案。
2. 14B 峰值 21.68 GiB 在 32GB 机 + 系统占用下的真实余量——无社区实证，只能有界试验。
3. 5B 的 720p 样片进入 Remotion 时间线后的下游表现（裁切/缩放策略）——评测胜出后由 #357（zoom 退场快修）协同验证。

## Sources

1. https://haoailab.com/blogs/fastmetal/ — FastMetal-QAD 官方发布博客：三档基准表（速度/内存/模式）、内存编排说明、I2V 未发布声明 — Tier 1
2. https://huggingface.co/FastVideo/FastMetal-5B-QAD — 官方模型卡：INT8 QAT、base Wan2.2-TI2V-5B、Apache-2.0、体积清单 — Tier 1
3. 本地代码验证：`scripts/short-video/experiments/fastvideo-spike/repo/`（commit a159b63c）`examples/inference/basic/mlx_wan22_generate.py`、`fastvideo/mlx_runtime/wan_vae.py`（TAEW2_2_URL/SHA256）、`docs/inference/support_matrix.md`、`docs/getting_started/installation/mps.md` — Tier 1
4. https://blog.csdn.net/shaock2018/article/details/164095152 — Mac 本地 FastMetal 全链路独立实测（M1 Max 64GB；1.3B/5B 四段横评 + 排错清单）— Tier 3
5. https://github.com/hao-ai-lab/FastVideo/pull/1802 — fastvideo serve 对 FastMetal 三档的支持 PR（生态活跃旁证）— Tier 1
6. https://huggingface.co/api/models?search=hunyuan%20video%20mlx — HF 检索返回空：无 HunyuanVideo MLX 移植 — Tier 1
7. SearXNG 全网广扫「HunyuanVideo MLX Apple Silicon Mac」（211 结果）：Mac 玩法均为 ComfyUI/MPS 路线 — Tier 3（多引擎聚合）
8. https://huggingface.co/api/models/MiniMaxAI/MiniMax-H3 与 FastVideo-FastH3-*-MLX-INT4/6/8 仓库 API — H3 基座 33.1B、MLX 仓库为转换清单非可运行权重、许可 minimax-h3-community — Tier 1
9. https://huggingface.co/tencent/HunyuanVideo/discussions/13 — 官方讨论帖（2024-12→2025-04）：Mac 全为 ComfyUI MPS/GGUF 玩法，第三方 MLX 尝试崩溃，无官方 MLX 计划 — Tier 2（官方论坛社区帖）
10. https://github.com/hao-ai-lab/FastVideo issues 检索（MLX in:title / MLX hunyuan）— MLX 轨道仅覆盖 Wan + MiniMax H3 两家族；#1863 FastH3 V2 MLX 推理已落地、#1884 cookbook 开放 — Tier 1
11. https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/LICENSE — 官方社区许可全文（2026-08-02）：Applicable Territory = 全球排除 EU/UK/KR/US；§IV 商用条款（≤$20M 免申请、超线书面授权、UI 署名）；QA 文档 https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/QA-about-License.md（formal license 申请入口 platform.minimax.io/h3-license）— Tier 1
12. https://huggingface.co/api/models?author=tencent&search=HunyuanVideo — 混元视频时间线：1.0（2024-12）/I2V（2025-03）/Avatar（2025-05）/Foley（2025-08）/1.5（2025-11，当前最新）— Tier 1
