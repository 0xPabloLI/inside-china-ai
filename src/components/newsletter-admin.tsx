import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listNewsletters,
  saveNewsletter,
  deleteNewsletter,
  previewNewsletter,
  sendNewsletterNow,
  listNewsletterSends,
} from "@/lib/newsletters.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Newsletter = {
  id: string;
  subject: string;
  title: string | null;
  excerpt: string | null;
  content: string;
  post_url: string | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  suppressed_count: number;
  failed_count: number;
  created_at: string;
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewsletterAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(listNewsletters);
  const save = useServerFn(saveNewsletter);
  const remove = useServerFn(deleteNewsletter);
  const preview = useServerFn(previewNewsletter);
  const sendNow = useServerFn(sendNewsletterNow);
  const listSends = useServerFn(listNewsletterSends);

  const [editing, setEditing] = useState<Newsletter | null>(null);
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendTarget, setSendTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; subject: string } | null>(null);

  const newslettersQuery = useQuery({
    queryKey: ["admin-newsletters"],
    queryFn: () => list() as Promise<Newsletter[]>,
  });
  const sendsQuery = useQuery({
    queryKey: ["admin-newsletter-sends"],
    queryFn: () => listSends(),
  });

  const sendsByNewsletter = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of (sendsQuery.data ?? []) as Array<{ newsletter_id: string }>) {
      map.set(s.newsletter_id, (map.get(s.newsletter_id) ?? 0) + 1);
    }
    return map;
  }, [sendsQuery.data]);

  function loadForm(n: Newsletter | null) {
    setEditing(n);
    setSubject(n?.subject ?? "");
    setTitle(n?.title ?? "");
    setExcerpt(n?.excerpt ?? "");
    setContent(n?.content ?? "");
    setPostUrl(n?.post_url ?? "");
    setScheduledAt(toLocalInput(n?.scheduled_at ?? null));
    setPreviewHtml(null);
  }

  async function handleSave() {
    if (!subject.trim()) return toast.error("Subject is required");
    setBusy(true);
    try {
      const { id } = await save({
        data: {
          id: editing?.id,
          subject: subject.trim(),
          title: title.trim() || null,
          excerpt: excerpt.trim() || null,
          content,
          postUrl: postUrl.trim() || null,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      });
      toast.success(scheduledAt ? "Scheduled" : "Draft saved");
      qc.invalidateQueries({ queryKey: ["admin-newsletters"] });
      const fresh = (await list()) as Newsletter[];
      loadForm(fresh.find((n) => n.id === id) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    if (!subject.trim()) return toast.error("Subject is required");
    setBusy(true);
    try {
      const { html } = await preview({
        data: {
          subject: subject.trim(),
          title: title.trim() || null,
          excerpt: excerpt.trim() || null,
          content,
          postUrl: postUrl.trim() || null,
        },
      });
      setPreviewHtml(html);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendNow(id: string) {
    setBusy(true);
    try {
      const res = await sendNow({ data: { id } });
      toast.success(`Sent ${res.sent} · blocked ${res.suppressed} · failed ${res.failed}`);
      qc.invalidateQueries({ queryKey: ["admin-newsletters"] });
      qc.invalidateQueries({ queryKey: ["admin-newsletter-sends"] });
      loadForm(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-border/60 bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl">
            {editing ? "Edit newsletter" : "Compose newsletter"}
          </h2>
          {editing ? (
            <Button variant="ghost" size="sm" onClick={() => loadForm(null)}>
              New
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4">
          <div>
            <Label htmlFor="nl-subject">Subject line</Label>
            <Input
              id="nl-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="This week in China's AI industry"
            />
          </div>
          <div>
            <Label htmlFor="nl-title">Headline (defaults to subject)</Label>
            <Input id="nl-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="nl-excerpt">Intro / summary</Label>
            <Textarea
              id="nl-excerpt"
              rows={3}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="nl-content">Body</Label>
            <Textarea
              id="nl-content"
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="nl-url">Link to article (optional)</Label>
              <Input
                id="nl-url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://chinaai.news/posts/…"
              />
            </div>
            <div>
              <Label htmlFor="nl-schedule">Schedule send (optional)</Label>
              <Input
                id="nl-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={busy}>
              {scheduledAt ? "Save & schedule" : "Save draft"}
            </Button>
            <Button variant="outline" onClick={handlePreview} disabled={busy}>
              Preview
            </Button>
            {editing && editing.status !== "sent" ? (
              <Button variant="secondary" onClick={() => setSendTarget(editing.id)} disabled={busy}>
                Send now
              </Button>
            ) : null}
          </div>
        </div>

        {previewHtml ? (
          <div className="mt-6">
            <Label>Email preview</Label>
            <iframe
              title="Newsletter preview"
              srcDoc={previewHtml}
              className="mt-2 h-[520px] w-full rounded-md border border-border/60 bg-white"
            />
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="mb-3 font-serif text-xl">Newsletters</h2>
        <div className="rounded-lg border border-border/60 bg-card">
          {newslettersQuery.data?.length ? (
            <ul className="divide-y divide-border/60">
              {newslettersQuery.data.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{n.subject}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {n.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {n.sent_at
                        ? `Sent ${new Date(n.sent_at).toLocaleString("en-US")} · ${n.sent_count} delivered · ${n.suppressed_count} blocked · ${n.failed_count} failed`
                        : n.scheduled_at
                          ? `Scheduled for ${new Date(n.scheduled_at).toLocaleString("en-US")}`
                          : `Draft · created ${new Date(n.created_at).toLocaleDateString("en-US")}`}
                      {sendsByNewsletter.get(n.id)
                        ? ` · ${sendsByNewsletter.get(n.id)} history rows`
                        : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => loadForm(n)}>
                      {n.status === "sent" ? "View" : "Edit"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget({ id: n.id, subject: n.subject })}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-10 text-center text-muted-foreground">No newsletters yet.</div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-serif text-xl">Send history</h2>
        <div className="rounded-lg border border-border/60 bg-card">
          {(sendsQuery.data as any[] | undefined)?.length ? (
            <ul className="divide-y divide-border/60">
              {(sendsQuery.data as any[]).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 p-3 text-sm">
                  <span className="truncate">{s.recipient_email}</span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    {s.error_message ? <span className="truncate">{s.error_message}</span> : null}
                    <span
                      className={
                        s.status === "sent"
                          ? "text-primary"
                          : s.status === "failed"
                            ? "text-destructive"
                            : ""
                      }
                    >
                      {s.status}
                    </span>
                    <span>{new Date(s.created_at).toLocaleString("en-US")}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-10 text-center text-muted-foreground">No sends logged yet.</div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={sendTarget !== null}
        onOpenChange={(open) => !open && setSendTarget(null)}
        title="Send newsletter now?"
        description="This will immediately send the newsletter to all active subscribers. This action cannot be undone."
        confirmText="Send now"
        destructive={false}
        onConfirm={async () => {
          if (!sendTarget) return;
          await handleSendNow(sendTarget);
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.subject ?? ""}"?`}
        description="This will permanently remove the newsletter and its send history."
        confirmText="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await remove({ data: { id: deleteTarget.id } });
            qc.invalidateQueries({ queryKey: ["admin-newsletters"] });
            toast.success("Deleted");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Delete failed");
          }
        }}
      />
    </div>
  );
}
