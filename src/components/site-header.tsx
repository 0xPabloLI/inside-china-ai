import { Link, useLocation } from "@tanstack/react-router";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { BrandName } from "./brand-name";

export function SiteHeader() {
  const { isAdmin } = useIsAdmin();
  const location = useLocation();

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
            className={`hover:text-foreground ${
              location.pathname === "/" || location.pathname.startsWith("/posts/")
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            }`}
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
