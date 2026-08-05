import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Check whether the current authenticated user has the "admin" role.
 *
 * Returns:
 *   - `{ isAdmin: null, isLoading: true }` while checking (initial mount)
 *   - `{ isAdmin: true, isLoading: false }` if the user is an admin
 *   - `{ isAdmin: false, isLoading: false }` if not an admin or not signed in
 *
 * Subscribes to `onAuthStateChange` so login/logout immediately updates the
 * result without requiring a remount.
 *
 * Uses the `has_role` database RPC (same method as the server-side
 * `requireAdmin` middleware) for consistency.
 */
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data: authData } = await supabase.auth.getUser();
      if (cancelled) return;

      const user = authData.user;
      if (!user) {
        setIsAdmin(false);
        return;
      }

      const { data } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (cancelled) return;
      setIsAdmin(!!data);
    }

    check();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { isAdmin, isLoading: isAdmin === null };
}
