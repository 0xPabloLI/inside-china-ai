/**
 * Scene data for the DeepSeek silent-API-update story.
 * 10 scenes, target 60-70s. Based on QbitAI (Oct 14, 2026) plus primary
 * verification of the X threads and DeepSeek's official channels.
 * Source: https://mp.weixin.qq.com/s/qRFi0UYEm5APrQIbcSkfeQ
 *
 * Narrative type: Controversy / mystery (claim vs machine record)
 * Hook pattern: contradiction (claim asserted, machine record contradicts)
 *
 * Editorial rule for this pack: the claim is reported as a claim. The video
 * never states the API "got stronger" as fact, because it is unproven and the
 * fingerprint log shows no change.
 *
 * Visual strategy: this is an evidence story, so every scene is text-driven
 * (stacked-cards / hero-center templates with GridBg). `media: null` declares
 * "no media ever" so asset sourcing is skipped instead of binding a generic
 * stock photo that cannot depict an API fingerprint. Entity color: DeepSeek = blue.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    narrativeRole: "S",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: null,
    voiceover: "Developers say DeepSeek's API got better. The fingerprint never changed.",
    texts: {
      badge: "OCTOBER 2026",
      subject: "DEEPSEEK",
      subjectLogo: "deepseek",
      bigNumber: "0",
      numberLabel: "FINGERPRINT EVENTS",
      stats: [
        { num: "200K", unit: "", label: "VIEWS ON THE CLIPS" },
        { num: "48", unit: "H", label: "OF ARGUMENT" },
      ],
      source: "SOURCE: DEEPSEEK MONITOR ARCHIVE, OCT 13",
    },
  },
  {
    id: 2,
    name: "first-post",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "On October 12, a developer reported that one prompt gave different output. Was DeepSeek upgrading in secret?",
    texts: {
      badge: "OCTOBER 12, 2026",
      company: "THE FIRST POST",
      context: "@LOKTAR00 ON X, 705 LIKES",
      action: "ONE PROMPT, DIRECT API",
      result: "44K VIEWS",
      source: "SOURCE: X, OCT 12, 2026",
    },
  },
  {
    id: 3,
    name: "comparison-clip",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "A verified account reported the same prompt looking sharper on October 12. That clip reached 115,000 views.",
    texts: {
      badge: "THE COMPARISON CLIP",
      company: "SEP 9TH VS OCT 12TH",
      context: "@QUIMEDESU ON X, VERIFIED",
      action: "SAME PROMPT, TWO DATES",
      result: "115,692 VIEWS",
      source: "SOURCE: X, OCT 12, 2026",
    },
  },
  {
    id: 4,
    name: "three-guesses",
    visualType: "info-card",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Three explanations spread: a bigger Flash, a quiet swap, or the Pro coming back. China's DeepSeek said nothing.",
    texts: {
      title: "THREE GUESSES",
      subtitle: "ALL UNCONFIRMED",
      points: ["V4.2-FLASH", "NEW CHECKPOINT", "V4.1-PRO RETURN"],
    },
  },
  {
    id: 5,
    name: "pattern-interrupt",
    visualType: "quote",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: null,
    voiceover: "Not so fast. One developer tested it and found no new checkpoint.",
    texts: {
      quote: "THE MODEL IS JUST RANDOM",
      verified: "NO NEW CHECKPOINT FOUND",
      source: "@DUMMERSPAST39 ON X, OCT 12, 2026",
    },
  },
  {
    id: 6,
    name: "fingerprint-explainer",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Every DeepSeek response carries a system fingerprint. It changes when the model behind it changes.",
    texts: {
      badge: "THE MACHINE RECORD",
      title: "SYSTEM ",
      titleHighlight: "FINGERPRINT",
      context: "IDENTIFIES THE SERVING BACKEND",
      detail: "A NEW STRING MEANS NEW WEIGHTS",
    },
  },
  {
    id: 7,
    name: "no-october-change",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "According to a third-party archive, ten fingerprint events exist since July. October has none.",
    texts: {
      stat: "0",
      statLabel: "OCTOBER EVENTS",
      subtext: "LAST LOGGED CHANGE: SEP 19, 2026",
      source: "SOURCE: DEEPSEEK MONITOR ARCHIVE, OCT 13",
    },
  },
  {
    id: 8,
    name: "opposite-rumor",
    visualType: "contrast",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Same week, the chat app drew the opposite complaint. Users said the model got dumber.",
    texts: {
      title: "ONE WEEK, TWO RUMORS",
      vs: "VS",
      left: ["API USERS: BETTER", "115K VIEWS ON CLIPS"],
      right: ["CHAT USERS: WORSE", "9K VIEWS ON ZHIHU"],
      note: "NEITHER SIDE RAN A CONTROLLED TEST",
      noteHighlight: "NEITHER",
    },
  },
  {
    id: 9,
    name: "loop-closure",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "The fingerprint never moved. For China's loudest AI lab, the rumor moved faster than the model.",
    texts: {
      badge: "LOOP CLOSURE",
      company: "THE LAB SAID NOTHING",
      context: "ZERO FINGERPRINT CHANGES",
      action: "THE RUMOR MOVED FIRST",
      result: "200K VIEWS, 0 PROOF",
      source: "SOURCE: DEEPSEEK MONITOR ARCHIVE, OCT 13",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    mediaStrategy: "asset",
    media: null,
    narrativeRole: "T-Tell",
    retentionMechanism: "loop-closure",
    voiceover: "Follow for the fingerprint check, every time DeepSeek ships.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "THE FINGERPRINT CHECK",
    },
  },
];

export const metadata = {
  title: "Did DeepSeek Quietly Upgrade Its API? The Fingerprint Says No",
  description: `Developers spent 48 hours convinced DeepSeek's API had quietly gotten better. Side-by-side clips of the same prompt from September and October 12 spread across X and passed 200,000 views, and the guesses went straight to v4.2-flash, a fresh checkpoint, or v4.1-pro returning behind the endpoint.

Then the machine record got checked. DeepSeek has published nothing since September 10, the API still exposes exactly two model names, and the system_fingerprint for deepseek-flash has not changed since September 10 at 09:05. A third-party archive that logs every fingerprint event has recorded nothing in October at all.

China's DeepSeek shipped nothing official, and one developer who tested knowledge, vision and SVG output found no new checkpoint either. Which leaves the question the clips cannot answer: did the model change, or did a viral comparison read meaning into ordinary model randomness?`,
  commentHook:
    "A 200,000-view comparison video cannot prove a model changed, and the API fingerprint says it did not. Do you trust the eyeball test or the machine record?",
  // No articleUrl on purpose (user decision 2026-10-13): the pinned comment and
  // caption must not drive traffic to chinaai.news until the site is ready for
  // it. Omitting the field makes derivePinnedComment emit the hook alone
  // (lib/caption-utils.mjs:125).
  trendingChecked: true,
  trendingHashtags: [],
};
