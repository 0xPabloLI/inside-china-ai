/**
 * Scene data for the DeepSeek-V4.1-Flash-1017 release story.
 * 10 scenes, target ~58s. Source: QbitAI (Oct 17, 2026), IT之家 x2, the official
 * DeepSeek-V4.1-Flash-1017 model card, the official Search/Fetch API docs,
 * Pandaily and RuntimeWire.
 * Source URL: https://mp.weixin.qq.com/s/rnlMFZR6zyJmEimC5k9Oig
 *
 * Narrative type: release + capability scores. This pack stands on its own —
 * it is about what shipped on Oct 17, not about any earlier pack's story. Do
 * NOT reference the Oct 14 API-fingerprint pack or frame this as a sequel: the
 * user rejected that framing, and series-production-guide.md L51 requires every
 * episode to be watchable on its own.
 *
 * Hook pattern: payoff-first claim (a new model beats a closed frontier model
 * on 9 of 11 published benchmarks).
 * Template: S.T.A.R.T. — S1 hook, 2 what-shipped (tease), 3-5 authority
 * (the model card's own table), 6 self-report caveat (reflection), 8 peak
 * (wish-based coding), 9 loop closure, 10 CTA.
 *
 * Visual strategy: three scenes carry the artifact a claim rests on, as a real
 * capture of the live page — the official model card itself (hook), the model
 * card's benchmark table (scene 3), and the official API billing docs
 * (scene 7). Nothing here is a mocked or reconstructed product page. The other
 * seven scenes stay CSS-only (`media: null`) because they carry analysis (what
 * launched, the head-to-head split, the biggest jump, the self-report caveat,
 * the demo summary, the loop closure, the CTA) rather than evidence.
 *
 * Evidence captures (2026-10-22, #848): the three images are raw element
 * captures from the live pages, not hand-composed banners. Recipes live in
 * `evidence-captures.json`; each media block carries `media.evidence: true`
 * and the provider-measured `media.provenance`. Missing assets are re-captured
 * by Stage 1.5a from the recipes.
 *
 * Layout note: all three evidence scenes use `media.mode: "card"` (#663) —
 * the raw capture renders inside a framed card locked to [60,220,820,594]
 * (brand bar above, subtitle lane below). Scenes 3/7 are `media-bottom-bar`
 * narratives whose card sits above the text bar; the hook's card sits behind
 * the hook text under a 0.7 dim, cover-cropped from the page top so the
 * title and the table's first rows read behind the headline.
 *
 * Text budget constraint (found by MRL-3 on this pack): `media-bottom-bar`'s
 * four rows share one 302px content box (contract width 724px), so each of
 * company/action/result must stay on a single line. Scene 4's chips each
 * render as a full-width row, and the hero band only fits two rows per side.
 *
 * Entity color: DeepSeek = blue.
 *
 * Editorial rule for this pack: every DeepSeek benchmark number is reported as
 * a self-reported number, and the cost claim is reported as a claim. The video
 * never states the cost reduction as measured fact, because DeepSeek published
 * no runtime or token figures. Scene 6 exists to say exactly that.
 *
 * Digital human (Step 8c): NOT declared. This pack is framed as breaking news
 * with a self-report caveat beat, which the blacklist covers for hook,
 * high-emotion and breaking-news segments; the only whitelist case is the CTA,
 * and one qualifying segment does not justify a 2-4 segment budget. Consistent
 * with both prior DeepSeek packs.
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
    // The hook's evidence: the live HF model card, framed in the #663 card,
    // cover-cropped from the page top so the title and the table's first rows
    // sit behind the hook text under a 0.55 dim.
    media: {
      type: "image",
      path: "assets/evidence-hf-model-card.png",
      source: "Hugging Face model card: DeepSeek-V4.1-Flash-1017",
      animation: "fade",
      mode: "card",
      fit: "cover",
      cropFocus: { x: 0.5, y: 0 },
      // 70% dim: the raw page is a light surface, and white hook text needs
      // the card darkened to near-background before contrast holds (0.55
      // left the page mid-gray and washed the headline out).
      overlay: 0.7,
      // DSF-1 capture: keep the file as captured so evidence and provenance
      // stay the same object.
      upscale: false,
      evidence: true,
      provenance: {
        sourceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017",
        selector: "section:has(.model-card-content)",
        rect: { x: 16, y: 239, w: 718, h: 2718.797 },
        clip: { x: 16, y: 239, w: 718, h: 2718.797 },
        scale: 1,
      },
    },
    voiceover: "China's DeepSeek just beat GPT-5.6 on nine of eleven benchmarks.",
    texts: {
      badge: "OCTOBER 17, 2026",
      subject: "DEEPSEEK",
      subjectLogo: "deepseek",
      // Fraction, not a bare "9": the denominator carries the total so a cold
      // viewer reads "9 of 11" without decoding a caption first, and the label
      // names what is being counted. Support card carries the opponent's side
      // so the head-to-head lands in the hook instead of waiting for scene 4.
      bigNumber: "9 / 11",
      numberLabel: "BENCHMARKS WON",
      stats: [
        { num: "2 / 11", unit: "", label: "GPT-5.6 SOL WON" },
        { num: "MIT", unit: "", label: "OPEN WEIGHTS" },
      ],
      source: "SELF-REPORTED: DEEPSEEK'S OWN BENCHMARK TABLE, OCT 17",
    },
  },
  {
    id: 2,
    name: "what-shipped",
    visualType: "info-card",
    layout: "hero-center",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    media: null,
    voiceover: "It's a point update: same model family, same endpoint, same price.",
    texts: {
      title: "WHAT ACTUALLY SHIPPED",
      subtitle: "A MINOR UPDATE, NOT A NEW FLAGSHIP",
      points: ["V4.1-FLASH-1017", "DROP-IN, NO CODE CHANGE", "OPEN WEIGHTS, MIT LICENSE"],
    },
  },
  {
    id: 3,
    name: "the-table",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/evidence-hf-benchmark.png",
      source: "Hugging Face model card: official benchmark table",
      animation: "fade",
      mode: "card",
      overlay: 0,
      fit: "contain",
      evidence: true,
      provenance: {
        sourceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017",
        selector: "table:has(thead th:nth-child(7))",
        rect: { x: 16, y: 909.672, w: 598, h: 608.25 },
        clip: { x: 0, y: 893.672, w: 630, h: 640.25 },
        scale: 2,
      },
    },
    voiceover: "According to DeepSeek's own model card, it leads GPT-5.6 on nine of those eleven.",
    texts: {
      company: "THE BENCHMARK TABLE",
      action: "ELEVEN TESTS, SIX MODELS",
      result: "9 OF 11 VS GPT-5.6",
      source: "SOURCE: DEEPSEEK MODEL CARD, OCT 17",
    },
  },
  {
    id: 4,
    name: "head-to-head",
    visualType: "contrast",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Against GPT-5.6, it took nine of eleven. The two it missed were HLE and a vision test.",
    texts: {
      title: "ON DEEPSEEK'S OWN CHART",
      vs: "VS",
      // Each chip renders as its own full-width row in the hero band, so the
      // band budget only fits two rows per side (title, VS badge and note take
      // the rest). The two losses are one row, not two.
      left: ["GPT-5.6 SOL", "WINS 2 OF 11"],
      right: ["V4.1-FLASH-1017", "WINS 9 OF 11"],
      // noteHighlight renders inline right after note (ContrastScene), so the
      // separator has to live in the data — same convention as
      // title/titleHighlight.
      note: "DEEPSEEK PUBLISHED BOTH SIDES OF THE ",
      noteHighlight: "COMPARISON",
    },
  },
  {
    id: 5,
    name: "the-jump",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Every benchmark it published is higher than the last version. Terminal-Bench went 31 to 42.",
    texts: {
      stat: "+11.1",
      statLabel: "TERMINAL-BENCH 4.0",
      subtext: "31.2 TO 42.3, UP FROM THE PREVIOUS FLASH",
      source: "SOURCE: DEEPSEEK MODEL CARD, OCT 17",
    },
  },
  {
    id: 6,
    name: "self-reported",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "But China's DeepSeek said every one of those numbers is its own. No outside lab has verified them.",
    texts: {
      badge: "PATTERN INTERRUPT",
      title: "ALL OF IT IS ",
      titleHighlight: "SELF-REPORTED",
      context: "DEEPSEEK RAN THE COMPARISON ITSELF",
      detail: "NO OUTSIDE LAB REPRODUCED THE SCORES",
    },
  },
  {
    id: 7,
    name: "search-api",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "R",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/evidence-search-api-pricing.png",
      source: "DeepSeek official API docs: Search & Fetch pricing",
      animation: "fade",
      mode: "card",
      overlay: 0,
      fit: "contain",
      // A 320px-high table: keep the raw capture instead of ESRGAN, so the
      // evidence file and its provenance stay the same object.
      upscale: false,
      evidence: true,
      provenance: {
        sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
        selector: "#search--fetch-pricing ~ table",
        rect: { x: 316, y: 1902.562, w: 391.672, h: 128.172 },
        clip: { x: 300, y: 1886.562, w: 423.672, h: 160.172 },
        scale: 2,
      },
    },
    voiceover:
      "The same release opened DeepSeek's own search engine: 75 cents per thousand calls, free until November.",
    texts: {
      company: "SEARCH + FETCH API",
      action: "PAY ONLY ON SUCCESS",
      result: "$0.75 / 1,000 CALLS",
      source: "SOURCE: DEEPSEEK API DOCS, OCT 17",
    },
  },
  {
    id: 8,
    name: "wish-based-coding",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "The part it's really selling: describe what you want, and it plans, builds and fixes it.",
    texts: {
      badge: "PEAK",
      company: "WISH-BASED CODING",
      context: "OFFICIAL DEMOS, NOT AVERAGE OUTPUT",
      action: "DESCRIBE IT, IT BUILDS IT",
      result: "FORBIDDEN CITY, PORTAL 2",
      source: "SOURCE: QBITAI + DEEPSEEK DEMOS, OCT 17",
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
    voiceover: "Nine of eleven beaten, and every single number reported by DeepSeek itself.",
    texts: {
      badge: "LOOP CLOSURE",
      company: "9 OF 11",
      context: "VS GPT-5.6, ITS OWN TABLE",
      action: "SELF-REPORTED, NOT REPRODUCED",
      result: "THE FINE PRINT MATTERS",
      source: "SOURCE: DEEPSEEK MODEL CARD, OCT 17",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    media: null,
    // Loop closure: the CTA has to land the hook's payoff again, not just ask
    // for a follow. "Nine of eleven" is the hook's own number, so a rewatch
    // reads the opening differently the second time. checkLoopClose matches
    // those numbers against meta.dataPoints since #762.
    voiceover: "Follow China AI News. Nine of eleven, and the fine print on every score.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "THE SELF-REPORTED SCORES",
    },
  },
];

export const metadata = {
  title: "Nine of Eleven: DeepSeek's V4.1-Flash-1017 Beats GPT-5.6 on Its Own Chart",
  description: `DeepSeek shipped V4.1-Flash-1017 on October 17, 2026, on the web app, the mobile app and the API at once. On the benchmark table DeepSeek published with the model card, the new version beats GPT-5.6 Sol on nine of the eleven tests, and it beats the previous Flash on all eleven: Terminal-Bench 4.0 went from 31.2 to 42.3, ProgramBench from 20.3 to 29.1, and DeepSWE v1.1 reached 77.0, past both GPT-5.6 Sol and Opus 5.
	
The model is a point update. The API identifier, the endpoint and the price are unchanged, so existing integrations pick up the new weights with no code change, and the weights are published on Hugging Face and ModelScope under the MIT license.
	
The part worth slowing down on is who checked. DeepSeek published the numbers for its own model and for every competitor it compares against, and no outside lab has re-run them. The cost claim is stated too — shorter runtime and output length — with no per-task figures. The same release opened DeepSeek's own search engine to developers at 75 cents per thousand successful calls, free until November 1.`,
  commentHook:
    "DeepSeek's new Flash beats GPT-5.6 on 9 of its 11 published benchmarks, and beats its own previous version on all 11. But every one of those scores is DeepSeek's own number. Would you ship on self-reported benchmarks?",
  // No articleUrl on purpose (user decision 2026-10-13, carried forward): the
  // pinned comment and caption must not drive traffic to chinaai.news until the
  // site is ready for it. Omitting the field makes derivePinnedComment emit the
  // hook alone (lib/caption-utils.mjs:125).
  trendingChecked: true,
  trendingHashtags: [],
};
