/**
 * MediaTextPanel — a solid text surface under a full-bleed media band.
 *
 * The standing rule (2026-11-25): media is never dimmed. A picture keeps its
 * own colour, contrast and brightness; text that needs a readable background
 * gets its own opaque surface. This is that surface for the media-bottom-bar
 * layout: the picture above stays untouched, and the text bar sits on
 * `COLOR.canvas` instead of a gradient scrim over the footage.
 *
 * It is deliberately opaque, not a translucent overlay. A translucent band is
 * still a dim over the picture — the exact move the user rejected ("压暗...
 * 不让人有看下去的欲望"). Opaque means the media is covered where the panel
 * sits, not darkened.
 */
import { COLOR } from "./shared";

export const MediaTextPanel: React.FC<{
  /** Panel top edge in canvas px. */
  top: number;
  /** Panel bottom edge in canvas px. */
  bottom: number;
}> = ({ top, bottom }) => (
  <div
    style={{
      position: "absolute",
      top,
      left: 0,
      right: 0,
      height: Math.max(0, bottom - top),
      background: COLOR.canvas,
    }}
  />
);
