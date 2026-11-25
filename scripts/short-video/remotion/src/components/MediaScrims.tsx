/**
 * MediaScrims — the contrast layers that let full-bleed footage pass the frame
 * gate without painting a long dark gradient over the picture.
 *
 * verify-remotion-frames.mjs FAILs a frame when more than 5% of the pixels in
 * the TikTok right action rail (x 880-1080, y 640-1775) or in the subtitle gap
 * (y 1150 - SUBTITLE_LANE_TOP) are brighter than luminance 80. For full-bleed
 * footage both regions map to the middle of the source frame, which is bright
 * in daylight shots: measured on the unitree film's own acts the rail sat at
 * 20-100% before these scrims, and 0-2% after.
 *
 * Geometry and alphas live in MEDIA_BAND (lib/safe-zones.mjs) so the callers —
 * NarrativeScene's media-bottom-bar and HookScene — cannot drift apart.
 *
 * Two bottom treatments:
 *
 * - `panelTop` (media-bottom-bar): the text owns a panel. The panel starts at
 *   the text bar's top edge, feathers in over a short 28px lip and then goes
 *   solid. The previous long ramp from y=820 to y=1298 darkened half the
 *   photograph and read as a shadow laid over the asset (user report,
 *   2026-11-23). A panel is an intentional lower third; a 478px ramp is not.
 * - absent (hook): keep the long ramp, because hook copy sits directly on the
 *   picture and has no bar of its own.
 *
 * `topScrim` exists for the same reason: the TikTok top-nav band is only worth
 * darkening when copy or platform buttons sit over the picture. In
 * `media-bottom-bar` the copy is in the panel and the band has no top text,
 * so the caller turns the top fade off; on the hook it stays.
 */
import { MEDIA_BAND, SUBTITLE_LANE_TOP, scrimGradient } from "../../../lib/safe-zones.mjs";

/** Solid scrim colour, matching MediaBackground's dim overlay. */
const SCRIM_RGB = "10,10,20";
/** Solid text panel. Anything under 1.0 lets a bright source ghost through. */
const PANEL_ALPHA = 1;
/** Short lip so the panel edge is a designed join, not a hard seam. */
const PANEL_FEATHER_PX = 28;

const Scrim: React.FC<{
  top: number;
  left: number;
  height: number;
  background: string;
}> = ({ top, left, height, background }) => (
  <div style={{ position: "absolute", top, left, right: 0, height, background }} />
);

export const MediaScrims: React.FC<{
  /** Bottom edge of the media, in canvas px. */
  mediaBottom: number;
  /** When set, draw an opaque text panel from this y down (media-bottom-bar). */
  panelTop?: number;
  /** Draw the top-nav fade. Off for panel layouts; on for hook copy over media. */
  topScrim?: boolean;
}> = ({ mediaBottom, panelTop, topScrim = true }) => {
  // Where the bottom scrim reaches full alpha. Never past the lane top: the
  // region the gate watches hardest is the gap above it.
  const rampEnd = Math.min(mediaBottom, SUBTITLE_LANE_TOP);
  const rampHeight = rampEnd - MEDIA_BAND.scrimTop;
  const holdHeight = mediaBottom - rampEnd;
  const panelHeight = panelTop === undefined ? 0 : Math.max(0, mediaBottom - panelTop);
  return (
    <>
      {/* Top scrim — only when copy or platform buttons sit over the picture. */}
      {topScrim && (
        <Scrim
          top={0}
          left={0}
          height={MEDIA_BAND.topScrimHeight}
          background={scrimGradient(MEDIA_BAND.topScrimAlpha, "to bottom", true)}
        />
      )}
      {/* Bottom contrast bed. */}
      {panelHeight > 0 ? (
        <>
          {panelHeight > PANEL_FEATHER_PX && (
            <Scrim
              top={panelTop!}
              left={0}
              height={PANEL_FEATHER_PX}
              background={scrimGradient(PANEL_ALPHA, "to bottom")}
            />
          )}
          <Scrim
            top={panelTop! + Math.min(panelHeight, PANEL_FEATHER_PX)}
            left={0}
            height={panelHeight - Math.min(panelHeight, PANEL_FEATHER_PX)}
            background={`rgba(${SCRIM_RGB},${PANEL_ALPHA})`}
          />
        </>
      ) : (
        <>
          {rampHeight > 0 && (
            <Scrim
              top={MEDIA_BAND.scrimTop}
              left={0}
              height={rampHeight}
              background={scrimGradient(MEDIA_BAND.scrimAlpha, "to bottom")}
            />
          )}
          {holdHeight > 0 && (
            <Scrim
              top={rampEnd}
              left={0}
              height={holdHeight}
              background={`rgba(${SCRIM_RGB},${MEDIA_BAND.scrimAlpha})`}
            />
          )}
        </>
      )}
      {/* Right rail is already darkened by MediaBackground's frame-level
          action-rail vignette. A second 0.6 gradient here stacked to ~0.84
          alpha and read as a hard vertical shadow on light footage
          (2026-11-23 CapCut winner demo). One rail layer is enough. */}
    </>
  );
};
