# Deep Research: China AI Entity → TikTok Hashtag Mapping

> Generated: 2026-08-26
> Mode: Standard (6-phase pipeline)
> Sources: 15+ web sources (see Bibliography)

## Executive Summary

This report establishes a comprehensive mapping of China AI entities (companies, products, founders) to TikTok hashtags for use in the short-video pipeline's `caption-utils.mjs`. The research covers 50+ entities across 7 tiers: Big Tech AI labs, AI startups (Six Tigers + DeepSeek), AI chips, robotics, autonomous driving, international competitors, and product/platform brands.

The previous `ENTITY_HASHTAG_MAP` had 18 company entries. This research expands it to 60+ entries covering company names, product names, model names, and founder names. The key insight is that TikTok hashtags exist for most major Chinese AI companies and products, but many smaller entities (e.g., specific model versions) do not have dedicated hashtag pages — in those cases, the parent company hashtag should be used.

HashtagRadar (tiktokhashtags.com) is an independent hashtag discovery platform using cached TikTok API data. It is not affiliated with TikTok/ByteDance. Its data is historical (not real-time) and should be used as a research starting point, not a guarantee. We can absorb its methodology (related hashtags, average views per post) but should verify data directly on TikTok.

## Entity Tiers & Mapping

### Tier 1: Big Tech AI Labs

| Company   | Key Products / Models                                                                                                                  | Founder / Lead                                           | TikTok Hashtag                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Alibaba   | Qwen (通义千问), Wan (万相), Z-Image, HappyHorse, Quark, DingTalk                                                                      | Jack Ma (马云, founder), Eddie Wu (吴泳铭, CEO)          | `#alibaba`, `#qwen`, `#alibabacloud`                                |
| ByteDance | Doubao (豆包), Seed/Seedance (video), Seedream (image), Dreamina, Jimeng (即梦), CapCut, Feishu/Lark (飞书), Volcano Engine (火山引擎) | Zhang Yiming (张一鸣, founder), Liang Rubo (梁汝波, CEO) | `#bytedance`, `#doubao`, `#feishu`, `#lark`, `#capcut`, `#dreamina` |
| Baidu     | ERNIE (文心一言), Apollo (robotaxi)                                                                                                    | Robin Li (李彦宏, founder/CEO)                           | `#baidu`, `#ernie`                                                  |
| Tencent   | Hunyuan (混元), Yuanbao (元宝)                                                                                                         | Pony Ma (马化腾, founder/CEO)                            | `#tencent`, `#hunyuan`                                              |
| Huawei    | Pangu (盘古), Ascend (昇腾)                                                                                                            | Ren Zhengfei (任正非, founder)                           | `#huawei`, `#pangu`                                                 |
| Xiaomi    | MiMo                                                                                                                                   | Lei Jun (雷军, founder/CEO)                              | `#xiaomi`                                                           |
| Kuaishou  | Kling (可灵)                                                                                                                           | Su Hua (宿华, founder)                                   | `#kuaishou`, `#kling`                                               |
| iFlytek   | Spark (讯飞星火)                                                                                                                       | Liu Qingfeng (刘庆峰, founder/CEO)                       | `#iflytek`                                                          |

### Tier 2: AI Startups (Six Tigers + DeepSeek)

| Company         | Key Products / Models       | Founder                            | TikTok Hashtag        |
| --------------- | --------------------------- | ---------------------------------- | --------------------- |
| DeepSeek        | V4, R1                      | Liang Wenfeng (梁文锋)             | `#deepseek`           |
| Zhipu AI (Z.ai) | GLM series                  | Tang Jie (唐杰), Zhang Peng (张鹏) | `#zhipu`, `#zai`      |
| Moonshot AI     | Kimi (K3)                   | Yang Zhilin (杨植麟)               | `#kimi`, `#moonshot`  |
| MiniMax         | M2.x, Hailuo (海螺), Talkie | Yan Juncong (闫俊杰)               | `#minimax`, `#hailuo` |
| Baichuan        | Baichuan models             | Wang Xiaochuan (王小川)            | `#baichuan`           |
| StepFun         | Step-2, Step3               | (ex-Microsoft exec)                | `#stepfun`            |
| 01.AI           | Yi models, Wanzhi           | Kai-Fu Lee (李开复)                | `#01ai`, `#yimodel`   |

