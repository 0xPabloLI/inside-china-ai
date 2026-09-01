# Tickets: B-roll 生成能力（管线化）

> Spec：`spec-broll-generation-capability.md`（2026-08-31，已确认）
> 规则：逐 ticket TDD（red → green → refactor）；场景矩阵行号（#N）= 测试用例；每完成一项立即把 `- [ ]` 改 `- [x]` 落盘。
> 依赖边：`T4 ← {T1,T2,T3}`；`T5 ← T4`；`T6 ← T4`；`T7 ← T3`；`T8 ← 全部`。
> 测试位置：`scripts/short-video/lib/__tests__/b-roll-*.test.mjs`（vitest，config 在 `scripts/short-video/vitest.config.mjs`）。

---

## T1 — 报告与轮次契约（`lib/b-roll/report.mjs`）

纯逻辑层，无外部依赖。产出：`readReport/writeReport`、`promptHash`、缓存判定（`decideCache`）、轮次推进（`nextRound`）、escalation 判定。

- [x] 先写测试：#18（缓存命中）、#19（赢家文件丢失→缓存失效）、#21（失败+prompt 变更→round+1）、#22（round>3→escalated 拒生成）
- [x] red 确认后实现 `report.mjs`
- [x] refactor：常量（`MAX_ROUNDS=3`、报告路径约定 `output/{slug}/b-roll-report.json`）

## T2 — 匹配门（`lib/b-roll/gate.mjs`）

封装 `analyzeAssetSemantics` claim 调用（测试用 mock）+ 阈值判定 + 赢家选择。阈值复用 `asset-sourcer.mjs` 导出常量；未导出则本地 `60` 并注释指向。

- [x] 先写测试：#13（1 过 1 不过）、#14（都过→最高分，平分取 seed 小者）、#15（都不过→不赋值 + failed 报告结构）、#16（relevance 缺失→fail-closed）、#17（===60 过门）
- [x] 实现 `gate.mjs`（依赖注入：analyzer 函数可传入，便于 mock）
- [x] refactor

## T3 — 生成运行器（`lib/b-roll/mlx_wan_batch.py` + `runner.mjs`）

python 运行器从 `experiments/fastvideo-spike/mlx_wan_batch.py` 改造：repo 路径/输出路径参数化、默认竖屏。**不复制** `repo/`（FastVideo 本体）。`runner.mjs` 负责：依赖探测（`FASTVIDEO_REPO`/`FASTVIDEO_PYTHON`，默认路径见 spec §3.2）、jobs 文件写入、spawn、失败容错。

- [x] 先写测试：#11（依赖缺失→清晰错误+优雅跳过，退出码 0 语义）、#26（默认参数 `--height 832 --width 480` 竖屏）、#23（单 job 崩溃→其余保留，结构化错误返回）
- [x] 移植并改造 `mlx_wan_batch.py`（保持「全去噪后统一解码」结构；`--jobs` 绝对路径）
- [x] 实现 `runner.mjs`（spawn + 超时/崩溃处理 + 输出文件存在性核对；python 探测默认 `<repo>/.venv` → `~/.video-tts-env`）
- [x] 真实环境手动验证：竖屏 clip 出片 `output_mirror/t3_portrait.mp4`（480×832×81f@16fps，encode 28.6s + denoise 183.7s + decode 22.3s ≈ 235s，240s 常量成立）

## T4 — Orchestrator（`lib/b-roll/orchestrator.mjs`）← T1,T2,T3

收集需生成 scene（路由 + 守护）→ 缓存判定 → jobs 组装（2 候选/scene，seed 互异，单批次）→ 调 runner → 调 gate → 赢家内存赋值 → 写报告。导出纯函数 `planScenes(scenes, report)` 便于测试。

- [x] 先写测试：#1/#2（无策略 no-op）、#6（aiVideo+asset→忽略）、#7（mediaOptOut 赢）、#8（b-roll 跳过采购语义）、#9/#10（asset-then-broll 两分支）、#25（多 scene 单批次）、#28（不回写——`planScenes` 不改输入）
- [x] 实现 `orchestrator.mjs`（`assignWinner` 不覆盖已有 `scene.media`）
- [x] refactor

## T5 — CLI 入口（`generate-broll.mjs`）← T4

`--content <dir> [--scene <id>] [--force] [--max-scenes N] [--threshold N]`；启动打印预估耗时（`需生成数 × 2 × 240s`）。

- [x] 先写测试：#20（--force 绕缓存）、#24（0 个需生成→干净退出，不写报告不探测依赖）
- [x] 实现入口（参数解析 + 预估打印 + 结果汇总打印）
- [x] `--help` 手动验证

## T6 — 管线接入（`main.mjs` hook + `verify-video.mjs`）← T4

