import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandName } from "./brand-name";

export function SiteHeader() {
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();

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

  /**
   * When already on the home page, clicking "Articles" scrolls to the
   * articles list instead of being a no-op. On other pages it navigates home.
   */
  function handleArticlesClick(e: React.MouseEvent) {
    if (location.pathname === "/") {
      e.preventDefault();
      document.getElementById("articles")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="China AI News" className="h-8 w-auto" />
          <span className="font-serif text-2xl tracking-tight">
            <BrandName />
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-foreground font-medium" }}
            inactiveProps={{ className: "text-muted-foreground" }}
            className="hover:text-foreground"
            onClick={handleArticlesClick}
          >
            Articles
          </Link>
          <Link
            to="/companies"
            activeProps={{ className: "text-foreground font-medium" }}
            inactiveProps={{ className: "text-muted-foreground" }}
            className="hover:text-foreground"
          >
            Companies
          </Link>

          {isAdmin ? (
            <Link
              to="/admin"
              activeProps={{ className: "text-foreground font-medium" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="hover:text-foreground"
            >
              Admin
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
