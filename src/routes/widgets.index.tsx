import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getWidgetNames } from "@/components/widgets/registry";

/**
 * Dev-only widget preview index (spec widget-preview-route R1).
 *
 * Lists every registered widget; each links to /widgets/<name> which
 * renders the widget inside the exact same card wrapper as article pages,
 * so the Playwright a11y/container verification
 * (scripts/verify-widget-a11y.mjs --preview) can runtime-check widgets
 * that are not yet published to the DB.
 *
 * Production builds replace import.meta.env.DEV with false, so this route
 * 404s outside the dev server — no public exposure.
 */
export const Route = createFileRoute("/widgets/")({
  component: WidgetsIndex,
});

function WidgetsIndex() {
  if (!import.meta.env.DEV) throw notFound();

  const names = getWidgetNames();

  return (
    <main className="mx-auto max-w-4xl px-6 pt-12 pb-24">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to articles
      </Link>
      <div className="mt-2 inline-block rounded bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-foreground">
        DEV PREVIEW
      </div>
      <h1 className="mt-2 font-serif text-4xl leading-tight">Widget Preview</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Runtime verification surface for widgets not yet published in an article. Rendered with the
        same card wrapper as article pages.
      </p>
      <ul className="mt-8 space-y-2">
        {names.map((name) => (
          <li key={name}>
            <Link
              to="/widgets/$name"
              params={{ name }}
              className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 text-sm text-foreground transition-colors hover:border-border"
            >
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
