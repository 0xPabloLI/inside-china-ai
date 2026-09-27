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
