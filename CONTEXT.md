# Inside China AI

A content/blog platform covering China's AI industry, with an admin editor and interactive article widgets.

## Language

**Post**: A published article with title, slug, excerpt, markdown content, and attachments.
_Avoid_: Article, entry, blog post (use Post in code and docs)

**Widget**: An interactive React component embedded inside a Post's markdown content via an HTML comment marker (e.g., `<!-- widget:deepseek-talent -->`). Each widget is a self-contained component with its own hardcoded data. Widgets are registered in a central registry and lazy-loaded on demand.
_Avoid_: Dashboard (legacy term from the standalone HTML prototype), embed, block

**Widget Marker**: An HTML comment in the post's markdown content that signals the renderer to insert a specific widget at that position. Format: `<!-- widget:<name> -->`.
_Avoid_: Tag, shortcode, directive

**Widget Registry**: A TypeScript module (`src/components/widgets/registry.ts`) that maps widget names to lazy-loaded React components. Adding a new widget = create the component + add one line to the registry. The article page and editor dropdown read from this registry.
_Avoid_: Plugin system, widget manager

**Content Splitter**: The logic in the article page that parses post content for widget markers, splits the markdown into segments, and renders alternating Markdown content and Widget components.
_Avoid_: Parser, renderer (those are too generic)

**Data Package**: A named grouping of widgets that share a common data source (e.g., `deepseek` widgets all use data from the DeepSeek investor meeting). Widget names use a `package:view` convention (e.g., `deepseek:talent`), though single-name widgets without a package prefix are also valid.
_Avoid_: Dataset, module
