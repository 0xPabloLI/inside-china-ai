# Spec: TikTok Best Practices — Rules Sync & Drift Prevention

> 创建于 2026-08-06。基于 Grill 阶段对齐审计结果，修复 `tiktok-best-practices.md` 与 `scene-rules.mjs` / `SKILL.md` 之间的 drift 和 gap。

---

## Problem Statement

视频管线的 TikTok 最佳实践规则分散在三个层次（`tiktok-best-practices.md` → `SKILL.md` → `scene-rules.mjs`），采用手工翻译模式同步。审计发现 3 个 DRIFT（代码行为与文档规格不一致）、4 个可补 GAP（可实现但未实现）、AI 词汇黑名单缺失 ~19 个词/短语。没有自动化机制防止未来再 drift。

## Solution

1. **方案 A — 共享配置文件**：将所有可配置规则常量（黑名单词、正则模式、阈值）抽取到 `tiktok-rules.mjs`，作为单一真相源。`scene-rules.mjs` 从中 import，不再自己定义常量。
2. **方案 B — Drift 检测测试**：新增不变式约束测试，验证 `tiktok-rules.mjs` 导出的常量满足关键不变式（词数 ≥40、关键代表词存在、阈值值正确、正则有效）。
3. **Drift 修复**：将审计发现的 3 个 DRIFT + 4 个可补 GAP 全部修复，同步更新文档。

## User Stories

1. 作为视频管线开发者，我想要一个共享配置文件存放所有 TikTok 规则常量，这样修改一处即可同步到所有消费者。
2. 作为视频管线开发者，我想要 drift 检测测试，这样未来修改规则常量时如果破坏了不变式会立即报错。
3. 作为 agent，我想要 AI 黑名单完整覆盖文档中列出的所有词/短语，这样 LLM 辅助生成的 scene-data 也能被有效检查。
4. 作为 agent，我想要 B4（Hook VO vs 屏幕文字重叠）有三级反馈（FAIL/WARN/PASS），这样轻微重叠不 block、严重重叠才 block。
5. 作为 agent，我想要 B2（结果前有开场）检测 Hook 开头的问候词，这样 "hey guys" 这类开场会被自动 catch。
6. 作为 agent，我想要 caption 超 2200 字符时 verify-video.mjs 报 FAIL（而非 warn），这样超长 caption 不会静默通过。
7. 作为文档维护者，我想要 `tiktok-best-practices.md` 的审计清单与代码实际行为一致，这样文档可信。
8. 作为文档维护者，我想要 `video-workflow.md` 的三层执行表与代码实际检查项一致，这样 agent 和用户看到的 checklist 是准确的。
9. 作为文档维护者，我想要 `SKILL.md` 中的黑名单列表与 `tiktok-rules.mjs` 一致，这样 agent 写 scene-data 时参照的规则与 verify 检查的规则相同。

## Implementation Decisions

### 1. 新建 `tiktok-rules.mjs`（单一真相源）

位置：`scripts/short-video/lib/tiktok-rules.mjs`

导出所有规则常量：
- `AI_BLACKLIST`（~40 个词/短语，按类别分组带注释）
- `DASH_PATTERN`、`DEAD_CLOSER_PATTERN`、`STRONG_WORD_PATTERN`、`NUMBER_PATTERN`
- `WRITTEN_OPENER_PATTERN`、`SOURCE_PATTERN`、`CTA_PATTERN`、`CLICKBAIT_PATTERNS`
- `WATERMARK_PATTERN`、`GREETING_PATTERN`（新增）
- `TARGET_KEYWORDS`、`KNOWN_COMPANIES`
- `THRESHOLDS` 对象（所有数值阈值集中管理）

### 2. 重构 `scene-rules.mjs`

- 删除所有本地常量定义，改为从 `tiktok-rules.mjs` import
- `AI_BLACKLIST` 改为 re-export（保持现有 `export const AI_BLACKLIST` 的公共接口不变）
- `checkHookDiffersFromText()` 改为三级：
  - overlap ≥ 80% → FAIL
  - 50% ≤ overlap < 80% → WARN
  - overlap < 50% → PASS
- 新增 `checkNoGreeting(scenes)` — 检测 Hook VO 开头前 3 个词中的问候词
  - GREETING_PATTERN: `\b(hey|hi|hello|what's up|welcome back|good morning|good evening|yo|sup)\b/i`
  - 只检查 scene[0].voiceover 的前 3 个词（避免误报 "hi-tech"）
  - 有则 FAIL，无则 PASS
