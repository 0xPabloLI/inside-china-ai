/**
 * MediaCard — evidence card layout (#663 contract, #848).
 *
 * Renders scene.media inside a framed card locked to EVIDENCE_CARD's width and
 * top-left corner. The card fills the content band down to the media-bottom-bar
 * text bar, so card scenes and bar scenes share one geometry.
 *
 * `bottom` is the bar's top edge for THIS scene. The bar height is per scene
 * (2026-10-24), so a scene with fewer rows starts its bar lower and the card
 * grows to meet it. Omitting `bottom` falls back to the four-row ceiling,
 * which is what non-bar layouts want.
 */
import { EVIDENCE_CARD } from "../../../lib/safe-zones.mjs";
import { MediaBackground } from "./MediaBackground";
import type { MediaField } from "../types";

interface Props {
  media: MediaField;
  duration: number;
  /** Bottom edge in canvas px — the text bar's top edge for this scene. */
  bottom?: number;
}

export const MediaCard: React.FC<Props> = ({ media, duration, bottom }) => {
  const top = EVIDENCE_CARD.top;
  const bottomEdge = bottom ?? top + EVIDENCE_CARD.height;
  return (
    <div
      style={{
        position: "absolute",
        left: EVIDENCE_CARD.left,
        top,
        width: EVIDENCE_CARD.width,
        height: Math.max(0, bottomEdge - top),
        overflow: "hidden",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "#0a0a14",
      }}
    >
      <MediaBackground media={media} duration={duration} />
    </div>
  );
};
