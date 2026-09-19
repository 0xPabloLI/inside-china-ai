import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Source {
  slug: string;
  title: string;
  publishedAt: string | null;
}

const SUGGESTIONS = [
  "How do DeepSeek and Qwen compare on open weights?",
  "What changed in China's AI regulation this year?",
  "Which Chinese labs release frontier reasoning models?",
];

const MAX_CHARS = 400;

/**
 * Reader-facing grounded Q&A. Streams an answer from /api/ask, which retrieves
 * passages from published China AI News articles and cites them by number.
 */
export function AskChinaAi({ autoFocus = false }: { autoFocus?: boolean } = {}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function ask(raw: string) {
    const text = raw.trim();
    if (text.length < 8 || loading) return;

    setLoading(true);
    setError(null);
    setAnswer("");
    setSources([]);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (!response.body) {
        setError("Something went wrong. Please try again.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let metaDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        if (!metaDone) {
          const newline = buffer.indexOf("\n");
          if (newline === -1) continue;
          try {
            const meta = JSON.parse(buffer.slice(0, newline)) as { sources?: Source[] };
            setSources(meta.sources ?? []);
          } catch {
            /* keep the answer flowing even if metadata is malformed */
          }
          buffer = buffer.slice(newline + 1);
          metaDone = true;
        }

        if (buffer) {
          const chunk = buffer;
          buffer = "";
          setAnswer((prev) => prev + chunk);
        }
      }
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="ask-question" className="text-sm text-muted-foreground">
          Ask a question about Chinese AI models, labs or policy. Answers come only from our
          published reporting, with links to the articles used.
        </label>
        <Textarea
          id="ask-question"
          ref={inputRef}
          value={question}
          maxLength={MAX_CHARS}
          rows={3}
          autoFocus={autoFocus}
          placeholder="e.g. Which Chinese labs publish open-weight reasoning models?"
          className="mt-3 resize-none"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">
            {question.length}/{MAX_CHARS} · Enter to send
          </span>
          <Button type="submit" size="sm" disabled={loading || question.trim().length < 8}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {loading ? "Reading articles…" : "Ask"}
          </Button>
        </div>
      </form>

      {!answer && !loading && !error ? (
        <ul className="mt-5 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                onClick={() => {
                  setQuestion(s);
                  void ask(s);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading && !answer ? (
        <p className="mt-6 animate-pulse text-sm text-muted-foreground">
          Searching the archive…
        </p>
      ) : null}

      {answer ? (
        <div className="mt-6 border-t border-border/60 pt-6">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{answer}</p>

          {sources.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Sources</h3>
              <ol className="mt-2 space-y-1.5 text-sm">
                {sources.map((s, i) => (
                  <li key={s.slug} className="flex gap-2">
                    <span className="text-muted-foreground">[{i + 1}]</span>
                    <Link
                      to="/posts/$slug"
                      params={{ slug: s.slug }}
                      className="underline decoration-border hover:decoration-foreground"
                    >
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <p className="mt-5 text-xs text-muted-foreground">
            Generated from China AI News articles. Check the linked reporting for details and dates.
          </p>
        </div>
      ) : null}
    </div>
  );
}
