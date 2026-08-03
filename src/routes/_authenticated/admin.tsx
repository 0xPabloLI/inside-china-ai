import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listAllPostsAdmin,
  getPostAdmin,
  savePost,
  deletePost,
  listAttachmentsAdmin,
  deleteAttachment,
  renameAttachment,
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
import {
  Upload,
  Copy,
  FileText,
  ExternalLink,
  Trash2,
  Link as LinkIcon,
  Pencil,
  Check,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Editorial Dashboard — China AI News" },
      {
        name: "description",
        content:
          "Private editorial dashboard for China AI News: draft and publish articles, manage attachments, and export newsletter subscribers.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Editorial Dashboard — China AI News" },
      {
        property: "og:description",
        content: "Private editorial dashboard for China AI News staff.",
      },
      { property: "og:url", content: "https://chinaai.news/admin" },
    ],
    links: [{ rel: "canonical", href: "https://chinaai.news/admin" }],
  }),
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
            <TabsTrigger value="newsletter">Newsletter</TabsTrigger>
            <TabsTrigger value="subscribers">
              Subscribers{subsQuery.data ? ` (${subsQuery.data.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="newsletter" className="mt-6">
            <NewsletterAdmin />
          </TabsContent>


          <TabsContent value="posts" className="mt-6">
            {editingId !== null ? (
              editingId && editQuery.isPending ? (
                <div className="p-10 text-muted-foreground">Loading…</div>
              ) : (
                <PostEditor
                  key={editingId || "new"}
                  initial={editingId ? (editQuery.data ?? null) : null}
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
              )
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

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type AttachmentItem = {
  id: string;
  post_id: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  url: string;
};

function AttachmentUploader({
  postId,
  onInsertLink,
}: {
  postId: string;
  onInsertLink: (markdown: string) => void;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const listAtt = useServerFn(listAttachmentsAdmin);
  const delAtt = useServerFn(deleteAttachment);
  const renameAtt = useServerFn(renameAttachment);

  const { data: attachments, refetch } = useQuery({
    queryKey: ["admin-attachments", postId],
    queryFn: () => listAtt({ data: { postId } }),
  });

  async function handleUpload(file: File) {
    const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
    if (file.size > MAX_SIZE) {
      toast.error("File too large (max 50 MB)");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const uuid = crypto.randomUUID();
      const storagePath = `${postId}/${uuid}${ext ? `.${ext}` : ""}`;

      const { error: uploadErr } = await supabase.storage
        .from("post-attachments")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from("post_attachments").insert({
        post_id: postId,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type || null,
      });

      if (insertErr) {
        // Clean up orphaned file
        await supabase.storage.from("post-attachments").remove([storagePath]);
        throw insertErr;
      }

      toast.success("File uploaded");
      refetch();
      qc.invalidateQueries({ queryKey: ["post"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(att: AttachmentItem) {
    if (!confirm(`Delete "${att.file_name}"?`)) return;
    try {
      await delAtt({ data: { id: att.id } });
      toast.success("Deleted");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  }

  function startRename(att: AttachmentItem) {
    setEditingId(att.id);
    setEditingName(att.file_name);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName("");
  }

  async function confirmRename(id: string) {
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error("File name cannot be empty");
      return;
    }
    setRenaming(true);
    try {
      await renameAtt({ data: { id, fileName: trimmed } });
      toast.success("Renamed");
      cancelRename();
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setRenaming(false);
    }
  }

  const list = attachments as AttachmentItem[] | undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Attachments</Label>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Upload file"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload PDFs, documents, or images. After uploading, use "Copy URL" to paste the link into
        your content, or "Insert link" to append it directly.
      </p>
      {list && list.length > 0 ? (
        <ul className="space-y-2">
          {list.map((att) => {
            const isEditing = editingId === att.id;
            return (
              <li
                key={att.id}
                className="flex items-center gap-3 rounded-md border border-border/60 bg-background p-3"
              >
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <Input
                      className="h-7 text-sm"
                      value={editingName}
                      autoFocus
                      disabled={renaming}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirmRename(att.id);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      maxLength={255}
                    />
                  ) : (
                    <div className="truncate text-sm font-medium">{att.file_name}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {formatFileSize(att.file_size)}
                    {att.mime_type ? ` · ${att.mime_type}` : ""}
                  </div>
                </div>
                {isEditing ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Confirm rename"
                      disabled={renaming}
                      onClick={() => confirmRename(att.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Cancel"
                      disabled={renaming}
                      onClick={cancelRename}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Open in new tab"
                      onClick={() => window.open(att.url, "_blank")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Copy URL"
                      onClick={() => copyUrl(att.url)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Insert link into content"
                      onClick={() => onInsertLink(`[${att.file_name}](${att.url})`)}
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Rename"
                      onClick={() => startRename(att)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Delete"
                      onClick={() => handleDelete(att)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !uploading && (
          <p className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            No attachments yet. Click "Upload file" to add one.
          </p>
        )
      )}
    </div>
  );
}

function PostEditor({
  initial,
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

  const insertMarkdown = (md: string) => {
    setContent((prev) => {
      const sep = prev && !prev.endsWith("\n") ? "\n" : "";
      return prev + sep + md;
    });
    toast.success("Link inserted into content");
  };

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
      {initial?.id ? (
        <div className="rounded-md border border-border/60 p-4">
          <AttachmentUploader postId={initial.id} onInsertLink={insertMarkdown} />
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          Save the post first to upload attachments.
        </div>
      )}
      <div className="flex items-center justify-between rounded-md border border-border/60 bg-background p-3">
        <div>
          <div className="text-sm font-medium">Publish</div>
          <div className="text-xs text-muted-foreground">
            Once on, this post is visible to everyone
          </div>
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
