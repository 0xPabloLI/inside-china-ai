/**
 * Competition-demo preflight contract (2026-11-23 user ruling).
 *
 * Event/hackathon/awards coverage must carry the work itself, not only stage
 * photos: a stage still proves the event happened, a demo proves what was
 * made. The docs already made this a Stage 0 requirement; this module turns
 * it into a preflight gate so a pack cannot silently ship without a demo.
 *
 * A pack passes with one evidence-role video scene, or records an explicit
 * accepted gap with a concrete reason and the sources it searched. Anything
 * else fails before render.
 */

const COMPETITION_RE =
  /(hackathon|contest|competition|awards?|festival|prize|benchmark|challenge)/i;

/** A video scene that carries a competition work, not stock b-roll. */
const DEMO_PATH_RE = /(demo|trailer|winner|award|entry|film|work)/i;

function haystack(meta) {
  return [
    meta?.article,
    meta?.pipelineId,
    meta?.title,
    meta?.videoFitFormat,
    ...(Array.isArray(meta?.topics) ? meta.topics : []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function isCompetitionPack(meta) {
  const storyType = meta?.storySpine?.storyType ?? meta?.storyType;
  if (!meta || storyType !== "event") return false;
  return COMPETITION_RE.test(haystack(meta));
}

function evidenceVideoScenes(scenes) {
  return (scenes ?? []).filter((scene) => {
    const media = scene?.media;
    if (media?.type !== "video") return false;
    return scene.mediaRole === "evidence" || DEMO_PATH_RE.test(media.path ?? "");
  });
}

/**
 * @returns {{applies: boolean, rows: Array<{level: "pass"|"warn"|"fail", check: string, detail: string, fix?: string}>}}
 */
export function checkCompetitionDemo({ scenes, meta }) {
  if (!isCompetitionPack(meta)) {
    return {
      applies: false,
      rows: [
        {
          level: "pass",
          check: "Competition demo",
          detail: "Not a competition/event pack",
        },
      ],
    };
  }

  const candidates = evidenceVideoScenes(scenes);
  if (candidates.length > 0) {
    const first = candidates[0];
    const source = first.media?.source;
    const rows = [
      {
        level: "pass",
        check: "Competition demo present",
        detail: `Scene ${first.id}: ${first.media.path}`,
      },
    ];
    if (!source || source === first.media.path) {
      rows.push({
        level: "warn",
        check: "Competition demo attribution",
        detail: `Scene ${first.id} has no media.source URL/account/date`,
        fix: "Write media.source with the URL, account and award status",
      });
    }
    return { applies: true, rows };
  }

  const gap = meta?.competitionDemo;
  if (gap?.status === "accepted-gap" && typeof gap.reason === "string" && gap.reason.trim()) {
    const searched = Array.isArray(gap.searched) ? gap.searched.filter(Boolean) : [];
    return {
      applies: true,
      rows: [
        {
          level: "warn",
          check: "Competition demo accepted gap",
          detail: `${gap.reason}${searched.length ? ` (searched: ${searched.join(", ")})` : ""}`,
          fix: "Replace the gap with a real clip when one becomes available",
        },
      ],
    };
  }

  return {
    applies: true,
    rows: [
      {
        level: "fail",
        check: "Competition demo missing",
        detail: "No evidence-role video scene in a competition/event pack",
        fix: 'Embed the winning/entry demo or official trailer in a peak scene, or record meta.competitionDemo = { status: "accepted-gap", reason, searched }',
      },
    ],
  };
}
