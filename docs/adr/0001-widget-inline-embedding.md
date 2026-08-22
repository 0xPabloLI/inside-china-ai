# Widget inline embedding via HTML comment markers

Widgets are embedded in article markdown content via HTML comment markers (`<!-- widget:widget-id -->`), not as a tabbed container or iframe. The article page splits content at markers and renders alternating Markdown segments and lazy-loaded Widget components. A central Widget Registry (`src/components/widgets/registry.ts`) maps widget IDs to lazy-loaded React components — adding a widget requires only writing the component and adding one line to the registry. Widget data is hardcoded in each component's `.tsx` file (no database table, no admin UI for editing widget content).

## Considered Options

- **Tabbed container at article bottom** (rejected): Separates widgets from their context in the article flow.
- **iframe embedding** (rejected): No SSR, poor mobile, disconnected from the site's design system.
- **Custom remark plugin with directive syntax** (rejected): HTML comments degrade gracefully (invisible if not processed) and require no pipeline changes.
- **Shortcode syntax `[widget:talent]`** (rejected): Raw shortcodes visible in unprocessed markdown.
- **Database-backed widget data** (rejected): Widget data is static and bespoke per widget — the overhead is unjustified.
- **File-system convention (auto-discovery)** (rejected): Implicit registration makes it harder to trace which widgets exist.

## Consequences

- Widget data is code, not content: modifying widget data requires a Coding Agent, not the admin editor.
- The admin editor gets a dropdown button to insert markers, but no data editing UI.
- The live preview in the editor won't render widgets (HTML comments are stripped by react-markdown); authors use the published page preview to verify.
- The article page (`posts.$slug.tsx`) must implement content splitting logic.
- Widgets use a breakout layout (wider than article body) for visual emphasis — see ADR-0017.
