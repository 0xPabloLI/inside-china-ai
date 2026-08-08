import { createFileRoute } from "@tanstack/react-router";
import { createEmailWebhookHandler } from "@lovable.dev/email-js";

/**
 * Lovable posts terminal email events here (registered automatically at publish
 * while this exact path exists). Lovable itself enforces suppression at send
 * time — these handlers only mirror the outcome into the app's subscriber list
 * so the admin UI reflects reality.
 */
let handler: ((request: Request) => Promise<Response>) | undefined;

function getHandler() {
  if (!handler) {
    handler = createEmailWebhookHandler({
      apiKey: process.env["LOVABLE_API_KEY"]!,
      on: {
        "email.unsubscribed": async (event) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("subscribers")
            .update({ unsubscribed_at: new Date().toISOString() })
            .eq("email", event.data.recipient);
        },
        "email.resubscribed": async (event) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("subscribers")
            .update({ unsubscribed_at: null })
            .eq("email", event.data.recipient);
        },
        "email.bounced": async (event) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("subscribers")
            .update({ unsubscribed_at: new Date().toISOString() })
            .eq("email", event.data.recipient);
        },
        "email.complaint": async (event) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("subscribers")
            .update({ unsubscribed_at: new Date().toISOString() })
            .eq("email", event.data.recipient);
        },
      },
    });
  }
  return handler;
}

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => getHandler()(request),
    },
  },
});

