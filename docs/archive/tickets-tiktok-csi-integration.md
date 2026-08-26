# Tickets: TikTok CSI + AI Outline CDP 集成

> **Spec**: `docs/spec-tiktok-csi-integration.md`
> **创建于**: 2026-08-26

---

## T-1: CDP 前置验证 + DOM 结构探索

- [ ] T-1a: 用 web-access CDP 打开 `tiktok.com/inspiration`，截图记录页面状态
- [ ] T-1b: 检查 CSI 是否可见（话题列表是否渲染）
- [ ] T-1c: 检查 AI Outline 是否可用（选一个话题进入详情页，看是否有 AI Outline section）
- [ ] T-1d: 记录关键 DOM 选择器（话题列表项、话题详情页、AI Outline 输入框、生成输出区域）
- [ ] T-1e: 记录页面 URL pattern（话题列表、话题详情、Search Analytics 的 URL 格式）
- [ ] T-1f: 将验证结果写入 `docs/research/tiktok-creator-tools.md` §3.3

**依赖**: 无
**产出**: DOM 结构文档 + 可见性结论

## T-2: tiktok-csi.mjs 核心库 + checkCsiAvailability()

- [ ] T-2a: 写 `checkCsiAvailability()` 函数的 mock 单元测试（场景 1-3）
- [ ] T-2b: 实现 `checkCsiAvailability()`——CDP 打开页面，检测登录态、CSI 可见性、AI Outline 可见性
- [ ] T-2c: 写 CLI 入口 `--check` 命令
- [ ] T-2d: CDP 集成测试（手动运行 `--check`，验证返回值）

**依赖**: T-1（需要 DOM 选择器）
**产出**: `scripts/short-video/lib/tiktok-csi.mjs`（含 checkCsiAvailability + CLI --check）

## T-3: generateAiOutline() — AI Outline 生成

- [ ] T-3a: 写 `generateAiOutline()` 函数的 mock 单元测试（场景 4, 5, 9, 11, 14）
- [ ] T-3b: 实现 `generateAiOutline()`——CDP 导航到话题详情页，输入 prompt，提取 title/hashtags/hooks
- [ ] T-3c: 实现降级逻辑——AI Outline 不可用时抓取 creator tips（场景 5）
- [ ] T-3d: 实现 `--refresh N` 多次生成逻辑（场景 11）
- [ ] T-3e: 实现已有 metadata 检测 + 覆盖确认（场景 14）
- [ ] T-3f: 写 CLI 入口 `--ai-outline --content <dir>` 命令
- [ ] T-3g: CDP 集成测试（手动运行，验证生成结果）

**依赖**: T-2（复用 CDP 基础设施）
**产出**: generateAiOutline + CLI --ai-outline

## T-4: fetchContentGapTopics() — Content Gap 话题

- [ ] T-4a: 写 `fetchContentGapTopics()` 的 mock 单元测试（场景 12）
- [ ] T-4b: 实现 `fetchContentGapTopics()`——CDP 打开 CSI，过滤 Content Gap，提取话题列表
- [ ] T-4c: 输出到 `output/csi-content-gap.json`
- [ ] T-4d: 写 CLI 入口 `--content-gap` 命令
- [ ] T-4e: CDP 集成测试

**依赖**: T-2
**产出**: fetchContentGapTopics + CLI --content-gap

## T-5: fetchSearchAnalytics() — Search Analytics per-video

- [ ] T-5a: 写 `fetchSearchAnalytics()` 的 mock 单元测试（场景 13）
- [ ] T-5b: 实现 `fetchSearchAnalytics()`——CDP 打开 CSI Search Analytics，提取 per-video 数据
- [ ] T-5c: 追加到 `output/hashtag-effect-tracker.jsonl`
- [ ] T-5d: 写 CLI 入口 `--search-analytics` 命令
- [ ] T-5e: CDP 集成测试

**依赖**: T-2
**产出**: fetchSearchAnalytics + CLI --search-analytics

## T-6: 文档更新

- [ ] T-6a: 更新 `docs/research/tiktok-creator-tools.md` §2.4（#creatorsearchinsights 已从黑名单移除）
- [ ] T-6b: 更新 `docs/content-pipeline.md`——Stage 3 后新增 Stage 1b: AI Outline 步骤
- [ ] T-6c: 更新 `docs/analytics-workflow.md`——步骤 ④b 后追加 CSI Search Analytics
- [ ] T-6d: 更新 `docs/research/tiktok-creator-tools.md` §3.3——填入 Phase 0 验证结果

**依赖**: T-1 ~ T-5 全部完成
**产出**: 文档同步

---

## 依赖图

```
T-1 (前置验证) ──→ T-2 (核心库) ──→ T-3 (AI Outline)
                                  ├─→ T-4 (Content Gap)
                                  └─→ T-5 (Search Analytics)
T-1 ~ T-5 全部完成 ──→ T-6 (文档更新)
```