**High 风险文件，最小侵入**：`main.mjs` Step 1.5c 后插入单一 guarded 调用（整段 try/catch → warn）；`verify-video.mjs` preflight 加 4 条契约校验 + 报告加 B-roll 摘要块（纯追加）。

- [x] 先写测试：#3/#4/#5（preflight 拒绝三态）+ 现有 preflight 回归（无新字段的 scene-data 全绿）→ `checkMediaStrategyContract`（`lib/scene-rules.mjs`，10 测试，含 qwen4-preview「有 aiVideo 无策略」不拒绝）
- [x] 报告摘要测试：#27 → `summarizeBrollReport`（`lib/b-roll/report.mjs`，8 单测）+ `verify-guard-cli` 2 条 CLI 级断言（有报告打印 / 无报告零输出）
- [x] 实现 `main.mjs` hook（Step 1.5 前置一次性 dynamic import；#8 用导出的 `shouldSourceStock`；Step 1.5d 放在 1.5b upscale **之后**，避免 480×832 clip 被送进 Real-ESRGAN；整段 try/catch + finally closeVisualAnalyzer）
- [x] 零行为验证：**未跑完整管线**（会重跑 TTS/渲染并覆盖既有 `output/`）。改为谓词等价扫描：17 个真实内容目录 / 140 scene → sourcing 判定 diff=0、b-roll 工作项=0（Step 1.5d 分支不触发）；`verify-video --pre` 对既有内容无新增输出；unit 全量 2418 passed，11 个失败为既有基线（publish-utils 1 / verify-guard-cli 3 / research e2e 7）

## T7 — 文档（`docs/video-workflow.md`）← T3

新增 FastVideo/B-roll 章节：安装约定（repo/python 路径、探测行为）、Tier A 参数档（含 Tier B 注记：refine/wan-vae/全精度在 M3 Max 会 OOM）、8 维 prompt 模板 + 「数字进字幕层」规则、agent 迭代协议（读报告→改 prompt→重跑，≤3 轮）、缓存与 `--force`。

- [x] 写章节（事实与代码一致，参数从实现取）——`docs/video-workflow.md` → `## B-roll Generation (FastVideo MLX)`
- [x] 与 `docs/content-pipeline.md` 交叉指针（写分镜阶段的 `aiVideo` 契约）——Stage 3 step 8；另更新 `AGENTS.md` Content Pipeline 指针与 `docs/DOCS-INDEX.md` 行

## T9 — VLM 视频输入修复：一律抽帧 + claim 模式升级判据 ← T8

> T8 真实数据验证时发现（用户批准 Option B）：GLM-4.1V 经 `mlx_vlm.generate(video=…)` 收不到画面（同 prompt 下与无关素材逐字节同判词），2B native 正常但 claim 模式不输出可解析的 `## Relevance`。共享层改动（asset-sourcer video 门与 #127 共用）。

- [x] 取证：2B + frames + 真实 claim 的 raw 输出，确认 Relevance 缺失是模型没写还是解析没匹配——**模型写了，正文是 `Score 0` + 解释文字**，`fullmatch` 裸整数匹配失败 → 已加 `_parse_relevance_value`（首行起始数字，支持 `70`/`**70**`/`Score 0`/`0 - prose`/`70/100`，其余 fail-closed）
- [x] `vlm_analyzer.py`：视频主路径与升级路径一律 `extract_frames` → `image_paths`，删除 native video 分支（含 `generate_response` 的 `video_path` 参数），`sourceMode` 统一 "frames"
- [x] `should_escalate` 增加 claim-mode：claim 在场时不因 description 短/词重复升级，只在 `relevance is None`（或 description 空）时升级
- [x] 更新 `test_should_escalate.py`（claim-mode 用例）+ 相关解析测试，red → green（23/23 + 15/15 python；87/87 mjs——`visual-analyzer.test.mjs`×3、`asset-sourcer-visual-integration.test.mjs`×1 的 `sourceMode: "native"` 断言对齐为 "frames"）
- [x] Real Data Smoke Test：修复后重跑 gate 探针，三种判定互不相同且接地——scene-5 素材 **0**（真拒绝）、scene-8 素材 **80**（`contentKind: chart`）、对照组 talking-head **0** 且判词独立；全部 `sourceMode: "frames"`、零升级。编排器重跑后 scene 8 报告已翻正：round 3 won，80/75，winner seed1024
- [x] T8 报告里作废的分数重跑（scene 8 ✅ round 3 won；scene 5 ✅ `--force` 诚实重判 round 2 failed，0/0，零升级——报告理由已驱动 round 2 prompt 重写）
- [x] Scene 5 prompt 迭代 round 2：判官拒绝理由 = 「cubes morph 不是 bar chart、无 cost 语义」→ 重写为「高光柱缩到短柱高度 + reflective studio floor」（`scene-data.mjs:115`）
- [x] Scene 5 round-2 重跑验证：**won round 3**，seed1024 relevance **80** ≥ 60（seed1025 被渲染成数字「1」得 0，佐证判词真实）——agent 迭代协议（报告→改 prompt→重跑）一轮闭环
- [x] Scene 8 prompt 迭代（早于本 ticket 文件记录，补记）：round 1 拒绝 → 重写 → round 3 won 80/75，winner seed1024
- [x] Code review（Spec 轴）修正：`_parse_relevance_value` 原实现对数字开头散文 fail-open（「3 examples of charts」→3）→ 收紧为首行必须**是**分数（裸 / `/100` / 破折号散文尾），red（2 用例按预测值失败）→ green（17/17）；`visual-analyzer.test.mjs` 环境测试加 save/restore 隔离环境变量污染 + 补 `HF_HUB_OFFLINE=0` opt-out 用例（mjs 102/102）

