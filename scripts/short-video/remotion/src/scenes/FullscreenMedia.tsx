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
import type { MediaField } from "../types";

export const FullscreenMedia: React.FC<{
  media: MediaField;
  duration: number;
}> = ({ media, duration }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a14" }}>
      <MediaBackground media={media} duration={duration} />
      {media.source && (
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 60,
            fontSize: 20,
            color: "rgba(203,213,225,0.6)",
            letterSpacing: "2px",
            zIndex: 10,
          }}
        >
          SOURCE: {media.source}
        </div>
      )}
    </AbsoluteFill>
  );
};
