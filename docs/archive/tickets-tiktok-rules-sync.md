# Tickets: TikTok Rules Sync & Drift Prevention

> 基于 `docs/specs/spec-tiktok-rules-sync.md` 拆分。每个 ticket = 一个可独立验证的切片。

---

## Ticket 依赖图

```
T1 (tiktok-rules.mjs — 新建共享配置)
  ↓
T2 (scene-rules.mjs — 重构 import + B4 三级化 + checkNoGreeting + AI_BLACKLIST 补全)
  ↓
T3 (generate-caption.mjs + verify-video.mjs — caption 约束强化)
  ↓
T4 (tiktok-rules-sync.test.mjs — drift 检测测试)
  ↓
T5 (文档同步 — tiktok-best-practices.md + video-workflow.md + SKILL.md)
```

执行顺序：T1 → T2 → T3 → T4 → T5

---

## T1: tiktok-rules.mjs — 新建共享配置文件

**Depends on**: none
**Delivers**: `scripts/short-video/lib/tiktok-rules.mjs`
**Covers scenarios**: S1, S15

Tasks:

- 新建 `scripts/short-video/lib/tiktok-rules.mjs`
- 从 `scene-rules.mjs` 搬移所有常量（AI_BLACKLIST、所有 PATTERN、TARGET_KEYWORDS、KNOWN_COMPANIES）
- AI_BLACKLIST 补全至 ~40 个词（B+C 类全加）
- 新增 `GREETING_PATTERN` 正则
- 新增 `THRESHOLDS` 对象（集中所有数值阈值）
- 新增 `HOOK_TEXT_OVERLAP_FAIL_THRESHOLD = 0.80`、`HOOK_TEXT_OVERLAP_WARN_THRESHOLD = 0.50`
- 每个常量带注释说明来源和原因
- export 所有常量

**完成标志**: 文件存在，所有常量被导出，`node -e "import('./scripts/short-video/lib/tiktok-rules.mjs').then(m => console.log(Object.keys(m)))"` 输出所有导出名。

---

## T2: scene-rules.mjs — 重构 + B4 三级化 + checkNoGreeting

**Depends on**: T1
**Delivers**: 修改 `scripts/short-video/lib/scene-rules.mjs` + 修改 `scripts/short-video/__tests__/scene-rules.test.mjs`
**Covers scenarios**: S2, S3, S4, S5, S6, S7, S13, S14

Tasks:

- 删除 `scene-rules.mjs` 中所有本地常量定义
- 改为 `import { ... } from "./tiktok-rules.mjs"`
- `AI_BLACKLIST` 保持 re-export（`export { AI_BLACKLIST } from "./tiktok-rules.mjs"`）
- 修改 `checkHookDiffersFromText()` 为三级：
  - overlap ≥ THRESHOLDS.hookTextOverlapFailThreshold (0.80) → FAIL
  - overlap ≥ THRESHOLDS.hookTextOverlapWarnThreshold (0.50) → WARN
  - overlap < 0.50 → PASS
- 新增 `checkNoGreeting(scenes)` 函数：
  - 取 `scenes[0]?.voiceover` 的前 3 个词
  - 用 `GREETING_PATTERN` 匹配
  - 有则 FAIL，无则 PASS
- `runAllSceneDataChecks` 中加入 `...checkNoGreeting(scenes)`
- 更新 `scene-rules.test.mjs`：
  - 新增 B4 三级化测试（90% FAIL、60% WARN、30% PASS）
  - 新增 `checkNoGreeting` 测试（"Hey guys" FAIL、"A leaked memo" PASS、"hi-tech"不在开头 PASS）
  - 新增 AI_BLACKLIST 扩大后的测试（"journey" FAIL、"realm" FAIL、"oaicite" FAIL）
  - 确认 `validScenes` 仍 0 FAIL

**完成标志**: `npx vitest run scripts/short-video/__tests__/scene-rules.test.mjs` 全绿。

---

## T3: generate-caption.mjs + verify-video.mjs — caption 约束强化

**Depends on**: T2
**Delivers**: 修改 `scripts/short-video/generate-caption.mjs` + 修改 `scripts/short-video/verify-video.mjs`
**Covers scenarios**: S8, S9, S10

Tasks:

- `generate-caption.mjs`：约束违反从 `console.warn` 改为 `console.error` + `process.exit(1)`
- `verify-video.mjs`：修改 generate-caption.mjs 调用的 catch 逻辑：
  - 检测 exit code != 0 时，将 caption 生成失败记为 FAIL（`results.fail.push(...)`）
  - 而非当前的 `console.warn`
- `verify-video.mjs`：post-render 增加 caption 文件检查（如果 `tiktok-caption.txt` 已存在）：
  - 读取文件内容，检查长度 ≤ 2200
  - 超长则 FAIL

**完成标志**: 手动测试 — 构造一个超长 caption 场景，`verify-video.mjs` 报 FAIL。

---

## T4: tiktok-rules-sync.test.mjs — drift 检测测试

**Depends on**: T1
**Delivers**: `scripts/short-video/__tests__/tiktok-rules-sync.test.mjs`
**Covers scenarios**: S11, S12

Tasks:

- 新建 `scripts/short-video/__tests__/tiktok-rules-sync.test.mjs`
- 测试不变式：
  - `AI_BLACKLIST` 包含各类别代表词（leverage、moreover、landscape、game-changer、oaicite、certainly!）
  - `AI_BLACKLIST.length >= 40`
  - 所有 PATTERN 是有效 RegExp
  - THRESHOLDS 值与文档一致（maxVoiceoverWords=180、maxOneBreathWords=25、minScenes=6、maxScenes=10、hookTextOverlapFailThreshold=0.80、hookTextOverlapWarnThreshold=0.50）
  - GREETING_PATTERN 覆盖文档中的问候词（hey guys、what's up everyone、welcome back、good morning）

**完成标志**: `npx vitest run scripts/short-video/__tests__/tiktok-rules-sync.test.mjs` 全绿。

---

## T5: 文档同步

**Depends on**: T2, T3
**Delivers**: 修改 `docs/tiktok/tiktok-best-practices.md` + `docs/video-workflow.md` + `~/.catpaw/skills/short-video-pipeline/SKILL.md`
**Covers scenarios**: 无行为场景（纯文档）

Tasks:

- `tiktok-best-practices.md` 审计清单更新：
  - B2 → Blocker（部分自动化：问候语 by code；logo/慢推 by agent）
  - B4 → Blocker ≥80% / WARN 50-80% / PASS <50%
  - B6 → Blocker（由 generate-caption.mjs 执行）
  - W1 → Blocker（代码为 FAIL）
  - W2 → Warning（由 generate-caption.mjs 限制 3-5）
  - W5 → Warning（agent only）
  - B7 → Blocker（黑名单已补全至 ~40 个）
- `video-workflow.md` 三层执行表更新：
  - ✅ 全自动检查表新增：B2 问候语检测、B4 三级化
  - ✅ 全自动检查表更新：B7 黑名单已补全
  - caption 级检查新增：B6 caption ≤ 2200
  - agent-assisted 表更新：B2 logo/慢推、W5 空三段式
- `SKILL.md` 更新：
  - De-AI Voice Rules 黑名单更新为完整 ~40 词
  - 新增 greeting 检测规则到 Best Practices Checklist
  - B4 重叠规则说明更新

**完成标志**: 文档内容与代码行为一致（人工审核）。
