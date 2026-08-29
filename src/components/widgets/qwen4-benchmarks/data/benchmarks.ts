// Benchmark data from the official Qwen blog (https://qwen.ai/blog?id=qwen3.8-flash-next)
// and the Hugging Face model card (https://huggingface.co/Qwen/Qwen3.8-Flash-Next),
// both published Aug 26, 2026. Scores are the official reported numbers; each row's
// best score is bolded by the view. "--" = not reported / not applicable.

export interface Model {
  id: string;
  name: string;
  totalParams: string;
  activeParams: string;
  vendor: string;
}

export interface BenchmarkRow {
  id: string;
  category: "Coding" | "Agent" | "General" | "Multimodal";
  name: string;
  description: string;
  // Scores keyed by model id; null = not reported.
  scores: Record<string, number | null>;
}

export const MODELS: Model[] = [
  {
    id: "flash-next",
    name: "Qwen3.8-Flash-Next",
    totalParams: "125B",
    activeParams: "6B active",
    vendor: "Alibaba",
  },
  {
    id: "qwen38-27b",
    name: "Qwen3.8-27B",
    totalParams: "27B",
    activeParams: "27B dense",
    vendor: "Alibaba",
  },
  {
    id: "qwen37-plus",
    name: "Qwen3.7-Plus",
    totalParams: "397B",
    activeParams: "17B active",
    vendor: "Alibaba",
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek-V4-Flash-0731",
    totalParams: "284B",
    activeParams: "13B active",
    vendor: "DeepSeek",
  },
  {
    id: "claude-opus-46",
    name: "Claude-Opus-4.6 (Max)",
    totalParams: "n/a",
    activeParams: "closed",
    vendor: "Anthropic",
  },
];

export const BENCHMARKS: BenchmarkRow[] = [
  {
    id: "deepswe",
    category: "Coding",
    name: "DeepSWE 1.1",
    description: "Agentic coding, best of Claude Code / mini-SWE-agent harnesses",
    scores: {
      "flash-next": 58.7,
      "qwen38-27b": 42.2,
      "qwen37-plus": 16.5,
      "deepseek-v4-flash": 54.4,
      "claude-opus-46": null,
    },
  },
  {
    id: "swe-pro",
    category: "Coding",
    name: "SWE-bench Pro",
    description: "Agentic coding on corrected task set",
    scores: {
      "flash-next": 62.5,
      "qwen38-27b": 61.7,
      "qwen37-plus": 55.8,
      "deepseek-v4-flash": 56.0,
      "claude-opus-46": 53.4,
    },
  },
  {
    id: "swe-multi",
    category: "Coding",
    name: "SWE-bench Multilingual",
    description: "Multilingual software engineering",
    scores: {
      "flash-next": 81.0,
      "qwen38-27b": 73.8,
      "qwen37-plus": 75.8,
      "deepseek-v4-flash": null,
      "claude-opus-46": 77.5,
    },
  },
  {
    id: "jobbench",
    category: "Agent",
    name: "JobBench",
    description: "Professional job tasks",
    scores: {
      "flash-next": 55.7,
      "qwen38-27b": 33.4,
      "qwen37-plus": 27.6,
      "deepseek-v4-flash": 41.3,
      "claude-opus-46": 36.6,
    },
  },
  {
    id: "coworkbench",
    category: "Agent",
    name: "CoWorkBench",
    description: "Long-horizon office work across finance, law, medicine",
    scores: {
      "flash-next": 73.9,
      "qwen38-27b": 70.7,
      "qwen37-plus": 65.1,
      "deepseek-v4-flash": 45.1,
      "claude-opus-46": 68.2,
    },
  },
  {
    id: "gpqa",
    category: "General",
    name: "GPQA Diamond",
    description: "Scientific reasoning",
    scores: {
      "flash-next": 91.7,
      "qwen38-27b": 89.2,
      "qwen37-plus": 90.3,
      "deepseek-v4-flash": 90.8,
      "claude-opus-46": 91.3,
    },
  },
  {
    id: "lcb",
    category: "General",
    name: "LiveCodeBench v6",
    description: "Competitive coding",
    scores: {
      "flash-next": 91.9,
      "qwen38-27b": 90.3,
      "qwen37-plus": 89.6,
      "deepseek-v4-flash": 90.6,
      "claude-opus-46": 88.8,
    },
  },
  {
    id: "hle",
    category: "General",
    name: "Humanity's Last Exam",
    description: "Multidisciplinary frontier reasoning (GPT-4o judge)",
    scores: {
      "flash-next": 35.9,
      "qwen38-27b": 30.8,
      "qwen37-plus": 34.7,
      "deepseek-v4-flash": 33.8,
      "claude-opus-46": 40.0,
    },
  },
  {
    id: "androidworld",
    category: "Multimodal",
    name: "AndroidWorld",
    description: "Mobile agent use",
    scores: {
      "flash-next": 84.5,
      "qwen38-27b": 81.9,
      "qwen37-plus": 81.0,
      "deepseek-v4-flash": null,
      "claude-opus-46": 62.0,
    },
  },
  {
    id: "osworld",
    category: "Multimodal",
    name: "OSWorld 2.0 (binary)",
    description: "Computer use, full-task success rate",
    scores: {
      "flash-next": 19.4,
      "qwen38-27b": 19.4,
      "qwen37-plus": 2.8,
      "deepseek-v4-flash": null,
      "claude-opus-46": null,
    },
  },
  {
    id: "mathvision",
    category: "Multimodal",
    name: "MathVision",
    description: "Visual math problem solving, without CI",
    scores: {
      "flash-next": 90.6,
      "qwen38-27b": 90.0,
      "qwen37-plus": 90.3,
      "deepseek-v4-flash": null,
      "claude-opus-46": 65.5,
    },
  },
];
