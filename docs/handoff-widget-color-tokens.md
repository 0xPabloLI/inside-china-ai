# Handoff: Widget Tailwind 原生色 → Design Token 映射

> **状态**: 待实施（新 session 接手）
> **前置**: `DESIGN.md` 已生成，`--brand` token 已加入 `styles.css`
> **目标**: 将 Widget 中所有 Tailwind 原生色（`blue-500`、`green-600` 等）映射到设计 token 系统

## 背景

UI 审查（2026-08-06）发现 Widget 组件中大量使用 Tailwind 原生色，游离于 OKLCH token 系统之外。这导致：
1. Dark mode 下颜色不受 token 控制
2. 品牌色不一致（`blue-500` ≠ `--brand`）
3. 语义状态色（成功/警告/错误）无统一定义

本次 UI 优化已完成品牌色 token 化、LangToggle 提取、字体修复、Admin 骨架屏等 8 个批次，但**Widget 原生色映射**作为独立任务留给新 session。

## 需要新增的 Token

在 `src/styles.css` 的 `:root` 和 `.dark` 中新增以下语义色 token：

```css
:root {
  /* 语义状态色 */
  --success: oklch(0.60 0.15 145);        /* 替代 green-500/600 */
  --success-foreground: oklch(0.30 0.10 145);
  --success-muted: oklch(0.95 0.03 145);  /* 替代 green-500/10 */

  --warning: oklch(0.70 0.15 85);         /* 替代 yellow-500/amber-500 */
  --warning-foreground: oklch(0.40 0.12 85);
  --warning-muted: oklch(0.95 0.03 85);   /* 替代 yellow-500/10 */

  --danger: oklch(0.55 0.22 27);          /* 已有 --destructive，但 widget 用 red-500 */
  --danger-foreground: oklch(0.96 0.01 27);
  --danger-muted: oklch(0.95 0.03 27);    /* 替代 red-500/10 */

  /* 品牌蓝（已有 --brand） */
  --brand-muted: oklch(0.93 0.05 260);    /* 替代 blue-500/10 */
  --brand-foreground: oklch(0.45 0.15 260); /* 替代 blue-600 */
}

.dark {
  --success: oklch(0.70 0.15 145);
  --success-foreground: oklch(0.95 0.03 145);
  --success-muted: oklch(0.25 0.05 145);

  --warning: oklch(0.75 0.12 85);
  --warning-foreground: oklch(0.95 0.02 85);
  --warning-muted: oklch(0.25 0.05 85);

  --danger: oklch(0.65 0.20 22);
  --danger-foreground: oklch(0.96 0.01 27);
  --danger-muted: oklch(0.25 0.05 27);

  --brand-muted: oklch(0.25 0.05 260);
  --brand-foreground: oklch(0.70 0.15 260);
}
```

在 `@theme inline` 中映射：

```css
--color-success: var(--success);
--color-success-foreground: var(--success-foreground);
--color-success-muted: var(--success-muted);
/* ... 同理 warning, danger, brand-muted, brand-foreground */
```

## 映射对照表

