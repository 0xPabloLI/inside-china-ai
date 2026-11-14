/**
 * Full-sweep query set for the orthogonality bench (#1276).
 *
 * Five intent bands x 12 queries (the ticket's 10-15 per band), same band
 * ids as the pilot: news / docs / academic / zh / community. Half of each
 * band is repo-adjacent (AI infrastructure, short-video research), half is
 * plain technical querying, per the #457 sampling rule.
 *
 * Band-specific lessons carried in from the pilot (see §5 of
 * docs/research/search-orthogonality-pilot-2026-11.md):
 * - community: short entity queries — HN/Algolia match whole terms; the
 *   pilot's long natural-language sentence got 1 hit where "mixture of
 *   experts" got 1593.
 * - zh: the wikipedia vertical needs `--lang zh`; the harness passes lang
 *   based on the query's intent.
 * - news: headline-style phrasing; wire reprints inflate URL-level breadth.
 */
export const FULL_QUERIES = [
  // --- news (12) -----------------------------------------------------------
  {
    id: "news-export-controls-2",
    intent: "news",
    text: "China AI chip export controls enforcement 2026",
    note: "Pilot follow-up: same topic family, different angle.",
  },
  {
    id: "news-deepseek-v4",
    intent: "news",
    text: "DeepSeek V4 release",
  },
  {
    id: "news-qwen4-open-source",
    intent: "news",
    text: "Alibaba Qwen4 open source release",
  },
  {
    id: "news-minimax-ipo",
    intent: "news",
    text: "MiniMax Hong Kong IPO filing",
  },
  {
    id: "news-zhipu-glm6",
    intent: "news",
    text: "Zhipu GLM-6 model launch",
  },
  {
    id: "news-baidu-ernie",
    intent: "news",
    text: "Baidu ERNIE new version announcement",
  },
  {
    id: "news-bytedance-doubao",
    intent: "news",
    text: "ByteDance Doubao model pricing",
  },
  {
    id: "news-moonshot-kimi",
    intent: "news",
    text: "Moonshot Kimi latest release",
  },
  {
    id: "news-nvidia-h20",
    intent: "news",
    text: "Nvidia H20 China sales resumption",
  },
  {
    id: "news-ai-regulation",
    intent: "news",
    text: "China AI content labeling regulation effective date",
  },
  {
    id: "news-robotaxi-china",
    intent: "news",
    text: "China robotaxi expansion permit",
  },
  {
    id: "news-stepfun-funding",
    intent: "news",
    text: "StepFun funding round China AI",
  },

  // --- docs (12) -----------------------------------------------------------
  {
    id: "docs-tanstack-2",
    intent: "docs",
    text: "TanStack Start server functions streaming SSR",
    note: "Pilot anchor query kept for comparability.",
  },
  {
    id: "docs-react-use-hook",
    intent: "docs",
    text: "React 19 use hook suspense boundary",
  },
  {
    id: "docs-tailwind-v4",
    intent: "docs",
    text: "TailwindCSS v4 oxide engine configuration",
  },
  {
    id: "docs-supabase-rls",
    intent: "docs",
    text: "Supabase row level security policies",
  },
  {
    id: "docs-remotion-composition",
    intent: "docs",
    text: "Remotion parametrized compositions getInputProps",
  },
  {
    id: "docs-shadcn-theming",
    intent: "docs",
    text: "shadcn ui theming CSS variables",
  },
  {
    id: "docs-vite-env-api",
    intent: "docs",
    text: "Vite environment API dev server",
  },
  {
    id: "docs-ts-satisfies",
    intent: "docs",
    text: "TypeScript satisfies operator documentation",
  },
  {
    id: "docs-node-env-proxy",
    intent: "docs",
    text: "Node.js fetch HTTP proxy environment variables",
  },
  {
    id: "docs-postgres-index",
    intent: "docs",
    text: "PostgreSQL partial index vs expression index",
  },
  {
    id: "docs-docker-multistage",
    intent: "docs",
    text: "Docker multi-stage build best practices",
  },
  {
    id: "docs-zod-validation",
    intent: "docs",
    text: "Zod schema validation transform pipe",
  },

  // --- academic (12) -------------------------------------------------------
  {
    id: "academic-moe-2",
    intent: "academic",
    text: "mixture of experts inference latency reduction",
    note: "Pilot anchor query kept for comparability.",
  },
  {
    id: "academic-rlhf",
    intent: "academic",
    text: "RLHF reward model calibration",
  },
  {
    id: "academic-quantization",
    intent: "academic",
    text: "LLM int8 quantization quality degradation",
  },
  {
    id: "academic-dit",
    intent: "academic",
    text: "diffusion transformer video generation",
  },
  {
    id: "academic-rope",
    intent: "academic",
    text: "RoPE context length extrapolation",
  },
  {
    id: "academic-speculative",
    intent: "academic",
    text: "speculative decoding throughput",
  },
  {
    id: "academic-vlm",
    intent: "academic",
    text: "vision language model evaluation benchmark",
  },
  {
    id: "academic-rag",
    intent: "academic",
    text: "retrieval augmented generation hallucination reduction",
  },
  {
    id: "academic-lora",
    intent: "academic",
    text: "LoRA fine-tuning parameter efficiency",
  },
  {
    id: "academic-kv-cache",
    intent: "academic",
    text: "KV cache compression long context",
  },
  {
    id: "academic-tts",
    intent: "academic",
    text: "text to speech prosody control neural",
  },
  {
    id: "academic-agent-eval",
    intent: "academic",
    text: "LLM agent benchmark evaluation tool use",
  },

  // --- zh (12) -------------------------------------------------------------
  {
    id: "zh-inference-cost-2",
    intent: "zh",
    text: "国产大模型 推理成本 下降",
    note: "Pilot anchor query kept for comparability; wikipedia needs --lang zh.",
  },
  {
    id: "zh-qwen3",
    intent: "zh",
    text: "通义千问 Qwen3 发布",
  },
  {
    id: "zh-deepseek-v4",
    intent: "zh",
    text: "DeepSeek V4 发布",
  },
  {
    id: "zh-glm",
    intent: "zh",
    text: "智谱 GLM 大模型 更新",
  },
  {
    id: "zh-wenxin",
    intent: "zh",
    text: "百度 文心 大模型 新版本",
  },
  {
    id: "zh-agent-landing",
    intent: "zh",
    text: "AI Agent 企业落地 案例",
  },
  {
    id: "zh-price-war",
    intent: "zh",
    text: "大模型 API 价格战",
  },
  {
    id: "zh-domestic-chip",
    intent: "zh",
    text: "国产 AI 芯片 算力",
  },
  {
    id: "zh-embodied",
    intent: "zh",
    text: "具身智能 融资 机器人",
  },
  {
    id: "zh-kimi-context",
    intent: "zh",
    text: "Kimi 长上下文 能力",
  },
  {
    id: "zh-video-ai",
    intent: "zh",
    text: "AI 视频生成 工具 国产",
  },
  {
    id: "zh-open-weights",
    intent: "zh",
    text: "开源大模型 排行榜 中文",
  },

  // --- community (12) — short entity queries per the pilot's HN lesson -----
  {
    id: "community-ollama",
    intent: "community",
    text: "ollama",
  },
  {
    id: "community-mlxAI",
    intent: "community",
    text: "mlxAI",
  },
  {
    id: "community-remotion",
    intent: "community",
    text: "remotion",
  },
  {
    id: "community-tanstack-start",
    intent: "community",
    text: "tanstack start",
  },
  {
    id: "community-bun",
    intent: "community",
    text: "bun vs node",
  },
  {
    id: "community-sqlite-wasm",
    intent: "community",
    text: "sqlite wasm",
  },
  {
    id: "community-tailscale",
    intent: "community",
    text: "tailscale",
  },
  {
    id: "community-supabase",
    intent: "community",
    text: "supabase self host",
  },
  {
    id: "community-qwen3",
    intent: "community",
    text: "qwen3",
  },
  {
    id: "community-deepseek",
    intent: "community",
    text: "deepseek",
  },
  {
    id: "community-raycast",
    intent: "community",
    text: "raycast",
  },
  {
    id: "community-colima",
    intent: "community",
    text: "colima docker mac",
  },
];
