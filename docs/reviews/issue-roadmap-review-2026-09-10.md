# Issue Roadmap 待做 Issue 方案 Review（2026-09-10）

> 依据：`docs/issue-roadmap.md`、`docs/specs/spec-platform-profile-isolation.md`、`docs/research/voiceover-pacing-research.md`、`docs/research/wechat-channels-publishing-research.md`、代码库已落地实现（`lib/platforms/`、`lib/tts/quality-gate.mjs` 等）。

## 一、待做 Issue 现状全局盘点与分类

| 分类 | 涉及 Issue | 核心定位与瓶颈 |
|---|---|---|
| **1. 当前执行前沿** | #219, #235, #232, #229, #195, #221 | 方案已定或接近就绪，具备近期开工条件（受工作区干净度与 Conflict Matrix 约束） |
| **2. 人机门控 / 待用户介入（HITL）** | #225, #216, #230 | 等待用户复看成片、微信扫码实测或方案选型 grill 裁决 |
| **3. 需设计深化 / 架构 Grill** | #191, #192, #185, #186 | 涉及 Scene Data 契约演进或素材反馈回路，动手前须经 grill 研讨 |
| **4. 依赖阻塞 / 条件未触发（Blocked/Dormant）** | #224, #217, #218, #220, #223, #228, #233, #222, #140, #156 | 等待物理资源（照片、大陆实名）、前置票落地、或数据驱动指标触发 |

## 二、核心前沿 Issue 方案深度审查

### 1. #219 多平台内容生产架构：平台 Profile 隔离

- **方案现状**：Active Spec `docs/specs/spec-platform-profile-isolation.md`（S2+R3）已定案。Ticket 01（Profile 契约、加载器、TikTok Profile）已交付（`b4cb55d`）。待实施为 **Ticket 02（发布包生成器 Profile 化 + `publish/{platform}/` 目录迁移 + B6 校验）**。
- **方案评价（优）**：
  - **"窄隔离"边界清晰**：严格将 Profile 定义为 `{发布包规则, 发布方式, 产物类型}`。视频平台共享同一成片，内容内核与渲染层零分叉，有效避免平台蔓延打散视频核心管线。
  - **按平台目录物理隔离**：发布包统一迁移至 `output/{pipelineId}/publish/{platform}/`，成片等内核资产原地不动，不再在成片根目录散落 `tiktok-caption.txt` 等平台文件。
- **风险与审查发现（需注意）**：
  - **Middle Man 消除义务**：Ticket 01 为平滑过渡保留了 `lib/tiktok-rules.mjs` 的 `THRESHOLDS` 转发层。Ticket 02 必须清理消费方，直接取 Profile 契约，避免沉淀无效中间层。
  - **无 Shim 的破坏面控制**：Spec 决定"TikTok 路径随迁且不留兼容 Shim"，直接影响 `publish-tiktok.mjs` 与手工操作脚本的路径解析，须确保测试用例与文档引用一次性迁移干净。
  - **开工门槛（Conflict Matrix）**：Ticket 02 会修改 `main.mjs`。当前工作树有并行会话未提交改动，需等工作区干净后才能开工。

### 2. #235 旁白语速落地：Stage 3 写稿规范 + TTS native speed 补差 ≤1.2

- **方案现状**：立项登记完成，依据 `docs/research/voiceover-pacing-research.md`（14 源深度调研 + STFT 频谱实测）定案。
- **方案评价（优）**：
  - **"写稿优先于拉伸"理论与数据扎实**：明确短视频英文甜点在 140–160 WPM（当前基线 130 WPM 偏慢）。指出"删词（去 filler/hedging）提信息密度是第一杠杆，语速拉伸只做残余补差（1.05–1.1x）"。
  - **频谱实测排除了 1.5x 劣化**：通过 STFT 证明 ≤1.2x 时 CosyVoice native 的 mel 线性插值与 atempo 偏差 ≤9% 且听感一致；1.5x 时 native 频谱通量暴跌 −36%（瞬态抹平、变闷）。选型定案 `speed ≤ 1.2` 具有极高置信度。
  - **缓存防污染设计严密**：明确 `speed` 必须作为哈希因子纳入 #225 的 TTS 缓存 key，防止旧 1.0x 缓存污染新语速。
