export interface CompanyGroup {
  id: string;
  name: string;
}

export interface Quote {
  page: number;
  tone: string;
  toneClass: string;
  text: string;
}

export interface Company {
  group: string;
  name: string;
  quotes: Quote[];
}

export const COMPANY_GROUPS: CompanyGroup[] = [
  { id: "us-ai", name: "US AI Giants" },
  { id: "us-chip", name: "US Chips" },
  { id: "cn-ai", name: "Chinese AI Companies" },
  { id: "cn-chip", name: "Domestic Chips" },
  { id: "analogy", name: "References" },
];

export const COMPANIES: Company[] = [
  // ── US AI Giants ──
  {
    group: "us-ai",
    name: "OpenAI",
    quotes: [
      {
        page: 20,
        tone: "Comparison",
        toneClass: "tone-compare",
        text: "Anthropic surpassing OpenAI — is that long-term? I don't think so, it's certainly an extreme. OpenAI and Google will likely alternate at the top.",
      },
      {
        page: 20,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "Probably half the people in our company think OpenAI is better.",
      },
      {
        page: 25,
        tone: "Commentary",
        toneClass: "tone-critique",
        text: "OpenAI's math works out in theory. But he'll be beaten by someone willing to take only 1%. OpenAI thought it could monopolize the world, but it will face many challengers.",
      },
      {
        page: 38,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "OpenAI, Anthropic — they started earlier, have more capital, and more chips.",
      },
      {
        page: 16,
        tone: "Commentary",
        toneClass: "tone-critique",
        text: "When Sora came out, everyone did video generation — big and small companies. But small companies later cut it. It has nothing to do with intelligence limits. Commercially, it's a good business.",
      },
    ],
  },
  {
    group: "us-ai",
    name: "Anthropic",
    quotes: [
      {
        page: 20,
        tone: "Commentary",
        toneClass: "tone-critique",
        text: "Anthropic's advantage in Code Agent isn't that big — it's not crushing OpenAI. They have a first-mover advantage, but it'll be gone soon.",
      },
      {
        page: 38,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "Both Anthropic and OpenAI have invested enormous sums (in post-training).",
      },
      {
        page: 39,
        tone: "Comparison",
        toneClass: "tone-compare",
        text: "Anthropic uses its own models for its own products — finance, legal, even healthcare.",
      },
    ],
  },
  {
    group: "us-ai",
    name: "Google",
    quotes: [
      {
        page: 20,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "OpenAI and Google will likely alternate at the top going forward.",
      },
    ],
  },

  // ── US Chips ──
  {
    group: "us-chip",
    name: "NVIDIA",
    quotes: [
      {
        page: 15,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "In the coming months we'll have large batches of machines arriving — basically all NVIDIA.",
      },
      {
        page: 15,
        tone: "Positive",
        toneClass: "tone-positive",
        text: "If I spend all the money in six months, that'd be ideal. Turning money into NVIDIA cards is certainly better than leaving it in the bank.",
      },
      {
        page: 20,
        tone: "Positive",
        toneClass: "tone-positive",
        text: "Domestic chips face an ecosystem problem — you buy them but can't use them, they lack NVIDIA's ecosystem. So NVIDIA's moat is very strong.",
      },
      {
        page: 21,
        tone: "Commentary",
        toneClass: "tone-critique",
        text: "But this is changing. NVIDIA's CUDA moat is being rapidly dismantled. We can build an ecosystem identical to NVIDIA's.",
      },
      {
        page: 21,
        tone: "Commentary",
        toneClass: "tone-critique",
        text: "CUDA evolved from gaming cards... so NVIDIA's ecosystem advantage is greatly diminished.",
      },
      {
        page: 21,
        tone: "Commentary",
        toneClass: "tone-critique",
        text: "No obstacle — NVIDIA can't stop this. In a normal commercial environment where NVIDIA cards are available, domestic substitution is hard. But when you can't buy NVIDIA, everyone is forced to use domestic chips.",
      },
      {
        page: 22,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "When training V3, we used NVIDIA cards, but no longer used NVIDIA's ecosystem.",
      },
      {
        page: 22,
        tone: "Commentary",
        toneClass: "tone-critique",
        text: "I'm quite optimistic about domestic compute. On this point, NVIDIA is digging its own grave.",
      },
      {
        page: 23,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "NVIDIA may have a new generation in Q3 this year. Our gap with the US in chips: no ecosystem gap going forward, but in hardware it's 4x plus 2 years.",
      },
      {
        page: 31,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "NVIDIA cards can basically be depreciated over five years.",
      },
    ],
  },

  // ── Chinese AI Companies ──
  {
    group: "cn-ai",
    name: "Zhipu AI",
    quotes: [
      {
        page: 3,
        tone: "Comparison",
        toneClass: "tone-compare",
        text: "Zhipu also open sources, but their open source is different from ours. Theirs feels forced — they think it's not their original intention. For us, it is our intention.",
      },
      {
        page: 14,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "We're very willing to help anyone — even competitors like Alibaba, Zhipu, Moonshot — do better.",
      },
    ],
  },
  {
    group: "cn-ai",
    name: "Moonshot AI",
    quotes: [
      {
        page: 14,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "We're very willing to help anyone — even competitors like Alibaba, Zhipu, Moonshot — do better.",
      },
    ],
  },
  {
    group: "cn-ai",
    name: "ByteDance",
    quotes: [
      {
        page: 6,
        tone: "Comparison",
        toneClass: "tone-compare",
        text: "We don't have the idea of becoming the next super App, competing with others, becoming the next ByteDance or Tencent — no such thought at all.",
      },
      {
        page: 6,
        tone: "Restraint",
        toneClass: "tone-compare",
        text: "If we'd spent big money last year to grab users from ByteDance, that'd be one approach. But we chose restraint — not competing for this, because the watermelon is still ahead; the front stuff is just sesame seeds.",
      },
      {
        page: 7,
        tone: "Commentary",
        toneClass: "tone-critique",
        text: "ByteDance's model is closed-source — what's the benefit? I don't see any benefit.",
      },
    ],
  },
  {
    group: "cn-ai",
    name: "Alibaba",
    quotes: [
      {
        page: 5,
        tone: "Comparison",
        toneClass: "tone-compare",
        text: "Alibaba or Tencent — they don't have our optimization, their costs should be several times higher.",
      },
      {
        page: 14,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "We're very willing to help anyone — even competitors like Alibaba, Zhipu, Moonshot — do better.",
      },
      {
        page: 31,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "For Tencent and Alibaba, if they can buy [B200 cards], it depends on volume; at a reasonable price, it's definitely worth it. But right now, they probably can't buy them.",
      },
    ],
  },
  {
    group: "cn-ai",
    name: "Tencent",
    quotes: [
      {
        page: 5,
        tone: "Comparison",
        toneClass: "tone-compare",
        text: "Alibaba or Tencent — they don't have our optimization, their costs should be several times higher.",
      },
      {
        page: 6,
        tone: "Restraint",
        toneClass: "tone-compare",
        text: "Becoming the next ByteDance or next Tencent — no such thought at all.",
      },
      {
        page: 9,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "Tencent has a lot of traffic — they deploy our open-source model and take all C-end users. But actually that doesn't happen.",
      },
      {
        page: 31,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "For Tencent and Alibaba, if they can buy [B200 cards], it depends on volume; at a reasonable price, it's definitely worth it.",
      },
    ],
  },

  // ── Domestic Chips ──
  {
    group: "cn-chip",
    name: "Huawei",
    quotes: [
      {
        page: 17,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "To train a model as large as the leading ones, I'd need 50K GB300 cards, or 200K Huawei 950 cards.",
      },
      {
        page: 17,
        tone: "Commentary",
        toneClass: "tone-critique",
        text: "Huawei's production capacity is also limited. To train a few hundred B, I'd need 200K of Huawei's latest cards — just for training, not counting research.",
      },
      {
        page: 21,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "Whether Huawei or NVIDIA itself, going forward they'll all be specialized chips.",
      },
      {
        page: 22,
        tone: "Positive",
        toneClass: "tone-positive",
        text: "We mainly cooperate with Huawei now. They do their own adaptation, but we participate deeply in their ecosystem. Huawei's problem is still insufficient production capacity.",
      },
      {
        page: 22,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "Huawei gives us about 16K cards of capacity. Internet giants might get over 100K; we get 10K+.",
      },
      {
        page: 22,
        tone: "Positive",
        toneClass: "tone-positive",
        text: "Huawei's super-node 950 can fully replace NVIDIA's GB200/GB300 in performance and price. More expensive, but only marginally so. Four Huawei cards = one NVIDIA card, and 2 years behind.",
      },
      {
        page: 22,
        tone: "Positive",
        toneClass: "tone-positive",
        text: "For Huawei cards, our main work is building the high-level language compiler and TileLang.",
      },
      {
        page: 31,
        tone: "Objective",
        toneClass: "tone-neutral",
        text: "Huawei cards can be depreciated over three years at most. Their lifespan is shorter since they're already 2 years behind NVIDIA. But I think the gap isn't that big.",
      },
      {
        page: 34,
        tone: "Positive",
        toneClass: "tone-positive",
        text: "Our purpose in buying Huawei 950 is to help Huawei build a good ecosystem.",
      },
    ],
  },

  // ── References ──
  {
    group: "analogy",
    name: "GE (General Electric)",
    quotes: [
      {
        page: 2,
        tone: "Positive",
        toneClass: "tone-positive",
        text: "About twenty years ago, the person I admired most in management was Jack Welch, GE's former CEO. Looking back now, most of what he said may no longer be correct, but he got the most important point right: a company's most important thing is its vision. Managing a large company relies not on rules and regulations, but on vision.",
      },
    ],
  },
  {
    group: "analogy",
    name: "BYD",
    quotes: [
      {
        page: 18,
        tone: "Analogy",
        toneClass: "tone-analogy",
        text: "Take BYD's batteries — at the same tech level, can others match that price? I think that's quite hard. Not easy to achieve, it's definitely a barrier.",
      },
    ],
  },
  {
    group: "analogy",
    name: "Tesla",
    quotes: [
      {
        page: 23,
        tone: "Analogy",
        toneClass: "tone-analogy",
        text: "If you run a power plant, you don't necessarily need to build the generators, right? Equipment can be made by others — as long as the price is reasonable, why make it yourself?",
      },
    ],
  },
  {
    group: "analogy",
    name: "Bell Labs",
    quotes: [
      {
        page: 40,
        tone: "Comparison",
        toneClass: "tone-compare",
        text: "We're different from Bell Labs — they explicitly didn't need commercialization... but we clearly do. We ultimately need to survive — we're a company, the government won't give us a cent.",
      },
    ],
  },
  {
    group: "analogy",
    name: "DeepMind / AlphaGo",
    quotes: [
      {
        page: 30,
        tone: "Analogy",
        toneClass: "tone-analogy",
        text: "In Go, AlphaGo made a move no human had ever seen. It definitely surpasses humans within a certain domain.",
      },
    ],
  },
];
