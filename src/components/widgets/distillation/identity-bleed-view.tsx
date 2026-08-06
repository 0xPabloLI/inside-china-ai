import { useState } from "react";

const BLEED_DATA = [
  { model: "Kimi K3", rate: 15, color: "#3b82f6", note: "Hacker News user ataoz tested 'Tell me about yourself' on HuggingFace." },
  { model: "GLM 5.2", rate: 8, color: "#8b5cf6", note: "LessWrong reported similar identity bleed in GLM 5.2." },
  { model: "Kimi K2.6", rate: 2, color: "#93c5fd", note: "Minimal bleed in previous version — pre-distillation era." },
  { model: "Claude", rate: 0, color: "#f59e0b", note: "Reference model — identifies correctly by design." },
];

export function IdentityBleedView() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      {/* Concept flow diagram */}
      <div className="flex items-center justify-center gap-3 py-4">
        {/* Claude box */}
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="flex h-16 w-20 items-center justify-center rounded-xl border-2 text-[11px] font-bold"
            style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-muted)" }}
          >
            Claude
          </div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Source Model
          </span>
        </div>

        {/* Arrow + annotations */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-[10px] font-bold text-muted-foreground">
            Distillation
          </div>
          <div className="relative h-0.5 w-16 bg-gradient-to-r from-warning to-brand">
            <div className="absolute right-0 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[4px] border-l-[6px] border-y-transparent border-l-brand" />
          </div>
          <div className="text-[10px] text-muted-foreground/70">
            ~3.4M exchanges
          </div>
        </div>

        {/* K3 box */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative">
            <div
              className="flex h-16 w-20 items-center justify-center rounded-xl border-2 text-[11px] font-bold"
              style={{ borderColor: "var(--color-brand)", background: "var(--color-brand-muted)" }}
            >
              Kimi K3
            </div>
            {/* Speech bubble */}
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-warning-muted bg-warning-muted px-2.5 py-1 text-[10px] font-medium text-warning-foreground shadow-sm">
              "I'm Claude, made by Anthropic"
            </div>
          </div>
          <span className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
            Distilled Model
          </span>
        </div>
      </div>

      {/* Bleed rate badge */}
      <div className="flex justify-center">
        <div className="rounded-full border border-danger-muted bg-danger-muted px-4 py-1.5 text-[11px] font-bold text-danger-foreground">
          15% of K3 interactions self-identify as Claude
        </div>
      </div>

      {/* Bleed rate comparison bars */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-foreground/80">
          <span className="h-2 w-2 rounded-sm bg-brand" />
          Identity Bleed Rate by Model
        </div>

        <div className="space-y-2.5">
          {BLEED_DATA.map((item, i) => {
            const isHovered = hovered === i;
            return (
              <div
                key={item.model}
                className="flex items-center gap-3"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="w-20 shrink-0 text-[11px] font-semibold text-foreground/70">
                  {item.model}
                </span>
                <div className="relative h-7 flex-1 overflow-hidden rounded">
                  <div
                    className="flex h-full items-center justify-end rounded pr-2 text-[10px] font-bold text-white transition-all duration-300"
                    style={{
                      width: `${Math.max(3, item.rate * 6)}%`,
                      background: item.color,
                      opacity: hovered === null || isHovered ? 1 : 0.4,
                    }}
                  >
                    {item.rate > 0 ? `${item.rate}%` : "0%"}
                  </div>
                </div>
                {item.rate === 0 && (
                  <span className="shrink-0 text-[10px] text-success-foreground">
                    ✓ Correct
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Hover detail */}
        {hovered !== null && (
          <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {BLEED_DATA[hovered].note}
          </div>
        )}
      </div>

      {/* Sources */}
      <div className="border-t border-border/30 pt-3 text-[10px] leading-relaxed text-muted-foreground/60">
        Sources:{" "}
        <a
          href="https://news.ycombinator.com/item?id=49076001"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Hacker News (ataoz) ↗
        </a>{" "}
        ·{" "}
        <a
          href="https://www.lesswrong.com/posts/dQyKzHaGqvdqpekJr/does-distilling-claude-carry-the-persona-with-it"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          LessWrong analysis ↗
        </a>
      </div>
    </div>
  );
}
