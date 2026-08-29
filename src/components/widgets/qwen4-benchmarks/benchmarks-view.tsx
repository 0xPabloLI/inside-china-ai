import { BENCHMARKS, MODELS, type BenchmarkRow } from "./data/benchmarks";
import { useHoverPin } from "../shared/use-hover-pin";

const translations = {
  title: "Qwen3.8-Flash-Next Benchmark Matrix",
  subtitle:
    "Official scores from the Qwen team: a 6B-active open model against Alibaba's flagship, DeepSeek, and Claude. Bold bar = best score in the row.",
  legend: [
    { label: "Qwen3.8-Flash-Next (this release)", tone: "bg-brand" },
    { label: "Best score in row", tone: "bg-foreground" },
    { label: "Other model", tone: "bg-muted-foreground/40" },
  ],
};

function bestScore(row: BenchmarkRow): number {
  const values = Object.values(row.scores).filter((v): v is number => v !== null);
  return Math.max(...values);
}

export function Qwen4BenchmarksView() {
  const pin = useHoverPin<string>();
  const t = translations;

  return (
    <>
      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">{t.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {/* Model roster */}
      <div className="mb-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/80">
              <th className="py-2 px-3 text-left font-semibold text-muted-foreground w-44">
                Model
              </th>
              <th className="py-2 px-3 text-left font-semibold text-muted-foreground w-24">
                Total
              </th>
              <th className="py-2 px-3 text-left font-semibold text-muted-foreground">Per token</th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((m) => (
              <tr
                key={m.id}
                className={`border-b border-border/40 ${
                  m.id === "flash-next" ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                <td className="py-2 px-3">{m.name}</td>
                <td className="py-2 px-3">{m.totalParams}</td>
                <td className="py-2 px-3">{m.activeParams}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Benchmark bars */}
      <div className="space-y-5">
        {BENCHMARKS.map((row) => {
          const best = bestScore(row);
          const isActive = pin.isActive(row.id);
          return (
            <div
              key={row.id}
              tabIndex={0}
              className={`rounded-lg border p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                isActive ? "border-brand/60 bg-background/80" : "border-border/40"
              }`}
              onMouseEnter={() => pin.onEnter(row.id)}
              onMouseLeave={pin.onLeave}
              onFocus={() => pin.onFocus(row.id)}
              onBlur={pin.onBlur}
              onClick={() => pin.onToggle(row.id)}
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-semibold text-foreground">{row.name}</span>
                <span className="text-xs text-muted-foreground">{row.description}</span>
              </div>
              <div className="space-y-1.5">
                {MODELS.map((m) => {
                  const score = row.scores[m.id];
                  if (score === null || score === undefined) return null;
                  const isBest = score === best;
                  const isFlash = m.id === "flash-next";
                  return (
                    <div key={m.id} className="flex items-center gap-2">
                      <span
                        className={`w-44 shrink-0 truncate text-xs ${
                          isFlash ? "font-medium text-foreground" : "text-muted-foreground"
                        }`}
                        title={m.name}
                      >
                        {m.name}
                      </span>
                      <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted/40">
                        <div
                          className={`h-full rounded-sm ${
                            isBest
                              ? "bg-foreground"
                              : isFlash
                                ? "bg-brand"
                                : "bg-muted-foreground/40"
                          }`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                      <span
                        className={`w-12 shrink-0 text-right text-xs tabular-nums ${
                          isBest ? "font-semibold text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {score}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {t.legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded ${l.tone}`} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground italic">
        Scores as reported by the Qwen team on the official blog and Hugging Face model card (Aug
        26, 2026). Rows are self-reported by Alibaba and not independently reproduced; missing bars
        mean the score was not reported.
      </p>
    </>
  );
}
