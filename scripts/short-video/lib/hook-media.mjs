/**
 * Hook media quality checks (#299).
 *
 * The hook is the opening 4.5–5 seconds and its media is curated by hand (since
 * #1342 sourcing/generation can cover the opening too, but the curation rules
 * below still apply to whatever lands). Two gates judge it: preflight
 * (`scene-rules.mjs` → `checkHookMediaContract`, before sourcing) and the
 * final media gate (`final-media-gate.mjs`, after sourcing/generation). Both
 * must apply the same fit/source contract — render-only / rerender /
 * realign-render only see the latter, so a `fit:"contain"` hook must not slip
 * through there.
 *
 * Pure: no filesystem. The one import is the slot contract's layout constant
 * so the media-led branches cannot desync from a rename of the layout string.
 * `media` is a non-null MediaField object (the callers handle the missing /
 * `media: null` cases).
 *
 * @module hook-media
 */
import { HOOK_MEDIA_LED_LAYOUT, isMediaLedFullWidth } from "./text-slots.mjs";

/** Fits a hook may declare.
 *
 * `cover` and `contain` mirror `VALID_FITS` in `lib/media-bg.mjs`, which is the
 * validation-side authority. The list is repeated rather than imported — and a
 * drift test in `__tests__/scene-rules.test.mjs` locks the two together. The
 * duplication has already bitten once: the renderer accepted `contain` while
 * this gate still rejected it, which is the inconsistency this contract was
 * changed to fix.
 */
export const HOOK_SUPPORTED_FITS = ["cover", "contain"];

/**
 * Check one hook's media binding against the curation contract.
 *
 * @param {Record<string, any>} media - non-null scene.media object
 * @param {{layout?: string, scene?: Record<string, any>}} [context] - the hook's
 *   declared layout and full scene (the scene lets the full-width contract read
 *   `texts` and `mediaRole`; both callers have it, the layout-only form is kept
 *   for older tests)
 * @returns {{failures: Array<{check: string, detail: string, fix: string}>,
 *            warnings: Array<{check: string, detail: string, fix: string}>}}
 */
