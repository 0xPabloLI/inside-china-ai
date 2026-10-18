import { BENCHMARKS, MODELS, type BenchmarkRow } from "./data/benchmarks";
import { useHoverPin } from "../shared/use-hover-pin";

const translations = {
  title: "V4.1-Flash-1017 vs. the field",
  subtitle:
    "Official scores from the DeepSeek model card (Oct 17, 2026). Bars are shown on each benchmark's own 0-100 scale; the longest bar in a row is bolded.",
  legend: [
    { label: "DeepSeek-V4.1-Flash-1017 (this release)", tone: "bg-brand" },
    { label: "DeepSeek-V4.1-Flash (previous version)", tone: "bg-brand/30" },
    { label: "Best score in row", tone: "bg-foreground" },
    { label: "Other model", tone: "bg-muted-foreground/40" },
  ],
};

function bestScore(row: BenchmarkRow): number {
  const values = Object.values(row.scores).filter((v): v is number => v !== null);
  return Math.max(...values);
}

/** Gain of the featured model over the previous Flash version, in points. */
function gainOverPrevious(row: BenchmarkRow): number | null {
  const now = row.scores["ds-1017"];
  const before = row.scores["ds-v41"];
  if (now === null || now === undefined || before === null || before === undefined) return null;
  return Math.round((now - before) * 10) / 10;
}

export function DeepSeek1017BenchmarksView() {
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
              <th className="w-52 px-3 py-2 text-left font-semibold text-muted-foreground">
                Model
              </th>
              <th className="w-28 px-3 py-2 text-left font-semibold text-muted-foreground">
                Vendor
              </th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Role</th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((m) => (
              <tr
                key={m.id}
                className={`border-b border-border/40 ${
                  m.featured
                    ? "font-medium text-foreground"
                    : m.baseline
                      ? "text-foreground/80"
                      : "text-muted-foreground"
                }`}
              >
                <td className="px-3 py-2">{m.name}</td>
                <td className="px-3 py-2">{m.vendor}</td>
                <td className="px-3 py-2">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Benchmark bars */}
      <div className="space-y-5">
        {BENCHMARKS.map((row) => {
          const best = bestScore(row);
          const gain = gainOverPrevious(row);
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
                <span className="text-sm font-semibold text-foreground">
                  {row.name}
                  <span className="ml-2 rounded-sm bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {row.category}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {gain !== null && (
                    <span className="mr-2 font-medium text-foreground">
                      +{gain} vs previous
                    </span>
                  )}
                  {row.description}
                </span>
              </div>
              <div className="space-y-1.5">
                {MODELS.map((m) => {
                  const score = row.scores[m.id];
                  if (score === null || score === undefined) return null;
                  const isBest = score === best;
                  const isFeatured = m.featured === true;
                  return (
                    <div key={m.id} className="flex items-center gap-2">
                      <span
                        className={`w-52 shrink-0 truncate text-xs ${
                          isFeatured
                            ? "font-medium text-foreground"
                            : m.baseline
                              ? "text-foreground/80"
                              : "text-muted-foreground"
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
                              : isFeatured
                                ? "bg-brand"
                                : m.baseline
                                  ? "bg-brand/30"
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
                        {score.toFixed(1)}
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

      <p className="mt-3 text-xs italic text-muted-foreground">
        Scores as reported by DeepSeek on the official Hugging Face model card (Oct 17, 2026). The
        comparison models are listed by DeepSeek itself and were not independently reproduced by
        us. Missing bars mean DeepSeek did not report that score for that model.
      </p>
    </>
  );
}
