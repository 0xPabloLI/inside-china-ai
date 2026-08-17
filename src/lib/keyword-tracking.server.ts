/** The domain whose rankings the keyword dashboard tracks. */
export const DOMAIN = "chinaai.news";

/** A position drop of this many places (or losing the ranking) raises an alert. */
const DROP_THRESHOLD = 3;

function isDrop(current: number | null, previous: number | null): boolean {
  if (previous === null) return false;
  if (current === null) return true;
  return current - previous >= DROP_THRESHOLD;
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
      if (isDrop(metric.position, previousPosition)) {
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
): Promise<void> {
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  await sendTemplateEmail("ranking-alert", recipient, {
    templateData: { alerts, capturedOn },
    idempotencyKey: `ranking-alert-${capturedOn}-${recipient}`,
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
