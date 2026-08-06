export interface RoadmapPhase {
  id: string;
  icon: string;
  period: string;
  status: "past" | "current" | "future";
  technology: string;
  description: string;
}

export const PHASES: RoadmapPhase[] = [
  {
    id: "pretraining",
    icon: "📚",
    period: "2023",
    status: "past",
    technology: "Large-scale pretraining",
    description:
      "Built the base models and the data pipeline, proving a small team could train frontier-scale LLMs on constrained compute.",
  },
  {
    id: "efficiency",
    icon: "⚙️",
    period: "2024",
    status: "past",
    technology: "Architecture efficiency (MoE, MLA)",
    description:
      "Mixture-of-experts routing and multi-head latent attention cut training and inference cost far below comparable Western models.",
  },
  {
    id: "reasoning",
    icon: "🧠",
    period: "2025",
    status: "past",
    technology: "Reasoning via reinforcement learning",
    description:
      "R1-style RL training turned long chain-of-thought into a reliable capability, released with open weights and a public technical report.",
  },
  {
    id: "agents",
    icon: "🤖",
    period: "2026",
    status: "current",
    technology: "Agents and tool use",
    description:
      "Current focus: models that plan across many steps, call tools, and recover from their own mistakes without a human in the loop.",
  },
  {
    id: "self-improvement",
    icon: "🔁",
    period: "Next",
    status: "future",
    technology: "Self-improving systems",
    description:
      "Models that generate and grade their own training signal, shrinking the gap between a research idea and a shipped capability.",
  },
];
