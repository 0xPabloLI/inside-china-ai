import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listAllPostsAdmin,
  getPostAdmin,
  savePost,
  deletePost,
} from "@/lib/posts.functions";
import { listSubscribers, deleteSubscriber } from "@/lib/subscribers.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MarkdownEditor } from "@/components/markdown-editor";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Inside China AI" }] }),
  component: AdminPage,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const list = useServerFn(listAllPostsAdmin);
  const get = useServerFn(getPostAdmin);
  const save = useServerFn(savePost);
  const del = useServerFn(deletePost);
  const listSubs = useServerFn(listSubscribers);
  const delSub = useServerFn(deleteSubscriber);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setIsAdmin(false);
      const { data } = await supabase.rpc("has_role", {
        _user_id: u.user.id,
        _role: "admin",
      });
      setIsAdmin(!!data);
    })();
  }, []);

  const postsQuery = useQuery({
    queryKey: ["admin-posts"],
    queryFn: () => list(),
    enabled: isAdmin === true,
  });
  const subsQuery = useQuery({
    queryKey: ["admin-subscribers"],
    queryFn: () => listSubs(),
    enabled: isAdmin === true,
  });
  const editQuery = useQuery({
    queryKey: ["admin-post", editingId],
    queryFn: () => (editingId ? get({ data: { id: editingId } }) : null),
    enabled: !!editingId,
  });

  if (isAdmin === null) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }
  if (isAdmin === false) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="text-muted-foreground">Your account does not have admin access.</p>
        <Button
          className="mt-4"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-serif text-3xl">Admin</h1>
          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/" });
            }}
          >
            Sign out
          </Button>
        </div>

        <Tabs defaultValue="posts">
          <TabsList>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="subscribers">
              Subscribers{subsQuery.data ? ` (${subsQuery.data.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-6">
            {editingId !== null ? (
              <PostEditor
                key={editingId || "new"}
                initial={editQuery.data ?? null}
                loading={!!editingId && editQuery.isLoading}
                onCancel={() => setEditingId(null)}
                onSave={async (values) => {
                  try {
                    await save({ data: values });
                    toast.success("Saved");
                    qc.invalidateQueries({ queryKey: ["admin-posts"] });
                    qc.invalidateQueries({ queryKey: ["published-posts"] });
                    setEditingId(null);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Save failed");
                  }
                }}
              />
            ) : (
              <>
                <div className="mb-4 flex justify-end">
                  <Button onClick={() => setEditingId("")}>New post</Button>
                </div>
                <div className="rounded-lg border border-border/70 bg-card">
                  {postsQuery.data?.length ? (
                    <ul className="divide-y divide-border/60">
                      {postsQuery.data.map((p) => (
                        <li key={p.id} className="flex items-center justify-between p-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{p.title}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs ${p.published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                              >
                                {p.published ? "Published" : "Draft"}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">/{p.slug}</div>
                          </div>
                          <div className="flex gap-2">
                            {p.published ? (
                              <Link
                                to="/posts/$slug"
                                params={{ slug: p.slug }}
                                className="text-sm text-muted-foreground hover:text-foreground"
                              >
                                Preview
                              </Link>
                            ) : null}
                            <Button size="sm" variant="outline" onClick={() => setEditingId(p.id)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                if (!confirm(`Delete "${p.title}"?`)) return;
                                try {
                                  await del({ data: { id: p.id } });
                                  qc.invalidateQueries({ queryKey: ["admin-posts"] });
                                  qc.invalidateQueries({ queryKey: ["published-posts"] });
                                  toast.success("Deleted");
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Delete failed");
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-10 text-center text-muted-foreground">
                      No posts yet. Click "New post" to start.
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="subscribers" className="mt-6">
            <div className="rounded-lg border border-border/70 bg-card">
              {subsQuery.data?.length ? (
                <ul className="divide-y divide-border/60">
                  {subsQuery.data.map((s) => (
                    <li key={s.id} className="flex items-center justify-between p-4">
                      <div>
                        <div className="font-medium">{s.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.created_at).toLocaleString("en-US")}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm(`Remove subscriber ${s.email}?`)) return;
                          try {
                            await delSub({ data: { id: s.id } });
                            qc.invalidateQueries({ queryKey: ["admin-subscribers"] });
                            toast.success("Deleted");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Delete failed");
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-10 text-center text-muted-foreground">No subscribers yet.</div>
              )}
            </div>
            {subsQuery.data && subsQuery.data.length > 0 ? (
              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    const csv =
                      "email,created_at\n" +
                      subsQuery.data!.map((s) => `${s.email},${s.created_at}`).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "subscribers.csv";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export CSV
                </Button>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

type PostForm = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  published: boolean;
};

function PostEditor({
  initial,
  loading,
  onCancel,
  onSave,
}: {
  initial: {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    content: string;
    published: boolean;
  } | null;
  loading: boolean;
  onCancel: () => void;
  onSave: (v: PostForm) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [published, setPublished] = useState(initial?.published ?? false);
  const [slugTouched, setSlugTouched] = useState(!!initial?.slug);
  const [saving, setSaving] = useState(false);

  const autoSlug = useMemo(() => slugify(title), [title]);
  const effectiveSlug = slugTouched ? slug : autoSlug;

  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave({
          id: initial?.id,
          title: title.trim(),
          slug: effectiveSlug,
          excerpt: excerpt.trim(),
          content,
          published,
        });
        setSaving(false);
      }}
      className="space-y-5 rounded-lg border border-border/70 bg-card p-6"
    >
      <div>
        <Label>Title</Label>
        <Input
          className="mt-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
        />
      </div>
      <div>
        <Label>URL slug</Label>
        <Input
          className="mt-1 font-mono text-sm"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          maxLength={200}
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">/posts/{effectiveSlug || "..."}</p>
      </div>
      <div>
        <Label>Excerpt (optional)</Label>
        <Textarea
          className="mt-1"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={2}
          maxLength={500}
        />
      </div>
      <div>
        <Label>Content</Label>
        <MarkdownEditor
          className="mt-1"
          value={content}
          onChange={setContent}
          placeholder="Write in Markdown… Use **bold**, *italic*, > quotes, - lists, `code`, ## headings, [links](https://…)."
        />
      </div>
      <div className="flex items-center justify-between rounded-md border border-border/60 bg-background p-3">
        <div>
          <div className="text-sm font-medium">Publish</div>
          <div className="text-xs text-muted-foreground">Once on, this post is visible to everyone</div>
        </div>
        <Switch checked={published} onCheckedChange={setPublished} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
