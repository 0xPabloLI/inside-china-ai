/**
 * Scene data for the Astra distillation story (The Information, 2026-10-28).
 * Source ledger: docs/refs/source-materials/deepseek-astra-distillation-2026-10-28.md
 *
 * Narrative type: 争议事件 (hook -> what was claimed -> mechanism -> why the
 * target moved -> the human reversal -> what the evidence actually is).
 * Template: S.T.A.R.T. S1 hook, 2 authority (the measured score), 3 authority
 * (the report), 4 relay (mechanism), 5 relay (target shift), 6 pattern
 * interrupt (the founder said no), 7 relay (the reversal), 8-9 the other side,
 * 10 CTA with loop close.
 *
 * Hook framing (user decision 2026-10-29): the news headline already carries the
 * hook, so the video opens on the jump itself and the reported cause, not on the
 * price ratio. The 49x price gap survives as support inside scene 2, where it is
 * labelled per task; it is not the frame.
 *
 * This pack is standalone. It does NOT reference the 2026-10-17 release pack or
 * any earlier DeepSeek pack: same subject, different story, and
 * series-production-guide.md L51 requires every episode to stand alone.
 *
 * Visual strategy: all ten scenes are CSS-only (`media: null`). The one artifact
 * both numbers rest on is the Browser Use leaderboard, and a live capture of it
 * was rejected on 2026-10-29: the site's own cookie banner covers rows 2 to 4
 * (exactly Astra and DeepSeek) and a 22-row table is unreadable at 1080 wide.
 * The numbers therefore render as brand data typography with a source line,
 * which is legible at phone size and does not fake a product page.
 *
 * Evidence discipline: every sentence that asserts distillation is attributed
 * to The Information in the same scene. Scenes 8 and 9 exist so the claim is
 * never left standing as fact.
 *
 * Entity color: DeepSeek = blue.
 *
 * Digital human (Step 8c): NOT declared. The pack is breaking-news framed, which
 * the blacklist covers for the hook and the reversal beat; only the CTA would
 * qualify for the whitelist and one segment does not justify the budget.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    narrativeRole: "S",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    // Pure typography on the open: an explicit null, not a sourcing target.
    // The 4-point jump is the claim, and the second line names the alleged
    // cause, so the hook carries both the mystery and the answer.
    media: null,
    voiceover:
      "DeepSeek's new model jumped four points in one update. The Information says GPT-6 Astra taught it.",
    texts: {
      badge: "OCTOBER 28, 2026",
      subject: "DEEPSEEK",
      subjectLogo: "deepseek",
      hookText: "4 POINTS BETTER",
      revealText: "ASTRA TAUGHT IT",
      stats: [
        { num: "75.0", label: "DEEPSEEK FLASH" },
        { num: "77.9", label: "GPT-6 ASTRA" },
      ],
      source: "SOURCE: THE INFORMATION + BROWSER USE BENCH V2.1",
    },
  },
  {
    id: 2,
    name: "the-score",
    visualType: "contrast",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    mediaStrategy: "asset",
    media: null,
    // Take 1 and 2 were both hard-blocked by the acoustic gate: the ASR writes
    // "ten seventy-seven" as "10.77", and because that phrase sat at the tail
    // the truncation check read it as a missing last word. The price sentence is
    // reordered so the line ends on "cents" and the ratio survives intact.
    voiceover:
      "Browser Use runs 180 live tasks. DeepSeek went from 70.9 to 75. Astra sits at 77.9. Per task, Astra charges ten seventy-seven. DeepSeek charges 22 cents.",
    // Contrast, not stacked-cards: four data points do not fit a card whose
    // content box is ~440px, and the pairing read wrong there. The stacked
    // variant shows company+action in card 0 and context+result in card 1.
    texts: {
      title: "BROWSER USE: 180 TASKS",
      vs: "VS",
      left: ["DEEPSEEK FLASH", "75.0 AT 22 CENTS"],
      right: ["GPT-6 ASTRA", "77.9 AT $10.77"],
      note: "UP FROM 70.9 IN THE LAST VERSION",
    },
  },
  {
    id: 3,
    name: "the-report",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "On October 28th, The Information reported that China's DeepSeek and Moonshot trained heavily on Astra's outputs.",
    texts: {
      badge: "OCTOBER 28, 2026",
      title: "TRAINED ON ",
      titleHighlight: "ASTRA",
      context: "THE INFORMATION",
      detail: "DEEPSEEK AND MOONSHOT",
    },
  },
  {
    id: 4,
    name: "what-distillation-is",
    visualType: "info-card",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Distillation means training a model on another model's answers. Not its code. Not its weights.",
    texts: {
      title: "WHAT DISTILLATION IS",
      subtitle: "HOW AI MODELS COPY ANSWERS",
      points: ["TEACHER GIVES ANSWERS", "STUDENT LEARNS THEM", "THE WEIGHTS NEVER MOVE"],
    },
  },
  {
    id: 5,
    name: "why-the-target-moved",
    visualType: "contrast",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: null,
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Claude used to be the top target. Then Anthropic spent two months tightening its reasoning traces, and the labs moved.",
    texts: {
      title: "WHY THE TARGET MOVED",
      vs: "NOW",
      left: ["CLAUDE", "THE OLD TARGET"],
      right: ["GPT-6 ASTRA", "THE NEW ONE"],
      note: "ANTHROPIC TIGHTENED ",
      noteHighlight: "REASONING TRACES",
    },
  },
  {
    id: 6,
    name: "pattern-interrupt",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: null,
    voiceover: "Then DeepSeek's founder changed his mind.",
    texts: {
      badge: "PATTERN INTERRUPT",
      title: "THE FOUNDER SAID ",
      titleHighlight: "NO",
      context: "LIANG WENFENG, ON V4",
      detail: "THEN THE PRESSURE LANDED",
    },
  },
  {
    id: 7,
    name: "the-reversal",
    visualType: "narrative",
    layout: "stacked-cards",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover:
      "Liang Wenfeng had ruled out leaning on distillation for V4. The report says Zhipu's gains changed the math.",
    texts: {
      badge: "THE REVERSAL",
      // stacked-cards pairs company+action in card 0 and context+result in
      // card 1, so the fields are ordered to read as two clean statements.
      company: "LIANG WENFENG",
      action: "HAD RULED OUT DISTILLATION",
      context: "ZHIPU'S GAINS",
      result: "CHANGED THE CALL",
      source: "SOURCE: THE INFORMATION, OCT 28",
    },
  },
  {
    id: 8,
    name: "no-logs",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: null,
    voiceover: "But the sources are anonymous. No logs. No prompts. No numbers.",
    texts: {
      badge: "THE OTHER SIDE",
      title: "NO LOGS. NO ",
      titleHighlight: "NUMBERS.",
      context: "NO NAMES ON THE RECORD",
      detail: "NO EVIDENCE WAS PUBLISHED",
    },
  },
  {
    id: 9,
    name: "the-fingerprint",
    visualType: "data",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    media: null,
    voiceover: "One viral test called it 84% GPT-6 Astra. That tool has no DeepSeek model on file.",
    texts: {
      stat: "84%",
      statLabel: "GPT-6 ASTRA MATCH",
      subtext: "NO DEEPSEEK IN ITS DATABASE",
      source: "SOURCE: TMT POST, OCT 2026",
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
    // Loop close: the hook's "four points" returns, and the frame flips from
    // "it jumped" to "the reason is still a claim". A rewatch reads the open
    // differently.
    voiceover: "Follow China AI News. Four points up. The reason is still a claim.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "FOUR POINTS, ONE CLAIM",
    },
  },
];

export const metadata = {
  title: "DeepSeek's 4-Point Jump: Astra Taught It, Report Says",
  description: `DeepSeek's newest Flash jumped 4.1 points in a single point update. On October 28, The Information reported why: DeepSeek and Moonshot trained heavily on GPT-6 Astra's outputs.
	
The numbers hold up. Browser Use's 180 live tasks put DeepSeek at 75.0 and Astra at 77.9, at 22 cents versus $10.77 per task, a 49x gap. The evidence behind the report is thinner: anonymous sources, no logs, no prompts. And the fingerprint test that went viral came from a tool with no DeepSeek model in its database.`,
  commentHook:
    "DeepSeek's new Flash gained 4.1 points on Browser Use's 180 live tasks, and The Information says the reason is distillation from GPT-6 Astra. Anonymous sources, no logs published. Do you treat that as reporting or as a leak with an agenda?",
  // No articleUrl on purpose (standing decision since 2026-10-13): the pinned
  // comment and caption must not drive traffic to the site yet.
  // Creative Center US, 7-day window, checked 2026-10-29 (logged out, top 3
  // only: #tiktokscaryhorrorcontest, #marvelrivalsavengers, #livecanbeeasy).
  // None matched deepseek / openai / ai. Snapshot:
  // output/trending-snapshots/trending-2026-10-29.json
  trendingChecked: true,
  trendingHashtags: [],
};
