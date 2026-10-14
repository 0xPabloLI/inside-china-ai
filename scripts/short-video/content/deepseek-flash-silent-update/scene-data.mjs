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
 * Visual strategy (revised 2026-10-14): this is an evidence story, so the five
 * scenes that carry a specific claim show the actual artifact the claim rests
 * on — a real screenshot of the cited X post, the official change log, or the
 * third-party fingerprint archive. Screenshots are real captures of the live
 * pages (see docs/refs/source-materials/deepseek-flash-silent-update-sources.md);
 * nothing here is a mocked or reconstructed product page. The remaining scenes
 * stay CSS-only (`media: null` = "no media ever", sourcing skipped) because
 * they carry analysis rather than evidence.
 *
 * Rail constraint (found by MRL-3 on the first evidence render, 2026-10-14):
 * `media-bottom-bar` renders its media window 1080×814 at y=0, but TikTok's
 * action rail starts at x=880 and the frame gate fails any scene with >5% bright
 * pixels in x>880, y 640-1775. A white page capture is ~100% bright, so every
 * evidence asset is composed at 880×814: dark band y<200 for the brand bar, the
 * page card scaled to 0.815, dark matte below y≈700, and `fit:"contain"` supplies
 * the branded matte on both sides. Keeping the capture bright is the point; the
 * alternative (raising `overlay` past ~0.72 to clear the gate) drops the page
 * text to roughly 2.3:1 contrast and makes the evidence unreadable.
 *
 * Layout note: only `narrative` consumes scene.layout, and `hero-center` /
 * `stacked-cards` are CSS-only (auto-skipped by the media filter), so any scene
 * that carries a screenshot uses a media layout: media-bottom-bar, media-split
 * or media-overlay. Entity color: DeepSeek = blue.
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
    media: {
      type: "image",
      path: "assets/changelog-hook.png",
      source: "DeepSeek API Change Log",
      animation: "fade",
      // The screenshot carries its own baked scrim (a white docs page would
      // otherwise blow out the white hook type); this overlay is the last step.
      overlay: 0.55,
      fit: "cover",
    },
    voiceover: "Developers say DeepSeek's API got better. The fingerprint never changed.",
    texts: {
      badge: "OCTOBER 2026",
      subject: "DEEPSEEK",
      subjectLogo: "deepseek",
      bigNumber: "200K",
      numberLabel: "VIEWS ON THE CLIPS",
      stats: [
        { num: "0", unit: "", label: "OFFICIAL CHANGES" },
        { num: "48", unit: "H", label: "OF ARGUMENT" },
      ],
      source: "SOURCE: X POSTS + DEEPSEEK CHANGE LOG, OCT 13",
    },
  },
  {
    id: 2,
    name: "first-post",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/loktar-evidence.png",
      source: "X: @loktar00",
      animation: "fade",
      overlay: 0,
      fit: "contain",
    },
    voiceover:
      "On October 12, a developer reported that one prompt gave different output. Was DeepSeek upgrading in secret?",
    texts: {
      company: "THE FIRST POST",
      action: "ONE PROMPT, DIRECT API",
      result: "44,577 VIEWS",
      source: "SOURCE: @LOKTAR00 ON X, OCT 12, 2026",
    },
  },
  {
    id: 3,
    name: "comparison-clip",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    retentionMechanism: "curiosity-gap",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/quimedesu-evidence.png",
      source: "X: @quimedesu",
      animation: "fade",
      overlay: 0,
      fit: "contain",
    },
    voiceover:
      "A verified account reported the same prompt looking sharper on October 12. That clip reached 115,000 views.",
    texts: {
      company: "SEP 9TH VS OCT 12TH",
      action: "SAME PROMPT, TWO DATES",
      result: "115,692 VIEWS",
      source: "SOURCE: @QUIMEDESU ON X, OCT 12, 2026",
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
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "R",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    media: {
      type: "image",
      path: "assets/dummer-evidence.png",
      source: "X: @dummerspast39",
      animation: "fade",
      overlay: 0,
      fit: "contain",
    },
    voiceover: "Not so fast. One developer tested it and found no new checkpoint.",
    texts: {
      company: "THE DISSENTING TEST",
      action: "TESTED KNOWLEDGE, VISION, SVG",
      result: "NO NEW CHECKPOINT",
      source: "SOURCE: @DUMMERSPAST39 ON X, OCT 13, 2026",
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
    media: {
      type: "image",
      path: "assets/archive-log.png",
      source: "DeepSeek Monitor Archive",
      animation: "fade",
      overlay: 0.62,
      fit: "cover",
    },
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
      // noteHighlight renders inline right after note (ContrastScene), so the
      // separator has to live in the data — same convention as title/titleHighlight.
      note: "NEITHER SIDE RAN A ",
      noteHighlight: "CONTROLLED TEST",
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
