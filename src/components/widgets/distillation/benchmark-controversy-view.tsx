import { useState } from "react";
import { METRICS, MODEL_META, type MetricRow } from "./data/benchmarks";

function Bar({
  value,
  max,
  color,
  unit,
  higherIsBetter,
  best,
  worst,
}: {
  value: number;
  max: number;
  color: string;
  unit: string;
  higherIsBetter: boolean;
  best: boolean;
  worst: boolean;
}) {
  const pct = Math.max(2, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-6 flex-1 overflow-hidden rounded">
        <div
          className="flex h-full items-center justify-end rounded pr-2 text-xs font-bold text-white transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: color,
            opacity: worst ? 0.5 : 1,
            boxShadow: best ? `0 0 0 2px ${color}44` : "none",
          }}
        >
          {value}
          {unit}
        </div>
      </div>
      {best && <span className="shrink-0 text-xs font-bold text-success-foreground">★ Best</span>}
      {worst && !best && <span className="shrink-0 text-xs font-bold text-danger">▼ Worst</span>}
    </div>
  );
}

export function BenchmarkControversyView() {
  const [activeRow, setActiveRow] = useState<MetricRow | null>(null);

  return (
    <div className="space-y-4">
      {/* Model legend */}
      <div className="flex flex-wrap items-center gap-4">
        {Object.entries(MODEL_META).map(([key, meta]) => (
          <div
            key={key}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            <span className="h-3 w-6 rounded-sm" style={{ background: meta.color }} />
            {meta.name}
          </div>
        ))}
        <div className="ml-auto text-xs text-muted-foreground/60">Hover bars for analysis</div>
      </div>

      {/* Grouped horizontal bars */}
      <div className="space-y-3.5">
        {METRICS.map((row) => {
          const values = [row.k3, row.k26, row.claude];
          const max = Math.max(...values) * 1.15;
          const bestVal = row.higherIsBetter ? Math.max(...values) : Math.min(...values);
          const worstVal = row.higherIsBetter ? Math.min(...values) : Math.max(...values);
          const isActive = activeRow === row;

          return (
            <div
              key={row.dimension}
              className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-muted/20"
              onMouseEnter={() => setActiveRow(row)}
              onMouseLeave={() => setActiveRow(null)}
            >
              {/* Dimension label */}
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[12px] font-bold text-foreground/80">{row.dimension}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                    row.higherIsBetter
                      ? "bg-success-muted text-success-foreground"
                      : "bg-danger-muted text-danger"
                  }`}
                >
                  {row.higherIsBetter ? "↑ higher better" : "↓ lower better"}
                </span>
              </div>

              {/* Bars */}
              <div className="ml-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">
                    {MODEL_META.k3.name}
                  </span>
                  <div className="flex-1">
                    <Bar
                      value={row.k3}
                      max={max}
                      color={MODEL_META.k3.color}
                      unit={row.unit}
                      higherIsBetter={row.higherIsBetter}
                      best={row.k3 === bestVal}
                      worst={row.k3 === worstVal}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">
                    {MODEL_META.k26.name}
                  </span>
                  <div className="flex-1">
                    <Bar
                      value={row.k26}
                      max={max}
                      color={MODEL_META.k26.color}
                      unit={row.unit}
                      higherIsBetter={row.higherIsBetter}
                      best={row.k26 === bestVal}
                      worst={row.k26 === worstVal}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">
                    {MODEL_META.claude.name}
                  </span>
                  <div className="flex-1">
                    <Bar
                      value={row.claude}
                      max={max}
                      color={MODEL_META.claude.color}
                      unit={row.unit}
                      higherIsBetter={row.higherIsBetter}
                      best={row.claude === bestVal}
                      worst={row.claude === worstVal}
                    />
                  </div>
                </div>
              </div>

              {/* Analysis note */}
              {isActive && (
                <div className="mt-2 rounded-md bg-warning-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  💡 {row.note}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sources */}
      <div className="border-t border-border/30 pt-3 text-xs leading-relaxed text-muted-foreground/60">
        Sources: Artificial Analysis · SCMP · PCMag · HackerNoon · LMSYS Arena · Moonshot evaluation
        report
      </div>
    </div>
  );
}
