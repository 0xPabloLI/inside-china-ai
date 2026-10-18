// Benchmark data from the official DeepSeek-V4.1-Flash-1017 model card
// (https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017), published
// Oct 17, 2026. Scores are the official reported numbers; each row's best
// score is bolded by the view. null = not reported.
//
// Harness note from the model card: Terminal-Bench 4.0 uses the Claude Code
// harness, DeepSWE v1.1 uses Mini-SWE-V2. HLE is scored without tools; the
// text-only subset (42.6 -> 44.0 for 1017, 36.8 -> 39.1 for the earlier Flash)
// is surfaced in the row description rather than as a separate bar.

export interface Model {
  id: string;
  name: string;
  vendor: string;
  note: string;
  /** Highlighted as "the release this article is about". */
  featured?: boolean;
  /** Highlighted as "the previous version of the same model". */
  baseline?: boolean;
}

export interface BenchmarkRow {
  id: string;
  category: "Coding" | "Agentic" | "General" | "Multimodal";
  name: string;
  description: string;
  /** Scores keyed by model id; null = not reported. */
  scores: Record<string, number | null>;
}

export const MODELS: Model[] = [
  {
    id: "ds-1017",
    name: "DeepSeek-V4.1-Flash-1017",
    vendor: "DeepSeek",
    note: "This release — a minor update to V4.1-Flash",
    featured: true,
  },
  {
    id: "ds-v41",
    name: "DeepSeek-V4.1-Flash",
    vendor: "DeepSeek",
    note: "Previous version, released Sep 10, 2026",
    baseline: true,
  },
  {
    id: "k3",
    name: "K3",
    vendor: "Moonshot AI",
    note: "2.8T MoE open model",
  },
  {
    id: "glm53",
    name: "GLM-5.3",
    vendor: "Zhipu AI",
    note: "Open-weight competitor",
  },
  {
    id: "gpt56",
    name: "GPT-5.6 Sol",
    vendor: "OpenAI",
    note: "Closed frontier model",
  },
  {
    id: "opus5",
    name: "Opus 5",
    vendor: "Anthropic",
    note: "Closed frontier model",
  },
];

export const BENCHMARKS: BenchmarkRow[] = [
  {
    id: "hle",
    category: "General",
    name: "HLE (w/o tools)",
    description:
      "Humanity's Last Exam, no tool use. Text-only subset: 44.0 for 1017, 39.1 for the earlier Flash.",
    scores: { "ds-1017": 42.6, "ds-v41": 36.8, k3: 43.5, glm53: 42.0, gpt56: 44.5, opus5: 56.3 },
  },
  {
    id: "terminal-bench",
    category: "Agentic",
    name: "Terminal-Bench 4.0",
    description: "Terminal tasks, run through the Claude Code harness.",
    scores: { "ds-1017": 42.3, "ds-v41": 31.2, k3: 12.6, glm53: 37.9, gpt56: 39.9, opus5: 51.8 },
  },
  {
    id: "deepswe",
    category: "Coding",
    name: "DeepSWE v1.1",
    description: "Software-engineering tasks, run through the Mini-SWE-V2 harness.",
    scores: { "ds-1017": 77.0, "ds-v41": 74.2, k3: 67.5, glm53: 66.9, gpt56: 73.0, opus5: 74.0 },
  },
  {
    id: "programbench",
    category: "Coding",
    name: "ProgramBench",
    description: "Program synthesis benchmark.",
    scores: { "ds-1017": 29.1, "ds-v41": 20.3, k3: 17.5, glm53: 19.0, gpt56: 23.0, opus5: 37.0 },
  },
  {
    id: "nl2repo",
    category: "Coding",
    name: "NL2Repo-Bench",
    description: "Natural language to full repository.",
    scores: { "ds-1017": 68.2, "ds-v41": 65.4, k3: 58.0, glm53: 58.0, gpt56: 56.8, opus5: 75.3 },
  },
  {
    id: "automation-bench",
    category: "Agentic",
    name: "Automation-Bench v1.0.6",
    description: "End-to-end desktop and web automation.",
    scores: { "ds-1017": 60.5, "ds-v41": 54.8, k3: 46.7, glm53: 48.8, gpt56: 45.8, opus5: 50.3 },
  },
  {
    id: "agents-last-exam",
    category: "Agentic",
    name: "Agents' Last Exam",
    description: "Long-horizon agentic task suite.",
    scores: { "ds-1017": 35.4, "ds-v41": 31.8, k3: 27.6, glm53: 28.5, gpt56: 26.7, opus5: 28.6 },
  },
  {
    id: "apex-bench",
    category: "General",
    name: "Apex Bench v1.1",
    description: "Aggregate reasoning benchmark.",
    scores: { "ds-1017": 72.1, "ds-v41": 64.6, k3: 47.8, glm53: 56.6, gpt56: 54.3, opus5: 65.8 },
  },
  {
    id: "chartography",
    category: "Multimodal",
    name: "Chartography (w/tools)",
    description: "Chart and figure understanding, with tool use.",
    scores: { "ds-1017": 83.0, "ds-v41": 78.9, k3: 68.1, glm53: null, gpt56: 79.9, opus5: 84.0 },
  },
  {
    id: "babyvision",
    category: "Multimodal",
    name: "BabyVision (w/tools)",
    description: "Visual reasoning, with tool use.",
    scores: { "ds-1017": 92.5, "ds-v41": 89.6, k3: 85.7, glm53: null, gpt56: 88.9, opus5: 94.1 },
  },
  {
    id: "zerobench",
    category: "Multimodal",
    name: "ZeroBench-main (w/tools)",
    description: "Hard visual reasoning, with tool use.",
    scores: { "ds-1017": 51.0, "ds-v41": 49.0, k3: 41.0, glm53: null, gpt56: 53.0, opus5: 52.0 },
  },
];
