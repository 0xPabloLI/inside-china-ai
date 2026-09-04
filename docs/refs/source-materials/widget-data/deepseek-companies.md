# Widget Data: deepseek-companies

> Exported from `src/components/widgets/deepseek/data/companies.ts`
> Widget type: 引述矩阵（quote matrix）— 按公司分组展示梁文锋在投资者交流会上对各公司的评价
> Last updated: 2026-07-28 (git: 2026-07-28 18:53:54 +0800)
> View component: `src/components/widgets/deepseek/companies-view.tsx` → `CompaniesView`

## Data

### Company Groups

| ID      | Chinese      | English              |
| ------- | ------------ | -------------------- |
| us-ai   | 国外 AI 巨头 | US AI Giants         |
| us-chip | 国外芯片     | US Chips             |
| cn-ai   | 国内 AI 公司 | Chinese AI Companies |
| cn-chip | 国内芯片     | Domestic Chips       |
| analogy | 类比 / 参考  | References           |

### Companies & Quotes (14 companies, 30 quotes)

#### US AI Giants

| Company   | Page | Tone (ZH/EN)      | Quote (ZH)                                                                                                                      | Quote (EN)                                                                                                                                        |
| --------- | ---- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI    | 20   | 对比 / Comparison | Anthropic 跟现在超过 OpenAI，这是不是长期的？我觉得这不是长期的，这肯定是极端性的。OpenAI 和 Google，未来大概率还是会交替上升。 | Anthropic surpassing OpenAI — is that long-term? I don't think so, it's certainly an extreme. OpenAI and Google will likely alternate at the top. |
| OpenAI    | 20   | 客观 / Objective  | 我们公司可能有一半的人，平时有一半的人觉得 OpenAI 是更好的。                                                                    | Probably half the people in our company think OpenAI is better.                                                                                   |
| OpenAI    | 25   | 评论 / Commentary | OpenAI 算这个账好像是能算得过来的…他会被另外一个愿意只占百分之一的人打败。                                                      | OpenAI's math works out in theory. But he'll be beaten by someone willing to take only 1%.                                                        |
| OpenAI    | 38   | 客观 / Objective  | 对 OpenAI 来讲、对国外来讲、对 Anthropic 来讲，他们都更早，然后资本更多，卡也更多。                                             | OpenAI, Anthropic — they started earlier, have more capital, and more chips.                                                                      |
| OpenAI    | 16   | 评论 / Commentary | 视频生成一开始 Sora 出来之后，所有人都做…小公司后来都把它砍掉了。                                                               | When Sora came out, everyone did video generation — small companies later cut it.                                                                 |
| Anthropic | 20   | 评论 / Commentary | Anthropic 在 Code Agent 上的优势没有那么大…先发优势应该很快就没了。                                                             | Anthropic's advantage in Code Agent isn't that big — first-mover advantage will be gone soon.                                                     |
| Anthropic | 38   | 客观 / Objective  | Anthropic 和 OpenAI 都投入巨大的金额（在后训练上）。                                                                            | Both Anthropic and OpenAI have invested enormous sums (in post-training).                                                                         |
| Anthropic | 39   | 对比 / Comparison | Anthropic 用自己的模型做自己的产品，推出了很多纵向的金融、法律。                                                                | Anthropic uses its own models for its own products — finance, legal, even healthcare.                                                             |
| Google    | 20   | 客观 / Objective  | OpenAI 和 Google，未来大概率还是会交替上升。                                                                                    | OpenAI and Google will likely alternate at the top going forward.                                                                                 |

#### US Chips

