export interface Person {
  nameZh: string;
  nameEn: string;
  roleZh: string;
  roleEn: string;
  techZh: string;
  techEn: string;
  techColor: string;
  companyZh: string;
  companyEn: string;
  companyColor: string;
  noteZh: string;
  noteEn: string;
  salaryZh: string;
  salaryEn: string;
  salaryKnown: boolean;
  salaryNoteZh: string;
  salaryNoteEn: string;
  departZh: string;
  departEn: string;
}

export const PEOPLE: Person[] = [
  {
    nameZh: "罗福莉",
    nameEn: "Luo Fuli",
    roleZh: "V2核心贡献者",
    roleEn: "V2 Core Contributor",
    techZh: "基座模型",
    techEn: "Base Model",
    techColor: "#4A90D9",
    companyZh: "小米",
    companyEn: "Xiaomi",
    companyColor: "#FF6900",
    noteZh: "雷军千万年薪挖走",
    noteEn: "Hired by Lei Jun, 10M+ RMB/yr",
    salaryZh: "千万年薪\n(¥1000万+/年)",
    salaryEn: "~$1.4M+/yr\n(¥10M+/yr)",
    salaryKnown: true,
    salaryNoteZh: "雷军亲自挖角",
    salaryNoteEn: "Recruited by Lei Jun personally",
    departZh: "2025年",
    departEn: "2025",
  },
  {
    nameZh: "王炳宣",
    nameEn: "Wang Bingxuan",
    roleZh: "第一代LLM核心作者",
    roleEn: "First-Gen LLM Core Author",
    techZh: "基座模型",
    techEn: "Base Model",
    techColor: "#4A90D9",
    companyZh: "腾讯",
    companyEn: "Tencent",
    companyColor: "#00A4F7",
    noteZh: "",
    noteEn: "",
    salaryZh: "传八位数总包\n(¥1000万+)",
    salaryEn: "Est. 8-fig package\n(¥10M+)",
    salaryKnown: false,
    salaryNoteZh: "基于行业薪酬报道",
    salaryNoteEn: "Based on industry reports",
    departZh: "2025下半年",
    departEn: "H2 2025",
  },
  {
    nameZh: "郭达雅",
    nameEn: "Guo Daya",
    roleZh: "R1核心研究员 / DeepSeek Coder / Math",
    roleEn: "R1 Core Researcher / Coder / Math",
    techZh: "推理",
    techEn: "Reasoning",
    techColor: "#E8554E",
    companyZh: "字节跳动",
    companyEn: "ByteDance",
    companyColor: "#FF6B35",
    noteZh: "Seed团队 Agent方向负责人",
    noteEn: "Seed Team Agent Lead",
    salaryZh: "传八位数总包\n(¥1000万+)",
    salaryEn: "Est. 8-fig package\n(¥10M+)",
    salaryKnown: false,
    salaryNoteZh: "基于行业薪酬报道",
    salaryNoteEn: "Based on industry reports",
    departZh: "2026年3月",
    departEn: "Mar 2026",
  },
  {
    nameZh: "魏浩然",
    nameEn: "Wei Haoran",
    roleZh: "OCR系列模型核心作者",
    roleEn: "OCR Series Core Author",
    techZh: "OCR",
    techEn: "OCR",
    techColor: "#F5A623",
    companyZh: "百度(疑似)",
    companyEn: "Baidu (suspected)",
    companyColor: "#2932E1",
    noteZh: "36氪报道暗示",
    noteEn: "Inferred from 36kr",
    salaryZh: "传数百万年薪\n(¥300-500万)",
    salaryEn: "Est. mid-6-fig/yr\n(¥3-5M)",
    salaryKnown: false,
    salaryNoteZh: "基于行业薪酬报道",
    salaryNoteEn: "Based on industry reports",
    departZh: "2026春节前后",
    departEn: "Around CNY 2026",
  },
  {
    nameZh: "阮翀",
    nameEn: "Ruan Chong",
    roleZh: "多模态技术核心研究员",
    roleEn: "Multimodal Core Researcher",
    techZh: "多模态",
    techEn: "Multimodal",
    techColor: "#7B68EE",
    companyZh: "元戎启行",
    companyEn: "Deeproute.ai",
    companyColor: "#00C896",
    noteZh: "自动驾驶公司",
    noteEn: "Autonomous driving",
    salaryZh: "传数百万年薪\n(¥300-500万)",
    salaryEn: "Est. mid-6-fig/yr\n(¥3-5M)",
    salaryKnown: false,
    salaryNoteZh: "基于行业薪酬报道",
    salaryNoteEn: "Based on industry reports",
    departZh: "未明确",
    departEn: "Unspecified",
  },
];
