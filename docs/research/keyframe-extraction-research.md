# Deep Research: VLM 长视频关键帧选帧（TMRoPE walk around）与 focus_detector 升级评估

> 2026-09-27 · Session `20260926-360-long-video-ce7702` · 触发：用户要求 web deep research 验证 HANDOFF §二.5/§三.5（mlx_vlm #294 ffmpeg scene detection 选帧）的时效性与可靠性，连带评估 `focus_detector.py` 是否需要优化。

## Executive Summary

对 MiniCPM-o 4.5（mlx_vlm 0.7.2，本机 M2 Pro）长视频语义分析中的帧采样问题做了三线验证：一手 issue 考古、官方文档/论文、本机源码与真素材冒烟。结论一：**mlx_vlm Issue #294 的 ffmpeg scene detection 配方不是"社区验证的方案"**——它是提问者 tmoroney 自己的既有做法（2025-04-11 发布，2025-04-23 后无活动，closed 无人采纳），maintainer 只回了模型推荐，配方没有任何对比基准。HANDOFF 中"社区验证有效"应降级为"社区分享、无数据"。结论二：但**轻量信号选帧的方向本身是对的**——CVPR 2025 起的学术工作（AKS 等）一致把 naive uniform sampling 当作要打败的基线，且都强调 temporal coverage；对本项目"无 query 的素材语义描述"场景，场景切换信号 + 时间覆盖兜底是性价比最高的一档，神经选帧（AKS/M-LLM 选帧）属于过度设计。结论三：**本地实测配方可行**——30s 真素材 0.36s 选出 11 帧（6 次场景切换 + 首帧 + 每 8s 兜底，行为与设计吻合），零新依赖。结论四：`focus_detector.py` 的 Haar Cascade（2001 年 Viola-Jones 系）有零依赖升级路径——OpenCV 官方实证 YuNet（FaceDetectorYN）全面优于 Cascade，本机 `~/.video-tts-env` cv2 4.14.0 已内置，仅需下载 opencv_zoo 的 YuNet onnx 模型（~345KB，MIT，repo 活跃）。另注意：`~/.venvs/mlx-vlm` 的 cv2 已是 5.0.0 且 **saliency 模块消失**——focus_detector.py 必须钉在 video-tts-env。

## Key Findings

1. **#294 考古（用户问题："294 是多久以前的 issue 了？"）**：Blaizzy/mlx-vlm#294，2025-04-11 创建，2025-04-23 最后评论，closed，4 条评论。[Tier 1：GitHub API 原文] 内容是 tmoroney 征询 <1B 视频 captioning 模型推荐，ffmpeg 关键帧提取只出现在他自己的代码里（`select='gt(scene,0.08)+eq(n,0)+not(mod(t,8))'`，cap 6 帧）；Blaizzy 的回复全是模型推荐（Qwen2.5-VL 3B / InternVL3 1B&2B / NanoLlava / 4bit vs 8bit），**未对选帧配方表态，也未采纳任何选帧 PR**。配方自带 max_frames=6 是为 2B 模型省算力，不适用我们的 8B 场景。**"社区验证有效"不成立，最多算"社区分享"。**

2. **但"均匀采样是下界"有学术共识**：AKS（CVPR 2025, arXiv:2502.21271）明确以 uniform sampling 为基线做 query 相关性 + temporal coverage 的 split-and-judge 选帧；M-LLM Based Video Frame Selection（CVPR 2025, arXiv:2502.19680）与 From Frames to Clips（arXiv:2510.02262, 2025-10）、Focus（arXiv:2510.27280, 2025-10）同路线。共同点：(a) uniform 采样对静态/低密度视频浪费帧预算；(b) **temporal coverage 必须显式保证**（这正是 scene-detection 配方里 `not(mod(t,8))` 兜底帧的作用）；(c) query-aware 神经选帧收益最大但需要额外打分模型——我们的素材描述场景无 query，收益打折。**结论：轻量信号选帧 + 覆盖兜底是本用例的正确档位；AKS 类方法记为远期候选。**

3. **帧率/帧数配置（用户问题："考虑下 2fps 1fps 的配置"）**：MiniCPM-V 4.5 官方文档（OpenBMB，Tier 1）给出 3D-Resampler：6 帧 448×448 联合压缩成 64 token（96× 压缩），**LLM 侧 token 成本不随帧数线性涨**，官方主打 high-FPS（up to 10FPS）视频理解；官方视频 demo 传统配置 `MAX_NUM_FRAMES=64`（≈1fps）。视觉 encoder 成本仍随帧数线性（SigLip2 每帧一次）。本机 mlx_vlm 0.7.2 源码（video.py:68-103）：`subsample_evenly` + 默认 `max_frames=16`（≈2fps@8s 窗口），比官方保守 4×。**实验矩阵应含 策略∈{uniform, scene-detect} × cap∈{16,32} × fps∈{1,2} 的组合，实测质量/时延曲线后决策。**

