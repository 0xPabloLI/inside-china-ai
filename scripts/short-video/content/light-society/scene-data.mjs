/**
 * Scene definitions for the Light Society video.
 * 10 scenes, ~65s. China's billion-agent AI simulation.
 *
 * Source: arXiv 2506.12078 "Modeling Earth-Scale Human-Like Societies
 * with One Billion Agents" (Light Society)
 * Viral tweet: @Jason on X, Aug 10 2026, 170K views
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    voiceover:
      "China built the first simulation of one billion AI humans. Four million had their beliefs rewritten in 14 hours.",
    texts: {
      badge: "VIRAL",
      subject: "LIGHT SOCIETY",
      bigNumber: "1B",
      subtitle: "AI AGENTS",
      subtitleHighlight: "SIMULATED",
      stats: [
        { num: "14", unit: "HRS", label: "RUNTIME" },
        { num: "4M", unit: "", label: "BELIEFS CHANGED" },
      ],
    },
  },
  {
    id: 2,
    name: "tweet",
    visualType: "callout",
    voiceover:
      "A viral tweet from Jason said China sent agents to camps. The real story is bigger.",
    texts: {
      title: "THE TWEET THAT WENT VIRAL",
      quote: "4M agents sent to re-education camps in 14 hours!",
      attribution: "@Jason on X, Aug 10 2026",
      stats: [
        { num: "170K", label: "VIEWS" },
        { num: "2.3K", label: "BOOKMARKS" },
      ],
    },
  },
  {
    id: 3,
    name: "paper",
    visualType: "info-card",
    voiceover:
      "According to arXiv, the paper is Light Society, from USTC and Tsinghua. A framework simulating over one billion agents.",
    texts: {
      title: "THE REAL",
      titleHighlight: "PAPER",
      subtitle: "arXiv: 2506.12078",
      institutions: [
        "USTC + Tsinghua + Fudan",
      ],
      points: [
        "1B+ AI agents simulated",
        "LLM-powered behavior",
        "Real demographic data",
      ],
    },
  },
  {
    id: 4,
    name: "real-data",
    visualType: "contrast",
    voiceover:
      "Agent profiles come from the World Values Survey. 96,000 real respondents. Age, income, education, and values. Not random bots.",
    texts: {
      title: "NOT RANDOM BOTS",
      leftTitle: "REAL DATA SOURCE",
      left: [
        "96,000 survey respondents",
        "Age + gender + income",
        "Education + social class",
        "Personal values",
      ],
      rightTitle: "AGENT CAPABILITIES",
      right: [
        "Personality traits",
        "Memory + beliefs",
        "Goals + decisions",
        "LLM-powered reasoning",
      ],
    },
  },
  {
    id: 5,
    name: "scale",
    visualType: "scale-comparison",
    voiceover:
      "Previous simulations maxed at 10 million agents. Light Society uses full LLMs for complex decisions, distilled surrogates for routine updates.",
    texts: {
      title: "THE",
      titleHighlight: "SCALE BREAKTHROUGH",
      have: "10M",
      haveFill: "AGENTS",
      haveLabel: "PREVIOUS MAX",
      need: "1B",
      needFill: "AGENTS",
      needLabel: "LIGHT SOCIETY",
      vsText: "vs",
      technique: "MIXTURE OF MODELS",
      techniqueDesc: "Full LLMs + distilled surrogates",
      verdict: "100x scale jump.",
      verdictHighlight: "Without losing fidelity.",
    },
  },
  {
    id: 6,
    name: "trust-games",
    visualType: "stats",
    voiceover:
      "In trust experiments, higher education meant more trust. Social norms emerged naturally. The simulation mirrors real human behavior.",
    texts: {
      title: "TRUST GAMES",
      titleHighlight: "VALIDATED",
      statCards: [
        {
          num: "HIGHER",
          label: "EDUCATION = MORE TRUST",
          color: "blue",
        },
        {
          num: "EMERGES",
          label: "SOCIAL NORMS APPEAR NATURALLY",
          color: "green",
        },
        {
          num: "MATCHES",
          label: "MIRRORS REAL HUMAN BEHAVIOR",
          color: "amber",
        },
      ],
      note: "Bigger population = clearer patterns",
    },
  },
  {
    id: 7,
    name: "opinion-diffusion",
    visualType: "network",
    voiceover:
      "On a network of one billion nodes, the top 20% of influencers shifted millions of agents on AI unemployment. Opinions cascaded.",
    texts: {
      title: "OPINION",
      titleHighlight: "DIFFUSION",
      subtitle: "AT ONE BILLION AGENTS",
      networkNodes: "10\u2079 NODES",
      influencerPct: "TOP 20%",
      influencerLabel: "INFLUENCERS",
      cascadeLabel: "OPINION CASCADES",
      findings: [
        "Education + income = more influence",
        "Linguistic framing shifts stance",
        "Neutral agents act as buffers",
        "Cascades beat direct influence",
      ],
    },
  },
  {
    id: 8,
    name: "real-story",
    visualType: "callout",
    voiceover:
      "The paper stated no such thing. But it did rewrite 4 million beliefs at scale. The metaphor writes itself.",
    texts: {
      title: "THE REAL STORY",
      quote: "The paper never says 're-education.' But it did rewrite 4M beliefs at scale.",
      attribution: "Light Society, arXiv 2506.12078",
      highlight: { field: "quote", text: "4M beliefs" },
    },
  },
  {
    id: 9,
    name: "philosophy",
    visualType: "question",
    voiceover:
      "If we can build agents who don't know they're simulated, how do we know we're not in one ourselves?",
    texts: {
      title: "THE BIG QUESTION",
      question: "Are WE in a simulation?",
      subquestion: "They don't know they're code...",
      attribution: "Jason's deeper point",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    voiceover: "One billion simulated humans. Follow for more China AI.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