## T10 — HF_HUB_OFFLINE 固化进 spawn env（用户指示；#159 第 2 项提前落地）

> 此前只在 `docs/video-workflow.md:109` 文档化为手动 `export`（治 TTS etag 挂起时留的），未固化进代码 → 新 shell 跑管线照旧打 HF 版本查询。用户要求加上并验证。

- [x] `runner.mjs` + `visual-analyzer.mjs` spawn env 默认 `HF_HUB_OFFLINE=1`（父进程显式 `HF_HUB_OFFLINE=0` 可退出；`runGeneration` 新增可注入 `env` 参数，与 `resolveDependencies` 约定一致）
- [x] red → green（`b-roll-runner.test.mjs` ×2 + `visual-analyzer.test.mjs` ×1；三文件 101/101 绿）
- [x] 真实验证：`HF_ENDPOINT=http://127.0.0.1:9`（哑端点）跑 `--scene 5 --force`，EXIT:0——日志全文无任何 `GET huggingface.co/.../revision/main`（对照：修复前同位置有 200 OK 行），无连哑端点报错，生成+VLM+gate 纯缓存完成 = 零网络证明；同跑完成 scene 5 诚实重判（见 T9）

## T8 — Real Data Smoke Test + 延期 issue ← 全部

- [x] `content/qwen4-preview` scene 5/6/8 加 `mediaStrategy` 夹具字段（fixture 配置，提交时注明非内容优化）
- [x] 跑 `generate-broll.mjs --content qwen4-preview`：2 候选/scene 出片、门打分、赢家赋值、报告正确（scene 8 round 3 won 80/75；scene 5 round 3 won 80，winner seed1024——报告拒绝理由→prompt 重写→重跑的 agent 迭代协议闭环验证）
- [x] 经主管线渲染含 B-roll 的成片，人工确认 `<video>` 层正常——**按用户决定（2026-09-01）不专门重跑**：B-roll 侧证据已绿（pre-render「✅ B-roll strategy contract」、verify-video B-roll Checks「✅ Scene 5 / ✅ Scene 8 won round 3 relevance 80」、Step 1.5d 缓存命中赢家赋值正确）；渲染本体曾被并行 text-overflow session 的在途缺陷挡住（`narrative.stacked-cards.badge` 的 `MEASURED_MAX_WIDTH` 缺测量值，text-slots.mjs:473 fail-fast，该 session 自行修复中）→ 用户决定随下一个真实内容视频自然验证成片路径，不为此重跑 `main.mjs`
- [x] 验证失败路径：`FASTVIDEO_REPO=/nonexistent-fastvideo` + `--scene 8 --force`（临时降 round 到 2 以通过 3 轮上限，跑后从备份恢复报告）→ `⚠️ B-roll skipped: FastVideo repo not found...`，EXIT:0，零 GPU 启动、报告未写——优雅降级契约固证；实测另发现：`--force` 作用于 won@round3 的 scene 会先触发 3 轮上限拒绝（escalated:1），不会到达 deps 探测（设计行为，报告状态已从误伤中恢复）
- [x] `gh issue create` × 4（spec §7 范围外项）＝ **[#155](https://github.com/0xPabloLI/inside-china-ai/issues/155) aiImage 静态图、[#156](https://github.com/0xPabloLI/inside-china-ai/issues/156) B-roll 叠加合成、[#157](https://github.com/0xPabloLI/inside-china-ai/issues/157) 生成模型横评、[#158](https://github.com/0xPabloLI/inside-china-ai/issues/158) ComfyUI/MCP**——压缩前已开出（当时漏勾本项致压缩摘要误导为未做）；压缩后误开的重复 [#160–163](https://github.com/0xPabloLI/inside-china-ai/issues/160) 已全部关闭并注明指向原 issue。另 #159 = runner 透传，调研中发现
- [x] `npm run lint && npx tsc --noEmit` 通过（全量 lint + `tsc --noEmit` + `npm run build` 均 EXIT:0，2026-09-01；`render-remotion.mjs` 的混合 hunk 随并行 session 的 commit 走）
