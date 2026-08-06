import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listAttachmentsAdmin,
  deleteAttachment,
  renameAttachment,
  uploadAttachment,
} from "@/lib/posts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
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

/* ------------------------------------------------------------------ */
/* Types & helpers                                                     */
/* ------------------------------------------------------------------ */

export type AttachmentItem = {
  id: string;
  post_id: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  url: string;
};

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Convert a File to a base64 string (without the data: prefix).
 * Uses FileReader.readAsDataURL for browser compatibility.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // readAsDataURL returns "data:mime;base64,XXXX" — strip the prefix
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function AttachmentUploader({
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
  const [deleteTarget, setDeleteTarget] = useState<AttachmentItem | null>(null);

  const listAtt = useServerFn(listAttachmentsAdmin);
  const delAtt = useServerFn(deleteAttachment);
  const renameAtt = useServerFn(renameAttachment);
  const uploadAtt = useServerFn(uploadAttachment);

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
      const fileBase64 = await fileToBase64(file);

      await uploadAtt({
        data: {
          postId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || null,
          fileBase64,
        },
      });

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
                      onClick={() => setDeleteTarget(att)}
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.file_name ?? ""}"?`}
        description="This will permanently remove the file from storage. Links in existing content will break."
        confirmText="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDelete(deleteTarget);
        }}
      />
    </div>
  );
}
