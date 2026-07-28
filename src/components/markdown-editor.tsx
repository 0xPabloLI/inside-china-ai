import { useRef, useCallback, useState, type KeyboardEvent, type ComponentType } from "react";
import {
  Bold,
  Italic,
  Code,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  Link as LinkIcon,
  Code2,
  Minus,
  Strikethrough,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownContent } from "@/components/markdown-content";
import { cn } from "@/lib/utils";
import { getWidgetNames } from "@/components/widgets/registry";

/* ------------------------------------------------------------------ */
/* Text manipulation helpers                                          */
/* ------------------------------------------------------------------ */

type InsertAction = {
  /** Text to insert before the selection (or cursor) */
  before?: string;
  /** Text to insert after the selection (or cursor) */
  after?: string;
  /** Placeholder inserted when nothing is selected */
  placeholder?: string;
  /**
   * Prefix to toggle at the beginning of every selected line.
   * Mutually exclusive with before/after.
   */
  linePrefix?: string;
};

function applyAction(ta: HTMLTextAreaElement, action: InsertAction, onChange: (v: string) => void) {
  const { selectionStart: start, selectionEnd: end, value } = ta;

  /* ---- Line-prefix mode (headings, quotes, lists) ---- */
  if (action.linePrefix) {
    const prefix = action.linePrefix;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    // Expand selection to cover full lines
    const expandedStart = lineStart;
    const expandedEnd = end;
    const selectedLines = value.slice(expandedStart, expandedEnd);
    // Check if every line already starts with the prefix
    const lines = selectedLines.split("\n");
    const allHave = lines.every((l) => l.startsWith(prefix));
    const newLines = lines.map((l) => (allHave ? l.slice(prefix.length) : prefix + l));
    const newText = value.slice(0, expandedStart) + newLines.join("\n") + value.slice(expandedEnd);
    onChange(newText);
    // Restore selection
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = expandedStart;
      ta.selectionEnd = expandedStart + newLines.join("\n").length;
    });
    return;
  }

  /* ---- Wrap mode (bold, italic, inline code) ---- */
  const before = action.before ?? "";
  const after = action.after ?? "";
  const selected = value.slice(start, end);
  const inner = selected || action.placeholder || "";
  const newText = value.slice(0, start) + before + inner + after + value.slice(end);
  onChange(newText);
  requestAnimationFrame(() => {
    ta.focus();
    if (selected) {
      // Select the wrapped content
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + inner.length;
    } else {
      // Place cursor inside the placeholder
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + inner.length;
    }
  });
}

function insertBlock(ta: HTMLTextAreaElement, block: string, onChange: (v: string) => void) {
  const { selectionStart: start, value } = ta;
  const needsNewlineBefore = start > 0 && value[start - 1] !== "\n";
  const prefix = needsNewlineBefore ? "\n\n" : "";
  const newText = value.slice(0, start) + prefix + block + value.slice(start);
  onChange(newText);
  requestAnimationFrame(() => {
    ta.focus();
    const pos = start + prefix.length + block.length;
    ta.selectionStart = pos;
    ta.selectionEnd = pos;
  });
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                            */
/* ------------------------------------------------------------------ */

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

const Divider = () => <div className="mx-1 h-5 w-px bg-border" />;

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const act = useCallback(
    (action: InsertAction) => {
      const ta = taRef.current;
      if (!ta) return;
      applyAction(ta, action, onChange);
    },
    [onChange],
  );

  const block = useCallback(
    (text: string) => {
      const ta = taRef.current;
      if (!ta) return;
      insertBlock(ta, text, onChange);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === "b") {
          e.preventDefault();
          act({ before: "**", after: "**", placeholder: "bold text" });
        } else if (key === "i") {
          e.preventDefault();
          act({ before: "*", after: "*", placeholder: "italic text" });
        } else if (key === "k") {
          e.preventDefault();
          act({ before: "[", after: "](https://)", placeholder: "link text" });
        }
      }
    },
    [act],
  );

  return (
    <div className={cn("space-y-2", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border/60 bg-muted/40 p-1">
        <ToolbarButton
          icon={Heading2}
          label="Heading 2"
          onClick={() => act({ linePrefix: "## " })}
        />
        <ToolbarButton
          icon={Heading3}
          label="Heading 3"
          onClick={() => act({ linePrefix: "### " })}
        />
        <Divider />
        <ToolbarButton
          icon={Bold}
          label="Bold (Ctrl+B)"
          onClick={() => act({ before: "**", after: "**", placeholder: "bold text" })}
        />
        <ToolbarButton
          icon={Italic}
          label="Italic (Ctrl+I)"
          onClick={() => act({ before: "*", after: "*", placeholder: "italic text" })}
        />
        <ToolbarButton
          icon={Code}
          label="Inline code"
          onClick={() => act({ before: "`", after: "`", placeholder: "code" })}
        />
        <ToolbarButton
          icon={Strikethrough}
          label="Strikethrough"
          onClick={() => act({ before: "~~", after: "~~", placeholder: "strikethrough" })}
        />
        <Divider />
        <ToolbarButton
          icon={LinkIcon}
          label="Link (Ctrl+K)"
          onClick={() => act({ before: "[", after: "](https://)", placeholder: "link text" })}
        />
        <ToolbarButton icon={Quote} label="Quote" onClick={() => act({ linePrefix: "> " })} />
        <ToolbarButton
          icon={List}
          label="Unordered list"
          onClick={() => act({ linePrefix: "- " })}
        />
        <ToolbarButton
          icon={ListOrdered}
          label="Ordered list"
          onClick={() => act({ linePrefix: "1. " })}
        />
        <Divider />
        <ToolbarButton icon={Code2} label="Code block" onClick={() => block("```\ncode\n```")} />
        <ToolbarButton icon={Minus} label="Horizontal rule" onClick={() => block("---")} />
        <Divider />
        <WidgetButton onSelect={(name) => block(`<!-- widget:${name} -->`)} />
      </div>

      {/* Editor + Preview split */}
      <div className="flex min-h-[400px] gap-0 rounded-md border border-border/60 overflow-hidden">
        <div className="flex-1 min-w-0 border-r border-border/60">
          <Textarea
            ref={taRef}
            className="h-full min-h-[400px] resize-none rounded-none border-0 font-mono text-sm focus-visible:ring-0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Write in Markdown…"}
          />
        </div>
        <div className="flex-1 min-w-0 min-h-[400px] overflow-auto p-4 bg-card/50">
          {value.trim() ? (
            <MarkdownContent content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Preview will appear here…</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Widget Button — inserts <!-- widget:xxx --> marker                 */
/* ------------------------------------------------------------------ */

function WidgetButton({ onSelect }: { onSelect: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const widgetNames = getWidgetNames();

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Insert widget"
        aria-label="Insert widget"
        onClick={() => setOpen((v) => !v)}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-border/60 bg-card shadow-md">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              Insert widget
            </div>
            {widgetNames.map((name) => (
              <button
                key={name}
                type="button"
                className="block w-full px-2 py-1.5 text-left text-sm font-mono hover:bg-muted/60"
                onClick={() => {
                  onSelect(name);
                  setOpen(false);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
