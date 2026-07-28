# Widget inline embedding via HTML comment markers

Widgets are embedded in article markdown content via HTML comment markers (`<!-- widget:deepseek-talent -->`), not as a tabbed container or iframe. The article page splits content at markers and renders alternating Markdown segments and lazy-loaded Widget components. Each widget is a bespoke component with hardcoded data, managed by Coding Agent — no data editor or DB storage for widget data. A central Widget Registry is the sole extension point for adding new widgets.

## Considered Options

- **Tabbed container at article bottom** (rejected): bundles all widgets into tabs, but the user wants widgets interspersed at contextually relevant positions within the article body.
- **iframe embedding** (rejected): isolated styles but no SSR, poor mobile, and disconnected from the site's design system.
- **Custom remark plugin with directive syntax** (rejected): would require changes to MarkdownContent and is overkill for a simple split-and-render pattern.
- **Shortcode syntax `[widget:talent]`** (rejected): degrades poorly — raw shortcodes are visible in unprocessed markdown.

## Consequences

- Widget data is code, not content: modifying widget data requires a Coding Agent, not the admin editor.
- The admin editor gets a dropdown button to insert markers, but no data editing UI.
- The live preview in the editor won't render widgets (HTML comments are stripped by react-markdown); authors use the published page preview to verify.
