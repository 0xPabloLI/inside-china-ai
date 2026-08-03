import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandName } from "./brand-name";

export function SiteHeader() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const user = data.user;
      if (!user) return setIsAdmin(false);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (cancelled) return;
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
    }
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-3xl items-baseline justify-between px-6 py-6">
        <Link to="/" className="font-serif text-2xl tracking-tight">
          <BrandName />
        </Link>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link to="/" activeOptions={{ exact: true }} className="hover:text-foreground">
            Articles
          </Link>
          <Link to="/companies" className="hover:text-foreground">
            Companies
          </Link>

          {isAdmin ? (
            <Link to="/admin" className="hover:text-foreground">
              Admin
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
