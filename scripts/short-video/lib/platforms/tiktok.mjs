/**
 * TikTok Platform Profile — first profile instance (#219 ticket 01).
 *
 * Spec: docs/specs/spec-platform-profile-isolation.md
 * Ticket: .scratch/platform-profile/issues/01-profile-model-tiktok.md
 *
 * Publish-package rules migrated verbatim from lib/tiktok-rules.mjs (THRESHOLDS)
 * and lib/publish-utils.mjs (publish settings) — values are item-by-item
 * equivalent; platform source comments preserved. lib/tiktok-rules.mjs now
 * derives THRESHOLDS from this profile, so scene-rules.mjs / verify-video.mjs /
 * sync tests keep their behavior with zero changes to their import surface.
 *
 * Sources:
 *   - docs/tiktok/tiktok-best-practices.md (audit checklist B1-B9, API limits,
 *     hashtag strategy, 技术规格)
 *   - docs/refs/tiktok-skills/ (community skill references)
 *   - lib/publish-utils.mjs (Publora publish settings: 150MB cap, viewer/
 *     duet/stitch/commerce defaults, commercial disclosure rule)
 */

// ─── Thresholds (migrated verbatim from tiktok-rules.mjs THRESHOLDS) ───
// Centralized numeric thresholds for all TikTok checks.
// Drift detection test validates these match documented values.

const THRESHOLDS = {
  /** Max voiceover words for 60-70s target (2.5 wps) */
  maxVoiceoverWords: 180,

  /** Max words per sentence for one-breath check */
  maxOneBreathWords: 25,

  /** Min scene count */
  minScenes: 6,

  /** Max scene count */
  maxScenes: 10,

  /** B4: Hook VO vs text overlap — FAIL threshold (≥ this = Blocker) */
  hookTextOverlapFailThreshold: 0.8,

  /** Body-scene VO duplication: on-screen text repeating a verbatim VO
      phrase of ≥ this many words (normalized) = three-tier repetition */
  bodyTextDuplicateMinWords: 4,

  /** B4: Hook VO vs text overlap — WARN threshold (≥ this, < fail = Warning) */
  hookTextOverlapWarnThreshold: 0.5,

  /** Min source attribution scenes */
  minSourceScenes: 2,

  /** Min SEO keyword scenes */
  minKeywordScenes: 2,

  /** Min ratio of scenes with data points */
  minDataSceneRatio: 0.5,

  /** Teleprompter rhythm: max deviation from average (fraction) */
  teleprompterMaxDeviation: 0.15,

  /** CTA stacking: count per scene that triggers warning */
  ctaStackThreshold: 3,

  /** Max goal signals before warning */
  maxGoalSignals: 2,

  /** Hook greeting: max words to check from start */
  greetingCheckWords: 3,
};

// ─── TikTok Profile ───

