/**
 * AvatarCard — digital-human foreground card layer (#214 ticket 02).
 *
 * Renders scene.avatar as a right-center vertical card (variant 1′), the
 * pilot mount point being CtaScene. Geometry is owned by lib/safe-zones.mjs
 * (AVATAR_CARD / AVATAR_CARD_RECT — layout evidence in
 * docs/research/dh-avatar-layout-best-practices.md); this component only
 * places and clips the video.
 *
 * Contract:
 *   - No avatar / no videoPath → returns null (no-avatar packages render
 *     byte-identical to before — the zero-regression guarantee).
 *   - videoPath is the public/assets/ basename written by render-remotion.mjs
 *     stageAvatarVideos() (missing/corrupt files never reach this component).
 *   - `present` intervals ({from, to} in scene seconds) clip the card to
 *     those windows via <Sequence>; outside them the background media runs
 *     full-bleed. Omitted → the card covers the whole scene. The avatar clip
 *     is generated against the scene's full TTS audio, so each window's
 *     <Video> trims to scene time (lip-sync stays aligned with the voiceover).
 *   - `scale` (optional author override) grows the card toward the
 *     bottom-right anchor, so the rail/lane clearances stay fixed.
 *
 * Stacking: DOM order only (no zIndex — see MediaBackground's #201 note).
 * Mount the card AFTER every text layer; the scene root must be positioned.
 */
import { Sequence, staticFile } from "remotion";
import { Video } from "@remotion/media";
import type { AvatarField } from "../types";
import { AVATAR_CARD_RECT } from "../../../lib/safe-zones.mjs";
import { secToFrames } from "./shared";

/** Card styling — rounded corners + shadow per spec Implementation Decision 2,
 *  proportions from the approved variant 1′ prototype. */
const CARD_STYLE = {
  borderRadius: 16,
  boxShadow: "0 8px 30px rgba(0,0,0,0.55)",
  background: "#0a0a14",
} as const;

export const AvatarCard: React.FC<{ avatar?: AvatarField; duration: number }> = ({
  avatar,
  duration,
}) => {
  if (!avatar?.videoPath) return null;

  const fullScene = [{ from: 0, to: secToFrames(duration) }];
  const windows =
    avatar.present && avatar.present.length > 0
      ? avatar.present.map((iv) => ({
          from: secToFrames(iv.from),
          to: secToFrames(iv.to),
        }))
      : fullScene;

  return (
    <>
      {windows.map((w, i) => (
        <Sequence
          key={i}
          from={w.from}
          durationInFrames={Math.max(1, w.to - w.from)}
          layout="none"
        >
          <div
            style={{
              position: "absolute",
              top: AVATAR_CARD_RECT.y,
              left: AVATAR_CARD_RECT.x,
              width: AVATAR_CARD_RECT.width,
              height: AVATAR_CARD_RECT.height,
              overflow: "hidden",
              ...CARD_STYLE,
              scale: avatar.scale ?? 1,
              transformOrigin: "bottom right",
            }}
          >
            <Video
              src={staticFile(`assets/${avatar.videoPath}`)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              trimBefore={w.from}
              volume={0}
              loop
            />
          </div>
        </Sequence>
      ))}
    </>
  );
};
