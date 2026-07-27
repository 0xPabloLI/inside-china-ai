export interface CompanyGroup {
  id: string;
  zh: string;
  en: string;
}

export interface Quote {
  page: number;
  toneZh: string;
  toneEn: string;
  toneClass: string;
  zh: string;
  en: string;
}

export interface Company {
  group: string;
  nameZh: string;
  nameEn: string;
  quotes: Quote[];
}

export const COMPANY_GROUPS: CompanyGroup[] = [
  { id: "us-ai", zh: "国外 AI 巨头", en: "US AI Giants" },
  { id: "us-chip", zh: "国外芯片", en: "US Chips" },
  { id: "cn-ai", zh: "国内 AI 公司", en: "Chinese AI Companies" },
  { id: "cn-chip", zh: "国内芯片", en: "Domestic Chips" },
  { id: "analogy", zh: "类比 / 参考", en: "References" },
];

export const COMPANIES: Company[] = [
  // ── US AI Giants ──
  {
    group: "us-ai",
    nameZh: "OpenAI",
    nameEn: "OpenAI",
    quotes: [
      { page: 20, toneZh: "对比", toneEn: "Comparison", toneClass: "tone-compare",
        zh: "Anthropic 跟现在超过 OpenAI，这是不是长期的？我觉得这不是长期的，这肯定是极端性的。OpenAI 和 Google，未来大概率还是会交替上升。",
        en: "Anthropic surpassing OpenAI — is that long-term? I don't think so, it's certainly an extreme. OpenAI and Google will likely alternate at the top." },
      { page: 20, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "我们公司可能有一半的人，平时有一半的人觉得 OpenAI 是更好的。",
        en: "Probably half the people in our company think OpenAI is better." },
      { page: 25, toneZh: "评论", toneEn: "Commentary", toneClass: "tone-critique",
        zh: "你看 OpenAI，他算这个账好像是能算得过来的，理论上是没有问题的。但是他有个问题，他会被另外一个愿意只占百分之一的人打败。OpenAI 从一开始觉得他真的能够垄断这个世界，但是实际上他会遇到很多很多挑战者。",
        en: "OpenAI's math works out in theory. But he'll be beaten by someone willing to take only 1%. OpenAI thought it could monopolize the world, but it will face many challengers." },
      { page: 38, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "对 OpenAI 来讲、对国外来讲、对 Anthropic 来讲，他们都更早，然后资本更多，卡也更多。",
        en: "OpenAI, Anthropic — they started earlier, have more capital, and more chips." },
      { page: 16, toneZh: "评论", toneEn: "Commentary", toneClass: "tone-critique",
        zh: "视频生成一开始 Sora 出来之后，所有人都做，大公司、小公司都做。但是小公司后来都把它砍掉了。它跟智能的上限没有关系。但在商业上，它是个好生意。",
        en: "When Sora came out, everyone did video generation — big and small companies. But small companies later cut it. It has nothing to do with intelligence limits. Commercially, it's a good business." },
    ],
  },
  {
    group: "us-ai",
    nameZh: "Anthropic",
    nameEn: "Anthropic",
    quotes: [
      { page: 20, toneZh: "评论", toneEn: "Commentary", toneClass: "tone-critique",
        zh: "其实现在 Anthropic 在 Code Agent 上的优势没有那么大，其实并没有说它碾压 OpenAI。其实 Anthropic 它有先发优势，但这先发优势应该很快就没了，并不是一个它能够长期占得住的优势。",
        en: "Anthropic's advantage in Code Agent isn't that big — it's not crushing OpenAI. They have a first-mover advantage, but it'll be gone soon." },
      { page: 38, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "像 Anthropic 和 OpenAI 都投入巨大的金额（在后训练上）。",
        en: "Both Anthropic and OpenAI have invested enormous sums (in post-training)." },
      { page: 39, toneZh: "对比", toneEn: "Comparison", toneClass: "tone-compare",
        zh: "我们看到 Anthropic 他们用自己的模型做自己的产品，推出了很多纵向的金融、法律，甚至未来要往医疗方向走。",
        en: "Anthropic uses its own models for its own products — finance, legal, even healthcare." },
    ],
  },
  {
    group: "us-ai",
    nameZh: "Google",
    nameEn: "Google",
    quotes: [
      { page: 20, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "OpenAI 和 Google，未来大概率还是会交替上升，应该是会交替上升。",
        en: "OpenAI and Google will likely alternate at the top going forward." },
    ],
  },

  // ── US Chips ──
  {
    group: "us-chip",
    nameZh: "英伟达",
    nameEn: "NVIDIA",
    quotes: [
      { page: 15, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "接下来几个月我们还会有大批量的机器买过来，基本上都是英伟达。",
        en: "In the coming months we'll have large batches of machines arriving — basically all NVIDIA." },
      { page: 15, toneZh: "认可", toneEn: "Positive", toneClass: "tone-positive",
        zh: "我半年之内就把这个钱花完的话，可能是最理想的。因为我把钱变成英伟达卡，肯定是比放在银行里好。",
        en: "If I spend all the money in six months, that'd be ideal. Turning money into NVIDIA cards is certainly better than leaving it in the bank." },
      { page: 20, toneZh: "认可", toneEn: "Positive", toneClass: "tone-positive",
        zh: "国产卡适配有一个难题，叫生态不好。就买了卡之后，但是用不起来，它没有英伟达那个生态。所以说英伟达的护城河是很强的。",
        en: "Domestic chips face an ecosystem problem — you buy them but can't use them, they lack NVIDIA's ecosystem. So NVIDIA's moat is very strong." },
      { page: 21, toneZh: "评论", toneEn: "Commentary", toneClass: "tone-critique",
        zh: "但是这个事情在发生变化。英伟达 CUDA 的护城河在快速地被瓦解。我可以用来构建这个生态，就可以把跟英伟达一模一样的生态构建出来。",
        en: "But this is changing. NVIDIA's CUDA moat is being rapidly dismantled. We can build an ecosystem identical to NVIDIA's." },
      { page: 21, toneZh: "评论", toneEn: "Commentary", toneClass: "tone-critique",
        zh: "因为 CUDA，英伟达它是从游戏卡演变出来的……原来英伟达生态的作用就大幅度减少了。",
        en: "CUDA evolved from gaming cards... so NVIDIA's ecosystem advantage is greatly diminished." },
      { page: 21, toneZh: "评论", toneEn: "Commentary", toneClass: "tone-critique",
        zh: "没有障碍，英伟达挡不住。如果是在一个正常的商业环境里面，我能买到英伟达的卡，那么国产替代是比较难的；但是在英伟达的卡买不到的情况下，所有人都迫不得已，都要去做国产芯片。",
        en: "No obstacle — NVIDIA can't stop this. In a normal commercial environment where NVIDIA cards are available, domestic substitution is hard. But when you can't buy NVIDIA, everyone is forced to use domestic chips." },
      { page: 22, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "V3 训练的时候，它用的还是英伟达的卡，但是已经不用英伟达的生态了。",
        en: "When training V3, we used NVIDIA cards, but no longer used NVIDIA's ecosystem." },
      { page: 22, toneZh: "评论", toneEn: "Commentary", toneClass: "tone-critique",
        zh: "我对国产算力是比较乐观的。我觉得在这一点上，英伟达是在掘自己的坟墓。",
        en: "I'm quite optimistic about domestic compute. On this point, NVIDIA is digging its own grave." },
      { page: 23, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "英伟达今年 Q3 可能已经有新一代了。所以我们跟美国在芯片上的差距，我认为生态上以后不会再有差距，但是在芯片上是四倍加两年。",
        en: "NVIDIA may have a new generation in Q3 this year. Our gap with the US in chips: no ecosystem gap going forward, but in hardware it's 4x plus 2 years." },
      { page: 31, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "英伟达的卡基本上你可以按照五年折旧。",
        en: "NVIDIA cards can basically be depreciated over five years." },
    ],
  },

  // ── Chinese AI Companies ──
  {
    group: "cn-ai",
    nameZh: "智谱",
    nameEn: "Zhipu AI",
    quotes: [
      { page: 3, toneZh: "对比", toneEn: "Comparison", toneClass: "tone-compare",
        zh: "智谱也开源，但是智谱的开源跟我们的开源不一样。智谱的开源有一种被迫的感觉，他们觉得这不是本意，但是对我们来讲，这就是我们的本意。",
        en: "Zhipu also open sources, but their open source is different from ours. Theirs feels forced — they think it's not their original intention. For us, it is our intention." },
      { page: 14, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "我们是很愿意协助、帮助任何人，甚至我们的竞争对手，包括阿里、智谱、月之暗面，做得更好。",
        en: "We're very willing to help anyone — even competitors like Alibaba, Zhipu, Moonshot — do better." },
    ],
  },
  {
    group: "cn-ai",
    nameZh: "月之暗面",
    nameEn: "Moonshot AI",
    quotes: [
      { page: 14, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "我们是很愿意协助、帮助任何人，甚至我们的竞争对手，包括阿里、智谱、月之暗面，做得更好。",
        en: "We're very willing to help anyone — even competitors like Alibaba, Zhipu, Moonshot — do better." },
    ],
  },
  {
    group: "cn-ai",
    nameZh: "字节跳动",
    nameEn: "ByteDance",
    quotes: [
      { page: 6, toneZh: "对比", toneEn: "Comparison", toneClass: "tone-compare",
        zh: "我们并不会有这样的想法，说我要做成下一个超级 App，然后我要去跟谁竞争，我要做成下一个字节、做成下一个腾讯，完全没有这样的想法。",
        en: "We don't have the idea of becoming the next super App, competing with others, becoming the next ByteDance or Tencent — no such thought at all." },
      { page: 6, toneZh: "克制", toneEn: "Restraint", toneClass: "tone-compare",
        zh: "如果去年时候我们用了大笔钱，就跟字节去抢用户，也是一种打法。但是我们选择是一种非常克制的做法，就是我不跟你去争这个东西，因为后面还有西瓜，前面的可能都是芝麻。",
        en: "If we'd spent big money last year to grab users from ByteDance, that'd be one approach. But we chose restraint — not competing for this, because the watermelon is still ahead; the front stuff is just sesame seeds." },
      { page: 7, toneZh: "评论", toneEn: "Commentary", toneClass: "tone-critique",
        zh: "字节它的模型是闭源的，它有什么好处？我看不到有什么好处。",
        en: "ByteDance's model is closed-source — what's the benefit? I don't see any benefit." },
    ],
  },
  {
    group: "cn-ai",
    nameZh: "阿里",
    nameEn: "Alibaba",
    quotes: [
      { page: 5, toneZh: "对比", toneEn: "Comparison", toneClass: "tone-compare",
        zh: "像可能阿里或者腾讯，他不是我们的优化，他的成本应该是要高好几倍的。",
        en: "Alibaba or Tencent — they don't have our optimization, their costs should be several times higher." },
      { page: 14, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "我们是很愿意协助、帮助任何人，甚至我们的竞争对手，包括阿里、智谱、月之暗面，做得更好。",
        en: "We're very willing to help anyone — even competitors like Alibaba, Zhipu, Moonshot — do better." },
      { page: 31, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "假如说对于腾讯来讲，阿里巴巴能买到的话，再看量；如果合理价格能买到，肯定都是划算的。但不是一个算成本的时候，相信买不到。",
        en: "For Tencent and Alibaba, if they can buy [B200 cards], it depends on volume; at a reasonable price, it's definitely worth it. But right now, they probably can't buy them." },
    ],
  },
  {
    group: "cn-ai",
    nameZh: "腾讯",
    nameEn: "Tencent",
    quotes: [
      { page: 5, toneZh: "对比", toneEn: "Comparison", toneClass: "tone-compare",
        zh: "像可能阿里或者腾讯，他不是我们的优化，他的成本应该是要高好几倍的。",
        en: "Alibaba or Tencent — they don't have our optimization, their costs should be several times higher." },
      { page: 6, toneZh: "克制", toneEn: "Restraint", toneClass: "tone-compare",
        zh: "我要做成下一个字节、做成下一个腾讯，完全没有这样的想法。",
        en: "Becoming the next ByteDance or next Tencent — no such thought at all." },
      { page: 9, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "或者说腾讯自己流量很多，他部署我们的开源模型，他就把所有的 C 端用户都接过去了，就把我的 C 端用户都抢走了。但其实并不会。",
        en: "Tencent has a lot of traffic — they deploy our open-source model and take all C-end users. But actually that doesn't happen." },
      { page: 31, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "假如说对于腾讯来讲，阿里巴巴能买到的话，再看量；如果合理价格能买到，肯定都是划算的。",
        en: "For Tencent and Alibaba, if they can buy [B200 cards], it depends on volume; at a reasonable price, it's definitely worth it." },
    ],
  },

  // ── Domestic Chips ──
  {
    group: "cn-chip",
    nameZh: "华为",
    nameEn: "Huawei",
    quotes: [
      { page: 17, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "如果我要训练跟 AI 同样大的模型，应该需要五万张 GB300，或者华为 950，二十万卡。",
        en: "To train a model as large as the leading ones, I'd need 50K GB300 cards, or 200K Huawei 950 cards." },
      { page: 17, toneZh: "评论", toneEn: "Commentary", toneClass: "tone-critique",
        zh: "华为的产量也是有限的。因为我要训几百 B 的话，我就得二十万张华为最新的卡，这只是训练，还没有考虑做研究。",
        en: "Huawei's production capacity is also limited. To train a few hundred B, I'd need 200K of Huawei's latest cards — just for training, not counting research." },
      { page: 21, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "不管是华为还是英伟达自己，以后都是专用芯片。",
        en: "Whether Huawei or NVIDIA itself, going forward they'll all be specialized chips." },
      { page: 22, toneZh: "认可", toneEn: "Positive", toneClass: "tone-positive",
        zh: "我们现在主要是跟华为有合作。华为他们自己适配，但我们自己会参与这个生态，会深入参与到华为这个里面去。华为的问题还是产能不够。",
        en: "We mainly cooperate with Huawei now. They do their own adaptation, but we participate deeply in their ecosystem. Huawei's problem is still insufficient production capacity." },
      { page: 22, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "华为给我们的大概是一万六千张卡的产能，互联网大厂可能是十几万张，我们一万多张。",
        en: "Huawei gives us about 16K cards of capacity. Internet giants might get over 100K; we get 10K+." },
      { page: 22, toneZh: "认可", toneEn: "Positive", toneClass: "tone-positive",
        zh: "华为的超节点，华为的 950 超节点，在性能和价格上可以完全平替英伟达的 GB200、GB300。价格肯定要贵，但贵得有限。四张华为卡顶一张英伟达的卡，同时落后两年。",
        en: "Huawei's super-node 950 can fully replace NVIDIA's GB200/GB300 in performance and price. More expensive, but only marginally so. Four Huawei cards = one NVIDIA card, and 2 years behind." },
      { page: 22, toneZh: "认可", toneEn: "Positive", toneClass: "tone-positive",
        zh: "华为卡适配，我们主要做的工作是把它的高级语言编译器做好，把 TileLang 做好。",
        en: "For Huawei cards, our main work is building the high-level language compiler and TileLang." },
      { page: 31, toneZh: "客观", toneEn: "Objective", toneClass: "tone-neutral",
        zh: "华为的卡最多按三年折旧。华为卡生命周期肯定会短一点，因为它本来就已经比英伟达晚两年了。但是我觉得差距没那么大。",
        en: "Huawei cards can be depreciated over three years at most. Their lifespan is shorter since they're already 2 years behind NVIDIA. But I think the gap isn't that big." },
      { page: 34, toneZh: "认可", toneEn: "Positive", toneClass: "tone-positive",
        zh: "我们买华为 950 的目的，还是希望帮华为把这个生态做好。",
        en: "Our purpose in buying Huawei 950 is to help Huawei build a good ecosystem." },
    ],
  },

  // ── References ──
  {
    group: "analogy",
    nameZh: "通用电气",
    nameEn: "GE (General Electric)",
    quotes: [
      { page: 2, toneZh: "认可", toneEn: "Positive", toneClass: "tone-positive",
        zh: "我大概二十年前的时候，在管理上我最崇拜的是杰克·韦尔奇，就是 GE 的前 CEO。现在回来看，他说的大部分东西可能都已经不对了，但是他最重要的一点说对了：一个公司最重要的是它的愿景。管理一个大公司，靠的不是你的规章制度，靠的是愿景。",
        en: "About twenty years ago, the person I admired most in management was Jack Welch, GE's former CEO. Looking back now, most of what he said may no longer be correct, but he got the most important point right: a company's most important thing is its vision. Managing a large company relies not on rules and regulations, but on vision." },
    ],
  },
  {
    group: "analogy",
    nameZh: "比亚迪",
    nameEn: "BYD",
    quotes: [
      { page: 18, toneZh: "类比", toneEn: "Analogy", toneClass: "tone-analogy",
        zh: "不如说比亚迪的电池，在同等技术量的情况下，其他家是不是能够按照这个价格来提供，我觉得这个是个较难的事情。不是那么容易做到的，肯定是壁垒。",
        en: "Take BYD's batteries — at the same tech level, can others match that price? I think that's quite hard. Not easy to achieve, it's definitely a barrier." },
    ],
  },
  {
    group: "analogy",
    nameZh: "特斯拉",
    nameEn: "Tesla",
    quotes: [
      { page: 23, toneZh: "类比", toneEn: "Analogy", toneClass: "tone-analogy",
        zh: "假如说你是运营发电厂的，你并不一定需要去造发电机，对不对？发电设备可以是别人造的，只要它的价格合理，你为什么要自己造？",
        en: "If you run a power plant, you don't necessarily need to build the generators, right? Equipment can be made by others — as long as the price is reasonable, why make it yourself?" },
    ],
  },
  {
    group: "analogy",
    nameZh: "Bell Labs",
    nameEn: "Bell Labs",
    quotes: [
      { page: 40, toneZh: "对比", toneEn: "Comparison", toneClass: "tone-compare",
        zh: "我们跟 Bell Labs 还是不一样的，因为它明确是不需要有商业化的……但是我们明确是要有商业化的。我们最终还是要能活下去，我们毕竟是一个公司，政府不会给我一分钱。",
        en: "We're different from Bell Labs — they explicitly didn't need commercialization... but we clearly do. We ultimately need to survive — we're a company, the government won't give us a cent." },
    ],
  },
  {
    group: "analogy",
    nameZh: "AlphaGo",
    nameEn: "DeepMind / AlphaGo",
    quotes: [
      { page: 30, toneZh: "类比", toneEn: "Analogy", toneClass: "tone-analogy",
        zh: "围棋，AlphaGo 他下了一手人类从来没有见到过的棋。就是说，他肯定是在一定的范围内超越人类的。",
        en: "In Go, AlphaGo made a move no human had ever seen. It definitely surpasses humans within a certain domain." },
    ],
  },
];
