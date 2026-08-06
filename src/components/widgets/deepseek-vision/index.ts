import { lazy } from "react";
import type { Lang } from "../shared/lang-toggle";

export interface VisionKeywordsViewProps {
  lang?: Lang;
}

const VisionKeywordsView = lazy(() => import("./vision-keywords-view").then((m) => ({
  default: m.VisionKeywordsView,
})));

export { VisionKeywordsView };