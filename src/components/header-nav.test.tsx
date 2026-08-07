import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeaderNav } from "./header-nav";

// Capture link props so we can assert the onArticlesClick handler is wired
// through to the Articles link (static markup cannot render handlers).
interface MockLinkProps {
  to?: string;
  onClick?: unknown;
  className?: string;
}

const { linkProps } = vi.hoisted(() => ({
  linkProps: {} as Record<string, MockLinkProps>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, onClick, className }: MockLinkProps) => {
    linkProps[to ?? ""] = { onClick, className };
    return <a href={to} className={className} />;
  },
}));

function render(opts: { pathname?: string; isAdmin?: boolean } = {}) {
  return renderToStaticMarkup(
    <HeaderNav
      pathname={opts.pathname ?? "/"}
      isAdmin={opts.isAdmin ?? false}
      onArticlesClick={() => {}}
    />,
  );
}

describe("HeaderNav", () => {
  // W1-S1: Desktop (≥640px) renders inline links, no hamburger in that branch
  it("renders desktop nav with Articles and Companies links", () => {
    const html = render();
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/companies"');
    // Desktop branch is the sm:flex nav (mobile branch carries the hamburger)
    expect(html).toContain("sm:flex");
  });

  // W1-S2: Admin link only when isAdmin
  it("shows Admin link when isAdmin is true", () => {
    const html = render({ isAdmin: true });
    expect(html).toContain('href="/admin"');
  });

  it("hides Admin link when isAdmin is false", () => {
    const html = render({ isAdmin: false });
    expect(html).not.toContain('href="/admin"');
  });

  // W1-S3: Mobile (<640px) branch has hamburger button with aria-label
  it("renders mobile hamburger button with aria-label", () => {
    const html = render();
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toContain("sm:hidden");
  });

  // W1-S4: Articles active on home and post pages
  it("marks Articles active on home", () => {
    render({ pathname: "/" });
    expect(linkProps["/"].className).toContain("text-foreground");
    expect(linkProps["/"].className).toContain("font-medium");
  });

  it("marks Articles active on a post page", () => {
    render({ pathname: "/posts/some-article" });
    expect(linkProps["/"].className).toContain("font-medium");
  });

  it("does not mark Articles active on companies page", () => {
    render({ pathname: "/companies" });
    expect(linkProps["/"].className).not.toContain("font-medium");
  });

  // W1-S5: onArticlesClick is wired to the Articles link
  it("wires onArticlesClick to the Articles link", () => {
    render();
    expect(typeof linkProps["/"].onClick).toBe("function");
  });
});
