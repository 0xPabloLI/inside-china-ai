import { type ReactNode } from "react";

/**
 * Renders children in a breakout container that is wider than the article body.
 * Article body: max-w-4xl (~896px), text column: max-w-prose (~65ch).
 * Widget breakout: min(90vw, 1200px).
 */
export function WidgetBreakout({ children }: { children: ReactNode }) {
  return (
    <div className="my-8 mx-auto" style={{ width: "min(90vw, 1200px)", maxWidth: "100%" }}>
      {children}
    </div>
  );
}