| Tailwind 原生色 | 新 Token | 语义 | 用途 |
|---|---|---|---|
| `blue-500` | `bg-brand` | 品牌蓝 | 状态点、进度条、当前阶段标记 |
| `blue-500/10` | `bg-brand-muted` | 品牌蓝浅底 | badge 背景、target 状态 |
| `blue-500/20` | `bg-brand-muted` | 品牌蓝浅底 | bar 填充 |
| `blue-600` | `text-brand-foreground` | 品牌蓝文字 | badge 文字、数值 |
| `blue-500/30` | `border-brand-muted` | 品牌蓝边框 | 卡片边框 |
| `blue-500/50` | `border-brand` | 品牌蓝边框 | 当前阶段边框 |
| `green-500` | `bg-success` | 成功 | 已完成状态、bar 填充 |
| `green-400` | `bg-success` | 成功 | 渐变终点（统一为 success） |
| `green-500/10` | `bg-success-muted` | 成功浅底 | badge 背景 |
| `green-600` | `text-success-foreground` | 成功文字 | badge 文字、数值 |
| `yellow-500` | `bg-warning` | 警告 | 暂停状态、bar 填充 |
| `yellow-500/10` | `bg-warning-muted` | 警告浅底 | badge 背景 |
| `yellow-500/20` | `bg-warning-muted` | 警告浅底 | bar 填充 |
| `yellow-700` | `text-warning-foreground` | 警告文字 | badge 文字 |
| `amber-500` | `bg-warning` | 警告 | 替代 yellow 系列 |
| `amber-500/5` | `bg-warning-muted` | 警告极浅 | 提示框背景 |
| `amber-500/10` | `bg-warning-muted` | 警告浅底 | badge 背景 |
| `amber-700` | `text-warning-foreground` | 警告文字 | badge 文字 |
| `amber-400/40` | `border-warning-muted` | 警告边框 | 提示框边框 |
| `amber-50` | `bg-warning-muted` | 警告极浅 | 提示框背景 |
| `amber-900` | `text-warning-foreground` | 警告深色文字 | 提示框文字 |
| `red-500` | `bg-danger` | 危险 | 否认状态、bar 填充 |
| `red-500/5` | `bg-danger-muted` | 危险极浅 | 警告框背景 |
| `red-500/10` | `bg-danger-muted` | 危险浅底 | badge 背景 |
| `red-500/20` | `bg-danger-muted` | 危险浅底 | bar 填充 |
| `red-500/30` | `border-danger-muted` | 危险边框 | 卡片边框 |
| `red-600` | `text-danger-foreground` | 危险文字 | badge 文字、数值 |
| `emerald-500` | `bg-success` | 成功 | 替代 green 系列 |
| `emerald-100` | `bg-success-muted` | 成功浅底 | badge 背景 |
| `emerald-700` | `text-success-foreground` | 成功文字 | badge 文字 |
| `emerald-400` (dark) | `text-success` | 成功文字 dark | dark mode 文字 |
| `emerald-900/30` (dark) | `bg-success-muted` | 成功浅底 dark | dark mode 背景 |

## 受影响文件清单

### deepseek/ 目录
| 文件 | 行号 | 原生色 | 语义 |
|---|---|---|---|
| `funding-view.tsx` | 8 | `bg-blue-500/10 text-blue-600` | target badge |
| `funding-view.tsx` | 9 | `bg-green-500/10 text-green-600` | completed badge |
| `funding-view.tsx` | 10 | `bg-yellow-500/10 text-yellow-700` | paused badge |
| `funding-view.tsx` | 153 | `border-2 border-blue-500 bg-blue-500/20` | target bar |
| `funding-view.tsx` | 155-156 | `bg-green-500` / `border-yellow-500 bg-yellow-500/20` | actual/paused bar |
| `funding-view.tsx` | 208-212 | `text-green-600` / `text-blue-600` / `text-yellow-700` | value labels |
| `funding-view.tsx` | 221 | `from-green-500 to-green-400` | actual bar gradient |
| `companies-view.tsx` | 7 | `bg-blue-500/10 text-blue-600` | tone-compare badge |
| `companies-view.tsx` | 9 | `bg-red-500/10 text-red-600` | tone-critique badge |
| `companies-view.tsx` | 10 | `bg-green-500/10 text-green-600` | tone-positive badge |
| `companies-view.tsx` | 11 | `bg-amber-500/10 text-amber-700` | tone-analogy badge |

### distillation/ 目录
| 文件 | 行号 | 原生色 | 语义 |
|---|---|---|---|
| `benchmark-controversy-view.tsx` | 39 | `text-green-600` | positive % |
| `benchmark-controversy-view.tsx` | 44 | `text-red-500` | negative % |
| `benchmark-controversy-view.tsx` | 100-101 | `bg-green-500/10 text-green-600` / `bg-red-500/10 text-red-500` | status badge |
| `benchmark-controversy-view.tsx` | 162 | `bg-amber-500/5` | warning box |
| `identity-bleed-view.tsx` | 35 | `from-amber-500 to-blue-500` | gradient line |
| `identity-bleed-view.tsx` | 36 | `border-l-blue-500` | arrow |
| `identity-bleed-view.tsx` | 53 | `border-amber-400/40 bg-amber-50 text-amber-900` | bleed label |
| `identity-bleed-view.tsx` | 65 | `border-red-500/30 bg-red-500/5 text-red-600` | verdict box |
| `identity-bleed-view.tsx` | 73 | `bg-blue-500` | source dot |
| `identity-bleed-view.tsx` | 103 | `text-green-600` | match % |
| `minimax-stock-view.tsx` | 171 | `border-red-500/30 bg-red-500/5` | crash alert box |
| `moonshot-funding-view.tsx` | 48 | `bg-green-500` / `border-blue-500 bg-blue-500/20` / `border-red-500 bg-red-500/20` | status legend |
| `moonshot-funding-view.tsx` | 76 | `text-green-600` / `text-blue-600` / `text-red-500` | value labels |
| `news-coverage-view.tsx` | 95-102 | `border-red-500/30` / `border-blue-500/30` / `border-green-500/30` / `border-amber-500/30` | event type borders |

