import { lazy } from "react";
import type { Lang } from "../shared/lang-toggle";

export interface AGIRoadmapViewProps {
  lang?: Lang;
}

const AGIRoadmapView = lazy(() =>
  import("./agi-roadmap-view").then((m) => ({
    default: m.AGIRoadmapView,
  })),
);

export { AGIRoadmapView };
