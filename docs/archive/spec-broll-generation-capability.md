# Spec: B-roll 生成能力（管线化）

> 日期：2026-08-31 ｜ 状态：已确认（3 轮 Grill，18 项决策）｜ 来源：`docs/handoffs/handoff-video-prompt-quality-fastvideo-params.md` + 本 session Grill 共识
> 范围：**管线能力**（可复用的 T2V B-roll 生产机制）。不改任何单条视频内容；`qwen4-preview` 仅作真实数据 smoke test 夹具。**无需向后兼容**（`mediaStrategy` 缺省即 `'asset'` 是默认语义，不做迁移/兼容 shim）。

---

## 1. 背景与问题

FastVideo MLX spike（`experiments/fastvideo-spike/`）证明本地 Wan 1.3B 可出片，但 3 条 B-roll 与 scene 内容脱节（抽象辉光、横屏被裁、无品牌约束）。根因已诊断：prompt 薄 + 无验证闭环 + 无管线集成。本能力把「场景→贴合的 B-roll」固化为管线机制：**策略路由 → 生成 → VLM 匹配门 → 非破坏性写回 → 缓存复用 → 失败报告供 agent 迭代**。

## 2. 架构

```
写分镜阶段（已有）          管线运行时                        失败路径
─────────────────    ─────────────────────────────    ─────────────────
scene-data 写入       Step 1.5  asset-sourcer 采购      门全败 → 报告
 mediaStrategy        Step 1.5c media-patch 内存赋值      → agent 改 prompt
 aiVideo.prompt          │                                → 手动入口重跑
（8 维模板）              ▼                                （≤3 轮，超限上报）
                     Step 1.5d【新】b-roll stage
                       ├─ 收集需生成 scene
                       │   · 'b-roll'：跳过采购，直接生成
                       │   · 'asset-then-broll'：1.5c 后仍无 media 才生成
                       ├─ 缓存命中（赢家文件在 + prompt 未变）→ 直接复用
                       ├─ 生成 2 候选/scene（480×832 竖屏，不同 seed）
                       ├─ VLM 门：claim={voiceover, aiVideo.prompt}，≥60 过
                       ├─ 赢家内存赋值 scene.media（不回写 scene-data）
                       └─ 写 output/{slug}/b-roll-report.json
                            │
                            ▼
                     Step 1.6 final-media-gate（不改）→ 渲染 → verify 报告
```

**关键不变量**
- **非破坏性**：只在候选过门后内存赋值；失败则 scene 原样（无媒体场景走 CSS fallback，final-media-gate 不阻断未设 `media.path` 的场景）。scene-data 文件永不被本模块写入。
- **永不阻塞主管线**：FastVideo 依赖缺失、生成崩溃、VLM 不可用——全部降级为「该 scene 无 B-roll」+ 警告，主管线继续。
- **B-roll 策略与 `mediaOptOut` 冲突时 `mediaOptOut` 赢**（跳过生成）。

## 3. 契约

### 3.1 scene-data 字段（输入）

| 字段 | 类型 | 语义 |
|------|------|------|
| `mediaStrategy` | `'asset' \| 'b-roll' \| 'asset-then-broll'` | 缺省 = `'asset'`（现状）。`'b-roll'` 跳过采购直接生成；`'asset-then-broll'` 采购失败才生成 |
| `aiVideo.prompt` | string | 策略含 b-roll 时**必填**（preflight 强制）。8 维模板（SUBJECT / VISUAL METAPHOR / BRAND / REFERENCE / CAMERA / MOTION / LIGHTING / NEGATIVE） |

校验规则（`verify-video.mjs --pre`）：
- `mediaStrategy` 取值非法 → 拒绝。
- 策略含 b-roll 且 `aiVideo.prompt` 缺失/空串 → 拒绝。
- `mediaOptOut: true` + b-roll 策略 → warn 并跳过生成（不拒绝）。
- `aiVideo` 存在但策略为 `'asset'`（或缺省）→ 忽略（不生成）。

### 3.2 生成（python runner，入库于 `lib/b-roll/`）