export const tiktokProfile = {
  platform: "tiktok",
  displayName: "TikTok",

  /**
   * Publish method: `manual-guide` is the default safe tier. API auto-publish
   * is DISABLED (zero-views prevention — bypasses AIGC label, trending audio,
   * in-app editing, geographic tag); CDP is not enabled for TikTok.
   */
  publishMethod: "manual-guide",

  /**
   * Publish methods this platform actually allows (#219 T03 — publish HITL
   * gate, spec Implementation Decisions 4). Automation paths (`api`, `cdp`)
   * are closed until per-platform authorization + sandbox verification enable
   * them; publishing through a non-enabled method fails closed. TikTok: the
   * manual in-app checklist IS the publish HITL — the human performs the
   * publish, so the confirmation point cannot be skipped.
   */
  enabledPublishMethods: ["manual-guide"],

  /** Artifact types: only `video` is implemented; `image-thread` reserved for #223/#208. */
  artifactTypes: ["video"],

  // ─── Caption rules ───

  caption: {
    /** buildCaption format: title + "\n\n" + description (description includes hashtags) */
    structure: "title + blank line + description (hashtags appended)",

    /** Caption ≤ 2,200 chars（API 限制）— tiktok-best-practices.md "API 限制"
     *  THE single caption-limit path (#219 T02): thresholds no longer carry a
     *  maxCaptionLength copy — consume profile.caption.maxLength. */
    maxLength: 2200,

    /** Title max length */
    titleMaxLength: 60,
  },

  // ─── Hashtag rules ───

  hashtags: {
    /** 3-5 个 hashtag，混合 reach（1 个大类 + niche + 视频特定）—
     * tiktok-best-practices.md "Hashtag 策略"；堆砌在 2026 无效
     * (single-path: thresholds no longer carry minHashtags/maxHashtags) */
    min: 3,
    max: 5,
  },

  // ─── AI disclosure（《标识办法》2025-09-01 起为法定义务）───

  aiDisclosure: {
    required: true,
    /** In-app toggle label in the TikTok upload flow */
    label: "AI-generated content",
    /** Entry step in manualGuide below */
    guideStepId: "aigc-label",
    /** TikTok requires AI content labeling. Not labeling = penalty.
     * #1 cause of zero views for AI-voiced videos. */
    note: "AI-generated content must be labeled in-app; unlabeled AI content is penalized.",
    /** Rendered checklist line when the pipeline detects no AI voice
     * (#219 T03 — the aigc-label step's no-voice variant). */
    noVoiceLabel: "(No AI voice detected — AIGC label not needed)",
  },

  // ─── Video file constraints ───

  video: {
    /** Publora limit: 150MB for videos (publish-utils.mjs validateVideoFile) */
    maxSizeBytes: 150 * 1024 * 1024,

    /** 视频 ≤ 10 分钟（API 限制；原生上传可达 60 分钟）—
     * tiktok-best-practices.md "API 限制" */
    maxDurationSeconds: 600,

    /** Publish path enforces MP4; TikTok API also accepts MOV/WebM（最低 23 FPS） */
    containerFormats: ["mp4"],

    /** 帧率：23fps 推荐，最高 60fps — tiktok-best-practices.md "技术规格" */
    minFps: 23,
  },

  // ─── Cover spec（video 组条件字段，shape 契约在 declaresVideo 时要求）───
  // #216 试点实测结论可直接落成规格

  cover: {
    /** 分辨率：1080×1920（9:16 竖屏）— tiktok-best-practices.md "技术规格" */
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
  },

  // ─── Privacy settings (Publora publish API defaults) ───
  // NOTE: Publora may invert allow* booleans to TikTok's disable_* flags —
  // test with SELF_ONLY before trusting values (publish-utils.mjs note).

  privacy: {
    defaultViewerSetting: "PUBLIC_TO_EVERYONE",
    allowComments: true,
    /** Duet disabled by default */
    allowDuet: false,
    /** Stitch disabled by default */
    allowStitch: false,
  },

  // ─── Commerce constraints ───

  commerce: {
    /** TikTok commercial disclosure rule: commercialContent=true requires
     * brandOrganic or brandedContent to also be true (enforced by
     * publish-utils.mjs buildTiktokSettings). */
    commercialContentRequiresBrand: true,
    defaultCommercialContent: false,
    defaultBrandOrganic: false,
    defaultBrandedContent: false,
  },

  // ─── Manual guide step sequence (THE source — publish-utils renders from
  //     here, no mirror copy; #219 T03) ───
  // `label` is the exact checklist line template ({videoPath}/{slug} are
  // substituted by the renderer); `detail` lines render indented beneath it.
  // Step order and copy are item-by-item equivalent to the pre-T03 guide
  // (golden-pinned in __tests__/publisher-profile.test.mjs).

  manualGuide: {
    steps: [
      { id: "open-app", label: "Open TikTok app → Tap [+] to upload" },
      { id: "select-video", label: "Select video file: {videoPath}" },
      {
        id: "aigc-label",
        label: '⚠️  CRITICAL: Toggle "AI-generated content" ON',
        detail: [
          "TikTok requires AI content labeling. Not labeling = penalty.",
          "This is the #1 cause of zero views for AI-voiced videos.",
        ],
        /** Swapped for aiDisclosure.noVoiceLabel when no AI voice is detected */
        omitWithoutAIVoice: true,
      },
      { id: "paste-caption", label: "Paste caption above into description field" },
      {
        id: "edit-sticker",
        label: 'Tap "Edit" → Add a text sticker or effect (algorithm bonus)',
        detail: ["TikTok algorithm favors content edited within the app."],
      },
      {
        id: "add-sound",
        label: 'Tap "Add sound" → Pick a trending sound (set volume 5-10%)',
        detail: ["Trending audio boosts discoverability significantly."],
      },
      {
        id: "location",
        label: 'Tap "Location" → Select "China" or "United States"',
        detail: ["Algorithm prioritizes local content."],
      },
      { id: "privacy", label: 'Set privacy to "Public" (or "Friends" for testing)' },
      { id: "publish", label: "Publish" },
      { id: "first-hour-engagement", label: "First hour: Reply to EVERY comment (engagement signal)" },
      {
        id: "pin-comment",
        label: "Pin a comment with article link (when domain is live):",
        detail: ["https://chinaainews.com/posts/{slug}"],
      },
    ],
  },

  // ─── Full numeric threshold set (B1-B9 audit checks) ───
  // Consumed via the lib/tiktok-rules.mjs re-export — do not duplicate these
  // numbers elsewhere; derive or import instead.

  thresholds: THRESHOLDS,
};
