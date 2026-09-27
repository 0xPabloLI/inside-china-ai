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
