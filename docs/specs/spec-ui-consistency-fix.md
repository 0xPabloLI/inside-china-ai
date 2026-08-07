# Spec: UI Consistency & Design Polish

## Problem Statement

文章内页 (`posts.$slug`) 的容器宽度为 `min(92vw, 1100px)`，而 header、首页及所有其他公开页面统一使用 `max-w-3xl` (768px)。宽度跳变造成视觉断裂，且 1100px 导致每行约 130 字符，超出最佳阅读行宽 (65–75ch)。此外，调色板落在 AI-default cream/sand 区域，字体在 reflex-reject 列表上，header nav 无 active state，文章页无阅读进度指示。

## Solution

统一所有公开页面的容器宽度、调整调色板色相、替换字体、添加 nav active state 和文章阅读进度条。

## User Stories

1. 作为读者，我希望从首页点进文章页时内容区域宽度一致，这样不会觉得跳到了另一个网站。
2. 作为读者，我希望文章正文行宽在 65–75 字符之间，这样长时间阅读不疲劳。
3. 作为读者，我希望当前所在的 nav 项有视觉高亮，这样我知道我在哪个页面。
4. 作为读者，我希望文章页有一个阅读进度条，这样我知道还剩多少内容。
5. 作为有审美判断的读者，我希望网站的调色板和字体不落入"AI 生成模板"的观感，这样我对内容品质有信心。
6. 作为移动端用户，我希望所有页面在窄屏下正常显示，宽度变化不影响响应式行为。

## Implementation Decisions

### 1. 容器宽度统一

- **所有公开页面** (`index`, `posts.$slug`, `companies`, `terms`, `privacy`) 的 `<main>` 容器统一为 `max-w-4xl` (896px)。
- **SiteHeader** 内部容器从 `max-w-3xl` 改为 `max-w-4xl`，与 main 对齐。
- **文章正文** (`.prose-article`) 添加 `max-width: 65ch` 约束文本列宽。图片、表格、code block 跟随 prose 宽度。WidgetBreakout 仍可 breakout 到 `min(90vw, 1200px)`。
- **Admin** 页面保持 `max-w-5xl` 不变（独立区域）。
- **tiktok-connect** 页面保持 `max-w-2xl` 不变（独立区域）。
- **WidgetBreakout** 注释更新为实际 body 宽度。

### 2. 调色板色相调整

- `:root` 和 `.dark` 中所有 hue 从 90/80/70/60 (warm yellow/brown) 调整到 260/255/250 (cool blue)，与品牌色 `#4d8bff` 色相方向一致。
- Chroma 保持极低 (0.005–0.015)，不改变视觉明暗对比。
- 所有 CSS 变量 (background, foreground, card, popover, primary, secondary, muted, accent, border, input, ring, sidebar*) 的 hue 统一调整。

### 3. 字体替换

- `--font-serif`: `Instrument Serif` → `Source Serif 4` (Adobe，专为屏幕阅读优化，不在 reflex-reject 列表)。
- `--font-sans`: `Inter` → `Hanken Grotesk` (有更多个性的 grotesque，不在 reflex-reject 列表)。
- Google Fonts URL 在 `__root.tsx` 中更新。
- CSS 变量 `--font-sans` 和 `--font-serif` 在 `styles.css` 中更新。

### 4. Header Nav Active State

- 使用 TanStack Router `Link` 的 `activeProps` 给当前页面 nav 项添加 `text-foreground font-medium` 样式。
- Articles link 已有 `activeOptions={{ exact: true }}`，需添加 `activeProps`。
- Companies link 需添加 `activeOptions` + `activeProps`。
- Admin link 需添加 `activeProps`。

### 5. 阅读进度条

- 新建 `src/components/reading-progress.tsx` 组件。
- Fixed top, 2px height, 品牌蓝 `#4d8bff`。
- Scroll 事件驱动 width 百分比，passive listener。
- `prefers-reduced-motion: reduce` 时移除 transition。
- 仅在 `posts.$slug` 页面挂载。

## Testing Decisions