- **风险与审查发现（需注意）**：
  - **中英分流规则必须强隔离**：中文 240–300 字/分已达新闻播音高位档，调研明确中文不提速。代码落地时，adapter 的 speed clamp 与默认值必须严格按语言分流，严禁全局统一提速。
  - **与 Quality Gate 的 WPM 容差对齐**：刚交付的 `quality-gate.mjs` 设定的英文安全下限为 115 WPM，提速后应密切观察真实包 WPM 是否稳定落在 140–160 WPM 甜点区。

### 3. #232 TTS 输出质量守卫：吞音 / 停顿压碎节奏 / 幻听尾残留

- **方案现状**：Tier 2 ready-for-agent。分三层守卫：① verify 层对齐词时长 sanity；② post-process 层末词后非语音裁剪；③ 引擎层压缩比 >1.5x 告警。
- **审查发现（与 #234 交叉重叠）**：
  - 刚关闭的 #234 已新建 `scripts/short-video/lib/tts/quality-gate.mjs`，实现了 ASR 回录校验、尾词截断检测（tailWords 守卫）、WPM 范围校验和音素混淆拦截。
  - **#232 尚未覆盖但最致命的核心缺口**：
    1. **尾部非语音裁剪（消除幻听）**：#225 中 scene-7 尾部 2.8s 持续 −21dB 幻听人声，普通 `silenceremove` 无法剔除（因为不是静音）。必须依赖 forced alignment 输出的末词结束时间戳（加 100–150ms 衰减余量）在 `post-process.mjs` 中硬切。
    2. **单词时长异常下限（Sanity Check）**：如数字 `53.4` 在 0.13s 内被吞音压碎读完。需基于对齐结果的 `duration_per_token` 做下限检测。
- **建议**：#232 方案应直接演进 `quality-gate.mjs` 与 `post-process.mjs`，把"alignment-based 尾词后裁剪"作为核心交付物，不再另起新流程。

### 4. #229 search-pool 测试断言未跟上 #226 引擎扩展

- **方案现状**：Tier 3 ready-for-agent。5 个测试用例失败（缺失 `SERPER_API_KEY`，导致 mock 未被触达）。
- **方案评价**：
  - **典型测试债修复**：`search-pool.mjs` 扩展引入了 Serper，但测试用例写死了 `POOL_ENGINE_NAMES = ["brave", "tavily", "jina"]`，且环境变量仅 stub 后三者。
  - **修复方案极轻量**：在 `searchPool` 选项中支持注入测试引擎列表（opts.engines seam），或在测试中统一补充 Serper mock。改动仅触及 2 个测试文件，无任何运行时风险，是恢复全仓绿色测试基线的优先候选。

### 5. #221 Talking Body NPU test: InfiniteTalk-Ascend on AtomGit 910B

- **方案现状**：Tier 2 ready-for-agent。在 AtomGit 昇腾 910B 环境上验证 InfiniteTalk，并与 Wan2.2-S2V 进行 A/B 对比。
- **方案评价**：环境已被前序 Wan2.2 验证跑通，测试计划清晰。
- **风险点**：昇腾容器冷启动可能 17+ 分钟，且 `scripts/atomgit/` 下有用户已暂存/未提交代码。执行前必须先与用户核对文件归属，并优先复用现有在线 Kernel 避免超时浪费算力。

## 三、待用户决策与人机协作门控（HITL）审查

| Issue | 当前停滞点 | 方案评估与下一步 |
|---|---|---|
| **#225 管线提速** | 唯一未决：用户 HITL 抽审 | 机制工作（打点、音视并行、TTS 缓存、Kaggle Dataset 化秒挂载）已全闭环。试验成片已完成 scene-7 剪尾重渲（coverage 99.3% PASS）。用户复看确认后即可正式关闭。 |
| **#216 视频号人工发布试点** | ready-for-human：等微信扫码 | 必须先完成人工实测（验证 200MB 限制、封面裁切比例、AI 声明入口、个人号发文流程），才能解除 #217（发布包适配）和 #218（自动化发布）的阻塞。方案设计非常克制，符合"安全护栏先行"原则。 |
| **#230 字幕短 cue 可读性改善** | 候选方向待选型（dh-pilot 测出 10 条 <0.8s cue） | **方案对比**：<br>1. *min-duration 强制拉长*：会导致字幕与 TTS 语音脱节（音画不同步），不推荐。<br>2. *相邻短 cue 合并（推荐）*：短视频行业标准解法，当相邻两 cue 间隔 <150ms 且单个 <0.8s 时合为一个字幕块。<br>3. *两行版式*：涉及 Remotion 字幕组件大改，成本高，可作为二期演进。 |

