/**
 * Semrush connector gateway client (server-only).
 *
 * All calls are proxied through the Lovable connector gateway, which injects
 * the workspace's Semrush OAuth token. Never call oauth.semrush.com directly.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/semrush";

export type SemrushRow = Record<string, string>;

function normalizeRows(payload: unknown): SemrushRow[] {
  const data = (payload as { data?: { columnNames?: string[]; rows?: unknown[] } })?.data;
  const columns = data?.columnNames ?? [];
  const rows = data?.rows ?? [];
  return rows.map((row) => {
    if (Array.isArray(row)) {
      const out: SemrushRow = {};
      columns.forEach((col, i) => {
        out[col] = String(row[i] ?? "");
      });
      return out;
    }
    const obj = row as Record<string, unknown>;
    const out: SemrushRow = {};
    for (const [k, v] of Object.entries(obj)) out[k] = String(v ?? "");
    return out;
  });
}

/** Perform a GET against a Semrush resource through the gateway. */
export async function semrushGet(
  path: string,
  params: Record<string, string | number>,
): Promise<SemrushRow[]> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["SEMRUSH_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!connectionKey) throw new Error("SEMRUSH_API_KEY is not configured — connect Semrush first");

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) query.set(k, String(v));

  const response = await fetch(`${GATEWAY_URL}${path}?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Allow-Limit-Offset": "true",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`Semrush gateway failed [${response.status}]: ${text}`);
    if (/TOTAL LIMIT EXCEEDED|LIMIT EXCEEDED/i.test(text)) {
      throw new Error(
        "The Semrush API quota is exhausted — upgrade your Semrush plan or wait for the quota to reset.",
      );
    }
    throw new Error(`Semrush request failed [${response.status}]: ${text}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Semrush returned an unreadable response");
  }
  const errorField = (payload as { error?: string })?.error;
  if (errorField) {
    console.error(`Semrush error body: ${errorField}`);
    if (/LIMIT EXCEEDED/i.test(errorField)) {
      throw new Error(
        "The Semrush API quota is exhausted — upgrade your Semrush plan or wait for the quota to reset.",
      );
    }
    throw new Error(`Semrush error: ${errorField}`);
  }

  return normalizeRows(payload);
}

function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type LiveKeywordMetric = {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  difficulty: number | null;
  trafficShare: number | null;
  rankingUrl: string | null;
};

/**
 * Fetch current position + demand metrics for the given keywords.
 * Two gateway calls total: the domain's organic keyword set, and bulk
 * keyword metrics (so non-ranking keywords still get volume/difficulty).
 */
export async function fetchKeywordMetrics(
  domain: string,
  keywords: string[],
  database: string,
): Promise<LiveKeywordMetric[]> {
  const wanted = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return [];

  const [organicRows, phraseRows] = await Promise.all([
    semrushGet("/domains/domain_organic", {
      domain,
      database,
      export_columns: "Ph,Po,Nq,Ur,Tr",
      display_limit: 1000,
    }).catch((err) => {
      console.error("domain_organic failed", err);
      return [] as SemrushRow[];
    }),
    semrushGet("/keywords/phrase_these", {
      phrase: wanted.join(";"),
      database,
      export_columns: "Ph,Nq,Cp,Co,Kd",
    }).catch((err) => {
      console.error("phrase_these failed", err);
      return [] as SemrushRow[];
    }),
  ]);

  const organic = new Map<string, SemrushRow>();
  for (const row of organicRows) {
    const key = (row["Keyword"] ?? row["Ph"] ?? "").toLowerCase();
    if (key) organic.set(key, row);
  }
  const phrase = new Map<string, SemrushRow>();
  for (const row of phraseRows) {
    const key = (row["Keyword"] ?? row["Ph"] ?? "").toLowerCase();
    if (key) phrase.set(key, row);
  }

  return wanted.map((keyword) => {
    const o = organic.get(keyword);
    const p = phrase.get(keyword);
    return {
      keyword,
      position: num(o?.["Position"] ?? o?.["Po"]),
      searchVolume:
        num(p?.["Search Volume"] ?? p?.["Nq"]) ?? num(o?.["Search Volume"] ?? o?.["Nq"]),
      difficulty: num(p?.["Keyword Difficulty Index"] ?? p?.["Kd"]),
      trafficShare: num(o?.["Traffic (%)"] ?? o?.["Tr"]),
      rankingUrl: o?.["Url"] ?? o?.["Ur"] ?? null,
    };
  });
}
