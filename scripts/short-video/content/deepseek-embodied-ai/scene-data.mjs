/**
 * Scene data for DeepSeek's embodied AI move (Liang Wenfeng meeting robot
 * founders + leading Winverse AI's seed round).
 *
 * Sources: iFeng exclusive (Oct 12, 2026), Bloomberg (Oct 12, 2026),
 * Leiphone (Oct 8 and Sept 30, 2026), Cailian Press / Securities Times /
 * Beijing News (Unitree placement, Aug 6, 2026), Lianhe Zaobao / ITHome
 * (DeepSeek round, Oct 6, 2026). Full material set:
 * docs/refs/source-materials/deepseek-embodied-ai-sources.md
 *
 * Narrative type: Breaking News (fact shock -> background -> impact -> next)
 * Hook pattern: P1 Result-First, number-led (bigNumber = $400M). Rotation:
 * the previous package (deepseek-harness-desktop) opened claim-led P2, and
 * the three before it opened number-led P1, so P1 is back in rotation.
 *
 * Hook-first design (standing analytics action, 2026-10-11): the focal number
 * renders on frame 1, the first spoken line carries the same shock, and there
 * is no "According to..." setup before it.
 *
 * Media intent: the seven media-bearing scenes bind a file in `assets/`
 * directly, so Step 1.5 sourcing skips them entirely (its filter only picks up
 * scenes whose media is absent or missing on disk). `media: null` is reserved
 * for the three scenes that are deliberately CSS-only: scene 5 is
 * stacked-cards, scenes 8 and 10 are NO_MEDIA_TYPES (#191).
 *
 * Overlay values are not cosmetic. The frame gate (verify-remotion-frames.mjs)
 * samples each scene's midpoint and fails if >5% of the pixels in the TikTok
 * action rail (x>880, y 640-1775) or the subtitle gap (y 1150-1188) are bright
 * (>80 luminance). Because MediaBackground fills the whole frame, a bright
 * subject (a white robot shell, a lit booth) reads as content in those bands.
 * Scenes 1, 2, 4 and 7 were measured at their real midpoints and raised to the
 * smallest overlay that clears the bar, so the media stays as visible as the
 * gate allows.
 *
 * Voiceover phrasings in scenes 3 and 7 are ASR-verified, not stylistic
 * choices. The first pipeline run hard-blocked both on the acoustic check
 * (#271): CosyVoice3 dropped "141 million yuan" entirely from scene 3 and
 * rendered "Unitree G1" as "unitary gun" in scene 7. Both lines below were
 * re-probed against the local CosyVoice3-MLX engine and transcribe clean:
 * scene 3 at 100% similarity, scene 7 at 93% with zero issues.
 *
 * Digital human: not declared. This package is breaking news with a
 * contested-source core, which sits on the avatar strategy blacklist
 * (breaking-news framing, hook segment). See HITL notes.
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
    assetNeed: "humanoid robot arm or robot hand close-up, dark high-contrast",
    media: {
      type: "video",
      path: "assets/pexels-video-humanoid-robot-arm-robot-01.mp4",
      source: "Pexels",
      animation: "fade",
      overlay: 0.72,
    },
    voiceover: "DeepSeek's robot move: 400 million dollars for a months-old lab.",
    texts: {
      badge: "EMBODIED AI",
      subject: "DEEPSEEK",
      bigNumber: "400M",
      numberLabel: "USD VALUATION, WINVERSE AI",
      stats: [
        { num: "141M", unit: "YUAN", label: "UNITREE STAKE" },
        { num: "$12B", unit: "", label: "DEEPSEEK WAR CHEST" },
      ],
      source: "SOURCE: Bloomberg, Oct 12, 2026",
    },
  },
  {
    id: 2,
    name: "open-loop",
    visualType: "narrative",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    layout: "media-overlay",
    mediaStrategy: "asset",
    assetNeed: "humanoid robot prototype in a lab, engineers at work",
    media: {
      type: "image",
      path: "assets/baidu_search-robot-startup-office-humanoid-03.jpg",
      source: "Baidu",
      animation: "ken-burns",
      overlay: 0.74,
    },
    voiceover:
      "iFeng reported Liang Wenfeng spent weeks meeting robot founders. Two paths are on the table.",
    texts: {
      badge: "THE REPORT",
      company: "LIANG MEETS ROBOT FOUNDERS",
      action: "TWO PATHS: BUILD A TEAM OR BUY IN",
      result: "NO DECISION YET",
      context: "iFeng exclusive, Oct 12, 2026",
      source: "SOURCE: iFeng Technology, Oct 12, 2026",
    },
  },
  {
    id: 3,
    name: "unitree-stake",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    assetNeed: "Unitree humanoid robot walking, full body",
    media: {
      type: "image",
      path: "assets/baidu_search-宇树-03.jpg",
      source: "Baidu",
      animation: "ken-burns",
      overlay: 0.68,
    },
    voiceover: "In August, DeepSeek bought into Unitree's IPO for about $20 million.",
    texts: {
      badge: "THE FIRST BET",
      company: "UNITREE PLACEMENT",
      action: "933,399 SHARES, 36-MONTH LOCK-UP",
      result: "141M YUAN / $20M",
      context: "Signed Aug 6, 2026, with a cooperation deal",
      source: "SOURCE: Cailian Press, Aug 6, 2026",
    },
  },
  {
    id: 4,
    name: "winverse",
    visualType: "narrative",
    narrativeRole: "A",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    assetNeed: "robot startup office or humanoid robot head close-up",
    media: {
      type: "image",
      path: "assets/baidu_search-robot-startup-office-humanoid-01.jpg",
      source: "Baidu",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover:
      "This week Bloomberg reported DeepSeek agreed to lead the seed round for Winverse AI.",
    texts: {
      badge: "THE NEW ONE",
      company: "WINVERSE AI",
      action: "SEED ROUND, TENS OF MILLIONS",
      result: "$400M VALUATION",
      context: "Founded 2026 by ex-Tencent scientist Hu Han",
      source: "SOURCE: Bloomberg, Oct 12, 2026",
    },
  },
  {
    id: 5,
    name: "pattern-interrupt",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    media: null,
    voiceover: "One catch: industry people say Winverse is infrastructure, not robots.",
    texts: {
      badge: "PATTERN INTERRUPT",
      company: "NOT A ROBOT COMPANY",
      context: "Industry sources, via iFeng",
      action: "MODEL ACCELERATION, NOT EMBODIMENT",
      result: "THE LABEL IS THIN",
      source: "SOURCE: iFeng, Oct 12, 2026",
    },
  },
  {
    id: 6,
    name: "gpt6-trigger",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    assetNeed: "robot arm picking up a small block, benchmark demo",
    media: {
      type: "image",
      path: "assets/baidu_search-robot-arm-picking-up-02.jpg",
      source: "Baidu",
      animation: "ken-burns",
      overlay: 0.68,
    },
    voiceover:
      "In September, GPT-6 Astra scored 95 percent on a robot control task. Fable 5.1 managed 40.",
    texts: {
      badge: "THE TRIGGER",
      company: "GPT-6 GOT HANDS",
      action: "WHY CHINA AI LABS CARE",
      result: "95% VS 40%",
      context: "Astra vs Fable 5.1, Sept 2026",
      source: "SOURCE: Benchmark post, Sept 5, 2026",
    },
  },
  {
    id: 7,
    name: "homebody-demo",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "media-overlay",
    mediaStrategy: "asset",
    assetNeed: "humanoid robot in a kitchen beside a robot arm",
    media: {
      type: "image",
      path: "assets/baidu_search-宇树-01.jpg",
      source: "Baidu",
      animation: "ken-burns",
      overlay: 0.74,
    },
    voiceover:
      "Stanford put that model inside a Unitree robot. It explored a kitchen and fetched medicine.",
    texts: {
      badge: "THE DEMO",
      company: "GPT ASTRA MEETS UNITREE G1",
      action: "EXPLORE, FETCH, OPEN DRAWERS",
      result: "A LAYERED STACK",
      context: "Stanford Movement Lab + Caltech, Sept 30",
      source: "SOURCE: HomeBody project, Sept 30, 2026",
    },
  },
  {
    id: 8,
    name: "peak",
    visualType: "stat-reveal",
    narrativeRole: "R",
    retentionMechanism: null,
    layout: "hero-center",
    mediaStrategy: "asset",
    media: null,
    voiceover: "DeepSeek is raising 12 billion dollars, with an IPO planned for early 2027.",
    texts: {
      bigNumber: "$12B",
      label: "DEEPSEEK WAR CHEST",
      subtext: "Tencent and CATL lead, ahead of a 2027 listing",
      source: "SOURCE: Bloomberg, Oct 6, 2026",
    },
  },
  {
    id: 9,
    name: "loop-closure",
    visualType: "narrative",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    layout: "stacked-cards",
    mediaStrategy: "asset",
    assetNeed: "robot hand reaching toward a glowing object, dark background",
    media: {
      type: "image",
      path: "assets/baidu_search-深度求索-03.jpg",
      source: "Baidu",
      animation: "ken-burns",
      overlay: 0.72,
    },
    voiceover:
      "DeepSeek spent three years refusing to chase markets. 400 million is a cheap option, not a pivot.",
    texts: {
      badge: "WHAT IT MEANS",
      company: "NOT A PIVOT YET",
      context: "141M yuan and one seed lead, against $12B",
      action: "CHEAP OPTIONS ON A STRATEGIC QUESTION",
      result: "WATCH THE HIRING",
      source: "CHINA AI NEWS ANALYSIS",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    narrativeRole: "T-Tell",
    retentionMechanism: "loop-closure",
    layout: "hero-center",
    mediaStrategy: "asset",
    media: null,
    voiceover: "DeepSeek's robot bet is not finished. Follow for the next deal.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "DEEPSEEK'S ROBOT MOVE",
    },
  },
];

export const metadata = {
  title: "DeepSeek's $400M Robot Bet: It Leads Winverse AI's Seed",
  description: `DeepSeek is moving toward robots. iFeng reported on Oct 12 that Liang Wenfeng spent weeks meeting embodied AI founders, weighing two paths: build a team, or buy in. Bloomberg reported the same day that DeepSeek agreed to lead Winverse AI's seed round, valuing the months-old startup at about $400 million.

The money was already moving before that. In August, DeepSeek took 933,399 shares in Unitree's Shanghai IPO for about 141 million yuan ($20 million), with a 36-month lock-up and a cooperation deal on embodied intelligence. Winverse AI was founded in 2026 by Hu Han, who led Tencent's vision-language and embodied foundation model teams and co-authored the Swin Transformer paper. Industry people told iFeng the company is closer to model-acceleration infrastructure than to robots.

The trigger looks like GPT-6. Astra scored 95% on a robot control task in September, against 40% for Fable 5.1, and Stanford's HomeBody project put Astra inside a Unitree G1 to explore a kitchen and fetch medicine. DeepSeek is raising at least 80 billion yuan (about $12 billion) ahead of a 2027 IPO, which makes a $400 million bet look like a cheap option rather than a pivot.`,
  commentHook:
    "DeepSeek's first robot moves are investments, not a research team. Do you read that as a real strategy shift, or as cheap options on a question nobody can answer from text alone?",
  // No articleUrl on purpose (user decision 2026-10-13): the pinned comment and
  // caption must not drive traffic to chinaai.news until the site is ready for
  // it. Omitting the field makes derivePinnedComment emit the hook alone
  // (lib/caption-utils.mjs:125).
  //
  // Stock relevance waived on purpose (user decision 2026-10-14): step 8b's
  // completion criterion is "all images relevance >= 60", and 5 of the 6 bound
  // images scored below it (0/0/0/50/50 — see stock-relevance-report.json).
  // The images ship anyway because the scoring prompt asks whether the image
  // depicts the scene's *specific* claim (a named funding event, a named
  // model), which no generic robot photograph can satisfy; every alternative
  // in the pool scored equal or lower, so the criterion is unsatisfiable for
  // this package rather than merely unmet. What the media layer is for —
  // topically correct footage (Unitree hardware, robot arms, a robot lab) — is
  // satisfied. The video is published and is not being re-rendered.
  //
  // The two sanctioned remediations were not used: no
  // `search-replacement-images.mjs` replacement exists that scores higher, and
  // `mediaStrategy: "b-roll"` would replace accurate footage of the actual
  // subject with generated imagery. The deeper gap this exposes — step 8b
  // states a completion criterion that no gate enforces, because
  // evaluate-stock-relevance.mjs always exits 0 — is tracked in #294.
  trendingChecked: true,
  trendingHashtags: [],
};
