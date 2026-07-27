import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";

/**
 * Renders Markdown content using react-markdown + remark-gfm (GitHub Flavored
 * Markdown: tables, strikethrough, task lists, autolinks).
 *
 * Raw HTML is disabled by default for safety — only Markdown syntax is parsed.
 */
function MarkdownContentImpl({ content }: { content: string }) {
  return (
    <div className="prose-article">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Open links in a new tab
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownContent = memo(MarkdownContentImpl);