export function checkHookMediaQuality(media, context = {}) {
  const failures = [];
  const warnings = [];
  const m = media ?? {};
  const isMediaLed = context.layout === HOOK_MEDIA_LED_LAYOUT;
  const scene = context.scene ?? null;
  const fullWidth = scene ? isMediaLedFullWidth(scene) : false;

  // "cover" keeps the 9:16 frame filled and stays the default; an omitted fit
  // is valid because the renderer defaults to cover. "contain" was a FAILURE
  // until 2026-10-29 and is now allowed — see below.
  //
  // The old rule rejected contain because it "letterboxes". That premise only
  // holds when cover is available as the alternative: cover fills the frame by
  // CUTTING it, and for a 16:9 source in the hook's full-frame 1080x1920 box
  // that means scaling 1.78x and showing 31.6% of the source width — 68.4% of
  // the picture is discarded. The user rejected that outright ("这个是我不能
  // 接受的"), so for a film whose body is already composed as a letterbox the
  // hook must be allowed to match it. A letterboxed hook is consistent with a
  // letterboxed body; a cover hook in front of a contain body is not, and that
  // inconsistent switch at t=3.4s is worse than either choice alone.
  //
  // fill/none remain failures: they distort the frame rather than fitting it.
  if (m.fit != null && !HOOK_SUPPORTED_FITS.includes(m.fit)) {
    failures.push({
      check: "Hook media fit",
      detail: `Hook media fit "${m.fit}" is not supported (fill/none distort the frame; anything else is likely a typo)`,
      fix: 'Set fit:"cover" (fills the frame by cropping) or fit:"contain" (letterboxes the whole picture), or omit fit to default to cover',
    });
  }

  // Media-led splits the frame into a picture band and text zones; `mode:"card"`
  // is the opposite shape — MediaCard draws an evidence card at
  // EVIDENCE_CARD (top 300, bottom 986), i.e. straight through the badge
  // (220-298) and subject (306-402) rows. The renderer therefore has no card
  // branch, and this gate is what keeps a card-mode scene from reaching it.
  if (isMediaLed && m.mode === "card") {
    failures.push({
      check: "Hook media mode",
      detail:
        'media-led hook declares mode:"card" — the evidence card spans y 300-986 and the layout draws its badge/subject rows over that range',
      fix: 'Drop mode:"card" (media-led renders the picture in its own band), or use layout:"hero-center" for a card hook',
    });
  }

  // #1559: full-width band contract. The flag is a declaration, not a
  // suggestion: if it is set but the layout ignores it (not media-led, or
  // cover already fills the frame), the author believes something is
  // happening that is not.
  if (m.fullWidth !== undefined && typeof m.fullWidth !== "boolean") {
    failures.push({
      check: "Hook media fullWidth",
      detail: `media.fullWidth must be a boolean, got ${JSON.stringify(m.fullWidth)} (${typeof m.fullWidth})`,
      fix: "Use `fullWidth: true` or `fullWidth: false`.",
    });
  } else {
    if (m.fullWidth === true) {
      // `fullWidth` is a geometry declaration. It takes effect only on an
      // effective media-led hook with a contained picture; cover already fills
      // the frame, the card mode owns its own box, and the native candle chart
      // keeps its 820 band. A declaration the renderer ignores is exactly the
      // dead field this gate exists to catch.
      const effective = scene ? fullWidth : isMediaLed && (m.fit ?? "cover") === "contain";
      if (!effective) {
        failures.push({
          check: "Hook media fullWidth",
          detail: scene
            ? `media.fullWidth needs an effective media-led hook with mediaRole:"evidence" and fit:"contain"; this scene is ${scene.visualType}/${context.layout ?? "none"}, fit "${m.fit ?? "cover"}"${scene.info?.chart ? `, chart "${scene.info.chart}"` : ""}${m.mode === "card" ? ', mode:"card"' : ""}`
            : `media.fullWidth needs layout:"media-led" and fit:"contain"; this scene declared layout "${context.layout ?? "none"}" and fit "${m.fit ?? "cover"}"`,
          fix: 'Set layout:"media-led", mediaRole:"evidence", fit:"contain", or drop media.fullWidth.',
        });
      }
    }
  }

  // The full-width plate lives between y 916-1206, below the 1080×608 picture.
  // It holds the subject row and the locked number — the two rows every
  // shipped media-led hook uses. A third/fourth row overflows the container,
  // which the TextGate would catch at render time; fail earlier with an
  // instruction that names the actual choice.
  if (fullWidth && scene) {
    const extraRows = ["numberLabel", "source"].filter((key) => scene.texts?.[key]);
    if (extraRows.length > 0) {
      failures.push({
        check: "Hook media fullWidth rows",
        detail: `full-width media-led hook declares texts.${extraRows.join(" / texts.")} — the plate under the 1080×608 picture holds subject + bigNumber only`,
        fix: "Drop the extra rows, or declare media.fullWidth:false and keep the legacy 820 band that has room for them.",
      });
    }
  }

  // A contained video that opts out of the full-width default is not
  // forbidden — a non-16:9 source may genuinely need the old band — but it
  // must not be silent. The ticket's report was exactly this narrow band.
  if (
    isMediaLed &&
    m.type === "video" &&
    (m.fit ?? "cover") === "contain" &&
    m.fullWidth === false
  ) {
    warnings.push({
      check: "Hook media fullWidth",
      detail:
        "video evidence uses the legacy 820 band (fullWidth:false) — a 16:9 demo would show 820×461 inside the frame",
      fix: "Remove fullWidth:false to fill the canvas width, or record why the source cannot take the full-width band.",
    });
  }

  if (!m.source) {
    warnings.push({
      check: "Hook media source",
      detail: "Hook media has no source — a manually bound file needs attribution",
      fix: "Add media.source (official page, model card, or stock provider)",
    });
  }

  return { failures, warnings };
}
