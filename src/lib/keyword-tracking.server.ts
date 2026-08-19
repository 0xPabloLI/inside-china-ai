/** The domain whose rankings the keyword dashboard tracks. */
export const DOMAIN = "chinaai.news";

/** Fallbacks used when the settings row is missing. */
export const DEFAULT_DROP_THRESHOLD = 3;
export const DEFAULT_ALERT_ON_LOST_RANKING = true;

export type AlertSettings = {
  dropThreshold: number;
  alertOnLostRanking: boolean;
};

function isDrop(
  current: number | null,
  previous: number | null,
  settings: AlertSettings,
): boolean {
  if (previous === null) return false;
  if (current === null) return settings.alertOnLostRanking;
  return current - previous >= settings.dropThreshold;
}

/** Reads the admin-configured alert thresholds (service-role client). */
export async function loadAlertSettings(): Promise<AlertSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("ranking_alert_settings")
    .select("drop_threshold, alert_on_lost_ranking")
    .maybeSingle();
  return {
    dropThreshold: data?.drop_threshold ?? DEFAULT_DROP_THRESHOLD,
    alertOnLostRanking: data?.alert_on_lost_ranking ?? DEFAULT_ALERT_ON_LOST_RANKING,
  };
}

export type RefreshResult = {
  updated: number;
  alerts: Array<{ keyword: string; from: number | null; to: number | null }>;
};

/**
 * Pulls live Semrush metrics for every active keyword and stores one snapshot
 * per UTC day. Uses the service-role client — callers must authorize first.
 */
export async function refreshSnapshots(): Promise<RefreshResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { fetchKeywordMetrics } = await import("@/lib/semrush.server");
  const settings = await loadAlertSettings();


  const { data: keywords, error } = await supabaseAdmin
    .from("tracked_keywords")
    .select("id, keyword, database")
    .eq("active", true);
  if (error) throw new Error(error.message);
  if (!keywords || keywords.length === 0) return { updated: 0, alerts: [] };

  const today = new Date().toISOString().slice(0, 10);
  const groups = new Map<string, typeof keywords>();
  for (const k of keywords) {
    const list = groups.get(k.database) ?? [];
    list.push(k);
    groups.set(k.database, list);
  }

  const alerts: RefreshResult["alerts"] = [];
  let updated = 0;

  for (const [database, list] of groups) {
    const metrics = await fetchKeywordMetrics(
      DOMAIN,
      list.map((k) => k.keyword),
      database,
    );
    const byKeyword = new Map(metrics.map((m) => [m.keyword, m]));

    for (const k of list) {
      const metric = byKeyword.get(k.keyword.toLowerCase());
      if (!metric) continue;

      const { data: prior } = await supabaseAdmin
        .from("keyword_snapshots")
        .select("position, captured_on")
        .eq("keyword_id", k.id)
        .lt("captured_on", today)
        .order("captured_on", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error: upsertErr } = await supabaseAdmin.from("keyword_snapshots").upsert(
        {
          keyword_id: k.id,
          captured_on: today,
          position: metric.position,
          search_volume: metric.searchVolume,
          difficulty: metric.difficulty,
          traffic_share: metric.trafficShare,
          ranking_url: metric.rankingUrl,
        },
        { onConflict: "keyword_id,captured_on" },
      );
      if (upsertErr) throw new Error(upsertErr.message);
      updated += 1;

      const previousPosition = (prior?.position as number | null) ?? null;
      if (isDrop(metric.position, previousPosition, settings)) {
        alerts.push({ keyword: k.keyword, from: previousPosition, to: metric.position });
      }
    }
  }

  return { updated, alerts };
}

/** Emails a ranking-drop notice to one recipient. */
export async function sendRankingAlert(
  recipient: string,
  alerts: RefreshResult["alerts"],
  capturedOn: string,
  /** Distinguishes repeated manual test sends from the daily automatic one. */
  idempotencySuffix?: string,
): Promise<void> {
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  await sendTemplateEmail("ranking-alert", recipient, {
    templateData: { alerts, capturedOn },
    idempotencyKey: `ranking-alert-${capturedOn}-${recipient}${
      idempotencySuffix ? `-${idempotencySuffix}` : ""
    }`,
  });
}

/** Every admin's email address, for unattended (cron) alerting. */
export async function listAdminEmails(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (error || !roles) return [];

  const emails: string[] = [];
  for (const row of roles) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    const email = data?.user?.email;
    if (email) emails.push(email);
  }
  return emails;
}

/**
 * Who receives ranking alerts: the admin-managed recipient list, falling back
 * to every admin's account email when the list is empty.
 */
export async function listAlertRecipients(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ranking_alert_recipients").select("email");
  const configured = (data ?? []).map((r) => r.email).filter(Boolean);
  if (configured.length > 0) return configured;
  return listAdminEmails();
}
