import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

/**
 * Admin authorization middleware.
 *
 * Wraps `requireSupabaseAuth` and adds an admin role check via the
 * `has_role` database function. Throws "Forbidden" if the authenticated
 * user does not have the "admin" role.
 *
 * Usage:
 *   createServerFn({ method: "GET" })
 *     .middleware([requireAdmin])
 *     .handler(async ({ context }) => {
 *       // context.supabase, context.userId, context.isAdmin are available
 *     })
 *
 * The context inherited from `requireSupabaseAuth`:
 *   - supabase: authenticated Supabase client
 *   - userId: string
 *   - claims: JWT claims
 *
 * Added by `requireAdmin`:
 *   - isAdmin: true (always — if false, the middleware throws before handler)
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ context, next }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (error) {
      throw new Error(`Admin check failed: ${error.message}`);
    }

    if (!isAdmin) {
      throw new Error("Forbidden");
    }

    return next({
      context: {
        ...context,
        isAdmin: true as const,
      },
    });
  });