4. **配方本地实证（proposal-review 双源之本地侧）**：content_ABCx2_30s.mp4（HANDOFF 真素材）上 `select='gt(scene,0.08)+eq(n,0)+not(mod(t,8))'` + 480p 下采样，**0.36s wall-clock 选出 11 帧**（约 6 切换 + 1 首帧 + 4 兜底，与素材结构吻合），176KB mjpeg。ffmpeg 为管线既有依赖，`select` V->V 滤镜存在。零新 pip 依赖，CPU 完成。

5. **focus_detector.py 优化评估（用户要求"连带看下"）**：现状 = Haar Cascade `haarcascade_frontalface_default.xml`（focus_detector.py:115-116，Viola-Jones 系，2001）+ Static Saliency Spectral Residual。OpenCV 官方博客（opencv.org, 2022-11, Tier 1）实证 **YuNet（FaceDetectorYN）在准确率/鲁棒性上全面优于 Cascade Classifier**（侧脸、小脸、光照）。本机事实：`~/.video-tts-env` cv2 4.14.0 **已内置 FaceDetectorYN**（零 pip 新依赖），模型文件来自 opencv/opencv_zoo（MIT，活跃：pushed 2026-05-28），face_detection_yunet onnx 约 345KB 一次性下载；`saliency` 模块同 venv 可用。**升级路径低风险**：YuNet 输出带置信度与 5 点 landmark，可平滑替换 Haar 调用点。**风险**：`~/.venvs/mlx-vlm` 的 cv2 已升 5.0.0 且 **saliency 模块缺失**——focus_detector.py 必须钉在 `~/.video-tts-env`（现状即如此，AGENTS.md 注记需更新防误配）。

## Contrarian Views & Risks

- **scene threshold 0.08 未必跨内容鲁棒**：talking head（渐变光照/微动作）可能整段低于阈值只剩兜底帧；高速运动素材可能帧数打满 cap。0.08 是 tmoroney 为其素材调的值，无公开敏感度分析——实验须覆盖 talking head / 高密度两类素材各至少一个。
- **MiniCPM-o 无时序训练**：换关键帧喂入不会让它"理解"时序（HANDOFF §二.5 结论仍有效），选帧只是提升"每帧信息密度"。时序理解仍靠 #360 分窗 + 未来 Qwen3-VL 路线，不要在选帧上过度投资。
- **给帧配时间戳文本标记是否有效未验证**（MiniCPM-o 没学过时间戳 token）——列为 open question，实验不做此项。
- YuNet onnx 是新引入的模型文件（~345KB）：走 model-sources 准入（license MIT / opencv_zoo 活跃 / 原始仓库即官方），入库 `scripts/short-video/models/` 或跟随 content 目录需再定。

## Open Questions

1. scene_threshold 对本项目素材分布（新闻播报 / 实拍 / 屏幕录制）的最优值——实验产出敏感度数据后再定，不预设 0.08。
2. cap=32 时 vision encoder 时延增幅是否被 LLM 侧 3D-Resampler 抵消（官方称 token 不涨）——实验测端到端时延曲线。
3. focus_detector.py 的 saliency 输出是否值得同时升级（SSR → 深度显著性）——当前文本保护区用途下 SSR 够用，暂不动。

## Sources

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

## 15. tiered 选帧器实证与选帧 benchmark 版图（2026-09-28，同 session）

### 15.1 tiered 选帧器（bench-only，`scripts/short-video/bench/keyframe/exp_tiered.py`）

三阶段 + 两道护栏（对齐社区已验证形态，非自创五层）：

| 层 | 机制 | 实证依据 |
|---|---|---|
| L1 硬切锚点 | ffmpeg scene 0.08（含 8s 兜底 pts） | 多镜头素材召回骨架 |
| L2 出现且停住 | 块级：≥3% 像素强变（>40 灰阶）vs **最后保留帧**，且对**下一帧**稳定 | ui-demo GT **7/7**（@320×180 / 20×12 网格 / >40 / >0.03） |
| L3 去重 | cuts 用 pHash（仅 ±2s 窗口内合并）；locals 用**强度排序 + 1.5s 最小间隔** | pHash 不能区分「微小但有意义」与微动噪声（曾吃掉 ui-demo 14.0/26） |
| L4 覆盖兜底 | 盲区 >8s 取**中点**补帧 | 中点天然避开周期事件相位 |
| L5 预算封顶 | 显式优先级元组 cuts > fills > locals | 字典推导式会静默降级同时命中两层的 cut |
| 护栏·洪水降级 | L2 触发数 > 2×预算 → 判定该内容信号无选择性，退化为 cuts+兜底 | talking head 曾 16 帧全近重复（nearDup 108 → 6） |

