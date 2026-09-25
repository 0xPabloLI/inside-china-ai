/**
 * Daily job for public "Ask China AI" answer pages (/ask/<slug>).
 *
 * 1. Promote: questions asked by >= MIN_VISITORS distinct visitors in the last
 *    30 days get a grounded answer page (auto-published, PII-filtered).
 * 2. Refresh: pages whose source articles changed after the answer was written
 *    are regenerated from the latest reporting.
 * 3. Search tuning: pages with Search Console impressions but weak CTR get an
 *    AI-rewritten title/description (at most once every 14 days).
 *
 * Bounded per run, single-flight lease, paused on AI credit/policy errors.
 * Server-only — never import from client code.
 */
import { retrieveSources } from "@/lib/ask-retrieval.server";
import { streamAnswer } from "@/lib/ask.server";
import { slugify } from "@/lib/slug";

const JOB = "ask-answers";
const MIN_VISITORS = 3;
const MAX_NEW = 5;
const MAX_REFRESH = 5;
const MAX_SEO = 3;
const SITE = "https://chinaai.news";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

class PausedError extends Error {}

/** Normalise a question so trivially different phrasings group together. */
function questionKey(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, " ")
    .replace(/[?？!！.。,，\s]+$/g, "")
    .trim();
}

/** Reject questions that are too short/long or look like they contain personal data or spam. */
function isPublishableQuestion(q: string): boolean {
  if (q.length < 12 || q.length > 200) return false;
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(q)) return false; // email
  if (/https?:\/\/|www\./i.test(q)) return false; // links
  if (/\d[\d\s-]{7,}\d/.test(q)) return false; // phone-like numbers
  if (/(.)\1{5,}/.test(q)) return false; // keyboard mash
  return true;
}

function answerSlug(question: string, existing: Set<string>): string {
  let base = slugify(question).replace(/^-|-$/g, "").slice(0, 70);
  if (base.length < 6) base = `question-${Math.abs(hash(question)).toString(36)}`;
  let slug = base;
  for (let i = 2; existing.has(slug); i++) slug = `${base}-${i}`;
  existing.add(slug);
  return slug;
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

function defaultSeo(question: string, answer: string) {
  const q = question.replace(/[?？]*$/, "");
  const title = q.length > 58 ? `${q.slice(0, 55).trimEnd()}…?` : `${q}?`;
  const plain = answer.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  const description = plain.length > 155 ? `${plain.slice(0, 152).trimEnd()}…` : plain;
  return { title, description };
}

async function generateAnswer(question: string) {
  const sources = await retrieveSources(question);
  if (sources.length === 0) return null;
  let answer = "";
  try {
    for await (const d of streamAnswer(question, sources)) answer += d;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Gateway (402|403)/.test(msg)) throw new PausedError(msg.slice(0, 300));
    throw e;
  }
  answer = answer.trim();
  // A "not covered" reply is not worth indexing.
  if (answer.length < 120 || !/\[\d+\]/.test(answer)) return null;
  return { answer, sourceSlugs: sources.map((s) => s.slug) };
}

