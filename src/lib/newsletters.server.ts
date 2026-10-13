import { sendTemplateEmail } from "./email-templates/send-email";

const SITE_NAME = "China AI News";
const SITE_URL = "https://chinaai.news";

/** Max ids per `.in()` filter — keeps the PostgREST URL well inside gateway limits. */
const LAST_SENT_AT_BATCH_SIZE = 200;

/**
 * Stamp `last_sent_at` for every recipient in bounded batches.
 *
 * #319 OCR lib scan: this used to be one UPDATE per subscriber (an N+1 of
 * round trips after the send loop). The `stamp` callback keeps the batch call
 * testable while the semantics stay identical — same rows, same single
 * timestamp, fewer requests.
 */
export async function stampLastSentAt(
  recipientIds: string[],
  stamp: (batch: string[]) => PromiseLike<unknown>,
  batchSize: number = LAST_SENT_AT_BATCH_SIZE,
): Promise<void> {
  if (batchSize <= 0) throw new Error("batchSize must be positive");
  for (let i = 0; i < recipientIds.length; i += batchSize) {
    await stamp(recipientIds.slice(i, i + batchSize));
  }
}

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
  await stampLastSentAt(
    (subs ?? []).map((sub) => sub.id),
    (batch) => supabaseAdmin.from("subscribers").update({ last_sent_at: nowIso }).in("id", batch),
  );

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

/** Renders the newsletter email HTML for in-admin preview. */
export async function renderNewsletterPreview(input: {
  subject: string;
  title?: string | null;
  excerpt?: string | null;
  content?: string | null;
  postUrl?: string | null;
}): Promise<string> {
  const React = await import("react");
  const { render } = await import("@react-email/render");
  const { default: NewsletterEmail } = await import("./email-templates/newsletter");

  return render(
    React.createElement(NewsletterEmail, {
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      subject: input.subject,
      title: input.title ?? input.subject,
      excerpt: input.excerpt ?? undefined,
      content: input.content ?? undefined,
      postUrl: input.postUrl ?? undefined,
      publishedAt: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    }),
  );
}