### 15.2 修复前后对照（5 素材 × 三层判据）

| 素材 | 指标 | tiered（修后） | uniform | scene |
|---|---|---|---|---|
| ABC_av | recall / 帧数 / nearDup | 1.0 / 5 / 0 | 1.0 / 16 / 7 | 1.0 / 4 / 1 |
| ABCx2 | recall / gap / nearDup | **1.0 (5/5)** / 5.06s / 3 | 0.4 / 2.0s / 10 | 1.0 / 5.06s / 8 |
| unitree | recall / nearDup | 0.857 / 1 | 0.857 / 4 | 0.857 / 1 |
| talkinghead | 帧数 / nearDup / gap | **4 / 6 / 8.0s** | 16 / 76 / 2.0s | 4 / 6 / 8.0s |
| ui-demo | recall / 帧数 / nearDup | **1.0 (7/7)** / 11 / 6 | 1.0 / 16 / 21 | **0.0** / 4 / 0 |

修复链路：ui-demo 0/7→7/7；ABCx2 recall 0.4→1.0、gap 11.4→5.06s；talkinghead nearDup 108→6。已知让步：ABCx2 第二人脸段 faceHit 0.5（uniform 1.0，代价是 10 对冗余）。

### 15.3 夹具 bug（重要教训）

ui-demo 合成的第 6 秒事件原为空字符串行——**构造上不可见**，导致「7 事件 GT」天然不可能全中，并造成「隔一个命中」的假规律。已修为可见内容。**合成夹具必须验证每个标注事件真的可见**（对应 AGENTS.md「非空产出」证据卫生）。

### 15.4 选帧 benchmark 版图（回答「谁最好 / 能否不本地测」）

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
注：本文现有两个 `## 15`（145 行「tiered 选帧器实证」、199 行「全方法总对决」），
引用「§15」时以「全方法总对决」为准；未重编号是因为已发布的 issue 评论与
HANDOFF 都按 §15 指向后者，重编号会让那些指针落空。

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
但也**一题都没赢**。与官方码底盘的两轮同向（首轮官方产物 25/33 vs 26/33；§19.2 严格三臂
23/30 vs 24/30，`units_only` 同样为 0）。装载本身是准的：
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

### 17.5 ASR 运行时（#418 的速度维度）

空机、ctx-off、4 视频（音频均值 78s）实测：**MLX turbo 30.5× 实时**（3s）＞ whisper.cpp turbo 17.0×（5s）＞ MLX large-v3 7.9×（10s）。配合 §Session3 的等价性结论（两边默认都掺重复幻觉，调用必须关跨段上下文：MLX `condition_on_previous_text=False` / whisper.cpp `--max-context 0`），生产侧 ASR 调用的档位与开关都已定。

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

落地清单（本票不改生产默认，以下为落地 PR 的变更点）：

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
解码后均匀取 64 个时刻），再把时刻表交给 `load_video()` 逐时刻精确 seek 抽帧。loader 本身
不做任何选帧决策（见 §20.1 的 loader 说明）。

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
| **slice + 官方单元**（换强选帧器配官方装载） | **不跑** | 官方装载轴两轮共 63 题、`units_only=0/0`，即「音频经单元装载进 context」从未在任何一次比较里赢过。换选帧器只改视觉输入、不改音频通道的结论；要提升 slice 有更便宜的轴（§17.2 的纯视觉臂）。 |
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
| 自建几何判据集 | 16 素材（口播 / UI 录屏 / 拼接长片等）。**GT 来源（§13.2，无人工视觉标注幸存）**：3 个合成素材用构造数学 GT——切点 = 拼接时刻（ABC 唯一切点 5.06s、ABCx2 五切点、ui-demo 七事件），机械权威；唯一真实素材 unitree 的视觉标注两版均被探针复核**推翻**，GT 降级为**三机制机械共识**（ffmpeg scene ∩ I-frame pts ∩ 灰度帧差，任二独立机制 ±0.15s），provenance 标注「待用户 HITL 终裁」——**联评时请裁** | 场景召回（±0.5s）、最大盲区、pHash 近重复率。**选帧层第一筛**（零模型成本） |

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
| 官方三臂配对（首轮） | 10 视频 / 30 题 | **偏少**：只够排除大增益。可信度建立在三轮 63 题零胜 + 跨底盘同向 |
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
四轮证据：①官方码产物 25/33 vs 26/33（11 视频）；②我方复现装载 29/33 vs 31/33（p=0.50）；
③官方码×2 + loader×1 三臂 23/30 vs 24/30（units_only=0，p=1.0）；④**276 题终审
211/276 vs 203/276，配对 14/6、p=0.115**——方向相对第③轮翻了号，两轮都在零点附近抖，
任何方向都不显著。单次生成 ~76s（纯视觉 5–10 倍）。产物
`exp_omni_units_qa{,_loader,_official,_official_full}.json`。
置信度：**高**（276 题终审 + 三轮历史同向「零显著」）。

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
不做波形直喂（C1 有害）；不做单元装载（C3 零胜且慢 5–10 倍）；音频信息走转写文本（C2）。
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
| 抽帧 | 整片解码一次：`ffmpeg -i v -vf fps=1`（短）/ `fps=10`（长）→ 全帧 JPEG 进临时目录 → 长视频 linspace 挑 64 张 → PIL RGB | 等差时刻表走同款 `-vf fps=` 单次解码（帧数不精确匹配整批废弃回退）；任意时刻表逐时刻 `-ss <t>` 精确 seek 单帧；`-q:v 2` 原分辨率；t=视频末尾 `-sseof` 回退 |
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
筛选，不是全方法普查。KFS-Bench 轴数字见 §15.4 版图。

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
记录墙钟 + Metal 峰值内存。64 帧已知可行（每题清缓存后零 OOM）。

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
| （16→64 全程） | | +6.8pp | 0.0009 |

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