| Company | Page | Tone (ZH/EN)      | Quote (ZH)                                                       | Quote (EN)                                                                                   |
| ------- | ---- | ----------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| NVIDIA  | 15   | 客观 / Objective  | 接下来几个月我们还会有大批量的机器买过来，基本上都是英伟达。     | In the coming months we'll have large batches of machines arriving — basically all NVIDIA.   |
| NVIDIA  | 15   | 认可 / Positive   | 我把钱变成英伟达卡，肯定是比放在银行里好。                       | Turning money into NVIDIA cards is certainly better than leaving it in the bank.             |
| NVIDIA  | 20   | 认可 / Positive   | 国产卡适配有一个难题，叫生态不好…英伟达的护城河是很强的。        | Domestic chips face an ecosystem problem — NVIDIA's moat is very strong.                     |
| NVIDIA  | 21   | 评论 / Commentary | 英伟达 CUDA 的护城河在快速地被瓦解。                             | NVIDIA's CUDA moat is being rapidly dismantled.                                              |
| NVIDIA  | 21   | 评论 / Commentary | CUDA 从游戏卡演变出来的…英伟达生态的作用就大幅度减少了。         | CUDA evolved from gaming cards — NVIDIA's ecosystem advantage is greatly diminished.         |
| NVIDIA  | 21   | 评论 / Commentary | 英伟达挡不住。如果买不到英伟达的卡，所有人都迫不得已做国产芯片。 | NVIDIA can't stop this. When you can't buy NVIDIA, everyone is forced to use domestic chips. |
| NVIDIA  | 22   | 客观 / Objective  | V3 训练时用了英伟达的卡，但已经不用英伟达的生态了。              | When training V3, we used NVIDIA cards, but no longer used NVIDIA's ecosystem.               |
| NVIDIA  | 22   | 评论 / Commentary | 我对国产算力是比较乐观的。英伟达是在掘自己的坟墓。               | I'm quite optimistic about domestic compute. NVIDIA is digging its own grave.                |
| NVIDIA  | 23   | 客观 / Objective  | 芯片差距：生态上以后不会再有差距，但硬件上是四倍加两年。         | Chip gap: no ecosystem gap going forward, but in hardware it's 4x plus 2 years.              |
| NVIDIA  | 31   | 客观 / Objective  | 英伟达的卡基本上按五年折旧。                                     | NVIDIA cards can basically be depreciated over five years.                                   |

#### Chinese AI Companies

| Company     | Page | Tone (ZH/EN)      | Quote (ZH)                                                                    | Quote (EN)                                                                                                                  |
| ----------- | ---- | ----------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Zhipu AI    | 3    | 对比 / Comparison | 智谱也开源，但智谱的开源有一种被迫的感觉…对我们来讲，这就是我们的本意。       | Zhipu also open sources, but theirs feels forced — for us, it is our intention.                                             |
| Zhipu AI    | 14   | 客观 / Objective  | 我们很愿意协助、帮助任何人，甚至我们的竞争对手。                              | We're very willing to help anyone — even competitors.                                                                       |
| Moonshot AI | 14   | 客观 / Objective  | （同上，与阿里、智谱并列为竞争对手）                                          | (Same as above, listed alongside Alibaba, Zhipu)                                                                            |
| ByteDance   | 6    | 对比 / Comparison | 完全没有想法要做成下一个字节、做成下一个腾讯。                                | No thought of becoming the next ByteDance or Tencent.                                                                       |
| ByteDance   | 6    | 克制 / Restraint  | 跟字节去抢用户也是一种打法。但我们选择非常克制的做法。                        | Spending big to grab users from ByteDance is one approach. But we chose restraint.                                          |
| ByteDance   | 7    | 评论 / Commentary | 字节它的模型是闭源的，它有什么好处？我看不到有什么好处。                      | ByteDance's model is closed-source — what's the benefit? I don't see any.                                                   |
| Alibaba     | 5    | 对比 / Comparison | 阿里或者腾讯，他不是我们的优化，他的成本应该是要高好几倍的。                  | Alibaba or Tencent — their costs should be several times higher than ours.                                                  |
| Alibaba     | 14   | 客观 / Objective  | 我们很愿意协助、帮助任何人，甚至我们的竞争对手。                              | We're very willing to help anyone — even competitors.                                                                       |
| Alibaba     | 31   | 客观 / Objective  | 对于腾讯、阿里巴巴能买到的话，再看量；但相信买不到。                          | For Tencent and Alibaba, if they can buy [B200 cards], it depends on volume; but they probably can't.                       |
| Tencent     | 5    | 对比 / Comparison | （同 Alibaba，成本对比）                                                      | (Same as Alibaba, cost comparison)                                                                                          |
| Tencent     | 6    | 克制 / Restraint  | 做成下一个腾讯，完全没有这样的想法。                                          | Becoming the next Tencent — no such thought at all.                                                                         |
| Tencent     | 9    | 客观 / Objective  | 腾讯自己流量很多，他部署我们的开源模型，就把 C 端用户都抢走了。但其实并不会。 | Tencent has lots of traffic — they deploy our open-source model and take all C-end users. But actually that doesn't happen. |
| Tencent     | 31   | 客观 / Objective  | （同 Alibaba，B200 购买讨论）                                                 | (Same as Alibaba, B200 purchase discussion)                                                                                 |

