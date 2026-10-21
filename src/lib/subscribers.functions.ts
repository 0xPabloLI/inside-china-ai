import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/require-admin";

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

/**
 * Is this insert failure just "this address is already subscribed"?
 *
 * The subscribe path is public and re-subscribing is routine, so the outcome
 * must not depend on PostgREST's message wording. The unique-violation code
 * (23505) is the authority; the message check stays as a fallback for
 * responses that carry no code (#319 OCR lib scan).
 */
export function isDuplicateEmailError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return (error.message ?? "").toLowerCase().includes("duplicate");
}

export const subscribe = createServerFn({ method: "POST" })
  .validator((d: unknown) => emailSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("subscribers").insert({ email: data.email });
    if (error && !isDuplicateEmailError(error)) {
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const listSubscribers = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subscribers")
      .select("id, email, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteSubscriber = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("subscribers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
