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

/** True when a keyword slipped past the alert threshold or fell out of the top 100. */
export function isDrop(current: number | null, previous: number | null): boolean {
  if (previous === null) return false;
  if (current === null) return true;
  return current - previous >= DROP_THRESHOLD;
}

export const listTrackedKeywords = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<KeywordRow[]> => {
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
        alert: isDrop(position, previousPosition),
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
  .handler(async ({ context }) => {
    const { refreshSnapshots, sendRankingAlert } = await import(
      "@/lib/keyword-tracking.server"
    );
    const { updated, alerts } = await refreshSnapshots();

    if (alerts.length > 0) {
      const recipient = (context.claims as { email?: string } | undefined)?.email;
      if (recipient) {
        try {
          await sendRankingAlert(recipient, alerts, new Date().toISOString().slice(0, 10));
        } catch (err) {
          console.error("ranking alert email failed", err);
        }
      }
    }

    return { updated, alerts: alerts.map((a) => a.keyword) };
  });