**C9 现状（截至 2026-10-04）**：结论**维持成立**——同刻表同分辨率同帧数下，
官方像素路径比我方 loader 低 5.4pp（p=0.0007）；落点漂移已实测排除（223/224
哈希匹配，含 VFR），分辨率轴被 `max_slice_nums=1` 抹平；机理收窄至两个存活
嫌疑（官方 PIL q88+4:2:0 JPEG 保真度 vs 我方 ffmpeg q:v 2 近无损；解码器色彩
管线 decord vs swscale）。定案可选臂（我方帧重存 q88 重跑 QA）未排。
工程含义不变：q:v 2 与 q88 成本相同，近无损免费，我方 loader 保持现状，
官方代码无需修改（选帧策略采纳官方均匀路线）。

**压测爬坡结果（2026-10-04，最长基准视频 130.6s，单次推理，每档独立进程）**：

| 帧数 | 墙钟 | Metal 峰值内存 | 答案质量 |
|---|---|---|---|
| 96 | 55.2s | 8.96 GB | 正确描述 |
| 128 | 74.5s | 9.95 GB | 正确描述 |
| 160 | 93.8s | 10.71 GB | 正确描述 |

**32GB 统一内存上无内存墙**：160 帧峰值仅 ~11GB（模型 ~5.7GB 常驻 + 视觉 token
线性增长）。**瓶颈是延迟（~0.65s/帧线性），不是内存**——context 40960/96 token ≈
400 帧理论容量在内存上也基本可达（外推 ~20GB+）。压测脚本
`exp_stress_frames.py`（N 从 argv 传入；每档新进程防 C++ 层 OOM 不可捕获）。

**主链剩余顺序（2026-10-04 凌晨起，`exp_master.log` 打点）**：uniform_96（短档）
→ Qwen 30B 帧臂（64 帧均匀 + 转写）→ **Qwen 30B 原生视频臂**（`VM_NATIVE_VIDEO`
旋钮：`generate_response(video_path=...)`，处理器内部自采样 + 转写整块）
→ medium 档预算三点（16/64/96，28/30 视频到盘，中位 593s / 最大 1046s）。

**一夜战报（2026-10-04 早上）**：压测 96/128/160 全过（见上表）；medium 28 视频
到盘；**Qwen 原生视频臂成功运行中**——早期 18 题 17 对（94.4%）、**58.5s/题**
（原生视频 prefill 竟比 64 图臂预期还快些）、零 ERR。**两个臂空跑报废（我的命名
失误，无 GPU 浪费）**：`VM_METHODS=uniform_96`/`uniform_64`（下划线名）与
PRECOMPUTED 文件键名 `uniform96`/`uniform64`（无下划线）不一致，select() 找不到
时刻表即抛错，fail-fast 退出（rc=2 设计生效）——已用正确键名重排到主链之后
（等待方式改为盯主链 PID 退出，绕开 pgrep 自匹配陷阱：三个包装进程的命令行都
含真实脚本路径文本，互相当成"在跑的实验"卡死过一晚上的空转）。

**帧数规则的综合裁决（待 medium 曲线补全）**：QA 拐点 32（短档实测）+
盲区承诺下限 1/8s + 官方封顶 128 → 统一规则候选
**`帧数 = min(max(ceil(D/8), 32), 128)`**（120s→32 帧 @3.75s 间距；
302s→38 帧 @8s；1046s→128 帧 @8.2s）。「官方 1fps 到 128」在短档被实测否决
（1fps = 120 帧 >> 拐点 32，多花 ~3 倍延迟买不到显著增益）；medium 档若拐点
上移则回改。
