# Spec: web-deep-research skill 通用化

## 背景
`17889e6` 把 angles.md 窄化成 China AI 专属,SKILL.md 触发逻辑绑死 China AI。
导致 TikTok/其他领域即使有沉淀 section 也永不触发,违背"给什么方向做什么研究"的设计意图。

## 改动范围
仅 2 个文件,均在 `skills/web-deep-research/`:
1. `references/angles.md` — 恢复 `b383d05` 初始通用版(67 行)
2. `SKILL.md` — L26-27 (Dependencies) + L50-53 (Phase 2 PLAN 触发逻辑) 改通用

## 改动内容

### File 1: `references/angles.md`
- 恢复 `b383d05` 版全文(3 section: TikTok + China AI + General/Cross-Domain + 扩展机制)
- 无修改:`b383d05` 版的扩展说明已是通用措辞("after a successful research run")

### File 2: `SKILL.md`

**L26-27** (Dependencies → Angle templates):
- 旧: "For China AI / tech industry research, load references/angles.md during Phase 2."
- 新: "Load [references/angles.md](references/angles.md) during Phase 2 for angle templates."

**L50-53** (Phase 2 — PLAN 触发逻辑):
- 旧:
  ```
  Decide research angles. For China AI / tech industry research, load
  [references/angles.md](references/angles.md) and pick relevant angles.
  For any other domain, generate 3-5 angles from different perspectives (overview,
  technical, market, contrarian, primary sources).
  ```
- 新:
  ```
  Decide research angles. Load [references/angles.md](references/angles.md).
  If the topic matches a section in angles.md, use those angles.
  Otherwise, use the General / Cross-Domain section or generate 3-5 angles
  from default perspectives (overview, technical, market, contrarian, primary sources).
  After research, append proven-useful angles back to angles.md (see its
  "Creating Custom Angle Templates" section).
  ```

## Scenario & Risk Verification

### Modified Files Impact
| File | 变更性质 | 消费者 | 风险 |
|------|---------|--------|------|
| `skills/web-deep-research/references/angles.md` | 内容恢复(28→67 行) | web-deep-research SKILL.md Phase 2 | 无 — 纯追加,不破坏已有引用 |
| `skills/web-deep-research/SKILL.md` | L26-27 + L50-53 文本改 | agent 加载 skill 时读 | 低 — 触发逻辑从"仅 China AI"放宽到"总是加载",旧行为(China AI 命中)保持 |

### Behavioral Scenarios
| # | 场景 | 输入 | 期望行为 | 验证 |
|---|------|------|---------|------|
| 1 | 研究中国 AI | "研究 DeepSeek" | Phase 2 加载 angles.md → 命中 China AI section → 用其 5 个角度 | angles.md 有 China AI section ✅ |
| 2 | 研究 TikTok | "研究 TikTok view 怎么做上去" | Phase 2 加载 angles.md → 命中 TikTok section → 用其 8 个角度 | angles.md 有 TikTok section ✅(恢复后) |
| 3 | 研究新领域 | "研究量子计算" | Phase 2 加载 angles.md → 无匹配 → 用 General/Cross-Domain 5 perspective | angles.md 有 General section ✅(恢复后) |
| 4 | 调研完积累 | 任一调研完成 | Phase 8 PACKAGE 把证实有用的角度 append 到 angles.md | SKILL.md L50-53 含 "After research, append..." 指令 ✅ |
| 5 | 旧 China AI 行为不破坏 | "研究 DeepSeek" | 仍命中 China AI section(改动是放宽,不收紧) | 场景 1 覆盖 |

## 非目标
- 不改 web-access skill
- 不改 symlink 链路(上一轮已完成)
- 不改其他 Phase 逻辑
- 不写测试(skill 文档变更,无可测试代码路径)
