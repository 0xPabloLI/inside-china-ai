import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellOff, BellRing, Mail, Plus, Trash2 } from "lucide-react";
import {
  addAlertRecipient,
  deleteAlertRecipient,
  getAlertConfig,
  isDrop,
  updateAlertSettings,
} from "@/lib/keyword-tracking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

/** Admin controls for when ranking alerts fire and who receives them. */
export function RankingAlertSettings() {
  const queryClient = useQueryClient();
  const load = useServerFn(getAlertConfig);
  const saveSettings = useServerFn(updateAlertSettings);
  const addRecipient = useServerFn(addAlertRecipient);
  const removeRecipient = useServerFn(deleteAlertRecipient);

  const { data, isLoading } = useQuery({
    queryKey: ["ranking-alert-config"],
    queryFn: () => load(),
  });

  const [threshold, setThreshold] = useState("3");
  const [lostRanking, setLostRanking] = useState(true);
  const [email, setEmail] = useState("");

  type PreviewRow = { id: number; keyword: string; from: string; to: string };
  const [rows, setRows] = useState<PreviewRow[]>([
    { id: 1, keyword: "china ai news", from: "8", to: "14" },
    { id: 2, keyword: "chinese ai models", from: "22", to: "" },
  ]);
  const nextId = () => Math.max(0, ...rows.map((r) => r.id)) + 1;
  const updateRow = (id: number, patch: Partial<PreviewRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Preview uses the values currently in the form, saved or not.
  const parsedThreshold = Number(threshold);
  const previewThreshold =
    Number.isInteger(parsedThreshold) && parsedThreshold >= 1 ? parsedThreshold : null;

  const evaluated = rows.map((row) => {
    const from = row.from.trim() === "" ? null : Number(row.from);
    const to = row.to.trim() === "" ? null : Number(row.to);
    const valid =
      previewThreshold !== null &&
      from !== null &&
      Number.isInteger(from) &&
      from >= 1 &&
      (to === null || (Number.isInteger(to) && to >= 1));
    const wouldAlert = valid ? isDrop(to, from, previewThreshold!, lostRanking) : false;
    const alertType: "drop" | "lost" | null = !wouldAlert
      ? null
      : to === null
        ? "lost"
        : "drop";
    const reason = !valid
      ? "Incomplete input"
      : !wouldAlert
        ? to === null
          ? "Left top 100 but lost-ranking alerts are off"
          : `Moved ${to! - from! >= 0 ? "↓" : "↑"}${Math.abs(to! - from!)} — below the ${previewThreshold}-position threshold`
        : to === null
          ? `Left the top 100 (was #${from})`
          : `Fell from #${from} to #${to} (−${to! - from!}), at or past the ${previewThreshold}-position threshold`;
    return { row, from, to, valid, wouldAlert, alertType, reason };
  });
  const firing = evaluated.filter((e) => e.wouldAlert);
  const dropCount = firing.filter((e) => e.alertType === "drop").length;
  const lostCount = firing.filter((e) => e.alertType === "lost").length;


  // Query data arrives after mount, so sync the form once it lands.
  useEffect(() => {
    if (!data) return;
    setThreshold(String(data.dropThreshold));
    setLostRanking(data.alertOnLostRanking);
  }, [data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ranking-alert-config"] });
    queryClient.invalidateQueries({ queryKey: ["tracked-keywords"] });
  };

  const settingsMutation = useMutation({
    mutationFn: () =>
      saveSettings({
        data: { dropThreshold: Number(threshold), alertOnLostRanking: lostRanking },
      }),
    onSuccess: () => {
      toast.success("Alert thresholds saved.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save"),
  });

  const addMutation = useMutation({
    mutationFn: (value: string) => addRecipient({ data: { email: value } }),
    onSuccess: () => {
      setEmail("");
      toast.success("Recipient added.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add recipient"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeRecipient({ data: { id } }),
    onSuccess: () => {
      toast.success("Recipient removed.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not remove"),
  });

  return (
    <section className="mt-10 rounded-lg border border-border/60 p-6">
      <h2 className="font-serif text-xl">Alert settings</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Applies to the banner above, the daily automatic check, and the emails it sends.
      </p>

      {isLoading ? (
        <Skeleton className="mt-6 h-24 w-full" />
      ) : (
        <>
          <form
            className="mt-6 grid gap-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(threshold);
              if (!Number.isInteger(value) || value < 1 || value > 50) {
                toast.error("Threshold must be a whole number between 1 and 50.");
                return;
              }
              settingsMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="drop-threshold">Alert when a keyword falls by</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="drop-threshold"
                  type="number"
                  min={1}
                  max={50}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">positions or more</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lost-ranking">Leaving the top 100</Label>
              <div className="flex items-center gap-3">
                <Switch
                  id="lost-ranking"
                  checked={lostRanking}
                  onCheckedChange={setLostRanking}
                />
                <span className="text-sm text-muted-foreground">
                  {lostRanking ? "Raises an alert" : "Ignored"}
                </span>
              </div>
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" disabled={settingsMutation.isPending}>
                {settingsMutation.isPending ? "Saving…" : "Save thresholds"}
              </Button>
            </div>
          </form>

          <div className="mt-8 border-t border-border/60 pt-6">
            <h3 className="text-sm font-medium">Email recipients</h3>
            {data && data.recipients.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                No custom list yet — alerts go to every admin
                {data.fallbackRecipients.length > 0
                  ? ` (${data.fallbackRecipients.join(", ")})`
                  : ""}
                .
              </p>
            ) : null}

            <ul className="mt-4 space-y-2">
              {(data?.recipients ?? []).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    {r.email}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${r.email}`}
                    onClick={() => removeMutation.mutate(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>

            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                const value = email.trim();
                if (!value) return;
                addMutation.mutate(value);
              }}
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alerts@example.com"
                aria-label="Recipient email"
                className="sm:max-w-sm"
              />
              <Button type="submit" variant="secondary" disabled={addMutation.isPending}>
                Add recipient
              </Button>
            </form>
          </div>

          <div className="mt-8 border-t border-border/60 pt-6">
            <h3 className="text-sm font-medium">Preview a notification</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Simulate several keywords at once to see which ones the settings above would
              alert on. Leave “new position” empty to simulate leaving the top 100.
            </p>

            <ul className="mt-4 space-y-3">
              {evaluated.map(({ row, valid, wouldAlert }) => (
                <li key={row.id} className="flex flex-wrap items-end gap-3">
                  <div className="space-y-2">
                    <Label htmlFor={`preview-kw-${row.id}`}>Keyword</Label>
                    <Input
                      id={`preview-kw-${row.id}`}
                      value={row.keyword}
                      onChange={(e) => updateRow(row.id, { keyword: e.target.value })}
                      placeholder="example keyword"
                      className="w-56"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`preview-from-${row.id}`}>Previous position</Label>
                    <Input
                      id={`preview-from-${row.id}`}
                      type="number"
                      min={1}
                      value={row.from}
                      onChange={(e) => updateRow(row.id, { from: e.target.value })}
                      className="w-24"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`preview-to-${row.id}`}>New position</Label>
                    <Input
                      id={`preview-to-${row.id}`}
                      type="number"
                      min={1}
                      value={row.to}
                      onChange={(e) => updateRow(row.id, { to: e.target.value })}
                      placeholder="none"
                      className="w-24"
                    />
                  </div>
                  <span className="pb-2 text-xs text-muted-foreground">
                    {!valid ? "Needs a position" : wouldAlert ? "Would alert" : "No alert"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove simulated keyword ${row.keyword || row.id}`}
                    disabled={rows.length === 1}
                    onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>

            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() =>
                setRows((prev) => [...prev, { id: nextId(), keyword: "", from: "", to: "" }])
              }
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Add keyword
            </Button>

            <div
              aria-live="polite"
              className="mt-4 rounded-md border border-border/60 px-3 py-3 text-sm"
            >
              {firing.length === 0 ? (
                <span className="flex items-start gap-2">
                  <BellOff
                    className="mt-0.5 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>
                    <strong>No alert would fire.</strong>{" "}
                    {evaluated.some((e) => e.valid)
                      ? "None of the simulated changes reach the current settings."
                      : "Enter a whole previous position (1 or more) to preview."}
                  </span>
                </span>
              ) : (
                <div className="flex items-start gap-2">
                  <BellRing className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
                  <div>
                    <strong>
                      {firing.length} alert{firing.length === 1 ? "" : "s"} would fire
                    </strong>
                    <ul className="mt-2 space-y-1">
                      {firing.map(({ row, from, to }) => (
                        <li key={row.id}>
                          “{row.keyword.trim() || "example keyword"}”{" "}
                          {to === null
                            ? `left the top 100 (was #${from}).`
                            : `fell from #${from} to #${to} (−${to - from!}), at or past the ${previewThreshold}-position threshold.`}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>


            <p className="mt-2 text-xs text-muted-foreground">
              Preview only — no email is sent. It reflects the values in the form above, even
              before you save them.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
