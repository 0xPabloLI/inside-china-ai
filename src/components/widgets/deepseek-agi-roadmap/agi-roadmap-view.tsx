import { PHASES, type RoadmapPhase } from "./data/phases";
import { useHoverPin } from "../shared/use-hover-pin";

const translations = {
  title: "DeepSeek's AGI Roadmap",
  subtitle: "Each phase builds on the last. Current focus: Agents",
  whatItSolved: "What It Solved",
  whatsNext: "What's Next",
  statusPast: "Completed",
  statusCurrent: "Current Focus",
  statusFuture: "Upcoming",
};

function getPhaseLabel(status: RoadmapPhase["status"]): string {
  if (status === "past") return translations.statusPast;
  if (status === "current") return translations.statusCurrent;
  return translations.statusFuture;
}

function getStatusColor(status: RoadmapPhase["status"]): string {
  if (status === "past") return "bg-success";
  if (status === "current") return "bg-brand";
  return "bg-muted-foreground/40";
}

function getStatusBorder(status: RoadmapPhase["status"]): string {
  if (status === "past") return "border-success-muted";
  if (status === "current") return "border-brand shadow-lg shadow-brand/10";
  return "border-border/60";
}

export function AGIRoadmapView() {
  // Hover/focus reveal + click-to-pin (keyboard equivalent): focusing a
  // phase card highlights it and reveals the "next phase" arrow.
  const pin = useHoverPin<string>();
  const t = translations;

  return (
    <>
      <div className="mb-6">
        <h3 className="text-base font-semibold text-foreground">{t.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {/* Timeline visualization */}
      <div className="space-y-4">
        {PHASES.map((phase, index) => {
          const isActive = pin.isActive(phase.id);
          const isLast = index === PHASES.length - 1;

          return (
            <button
              type="button"
              key={phase.id}
              aria-expanded={isActive}
              className={`relative block w-full rounded-lg border-2 p-4 text-left transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${getStatusBorder(phase.status)} ${
                isActive
                  ? "scale-[1.02] bg-background/80"
                  : "bg-background/50 hover:bg-background/70"
              }`}
              onMouseEnter={() => pin.onEnter(phase.id)}
              onMouseLeave={pin.onLeave}
              onFocus={() => pin.onFocus(phase.id)}
              onBlur={pin.onBlur}
              onClick={() => pin.onToggle(phase.id)}
            >
              {/* Status indicator */}
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border-2 border-background shadow-md flex items-center justify-center text-xs">
                <span className={`${getStatusColor(phase.status)} rounded-full w-4 h-4`} />
              </div>

              {/* Connecting line */}
              {!isLast && (
                <div className="absolute left-0 top-12 h-10 w-0.5 bg-gradient-to-b from-border to-border/60" />
              )}

              {/* Content */}
              <div className="flex items-start gap-4">
                <span className="text-3xl">{phase.icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted">
                      {phase.period}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        phase.status === "current"
                          ? "text-brand-foreground"
                          : phase.status === "past"
                            ? "text-success-foreground"
                            : "text-muted-foreground"
                      }`}
                    >
                      {getPhaseLabel(phase.status)}
                    </span>
                  </div>

                  <h4 className="font-semibold text-foreground mb-1">{phase.technology}</h4>
                  <p className="text-sm text-muted-foreground">{phase.description}</p>

                  {/* Arrow to next phase */}
                  {!isLast && isActive && (
                    <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                      <span>→ {PHASES[index + 1].technology}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
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
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
          {t.statusFuture}
        </span>
      </div>
    </>
  );
}
