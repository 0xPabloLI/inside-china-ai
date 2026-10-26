/**
 * MediaScrims — the gradient scrims that let full-bleed footage pass the frame
 * gate.
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
 * The bottom scrim ramps from `scrimTop` to `rampEnd` and then holds at full
 * alpha down to the media's bottom edge, so a caller whose media runs past the
 * subtitle lane (the hook, full-frame) still gets a flat, dark band across the
 * gap and the cue lane instead of an alpha that keeps climbing.
 */
import { MEDIA_BAND, SUBTITLE_LANE_TOP, scrimGradient } from "../../../lib/safe-zones.mjs";

/** Solid scrim colour, matching MediaBackground's dim overlay. */
const SCRIM_RGB = "10,10,20";

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
}> = ({ mediaBottom }) => {
  // Where the bottom scrim reaches full alpha. Never past the lane top: the
  // region the gate watches hardest is the gap above it.
  const rampEnd = Math.min(mediaBottom, SUBTITLE_LANE_TOP);
  const rampHeight = rampEnd - MEDIA_BAND.scrimTop;
  const holdHeight = mediaBottom - rampEnd;
  return (
    <>
      {/* Top scrim — dims the band the TikTok top nav sits over. */}
      <Scrim
        top={0}
        left={0}
        height={MEDIA_BAND.topScrimHeight}
        background={scrimGradient(MEDIA_BAND.topScrimAlpha, "to bottom", true)}
      />
      {/* Bottom scrim — the text's contrast bed. */}
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
      {/* Right vignette — clears the action rail, which for full-bleed footage
          maps to the bright middle of the source frame. Starts at
          vignetteStartX so the ramp is spent on the rail, not on the subject. */}
      <Scrim
        top={0}
        left={MEDIA_BAND.vignetteStartX}
        height={mediaBottom}
        background={scrimGradient(MEDIA_BAND.vignetteAlpha, "to right")}
      />
    </>
  );
};
