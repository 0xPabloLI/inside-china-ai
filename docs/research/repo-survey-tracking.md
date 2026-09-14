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

---

## E. 完整分类索引

66 个 repo 的 7 类分类（A-G）在 #291 评论中。