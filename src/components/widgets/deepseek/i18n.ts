export type Lang = "en" | "zh";

export interface I18NTexts {
  sectionPeople: string;
  sectionCompanies: string;
  departLabel: string;
  salaryLabel: string;
  salaryConfirmed: string;
  salaryRumored: string;
  infoBoxTitle: string;
  infoBoxItems: { highlight: string; text: string }[];
  sourceText: string;
  disclaimer: string;
  companiesSource: string;
  companiesDisclaimer: string;
  tcLabelFlow: string;
  tcLabelRole: string;
  tcLabelSalary: string;
  // Funding
  fundingDetailTitle: string;
  fundingSourceList: string[];
  fundingDisclaimer: string;
  // Pricing
  pricingSubtitle: string;
  legendDomestic: string;
  legendOverseas: string;
  // Tab labels
  tabCloud: string;
  tabTalent: string;
  tabCompanies: string;
  tabPricing: string;
  tabFunding: string;
}

export const I18N: Record<Lang, I18NTexts> = {
  en: {
    sectionPeople: "Key R&D Personnel Movements (Public Reports)",
    sectionCompanies: "Companies Mentioned & Remarks",
    departLabel: "Left",
    salaryLabel: "Salary",
    salaryConfirmed: "Confirmed",
    salaryRumored: "Rumored",
    infoBoxTitle: "Key Background",
    infoBoxItems: [
      {
        highlight: "Zero External Funding",
        text: ": DeepSeek refused all external investment, solely funded by parent company High-Flyer Quant's profits",
      },
      {
        highlight: "Salary Gap",
        text: ": Competitors offer 2-3x DeepSeek's compensation, some with 8-figure total packages",
      },
      {
        highlight: "Equity Issues",
        text: ": Employee stock options lack valuation support, near-zero liquidity",
      },
      {
        highlight: "Four Tech Lines Hit",
        text: ": Five departures drained base model, reasoning, OCR, and multimodal teams",
      },
      {
        highlight: "First Fundraising",
        text: ": DeepSeek is conducting its first external round (~70B RMB), primarily to retain employees",
      },
      {
        highlight: "Industry Context",
        text: ": China's AI talent gap exceeds 5.8M, core tech roles gap exceeds 800K",
      },
    ],
    sourceText:
      'Sources: NetEase/iHeima "DeepSeek V4 Technical Report Reveals Departure List" (2026-04-28) · 36kr reports (2026-06) · "AI Industry Talent Development Report (2025-2026)"',
    disclaimer:
      'Disclaimer: Information compiled from public media reports. V4 report marks 10 as "departed"; public reports name only 5 core members. Wei Haoran\'s move to "Baidu (suspected)" is inferred from a 36kr report.',
    companiesSource:
      "Source: Liang Wenfeng Investor Meeting transcript (compiled 2026-07-16) · Total duration ~3h44m",
    companiesDisclaimer:
      "Disclaimer: All quotes are transcribed from audio. Some proper nouns and numbers may have recognition errors. Tone tags are labeled by the compiler for reference only.",
    tcLabelFlow: "Destination",
    tcLabelRole: "DeepSeek Role",
    tcLabelSalary: "Salary",
    fundingDetailTitle: "Funding Details",
    fundingSourceList: [
      "elsewhere — The DeepSeek Financing Story (2026-06-17): elsewhere.news/en/elsewhere/deepseek",
      "elsewhere — Wenfeng Liang Investor Meeting Transcript (2026-07-22): elsewhere.news/en/elsewhere/wenfeng-liangs-four-hour-investor-meeting-full-transcript",
      "Bloomberg — Funding Pause Report (2026-07-25): bloomberg.com · Haze Fan & Pei Li",
      "Financial Times — Round 2 Valuation (2026-07-14): ft.com",
      "The Information — First Round Report (2026-04-17): theinformation.com",
      "The Silicon Review — $45B Valuation (2026-05-07): thesiliconreview.com",
      "TechStartups — $7.4B at $50B valuation (2026-06-16): techstartups.com",
      "Cryptonomist — Round 2 Report (2026-07-14): en.cryptonomist.ch",
      "Wikipedia — DeepSeek / High-Flyer: en.wikipedia.org/wiki/DeepSeek",
    ],
    fundingDisclaimer:
      "Disclaimer: Timeline, investor list, and pure RMB structure verified by elsewhere. Total amount ($7.4B) and valuation ($50B) from English tech media TechStartups (not a major outlet; may be derived from 50B RMB conversion), elsewhere did not disclose specific totals. July 25 funding pause reported by Bloomberg (Haze Fan & Pei Li; syndicated via Fortune, etc.), caused by leaked investor meeting remarks going viral. $71B round 2 target from FT/Cryptonomist. ~100 institutions is an elsewhere estimate. Hillhouse/HSG absence confirmed by multiple sources.",
    pricingSubtitle:
      "Unit: USD / Million Tokens (cache miss) · RMB converted at 1 USD = {rate} RMB · July 2026",
    legendDomestic: "Domestic (RMB→USD, 1:{rate})",
    legendOverseas: "Overseas (USD)",
    tabCloud: "Cloud",
    tabTalent: "Talent",
    tabCompanies: "Companies",
    tabPricing: "Pricing",
    tabFunding: "Funding",
  },
  zh: {
    sectionPeople: "部分核心研发人员流动（公开报道）",
    sectionCompanies: "被提及的公司及评论",
    departLabel: "离职",
    salaryLabel: "薪酬",
    salaryConfirmed: "已确认",
    salaryRumored: "传闻",
    infoBoxTitle: "关键背景",
    infoBoxItems: [
      {
        highlight: "零外部融资",
        text: "：DeepSeek 坚持不融资，完全依托母公司幻方量化的自有利润独立供血",
      },
      { highlight: "薪酬差距", text: "：竞争对手薪酬为 DeepSeek 的 2-3 倍，部分给出八位数总包" },
      { highlight: "期权困境", text: "：员工期权缺乏估值支撑，流通性几乎为零" },
      {
        highlight: "四条主线受损",
        text: "：五位核心成员离职抽走了基座模型、推理、OCR、多模态四条主线",
      },
      {
        highlight: "首次融资",
        text: "：DeepSeek 正进行首次对外融资（约 700 亿），主要目的为留住员工",
      },
      { highlight: "行业背景", text: "：中国 AI 人才缺口超 580 万人，核心技术岗缺口超 80 万人" },
    ],
    sourceText:
      "数据来源：网易/i黑马《DeepSeek V4技术报告现离职名单》(2026-04-28) · 36氪相关报道 (2026-06) · 《人工智能产业人才发展报告（2025至2026）》",
    disclaimer:
      '免责声明：本页信息基于公开媒体报道整理。V4 技术报告标注 10 人"已离职"，公开报道仅点名 5 位核心成员。魏浩然去向"百度（疑似）"基于 36氪报道推断。年龄信息除罗福莉外均为传闻。',
    companiesSource:
      "数据来源：梁文锋投资者交流会录音文字稿（2026-07-16 整理）· 总时长约 3 小时 44 分钟",
    companiesDisclaimer:
      "免责声明：本页所有引述均摘自录音转写文本，个别专有名词与数字可能存在识别误差。评论语气标签为整理者标注，仅供参考。",
    tcLabelFlow: "去向",
    tcLabelRole: "DeepSeek 角色",
    tcLabelSalary: "薪酬",
    fundingDetailTitle: "融资详情",
    fundingSourceList: [
      "elsewhere别处发生 — DeepSeek 融资故事 (2026-06-17): elsewhere.news/en/elsewhere/deepseek",
      "elsewhere别处发生 — 梁文锋投资者交流会实录 (2026-07-22): elsewhere.news/en/elsewhere/wenfeng-liangs-four-hour-investor-meeting-full-transcript",
      "Bloomberg — 融资暂停报道 (2026-07-25): bloomberg.com · Haze Fan & Pei Li",
      "Financial Times — 二轮估值报道 (2026-07-14): ft.com",
      "The Information — 首轮融资报道 (2026-04-17): theinformation.com",
      "The Silicon Review — $450 亿估值 (2026-05-07): thesiliconreview.com",
      "TechStartups — $7.4B at $50B valuation (2026-06-16): techstartups.com",
      "Cryptonomist — 二轮融资报道 (2026-07-14): en.cryptonomist.ch",
      "Wikipedia — DeepSeek / High-Flyer 词条: en.wikipedia.org/wiki/DeepSeek",
    ],
    fundingDisclaimer:
      "免责声明：融资时间线、投资方名单、纯人民币结构由 elsewhere 别处发生验证。融资金额（$7.4B）和估值（$50B）来自英文科技媒体 TechStartups（非大媒体，信服力有限，可能由 500 亿 RMB 换算得出），elsewhere 未披露具体总额。7 月 25 日融资暂停来自 Bloomberg（Haze Fan & Pei Li，Fortune 等转载），原因为梁文锋投资者交流会言论泄露并病毒传播。$71B 二轮目标来自 FT/Cryptonomist。~100 家机构为 elsewhere 估算值。高瓴/红杉缺席经多方确认。",
    pricingSubtitle:
      "单位：元 / 百万 Tokens（缓存未命中） · 海外按 1 USD = {rate} RMB 换算 · 2026 年 7 月",
    legendDomestic: "国内厂商 (RMB)",
    legendOverseas: "海外厂商 (USD→RMB, 1:{rate})",
    tabCloud: "词云",
    tabTalent: "人才",
    tabCompanies: "公司",
    tabPricing: "定价",
    tabFunding: "融资",
  },
};