### Tier 3: AI Chips

| Company                   | Key Products   | Founders                                   | TikTok Hashtag     |
| ------------------------- | -------------- | ------------------------------------------ | ------------------ |
| Cambricon (寒武纪)        | Siyuan 590/690 | Chen Yunji & Chen Tianshi (陈云霁, 陈天石) | `#cambricon`       |
| Horizon Robotics (地平线) | Journey series | Yu Kai (余凯)                              | `#horizonrobotics` |

### Tier 4: Robotics

| Company                       | Key Products       | TikTok Hashtag |
| ----------------------------- | ------------------ | -------------- |
| Unitree (宇树)                | Go2, H1 humanoid   | `#unitree`     |
| UBTECH (优必选)               | Walker S2          | `#ubtech`      |
| AgiBot (智元)                 | Agibot X1          | `#agibot`      |
| Fourier Intelligence (傅利叶) | therapeutic robots | `#fourier`     |

### Tier 5: Autonomous Driving

| Company            | Key Products  | Founder             | TikTok Hashtag |
| ------------------ | ------------- | ------------------- | -------------- |
| Pony.ai (小马智行) | robotaxi      | James Peng (彭军)   | `#ponyai`      |
| WeRide (文远知行)  | robotaxi      | Tony Han (韩旭)     | `#weride`      |
| Momenta            | ADAS/robotaxi | Cao Xudong (曹旭东) | `#momenta`     |
| Baidu Apollo       | robotaxi      | (Baidu subsidiary)  | `#apollo`      |

### Tier 6: International Competitors (frequently mentioned in comparisons)

| Company   | Key Products   | TikTok Hashtag                 |
| --------- | -------------- | ------------------------------ |
| OpenAI    | ChatGPT, Sora  | `#chatgpt`, `#openai`, `#sora` |
| Google    | Gemini, Veo    | `#gemini`, `#google`           |
| Meta      | Llama          | `#meta`, `#llama`              |
| Anthropic | Claude         | `#claude`, `#anthropic`        |
| Mistral   | Mistral models | `#mistral`                     |
| Nvidia    | GPU, CUDA      | `#nvidia`                      |

### Tier 7: Product/Platform Brands (subsidiary products)

| Product                   | Parent Company | TikTok Hashtag     |
| ------------------------- | -------------- | ------------------ |
| Feishu/Lark (飞书)        | ByteDance      | `#feishu`, `#lark` |
| CapCut                    | ByteDance      | `#capcut`          |
| Dreamina                  | ByteDance      | `#dreamina`        |
| Volcano Engine (火山引擎) | ByteDance      | `#volcanoengine`   |
| DingTalk (钉钉)           | Alibaba        | `#dingtalk`        |
| Quark (夸克)              | Alibaba        | `#quark`           |
| Yuanbao (元宝)            | Tencent        | `#yuanbao`         |
| Seedance                  | ByteDance      | `#seedance`        |
| Kling (可灵)              | Kuaishou       | `#kling`           |
| Hailuo (海螺)             | MiniMax        | `#hailuo`          |
| Talkie                    | MiniMax        | `#talkie`          |
| Sora                      | OpenAI         | `#sora`            |
| Veo                       | Google         | `#veo`             |

## HashtagRadar (tiktokhashtags.com) Analysis

### Background

HashtagRadar is an independent research and discovery platform that turns a large historical TikTok hashtag dataset into clear information for content decisions. It is **not affiliated with, endorsed by, or officially connected to TikTok, ByteDance, or any other social media platform**.

### Data Source

