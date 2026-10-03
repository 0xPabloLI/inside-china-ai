# Repo Survey Tracking

追踪外部 repo 调研结论。每个 repo 调研后记录日期、结论、子 issue。

关联 issue：[#302](https://github.com/0xPabloLI/inside-china-ai/issues/302)（追踪）、[#291](https://github.com/0xPabloLI/inside-china-ai/issues/291)（总入口）

---

## A. 库存视频拼接

### MoneyPrinterTurbo (harry0703/MoneyPrinterTurbo, 123k★)

- **调研日期**: 2026-09-14
- **本地路径**: `docs/research/MoneyPrinterTurbo/`（gitignored, 1.0G）
- **技术栈**: Python + MoviePy + ffmpeg + PIL（不用 Remotion）
- **素材机制**: LLM 提取搜索词 → Pexels/Pixabay/Coverr API 搜视频 → 按方向/时长/分辨率过滤 → 下载 → ffmpeg 拼接
- **质感来源**: (1) 素材本身是专业实拍 1080×1920; (2) MoviePy 拼接去重 + 转场; (3) 字幕弹跳动画 + 圆角背景 + BGM
- **没有模板系统**: 全屏实拍视频 + 底部字幕条 + BGM

**值得吸收的**:

1. stock-video-first 路线：整个视频 = 库存实拍视频拼接
2. 搜索时 `orientation=portrait` + 精确分辨率匹配（不裁切）
3. `_prioritize_unique_source_clips`：同源去重，避免素材重复
4. sequential 模式：按叙事顺序选素材（适合新闻）
5. 长视频按 max_clip_duration 切段，持续补充到覆盖音频时长

**不适用的**:

- 字幕弹跳动画（偏娱乐风格，新闻需克制）
- 无模板设计（我们需要 Remotion 模板）

**子 issue**: [#301](https://github.com/0xPabloLI/inside-china-ai/issues/301)（库存视频策略改造）

---

## B. Remotion 模板设计

### locomotion (remotion-dev/locomotion)

- **调研日期**: 待调研
- **描述**: 67 个单文件 Remotion 模板，6 种风格变体（Data/Text/Explainer/Social/Branding）
- **目标**: 找适合新闻类型的克制风格模板

### av/remotion-bits (464★)

- **调研日期**: 待调研
- **描述**: Remotion 组件库
- **目标**: 可复用组件参考

---

## C. 信息可视化

### anything2explainer (1182★)

- **调研日期**: 待调研
- **描述**: 黑底+白线条+紫点缀风格，9 阶段管线+QC，PolyForm Noncommercial
- **目标**: 数据/对比 scene 的信息图设计参考
- **注意**: 只做横屏，许可限制

---

## D. 整体管线

### video-shotcraft (8435★)

- **调研日期**: 待调研
- **描述**: 最高星短视频生成 repo
- **目标**: 管线架构参考

### video-talkcraft (979★)

- **调研日期**: 待调研
- **描述**: 对话/讲解类视频生成
- **目标**: 叙事结构参考

### Pixelle-Video (ATH-MaaS/Pixelle-Video, 28.6k★)

- **调研日期**: 2026-10-01
- **本地路径**: `/private/tmp/pixelle-video-survey/`（浅 clone，HEAD 2026-06-14，会话临时目录非仓库资产）
- **技术栈**: Python + Streamlit + FastAPI + ComfyUI/RunningHub 工作流 + **HTML 模板经 Playwright 截屏出帧** + ffmpeg-python 拼接（不用 Remotion/MoviePy 做主合成）
- **素材机制**: LLM 写旁白（默认 5 分镜）→ 每句 AI 图或 AI 视频 → TTS 定时长 → 模板出帧 → 拼接
- **维护状态**: main 末次提交 2026-06-14、release 停在 v0.1.15（2026-01-27）、文档站部署停在 2026-01-08、open issue 146/closed 41；同 org 的 ComfyUI-Copilot 仍活跃，属注意力转移而非组织瓦解
- **档级判定**（按 `agent-video-skills-180-screening-2026-09.md` §2 五口径）: **Tier B 只读**——Apache-2.0 ✓、付费云绑定 ✗（15/23 类工作流仅 RunningHub，含全部数字人与动作迁移）、NVIDIA 假设 ✗、活跃度 △、能力重复 ✓

**值得吸收的**:

1. 25 个竖屏 HTML 版式（Apache-2.0 可改写）作为 `mediaStrategy` 模板候选清单
2. `static_*` / `image_*` / `video_*` 前缀即「是否需要 AI 素材」的受控分类，适合做门禁判据
3. 原子 REST 端点形态（`/frame/render`、`/tts/synthesize` 单独可调），比整条 `main.mjs` 跑到底更利于 agent 局部重试

**不适用的**:

- 出帧形态是「插画轮播 + 配音」，正是平台治理的重复性内容形态；我们的 Remotion 动画层不能退化过去
- 本地路线要求 NVIDIA 显卡，M2 Pro 32GB 走不通；云路线主推第三方付费实例
- 零测试 / 零 CI / 文件服务词法白名单（点段序列可绕，见报告 §Key Findings 7），不具备复用价值

**详细报告**: `research/pixelle-video-research-2026-10-01.md`（无子 issue：本轮为纯调研，未授权实施）

- **2026-10-02 实跑验证**: 已在本机（M2 Pro）隔离跑通最低成本档——本地 Ollama 文案 + edge-tts + `static_default` 模板，**0 元、无 ComfyUI、无 RunningHub**；成片 1080×1920 / 27.04 s / 4 分镜 / 端到端 41 s，样片在 `scripts/short-video/experiments/pixelle-video-sample/`。帧差实测同场景 ≤0.008、仅 3 处分镜切换跳变 → 「卡片轮播」判词由推断升级为观测。三个部署坑（Playwright 内核缺失且报错点很深、thinking 模型空 content 仍继续、默认 `n_batch` 必崩）与 RunningHub《付费服务协议》二.2.2「**非商业用途**」条款均已核实——后者对我们是**条款级阻断**，不是价格问题。

---

## E. 完整分类索引

66 个 repo 的 7 类分类（A-G）在 #291 评论中。
