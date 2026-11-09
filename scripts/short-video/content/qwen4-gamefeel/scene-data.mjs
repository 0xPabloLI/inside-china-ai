/**
 * Qwen 4 GameFeel leak — straight news report on the 2026-11-08 benchmark
 * results for two unreleased Alibaba checkpoints.
 *
 * 9 scenes, target ~66s. Single part (user decision 2026-11-09): one news
 * event, one spine — an unreleased model topped a public game-dev benchmark
 * ahead of Claude Opus 5.5 at a fraction of the price.
 *
 * Evidence policy: every number is verified against the GameFeel Bench CSV
 * (kodasdream/gamefeel-benchmark, v1.4, updated 2026-11-08 15:11) or the named
 * X posts; ledger in docs/refs/source-materials/qwen4-gamefeel-sources.md.
 * The 69k-token figure is burned into Loktar's own demo video caption, which
 * scene 3 keeps in frame (fit: contain) as the evidence. The "most surprised"
 * quote in Chinese coverage belongs to Herlon Aguiar, not Loktar, and is not
 * used in the video.
 *
 * Footage: Loktar's 30.5s demo (1920x1080, h264), downloaded from the QbitAI
 * WeChat CDN mirror of the X post. The camera orbits the Colosseum for the
 * whole clip with no cuts, so scene 1 (cover, full-bleed) and scene 3
 * (contain, caption visible) can share the source at different offsets.
 *
 * Media fit: the hook is 9:16 and the source is 16:9. Cover crops the burnt-in
 * caption, which is fine — the hook buys spectacle, and scene 3 returns to the
 * same footage under contain where the 69k caption is the point. Screenshot
 * scenes (2, 4, 8) use contain so the evidence is never cropped; they are
 * manual CDP captures / downloads, not producer-verified evidence captures,
 * so none is marked evidence: true.
 *
 * Scene 7 carries the caveat in the same slot the article's last section
 * gives it: one developer's benchmark, identity unconfirmed.
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
    // English hook: declare the 1.1x floor up front (HOOK_MIN_SPEED, #244) so
    // the first take already matches it instead of paying a second Kaggle batch.
    ttsSpeed: 1.1,
    media: {
      type: "video",
      path: "assets/loktar-3d-demo.mp4",
      source: "Loktar (@loktar00) demo of an unreleased Qwen 4 early-access model, X post 2026-11-07",
      animation: "fade",
      fit: "cover",
      cropFocus: { x: 0.5, y: 0.5 },
      videoStartOffsetMs: 2000,
      overlay: 0.45,
      volume: 0,
    },
    voiceover: "Unreleased Qwen 4 just beat Claude's best at game dev.",
    texts: {
      badge: "NOV 2026",
      subject: "QWEN 4",
      hookText: "GAME DEV UPSET",
      revealText: "15% OF THE PRICE",
      source: "GAMEFEEL BENCH V1.4, NOV 8",
    },
  },
  {
    id: 2,
    name: "secret-test",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    // The post screenshot is near-portrait (1196x1294), so the evidence card
    // crops only the avatar row and the engagement row; the post text and the
    // demo poster stay whole. The wide reply strip (2.9:1) lost its text to the
    // card crop, so it is not used as the visual.
    media: {
      type: "image",
      path: "assets/loktar-post.png",
      source: "Screenshot of https://x.com/loktar00/status/2118782505369428117 (CDP capture 2026-11-09)",
      animation: "fade",
      mode: "card",
      fit: "cover",
      cropFocus: { x: 0.5, y: 0.5 },
      overlay: 0.35,
    },
    voiceover:
      "According to tester Loktar, a House of Qwen ambassador, he got a secret API key. No model name, no specs, just a token budget.",
    texts: {
      company: "HOUSE OF QWEN",
      action: "Qwen 4 TEST",
      result: "THINKING: HIGH",
    },
  },
  {
    id: 3,
    name: "one-shot-demo",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    retentionMechanism: "proof",
    mediaStrategy: "asset",
    // Contain so the burned-in caption "Qwen 4 (early access) · Qwen Code ·
    // 69k tokens" stays in frame — this scene's number is on the footage.
    media: {
      type: "video",
      path: "assets/loktar-3d-demo.mp4",
      source: "Loktar (@loktar00) demo of an unreleased Qwen 4 early-access model, X post 2026-11-07",
      animation: "fade",
      fit: "contain",
      cropFocus: { x: 0.5, y: 0.5 },
      videoStartOffsetMs: 10000,
      overlay: 0.4,
      volume: 0,
    },
    voiceover:
      "His first try built this 3D Colosseum in pure JavaScript. Sixty-nine thousand tokens, thinking on high, zero retries.",
    texts: {
      company: "LOKTAR · FIRST TRY",
      action: "PURE JAVASCRIPT",
      result: "69K TOKENS",
    },
  },
  {
    id: 4,
    name: "benchmark",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "T",
    retentionMechanism: "authority",
    mediaStrategy: "asset",
    // Live-site capture of the benchmark itself (3456x1816). Contain shows the
    // header and the BEST OVERALL card uncropped.
    media: {
      type: "image",
      path: "assets/gamefeel-site-overview.png",
      source: "Screenshot of https://kodasdream.github.io/gamefeel-benchmark/ (CDP capture 2026-11-09)",
      animation: "fade",
      // Page capture → evidence card, same reason as scene 2: full-bleed put
      // 18.8% bright pixels in the action rail.
      mode: "card",
      fit: "contain",
      cropFocus: { x: 0.5, y: 0.5 },
      overlay: 0.4,
    },
    voiceover:
      "Then came GameFeel Bench, according to its developer follistatin: twelve unpublished games, scored on code, creativity, and game feel.",
    texts: {
      company: "GAMEFEEL BENCH V1.4",
      action: "12 UNPUBLISHED GAMES",
      result: "CODE, IDEAS, FEEL",
    },
  },
  {
    id: 5,
    name: "scores",
    visualType: "contrast",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: "payoff",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "China's Qwen 4 Flash scored 49.9 points, ahead of Claude Opus 5.5 at 47.2. Even the 27B version nearly matched Sonnet.",
    texts: {
      title: "GAMEFEEL SCORES",
      left: ["QWEN 4 FLASH", "49.9"],
      right: ["OPUS 5.5", "47.2"],
      vs: "VS",
      note: "27B: 44.6, NEAR SONNET'S 45",
    },
  },
  {
    id: 6,
    name: "cost",
    visualType: "stat-reveal",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "The cost: forty cents a task versus two sixty for Opus. Six and a half times cheaper.",
    texts: {
      bigNumber: "6.5×",
      label: "CHEAPER PER TASK",
      subtext: "$0.40 VS $2.60, OPUS 5.5",
      source: "SOURCE: GAMEFEEL CSV",
    },
  },
  {
    id: 7,
    name: "caveat",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "The catch? It's one developer's benchmark, not a lab verdict, and Alibaba hasn't confirmed these models are Qwen 4.",
    texts: {
      badge: "THE CATCH",
      title: "ONE DEV'S TEST. ",
      titleHighlight: "UNCONFIRMED.",
      context: "NOT NAMED BY ALIBABA",
      detail: "NOT A RELEASE",
    },
  },
  {
    id: 8,
    name: "teaser",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "T",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    // The official teaser poster (942x970 tweet screenshot). Contain keeps the
    // poster and its caption whole.
    media: {
      type: "image",
      path: "assets/wechat-img-5.png",
      source: "Screenshot of https://x.com/Alibaba_Qwen/status/2118674834632978755, 2026-11-06",
      animation: "fade",
      fit: "contain",
      cropFocus: { x: 0.5, y: 0.5 },
      overlay: 0.4,
    },
    voiceover:
      "Alibaba's official teaser is already live: the becoming begins. Four versions are expected, from Flash to Max.",
    texts: {
      company: "QWEN · NOV 6",
      action: "THE BECOMING BEGINS",
      result: "FLASH · PLUS · MAX",
    },
  },
  {
    id: 9,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    media: null,
    // Loop close: "49.9" is the hook's price-ratio partner and a meta.dataPoints
    // anchor, so a rewatch re-reads the opening claim against it.
    voiceover: "A 49.9 demo is a promise. The launch is the proof.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "THE LAUNCH IS THE PROOF",
      action: "FOLLOW FOR IT",
      topic: "QWEN 4",
    },
  },
];

export const metadata = {
  title: "Unreleased Qwen 4 Beats Claude Opus 5.5 at Game Dev for 15% of the Cost",
  description: `Two unreleased Alibaba checkpoints, Qwen-4-Flash-Early and Qwen-4-27B-Early, topped GameFeel Bench v1.4 on 2026-11-08: 49.9 and 44.6 against Claude Opus 5.5 at 47.2 and Sonnet 5.5 at 45.0. Price per task: $0.40 and $0.16 against $2.60 and $7.80.

The benchmark is one developer's project (follistatin, GitHub kodasdream/gamefeel-benchmark): twelve unpublished games, about 60,000 tasks, human-rated creativity and answer-key coding checks. Tester Loktar got early API access through the House of Qwen ambassador program and says he was never told which model he was running. The demo that started the week is a 30-second Three.js Colosseum, generated in one shot at "high" thinking for 69,000 tokens. Alibaba has teased a launch ("The becoming begins") but has not confirmed the checkpoints are Qwen 4.`,
  commentHook:
    "The scores and prices are public and downloadable. The model name is not. Would you trust an unconfirmed checkpoint's benchmark number before launch?",
  // No articleUrl on purpose (user decision 2026-10-13): the pinned comment and
  // caption must not drive traffic to chinaai.news until the site is ready.
  //
  // Scene 2's image is a curated primary-source screenshot, so its relevance is
  // judged by reading the thread, not by the analyzer: the analyzer's 9:16
  // centre crop cuts a 2.9:1 text strip to 233 px and cannot read the Q&A.
  stockRelevanceExemption: {
    reason:
      "Scene 2's image is the primary source of the story: Loktar's own post announcing the Qwen 4 test (CDP capture, 2026-11-09). The analyzer scored it 50 because its claim text (secret API, no model name) is not spelled out in the post body — that context lives in the thread replies and is quoted in the video's voiceover. A curated news screenshot, not a stock image; relevance is judged by reading the source.",
    scenes: [2],
  },
  trendingChecked: true,
};
