/**
 * Server-side plumbing for "Ask China AI": rate limiting, prompt building and
 * the streaming Lovable AI Gateway call. Never import this from client code.
 */

import type { RetrievedSource } from "@/lib/ask-retrieval.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";
const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export const HOURLY_LIMIT = 10;
export const DAILY_LIMIT = 40;

/** Stable, non-reversible visitor key — we never store the raw IP. */
export async function hashVisitor(request: Request): Promise<string> {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const bytes = new TextEncoder().encode(`ask:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMinutes: number;
}

/** Count recent questions from this visitor and enforce the hourly/daily caps. */
export async function checkRateLimit(ipHash: string): Promise<RateLimitResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("ask_queries")
    .select("created_at")
    .eq("ip_hash", ipHash)
    .gte("created_at", dayAgo);
  if (error) {
    // Never block readers because logging is degraded.
    console.error("[ask] rate limit lookup failed:", error.message);
    return { allowed: true, retryAfterMinutes: 0 };
  }

  const rows = data ?? [];
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const lastHour = rows.filter((r) => new Date(r.created_at).getTime() >= hourAgo);

  if (lastHour.length >= HOURLY_LIMIT) return { allowed: false, retryAfterMinutes: 60 };
  if (rows.length >= DAILY_LIMIT) return { allowed: false, retryAfterMinutes: 24 * 60 };
  return { allowed: true, retryAfterMinutes: 0 };
}

export async function logQuestion(
  ipHash: string,
  question: string,
  sources: RetrievedSource[],
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("ask_queries").insert({
    ip_hash: ipHash,
    question,
    source_slugs: sources.map((s) => s.slug),
  });
  if (error) console.error("[ask] failed to log question:", error.message);
}

const SYSTEM_PROMPT = `You are the research assistant for China AI News (chinaai.news), an independent publication covering Chinese AI models, the labs building them, and China's AI policy.

Rules:
- Answer ONLY from the numbered article excerpts provided. They are the publication's own reporting.
- Cite every factual claim inline with the source number, like [1] or [2][3].
- If the excerpts do not contain the answer, say so plainly in one or two sentences and suggest what the reader could search for instead. Never invent facts, numbers, dates, model names or quotes.
- Note when reporting may be dated (e.g. "as of the September 2026 piece").
- Be concise: 120-220 words, plain prose or short bullets, no headings, no preamble.
- Answer in the language of the question (Chinese question -> Chinese answer).`;

export function buildInput(question: string, sources: RetrievedSource[]): string {
  const context = sources
    .map((s, i) => {
      const date = s.publishedAt ? new Date(s.publishedAt).toISOString().slice(0, 10) : "undated";
      return `[${i + 1}] "${s.title}" (published ${date}, /posts/${s.slug})\n${s.passage}`;
    })
    .join("\n\n---\n\n");

  return `Reader question:\n${question}\n\nArticle excerpts from China AI News:\n\n${context}`;
}

/**
 * Stream the grounded answer text from the gateway.
 * Yields answer-text deltas; reasoning is requested at low effort but not surfaced.
 */
export async function* streamAnswer(
  question: string,
  sources: RetrievedSource[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    signal,
    body: JSON.stringify({
      model: MODEL,
      instructions: SYSTEM_PROMPT,
      input: buildInput(question, sources),
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    const runId = response.headers.get(RUN_ID_HEADER) ?? "unknown";
    throw new Error(`Gateway ${response.status} (run ${runId}): ${detail.slice(0, 400)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as { type?: string; delta?: string };
          if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string") {
            yield parsed.delta;
          }
        } catch {
          // Ignore partial/non-JSON keepalive frames.
        }
      }
    }
  }
}
