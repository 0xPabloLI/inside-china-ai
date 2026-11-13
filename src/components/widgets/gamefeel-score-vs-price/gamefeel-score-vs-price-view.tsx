import { AS_OF, AXIS_MAX, AXIS_MIN, ROWS, type GameFeelRow } from "./data/scores";

const translations = {
  title: "GameFeel Bench v1.4: score vs price",
  subtitle:
    "Average of the seven subcategories on a 100-point scale. Bars zoom into the 40–50 window so a 5.3-point spread stays readable; the number beside each bar is the real score.",
  axisNote: "Bars start at 40, not 0 (zoomed axis) · price = the benchmark's cost per task",
  earlyLabel: "early checkpoint",
};

const money = (value: number) => `$${value.toFixed(2)}`;

function barWidth(row: GameFeelRow): string {
  const position = ((row.score - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100;
  return `${Math.max(2, Math.min(100, position))}%`;
}

export function GameFeelScoreVsPriceView() {
  const t = translations;
  const top = ROWS[0];
  const runnerUp = ROWS[1];
  const cheaperMultiple = (runnerUp.pricePerTaskUsd / top.pricePerTaskUsd).toFixed(1);

  return (
    <>
      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">{t.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
        <ul className="space-y-4">
          {ROWS.map((row) => (
            <li key={row.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-foreground">{row.model}</span>
                  <span className="text-xs text-muted-foreground">{row.effort}</span>
                  {row.earlyCheckpoint ? (
                    <span className="rounded border border-border/60 bg-background/60 px-1.5 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                      {t.earlyLabel}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {money(row.pricePerTaskUsd)}/task
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-muted/40">
                  <div
                    className={`h-full rounded-sm ${row.earlyCheckpoint ? "bg-brand" : "bg-muted-foreground/40"}`}
                    style={{ width: barWidth(row) }}
                  />
                </div>
                <span className="w-11 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                  {row.score.toFixed(1)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs text-muted-foreground">{t.axisNote}</p>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {money(top.pricePerTaskUsd)} vs {money(runnerUp.pricePerTaskUsd)}
        </span>{" "}
        per task — the top score costs {cheaperMultiple}× less than the second.
      </p>

      <p className="mt-3 text-xs italic text-muted-foreground">
        GameFeel Bench v1.4, scores as of {AS_OF}. One developer's benchmark: the two Qwen-4 entries
        are unreleased early checkpoints whose identity Alibaba has not confirmed. The maintainer
        revises the source CSV in place — later revisions moved these averages by 1–2 points and
        left the top two unchanged.
      </p>
    </>
  );
}