## 四、深水区与架构设计类 Issues 审查

### 1. #191 mediaOptOut 滥用与 #192 asset rejection 回路

- **问题本质**：
  - 当前写稿端频繁使用 `mediaOptOut: true` 绕过耗时的 VLM 分析，但一个布尔值打穿了 asset sourcing、b-roll、claim keywords、final gate 四个子系统，掩盖了无素材缺陷。
  - 用户发现某场景图片不佳时，目前无法定向重搜，只能全局重跑或手动改文件。
- **方案评价**：
  - **#191 提案三步法合理**：① CSS-only 布局自动跳过媒体寻找（合法场景自动消化）；② 显式引入 `media: null`（意图明确）；③ 废除隐蔽的 `mediaOptOut`。
  - **#192 方案闭环关键**：提出 scene 级 `media.reject: { reason, rejectedPath }`。重跑时跳过黑名单文件，定向只重搜被拒 scene。该方案与 #189（VLM 缓存）配合，能大幅缩短迭代耗时。
- **建议**：建议将 #191 与 #192 合并为一个设计单元进行 grill，因为解决的是同一条"素材决策与替换生命周期"。

### 2. #185 平台 Locale 关键词 & #186 视频素材稀缺

- **问题本质**：中文源检索时使用的是经过翻译/英文提取的关键词，导致搜不到国内新闻图片；即使搜对词，很多中国 AI 新闻（如芯片内饰、企业发布）在公开网络上根本没有合规高质量视频。
- **方案评价**：
  - #185 方向 B（在 Scene Data 中保留原始中文报道上下文与中文实体）方向正确且易于落地。
  - #186 指出的**结构性稀缺**无法仅靠爬虫解决。方案提出的"承认现实：接受精修静态图（I2V 或含动效图片垫层）作为默认产出，保留官方媒体库"是务实的定位。

## 五、依赖阻塞与长眠（Dormant）Issues 的合理性判定

- **#224 数字人半身像**：合理 Blocked。必须等待用户拍摄/提供真实半身照，才能校准 `AVATAR_CARD_RECT` 与遮挡反馈。
- **#217 / #218 / #220 多平台发布通道**：合理 Blocked。在 #219 Profile 架构未完工、#216 视频号未人工扫码验证前，冻结相关实例代码开发，避免平台字段污染内核。
- **#228 管线提速二期**：合理长眠。当前真实数据已实现"冷跑 26.5min → 缓存重跑 2.24min"，渲染耗时已取代 TTS 成为主导，未见新的瓶颈，数据驱动暂缓开工是正确的。
- **#140 反爬 follow-up**：P1/P2/P4/P5/P7 均已交付，P6（商用付费代理轮换）因成本决策暂缓。**建议：可考虑将 #140 正式关票**，未来若触发代理采购再另立专项。

## 六、执行优先级与推进建议（Action Plan）

综合依赖关系、风险矩阵与收益，建议后续执行按以下顺序推进：

```
[Phase 1: 零冲突快赢]
  └─ #229 (search-pool 测试债修复，2 文件无冲突，迅速翻绿测试基线)

[Phase 2: 人机门控收尾]
  ├─ #225 (用户确认 scene-7 抽审结果，关票)
  └─ #216 (用户微信扫码人工发一条，记录 5 项规格结论)

[Phase 3: 核心管线双轨推进 (需工作区干净)]
  ├─ 轨道 A [分发架构]: #219 Ticket 02 (发布包生成器 Profile 化 + 目录隔离)
  └─ 轨道 B [音频表现]: #235 (Stage 3 写稿规范 + speed 1.2 补差 + 缓存 key)
                         └─ 顺带闭环 #232 (尾部对齐裁剪防幻听)

[Phase 4: 设计 Grill]
  ├─ #230 (字幕相邻短 cue 合并选型)
  └─ #191 + #192 (mediaOptOut 退役与按 scene 素材拒绝重搜)
```
