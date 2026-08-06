import { lazy } from "react";
import type { Lang } from "../shared/lang-toggle";

export interface OSSComparisonViewProps {
  lang?: Lang;
}

const OSSComparisonView = lazy(() => import("./oss-comparison-view").then((m) => ({
  default: m.OSSComparisonView,
})));

export { OSSComparisonView };