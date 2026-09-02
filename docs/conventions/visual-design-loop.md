# Visual Design Loop — Impeccable Iteration for Video Templates

## Why

视觉设计没有唯一的"最优"——但有客观标准可以判断"不够好"。Impeccable skill 提供了 5 维度审查框架，但一轮审查总有遗漏。需要 loop（审查 → 修复 → 再审查）直到收敛。

本文档定义：哪些场景触发 loop、loop 的步骤、客观判定标准、以及哪些检查已固化为自动化工具。

## When

**触发条件**：修改以下任一文件时必须走 loop：

- `remotion/src/scenes/*.tsx` — Remotion 场景组件（实际渲染的代码）
- `remotion/src/components/visuals.tsx` — 共享视觉组件（StatCard、BadgePill 等）
- `lib/scene-layout.mjs` — Slot 布局系统
- 任何影响 scene 视觉间距/字号/层次结构的改动

**不触发**：纯文案修改、颜色值替换、动画 timing 调整（不涉及间距/字号/层次）。

## How

### Loop 步骤

每轮 loop 包含 4 步，重复直到 Step 4 无新问题：

#### Step 1: 审查（Assess）

用 Impeccable `layout.md` 的 5 维度逐个检查所有间距关系：

| 维度 | 检查内容 | 客观标准 |
|------|---------|---------|
| **Spacing** | 所有 margin/gap 在 8px scale 上？ | 值 ∈ {8, 16, 24, 32, 48, 64}；padding 在 4px scale 上 |
| **Visual Hierarchy** | 字号层次分明？squint test 通过？ | 相邻层级 ratio ≥ 1.25×；同 zone 内无相同字号 |
| **Rhythm** | tight/medium/generous 交替？ | 组内 tight (8-12px)、组间 medium (24px) 或 large (32px+) |
| **Density** | slot 占用率合理？ | 60-99% slot 高度；不溢出 safe zone |
| **Consistency** | 间距/字号值与 `lib/scene-layout.mjs`、`lib/safe-zones.mjs` 单一真源一致？ | 无硬编码重复值 |

**工具支持**（自动执行）：
```bash
# 几何强制（安全区 + 溢出 + 换词）在渲染时由 TextGate 执行：
# 渲染即验证，任何越界场景直接 fail
node scripts/short-video/render-only.mjs --content _gate-smoke
```

**人工审查**（Agent 执行）：
- 读取 React 组件源码，构建完整间距矩阵
- 对照 5 维度标准逐项检查
- 对每个不达标项，给出：问题描述 + 当前值 + 建议值 + 理由

#### Step 2: 修复（Fix）

- 一次性修复本轮发现的所有问题（Remotion 组件是唯一渲染源，无需双端同步）

#### Step 3: 验证（Verify）

```bash
# TypeScript 类型检查
cd scripts/short-video/remotion && npx tsc --noEmit

# 渲染验证（TextGate 在渲染中强制几何）
node scripts/short-video/main.mjs --content _test-fixtures/hook-standard --skip-preflight --skip-verify
```

全 pass 后进入 Step 4。任一 fail 则回 Step 2 修复。

#### Step 4: 再审查（Review）

重新执行 Step 1 的 5 维度审查。**重点检查**：
- 本轮修复是否引入了新的 off-scale 值？
- 修复一个间距后，与其他间距的比例关系是否还合理？
- 字号改动后，层次 ratio 是否仍 ≥ 1.25×？

**收敛条件**：Step 4 无新问题 → loop 结束。
**最大轮次**：3 轮。超过 3 轮仍有问题，暂停并向用户报告剩余问题。

### 客观判定标准

以下标准不依赖人的视觉感觉，Agent 可自行判断：

#### 8px Scale（间距）

| 属性 | 规则 | 自动检查 |
|------|------|---------|
| margin-top / margin-bottom | 必须是 8 的倍数 | 代码审查 |
| gap (flex/grid) | 必须是 8 的倍数 | 代码审查 |
| padding | 必须是 4 的倍数 | 代码审查 |

#### Hierarchy Ratio（字号层次）

| 属性 | 规则 | 判定方式 |
|------|------|---------|
| 相邻字号 ratio | ≥ 1.25× | 代码审查 |
| 同一 slot 内相同字号 | 不允许（除非角色不同） | 代码审查 |
| 同一视觉 zone 内字号差异 | < 1.1× = 层次不足 | 代码审查 |

#### Slot Fit（密度）

| 属性 | 规则 | 自动检查 |
|------|------|---------|
| 内容不溢出 safe zone | bottom ≤ 1150px | TextGate（渲染时强制） |
| slot 占用率 | 60-99% | 代码审查 |

#### Sync（一致性）

> Remotion 是唯一渲染器后（决策 59，2026-09-01），不再有 React ↔ HTML 双源，原 `verify-template-sync.mjs` 随 HTML 路径退役（`retired-html-path/`）。一致性现在由单一真源保证：间距/安全区常量只在 `lib/scene-layout.mjs` / `lib/safe-zones.mjs` 定义。

### 间距语义角色参考

修改间距时，先判断关系的语义角色，再选 scale 档位：

| 语义角色 | scale 档位 | 示例 |
|---------|-----------|------|
| tight grouping（组内兄弟元素） | 8px (8×1) | StatCard num → label |
| small（主从关系） | 16px (8×2) | bigNumber → numberLabel |
| medium（独立 focal 点） | 24px (8×3) | claim → reveal |
| large（组间分隔） | 32px (8×4) | subject → focal |
| group separation（不同性质信息） | 24-32px (8×3~4) | stats → source |

### 已知 off-scale 值（遗留，非阻塞）

以下值不在 8px scale 上但属于 brand chrome（非内容元素），暂不修改：

| 元素 | 属性 | 当前值 | 说明 |
|------|------|--------|------|
| `.briefing-tag` | padding | 5px | brand bar 内，非内容 |
| `.badge-pill` | gap | 10px | badge 内 dot + text 间距 |

## 工具索引

| 工具 | 路径 | 作用 |
|------|------|------|
| TextGate | `scripts/short-video/remotion/src/` + `lib/text-geometry.mjs` | 渲染时几何强制（安全区、溢出、换词） |
| `render-only.mjs` | `scripts/short-video/` | 快速渲染验证（`--content _gate-smoke`） |
| `impeccable` skill | `.agents/skills/impeccable/` | 5 维度设计审查框架（layout.md） |

## Design Decisions & References

- **8px scale 选择**：基于 Impeccable `layout.md` 的"consistent spacing scale"原则。4px base 太细（8 和 16 之间需要 12），8px base 在视频画布（1080×1920）上粒度合适。
- **loop 最大 3 轮**：实践中第 1 轮发现主要问题，第 2 轮发现修复引入的次生问题，第 3 轮应收敛。超过 3 轮说明设计本身有结构性问题，需要人介入。
- **自动化 vs 人工**：几何越界由 TextGate 在渲染时确定性拦截（自动化）；间距 scale、层次 ratio 和语义角色判断需要上下文理解（人工/Agent 审查）。两者结合：工具挡住低级错误，人工审查挡住设计判断错误。