- `runAllSceneDataChecks` 中加入 `checkNoGreeting`

### 3. 强化 `generate-caption.mjs`

- 约束违反从 `console.warn` 改为 `console.error` + `process.exit(1)`
- 违反项：title > 60、caption > 2200、hashtags 不在 3-5 范围

### 4. 修改 `verify-video.mjs`

- generate-caption.mjs 调用的 try/catch 中：检测 exit code != 0 时，将 caption 生成失败记为 FAIL（而非当前的 warn）
- post-render 增加 caption 文件存在性 + 长度检查（如果 caption 文件已存在）

### 5. 更新 `tiktok-best-practices.md` 审计清单

| 规则 | 文档原状 | 更新为 |
|---|---|---|
| B2 | Blocker（完全未实现） | Blocker（部分自动化：问候语检测 by code；logo/慢推 by agent） |
| B4 | Blocker（两层完全相同词语） | Blocker ≥80% overlap / WARN 50-80% / PASS <50% |
| B6 | Blocker（caption > 2200） | Blocker（由 generate-caption.mjs 执行，verify-video.mjs 检查 exit code） |
| W1 | Warning（Hook 无数字） | **Blocker**（代码为 FAIL，文档同步） |
| W2 | Warning（hashtag 6+） | Warning（由 generate-caption.mjs 限制 3-5） |
| W5 | Warning（空三段式） | Warning（agent only，不可自动化） |
| B7 | Blocker（AI 词汇） | Blocker（黑名单已补全至 ~40 个） |

### 6. 更新 `video-workflow.md` 三层执行表

- ✅ 全自动检查表新增：B2 问候语检测、B4 三级化
- ✅ 全自动检查表更新：B7 黑名单已补全
- caption 级检查新增：B6 caption ≤ 2200（generate-caption.mjs）
- agent-assisted 表更新：B2 logo/慢推、W5 空三段式

### 7. 更新 `SKILL.md`

- De-AI Voice Rules 黑名单更新为完整 ~40 词
- 新增 greeting 检测规则到 Best Practices Checklist
- B4 重叠规则说明更新

### 8. 新建 `tiktok-rules-sync.test.mjs`

不变式约束测试（非 markdown 解析）：
- `AI_BLACKLIST` 包含各类别代表词
- `AI_BLACKLIST.length >= 40`
- 所有 pattern 是有效 RegExp
- THRESHOLDS 值与文档一致
- GREETING_PATTERN 覆盖文档中的问候词

## Testing Decisions

- **测试 seam**：`tiktok-rules.mjs` 导出的常量 + `scene-rules.mjs` 的纯函数检查（现有 seam）
- **先有测试**：`scene-rules.test.mjs` 先更新期望值（red），再改实现（green）
- **drift 测试**：`tiktok-rules-sync.test.mjs` 测试常量不变式，不测试外部行为
- **现有测试**：`scene-rules.test.mjs` 中的 `validScenes` 需验证不触发新规则（已确认安全）
- **generate-caption.mjs**：现有测试 `publish-article.test.mjs` 不涉及 caption exit code，不受影响。但 `caption-utils.test.mjs` 测试纯函数不受影响。需检查是否有测试直接调 `generate-caption.mjs`

## Out of Scope

- PDF 最佳实践整理（后续单独处理）
- B5（未兑现承诺）— 不可自动化，保持 agent 判断
- B8（商业披露）— 发布时 API 设置，非 scene-data 范畴
- W8（viewerSetting）— 发布时设置
- 被动语态检测、堆叠对冲检测 — NLP 级别，不可自动化
- 朗读测试 — 不可自动化
- `caption-utils.mjs` 的黑名单同步（caption 不检查 AI 词汇，只有 voiceover 检查）
- 场景数 6-10 vs 8-12 的冲突（多集系列用不同阈值，后续单独处理）

## Further Notes

- `tiktok-rules.mjs` 是 ESM 模块，不是 JSON，因为需要导出 RegExp 对象
- `AI_BLACKLIST` 从 `tiktok-rules.mjs` re-export 到 `scene-rules.mjs`，保持现有公共接口不变（`import { AI_BLACKLIST } from "./scene-rules.mjs"` 仍然可用）
- `GREETING_PATTERN` 只检查 Hook VO 的前 3 个词，避免 "hi-tech"、"high" 等误报

