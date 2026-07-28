# Tickets: Inline Widget Dashboards

## Dependency Graph

```
T1 (Registry) ──┬──→ T2 (Content Splitter) ──→ T5 (Article Page) ──→ T7 (DB Update)
                │                         ──→ T6 (Editor Toolbar)
                └──→ T3 (Widget Refactor) ──┘
                      T4 (Widget Tests) ──→ T3
```

## T1: Widget Registry + Layout Constants

**Depends on**: none
**Delivers**: `src/components/widgets/registry.ts` + breakout layout CSS classes

Tasks:

- Create `src/components/widgets/registry.ts` with a `WIDGETS` map (widget ID → lazy-loaded component)
- Register 5 DeepSeek widgets: `deepseek-cloud`, `deepseek-funding`, `deepseek-pricing`, `deepseek-talent`, `deepseek-companies`
- Export `WIDGET_IDS` array for editor dropdown
- Add breakout layout utility: a wrapper component that renders children at `min(90vw, 1200px)` width centered

## T2: Content Splitter

**Depends on**: T1
**Delivers**: `src/components/widgets/content-renderer.tsx`

Tasks:

- Create a component that takes `content: string` as prop
- Parse content for `<!-- widget:widget-id -->` markers (regex: `/<!--\s*widget:([\w-]+)\s*-->/g`)
- Split content into segments: alternating Markdown strings and widget IDs
- Render each Markdown segment via `<MarkdownContent>`
- Render each widget via `WIDGETS[id]` (lazy + Suspense)
- Filter out empty Markdown segments (scenarios 7, 8, 9)
- If widget ID not in registry, render "Unknown widget: xxx" placeholder (scenario 5)
- Trim whitespace in marker parsing (scenario 6)
- If no markers found, render entire content as single Markdown segment (scenario 1)

## T3: Refactor Widget Components

**Depends on**: T1, T4
**Delivers**: Refactored widget components in `src/components/widgets/deepseek/`

Tasks:

- Move existing view components from `src/components/dashboard/views/` to `src/components/widgets/deepseek/`
- Move data files from `src/components/dashboard/data/` to `src/components/widgets/deepseek/data/`
- Move i18n from `src/components/dashboard/i18n.ts` to `src/components/widgets/deepseek/i18n.ts`
- Each widget component gets its own `useState<Lang>("en")` language state
- Add compact language toggle (EN/中文) to each widget
- Wrap each widget in the breakout layout wrapper from T1
- Remove the old `DeepSeekDashboard` container and `views/index.tsx` (tab container)
- Remove `DASHBOARD_SLUGS` from `posts.$slug.tsx` (no longer needed)
- Verify SSR safety: no `window`/`document` at module level (scenario 10)
- Cloud view: guard `layoutWords` for zero container height (scenario 11)

## T4: Widget Component Tests

**Depends on**: T1 (types/interfaces only)
**Delivers**: Test file for content splitter + widget rendering

Tasks:

- Test content splitter with 0 markers (scenario 1)
- Test content splitter with 1 marker (scenario 2)
- Test content splitter with 5 markers (scenario 3)
- Test unknown widget ID (scenario 5)
- Test marker with extra whitespace (scenario 6)
- Test marker at start/end of content (scenarios 7, 8)
- Test consecutive markers (scenario 9)
- Test same widget twice (scenario 4)

## T5: Integrate into Article Page

**Depends on**: T2, T3
**Delivers**: Updated `src/routes/posts.$slug.tsx`

Tasks:

- Replace `<MarkdownContent content={post.content} />` with `<ContentRenderer content={post.content} />`
- Remove old `DASHBOARD_SLUGS`, `DeepSeekDashboard`, `lazy`/`Suspense` imports
- Article body container: change `max-w-2xl` to `max-w-4xl`
- ContentRenderer handles lazy loading internally

## T6: Editor Toolbar Widget Dropdown

**Depends on**: T2 (for WIDGET_IDS export)
**Delivers**: Updated `src/components/markdown-editor.tsx`

Tasks:

- Import `WIDGET_IDS` from registry
- Add a "Widget" button to the toolbar (after the existing "Horizontal rule" button)
- Clicking opens a dropdown listing all widget IDs
- Selecting a widget inserts `<!-- widget:widget-id -->` at cursor position (use existing `insertBlock` helper)
- Dropdown closes after selection

## T7: Update Article Content in DB

**Depends on**: T5 (article page must be ready)
**Delivers**: Updated `deepseek-leaked-investor-meeting` article content in Supabase

Tasks:

- Use `scripts/update-post.mjs` to fetch current content
- Insert 5 widget markers at agreed positions:
  1. After "What follows is a summary..." → `<!-- widget:deepseek-cloud -->`
  2. After cloud marker (before "## 1.") → `<!-- widget:deepseek-funding -->`
  3. After section 2 end (before "## 3.") → `<!-- widget:deepseek-pricing -->`
  4. After section 6 end (before "## 7.") → `<!-- widget:deepseek-talent -->`
  5. After section 9 end (before "## Sources") → `<!-- widget:deepseek-companies -->`
- Push updated content back via API
- Verify on the live site