- 输入 jobs 文件：`[{ label: "scene-{id}-seed{s}", prompt, output_path（绝对）, seed }]`
- 默认参数（Tier A，M3 Max 安全，源自 spike 实测）：`--height 832 --width 480`（**竖屏**，修正 spike 横屏裁切）`--num-frames 81 --mlx-quantization int8 --decode-backend taehv --dmd-denoising-steps 1000,757,522`，fps 16
- 2 候选/scene，seed 必须互异（默认基数 + 候选序号）
- 模型加载一次跑完整批（沿用 `mlx_wan_batch.py` 的「全去噪后统一解码」结构）
- 外部依赖：FastVideo repo 路径可配（环境变量 `FASTVIDEO_REPO`，默认 `scripts/short-video/experiments/fastvideo-spike/repo`）；python 解释器可配（`FASTVIDEO_PYTHON`；未设时按序探测 `<repo>/.venv/bin/python3` → `~/.video-tts-env/bin/python3`——2026-08-31 实测 spike 可用解释器是 repo 本地 venv，home venv 缺 `cloudpickle`）。任一缺失 → 清晰错误信息 + 跳过，退出码 0（不阻塞）

### 3.3 匹配门（复用现有通道）

- 实现：`lib/visual-analyzer.mjs` → `analyzeAssetSemantics(path, { window, claim })`（`vlm_analyzer.py` 常驻进程，Qwen3-VL-2B + GLM-4.1V 级联）
- `claim = { voiceover: scene 口播, assetNeed: aiVideo.prompt 全文 }`（与采购侧结构对齐）
- 阈值：**60**（与采购侧 relevance 阈值同一把尺子；实现上复用采购侧导出常量，未导出则本地常量 60 并注释指向）
- 比较语义：`relevance >= 60` 过门（含边界值）；`relevance` 缺失 → fail-closed（不过）
- 赢家 = 过门候选中 `relevance` 最高者

### 3.4 产出与缓存

- 候选文件：`content/{slug}/assets/b-roll/scene-{id}-seed{s}.mp4`（`.gitignore` 已覆盖 `content/*/assets/`，天然不入库；输家保留可复盘）
- 清单：`output/{slug}/b-roll-report.json`

```json
{
  "content": "<slug>",
  "updatedAt": "<ISO>",
  "threshold": 60,
  "scenes": {
    "<sceneId>": {
      "strategy": "b-roll | asset-then-broll",
      "promptHash": "<sha1[:12]>",
      "round": 1,
      "status": "pending | won | failed | escalated",
      "prompt": "...",
      "voiceover": "...",
      "candidates": [{ "seed": 1024, "file": "scene-6-seed1024.mp4", "relevance": 72, "reason": "..." }],
      "winner": { "seed": 1024, "file": "scene-6-seed1024.mp4" }
    }
  }
}
```

- **缓存规则**：运行时若 `status==='won'` 且赢家文件存在且 `promptHash` 未变 → 直接内存赋值，不重新生成。文件丢失或 prompt 变更 → 进入生成流程。
- **轮次规则**：`round` = 该 scene 累计生成次数；上一轮 `failed` 且 prompt 变更 → `round+1`；`round > 3` → 拒绝生成，`status='escalated'`，报告输出全部候选与分数，上报用户。
- 手动入口 `--force` 绕过缓存；`--scene <id>` 只处理单 scene。

### 3.5 内存赋值（赢家）

```js
scene.media = {
  type: 'video',
  path: 'assets/b-roll/scene-{id}-seed{s}.mp4', // 相对形式须与现有 media.path 解析机制一致（见场景 #12）
  source: 'AI-generated (FastVideo FastMetal-1.3B-QAD)',
  animation: 'fade',   // video + ken-burns 会降级，直接用 fade
  overlay: 0.7,
  volume: 0,           // Wan 1.3B 无有效音轨，避免噪声
  upscale: false,      // 480×832 会被 render-remotion 的 sub-720p 规则送去 Real-ESRGAN
}
```

不覆盖已有 `scene.media`（与 1.5c 同约定）。

### 3.6 可见性

- `b-roll-report.json`：完整细节（供 agent 迭代读）
- `verify-video.mjs` 报告：新增 B-roll 摘要块（每 scene：策略/状态/赢家分数/是否降级）——HITL 唯一可见通道，不改 HITL 流程本身

## 4. 模块落位

