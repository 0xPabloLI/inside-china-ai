import { lazy, type LazyExoticComponent, type ComponentType } from "react";

// Widget components accept a `lang` prop ("en" | "zh"). Some components make
// it required (e.g., `lang: Lang`), so we use `ComponentType<{ lang: "en" | "zh" }>`
// to satisfy both required and optional usage patterns.
export type WidgetComponent = ComponentType<{ lang: "en" | "zh" }>;
export type LazyWidget = LazyExoticComponent<WidgetComponent>;

/**
 * Widget Registry — the sole extension point for adding new widgets.
 *
 * To add a new widget:
 * 1. Create the component under `src/components/widgets/<package>/`
 * 2. Import it here and add one line to the WIDGETS record
 *
 * The article page's content renderer and the editor dropdown both read from
 * this registry. No other registration is needed.
 */
export const WIDGETS: Record<string, LazyWidget> = {
  "deepseek-cloud": lazy(() =>
    import("./deepseek/cloud-view").then((m) => ({ default: m.CloudView })),
  ),
  "deepseek-talent": lazy(() =>
    import("./deepseek/talent-view").then((m) => ({ default: m.TalentView })),
  ),
  "deepseek-funding": lazy(() =>
    import("./deepseek/funding-view").then((m) => ({ default: m.FundingView })),
  ),
  "deepseek-pricing": lazy(() =>
    import("./deepseek/pricing-view").then((m) => ({ default: m.PricingView })),
  ),
  "deepseek-companies": lazy(() =>
    import("./deepseek/companies-view").then((m) => ({
      default: m.CompaniesView,
    })),
  ),
};

/** Get the list of available widget names (for editor dropdown). */
export function getWidgetNames(): string[] {
  return Object.keys(WIDGETS);
}

/** Look up a widget by ID. Returns null if not found. */
export function getWidget(id: string): LazyWidget | null {
  return WIDGETS[id] ?? null;
}

/** Check if a widget name is registered. */
export function isRegisteredWidget(name: string): boolean {
  return name in WIDGETS;
}
