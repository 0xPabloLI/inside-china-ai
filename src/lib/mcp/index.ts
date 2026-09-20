import { defineMcp } from "@lovable.dev/mcp-js";
import listArticlesTool from "./tools/list-articles";
import getArticleTool from "./tools/get-article";
import searchArticlesTool from "./tools/search-articles";

export default defineMcp({
  name: "china-ai-news",
  title: "China AI News",
  version: "0.1.0",
  instructions:
    "Read-only tools over the published China AI News archive: independent reporting on Chinese AI model releases, the labs behind them, and China's AI policy. Use `list_articles` for the latest pieces, `search_articles` to find coverage by keyword, and `get_article` to read one article's full Markdown by slug. Only published articles are available.",
  tools: [listArticlesTool, searchArticlesTool, getArticleTool],
});
