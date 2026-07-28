import { useState } from "react";
import { PRICING_DATA } from "./data/pricing";
import { I18N, type Lang } from "./i18n";

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/40 p-0.5">
      <button
        onClick={() => onChange("zh")}
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${lang === "zh" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
      >
        中文
      </button>
      <button
        onClick={() => onChange("en")}
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${lang === "en" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
      >
        EN
      </button>
    </div>
  );
}

const EXCHANGE_RATE = 6.78;

function formatPrice(price: number, isOverseas: boolean, lang: Lang): string {
  if (lang === "en") {
    const usd = isOverseas ? price : price / EXCHANGE_RATE;
    if (usd < 0.1) return `$${usd.toFixed(3)}`;
    if (usd < 10) return `$${usd.toFixed(2)}`;
    if (usd < 100) return `$${usd.toFixed(1)}`;
    return `$${Math.round(usd)}`;
  }
  const rmb = isOverseas ? price * EXCHANGE_RATE : price;
  if (rmb < 10) return `¥${rmb.toFixed(1)}`;
  if (rmb < 100) return `¥${rmb.toFixed(1)}`;
  return `¥${Math.round(rmb)}`;
}

type PricingMode = "output" | "input";

export function PricingView() {
  const [lang, setLang] = useState<Lang>("en");
  const t = I18N[lang];
  const isZh = lang === "zh";
  const [mode, setMode] = useState<PricingMode>("output");

  const allModels = PRICING_DATA.flatMap((vendor) =>
    vendor.models.map((m) => ({
      ...m,
      vendorZh: vendor.vendorZh,
      vendorEn: vendor.vendorEn,
      color: vendor.color,
      region: vendor.region,
    })),
  );

  const toDisplay = (price: number, isOvs: boolean) => {
    if (lang === "en") return isOvs ? price : price / EXCHANGE_RATE;
    return isOvs ? price * EXCHANGE_RATE : price;
  };

  const pricedModels = allModels.filter((m) => m.input > 0 && m.output > 0);
  const sorted = [...pricedModels].sort((a, b) => {
    const isA = a.region === "overseas";
    const isB = b.region === "overseas";
    const pa = toDisplay(mode === "output" ? a.output : a.input, isA);
    const pb = toDisplay(mode === "output" ? b.output : b.input, isB);
    return pb - pa;
  });

  const prices = sorted.map((m) =>
    toDisplay(mode === "output" ? m.output : m.input, m.region === "overseas"),
  );
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const logMin = Math.log(minP);
  const logMax = Math.log(maxP);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <LangToggle lang={lang} onChange={setLang} />
      </div>
      {/* Mode toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-border/60 bg-muted/40 p-0.5">
          <button
            onClick={() => setMode("output")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              mode === "output"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isZh ? "输出" : "Output"}
          </button>
          <button
            onClick={() => setMode("input")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              mode === "input"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isZh ? "输入" : "Input"}
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {t.pricingSubtitle.replace("{rate}", EXCHANGE_RATE.toFixed(2))}
        </span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3.5">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="h-3 w-3 rounded-sm" style={{ background: "#5B8FF9" }} />
          {t.legendDomestic.replace("{rate}", EXCHANGE_RATE.toFixed(2))}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span
            className="h-3 w-3 rounded-sm border-2 border-dashed"
            style={{ borderColor: "#10A37F", background: "rgba(16,163,127,0.15)" }}
          />
          {t.legendOverseas.replace("{rate}", EXCHANGE_RATE.toFixed(2))}
        </div>
      </div>

      {/* Bar chart */}
      <div className="space-y-1">
        {sorted.map((m, i) => {
          const isOverseas = m.region === "overseas";
          const price = mode === "output" ? m.output : m.input;
          const displayPrice = toDisplay(price, isOverseas);
          const pct = ((Math.log(displayPrice) - logMin) / (logMax - logMin)) * 92 + 8;
          const vendorName = isZh ? m.vendorZh : m.vendorEn;
          const modelName = isZh ? m.nameZh : m.nameEn;
          const tierName = isZh ? m.tierZh : m.tierEn;
          const priceLabel = formatPrice(price, isOverseas, lang);

          return (
            <div
              key={`${vendorName}-${modelName}`}
              className="flex items-center gap-2"
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              <div className="flex w-[200px] shrink-0 items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="truncate">
                  {vendorName} {modelName}
                  <span className="ml-1 rounded px-1 py-0.5 text-[8px] font-semibold bg-muted text-muted-foreground">
                    {isOverseas ? (isZh ? "海外" : "OS") : isZh ? "国内" : "CN"}
                  </span>
                </span>
              </div>
              <div className="relative h-7 flex-1 overflow-hidden rounded">
                <div
                  className="flex h-full items-center justify-end rounded pr-2 text-[10px] font-bold text-white"
                  style={{
                    width: `${pct}%`,
                    background: isOverseas
                      ? `repeating-linear-gradient(45deg, ${m.color}, ${m.color} 4px, ${m.color}cc 4px, ${m.color}cc 8px)`
                      : m.color,
                  }}
                >
                  {priceLabel}
                </div>
              </div>
              <div className="w-12 shrink-0 text-right text-[10px] text-muted-foreground">
                {tierName}
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                {isZh ? "厂商" : "Vendor"}
              </th>
              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                {isZh ? "模型" : "Model"}
              </th>
              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                {isZh ? "地区" : "Region"}
              </th>
              <th className="px-2 py-1.5 text-right font-semibold text-muted-foreground">
                {isZh ? `输入 (元/M)` : "Input (USD/M)"}
              </th>
              <th className="px-2 py-1.5 text-right font-semibold text-muted-foreground">
                {isZh ? `输出 (元/M)` : "Output (USD/M)"}
              </th>
              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                {isZh ? "上下文" : "Context"}
              </th>
              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                {isZh ? "档次" : "Tier"}
              </th>
              <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">
                {isZh ? "来源" : "Source"}
              </th>
            </tr>
          </thead>
          <tbody>
            {allModels.map((m, i) => {
              const isOvs = m.region === "overseas";
              const vn = isZh ? m.vendorZh : m.vendorEn;
              const mn = isZh ? m.nameZh : m.nameEn;
              const tn = isZh ? m.tierZh : m.tierEn;
              const rl = isOvs ? (isZh ? "海外" : "Overseas") : isZh ? "国内" : "Domestic";
              const ip = m.input > 0 ? formatPrice(m.input, isOvs, lang) : "—";
              const op = m.output > 0 ? formatPrice(m.output, isOvs, lang) : "—";
              return (
                <tr key={i} className="border-b border-border/20 hover:bg-muted/20">
                  <td className="px-2 py-1.5 font-semibold" style={{ color: m.color }}>
                    {vn}
                  </td>
                  <td className="px-2 py-1.5">{mn}</td>
                  <td className="px-2 py-1.5">{rl}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{ip}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{op}</td>
                  <td className="px-2 py-1.5">{m.context}</td>
                  <td className="px-2 py-1.5">{tn}</td>
                  <td className="px-2 py-1.5">
                    <a
                      href={m.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {m.sourceName}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sources */}
      <div className="text-[11px] leading-relaxed text-muted-foreground/70">
        <div className="mb-1 font-semibold text-muted-foreground">
          {isZh ? "数据来源（均已验证）" : "Data Sources (All Verified)"}
        </div>
        <div className="mb-2">
          <strong className="text-green-600">{isZh ? "国内厂商" : "Domestic"}</strong>
          {isZh ? "（官方定价页面）" : " (official pricing pages)"}:
          <br />
          DeepSeek · Zhipu AI · Kimi · Xiaomi MiMo · MiniMax · Qwen · Tencent Hunyuan · ByteDance
          Doubao
        </div>
        <div className="mb-2">
          <strong className="text-amber-700">{isZh ? "海外厂商" : "Overseas"}</strong>
          {isZh
            ? `（官方定价页面，USD→RMB 1:${EXCHANGE_RATE.toFixed(2)}）`
            : ` (official pricing pages, USD)`}
          :
          <br />
          OpenAI · Anthropic · Google Gemini · xAI Grok
        </div>
      </div>
    </div>
  );
}
