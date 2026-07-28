export type FundingStatus = "self-funded" | "target" | "completed" | "paused";

export interface FundingRound {
  date: string;
  status: FundingStatus;
  eventZh: string;
  eventEn: string;
  amount: number | null;
  amountNoteZh: string;
  amountNoteEn: string;
  valuation: number | null;
  valuationNoteZh: string;
  valuationNoteEn: string;
  investors: string[];
  investorsEn: string[];
  detailZh: string;
  detailEn: string;
  sourceZh: string;
  sourceEn: string;
  sourceUrl: string;
  color: string;
}

export interface InvestorData {
  nameZh: string;
  nameEn: string;
  amount: number | null;
  color: string;
  noteZh: string;
  noteEn: string;
}

export const FUNDING_ROUNDS: FundingRound[] = [
  {
    date: "2023.07",
    status: "self-funded",
    eventZh: "DeepSeek 成立",
    eventEn: "DeepSeek Founded",
    amount: null,
    amountNoteZh: "幻方量化全资孵化",
    amountNoteEn: "Fully funded by High-Flyer",
    valuation: null,
    valuationNoteZh: "无外部估值",
    valuationNoteEn: "No external valuation",
    investors: ["High-Flyer / 幻方量化"],
    investorsEn: ["High-Flyer Quant"],
    detailZh: "梁文锋创立 DeepSeek，由幻方量化（High-Flyer）全资孵化，无外部融资。",
    detailEn:
      "Liang Wenfeng founded DeepSeek, fully backed by High-Flyer Quant. No external funding.",
    sourceZh: "Wikipedia — DeepSeek 词条",
    sourceEn: "Wikipedia — DeepSeek",
    sourceUrl: "https://en.wikipedia.org/wiki/DeepSeek",
    color: "#888888",
  },
  {
    date: "2026.04",
    status: "target",
    eventZh: "正式启动外部融资",
    eventEn: "Fundraising Launched",
    amount: null,
    amountNoteZh: "纯人民币结构",
    amountNoteEn: "Pure RMB structure",
    valuation: 10,
    valuationNoteZh: "目标 ~$100 亿",
    valuationNoteEn: "Target ~$10B",
    investors: ["白名单机构 / Whitelist funds"],
    investorsEn: ["Whitelist funds"],
    detailZh:
      "DeepSeek 正式启动外部融资，采用纯人民币结构。初始最低承诺 50 亿元/基金，后降至 15 亿元。设「基金白名单」，要求机构有真实资金实力和品牌。The Information 4 月 17 日报道目标估值约 $100 亿。",
    detailEn:
      "DeepSeek formally launched external fundraising with a pure RMB structure. Initial minimum commitment was 5B RMB per fund, later lowered to 1.5B. A 'fund whitelist' required institutions with real capital capacity and strong brands. The Information reported a target valuation of ~$10B on April 17.",
    sourceZh: "elsewhere别处发生 + The Information",
    sourceEn: "elsewhere + The Information",
    sourceUrl: "https://elsewhere.news/en/elsewhere/deepseek",
    color: "#5B8FF9",
  },
  {
    date: "2026.05",
    status: "target",
    eventZh: "估值跳跃 + 四小时投资者交流会",
    eventEn: "Valuation Jump + 4-Hour Investor Meeting",
    amount: null,
    amountNoteZh: "腾讯会议·4小时",
    amountNoteEn: "Tencent Meeting·4hrs",
    valuation: 45,
    valuationNoteZh: "目标 ~$450 亿",
    valuationNoteEn: "Target ~$45B",
    investors: ["已确认投资方 / Confirmed investors"],
    investorsEn: ["Confirmed investors"],
    detailZh:
      "5 月初估值目标从 $100 亿跃升至 $450 亿（The Silicon Review 5 月 7 日报道）。5 月中旬，DeepSeek 通过腾讯会议组织传奇的「四小时投资者交流会」。梁文锋先发言，随后问答环节。投资方阵容已基本确定，每家两个名额。梁文锋强调：团队稳定性是核心优先级，比钱和资源更重要。",
    detailEn:
      "Valuation target jumped from $10B to $45B in early May (The Silicon Review, May 7). In mid-May, DeepSeek held the legendary 'four-hour investor meeting' via Tencent Meeting. Liang spoke first, then Q&A. The investor lineup was mostly set, with two slots per firm. Liang emphasized: team stability is the core priority, more important than money or resources.",
    sourceZh: "elsewhere别处发生 + The Silicon Review",
    sourceEn: "elsewhere + The Silicon Review",
    sourceUrl:
      "https://elsewhere.news/en/elsewhere/wenfeng-liangs-four-hour-investor-meeting-full-transcript",
    color: "#A0C4E8",
  },
  {
    date: "2026.06",
    status: "completed",
    eventZh: "首轮外部融资完成",
    eventEn: "First External Round Closed",
    amount: 7.4,
    amountNoteZh: "~$74 亿（约 500 亿元 RMB，英文媒体报道）",
    amountNoteEn: "~$7.4B (~50B RMB, English media)",
    valuation: 50,
    valuationNoteZh: "投后 ~$500 亿（英文媒体报道）",
    valuationNoteEn: "Post-money ~$50B (English media)",
    investors: [
      "Monolith 砺思资本（30 亿 RMB）",
      "IDG Capital（30 亿 RMB）",
      "宁德时代/CATL 生态（普泉资本）",
      "厚朴投资 Loyal Valley Capital",
      "国智投资（9.8 亿 RMB）",
      "约 100 家机构/个人",
    ],
    investorsEn: [
      "Monolith (3B RMB)",
      "IDG Capital (3B RMB)",
      "CATL ecosystem (Puquan Capital)",
      "Loyal Valley Capital",
      "Guozhi Investment (980M RMB)",
      "~100 institutions/individuals",
    ],
    detailZh:
      "DeepSeek 完成首轮融资，纯人民币结构，约 100 家机构/个人参与（通过基金结构穿透）。10 家名义参与方，已知：砺思资本 30 亿、IDG 30 亿、国智投资 9.8 亿、宁德时代生态（普泉资本）、厚朴投资。高瓴/红杉缺席。梁文锋最重要的要求：不要挖 DeepSeek 的人。elsewhere 确认融资完成但未披露具体总额和估值，$7.4B/$50B 数据来自英文科技媒体。",
    detailEn:
      "DeepSeek closed its first external round, pure RMB structure, ~100 institutions/individuals participated (through fund structures). 10 named participants: Monolith 3B, IDG 3B, Guozhi 980M, CATL ecosystem (Puquan Capital), Loyal Valley Capital. Hillhouse/HSG absent. Liang's top requirement: don't poach DeepSeek's people. elsewhere confirmed the round but did not disclose specific totals; $7.4B/$50B from English tech media.",
    sourceZh: "elsewhere别处发生 + TechStartups (2026-06-17)",
    sourceEn: "elsewhere + TechStartups (2026-06-17)",
    sourceUrl: "https://elsewhere.news/en/elsewhere/deepseek",
    color: "#5AD8A6",
  },
  {
    date: "2026.07",
    status: "target",
    eventZh: "二轮融资目标 $710 亿",
    eventEn: "Round 2 Target $71B",
    amount: null,
    amountNoteZh: "—",
    amountNoteEn: "—",
    valuation: 71,
    valuationNoteZh: "投前 ~$710 亿 (+42%)",
    valuationNoteEn: "Pre-money ~$71B (+42%)",
    investors: ["待定 / TBD"],
    investorsEn: ["TBD"],
    detailZh:
      "Financial Times 7 月 14 日报道，DeepSeek 寻求二轮融资，投前估值 ~$710 亿，较 6 月 $500 亿跳涨 42%。Cryptonomist 同步报道。另有 IPO 筹备消息，目标 2027 年上市。",
    detailEn:
      "Financial Times reported on July 14 that DeepSeek is seeking a second round at ~$71B pre-money valuation, a 42% jump from June's $50B. Cryptonomist reported simultaneously. IPO preparations also reported, targeting 2027 listing.",
    sourceZh: "Financial Times + Cryptonomist (2026-07-14)",
    sourceEn: "Financial Times + Cryptonomist (2026-07-14)",
    sourceUrl: "https://en.cryptonomist.ch/2026/07/14/deepseek-new-funding/",
    color: "#F6BD16",
  },
  {
    date: "2026.07.25",
    status: "paused",
    eventZh: "二轮融资暂停（创始人言论泄露）",
    eventEn: "Round 2 Paused (Leaked Remarks Go Viral)",
    amount: null,
    amountNoteZh: "—",
    amountNoteEn: "—",
    valuation: 71,
    valuationNoteZh: "二轮投前目标 ~$710 亿（已暂停）",
    valuationNoteEn: "Round 2 pre-money target ~$71B (paused)",
    investors: ["待定 / TBD"],
    investorsEn: ["TBD"],
    detailZh:
      "Bloomberg 7 月 25 日报道（Haze Fan & Pei Li），DeepSeek 告知二轮潜在投资者暂停融资。原因：梁文锋在投资者交流会上的发言被泄露并在社交媒体上病毒式传播，其中涉及英伟达（Nvidia）等敏感内容。梁文锋对泄露感到不满。多家媒体转载（Fortune、Tech in Asia、MSN 等）。",
    detailEn:
      "Bloomberg reported (Haze Fan & Pei Li, July 25) that DeepSeek told prospective investors in its second fundraising round to suspend the deal. Cause: Liang Wenfeng's comments to investors were leaked and went viral on social media, including sensitive remarks about Nvidia. Liang was frustrated by the leaks. Syndicated via Fortune, Tech in Asia, MSN, etc.",
    sourceZh: "Bloomberg — Haze Fan & Pei Li (2026-07-25)",
    sourceEn: "Bloomberg — Haze Fan & Pei Li (2026-07-25)",
    sourceUrl:
      "https://fortune.com/2026/07/25/deepseek-liang-wenfeng-backers-fundraising-pause-viral-posts-investors/",
    color: "#EAB308",
  },
];

