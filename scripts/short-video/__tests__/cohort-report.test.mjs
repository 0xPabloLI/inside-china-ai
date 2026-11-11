import { describe, expect, it } from "vitest";
import {
  buildRows,
  coverage,
  formatCohortMarkdown,
  hookFeatures,
  matchPack,
  median,
  packTokens,
  parseMajorDropSec,
  summarizeCohorts,
  tokenSet,
} from "../cohort-report.mjs";

const UNITREE_DESCRIPTION =
  "Unitree introduced the H2-X on October 21, 2026, with one 61 second film and no spec sheet. The film runs in six acts: a scrapyard martial arts sequence, car parkour, a 4 meter drop, a night knife intercept and a car lift.";
const QWEN_DESCRIPTION =
  "Two unreleased Alibaba checkpoints, Qwen-4-Flash-Early and Qwen-4-27B-Early, topped GameFeel Bench v1.4 on 2026-11-08: 49.9 and 44.6 against Claude Opus 5.5 at 47.2.";

const UNITREE_HOOK = {
  id: 1,
  visualType: "hook",
  media: {
    type: "video",
    path: "assets/clips/act5-lift.mp4",
    fit: "contain",
    videoStartOffsetMs: 2500,
  },
  voiceover: "Unitree's new guard robot lifts a car. 8 hours standing.",
  texts: { hookText: "IT LIFTS A CAR.", revealText: "STANDS 8 HOURS" },
};
const QWEN_HOOK = {
  id: 1,
  visualType: "hook",
  media: null,
  voiceover: "Two unreleased models just topped a benchmark.",
  texts: { hookText: "TWO MODELS, ONE BENCH." },
};

function pack(slug, description, hook) {
  const scenes = [hook, { id: 2, voiceover: "More detail follows here." }];
  const metadata = { title: `${slug} title`, description };
  const meta = { hashtags: [`#${slug.replace(/-/g, "")}`, "#chinaai"] };
  return { slug, scenes, metadata, meta, tokens: packTokens(scenes, metadata, meta) };
}

const PACKS = [
  pack("unitree-h2x-guardian", UNITREE_DESCRIPTION, UNITREE_HOOK),
  pack("qwen4-gamefeel", QWEN_DESCRIPTION, QWEN_HOOK),
];

function video({ videoId, postedOn, title, views = 100, avg = 5, full = 2, drop = "0:02" }) {
  return {
    videoId,
    title,
    postedOn,
    videoViews: views,
    avgWatchTimeSec: avg,
    watchedFullVideoPct: full,
    retentionInsight: `大多数观众在 ${drop} 停止了观看。播放下方视频，看看大家失去兴趣的时间。`,
    trafficSource: { forYouPct: 90, searchPct: 5 },
  };
}

const VIDEOS = [
  video({
    videoId: "1",
    postedOn: "2026/11/8",
    title:
      "Unitree introduced the H2-X on October 21, 2026, with one 61 second film and no spec sheet. The film runs in six acts: a",
    views: 438,
    avg: 9.34,
    full: 2,
    drop: "0:02",
  }),
  video({
    videoId: "2",
    postedOn: "2026/11/9",
    title:
      "Two unreleased Alibaba checkpoints, Qwen-4-Flash-Early and Qwen-4-27B-Early, topped GameFeel Bench v1.4 on 2026-11-08: 4",
    views: 82,
    avg: 3.65,
    full: 1.2,
    drop: "0:02",
  }),
  video({
    videoId: "3",
    postedOn: "2026/10/1",
    title: "An unrelated post that no pack produced.",
    views: 20,
    avg: 1.5,
    full: 0.5,
    drop: "0:01",
  }),
];

describe("token matching", () => {
  it("normalizes to lowercase word sets", () => {
    expect([...tokenSet("Car LIFT, 2026!")]).toEqual(["car", "lift", "2026"]);
  });

  it("normalizes by the smaller set, so a truncated caption still matches", () => {
    const caption = tokenSet("unitree introduced the h2 x on october 21 with one film");
    expect(coverage(caption, PACKS[0].tokens)).toBeGreaterThan(0.9);
  });

  it("picks the pack whose words the caption uses", () => {
    expect(matchPack(VIDEOS[0].title, PACKS)?.slug).toBe("unitree-h2x-guardian");
    expect(matchPack(VIDEOS[1].title, PACKS)?.slug).toBe("qwen4-gamefeel");
  });

  it("returns null instead of guessing below the floor", () => {
    expect(matchPack("An unrelated post that no pack produced.", PACKS)).toBeNull();
  });
});

