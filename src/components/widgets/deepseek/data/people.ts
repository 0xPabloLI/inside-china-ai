export interface Person {
  name: string;
  role: string;
  tech: string;
  techColor: string;
  company: string;
  companyColor: string;
  note: string;
  salary: string;
  salaryKnown: boolean;
  salaryNote: string;
  depart: string;
}

export const PEOPLE: Person[] = [
  {
    name: "Luo Fuli",
    role: "V2 Core Contributor",
    tech: "Base Model",
    techColor: "#4A90D9",
    company: "Xiaomi",
    companyColor: "#FF6900",
    note: "Hired by Lei Jun, 10M+ RMB/yr",
    salary: "~$1.4M+/yr\n(¥10M+/yr)",
    salaryKnown: true,
    salaryNote: "Recruited by Lei Jun personally",
    depart: "2025",
  },
  {
    name: "Wang Bingxuan",
    role: "First-Gen LLM Core Author",
    tech: "Base Model",
    techColor: "#4A90D9",
    company: "Tencent",
    companyColor: "#00A4F7",
    note: "",
    salary: "Est. 8-fig package\n(¥10M+)",
    salaryKnown: false,
    salaryNote: "Based on industry reports",
    depart: "H2 2025",
  },
  {
    name: "Guo Daya",
    role: "R1 Core Researcher / Coder / Math",
    tech: "Reasoning",
    techColor: "#E8554E",
    company: "ByteDance",
    companyColor: "#FF6B35",
    note: "Seed Team Agent Lead",
    salary: "Est. 8-fig package\n(¥10M+)",
    salaryKnown: false,
    salaryNote: "Based on industry reports",
    depart: "Mar 2026",
  },
  {
    name: "Wei Haoran",
    role: "OCR Series Core Author",
    tech: "OCR",
    techColor: "#F5A623",
    company: "Baidu (suspected)",
    companyColor: "#2932E1",
    note: "Inferred from 36kr",
    salary: "Est. mid-6-fig/yr\n(¥3-5M)",
    salaryKnown: false,
    salaryNote: "Based on industry reports",
    depart: "Around CNY 2026",
  },
  {
    name: "Ruan Chong",
    role: "Multimodal Core Researcher",
    tech: "Multimodal",
    techColor: "#7B68EE",
    company: "Deeproute.ai",
    companyColor: "#00C896",
    note: "Autonomous driving",
    salary: "Est. mid-6-fig/yr\n(¥3-5M)",
    salaryKnown: false,
    salaryNote: "Based on industry reports",
    depart: "Unspecified",
  },
];
