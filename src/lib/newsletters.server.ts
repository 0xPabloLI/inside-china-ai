import { sendTemplateEmail } from "./email-templates/send-email";

const SITE_NAME = "China AI News";
const SITE_URL = "https://chinaai.news";

export type DispatchResult = {
  sent: number;
  suppressed: number;
  failed: number;
};

type NewsletterRow = {
  id: string;
  subject: string;
  title: string | null;
  excerpt: string | null;
  content: string;
  post_url: string | null;
};

/**
 * Sends one newsletter to every active subscriber, logging each attempt to
 * newsletter_sends and updating the newsletter's status/counters.
 * Uses the service-role client — callers must authorize first.
 */
export async function dispatchNewsletter(newsletterId: string): Promise<DispatchResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: newsletter, error: nlErr } = await supabaseAdmin
    .from("newsletters")
    .select("id, subject, title, excerpt, content, post_url, status")
    .eq("id", newsletterId)
    .maybeSingle();
  if (nlErr) throw new Error(nlErr.message);
  if (!newsletter) throw new Error("Newsletter not found");
  if (newsletter.status === "sent" || newsletter.status === "sending") {
    throw new Error("This newsletter has already been sent");
  }

  await supabaseAdmin.from("newsletters").update({ status: "sending" }).eq("id", newsletterId);

  const { data: subs, error: subErr } = await supabaseAdmin
    .from("subscribers")
    .select("id, email, unsubscribed_at")
    .is("unsubscribed_at", null);
  if (subErr) throw new Error(subErr.message);

  const nl = newsletter as NewsletterRow;
  const publishedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const result: DispatchResult = { sent: 0, suppressed: 0, failed: 0 };
  const logs: Array<{
    newsletter_id: string;
    recipient_email: string;
    status: string;
    error_message: string | null;
  }> = [];

  for (const sub of subs ?? []) {
    try {
      const outcome = await sendTemplateEmail("newsletter", sub.email, {
        idempotencyKey: `newsletter-${nl.id}-${sub.id}`,
        templateData: {
          siteName: SITE_NAME,
          siteUrl: SITE_URL,
          subject: nl.subject,
          title: nl.title ?? nl.subject,
          excerpt: nl.excerpt ?? undefined,
          content: nl.content,
          postUrl: nl.post_url ?? undefined,
          publishedAt,
        },
      });
      if (outcome.sent) {
        result.sent += 1;
        logs.push({
          newsletter_id: nl.id,
          recipient_email: sub.email,
          status: "sent",
          error_message: null,
        });
      } else {
        result.suppressed += 1;
        logs.push({
          newsletter_id: nl.id,
          recipient_email: sub.email,
          status: "suppressed",
          error_message: outcome.reason,
        });
      }
    } catch (e) {
      result.failed += 1;
      logs.push({
        newsletter_id: nl.id,
        recipient_email: sub.email,
        status: "failed",
        error_message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (logs.length) {
    await supabaseAdmin.from("newsletter_sends").insert(logs);
  }

  await supabaseAdmin
    .from("newsletters")
    .update({
      status: result.failed > 0 && result.sent === 0 ? "failed" : "sent",
      sent_at: new Date().toISOString(),
      sent_count: result.sent,
      suppressed_count: result.suppressed,
      failed_count: result.failed,
      scheduled_at: null,
    })
    .eq("id", newsletterId);

  const nowIso = new Date().toISOString();
  for (const sub of subs ?? []) {
    await supabaseAdmin.from("subscribers").update({ last_sent_at: nowIso }).eq("id", sub.id);
  }

  return result;
}

/** Runs every scheduled newsletter whose time has arrived. */
export async function dispatchDueNewsletters(): Promise<{ dispatched: string[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("newsletters")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());
  if (error) throw new Error(error.message);

  const dispatched: string[] = [];
  for (const row of data ?? []) {
    try {
      await dispatchNewsletter(row.id);
      dispatched.push(row.id);
    } catch (e) {
      console.error("Failed to dispatch newsletter", row.id, e);
    }
  }
  return { dispatched };
}