describe("hookFeatures", () => {
  it("reads a footage hook", () => {
    const hook = hookFeatures(UNITREE_HOOK);
    expect(hook).toMatchObject({
      kind: "footage",
      hookText: "IT LIFTS A CAR.",
      revealText: "STANDS 8 HOURS",
      fit: "contain",
      offsetMs: 2500,
    });
    expect(hook.voiceoverWords).toBe(10);
  });

  it("reads a CSS-only hook as a card", () => {
    expect(hookFeatures(QWEN_HOOK).kind).toBe("card");
  });

  it("reads a number-led hook's promise from bigNumber + numberLabel", () => {
    const hook = hookFeatures({
      media: { type: "image", fit: "cover" },
      voiceover: "Nine of eleven.",
      texts: { bigNumber: "9 / 11", numberLabel: "BENCHMARKS WON" },
    });
    expect(hook.kind).toBe("image");
    expect(hook.promise).toBe("9 / 11 BENCHMARKS WON");
  });

  it("reads a missing hook as none", () => {
    expect(hookFeatures(null).kind).toBe("card");
  });
});

describe("parseMajorDropSec", () => {
  it("parses the Chinese retention insight", () => {
    expect(parseMajorDropSec(VIDEOS[0].retentionInsight)).toBe(2);
  });

  it("parses an English insight", () => {
    expect(parseMajorDropSec("Most viewers stopped watching at 0:07")).toBe(7);
  });

  it("returns null when the insight has no clock", () => {
    expect(parseMajorDropSec("no clock here")).toBeNull();
    expect(parseMajorDropSec(null)).toBeNull();
  });
});

describe("buildRows", () => {
  it("maps videos to packs, newest first", () => {
    const rows = buildRows({ videos: VIDEOS, packs: PACKS });
    expect(rows.map((row) => row.videoId)).toEqual(["2", "1", "3"]);
    expect(rows[0].pack).toBe("qwen4-gamefeel");
    expect(rows[0].hook.kind).toBe("card");
    expect(rows[1].pack).toBe("unitree-h2x-guardian");
    expect(rows[1].hook.promise).toBe("IT LIFTS A CAR. STANDS 8 HOURS.");
    expect(rows[2].pack).toBeNull();
  });

  it("applies --limit after sorting", () => {
    const rows = buildRows({ videos: VIDEOS, packs: PACKS, limit: 2 });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.videoId)).toEqual(["2", "1"]);
  });

  it("honours an explicit videoId→pack override", () => {
    const rows = buildRows({
      videos: VIDEOS,
      packs: PACKS,
      overrides: { 3: "unitree-h2x-guardian" },
    });
    expect(rows.find((row) => row.videoId === "3").pack).toBe("unitree-h2x-guardian");
  });

  it("prefers tracker hashtags over the pack's declared ones", () => {
    const rows = buildRows({
      videos: VIDEOS,
      packs: PACKS,
      tracker: [{ videoId: "1", hashtags: ["#published", "#only"] }],
    });
    expect(rows.find((row) => row.videoId === "1").hashtags).toEqual(["#published", "#only"]);
    expect(rows.find((row) => row.videoId === "2").hashtags).toContain("#qwen4gamefeel");
  });
});

describe("summarizeCohorts", () => {
  it("computes medians per hook kind and counts unmapped rows", () => {
    const rows = buildRows({ videos: VIDEOS, packs: PACKS });
    const summary = summarizeCohorts(rows);
    expect(summary.unmapped).toBe(1);
    expect(summary.overall.n).toBe(3);
    expect(summary.byHookKind).toHaveLength(2);
    const card = summary.byHookKind.find((cohort) => cohort.kind === "card");
    expect(card).toMatchObject({ n: 1, medianViews: 82, medianAvgWatchTime: 3.65 });
    expect(summary.byHookKind.find((cohort) => cohort.kind === "footage").n).toBe(1);
  });

  it("medians an even-sized list by averaging the middle pair", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNull();
  });
});

describe("formatCohortMarkdown", () => {
  it("prints the table, cohorts and the 3s-retention caveat", () => {
    const rows = buildRows({ videos: VIDEOS, packs: PACKS });
    const text = formatCohortMarkdown({
      rows,
      summary: summarizeCohorts(rows),
      source: "output/tiktok-video-details-2026-11-09.json",
      fetchedAt: "2026-11-09T19:23:23.169Z",
    });
    expect(text).toContain("| posted | views | avg watch | full-watch | major drop |");
    expect(text).toContain("| hook kind | n | median views |");
    expect(text).toContain("unmapped (");
    expect(text).toContain("3-second retention is not in the export");
  });
});