- **视觉验证**: 宽度、调色板、字体改动需在 dev server 中视觉确认。
- **组件测试**: `reading-progress.tsx` 的 scroll 计算逻辑写单元测试。
- **SiteHeader active state**: 可通过 render 测试验证 activeProps 生效。
- 现有测试 (`brand-name.test.tsx`, `content-splitter.test.ts`) 不受影响。

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件                                         | 修改内容                                                   | 风险等级 | 评估                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/styles.css`                             | hue 调整 + `max-w-prose` on `.prose-article` + font 变量   | Medium   | CSS 变量被全局引用，但只改 hue 值不改结构。hue 在极低 chroma 下视觉差异微小。`max-w-prose` 只影响 `.prose-article`，不影响其他组件。 |
| `src/routes/__root.tsx`                      | Google Fonts URL 更新                                      | Low      | 纯替换 URL 字符串，不影响路由逻辑。新字体加载失败时 fallback 到 system font。                                                        |
| `src/components/site-header.tsx`             | `max-w-3xl` → `max-w-4xl` + `activeProps`                  | Low      | 纯样式和 props 添加，不改组件逻辑。                                                                                                  |
| `src/routes/posts.$slug.tsx`                 | `min(92vw, 1100px)` → `max-w-4xl` + 挂载 `ReadingProgress` | Low      | 只改 className 和添加组件导入。                                                                                                      |
| `src/routes/index.tsx`                       | `max-w-3xl` → `max-w-4xl`                                  | Low      | 纯 className 替换。                                                                                                                  |
| `src/routes/companies.tsx`                   | `max-w-3xl` → `max-w-4xl`                                  | Low      | 纯 className 替换。                                                                                                                  |
| `src/routes/terms.tsx`                       | `max-w-3xl` → `max-w-4xl`                                  | Low      | 纯 className 替换。                                                                                                                  |
| `src/routes/privacy.tsx`                     | `max-w-3xl` → `max-w-4xl`                                  | Low      | 纯 className 替换。                                                                                                                  |
| `src/components/widgets/widget-breakout.tsx` | 注释更新                                                   | Low      | 只改注释，不改代码。                                                                                                                 |
| `src/components/reading-progress.tsx`        | 新建                                                       | Low      | 新文件，无下游消费者。                                                                                                               |

### Section 2: Behavioral Scenarios

| #   | Scenario                    | Expected Behavior                               | Risk   | Mitigation                                                              |
| --- | --------------------------- | ----------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| 1   | 桌面端首页 → 文章页导航     | header 和 main 容器宽度一致 (896px)，无宽度跳变 | Low    | 统一 `max-w-4xl`                                                        |
| 2   | 文章页正文阅读              | 文本列宽约 65ch，图片/表格跟随 prose 宽度       | Low    | `.prose-article { max-width: 65ch }`                                    |
| 3   | 文章页 widget 渲染          | WidgetBreakout 仍突破到 1200px                  | Low    | WidgetBreakout 是 prose 的兄弟元素，不受 `max-w-prose` 影响             |
| 4   | 移动端 (<768px) 任何页面    | 容器宽度被 viewport 约束，`max-w-4xl` 不生效    | Low    | `px-6` padding 保持，响应式行为不变                                     |
| 5   | 暗色模式                    | hue 调整后暗色模式仍可读                        | Low    | 只调 hue 不调 L/C，对比度不变                                           |
| 6   | 字体加载失败                | fallback 到 system font (serif/sans-serif)      | Low    | CSS 变量已有 fallback chain                                             |
| 7   | header nav 在首页           | "Articles" 高亮 (`text-foreground font-medium`) | Low    | `activeOptions={{ exact: true }}` + `activeProps`                       |
| 8   | header nav 在文章页         | "Articles" 高亮 (非 exact match)                | Medium | 文章页路径 `/posts/$slug` 不匹配 `/` exact，需确认 `activeOptions` 行为 |
| 9   | header nav 在 companies 页  | "Companies" 高亮                                | Low    | 添加 `activeOptions` + `activeProps`                                    |
| 10  | 阅读进度条 scroll           | 进度条宽度随滚动更新 (0% → 100%)                | Low    | passive scroll listener + 计算公式                                      |
| 11  | 阅读进度条 reduced-motion   | 无 transition 动画                              | Low    | `@media (prefers-reduced-motion: reduce)`                               |
| 12  | 阅读进度条短文章            | 文章短于 viewport 时进度条显示 100%             | Low    | `docHeight <= 0` 时设为 100%                                            |
| 13  | Terms/Privacy 页 `prose-sm` | `max-w-none` 不受 `max-w-prose` 影响            | Low    | `prose-sm` 是 Tailwind Typography class，不是 `.prose-article`          |

## Out of Scope

- Admin 页面宽度调整 (保持 `max-w-5xl`)
- tiktok-connect 页面宽度调整 (保持 `max-w-2xl`)
- 首页 `max-w-xl` on hero description (保持不变)
- 首页/文章页 footer 一致性 (已知差异，单独处理)
- `#articles` anchor 缺失 bug (已知，单独处理)
- 邮件模板中的 `maxWidth` (独立系统，不涉及)

## Further Notes

- 调色板 hue 调整在极低 chroma (0.008) 下视觉差异极其微小，主要意义是脱离 impeccable skill 定义的"cream/sand band" (hue 40-100)。
- 字体替换需要更新 Google Fonts URL。`Source Serif 4` 是可变字体，支持 `ital@0;1`。`Hanken Grotesk` 支持 `wght@400;500;600;700`。
- TanStack Router 的 `Link` 组件原生支持 `activeProps` 和 `activeOptions`，无需额外库。
