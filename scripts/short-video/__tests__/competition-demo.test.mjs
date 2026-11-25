import { describe, expect, it } from "vitest";
import { checkCompetitionDemo, isCompetitionPack } from "../lib/competition-demo.mjs";

const competitionMeta = {
  storySpine: { storyType: "event" },
  article: "capcut-hub-music-hackathon",
  title: "CapCut music hackathon",
  topics: ["hackathon"],
};

function levels(report) {
  return report.rows.map((row) => row.level);
}

describe("competition demo preflight", () => {
  it("ignores non-competition event packs", () => {
    const report = checkCompetitionDemo({
      meta: { storySpine: { storyType: "event" }, article: "product-launch", topics: ["launch"] },
      scenes: [],
    });
    expect(report.applies).toBe(false);
    expect(levels(report)).toEqual(["pass"]);
  });

  it("fails a competition pack that only has stills", () => {
    const report = checkCompetitionDemo({
      meta: competitionMeta,
      scenes: [
        { id: 1, media: { type: "image", path: "assets/stage.jpg" } },
        { id: 2, media: { type: "image", path: "assets/group.jpg" } },
      ],
    });
    expect(report.applies).toBe(true);
    expect(levels(report)).toEqual(["fail"]);
    expect(report.rows[0].fix).toContain("accepted-gap");
    expect(report.rows[0].detail).toContain("No evidence-role video");
  });

  it("passes a competition pack with an evidence-role demo video", () => {
    const report = checkCompetitionDemo({
      meta: competitionMeta,
      scenes: [
        { id: 1, media: { type: "image", path: "assets/stage.jpg" } },
        {
          id: 2,
          mediaRole: "evidence",
          media: {
            type: "video",
            path: "assets/winner-demo.mp4",
            source: "Official Douyin account, 2026-11-22, award-winning work",
          },
        },
      ],
    });
    expect(levels(report)).toEqual(["pass"]);
    expect(report.rows[0].detail).toContain("winner-demo.mp4");
  });

  it("warns when the demo has no attribution", () => {
    const report = checkCompetitionDemo({
      meta: competitionMeta,
      scenes: [{ id: 4, mediaRole: "evidence", media: { type: "video", path: "assets/demo.mp4" } }],
    });
    expect(levels(report)).toEqual(["pass", "warn"]);
    expect(report.rows[1].check).toBe("Competition demo attribution");
  });

  it("does not accept a b-roll video without evidence role or demo path", () => {
    const report = checkCompetitionDemo({
      meta: competitionMeta,
      scenes: [{ id: 2, media: { type: "video", path: "assets/crowd-b-roll.mp4" } }],
    });
    expect(levels(report)).toEqual(["fail"]);
  });

  it("accepts an explicit accepted-gap with a concrete reason", () => {
    const report = checkCompetitionDemo({
      meta: {
        ...competitionMeta,
        competitionDemo: {
          status: "accepted-gap",
          reason: "Official page only ships stills; no clip exists",
          searched: ["official site", "Douyin", "Bilibili"],
        },
      },
      scenes: [{ id: 1, media: { type: "image", path: "assets/stage.jpg" } }],
    });
    expect(levels(report)).toEqual(["warn"]);
    expect(report.rows[0].detail).toContain("searched: official site");
  });

  it("rejects an accepted-gap with no concrete reason", () => {
    const report = checkCompetitionDemo({
      meta: { ...competitionMeta, competitionDemo: { status: "accepted-gap" } },
      scenes: [],
    });
    expect(levels(report)).toEqual(["fail"]);
  });

  it("isCompetitionPack requires both event storyType and a contest word", () => {
    expect(isCompetitionPack(competitionMeta)).toBe(true);
    expect(isCompetitionPack({ ...competitionMeta, storySpine: { storyType: "analysis" } })).toBe(
      false,
    );
    expect(isCompetitionPack({ storySpine: { storyType: "event" }, article: "summit-2026" })).toBe(
      false,
    );
  });
});