| 文件 | 职责 |
|------|------|
| `scripts/short-video/lib/b-roll/orchestrator.mjs` | 收集 scene、缓存判定、jobs 组装、调 runner、调门、选赢家、写报告、内存赋值 |
| `scripts/short-video/lib/b-roll/gate.mjs` | 封装 visual-analyzer claim 调用 + 阈值判定 |
| `scripts/short-video/lib/b-roll/report.mjs` | b-roll-report.json 读写 + promptHash + 轮次逻辑 |
| `scripts/short-video/lib/b-roll/mlx_wan_batch.py` | 生成运行器（改造自 spike `mlx_wan_batch.py`：外部 repo 路径可配、绝对输出路径、竖屏默认） |
| `scripts/short-video/generate-broll.mjs` | CLI 入口：`--content <dir> [--scene <id>] [--force] [--max-scenes N] [--threshold N]`，启动打印预估耗时（scene 数 × 2 × 240s 实测常量） |
| `scripts/short-video/lib/__tests__/b-roll-*.test.mjs` | 场景矩阵测试 |

修改：`main.mjs`（1.5c 后插入 stage 调用）、`verify-video.mjs`（preflight 校验 + 报告摘要）、`docs/video-workflow.md`（新增 FastVideo/B-roll 段）。

## 5. Scenario & Risk Verification

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/main.mjs` | Step 1.5c 后插入 b-roll stage（单一 guarded 调用，逻辑全在 `lib/b-roll/`） | **High**（核心管线） | 缓解：①无 `mediaStrategy` 字段时该分支零行为；②整段 try/catch → warn 不阻断；③测试 #1/#2 验证无策略内容行为不变；④最坏后果 = B-roll 不生效，主管线照常 |
| `scripts/short-video/verify-video.mjs` | preflight 增加 4 条契约校验；报告增加 B-roll 摘要块（纯追加） | Medium | 追加不改现有校验；新校验只在新字段出现时触发；最坏后果 = 含新字段的 scene-data 被误拒 → 测试 #3-#6 覆盖 |
| `docs/video-workflow.md` | 新增 FastVideo/B-roll 章节（安装约定、参数档、prompt 模板、迭代协议） | Low | 纯追加 |
| 新建 `lib/b-roll/*` + `generate-broll.mjs` + 测试 | 全部新文件 | Low | 无既有消费者 |

不修改：`asset-sourcer.mjs`、`final-media-gate.mjs`、`media-bg.mjs`、Remotion 组件、任何 `content/*/scene-data.mjs`。

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | scene 无 `mediaStrategy` 字段 | 行为与现状完全一致：走采购，b-roll stage 跳过 | Low | 测试断言 stage no-op |
| 2 | 内容目录所有 scene 均无策略 | 管线无感知：无生成、无报告文件、无额外日志噪声 | Low | 同上 |
| 3 | `mediaStrategy` 取值非法（如 `'broll'`） | preflight 拒绝，错误指明 scene id + 合法取值 | Medium | preflight 测试 |
| 4 | 策略含 b-roll 但 `aiVideo.prompt` 缺失 | preflight 拒绝 | Medium | preflight 测试 |
| 5 | 策略含 b-roll 但 `aiVideo.prompt` 为空串/纯空白 | 同 #4 拒绝 | Medium | preflight 测试 |
| 6 | `aiVideo` 存在但策略 `'asset'` | 忽略 `aiVideo`，正常采购 | Low | 测试 |
| 7 | `mediaOptOut: true` + b-roll 策略 | warn + 跳过生成（不拒绝） | Medium | 测试 |
| 8 | `'b-roll'` 策略 | 跳过采购，直接生成 | Medium | 测试（采购不被调用） |
| 9 | `'asset-then-broll'` + 采购成功 | 不生成，用采购结果 | Medium | 测试 |
| 10 | `'asset-then-broll'` + 采购失败（1.5c 后仍无 media） | 触发生成 | Medium | 测试 |
| 11 | FastVideo repo / python 环境缺失 | 清晰错误 + 跳过全部生成，主管线继续，退出码不受影响 | High | 探测函数测试 + 真实环境验证 |
| 12 | 赢家产生后渲染消费 | `media.path` 相对形式在 HTML（media-bg）与 Remotion（staticFile）两路径均可解析为存在的文件；`<video>` 静音循环播放 | High | 实现时核实现有解析机制；smoke test 出片人工确认 |
| 13 | 2 候选中 1 条过门（≥60）1 条不过 | 过门者赢，内存赋值；输家文件保留 | Medium | gate 测试 |
| 14 | 2 候选都过门 | 分数最高者赢；平分取 seed 较小者（确定性） | Medium | gate 测试 |
| 15 | 2 候选都不过门 | 不赋值，`status='failed'`，报告含 prompt+分数+VLM reason，scene 保持原样 | High | gate 测试 + 非破坏性断言 |
| 16 | `relevance` 缺失（VLM 降级返回） | fail-closed：不过门 | Medium | gate 测试 |
| 17 | `relevance === 60`（边界） | 过门（`>=`） | Low | gate 测试 |
| 18 | 缓存命中（won + 文件在 + prompt 未变） | 不生成，直接内存赋值 | Medium | orchestrator 测试 |
| 19 | 清单记录 won 但赢家文件已删除 | 缓存失效 → 重新生成 | Medium | orchestrator 测试 |
| 20 | `--force` | 绕过缓存，重新生成并覆盖清单 | Low | CLI 测试 |
| 21 | 同一 scene 失败后 prompt 变更重跑 | `round+1`，正常生成 | Medium | report 轮次测试 |
| 22 | `round > 3` 仍请求生成 | 拒绝生成，`status='escalated'`，输出全部历史候选与分数 | Medium | report 轮次测试 |
| 23 | 批量中单个 job 崩溃（runner 异常） | 其余 job 产出保留；失败 scene 记 `failed`+原因；主管线继续 | High | runner 容错测试（mock）+ smoke |
| 24 | 0 个 scene 需要生成 | 入口干净退出，不写报告、不探测依赖 | Low | CLI 测试 |
| 25 | 多 scene 混合策略 | 一个 python 批次跑完所有需生成 scene（模型加载一次） | Medium | orchestrator 测试（jobs 组装） |
| 26 | 生成画幅 | 默认竖屏 480×832（`--height 832 --width 480`） | Medium | runner 参数测试 |
| 27 | verify 报告 | 含 B-roll 摘要：每 scene 策略/状态/赢家分数/降级标记 | Low | 报告测试 |
| 28 | scene-data 文件完整性 | b-roll 全流程运行后，scene-data 文件内容零变化（非破坏性） | High | 集成测试断言文件 hash 不变 |

> 数值/单位：relevance 0-100 整数语义与采购侧一致；预估耗时 = scene 数 × 2 候选 × 240s（spike 实测，常量可配）。并发：管线单进程，无竞态面。

## 6. 验收标准

1. 测试覆盖上表全部 28 行（vitest，`scripts/short-video/`）。
2. **Real Data Smoke Test**：对 `content/qwen4-preview` 的 scene 5/6/8 添加 `mediaStrategy` 夹具字段（fixture 配置，非内容优化），跑 `generate-broll.mjs` + 经主管线渲染，确认：赢家文件产生、内存赋值生效、成片含 B-roll 视频层、报告与 verify 摘要正确。现有 `aiVideo` prompt 为薄 prompt——本测试验证**机制**，不要求画面质量（质量验证属后续内容工作）。
3. `npm run lint && npx tsc --noEmit` 通过；`generate-broll.mjs --help` 可用。
4. `docs/video-workflow.md` FastVideo/B-roll 段落就位（安装约定 + Tier A 参数 + 8 维 prompt 模板 + agent 迭代协议）。
5. 4 个延期 issue 开出（见 §7）。

## 7. 范围外（各开 GitHub issue，含本 session 上下文 + 建议方案）

1. `aiImage` 静态图生成（T2I 补数据图/架构图场景）
2. 视频叠加合成模式（B-roll 垫在真实图表下的复合层）
3. 换生成模型评估（LTX 2.3 / Wan 2.2 / Helios，GPU 环境，参数从官方 README 起）
4. ComfyUI/MCP 迭代式生成集成

另：prompt 外部专用模型扩写（Q3 备选路线）在 8 维模板验证不佳时再议，暂不开 issue——先等任务验证数据。

## 8. 关键事实索引（源码核实）

- 采购阈值：`asset-sourcer.mjs:732-736`（relevance <60 拒绝，缺失 fail-closed）、`:2103`（CLI 默认 60）
- VLM claim 通道：`vlm_analyzer.py:126-154`（Scene Claim → Relevance 0-100）；`visual-analyzer.mjs:53-62`
- 钩子点：`main.mjs:184-231`（Step 1.5c）；1.5 过滤 `:159-169`
- final-media-gate：仅对「已设 media.path 但文件缺失」阻断（`final-media-gate.mjs:51-65`）
- video 渲染：`media-bg.mjs:275`（autoplay loop muted）；`MediaBackground.tsx:121-125,172-173`（volume 默认 0.08、overlay 默认 0.7）
- gitignore：`content/*/assets/` 整体忽略（`.gitignore:116-119`）
- spike 实测：job 去噪 226-315s/条（M3 Max, int8/taehv, 832×480×81f）