async function promote(admin: Admin, stats: Record<string, number>) {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: rows, error } = await admin
    .from("ask_queries")
    .select("question, ip_hash")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);

  const groups = new Map<string, { question: string; visitors: Set<string>; count: number }>();
  for (const r of rows ?? []) {
    const key = questionKey(r.question);
    const g = groups.get(key) ?? { question: r.question.trim(), visitors: new Set(), count: 0 };
    g.visitors.add(r.ip_hash);
    g.count += 1;
    groups.set(key, g);
  }

  const { data: existingRows } = await admin.from("ask_answers").select("slug, question_key");
  const existingKeys = new Map((existingRows ?? []).map((r) => [r.question_key, r.slug]));
  const slugs = new Set((existingRows ?? []).map((r) => r.slug));

  // Keep popularity counts fresh on existing pages.
  for (const [key, g] of groups) {
    if (existingKeys.has(key)) {
      await admin.from("ask_answers").update({ ask_count: g.count }).eq("question_key", key);
    }
  }

  const candidates = [...groups.entries()]
    .filter(
      ([key, g]) =>
        !existingKeys.has(key) && g.visitors.size >= MIN_VISITORS && isPublishableQuestion(g.question),
    )
    .sort((a, b) => b[1].visitors.size - a[1].visitors.size)
    .slice(0, MAX_NEW);

  for (const [key, g] of candidates) {
    const result = await generateAnswer(g.question);
    if (!result) continue;
    const seo = defaultSeo(g.question, result.answer);
    const { error: insErr } = await admin.from("ask_answers").insert({
      slug: answerSlug(g.question, slugs),
      question_key: key,
      question: g.question,
      answer: result.answer,
      seo_title: seo.title,
      seo_description: seo.description,
      source_slugs: result.sourceSlugs,
      ask_count: g.count,
    });
    if (!insErr) stats.created++;
  }
}

async function refresh(admin: Admin, stats: Record<string, number>) {
  const { data: answers } = await admin
    .from("ask_answers")
    .select("id, question, answered_at, source_slugs")
    .eq("status", "published");
  const { data: posts } = await admin
    .from("posts")
    .select("slug, updated_at, published_at")
    .eq("published", true);
  const latest = (posts ?? []).reduce(
    (m, p) => Math.max(m, new Date(p.published_at ?? p.updated_at ?? 0).getTime()),
    0,
  );
  const updatedBySlug = new Map((posts ?? []).map((p) => [p.slug, new Date(p.updated_at).getTime()]));

  const stale = (answers ?? [])
    .filter((a) => {
      const at = new Date(a.answered_at).getTime();
      const sourceChanged = a.source_slugs.some((s) => (updatedBySlug.get(s) ?? 0) > at);
      return sourceChanged || latest > at; // new article may now be the best source
    })
    .slice(0, MAX_REFRESH);

  for (const a of stale) {
    const result = await generateAnswer(a.question);
    const now = new Date().toISOString();
    if (!result) {
      // Mark checked so we don't retry every day.
      await admin.from("ask_answers").update({ answered_at: now }).eq("id", a.id);
      continue;
    }
    await admin
      .from("ask_answers")
      .update({ answer: result.answer, source_slugs: result.sourceSlugs, answered_at: now, updated_at: now })
      .eq("id", a.id);
    stats.refreshed++;
  }
}

async function fetchGscPages(): Promise<Map<string, { impressions: number; ctr: number; queries: string[] }>> {
  const out = new Map<string, { impressions: number; ctr: number; queries: string[] }>();
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gscKey = process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"];
  if (!lovableKey || !gscKey) return out;
  const end = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const start = new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10);
  const res = await fetch(
    `https://connector-gateway.lovable.dev/google_search_console/webmasters/v3/sites/${encodeURIComponent(`${SITE}/`)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gscKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        dimensions: ["page", "query"],
        dimensionFilterGroups: [
          { filters: [{ dimension: "page", operator: "contains", expression: "/ask/" }] },
        ],
        rowLimit: 1000,
      }),
    },
  );
  if (!res.ok) {
    console.error("[ask-answers] GSC query failed", res.status);
    return out;
  }
  const body = (await res.json()) as {
    rows?: { keys: string[]; impressions: number; clicks: number }[];
  };
  const agg = new Map<string, { impressions: number; clicks: number; queries: string[] }>();
  for (const r of body.rows ?? []) {
    const [page, query] = r.keys;
    const a = agg.get(page) ?? { impressions: 0, clicks: 0, queries: [] };
    a.impressions += r.impressions;
    a.clicks += r.clicks;
    if (a.queries.length < 8) a.queries.push(query);
    agg.set(page, a);
  }
  for (const [page, a] of agg)
    out.set(page, { impressions: a.impressions, ctr: a.clicks / Math.max(a.impressions, 1), queries: a.queries });
  return out;
}

async function rewriteSeo(question: string, answer: string, queries: string[]) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      reasoning: { effort: "low" },
      instructions:
        'You write Google search snippets for a Q&A page on China AI News. Return ONLY JSON {"title": string, "description": string}. Title <= 60 chars, phrased as the question searchers type. Description 120-155 chars, states the answer directly, no clickbait, no facts beyond the answer.',
      input: `Question: ${question}\nSearch queries this page appears for: ${queries.join("; ")}\nAnswer:\n${answer}`,
    }),
  });
  if (res.status === 402 || res.status === 403) throw new PausedError(`Gateway ${res.status}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[] };
  const text = body.output
    ?.flatMap((o) => o.content ?? [])
    .find((c) => c.type === "output_text")?.text;
  try {
    const parsed = JSON.parse((text ?? "").replace(/^```(json)?|```$/g, "").trim()) as {
      title?: string;
      description?: string;
    };
    if (!parsed.title || !parsed.description) return null;
    return { title: parsed.title.slice(0, 70), description: parsed.description.slice(0, 160) };
  } catch {
    return null;
  }
}

