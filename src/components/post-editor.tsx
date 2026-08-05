import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MarkdownEditor } from "@/components/markdown-editor";
import { AttachmentUploader } from "@/components/attachment-uploader";

/* ------------------------------------------------------------------ */
/* Types & helpers                                                     */
/* ------------------------------------------------------------------ */

export type PostForm = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  published: boolean;
};

export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function PostEditor({
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
