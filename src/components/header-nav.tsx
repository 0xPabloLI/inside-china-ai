import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";

interface HeaderNavProps {
  /** Current pathname — drives active link styling. */
  pathname: string;
  /** Whether to show the Admin link. */
  isAdmin: boolean;
  /** Articles link handler (scroll to list on home, navigate otherwise). */
  onArticlesClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

function articlesActive(pathname: string) {
  return pathname === "/" || pathname.startsWith("/posts/");
}

/**
 * Site navigation. Responsive: inline links at ≥640px (sm:flex), hamburger
 * button + right-side Sheet menu below that. Pure presentational — the
 * caller supplies pathname, admin state, and the articles scroll handler.
 */
export function HeaderNav({ pathname, isAdmin, onArticlesClick }: HeaderNavProps) {
  const articleLinkClass = (p: string) =>
    `hover:text-foreground ${
      articlesActive(p) ? "text-foreground font-medium" : "text-muted-foreground"
    }`;
  const staticLinkClass = (active: boolean) =>
    `hover:text-foreground ${active ? "text-foreground font-medium" : "text-muted-foreground"}`;

  const links = (
    <>
      <Link to="/" className={articleLinkClass(pathname)} onClick={onArticlesClick}>
        Articles
      </Link>
      <Link to="/news" className={staticLinkClass(pathname.startsWith("/news"))}>
        News
      </Link>
      <Link to="/companies" className={staticLinkClass(pathname.startsWith("/companies"))}>
        Companies
      </Link>

      {isAdmin ? (
        <Link to="/admin" className={staticLinkClass(pathname.startsWith("/admin"))}>
          Admin
        </Link>
      ) : null}
    </>
  );

  const mobileLinks = (
    <>
      <SheetClose asChild>
        <Link to="/" className={articleLinkClass(pathname)} onClick={onArticlesClick}>
          Articles
        </Link>
      </SheetClose>
      <SheetClose asChild>
        <Link to="/companies" className={staticLinkClass(pathname.startsWith("/companies"))}>
          Companies
        </Link>
      </SheetClose>
      {isAdmin ? (
        <SheetClose asChild>
          <Link to="/admin" className={staticLinkClass(pathname.startsWith("/admin"))}>
            Admin
          </Link>
        </SheetClose>
      ) : null}
    </>
  );

  return (
    <>
      {/* Desktop (≥640px): inline links */}
      <nav className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
        {links}
        <ThemeToggle />
      </nav>

      {/* Mobile (<640px): theme toggle + hamburger with Sheet menu */}
      <div className="flex items-center gap-1 sm:hidden">
        <ThemeToggle />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <nav className="mt-8 flex flex-col items-start gap-4 text-sm text-muted-foreground">
              {mobileLinks}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
