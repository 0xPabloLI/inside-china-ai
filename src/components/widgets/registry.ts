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
 * 3. If the widget needs more width than the article text column (65ch),
 *    add its name to BREAKOUT_WIDGETS below
 *
 * The article page's content renderer and the editor dropdown both read from
 * this registry. No other registration is needed.
 */

/**
 * Widgets that need a wider container than the prose text column (65ch).
 * These render at the full article width (max-w-4xl, ~896px).
 * Typically: two-column layouts, wide matrices, or complex chart panels
 * that look cramped at 65ch.
 */
export const BREAKOUT_WIDGETS = new Set<string>([
  "deepseek-funding", // donut chart + investor legend side-by-side
]);

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
  "distillation-news-coverage": lazy(() =>
    import("./distillation/news-coverage-view").then((m) => ({
      default: m.NewsCoverageView,
    })),
  ),
  "kimi-benchmark-controversy": lazy(() =>
    import("./distillation/benchmark-controversy-view").then((m) => ({
      default: m.BenchmarkControversyView,
    })),
  ),
  "kimi-identity-bleed": lazy(() =>
    import("./distillation/identity-bleed-view").then((m) => ({
      default: m.IdentityBleedView,
    })),
  ),
  "moonshot-funding-timeline": lazy(() =>
    import("./distillation/moonshot-funding-view").then((m) => ({
      default: m.MoonshotFundingView,
    })),
  ),
  "minimax-stock-timeline": lazy(() =>
    import("./distillation/minimax-stock-view").then((m) => ({
      default: m.MinimaxStockView,
    })),
  ),
  "deepseek-vision-keywords": lazy(() =>
    import("./deepseek-vision").then((m) => ({
      default: m.VisionKeywordsView,
    })),
  ),
  "deepseek-agi-roadmap": lazy(() =>
    import("./deepseek-agi-roadmap").then((m) => ({
      default: m.AGIRoadmapView,
    })),
  ),
  "deepseek-oss-comparison": lazy(() =>
    import("./deepseek-oss-comparison").then((m) => ({
      default: m.OSSComparisonView,
    })),
  ),
  "deepseek-api-pricing": lazy(() =>
    import("./deepseek-api-pricing").then((m) => ({
      default: m.APIPricingView,
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

/** Check if a widget should render at the full article width (breakout). */
export function isBreakoutWidget(name: string): boolean {
  return BREAKOUT_WIDGETS.has(name);
}
