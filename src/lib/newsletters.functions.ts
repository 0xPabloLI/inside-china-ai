import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/require-admin";

const newsletterInput = z.object({
  id: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional().nullable(),
  excerpt: z.string().trim().max(1000).optional().nullable(),
  content: z.string().max(50000).optional().nullable(),
  postUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export const listNewsletters = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("newsletters")
      .select(
        "id, subject, title, excerpt, content, post_url, status, scheduled_at, sent_at, sent_count, suppressed_count, failed_count, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export type NewsletterSaveInput = z.infer<typeof newsletterInput>;

type NewsletterRowBase = {
  subject: string;
  title: string | null;
  excerpt: string | null;
  content: string;
  post_url: string | null;
  scheduled_at: string | null;
  status: "scheduled" | "draft";
};

/**
 * Row written by `saveNewsletter`.
 *
 * `created_by` is insert-only: carrying it on update overwrote the original
 * author with whoever edited last (#319 OCR lib scan).
 */
export function buildNewsletterRow(
  input: NewsletterSaveInput,
  mode: "insert",
  userId: string,
): NewsletterRowBase & { created_by: string };
export function buildNewsletterRow(input: NewsletterSaveInput, mode: "update"): NewsletterRowBase;
export function buildNewsletterRow(
  input: NewsletterSaveInput,
  mode: "insert" | "update",
  userId?: string,
): NewsletterRowBase | (NewsletterRowBase & { created_by: string }) {
  const row: NewsletterRowBase = {
    subject: input.subject,
    title: input.title || null,
    excerpt: input.excerpt || null,
    content: input.content || "",
    post_url: input.postUrl ? input.postUrl : null,
    scheduled_at: input.scheduledAt || null,
    status: (input.scheduledAt ? "scheduled" : "draft") as "scheduled" | "draft",
  };
  if (mode === "update") return row;
  if (!userId) throw new Error("buildNewsletterRow: userId is required for an insert");
  return { ...row, created_by: userId };
}

/**
 * The update is filtered to editable statuses, so a newsletter that is already
 * sending/sent (or was deleted) matches no row. Reporting success then would
 * silently discard the admin's edit (#319 OCR lib scan).
 */
export function assertNewsletterUpdated(rows: { id: string }[] | null): void {
  if (!rows || rows.length === 0) {
    throw new Error(
      "This newsletter can no longer be edited — it has already been sent or was deleted.",
    );
  }
}

export const saveNewsletter = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => newsletterInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("newsletters")
        .update(buildNewsletterRow(data, "update"))
        .eq("id", data.id)
        .in("status", ["draft", "scheduled", "failed"])
        .select("id");
      if (error) throw new Error(error.message);
      assertNewsletterUpdated(updated);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("newsletters")
      .insert(buildNewsletterRow(data, "insert", context.userId))
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

export const deleteNewsletter = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("newsletters").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewNewsletter = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) =>
    z
      .object({
        subject: z.string().trim().min(1).max(200),
        title: z.string().max(200).optional().nullable(),
        excerpt: z.string().max(1000).optional().nullable(),
        content: z.string().max(50000).optional().nullable(),
        postUrl: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { renderNewsletterPreview } = await import("./newsletters.server");
    return { html: await renderNewsletterPreview(data) };
  });

export const sendNewsletterNow = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { dispatchNewsletter } = await import("./newsletters.server");
    return dispatchNewsletter(data.id);
  });

export const listNewsletterSends = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("newsletter_sends")
      .select("id, newsletter_id, recipient_email, status, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
