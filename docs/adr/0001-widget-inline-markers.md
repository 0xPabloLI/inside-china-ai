# Widget inline markers in Markdown content

Articles can embed interactive data-visualization components (widgets) at any position in the Markdown body by inserting HTML comment markers (`<!-- widget:widget-id -->`). The content renderer splits the Markdown at these markers and alternates between rendering Markdown segments and lazy-loaded widget components.

A central Widget Registry (`src/components/widgets/registry.ts`) maps widget IDs to lazy-loaded React components. Adding a new widget requires only writing the component and adding one line to the registry — the article page and editor toolbar logic stay unchanged.

Widget data is hardcoded in each component's `.tsx` file. There is no database table for widget data and no admin UI for editing widget content. Widgets are created and modified by a Coding Agent directly in code.

## Considered options

- **Tab container at article bottom** (rejected): bundles all widgets into a single tabbed UI placed after the article. Rejected because it separates widgets from their context in the article flow.
- **Custom remark plugin with directive syntax** (rejected): would require modifying the MarkdownContent component's remark pipeline. Rejected because HTML comments degrade gracefully (invisible if not processed) and require no pipeline changes.
- **Database-backed widget data** (rejected): would require a new table, admin UI, and API. Rejected because widget data is static and bespoke per widget — the overhead is unjustified.

## Consequences

- The article page (`posts.$slug.tsx`) must implement content splitting logic.
- The Markdown editor's live preview will not render widgets (HTML comments are stripped by react-markdown). Authors use the "Preview" link to verify widget placement.
- The editor toolbar gets a "Widget" dropdown that reads from the registry to insert markers.
- Widgets use a breakout layout (wider than article body) for visual emphasis.