async function tuneSeo(admin: Admin, stats: Record<string, number>) {
  const pages = await fetchGscPages();
  if (pages.size === 0) return;
  const cutoff = Date.now() - 14 * 864e5;
  const { data: answers } = await admin
    .from("ask_answers")
    .select("id, slug, question, answer, seo_rewritten_at")
    .eq("status", "published");
  const targets = (answers ?? [])
    .map((a) => ({ a, g: pages.get(`${SITE}/ask/${a.slug}`) }))
    .filter(
      ({ a, g }) =>
        g && g.impressions >= 50 && g.ctr < 0.02 &&
        (!a.seo_rewritten_at || new Date(a.seo_rewritten_at).getTime() < cutoff),
    )
    .slice(0, MAX_SEO);
  for (const { a, g } of targets) {
    const seo = await rewriteSeo(a.question, a.answer, g!.queries);
    if (!seo) continue;
    await admin
      .from("ask_answers")
      .update({ seo_title: seo.title, seo_description: seo.description, seo_rewritten_at: new Date().toISOString() })
      .eq("id", a.id);
    stats.seoRewritten++;
  }
}

export async function runAskAnswersJob(opts: { resume?: boolean } = {}) {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

  const { data: state } = await admin.from("ask_job_state").select("*").eq("name", JOB).single();
  if (state?.paused_reason && !opts.resume) {
    return { ok: false, paused: state.paused_reason };
  }
  const { data: got } = await admin.rpc("acquire_ask_job_lease", { _name: JOB, _seconds: 900 });
  if (!got) return { ok: false, skipped: "already running" };

  const stats = { created: 0, refreshed: 0, seoRewritten: 0 };
  let paused: string | null = null;
  let error: string | null = null;
  try {
    await promote(admin, stats);
    await refresh(admin, stats);
    await tuneSeo(admin, stats);
  } catch (e) {
    if (e instanceof PausedError) paused = `AI credits or policy blocked: ${e.message}`;
    else error = e instanceof Error ? e.message : String(e);
  } finally {
    let gsc: unknown = null;
    if (stats.created > 0) {
      try {
        const { submitSitemapsToGsc } = await import("./gsc-sitemap.server");
        gsc = await submitSitemapsToGsc();
      } catch (e) {
        gsc = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      console.log("[ask-answers] sitemap submission:", JSON.stringify(gsc));
    }
    await admin
      .from("ask_job_state")
      .update({
        locked_until: null,
        paused_reason: paused,
        last_run_at: new Date().toISOString(),
        last_result: JSON.parse(JSON.stringify({ ...stats, paused, error, gsc })),
      })
      .eq("name", JOB);
    Object.assign(stats, { gsc });
  }
  return { ok: !paused && !error, ...stats, paused, error };
}
