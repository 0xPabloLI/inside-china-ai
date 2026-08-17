import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Trash2 } from "lucide-react";
import {
  addAlertRecipient,
  deleteAlertRecipient,
  getAlertConfig,
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
        </>
      )}
    </section>
  );
}
