import { useState } from "react";
import {
  COMPANIES,
  MONTHS,
  NEWS_EVENTS,
  EVENT_TYPE_META,
  type NewsEvent,
} from "./data/news-events";

export function NewsCoverageView() {
  const [hovered, setHovered] = useState<NewsEvent | null>(null);
  const [selected, setSelected] = useState<NewsEvent | null>(null);

  const active = hovered ?? selected;

  return (
    <div className="space-y-4">
      {/* Event matrix grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          {/* Month headers */}
          <div className="flex items-center gap-1 border-b border-border/40 pb-2 pl-[140px]">
            {MONTHS.map((m) => (
              <div
                key={m}
                className="flex-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {m}
              </div>
            ))}
          </div>

          {/* Company rows */}
          {COMPANIES.map((company) => (
            <div
              key={company}
              className="flex items-center gap-1 border-b border-border/20 py-2.5"
            >
              <div className="w-[140px] shrink-0 pr-3 text-[11px] font-semibold text-foreground/80">
                {company}
              </div>
              {MONTHS.map((_, mIdx) => {
                const events = NEWS_EVENTS.filter(
                  (e) => e.company === company && e.monthIdx === mIdx,
                );
                return (
                  <div
                    key={mIdx}
                    className="relative flex h-12 flex-1 items-center justify-center gap-1 rounded-md transition-colors hover:bg-muted/30"
                  >
                    {events.map((ev, i) => (
                      <button
                        key={i}
                        onMouseEnter={() => setHovered(ev)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() =>
                          setSelected(selected === ev ? null : ev)
                        }
                        className="h-3.5 w-3.5 rounded-full border-2 border-background shadow-sm transition-transform hover:scale-150"
                        style={{
                          background: EVENT_TYPE_META[ev.type].color,
                        }}
                        title={ev.headline}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
          <div
            key={key}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: meta.color }}
            />
            {meta.label}
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {active && (
        <div
          className={`rounded-lg border bg-muted/30 p-4 transition-all ${
            active.type === "accusation"
              ? "border-danger-muted"
              : active.type === "product"
                ? "border-brand-muted"
                : active.type === "funding"
                  ? "border-success-muted"
                  : active.type === "political"
                    ? "border-purple-500/30"
                    : "border-warning-muted"
          }`}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ background: EVENT_TYPE_META[active.type].color }}
            >
              {EVENT_TYPE_META[active.type].label}
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {active.company} · {active.month}
            </span>
          </div>
          <h4 className="text-sm font-bold leading-snug text-foreground">
            {active.headline}
          </h4>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {active.detail}
          </p>
          <a
            href={active.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[10px] text-primary hover:underline"
          >
            {active.source} ↗
          </a>
        </div>
      )}
    </div>
  );
}
