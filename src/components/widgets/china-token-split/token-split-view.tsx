import { DAILY_TOKENS, OPENROUTER, SOURCE_CARDS } from "./data/token-split";

export function TokenSplitRealityCheckView() {
  return (
    <>
      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">Where China's tokens go</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The short-video sink, and the numbers behind it
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SOURCE_CARDS.map((card) => (
          <div
            key={card.side}
            className={`rounded-lg border p-3 ${
              card.status === "sourced"
                ? "border-warning/50 bg-warning-muted/40"
                : "border-danger/40 bg-danger-muted/40"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">{card.side}</span>
              <span
                className={`text-xs font-semibold tracking-wide ${
                  card.status === "sourced" ? "text-warning-foreground" : "text-danger"
                }`}
              >
                {card.statusLabel}
              </span>
            </div>
            <div className="mt-1 text-3xl font-semibold text-foreground">{card.share}</div>
            <div className="text-xs text-muted-foreground">{card.label}</div>
            <p className="mt-2 text-xs text-muted-foreground">{card.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border/50 bg-muted/20 p-3">
        <div className="mb-3 text-xs font-medium text-muted-foreground">
          OpenRouter, September 2026
        </div>
        {OPENROUTER.map((row) => (
          <div key={row.label} className="mb-3 last:mb-0">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="text-foreground">
                {row.cn}% China / {row.us}% US
              </span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-border">
              <div className="bg-warning" style={{ width: `${row.cn}%` }} />
              <div className="bg-muted-foreground/40" style={{ width: `${row.us}%` }} />
            </div>
          </div>
        ))}
        <p className="mt-2 text-xs italic text-muted-foreground">
          Chinese models cost about 80% less per token, so usage share runs far ahead of spend.
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-border/50 bg-muted/20 p-3">
        <div className="mb-3 text-xs font-medium text-muted-foreground">
          China daily token calls
        </div>
        <div className="flex items-end gap-3">
          {DAILY_TOKENS.map((entry) => (
            <div key={entry.date} className="flex-1">
              <div className="text-sm font-semibold text-foreground">{entry.value}</div>
              <div className="mt-1 h-1.5 rounded-full bg-border">
                <div className="h-1.5 rounded-full bg-warning" style={{ width: entry.bar }} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{entry.date}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Early 2024: about 0.1 trillion a day. The March 2026 figure is more than 1,000x higher.
        </p>
      </div>

      <p className="mt-3 text-xs italic text-muted-foreground">
        Sources: Chinese Online investor relations record 2026-004 (June 3, 2026); Tidenews and
        Beijing News (October 2026); National Data Administration via Xinhua (March 24, 2026) and IT
        Home (August 30, 2026); CLSA note via Zhitong Finance (October 12, 2026).
      </p>
    </>
  );
}
