import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Suspense } from "react";
import { WIDGETS, isRegisteredWidget, isBreakoutWidget } from "@/components/widgets/registry";

/**
 * Dev-only widget preview (spec widget-preview-route R2).
 *
 * Renders one registered widget inside the exact same card wrapper as
 * posts.$slug (bg-card + my-10 + px-4 py-5 sm:px-6 sm:py-6 + breakout
 * width logic + Suspense), so scripts/verify-widget-a11y.mjs --preview
 * exercises the identical DOM surface without needing the article in the
 * database.
 *
 * Production builds 404 (import.meta.env.DEV is statically false).
 */
export const Route = createFileRoute("/widgets/$name")({
  component: WidgetPreview,
});

function WidgetPreview() {
  if (!import.meta.env.DEV) throw notFound();

  const { name } = Route.useParams();
  if (!isRegisteredWidget(name)) throw notFound();

  const Widget = WIDGETS[name];
  const isBreakout = isBreakoutWidget(name);

  return (
    <main className="mx-auto max-w-4xl px-6 pt-12 pb-24">
      <Link to="/widgets" className="text-sm text-muted-foreground hover:text-foreground">
        ← All widgets
      </Link>
      <div className="mt-2 inline-block rounded bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-foreground">
        DEV PREVIEW
      </div>
      <h1 className="mt-2 font-serif text-2xl leading-tight">{name}</h1>
      <div
        className={`my-10 rounded-lg border border-border/60 bg-card px-4 py-5 sm:px-6 sm:py-6 ${
          isBreakout ? "max-w-none" : "max-w-prose"
        }`}
      >
        <Suspense
          fallback={
            <div className="animate-pulse text-sm text-muted-foreground">Loading widget…</div>
          }
        >
          <Widget lang="en" />
        </Suspense>
      </div>
    </main>
  );
}
