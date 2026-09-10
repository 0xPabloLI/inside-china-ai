/**
 * Scene data for DeepSeek V4.1 Flash video.
 * 7 scenes, ~60s. Based on Tencent Tech report (Sep 8, 2026) via WeChat article.
 * Source: https://mp.weixin.qq.com/s/cH7KbScOgqGPhrt2HpPkiQ
 *
 * Narrative type: Breaking News (event-driven, same-day)
 * Hook pattern: P1 Result-First (V4.1 + new architecture is the story)
 *
 * Entity colors: DeepSeek = blue.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    narrativeRole: "S",
    retentionMechanism: null,
    layout: "hero-center",
    mediaStrategy: "asset",
    assetNeed: "DeepSeek logo or AI neural network architecture concept, dark blue tech aesthetic",
    subjectLogo: "deepseek",
    voiceover:
      "DeepSeek just dropped V4.1 Flash with a new architecture and native multimodal.",
    voiceoverTts:
      "DeepSeek just dropped V four point one Flash, with a new architecture and native multimodal.",
    texts: {
      badge: "BREAKING",
      subject: "DEEPSEEK",
      bigNumber: "V4.1",
      numberLabel: "FLASH",
      stats: [
        { num: "0910", unit: "", label: "EXPIRES" },
        { num: "3x", unit: "", label: "VS PRO" },
      ],
      source: "SOURCE: DeepSeek official group, Sep 8",
    },
  },
  {
    id: 2,
    name: "the-test",
    visualType: "narrative",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "API code interface or developer testing screen, dark theme",
    voiceover:
      "On September 8, DeepSeek announced V4.1 Flash testing in its official group. The model ID literally says expires on 0910.",
    voiceoverTts:
      "On September 8, DeepSeek announced V four point one Flash testing in its official group. The model ID literally says expires on September tenth.",
    texts: {
      badge: "SEPTEMBER 8, 2026",
      company: "LIMITED INTERNAL TEST",
      action: "MODEL ID: EXPIRES ON 0910",
      result: "TEMPORARY ENDPOINT",
      highlight: { field: "action", text: "0910" },
      context: "SAME PRICING AS V4 FLASH",
      source: "SOURCE: DeepSeek official group",
    },
  },
  {
    id: 3,
    name: "native-multimodal",
    visualType: "narrative",
    refStyle: "narrative",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "AI vision architecture diagram showing integrated multimodal processing, dark tech theme",
    voiceover:
      "The big shift is native multimodal. In August, DeepSeek added a separate Vision experiment. Now V4.1 Flash builds vision into the base model.",
    texts: {
      badge: "THE SHIFT",
      company: "FROM BOLTED TO NATIVE",
      action: "AUGUST: SEPARATE VISION EXP",
      result: "NOW: VISION BUILT IN",
      highlight: { field: "result", text: "BUILT IN" },
      context: "NEW ARCHITECTURE",
      source: "SOURCE: DeepSeek official group",
    },
  },
  {
    id: 4,
    name: "iteration-pace",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: "pattern-interrupt",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "Calendar or timeline visualization with tech dates, dark background",
    voiceover:
      "DeepSeek reported four releases in four months. V4 in April. Flash July 31. Pro August 13. Vision Exp August 21.",
    texts: {
      badge: "4 RELEASES IN 4 MONTHS",
      company: "V4 SERIES RAPID FIRE",
      action: "APR 24, JUL 31, AUG 13, AUG 21",
      result: "NOW: V4.1 FLASH TESTING",
      highlight: { field: "result", text: "V4.1" },
      context: "EACH RELEASE CHANGED SOMETHING",
      source: "SOURCE: DeepSeek Change Log",
    },
  },
  {
    id: 5,
    name: "price-gap",
    visualType: "narrative",
    refStyle: "data",
    narrativeRole: "A",
    retentionMechanism: null,
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "Price comparison or cost analysis visualization, dark tech theme with blue and amber",
    voiceover:
      "Flash costs 44 cents per million input tokens. Pro costs 1.32 dollars. Three times cheaper, same pricing for the test.",
    voiceoverTts:
      "Flash costs 44 cents per million input tokens. Pro costs one point three two dollars. Three times cheaper, same pricing for the test.",
    texts: {
      badge: "PRICE GAP",
      company: "FLASH VS PRO PRICING",
      action: "$0.44 VS $1.32 PER MILLION",
      result: "3X CHEAPER",
      highlight: { field: "result", text: "3X" },
      context: "SAME PRICING FOR V4.1 TEST",
      source: "SOURCE: DeepSeek API pricing",
    },
  },
  {
    id: 6,
    name: "replace-pro",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "AI model performance comparison chart concept, dark tech theme",
    voiceover:
      "DeepSeek confirmed it is asking testers if V4.1 Flash can fully replace Pro. A Flash-priced model matching Pro performance changes the math for China AI.",
    voiceoverTts:
      "DeepSeek confirmed it is asking testers if V four point one Flash can fully replace Pro. A Flash-priced model matching Pro performance changes the math for China AI.",
    texts: {
      badge: "DEEPSEEK SURVEY",
      company: "CAN FLASH REPLACE PRO?",
      action: "FLASH COST, PRO POWER",
      result: "ECONOMICS REWRITE",
      highlight: { field: "action", text: "PRO POWER" },
      context: "DEEPSEEK ASKED TESTERS DIRECTLY",
      source: "SOURCE: DeepSeek feedback survey",
    },
  },
  {
    id: 7,
    name: "cta",
    visualType: "cta",
    narrativeRole: "T",
    retentionMechanism: "loop-closure",
    layout: "hero-center",
    mediaStrategy: "asset",
    voiceover:
      "A temporary test ending September 10, but the architecture shift is permanent. Follow China AI News for more.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