- Historical TikTok hashtag records (cached TikTok API data)
- Aggregated usage information (posts, views, average views per post)
- Relationships between hashtags (related terms)
- **Not real-time** — data may be outdated

### Can We Absorb It?

**Methodology: Yes.** Their approach of comparing hashtags by views, posts, and average views per post is sound and we already use it.

**Data: As reference only.** We should not rely on HashtagRadar as our sole data source because:

1. Data is historical, not real-time
2. Coverage is incomplete — many Chinese AI company hashtags have no data on HashtagRadar
3. TikTok's own `/tag/` pages and Creative Center are more current

**Recommendation:** Continue using HashtagRadar for initial research, but verify on TikTok directly. For the `ENTITY_HASHTAG_MAP`, we use company → hashtag mapping (not data-driven by views), so HashtagRadar's role is discovery (finding which hashtags exist) rather than data provision.

## Recommendations for `ENTITY_HASHTAG_MAP`

### Structure Change

The map should be expanded from company-name-only to a multi-key lookup:

```javascript
const ENTITY_HASHTAG_MAP = {
  // Tier 1: Big Tech
  alibaba: "#alibaba",
  qwen: "#qwen",
  tongyi: "#qwen", // 通义
  wan: "#wan", // 万相 video model
  bytedance: "#bytedance",
  doubao: "#doubao",
  seedance: "#seedance",
  dreamina: "#dreamina",
  jimeng: "#dreamina", // 即梦 = Dreamina CN
  seedream: "#seedream",
  feishu: "#feishu",
  lark: "#feishu",
  capcut: "#capcut",
  "volcano engine": "#volcanoengine",
  baidu: "#baidu",
  ernie: "#ernie",
  wenxin: "#ernie", // 文心 = ERNIE CN
  apollo: "#apollo",
  tencent: "#tencent",
  hunyuan: "#hunyuan",
  yuanbao: "#yuanbao",
  huawei: "#huawei",
  pangu: "#pangu",
  xiaomi: "#xiaomi",
  mimo: "#xiaomi", // MiMo → parent company hashtag
  kuaishou: "#kuaishou",
  kling: "#kling",
  iflytek: "#iflytek",
  spark: "#iflytek", // Spark → parent company hashtag

  // Tier 2: Startups
  deepseek: "#deepseek",
  zhipu: "#zhipu",
  "z.ai": "#zhipu",
  glm: "#zhipu",
  moonshot: "#kimi",
  kimi: "#kimi",
  minimax: "#minimax",
  hailuo: "#hailuo",
  talkie: "#talkie",
  baichuan: "#baichuan",
  stepfun: "#stepfun",
  "01.ai": "#01ai",
  yi: "#01ai", // Yi models → 01.AI

  // Tier 3: AI Chips
  cambricon: "#cambricon",
  "horizon robotics": "#horizonrobotics",
  horizon: "#horizonrobotics",

  // Tier 4: Robotics
  unitree: "#unitree",
  ubtech: "#ubtech",
  agibot: "#agibot",
  fourier: "#fourier",

  // Tier 5: Autonomous Driving
  "pony.ai": "#ponyai",
  ponyai: "#ponyai",
  weride: "#weride",
  momenta: "#momenta",

  // Tier 6: International
  openai: "#chatgpt",
  chatgpt: "#chatgpt",
  sora: "#sora",
  google: "#google",
  gemini: "#gemini",
  veo: "#veo",
  meta: "#meta",
  llama: "#llama",
  anthropic: "#anthropic",
  claude: "#claude",
  mistral: "#mistral",
  nvidia: "#nvidia",
};
```

### Key Design Decisions

1. **Product → Parent hashtag**: For products without their own TikTok hashtag presence (e.g., MiMo, Spark, Wenxin), map to the parent company's hashtag. This ensures the hashtag actually exists on TikTok and has meaningful content.

2. **Multiple keys → same hashtag**: Both company name and product name map to the same hashtag when they're the same entity on TikTok (e.g., `moonshot` and `kimi` both → `#kimi`).