#### Domestic Chips

| Company | Page | Tone (ZH/EN)      | Quote (ZH)                                                                            | Quote (EN)                                                                                                  |
| ------- | ---- | ----------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Huawei  | 17   | 客观 / Objective  | 训练同样大的模型需要五万张 GB300，或华为 950 二十万卡。                               | To train a leading-size model: 50K GB300 cards, or 200K Huawei 950 cards.                                   |
| Huawei  | 17   | 评论 / Commentary | 华为的产量也是有限的。训几百 B 需要二十万张华为最新的卡。                             | Huawei's production capacity is limited. Training a few hundred B needs 200K Huawei cards.                  |
| Huawei  | 21   | 客观 / Objective  | 不管是华为还是英伟达自己，以后都是专用芯片。                                          | Whether Huawei or NVIDIA, going forward they'll all be specialized chips.                                   |
| Huawei  | 22   | 认可 / Positive   | 我们主要跟华为有合作…华为的问题还是产能不够。                                         | We mainly cooperate with Huawei — Huawei's problem is still insufficient production capacity.               |
| Huawei  | 22   | 客观 / Objective  | 华给我们大概一万六千张卡的产能。                                                      | Huawei gives us about 16K cards of capacity.                                                                |
| Huawei  | 22   | 认可 / Positive   | 华为 950 超节点可以完全平替英伟达 GB200/GB300。四张华为卡顶一张英伟达的卡，落后两年。 | Huawei super-node 950 can fully replace NVIDIA GB200/GB300. 4 Huawei cards = 1 NVIDIA card, 2 years behind. |
| Huawei  | 22   | 认可 / Positive   | 华为卡适配，我们主要做高级语言编译器和 TileLang。                                     | For Huawei cards, our main work is the high-level language compiler and TileLang.                           |
| Huawei  | 31   | 客观 / Objective  | 华为的卡最多按三年折旧。                                                              | Huawei cards can be depreciated over three years at most.                                                   |
| Huawei  | 34   | 认可 / Positive   | 买华为 950 的目的，还是希望帮华为把这个生态做好。                                     | Our purpose in buying Huawei 950 is to help Huawei build a good ecosystem.                                  |

#### References (Analogies)

| Company               | Page | Tone              | Quote (ZH)                                                         | Quote (EN)                                                                                       |
| --------------------- | ---- | ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| GE (General Electric) | 2    | 认可 / Positive   | 管理上最崇拜杰克·韦尔奇…一个公司最重要的是它的愿景。               | Jack Welch is who I admired most in management — a company's most important thing is its vision. |
| BYD                   | 18   | 类比 / Analogy    | 比亚迪的电池，在同等技术量的情况下，其他家能不能按这个价格来提供？ | Can others match BYD's battery price at the same tech level? Definitely a barrier.               |
| Tesla                 | 23   | 类比 / Analogy    | 运营发电厂不一定需要去造发电机。                                   | If you run a power plant, you don't necessarily need to build the generators.                    |
| Bell Labs             | 40   | 对比 / Comparison | 我们跟 Bell Labs 不一样，我们明确是要有商业化的。                  | We're different from Bell Labs — we clearly need commercialization.                              |
| DeepMind / AlphaGo    | 30   | 类比 / Analogy    | AlphaGo 下了一手人类从来没有见到过的棋。                           | AlphaGo made a move no human had ever seen.                                                      |

## Sources

- **梁文锋投资者交流会-录音转文本** (PDF, page references in data) → structured as `docs/refs/source-materials/deepseek-liang-investor-meeting-research.md`
- No explicit `sourceUrl` field in data; all quotes reference the PDF by page number.

## Related Articles

- Not embedded in any published article via `<!-- widget:deepseek-companies -->`.
- Content relates to `deepseek-art-of-restraint` (梁文锋投资者交流会 article).
