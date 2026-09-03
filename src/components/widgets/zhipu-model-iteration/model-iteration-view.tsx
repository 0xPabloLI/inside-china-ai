import { MODELS, TIMELINE } from "./data/models";

const translations = {
  title: "GLM Model Iteration",
  subtitle: `${TIMELINE.iterations} — ${TIMELINE.indexClimb}, ${TIMELINE.costDrop}`,
  columns: {
    model: "Model",
    params: "Parameters",
    cost: "Cost / Task",
    change: "Key Change",
  },
  params: {
    same: "same as predecessor",
    tbd: "not disclosed",
  },
  legend: {
    next: "Next generation",
  },
  source: "Source: Zhipu AI 2026 H1 earnings call, Sep 2, 2026.",
};

export function ZhipuModelIterationView() {
  const t = translations;
  return (
    <>
      <div className="mb-5">
        <h3 className="text-base font-semibold text-foreground">{t.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left font-medium text-muted-foreground">{t.columns.model}</th>
              <th className="py-2 pr-3 text-left font-medium text-muted-foreground">{t.columns.params}</th>
              <th className="py-2 pr-3 text-left font-medium text-muted-foreground">{t.columns.cost}</th>
              <th className="py-2 text-left font-medium text-muted-foreground">{t.columns.change}</th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((m) => {
              const isNext = m.status === "next";
              return (
                <tr
                  key={m.model}
                  className={`border-b border-border/50 ${isNext ? "bg-brand-muted" : ""}`}
                >
                  <td className="py-2.5 pr-3 font-medium text-foreground">
                    {m.model}
                    {isNext && (
                      <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-xs font-medium text-brand-foreground">
                        NEXT
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {m.paramsMode === "same" && (
                      <span className="italic">{t.params.same}</span>
                    )}
                    {m.paramsMode === "tbd" && t.params.tbd}
                    {m.paramsMode === "value" && (
                      <>
                        <span className="font-medium text-foreground">{m.totalParams}</span>
                        <span className="block text-xs">{m.activeParams} active</span>
                      </>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-foreground">
                    {m.costPerTask ?? <span className="text-muted-foreground">{t.params.tbd}</span>}
                  </td>
                  <td className="py-2.5 text-muted-foreground">{m.keyChange}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-brand-muted" />
          {t.legend.next}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground italic">{t.source}</p>
    </>
  );
}
