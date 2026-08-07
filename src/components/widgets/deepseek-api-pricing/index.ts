import { lazy } from "react";
import type { Lang } from "../shared/lang-toggle";

export interface APIPricingViewProps {
  lang?: Lang;
}

const APIPricingView = lazy(() =>
  import("./api-pricing-view").then((m) => ({
    default: m.APIPricingView,
  })),
);

export { APIPricingView };