3. **Chinese name aliases**: Common Chinese names that Western audiences might use are included (e.g., `wenxin` → `#ernie`, `tongyi` → `#qwen`).

4. **No founder hashtags**: Founders (Liang Wenfeng, Kai-Fu Lee, etc.) are not mapped to hashtags — TikTok hashtags for individuals are not part of the entity hashtag strategy. Founders are mentioned in voiceover and description text for SEO, not as hashtags.

5. **Per-content `keyEntities.companies`**: The scene-data `meta.mjs` should list the primary companies (not products or founders) in `keyEntities.companies`. The expanded map then handles product-name lookups automatically.

## Bibliography

1. mighil.com — "Top AI Companies in China (The Complete List)" — https://mighil.com/top-ai-companies-in-china
2. faxiangongchang.com — "China AI LLM Applications 2026" — https://faxiangongchang.com/en/reports/china-ai-llm-application-2026
3. secondtalent.com — "Top 10 Hottest Chinese AI Startups 2026" — https://www.secondtalent.com/resources/top-hottest-chinese-ai-startups-to-look-after/
4. explainx.ai — "Top Chinese AI companies 2026" — https://explainx.ai/blog/top-chinese-ai-companies-startups-guide-2026
5. interconnects.ai — "Ranking Chinese Open Model Builders" — https://www.interconnects.ai/p/chinas-top-19-open-model-labs
6. chinaai.news — "Chinese AI Companies: The 2026 Guide" — https://chinaai.news/companies
7. aiprofitboardroom.com — "Chinese AI Models (2026)" — https://aiprofitboardroom.com/blog/chinese-ai-models/
8. digitalapplied.com — "Chinese AI Models Q2 2026 Market Share" — https://www.digitalapplied.com/blog/chinese-ai-models-q2-2026-market-share-report
9. presenc.ai — "Chinese Open-Source LLM Leaderboard 2026" — https://presenc.ai/research/chinese-open-source-llm-companies-leaderboard-2026
10. geotoolbox.ai — "Chinese AI Models Compared" — https://geotoolbox.ai/blog/chinese-ai-models-compared
11. thewirechina.com — "Who's Who: China's AI Industry" — https://www.thewirechina.com/chinas-ai-industry/
12. cna.com — "Faces behind China's AI rise" — https://www.channelnewsasia.com/east-asia/china-deepseek-zhipu-ai-moonshot-liang-wenfeng-yang-zhilin-tang-jie-6269866
13. forbes.com — "Forbes China AI TOP 50 2026" — https://www.newsfilecorp.com/release/298372/
14. tiktokhashtags.com/about — "About HashtagRadar" — https://tiktokhashtags.com/about/
15. neuralcatalog.com — "AI Companies in China Directory" — https://neuralcatalog.com/country/china
16. gptproto.com — "Best Chinese AI Video Models 2026" — https://gptproto.com/blog/best-chinese-ai-video-models-2026
17. rankred.com — "Top Chinese AI Companies 2026" — https://www.rankred.com/chinese-ai-companies/
18. semifundamental.substack.com — "China AI Model Fundamentals" — https://semifundamental.substack.com/p/china-ai-model-fundamentals

## Methodology Appendix

- **Mode**: Standard (6-phase)
- **Search date**: 2026-08-26
- **Search tools**: Brave Web Search, web_fetch, Jina Reader
- **Search queries**: 4 parallel searches covering company lists, founders/CEOs, product/model names, and HashtagRadar background
- **Source count**: 18 sources
- **Coverage gaps**: TikTok hashtag view/post data not individually verified per entity (would require scraping each `/tag/` page). The map prioritizes existence-based mapping (company name → hashtag) over data-driven optimization (which hashtag has more views).
- **Limitations**: Hashtag view counts on TikTok change frequently. The map uses stable entity→hashtag mappings that don't depend on view count. View count optimization is handled separately in `CORE_TRAFFIC_HASHTAGS` and `PAD_CANDIDATES`.