export const INVESTOR_DATA: InvestorData[] = [
  {
    nameZh: "磠思资本 Monolith",
    nameEn: "Monolith",
    amount: 3,
    color: "#5B8FF9",
    noteZh: "30 亿 RMB · 磠思最初 15 亿，后增至 30 亿",
    noteEn: "3B RMB · Initially 1.5B, increased to 3B",
  },
  {
    nameZh: "IDG Capital",
    nameEn: "IDG Capital",
    amount: 3,
    color: "#5AD8A6",
    noteZh: "30 亿 RMB · 保险资金属性强",
    noteEn: "3B RMB · Strong insurance-funded character",
  },
  {
    nameZh: "国智投资 Guozhi",
    nameEn: "Guozhi Investment",
    amount: 0.98,
    color: "#F6BD16",
    noteZh: "9.8 亿 RMB · 刻意压低至 10 亿以下",
    noteEn: "980M RMB · Intentionally below 1B threshold",
  },
  {
    nameZh: "宁德时代生态（普泉资本）",
    nameEn: "CATL ecosystem (Puquan Capital)",
    amount: null,
    color: "#E86452",
    noteZh: "金额未披露 · 厦门鄂尔多政府资本+宁德相关+国家绿色发展基金",
    noteEn:
      "Amount undisclosed · Xiamen/Ordos gov capital + CATL + National Green Development Fund",
  },
  {
    nameZh: "厚朴投资 Loyal Valley",
    nameEn: "Loyal Valley Capital",
    amount: null,
    color: "#6DC8EC",
    noteZh: "金额未披露 · 最早接触 DeepSeek 的 VC 之一",
    noteEn: "Amount undisclosed · Among earliest VCs to talk with DeepSeek",
  },
  {
    nameZh: "iHealth（九安医疗）",
    nameEn: "iHealth (Andon Health)",
    amount: null,
    color: "#945FB9",
    noteZh: "以 LP 身份参与 · 多家 GP 背后出资人",
    noteEn: "Participated as LP · Backer behind multiple GPs",
  },
  {
    nameZh: "其他 ~90 家机构/个人",
    nameEn: "Other ~90 institutions/individuals",
    amount: 43.02,
    color: "#C2C8D5",
    noteZh: "通过基金结构穿透 · 总计约 100 家",
    noteEn: "Through fund structures · ~100 total participants",
  },
];
