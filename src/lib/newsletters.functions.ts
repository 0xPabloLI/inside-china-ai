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

export const saveNewsletter = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => newsletterInput.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      subject: data.subject,
      title: data.title || null,
      excerpt: data.excerpt || null,
      content: data.content || "",
      post_url: data.postUrl ? data.postUrl : null,
      scheduled_at: data.scheduledAt || null,
      status: (data.scheduledAt ? "scheduled" : "draft") as "scheduled" | "draft",
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("newsletters")
        .update(row)
        .eq("id", data.id)
        .in("status", ["draft", "scheduled", "failed"]);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("newsletters")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

export const deleteNewsletter = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("newsletters").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewNewsletter = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
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
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
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
