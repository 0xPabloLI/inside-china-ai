import { useState } from "react";
import { FUNDING_ROUNDS, INVESTOR_DATA, type FundingStatus } from "./funding";
import { I18N, type Lang } from "./i18n";

const STATUS_MAP: Record<FundingStatus, { zh: string; en: string; cls: string }> = {
  "self-funded": { zh: "自筹", en: "Self-funded", cls: "bg-muted text-muted-foreground" },
  target: { zh: "目标", en: "Target", cls: "bg-blue-500/10 text-blue-600" },
  completed: { zh: "已完成", en: "Closed", cls: "bg-green-500/10 text-green-600" },
  paused: { zh: "暂停", en: "Paused", cls: "bg-yellow-500/10 text-yellow-700" },
};

const MAX_VAL = 71;

export function FundingView({ lang }: { lang: Lang }) {
  const t = I18N[lang];
  const isZh = lang === "zh";
  const [selectedRound, setSelectedRound] = useState<number | null>(3); // default to the completed round

  const summaryCards = isZh
    ? [
        { val: "~$7.4B", label: "首轮融资金额" },
        { val: "~$50B", label: "投后估值（唯一实际）" },
        { val: "10", label: "直接参与方（穿透~100）" },
        { val: "纯 RMB", label: "融资结构" },
      ]
    : [
        { val: "~$7.4B", label: "First Round Amount" },
        { val: "~$50B", label: "Post-money (only actual)" },
        { val: "10", label: "Direct (~100 through LPs)" },
        { val: "Pure RMB", label: "Structure" },
      ];

  // Donut chart segments
  const totalRMB = 50;
  let cumPct = 0;
  const segments: string[] = [];
  INVESTOR_DATA.forEach((inv) => {
    const amt = inv.amount || 0;
    const pct = (amt / totalRMB) * 100;
    if (pct > 0) {
      segments.push(`${inv.color} ${cumPct}% ${cumPct + pct}%`);
      cumPct += pct;
    }
  });
  if (cumPct < 100) {
    segments.push(`#D5DBE6 ${cumPct}% 100%`);
  }

  const legends = isZh
    ? [
        { cls: "target", label: "目标估值" },
        { cls: "actual", label: "实际成交" },
        { cls: "paused", label: "已暂停" },
      ]
    : [
        { cls: "target", label: "Target Valuation" },
        { cls: "actual", label: "Actual (Closed)" },
        { cls: "paused", label: "Paused" },
      ];

  const selected = selectedRound !== null ? FUNDING_ROUNDS[selectedRound] : null;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="flex flex-wrap gap-2.5">
        {summaryCards.map((c, i) => (
          <div
            key={i}
            className="flex-1 min-w-[120px] rounded-lg border border-border/60 bg-muted/30 px-3.5 py-3 text-center"
          >
            <div className="text-lg font-bold text-foreground">{c.val}</div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {/* Investor donut + legend */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-foreground/80">
          <span className="h-2 w-2 rounded-sm bg-primary" />
          {isZh ? "首轮投资方明细" : "Round 1 Investors"}
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
            <div
              className="h-full w-full rounded-full"
              style={{ background: `conic-gradient(${segments.join(", ")})` }}
            />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[90px] w-[90px] rounded-full bg-card" />
          </div>
          <div className="flex-1 min-w-[280px] space-y-1.5">
            {INVESTOR_DATA.map((inv) => {
              const name = isZh ? inv.nameZh : inv.nameEn;
              const amtStr =
                inv.amount != null
                  ? isZh
                    ? `${inv.amount} 亿 RMB`
                    : `${inv.amount}B RMB`
                  : isZh
                    ? "未披露"
                    : "Undisclosed";
              return (
                <div
                  key={inv.nameEn}
                  className="flex items-center gap-1.5"
                  title={isZh ? inv.noteZh : inv.noteEn}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: inv.color }}
                  />
                  <span className="flex-1 text-[11px] font-semibold text-foreground/80">
                    {name}
                  </span>
                  <span className="text-[11px] font-bold text-foreground whitespace-nowrap">
                    {amtStr}
                  </span>
                </div>
              );
            })}
            <div className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-[10px] text-muted-foreground">
              ⚠ <strong>{isZh ? "高瓴/红杉缺席" : "Hillhouse/HSG absent"}</strong>:{" "}
              {isZh
                ? "两家原被认为不可能缺席的机构最终均未参与"
                : "Two institutions considered impossible to exclude both ended up absent"}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline bars */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-foreground/80">
          <span className="h-2 w-2 rounded-sm bg-primary" />
          {isZh ? "融资时间线" : "Funding Timeline"}
        </div>

        {/* Legend */}
        <div className="mb-3 flex flex-wrap gap-3.5">
          {legends.map((l) => (
            <div key={l.cls} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span
                className={`h-3 w-3 rounded-sm ${
                  l.cls === "target"
                    ? "border-2 border-blue-500 bg-blue-500/20"
                    : l.cls === "actual"
                      ? "bg-green-500"
                      : "border-2 border-yellow-500 bg-yellow-500/20"
                }`}
              />
              {l.label}
            </div>
          ))}
        </div>

        {/* Valuation bars */}
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {isZh ? "估值（$B）" : "Valuation ($B)"}
        </div>
        <div
          className="flex items-end gap-2.5 border-b border-border/40 pb-1"
          style={{ height: 200 }}
        >
          {FUNDING_ROUNDS.map((r, i) => {
            const hasVal = r.valuation != null;
            const barH = hasVal ? Math.max(4, (r.valuation! / MAX_VAL) * 170) : 4;
            const valCls =
              r.status === "completed"
                ? "actual"
                : r.status === "paused"
                  ? "paused"
                  : hasVal
                    ? "target"
                    : "empty";
            const st = STATUS_MAP[r.status];
            const valText = hasVal ? `$${r.valuation}B` : isZh ? "无" : "N/A";
            const valPrefix =
              r.status === "completed"
                ? isZh
                  ? "投后 "
                  : "PM "
                : r.status === "paused"
                  ? isZh
                    ? "目标 "
                    : "Tgt "
                  : hasVal
                    ? isZh
                      ? "目标 "
                      : "Tgt "
                    : "";
            return (
              <button
                key={i}
                onClick={() => setSelectedRound(selectedRound === i ? null : i)}
                className="flex h-full flex-1 flex-col items-center justify-end"
              >
                <div
                  className={`text-[11px] font-bold whitespace-nowrap ${
                    valCls === "actual"
                      ? "text-green-600"
                      : valCls === "target"
                        ? "text-blue-600"
                        : valCls === "paused"
                          ? "text-yellow-700"
                          : "text-muted-foreground"
                  }`}
                >
                  {hasVal ? valPrefix + valText : valText}
                </div>
                <div
                  className={`w-full max-w-[56px] rounded-t ${
                    valCls === "actual"
                      ? "bg-gradient-to-t from-green-500 to-green-400"
                      : valCls === "target"
                        ? "border-2 border-blue-500 bg-blue-500/20 border-b-0"
                        : valCls === "paused"
                          ? "border-2 border-yellow-500 bg-yellow-500/20 border-b-0"
                          : "border border-dashed border-border/40 border-b-0"
                  }`}
                  style={{ height: barH }}
                />
                <div className="mt-1.5 text-center">
                  <div className="text-[10px] font-bold text-foreground/80">{r.date}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Event labels */}
        <div className="flex gap-2.5 mt-1">
          {FUNDING_ROUNDS.map((r, i) => {
            const event = isZh ? r.eventZh : r.eventEn;
            const st = STATUS_MAP[r.status];
            return (
              <div key={i} className="flex-1 text-center min-w-0">
                <div className="text-[9px] text-muted-foreground leading-tight max-w-[80px] mx-auto">
                  {event}
                </div>
                <span
                  className={`mt-0.5 inline-block rounded px-1 py-0.5 text-[8px] font-bold ${st.cls}`}
                >
                  {isZh ? st.zh : st.en}
                </span>
              </div>
            );
          })}
        </div>

        {/* Selected round detail */}
        {selected && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <div className="flex items-center gap-2 mb-1">
              <strong className="text-foreground">
                {selected.date} · {isZh ? selected.eventZh : selected.eventEn}
              </strong>
              <span
                className={`rounded px-1 py-0.5 text-[8px] font-bold ${STATUS_MAP[selected.status].cls}`}
              >
                {isZh ? STATUS_MAP[selected.status].zh : STATUS_MAP[selected.status].en}
              </span>
            </div>
            <p>{isZh ? selected.detailZh : selected.detailEn}</p>
            <div className="mt-1 text-[10px] text-muted-foreground/70">
              <strong>{isZh ? "投资方：" : "Investors: "}</strong>
              {(isZh ? selected.investors : selected.investorsEn).join(isZh ? "、" : ", ")}
            </div>
            <div className="mt-1 text-[10px]">
              <a
                href={selected.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {isZh ? "来源" : "Source"}: {isZh ? selected.sourceZh : selected.sourceEn} ↗
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Sources */}
      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
        <div className="space-y-0.5 text-[10px] leading-relaxed text-muted-foreground/70">
          {t.fundingSourceList.map((s, i) => (
            <div key={i}>{s}</div>
          ))}
        </div>
        <div className="mt-2 border-t border-border/40 pt-2 text-[9px] leading-relaxed text-muted-foreground/60">
          {t.fundingDisclaimer}
        </div>
      </div>
    </div>
  );
}
