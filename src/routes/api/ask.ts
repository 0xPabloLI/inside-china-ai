import { createFileRoute } from "@tanstack/react-router";
import { retrieveSources } from "@/lib/ask-retrieval.server";
import { checkRateLimit, hashVisitor, logQuestion, streamAnswer } from "@/lib/ask.server";

/**
 * POST /api/ask — grounded Q&A over published China AI News articles.
 *
 * Body: { question: string }
 * Response: a text stream whose FIRST line is a JSON metadata object
 * (`{"sources":[{slug,title,publishedAt}]}`) followed by the answer text.
 * Public (the whole site is public) but rate limited per visitor hash.
 */
const MAX_QUESTION_CHARS = 400;

export const Route = createFileRoute("/api/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let question = "";
        try {
          const body = (await request.json()) as { question?: unknown };
          question = typeof body.question === "string" ? body.question.trim() : "";
        } catch {
          return json({ error: "Invalid request body." }, 400);
        }

        if (question.length < 8) {
          return json({ error: "Please ask a slightly longer question." }, 400);
        }
        if (question.length > MAX_QUESTION_CHARS) {
          return json({ error: `Questions are limited to ${MAX_QUESTION_CHARS} characters.` }, 400);
        }

        const ipHash = await hashVisitor(request);
        const limit = await checkRateLimit(ipHash);
        if (!limit.allowed) {
          return json(
            {
              error:
                limit.retryAfterMinutes > 60
                  ? "Daily question limit reached. Please come back tomorrow."
                  : "Too many questions in the last hour. Please try again later.",
            },
            429,
          );
        }

        let sources;
        try {
          sources = await retrieveSources(question);
        } catch (error) {
          console.error("[ask] retrieval failed:", error);
          return json({ error: "Could not search the archive right now." }, 500);
        }

        void logQuestion(ipHash, question, sources);

        if (sources.length === 0) {
          return streamStatic(
            [],
            "I could not find anything in the China AI News archive that answers this. Try naming a specific model, lab or policy — for example DeepSeek, Qwen, GLM or export controls.",
          );
        }

        const meta = JSON.stringify({
          sources: sources.map((s) => ({
            slug: s.slug,
            title: s.title,
            publishedAt: s.publishedAt,
          })),
        });

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(encoder.encode(`${meta}\n`));
            try {
              for await (const delta of streamAnswer(question, sources, request.signal)) {
                controller.enqueue(encoder.encode(delta));
              }
            } catch (error) {
              if ((error as Error)?.name === "AbortError") {
                controller.close();
                return;
              }
              console.error("[ask] gateway stream failed:", error);
              controller.enqueue(
                encoder.encode(
                  "\n\n[The answer service is unavailable right now. Please try again in a moment.]",
                ),
              );
            }
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function streamStatic(sources: unknown[], text: string) {
  return new Response(`${JSON.stringify({ sources })}\n${text}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