---

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|---|---|---|---|
| `scripts/short-video/lib/tiktok-rules.mjs` | 新建 — 抽取所有常量 | N/A | 纯新建文件，无现有逻辑影响 |
| `scripts/short-video/lib/scene-rules.mjs` | 改为 import 常量；B4 三级化；新增 `checkNoGreeting()`；补全 AI_BLACKLIST | Medium | 修改现有检查函数行为。现有测试可能 break（B4 从 WARN 变三级、AI_BLACKLIST 扩大）。验证：现有测试全部跑一遍 |
| `scripts/short-video/verify-video.mjs` | generate-caption exit code 检查改为 FAIL；post-render 增加 caption 文件检查 | Medium | 修改了 caption 生成失败时的行为（从 warn 变 fail）。影响：如果 caption 超 2200，verify 会 FAIL 而非 pass-with-warning |
| `scripts/short-video/generate-caption.mjs` | 约束违反从 warn 改为 exit(1) | High | 修改了 exit 行为。verify-video.mjs 用 try/catch 捕获——需同时修改 catch 逻辑。影响范围：只在 caption 约束违反时触发 |
| `docs/tiktok/tiktok-best-practices.md` | 更新审计清单 B1-B9/W1-W9 | Low | 纯文档更新 |
| `docs/video-workflow.md` | 更新三层执行表 | Low | 纯文档更新 |
| `~/.catpaw/skills/short-video-pipeline/SKILL.md` | 同步更新黑名单、新增 greeting 规则 | Low | 纯文档更新 |
| `scripts/short-video/__tests__/tiktok-rules-sync.test.mjs` | 新建 — drift 检测测试 | N/A | 纯新建文件 |
| `scripts/short-video/__tests__/scene-rules.test.mjs` | 更新现有测试适配 B4 三级化 + 新增 greeting 测试 + AI_BLACKLIST 扩大后的测试 | Medium | 修改现有测试期望值。验证：red→green |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|---|---|---|---|
| S1 | scene-rules.mjs import tiktok-rules.mjs 成功 | 所有常量正常可用 | Low | ESM import 是编译时检查 |
| S2 | AI_BLACKLIST 扩大后，现有 scene-data 中有 "journey"/"realm" | verify-video.mjs FAIL | Low | 期望行为——这些词应被替换 |
| S3 | B4 三级化：Hook 60% 词汇重叠 | WARN（50-80% 区间） | Low | 行为与之前相同（WARN） |
| S4 | B4 三级化：Hook 90% 词汇重叠 | FAIL（≥80% 区间） | Medium | 新增 FAIL。正确行为——90% 重叠是 Blocker |
| S5 | `checkNoGreeting()`：Hook VO 开头 "Hey guys" | FAIL | Low | 正确行为 |
| S6 | `checkNoGreeting()`：Hook VO 含 "hi-tech" 不在开头 | PASS（不误报） | Medium | 只检查前 3 个词 + 词边界正则 |
| S7 | `checkNoGreeting()`：Hook VO 开头 "A leaked memo" | PASS | Low | 无问候词 |
| S8 | generate-caption.mjs caption 超 2200 | exit(1) → verify-video.mjs FAIL | High | 同时修改 verify-video.mjs catch 逻辑检测 exit code |
| S9 | generate-caption.mjs caption 正常 | 正常生成，verify-video.mjs PASS | Low | 无变化 |
| S10 | generate-caption.mjs hashtags 为 6 个 | exit(1) → verify-video.mjs FAIL | Low | generate-caption.mjs 已限制 3-5，超出则 exit |
| S11 | drift 测试：AI_BLACKLIST 被删减到 <40 | tiktok-rules-sync.test.mjs FAIL | Low | 正确行为——不变式守住 |
| S12 | drift 测试：THRESHOLDS.hookTextOverlapFailThreshold 被改为 0.9 | tiktok-rules-sync.test.mjs FAIL | Low | 正确行为 |
| S13 | 现有 validScenes 通过所有新增检查 | 0 FAIL | Low | 已验证：无问候词、重叠率低、无黑名单词 |
| S14 | `runAllSceneDataChecks` 包含 `checkNoGreeting` 结果 | 新增 1 条 pass/fail 结果 | Low | 纯追加，不影响现有结果 |
| S15 | `AI_BLACKLIST` re-export 从 scene-rules.mjs 可正常 import | `import { AI_BLACKLIST } from "scene-rules.mjs"` 仍可用 | Low | re-export 保持接口不变 |
