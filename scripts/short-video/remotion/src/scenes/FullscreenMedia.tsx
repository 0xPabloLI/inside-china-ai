/**
 * FullscreenMedia — full-screen media presentation without text overlay.
 *
 * Renders only the image/video (via MediaBackground with overlay forced to 0)
 * plus an optional source attribution label. No Slot layout, no BrandBar,
 * no on-screen text. Subtitles are burned in via ASS (not handled here).
 *
 * Used when `scene.media.mode === "fullscreen"`.
 */
import { AbsoluteFill } from "remotion";
import { MediaBackground } from "../components/MediaBackground";
import { TextGate } from "../components/text-gate";
import { SAFE_ZONES } from "../components/shared";
import type { MediaField } from "../types";

export const FullscreenMedia: React.FC<{
  media: MediaField;
  duration: number;
  sceneId?: string;
}> = ({ media, duration, sceneId = "fullscreen" }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a14" }}>
      <MediaBackground media={media} duration={duration} />
      {media.source && (
        // The gate wrapper owns the positioning (its height must track the
        // label — an absolutely-positioned child would escape the flow and
        // leave the wrapper height 0, which Fit rejects).
        <div
          style={{
            position: "absolute",
            bottom: SAFE_ZONES.bottom,
            left: SAFE_ZONES.left,
            right: SAFE_ZONES.right,
            zIndex: 10,
          }}
        >
          <TextGate sceneId={sceneId} slotId="fullscreen.media.source">
            {(fontSize) => (
              <div
                style={{
                  fontSize,
                  color: "rgba(203,213,225,0.6)",
                  letterSpacing: "2px",
                }}
              >
                SOURCE: {media.source}
              </div>
            )}
          </TextGate>
        </div>
      )}
    </AbsoluteFill>
  );
};
