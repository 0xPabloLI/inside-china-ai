import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/require-admin";

/** A position drop of this many places (or losing the ranking) raises an alert. */
export const DROP_THRESHOLD = 3;

export type KeywordRow = {
  id: string;
  keyword: string;
  database: string;
  active: boolean;
  position: number | null;
  previousPosition: number | null;
  delta: number | null;
  searchVolume: number | null;
  difficulty: number | null;
  rankingUrl: string | null;
  capturedOn: string | null;
  history: Array<{ capturedOn: string; position: number | null }>;
  alert: boolean;
};

type SnapshotRow = {
  keyword_id: string;
  captured_on: string;
  position: number | null;
  search_volume: number | null;
  difficulty: number | null;
  ranking_url: string | null;
};

/** True when a keyword slipped past the alert threshold or lost its ranking. */
export function isDrop(
  current: number | null,
  previous: number | null,
  threshold: number = DROP_THRESHOLD,
  alertOnLostRanking = true,
): boolean {
  if (previous === null) return false;
  if (current === null) return alertOnLostRanking;
  return current - previous >= threshold;
}

export const listTrackedKeywords = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<KeywordRow[]> => {
    const { data: settings } = await context.supabase
      .from("ranking_alert_settings")
      .select("drop_threshold, alert_on_lost_ranking")
      .maybeSingle();
    const threshold = settings?.drop_threshold ?? DROP_THRESHOLD;
    const alertOnLostRanking = settings?.alert_on_lost_ranking ?? true;

    const { data: keywords, error } = await context.supabase
      .from("tracked_keywords")
      .select("id, keyword, database, active")
      .order("keyword", { ascending: true });
    if (error) throw new Error(error.message);
    if (!keywords || keywords.length === 0) return [];

    const { data: snapshots, error: snapErr } = await context.supabase
      .from("keyword_snapshots")
      .select("keyword_id, captured_on, position, search_volume, difficulty, ranking_url")
      .in(
        "keyword_id",
        keywords.map((k) => k.id),
      )
      .order("captured_on", { ascending: false })
      .limit(2000);
    if (snapErr) throw new Error(snapErr.message);

    const byKeyword = new Map<string, SnapshotRow[]>();
    for (const snap of (snapshots ?? []) as SnapshotRow[]) {
      const list = byKeyword.get(snap.keyword_id) ?? [];
      list.push(snap);
      byKeyword.set(snap.keyword_id, list);
    }

    return keywords.map((k) => {
      const list = byKeyword.get(k.id) ?? [];
      const latest = list[0];
      const previous = list[1];
      const position = latest?.position ?? null;
      const previousPosition = previous?.position ?? null;
      return {
        id: k.id,
        keyword: k.keyword,
        database: k.database,
        active: k.active,
        position,
        previousPosition,
        delta:
          position !== null && previousPosition !== null ? previousPosition - position : null,
        searchVolume: latest?.search_volume ?? null,
        difficulty: latest?.difficulty ?? null,
        rankingUrl: latest?.ranking_url ?? null,
        capturedOn: latest?.captured_on ?? null,
        history: list
          .slice(0, 30)
          .reverse()
          .map((s) => ({ capturedOn: s.captured_on, position: s.position })),
        alert: isDrop(position, previousPosition, threshold, alertOnLostRanking),
      };
    });
  });

export const addTrackedKeyword = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        keyword: z.string().trim().min(2).max(120).toLowerCase(),
        database: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z]{2}$/)
          .default("us"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tracked_keywords")
      .upsert(
        { keyword: data.keyword, database: data.database, active: true },
        { onConflict: "keyword,database" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTrackedKeyword = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tracked_keywords")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Pulls live Semrush metrics for every active keyword, stores one snapshot per
 * UTC day, and emails the admin who triggered it when positions dropped.
 * The same logic runs unattended via /api/public/hooks/refresh-keyword-snapshots.
 */
export const refreshKeywordSnapshots = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { refreshSnapshots, sendRankingAlert, listAlertRecipients } = await import(
      "@/lib/keyword-tracking.server"
    );
    const { updated, alerts } = await refreshSnapshots();

    if (alerts.length > 0) {
      const capturedOn = new Date().toISOString().slice(0, 10);
      for (const recipient of await listAlertRecipients()) {
        try {
          await sendRankingAlert(recipient, alerts, capturedOn);
        } catch (err) {
          console.error("ranking alert email failed", err);
        }
      }
    }

    return { updated, alerts: alerts.map((a) => a.keyword) };
  });

export type AlertConfig = {
  dropThreshold: number;
  alertOnLostRanking: boolean;
  recipients: Array<{ id: string; email: string }>;
  fallbackRecipients: string[];
};

/** Threshold settings plus the alert recipient list. */
export const getAlertConfig = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<AlertConfig> => {
    const [settings, recipients] = await Promise.all([
      context.supabase
        .from("ranking_alert_settings")
        .select("drop_threshold, alert_on_lost_ranking")
        .maybeSingle(),
      context.supabase
        .from("ranking_alert_recipients")
        .select("id, email")
        .order("email", { ascending: true }),
    ]);

    let fallbackRecipients: string[] = [];
    if ((recipients.data ?? []).length === 0) {
      const { listAdminEmails } = await import("@/lib/keyword-tracking.server");
      fallbackRecipients = await listAdminEmails();
    }

    return {
      dropThreshold: settings.data?.drop_threshold ?? DROP_THRESHOLD,
      alertOnLostRanking: settings.data?.alert_on_lost_ranking ?? true,
      recipients: recipients.data ?? [],
      fallbackRecipients,
    };
  });

export const updateAlertSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        dropThreshold: z.coerce.number().int().min(1).max(50),
        alertOnLostRanking: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ranking_alert_settings").upsert(
      {
        id: true,
        drop_threshold: data.dropThreshold,
        alert_on_lost_ranking: data.alertOnLostRanking,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addAlertRecipient = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(320) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ranking_alert_recipients")
      .upsert({ email: data.email }, { onConflict: "email" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAlertRecipient = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ranking_alert_recipients")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/**
 * Sends the real ranking-alert email using simulated keyword changes so an
 * admin can check the wording before a genuine alert fires. The recipient is
 * restricted to the configured alert list or an admin account email.
 */
export const sendTestAlertNotification = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        recipient: z.string().trim().toLowerCase().email().max(320).optional(),
        alerts: z
          .array(
            z.object({
              keyword: z.string().trim().min(1).max(120),
              from: z.number().int().min(1).nullable(),
              to: z.number().int().min(1).nullable(),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { sendRankingAlert, listAlertRecipients, listAdminEmails } = await import(
      "@/lib/keyword-tracking.server"
    );

    const claimEmail =
      typeof context.claims?.["email"] === "string"
        ? (context.claims["email"] as string).toLowerCase()
        : null;
    const allowed = new Set(
      [...(await listAlertRecipients()), ...(await listAdminEmails())].map((e) =>
        e.toLowerCase(),
      ),
    );
    if (claimEmail) allowed.add(claimEmail);

    const recipient = data.recipient ?? claimEmail;
    if (!recipient) throw new Error("No recipient available for the test email");
    if (!allowed.has(recipient)) {
      throw new Error("Recipient must be an alert recipient or an admin account email");
    }

    const capturedOn = new Date().toISOString().slice(0, 10);
    await sendRankingAlert(
      recipient,
      data.alerts,
      capturedOn,
    );
    return { sent: true, recipient };
  });
