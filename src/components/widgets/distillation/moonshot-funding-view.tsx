import { useState } from "react";
import {
  FUNDING_EVENTS,
  SUMMARY_CARDS,
  STATUS_STYLE,
  type FundingEvent,
} from "./data/moonshot-funding";

const MAX_VAL = 55;

export function MoonshotFundingView() {
  const [selected, setSelected] = useState<FundingEvent | null>(FUNDING_EVENTS[3] ?? null);

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="flex flex-wrap gap-2.5">
        {SUMMARY_CARDS.map((c, i) => (
          <div
            key={i}
            className="flex-1 min-w-[110px] rounded-lg border border-border/60 bg-muted/30 px-3.5 py-3 text-center"
          >
            <div className="text-lg font-bold text-foreground">{c.val}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Valuation bar chart */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-foreground/80">
          <span className="h-2 w-2 rounded-sm bg-primary" />
          Valuation Timeline ($B)
        </div>

        {/* Legend */}
        <div className="mb-3 flex flex-wrap gap-3.5">
          {Object.entries(STATUS_STYLE).map(([key, st]) => (
            <div key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span
                className={`h-3 w-3 rounded-sm ${key === "completed" ? "bg-success" : key === "target" ? "border-2 border-brand bg-brand-muted" : key === "denied" ? "border-2 border-danger bg-danger-muted" : "border border-dashed border-border/40"}`}
              />
              {st.label}
            </div>
          ))}
        </div>

        {/* Bars */}
        <div
          className="flex items-end gap-2.5 overflow-x-auto border-b border-border/40 pb-1"
          style={{ height: 180 }}
        >
          {FUNDING_EVENTS.map((ev, i) => {
            const hasVal = ev.valuation != null;
            const barH = hasVal ? Math.max(8, (ev.valuation! / MAX_VAL) * 150) : 8;
            const st = STATUS_STYLE[ev.status];
            const isSelected = selected === ev;

            return (
              <button
                key={i}
                onClick={() => setSelected(isSelected ? null : ev)}
                aria-pressed={isSelected}
                className="flex h-full flex-1 flex-col items-center justify-end rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {hasVal && (
                  <div
                    className={`text-xs font-bold whitespace-nowrap ${ev.status === "completed" ? "text-success-foreground" : ev.status === "target" ? "text-brand-foreground" : "text-danger"}`}
                  >
                    ${ev.valuation}B
                  </div>
                )}
                <div
                  className={`w-full max-w-[52px] rounded-t transition-all duration-200 ${st.bar} ${isSelected ? "ring-2 ring-primary/40 ring-offset-1" : ""}`}
                  style={{ height: barH }}
                />
                <div className="mt-1.5 text-xs font-bold text-foreground/70">{ev.shortDate}</div>
              </button>
            );
          })}
        </div>

        {/* Event labels */}
        <div className="flex gap-2.5 mt-1">
          {FUNDING_EVENTS.map((ev, i) => (
            <div key={i} className="flex-1 text-center min-w-0">
              <div className="text-xs leading-tight text-muted-foreground max-w-[80px] mx-auto">
                {ev.event}
              </div>
              <span
                className={`mt-0.5 inline-block rounded px-1 py-0.5 text-xs font-bold ${STATUS_STYLE[ev.status].badge}`}
              >
                {STATUS_STYLE[ev.status].label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected detail */}
      {selected && (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <div className="mb-1 flex items-center gap-2">
            <strong className="text-foreground">
              {selected.date} · {selected.event}
            </strong>
            <span
              className={`rounded px-1 py-0.5 text-xs font-bold ${STATUS_STYLE[selected.status].badge}`}
            >
              {STATUS_STYLE[selected.status].label}
            </span>
            {selected.valuation != null && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-bold text-foreground">
                ${selected.valuation}B
              </span>
            )}
          </div>
          <p>{selected.detail}</p>
          <a
            href={selected.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-block text-xs text-primary hover:underline"
          >
            {selected.source} ↗
          </a>
        </div>
      )}
    </div>
  );
}
