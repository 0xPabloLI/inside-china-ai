# Spec: Inline Widget Dashboards in Article Content

## Summary

Refactor the existing DeepSeek dashboard (currently a tabbed container appended to the article page) into individual widget components that can be inserted at any position within the article Markdown content via HTML comment markers. The system uses a central Widget Registry for extensibility — adding a new widget requires only writing a component and adding one line to the registry.

## Background

The current implementation (committed in `b82d232`) ports 5 views from the standalone `deepseek-dashboard/index.html` into a single `DeepSeekDashboard` container with Tabs, placed as a monolithic section below the article content. The user wants widgets interspersed within the article body at contextually relevant positions, and wants the system to be extensible for future dashboards without code changes to the article page or editor.

## Requirements

### Functional Requirements

1. **Widget markers in Markdown**: Authors insert `<!-- widget:widget-id -->` in the article Markdown content. The article page splits content at these markers and alternates between rendering Markdown segments and widget components.

2. **Widget Registry**: A central TypeScript map (`src/components/widgets/registry.ts`) maps widget IDs to lazy-loaded React components. Both the article renderer and the editor toolbar read available widget IDs from this registry.

3. **Five DeepSeek widgets registered**:
   - `deepseek-cloud` — keyword word cloud
   - `deepseek-funding` — funding timeline + investor donut
   - `deepseek-pricing` — API pricing comparison
   - `deepseek-talent` — talent flow cards
   - `deepseek-companies` — company remarks (accordion)

4. **Each widget is self-contained**: hardcoded data, own language toggle (compact EN/中文 button), no external state dependencies.

5. **Breakout layout**: Article body uses `max-w-4xl` (~896px). Widgets render wider — `min(90vw, 1200px)` — creating visual emphasis. Both centered.

6. **Editor toolbar**: The `MarkdownEditor` toolbar gets a "Widget" dropdown button that lists all registered widgets. Clicking inserts `<!-- widget:widget-id -->` at the cursor position.

7. **Unknown widget handling**: If a marker references a widget ID not in the registry, render a muted "Unknown widget: xxx" placeholder at that position.

8. **Article content update**: The `deepseek-leaked-investor-meeting` article's content in Supabase DB is updated to insert the 5 widget markers at the positions agreed in grill:
   - After intro ("What follows is a summary..."): `<!-- widget:deepseek-cloud -->`
   - After cloud marker: `<!-- widget:deepseek-funding -->`
   - After section 2 ("The API is priced..."): `<!-- widget:deepseek-pricing -->`
   - After section 6 ("The only thing DeepSeek refuses to lose is its team"): `<!-- widget:deepseek-talent -->`
   - After section 9 ("My Take: Why this leak cost..."): `<!-- widget:deepseek-companies -->`

### Non-Functional Requirements

- Widgets are lazy-loaded via `React.lazy` + `Suspense` — only downloaded when scrolled into view.
- SSR: widget components must be server-renderable (no `window`/`document` access at module level).
- Existing TypeScript strict mode, ESLint, and build pipeline must pass.
- No new npm dependencies.

## Scenario & Risk Verification Matrix

| #   | Scenario                                                              | Expected Behavior                                                                                 | Risk     | Mitigation                                                                                                     |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Article with 0 widget markers                                         | Renders as pure Markdown, no splitting overhead                                                   | Low      | Content splitter returns single segment if no markers found                                                    |
| 2   | Article with 1 widget marker                                          | Splits into 2 Markdown segments + 1 widget                                                        | Low      | Standard path                                                                                                  |
| 3   | Article with 5 widget markers (the target article)                    | Splits into 6 Markdown segments + 5 widgets, lazy-loaded                                          | Medium   | Verify lazy loading doesn't cause layout shift                                                                 |
| 4   | Same widget inserted twice in one article                             | Both render independently with own state                                                          | Low      | Each widget is a separate React component instance                                                             |
| 5   | Widget marker with typo (`<!-- widget:deepseek-talnet -->`)           | Renders "Unknown widget: deepseek-talnet" placeholder                                             | Medium   | Registry lookup returns null → fallback render                                                                 |
| 6   | Widget marker with extra spaces (`<!--  widget:deepseek-talent  -->`) | Still recognized and rendered                                                                     | Medium   | Regex trim whitespace in marker parsing                                                                        |
| 7   | Widget marker at very start of content                                | First Markdown segment is empty string → skip, render widget first                                | Low      | Filter out empty segments in splitter                                                                          |
| 8   | Widget marker at very end of content                                  | Last Markdown segment is empty → skip                                                             | Low      | Same filter                                                                                                    |
| 9   | Two consecutive widget markers                                        | Empty segment between them → filtered out                                                         | Low      | Same filter                                                                                                    |
| 10  | SSR rendering of widget components                                    | Widgets render server-side, no hydration errors                                                   | High     | All components must avoid `window`/`document` at module level; cloud-view uses `useEffect` for DOM measurement |
| 11  | Cloud view layout with 0 container height                             | `layoutWords` returns empty array, no crash                                                       | Medium   | Guard clause checks `w === 0                                                                                   |     | h === 0` |
| 12  | Editor live preview with widget marker                                | Marker invisible (react-markdown strips HTML comments)                                            | Accepted | v1 limitation; author uses "Preview" link                                                                      |
| 13  | Editor "Widget" dropdown insertion                                    | Inserts marker at cursor position with newlines                                                   | Low      | Reuse existing `insertBlock` helper                                                                            |
| 14  | Breakout layout on narrow screen (< 896px)                            | Widget uses `min(90vw, 1200px)` which is < 896px on narrow screens → widget is narrower than body | Low      | On mobile this is fine; body and widget both constrained by viewport                                           |
| 15  | Language toggle on each widget                                        | Independent EN/中文 state per widget instance                                                     | Low      | `useState` in each component                                                                                   |
| 16  | Existing article page without widgets (other articles)                | No behavior change, no overhead                                                                   | Low      | Splitter only activates when markers found                                                                     |

## Out of Scope

- Real-time widget data editing UI (data is hardcoded in TSX)
- Widget data stored in database
- Live preview rendering widgets in the editor
- Multi-widget language synchronization (each widget independent)
- Migration to a new Supabase project for dashboard access
