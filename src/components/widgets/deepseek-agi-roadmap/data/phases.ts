export interface RoadmapPhase {
  id: string;
  period: string;
  technology: string;
  description: string;
  status: "past" | "current" | "future";
  icon: string;
}

export const PHASES: RoadmapPhase[] = [
  {
    id: "llm",
    period: "Past",
    technology: "Language Models",
    description: "Basic text understanding and generation",
    status: "past",
    icon: "📝",
  },
  {
    id: "cot",
    period: "2024",
    technology: "Chain-of-Thought (CoT)",
    description: "Self-reasoning capability through step-by-step thinking",
    status: "past",
    icon: "🧠",
  },
  {
    id: "agents",
    period: "2025",
    technology: "Agents",
    description: "Multi-task orchestration and autonomous decision-making",
    status: "current",
    icon: "🤖",
  },
  {
    id: "continuous-learning",
    period: "Future",
    technology: "Continuous Learning",
    description: "Incremental in-context knowledge retention, like human learning",
    status: "future",
    icon: "📚",
  },
  {
    id: "self-iteration",
    period: "Future",
    technology: "Self-Iteration Singularity",
    description: "AI develops and improves its own next versions",
    status: "future",
    icon: "🔄",
  },
  {
    id: "embodied",
    period: "Beyond",
    technology: "Embodied AI",
    description: "Robots entering physical world for daily tasks and elder care",
    status: "future",
    icon: "🦾",
  },
];
