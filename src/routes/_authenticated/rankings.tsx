import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, Minus, RefreshCw, Trash2 } from "lucide-react";
import {
  addTrackedKeyword,
  deleteTrackedKeyword,
  listTrackedKeywords,
  refreshKeywordSnapshots,
  type KeywordRow,
} from "@/lib/keyword-tracking.functions";
import { RankingAlertSettings } from "@/components/ranking-alert-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/rankings")({
  head: () => ({
    meta: [
      { title: "Keyword Rankings — Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RankingsPage,
});

function Sparkline({ points }: { points: Array<{ position: number | null }> }) {
  const values = points.map((p) => p.position ?? 101);
  if (values.length < 2) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const width = 96;
  const height = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(max - min, 1);
  const path = values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * width;
      // Lower position numbers are better, so invert the y axis.
      const y = ((value - min) / span) * (height - 4) + 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Position trend"
      className="text-foreground/70"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Delta({ row }: { row: KeywordRow }) {
  if (row.delta === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> new
      </span>
    );
  }
  if (row.delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> flat
      </span>
    );
  }
  const improved = row.delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        improved ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
      }`}
    >
      {improved ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(row.delta)}
    </span>
  );
}

function RankingsPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listTrackedKeywords);
  const add = useServerFn(addTrackedKeyword);
  const remove = useServerFn(deleteTrackedKeyword);
  const refresh = useServerFn(refreshKeywordSnapshots);
  const [keyword, setKeyword] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["tracked-keywords"],
    queryFn: () => list(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["tracked-keywords"] });

  const refreshMutation = useMutation({
    mutationFn: () => refresh(),
    onSuccess: (result) => {
      if (result.alerts.length > 0) {
        toast.warning(
          `${result.alerts.length} keyword${result.alerts.length === 1 ? "" : "s"} dropped: ${result.alerts.join(", ")}`,
        );
      } else {
        toast.success(`Updated ${result.updated} keyword${result.updated === 1 ? "" : "s"}.`);
      }
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Refresh failed"),
  });

  const addMutation = useMutation({
    mutationFn: (value: string) => add({ data: { keyword: value, database: "us" } }),
    onSuccess: () => {
      setKeyword("");
      toast.success("Keyword added. Run a refresh to capture its position.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add keyword"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Keyword removed.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not remove keyword"),
  });

  const rows = data ?? [];
  const alerts = rows.filter((r) => r.alert);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
              ← Admin
            </Link>
            <h1 className="mt-2 font-serif text-3xl">Keyword Rankings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Google positions and demand for chinaai.news, from Semrush. Snapshots are stored
              once per day so you can see the trend.
            </p>
          </div>
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {refreshMutation.isPending ? "Checking…" : "Refresh now"}
          </Button>
        </div>

        {alerts.length > 0 ? (
          <div className="mt-8 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="text-sm">
              <div className="font-medium text-destructive">
                {alerts.length} keyword{alerts.length === 1 ? "" : "s"} lost ground
              </div>
              <p className="mt-1 text-muted-foreground">
                {alerts
                  .map((a) =>
                    a.position === null
                      ? `${a.keyword} (out of top 100)`
                      : `${a.keyword} (#${a.previousPosition} → #${a.position})`,
                  )
                  .join(" · ")}
              </p>
            </div>
          </div>
        ) : null}

        <form
          className="mt-8 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const value = keyword.trim();
            if (value.length < 2) return;
            addMutation.mutate(value);
          }}
        >
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Track another keyword, e.g. china ai chips"
            aria-label="Keyword to track"
            className="sm:max-w-sm"
          />
          <Button type="submit" variant="secondary" disabled={addMutation.isPending}>
            Add keyword
          </Button>
        </form>

        <div className="mt-8 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Keyword</th>
                <th className="px-4 py-3 font-medium">Position</th>
                <th className="px-4 py-3 font-medium">Change</th>
                <th className="px-4 py-3 font-medium">Volume</th>
                <th className="px-4 py-3 font-medium">KD</th>
                <th className="px-4 py-3 font-medium">Trend</th>
                <th className="px-4 py-3 font-medium">Checked</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [0, 1, 2].map((i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="px-4 py-4" colSpan={8}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr className="border-t border-border/60">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                    {error instanceof Error ? error.message : "Could not load keywords."}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr className="border-t border-border/60">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                    No keywords tracked yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.keyword}</div>
                      {row.rankingUrl ? (
                        <div className="max-w-[22rem] truncate text-xs text-muted-foreground">
                          {row.rankingUrl}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {row.position === null ? (
                        <span className="text-muted-foreground">100+</span>
                      ) : (
                        <span className="font-medium">#{row.position}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Delta row={row} />
                    </td>
                    <td className="px-4 py-3">
                      {row.searchVolume === null
                        ? "—"
                        : row.searchVolume.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-3">
                      {row.difficulty === null ? "—" : Math.round(row.difficulty)}
                    </td>
                    <td className="px-4 py-3">
                      <Sparkline points={row.history} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.capturedOn ?? "never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Stop tracking ${row.keyword}`}
                        onClick={() => removeMutation.mutate(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Ranking and search-volume data from Semrush (US database); figures are estimates. Alerts
          use the thresholds below and are emailed to the recipients you list.
        </p>

        <RankingAlertSettings />
      </main>
    </div>
  );
}
