import { useState } from "react";
import { PHASES, type RoadmapPhase } from "./data/phases";

interface AGIRoadmapViewProps {
  lang?: "en" | "zh";
}

const translations = {
  en: {
    title: "DeepSeek's AGI Roadmap",
    subtitle: "Each phase builds on the last. Current focus: Agents",
    whatItSolved: "What It Solved",
    whatsNext: "What's Next",
    statusPast: "Completed",
    statusCurrent: "Current Focus",
    statusFuture: "Upcoming",
  },
  zh: {
    title: "DeepSeek 的 AGI 路线图",
    subtitle: "每个阶段都建立在前一阶段的基础上。当前重点：智能体",
    whatItSolved: "解决的问题",
    whatsNext: "下一步",
    statusPast: "已完成",
    statusCurrent: "当前重点",
    statusFuture: "即将到来",
  },
};

function getPhaseLabel(status: RoadmapPhase["status"], lang: "en" | "zh"): string {
  if (status === "past") return translations[lang].statusPast;
  if (status === "current") return translations[lang].statusCurrent;
  return translations[lang].statusFuture;
}

function getStatusColor(status: RoadmapPhase["status"]): string {
  if (status === "past") return "bg-success";
  if (status === "current") return "bg-brand";
  return "bg-slate-300 dark:bg-slate-600";
}

function getStatusBorder(status: RoadmapPhase["status"]): string {
  if (status === "past") return "border-success-muted";
  if (status === "current") return "border-brand shadow-lg shadow-brand/10";
  return "border-slate-200 dark:border-slate-700";
}

export function AGIRoadmapView({ lang = "en" }: AGIRoadmapViewProps) {
  const [hoveredPhase, setHoveredPhase] = useState<string | null>(null);
  const t = translations[lang];

  return (
    <div className="my-6 rounded-lg border border-border/60 bg-muted/30 p-6">
      <div className="mb-6">
        <h3 className="text-base font-semibold text-foreground">{t.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {/* Timeline visualization */}
      <div className="space-y-4">
        {PHASES.map((phase, index) => {
          const isHovered = hoveredPhase === phase.id;
          const isLast = index === PHASES.length - 1;

          return (
            <div
              key={phase.id}
              className={`relative rounded-lg border-2 p-4 transition-all duration-300 ${getStatusBorder(phase.status)} ${
                isHovered ? "scale-[1.02] bg-background/80" : "bg-background/50 hover:bg-background/70"
              }`}
              onMouseEnter={() => setHoveredPhase(phase.id)}
              onMouseLeave={() => setHoveredPhase(null)}
            >
              {/* Status indicator */}
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border-2 border-background shadow-md flex items-center justify-center text-xs">
                <span className={`${getStatusColor(phase.status)} rounded-full w-4 h-4`} />
              </div>

              {/* Connecting line */}
              {!isLast && (
                <div className="absolute left-0 top-12 h-10 w-0.5 bg-gradient-to-b from-slate-300 to-slate-200 dark:from-slate-600 dark:to-slate-700" />
              )}

              {/* Content */}
              <div className="flex items-start gap-4">
                <span className="text-3xl">{phase.icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted">
                      {phase.period}
                    </span>
                    <span className={`text-xs font-medium ${
                      phase.status === "current" ? "text-brand-foreground" :
                      phase.status === "past" ? "text-success-foreground" :
                      "text-slate-500 dark:text-slate-400"
                    }`}>
                      {getPhaseLabel(phase.status, lang)}
                    </span>
                  </div>

                  <h4 className="font-semibold text-foreground mb-1">{phase.technology}</h4>
                  <p className="text-sm text-muted-foreground">{phase.description}</p>

                  {/* Arrow to next phase */}
                  {!isLast && isHovered && (
                    <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                      <span>→ {PHASES[index + 1].technology}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-success" />
          {t.statusPast}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" />
          {t.statusCurrent}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          {t.statusFuture}
        </span>
      </div>
    </div>
  );
}