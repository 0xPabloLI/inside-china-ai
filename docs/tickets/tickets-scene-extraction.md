# Tickets: 场景提取 + 共享视觉系统分离 + 基础设施迁移

## T1 — 创建共享视觉系统 (`lib/base-styles.mjs`)

**What to build:** 新建 `lib/base-styles.mjs`，导出共享视觉系统：`baseStyles(duration)`（CSS 变量 + 背景层 + 动画 keyframes + 画布规格）、`BRAND_MARK_SVG`（品牌 logo）、`withWatermark(html)`（注入水印）、UI 组件积木（`brandBar`、`breakingBadge`、`statCard`、`fadeToBlack`）。附带单元测试。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `lib/base-styles.mjs` 导出 `baseStyles(duration)` 返回含 `:root` CSS 变量和 keyframes 的字符串
- [ ] 导出 `BRAND_MARK_SVG` 从 `assets/china-ai-news-logo-vector.svg` 读取（XML 声明已清理）
- [ ] 导出 `withWatermark(html)` 在 `</div></body>` 前注入 `.brand-watermark` div
- [ ] 导出 UI 组件积木：`brandBar(text)`, `breakingBadge(text)`, `statCard({num, unit, label, color})`, `fadeToBlack(duration)`
- [ ] 单元测试验证所有导出

## T2 — 基础设施迁移到 `lib/` + 修复路径 bug

**What to build:** 5 个 infra 文件移到 `lib/`，修复 `__dirname` 路径引用，修复 `assemble.mjs` 输出文件名 bug（用 `pipelineId`），修复 `generate-bgm.mjs` 输出路径 bug（用 `outputDir` 参数），更新 `main.mjs` import 路径。验证 DeepSeek 管线端到端跑通。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `generate-tts.mjs` → `lib/generate-tts.mjs`，8 处 `__dirname` 路径加 `..`
- [ ] `assemble.mjs` → `lib/assemble.mjs`，输出文件名用 `pipelineId` 参数
- [ ] `generate-srt.mjs` → `lib/generate-srt.mjs`
- [ ] `record-scenes.mjs` → `lib/record-scenes.mjs`
- [ ] `generate-bgm.mjs` → `lib/generate-bgm.mjs`，输出路径用 `outputDir` 参数
- [ ] `main.mjs` 5 个 import 路径更新为 `./lib/`
- [ ] `main.mjs` 调用 `assembleVideo` 传入 `meta.pipelineId`
- [ ] `main.mjs` 调用 `generateBGM` 传入 `outputDir`
- [ ] 路径存在性测试验证 TTS 引用的脚本/资产路径正确
- [ ] DeepSeek 管线端到端跑通

## T3 — 提取 DeepSeek 场景到 `content/deepseek/scenes.mjs`

**What to build:** s1-s12 从 `generate-scenes.mjs` 提取到 `content/deepseek/scenes.mjs`，改为 `(scene, duration)` 签名，从 `scene.texts` 读取显示文字，公司 logo 移到 `assets/logos/deepseek.svg`，补全 `scene-data.mjs` 的 `texts` 字段。附带单元测试验证每个场景的 HTML 输出。

**Blocked by:** T1

**Status:** ready-for-agent

- [ ] `assets/deepseek-logo.svg` → `assets/logos/deepseek.svg`
- [ ] `content/deepseek/scenes.mjs` 从 re-export 改为完整 s1-s12 场景函数
- [ ] 每个场景函数接收 `(scene, duration)`，从 `scene.texts` 读取显示文字
- [ ] 缺失 `texts` 字段安全降级（不渲染该元素，不显示 undefined）
- [ ] `content/deepseek/scene-data.mjs` 补全所有场景的 `texts` 字段
- [ ] 导出 `generateScene(scene, duration)` 按 `scene.id` 分发 + `withWatermark()` 包装
- [ ] 单元测试验证 12 个场景的 HTML 输出含品牌水印、CSS 变量、`texts` 文字

## T4 — 删除 `generate-scenes.mjs` + stub 蒸馏 pt1

**What to build:** 删除 `generate-scenes.mjs`（含死代码字幕函数），`content/distillation/pt1/scenes.mjs` 改为 stub throw，grep 验证无残留 import。最终验证：DeepSeek 管线完整跑通 + 蒸馏 pt1 报明确错误。

**Blocked by:** T3

**Status:** ready-for-agent

- [ ] `generate-scenes.mjs` 删除
- [ ] `content/distillation/pt1/scenes.mjs` 改为 stub throw
- [ ] grep 验证无文件 import `generate-scenes.mjs`
- [ ] grep 验证 `splitSubtitles`/`alignWithWhisper`/`buildSubtitleHTML` 不存在于任何文件
- [ ] DeepSeek 管线端到端跑通
- [ ] `--content distillation/pt1` 抛出明确错误