### distillation/data/ 目录（数据文件中的 className 字符串）
| 文件 | 字段 | 原生色 |
|---|---|---|
| `minimax-stock.ts` | `.color` | `text-green-600`, `text-red-500`, `text-amber-600` |
| `moonshot-funding.ts` | `.bar` / `.badge` | `from-green-500 to-green-400`, `border-blue-500 bg-blue-500/20`, `border-red-500 bg-red-500/20` 等 |
| `news-events.ts` | `.color` / `.dot` | `#ef4444`, `#3b82f6`, `#22c55e`, `#f59e0b` (hex 值) + `bg-red-500`, `bg-blue-500`, `bg-green-500`, `bg-amber-500` |

### 新 widget 目录（未提交）
| 文件 | 行号 | 原生色 |
|---|---|---|
| `deepseek-agi-roadmap/agi-roadmap-view.tsx` | 36-37 | `bg-emerald-500` / `bg-blue-500` |
| `deepseek-agi-roadmap/agi-roadmap-view.tsx` | 42-43 | `border-emerald-500/30` / `border-blue-500/50 shadow-blue-500/10` |
| `deepseek-agi-roadmap/agi-roadmap-view.tsx` | 93-94 | `text-blue-600` / `text-emerald-600` |
| `deepseek-agi-roadmap/agi-roadmap-view.tsx` | 120, 124 | `bg-emerald-500` / `bg-blue-500` |
| `deepseek-api-pricing/api-pricing-view.tsx` | 106 | `bg-emerald-100 text-emerald-700` |
| `deepseek-api-pricing/api-pricing-view.tsx` | 114, 122 | `text-emerald-600` / `text-red-600` |
| `deepseek-oss-comparison/oss-comparison-view.tsx` | 26-27 | `bg-emerald-100 border-emerald-200` / `bg-amber-100 border-amber-200` |
| `deepseek-oss-comparison/oss-comparison-view.tsx` | 67 | `text-emerald-600` |
| `deepseek-oss-comparison/oss-comparison-view.tsx` | 88, 92 | `bg-emerald-500` / `bg-amber-500` |
| `deepseek-vision/vision-keywords-view.tsx` | 43 | `bg-blue-500` |

## 实施建议

1. **先加 token**：在 `styles.css` 中新增上述语义色 token + `@theme inline` 映射
2. **全局 sed 替换**（分颜色批量做）：
   ```bash
   # 示例：blue-500 → brand
   grep -rl 'blue-500' src/components/widgets/ | xargs sed -i '' \
     -e 's/bg-blue-500\/10/bg-brand-muted/g' \
     -e 's/bg-blue-500\/20/bg-brand-muted/g' \
     -e 's/bg-blue-500/bg-brand/g' \
     -e 's/text-blue-600/text-brand-foreground/g' \
     -e 's/border-blue-500\/30/border-brand-muted/g' \
     -e 's/border-blue-500\/50/border-brand/g' \
     -e 's/border-blue-500/border-brand/g'
   ```
3. **数据文件单独处理**：`minimax-stock.ts`、`moonshot-funding.ts`、`news-events.ts` 中的 className 字符串需要手动替换（sed 可能误伤）
4. **hex 值替换**：`news-events.ts` 中的 `#ef4444`、`#3b82f6`、`#22c55e`、`#f59e0b` 需要映射到对应 token 的 hex 值
5. **emerald 系列**：`emerald-*` 在语义上等同于 `green-*`，统一映射到 `--success` token
6. **amber 系列**：`amber-*` 在语义上等同于 `yellow-*`，统一映射到 `--warning` token
7. **dark mode 变体**：`dark:text-emerald-400`、`dark:bg-emerald-900/30` 等 dark 变体也需要替换为 token 对应的 dark 值
8. **验证**：`npx tsc --noEmit && npm run build && npx vitest run`，然后在 dev server 中逐个 widget 目视检查

## 注意事项

- `news-events.ts` 中的 hex 颜色值（`#ef4444` 等）用于内联 style 或 SVG，需要单独处理
- `identity-bleed-view.tsx` 中的 `bg-gradient-to-r from-amber-500 to-blue-500` 渐变需要用 `from-warning to-brand` 替代
- `funding-view.tsx` 中的 `bg-gradient-to-t from-green-500 to-green-400` 渐变需要用 `from-success to-success` 或保持渐变但用 token 值
- 部分文件可能同时包含 className 字符串和数据文件中的颜色定义，需要同步修改
