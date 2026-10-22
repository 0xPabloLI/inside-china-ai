/**
 * MediaCard — evidence card layout (#663 contract, #848).
 *
 * Renders scene.media inside a framed card locked to EVIDENCE_CARD
 * ([60,220,820,594]): raw page captures keep their native look inside the
 * content safe zone instead of full-bleed cover crops that run under the
 * TikTok UI rails. The brand bar (y≈140-188) stays clear above the card and
 * the media-bottom-bar text bar starts exactly at the card's bottom edge
 * (y=814), so card scenes and bar scenes share one geometry.
 */
import { EVIDENCE_CARD } from "../../../lib/safe-zones.mjs";
import { MediaBackground } from "./MediaBackground";
import type { MediaField } from "../types";

interface Props {
  media: MediaField;
  duration: number;
}

export const MediaCard: React.FC<Props> = ({ media, duration }) => (
  <div
    style={{
      position: "absolute",
      left: EVIDENCE_CARD.left,
      top: EVIDENCE_CARD.top,
      width: EVIDENCE_CARD.width,
      height: EVIDENCE_CARD.height,
      overflow: "hidden",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "#0a0a14",
    }}
  >
    <MediaBackground media={media} duration={duration} />
  </div>
);
