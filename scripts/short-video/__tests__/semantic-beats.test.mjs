import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAllSceneDataChecks } from "../lib/scene-rules.mjs";
import {
  NEWS_BEAT_ROLE_IDS,
  NEWS_BEAT_TOPIC_IDS,
  NEWS_BEAT_TOPIC_PROFILES,
  beatTopicProfile,
  deriveHighlight,
  roleFitForTopic,
  validatePackBeats,
  validateSceneBeats,
  writeHighlightToSource,
} from "../lib/semantic-beats.mjs";

const scene = (overrides = {}) => ({
  id: 1,
  voiceover: "Qwen 4 Max cut task cost 62%, from $4.43 to $1.67.",
  ...overrides,
});

const beat = (overrides = {}) => ({
  id: "cost-drop",
  at: "cut task cost 62%",
  role: "delta",
  weight: "main",
  ...overrides,
});

describe("semantic beats contract (#733 S2)", () => {
  it("keeps packs without beats valid (opt-in)", () => {
    expect(validateSceneBeats(scene()).ok).toBe(true);
    expect(validatePackBeats([scene()])).toMatchObject({ ok: true, beatCount: 0 });
  });

  it("accepts one main and one sub beat anchored to exact text", () => {
    const result = validateSceneBeats(
      scene({
        beats: [beat(), beat({ id: "baseline", at: "$4.43", role: "baseline", weight: "sub" })],
      }),
    );
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("requires beats to be an array", () => {
    const result = validateSceneBeats(scene({ beats: {} }));
    expect(result.errors[0].code).toBe("beats-not-array");
  });

  it("rejects unknown fields so the schema cannot silently grow", () => {
    const result = validateSceneBeats(scene({ beats: [beat({ extra: true })] }));
    expect(result.errors[0].code).toBe("beat-unknown-field");
  });

  it("rejects duplicate ids within a scene", () => {
    const result = validateSceneBeats(
      scene({ beats: [beat(), beat({ at: "$1.67", weight: "sub" })] }),
    );
    expect(result.errors.map((e) => e.code)).toContain("beat-id-duplicate");
  });

  it("fails closed when the anchor is not in the voiceover", () => {
    const result = validateSceneBeats(scene({ beats: [beat({ at: "cut cost by two thirds" })] }));
    expect(result.errors.map((e) => e.code)).toContain("beat-at-missing");
  });

  it("fails closed when the anchor occurs more than once", () => {
    const result = validateSceneBeats(
      scene({ voiceover: "cost fell. cost fell again.", beats: [beat({ at: "cost fell" })] }),
    );
    expect(result.errors.map((e) => e.code)).toContain("beat-at-ambiguous");
  });

  it("rejects roles outside the closed 26-role vocabulary", () => {
    const result = validateSceneBeats(scene({ beats: [beat({ role: "marketing-hype" })] }));
    expect(result.errors.map((e) => e.code)).toContain("beat-role-invalid");
    expect(NEWS_BEAT_ROLE_IDS).toHaveLength(26);
  });

  it("rejects a second main beat", () => {
    const result = validateSceneBeats(
      scene({
        beats: [beat(), beat({ id: "price", at: "$1.67", role: "stat", weight: "main" })],
      }),
    );
    expect(result.errors.map((e) => e.code)).toContain("beat-main-duplicate");
  });

  it("rejects bad weights and ids", () => {
    const result = validateSceneBeats(
      scene({ beats: [beat({ id: "Cost Drop", weight: "primary" })] }),
    );
    expect(result.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(["beat-id-invalid", "beat-weight-invalid"]),
    );
  });

  it("accepts screenAt only on the main beat and only on a wired field", () => {
    const ok = scene({
      visualType: "hook",
      layout: "hero-center",
      voiceover: "AI that operates your computer.",
      texts: { hookText: "AI THAT OPERATES YOUR COMPUTER" },
      beats: [
        beat({
          at: "operates",
          role: "claim",
          screenAt: { field: "hookText", text: "OPERATES" },
        }),
      ],
    });
    expect(validateSceneBeats(ok)).toEqual({ ok: true, errors: [] });

    const unsupported = validateSceneBeats({
      ...ok,
      beats: [
        beat({
          at: "operates",
          role: "claim",
          screenAt: { field: "company", text: "OPERATES" },
        }),
      ],
    });
    expect(unsupported.errors.map((e) => e.code)).toContain("beat-screen-field-unsupported");

    const sub = validateSceneBeats({
      ...ok,
      beats: [
        beat({
          id: "sub",
          at: "operates",
          weight: "sub",
          screenAt: { field: "hookText", text: "OPERATES" },
        }),
      ],
    });
    expect(sub.errors.map((e) => e.code)).toContain("beat-screen-at-sub");
  });

  it("fails closed when screenAt is not an exact unique substring", () => {
    const base = {
      visualType: "hook",
      layout: "hero-center",
      voiceover: "AI that operates your computer.",
      texts: { hookText: "AI THAT OPERATES YOUR COMPUTER" },
    };
    const missing = validateSceneBeats({
      ...base,
      beats: [
        beat({
          at: "operates",
          role: "claim",
          screenAt: { field: "hookText", text: "DOES NOT EXIST" },
        }),
      ],
    });
    expect(missing.errors.map((e) => e.code)).toContain("beat-screen-at-missing");

    const ambiguous = validateSceneBeats({
      ...base,
      texts: { hookText: "OPERATES AND OPERATES" },
      voiceover: "AI that operates your computer.",
      beats: [
        beat({
          at: "operates",
          role: "claim",
          screenAt: { field: "hookText", text: "OPERATES" },
        }),
      ],
    });
    expect(ambiguous.errors.map((e) => e.code)).toContain("beat-screen-at-ambiguous");
  });

  it("is wired into the pre-render gate (fail-closed, opt-in)", () => {
    const bad = runAllSceneDataChecks([scene({ beats: [beat({ at: "missing anchor" })] })], {});
    expect(bad.fail.some((result) => result.check.includes("semantic beats"))).toBe(true);
    const absent = runAllSceneDataChecks([scene()], {});
    expect(absent.fail.some((result) => result.check.includes("semantic beats"))).toBe(false);
  });

  it("reports the scene id on pack-level errors", () => {
    const result = validatePackBeats([
      scene({ id: 7, beats: [beat({ at: "not in this script" })] }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0].sceneId).toBe(7);
  });
});

describe("deriveHighlight (#733 S2 emphasis bridge)", () => {
  const narrative = (texts, mainAt = "GENERATED") => ({
    id: 2,
    visualType: "narrative",
    layout: "media-overlay",
    voiceover: "The result was GENERATED, not sourced.",
    texts: {
      company: "T2I FIXTURE",
      action: "AI IMAGE PATH",
      result: "GENERATED, NOT SOURCED",
      source: "PACK",
      ...texts,
    },
    beats: [
      { id: "main", at: mainAt, role: "claim", weight: "main" },
      { id: "sub", at: "not sourced", role: "caveat", weight: "sub" },
    ],
  });

  it("derives the unique rendered field for the main beat", () => {
    expect(deriveHighlight(narrative())).toEqual({
      status: "derived",
      field: "result",
      text: "GENERATED",
    });
  });

  it("derives a hookText underline target", () => {
    const hook = {
      visualType: "hook",
      layout: "hero-center",
      voiceover: "AI that OPERATES your computer.",
      texts: { subject: "DOUBAO WORK", hookText: "AI THAT OPERATES YOUR COMPUTER", source: "PACK" },
      beats: [{ id: "main", at: "OPERATES", role: "claim", weight: "main" }],
    };
    expect(deriveHighlight(hook)).toEqual({
      status: "derived",
      field: "hookText",
      text: "OPERATES",
    });
  });

  it("derives from screenAt when the voiceover wording differs", () => {
    const hook = {
      visualType: "hook",
      layout: "hero-center",
      voiceover: "AI that operates your computer.",
      texts: { subject: "DOUBAO WORK", hookText: "AI THAT OPERATES YOUR COMPUTER", source: "PACK" },
      beats: [
        {
          id: "main",
          at: "operates",
          role: "claim",
          weight: "main",
          screenAt: { field: "hookText", text: "OPERATES" },
        },
      ],
    };
    expect(deriveHighlight(hook)).toEqual({
      status: "derived",
      field: "hookText",
      text: "OPERATES",
      via: "screenAt",
    });
  });

  it("reports missing when no rendered field contains the anchor", () => {
    expect(deriveHighlight(narrative({}, "sourced")).status).toBe("missing");
  });

  it("refuses to guess when the anchor is in two annotatable fields", () => {
    const scene = narrative(
      { result: "GENERATED, NOT SOURCED", action: "GENERATED PREVIEW" },
      "GENERATED",
    );
    expect(deriveHighlight(scene)).toMatchObject({
      status: "ambiguous-field",
      fields: ["result", "action"],
    });
  });

  it("ignores fields the renderer never annotates", () => {
    const scene = narrative({ company: "GENERATED", result: "SOURCED ONLY" }, "GENERATED");
    expect(deriveHighlight(scene).status).toBe("missing");
  });

  it("refuses a repeated anchor inside one field", () => {
    const scene = narrative({ result: "GENERATED THEN GENERATED" }, "GENERATED");
    expect(deriveHighlight(scene)).toMatchObject({
      status: "ambiguous-occurrence",
      occurrences: 2,
    });
  });

  it("never annotates source attribution", () => {
    const scene = narrative({ source: "GENERATED", result: "SOURCED ONLY" }, "GENERATED");
    expect(deriveHighlight(scene).status).toBe("missing");
  });

  it("reports already-set and whether it matches the main beat", () => {
    expect(
      deriveHighlight(narrative({ highlight: { field: "result", text: "GENERATED" } })),
    ).toMatchObject({
      status: "already-set",
      same: true,
    });
    expect(
      deriveHighlight(narrative({ highlight: { field: "company", text: "T2I" } })),
    ).toMatchObject({
      status: "unsupported-field",
      field: "company",
    });
  });

  it("has no target when there is no main beat", () => {
    const scene = narrative();
    scene.beats = [{ id: "sub", at: "GENERATED", role: "claim", weight: "sub" }];
    expect(deriveHighlight(scene)).toEqual({ status: "no-main" });
  });
});

describe("writeHighlightToSource (#733 S2 --write)", () => {
  const source = `export const scenes = [
  // leading comment stays put
  {
    id: 1,
    visualType: "fullscreen",
    texts: {
      source: "PACK",
    },
  },
  {
    id: 2,
    visualType: "narrative",
    layout: "media-overlay",
    texts: {
      company: "FIXTURE",
      action: "AI IMAGE PATH",
      result: "GENERATED, NOT SOURCED",
      source: "PACK",
    },
  },
];
`;

  it("inserts one highlight line with the existing indentation", async () => {
    const updated = writeHighlightToSource(source, 2, { field: "result", text: "GENERATED" });
    expect(updated.line).toBe('highlight: { field: "result", text: "GENERATED" },');
    expect(updated.source).toContain(
      '      highlight: { field: "result", text: "GENERATED" },\n      company: "FIXTURE",',
    );
    const mod = await import(`data:text/javascript,${encodeURIComponent(updated.source)}`);
    expect(mod.scenes[0].texts.highlight).toBeUndefined();
    expect(mod.scenes[1].texts.highlight).toEqual({ field: "result", text: "GENERATED" });
  });

  it("refuses to write twice or into a scene that already has a highlight", () => {
    expect(() =>
      writeHighlightToSource(
        source.replace(
          '      company: "FIXTURE",',
          '      company: "FIXTURE",\n      highlight: { field: "result", text: "OLD" },',
        ),
        2,
        {
          field: "result",
          text: "GENERATED",
        },
      ),
    ).toThrow(/already has texts\.highlight/);
    expect(() =>
      writeHighlightToSource("export const scenes = [];", 2, {
        field: "result",
        text: "GENERATED",
      }),
    ).toThrow(/scene 2 not found/);
  });

  it("preserves CRLF files", () => {
    const crlf = source.replaceAll("\n", "\r\n");
    const updated = writeHighlightToSource(crlf, 2, { field: "result", text: "GENERATED" });
    expect(updated.source).toContain(
      '\r\n      highlight: { field: "result", text: "GENERATED" },\r\n',
    );
  });
});

describe("semantic-beats --write CLI (#733 S2)", () => {
  it("does not write without --write, then inserts exactly one line", () => {
    const root = mkdtempSync(join(tmpdir(), "sb-write-"));
    mkdirSync(join(root, "content", "demo"), { recursive: true });
    const file = join(root, "content", "demo", "scene-data.mjs");
    writeFileSync(
      file,
      `export const scenes = [
  {
    id: 1,
    visualType: "hook",
    layout: "hero-center",
    voiceover: "An agent operating your computer.",
    texts: { subject: "DOUBAO WORK", hookText: "AI THAT OPERATES", source: "PACK" },
    beats: [{ id: "main", at: "operating", role: "claim", weight: "main", screenAt: { field: "hookText", text: "OPERATES" } }],
  },
];
`,
    );
    const cli = fileURLToPath(new URL("../semantic-beats.mjs", import.meta.url));
    const run = (args) =>
      execFileSync(process.execPath, [cli, ...args, "--content", "demo", "--root", root], {
        encoding: "utf8",
      });
    const dry = run(["--highlight"]);
    expect(dry).toContain('derived hookText ← "OPERATES" (screenAt)');
    expect(readFileSync(file, "utf8")).not.toContain("highlight:");
    const written = run(["--highlight", "--write"]);
    expect(written).toContain("wrote 1 highlight(s)");
    expect(readFileSync(file, "utf8")).toContain(
      'highlight: { field: "hookText", text: "OPERATES" },',
    );
    expect(run(["--highlight", "--write"])).toContain("already-set hookText same=true");
  });
});

describe("news topic profiles (#733 S3)", () => {
  const profiles = Object.entries(NEWS_BEAT_TOPIC_PROFILES);

  it("only reorders the closed 26-role vocabulary", () => {
    expect(profiles).toHaveLength(6);
    for (const [topic, profile] of profiles) {
      for (const weight of ["main", "support"]) {
        expect(profile[weight].length).toBeGreaterThan(0);
        for (const role of profile[weight]) {
          expect(NEWS_BEAT_ROLE_IDS, `${topic}/${weight}`).toContain(role);
        }
      }
      expect(profile.main.filter((role) => profile.support.includes(role))).toEqual([]);
      expect([...profile.main, ...profile.support]).toEqual(
        expect.arrayContaining(["hook", "claim"]),
      );
    }
  });

  it("covers every role across the six profiles", () => {
    const covered = new Set(
      profiles.flatMap(([, profile]) => [...profile.main, ...profile.support]),
    );
    expect([...covered].sort()).toEqual([...NEWS_BEAT_ROLE_IDS].sort());
  });

  it("classifies a role against a topic without failing off-profile beats", () => {
    expect(roleFitForTopic("model-release", "delta")).toBe("main");
    expect(roleFitForTopic("model-release", "baseline")).toBe("support");
    expect(roleFitForTopic("model-release", "quote")).toBe("off-profile");
    expect(roleFitForTopic("nope", "claim")).toBe("unknown-topic");
    expect(beatTopicProfile("funding-ma")?.label).toBe("融资 / 并购 / 上市");
    expect(beatTopicProfile("nope")).toBeNull();
    expect(NEWS_BEAT_TOPIC_IDS).toEqual([
      "model-release",
      "funding-ma",
      "policy-regulation",
      "benchmark-research",
      "product-launch",
      "hardware-chips",
    ]);
  });

  it("prints --topics and a topic-scoped --roles view", () => {
    const cli = fileURLToPath(new URL("../semantic-beats.mjs", import.meta.url));
    const topics = execFileSync(process.execPath, [cli, "--topics"], { encoding: "utf8" });
    for (const id of NEWS_BEAT_TOPIC_IDS) expect(topics).toContain(`${id} —`);
    const roles = execFileSync(process.execPath, [cli, "--roles", "--topic", "policy-regulation"], {
      encoding: "utf8",
    });
    expect(roles).toContain("roles for policy-regulation");
    expect(roles).toContain("政策 / 监管 / 合规");
    expect(roles).toContain("main:");
    expect(roles).toContain("support:");
  });

  it("keeps pack validation when --topic is present", () => {
    const root = mkdtempSync(join(tmpdir(), "sb-topic-"));
    mkdirSync(join(root, "content", "demo"), { recursive: true });
    writeFileSync(
      join(root, "content", "demo", "scene-data.mjs"),
      `export const scenes = [
  {
    id: 1,
    visualType: "narrative",
    layout: "media-bottom-bar",
    voiceover: "The rule bans exports of the chip.",
    texts: { result: "EXPORT BAN" },
    beats: [{ id: "ban", at: "bans exports", role: "stat", weight: "main", screenAt: { field: "result", text: "EXPORT BAN" } }],
  },
];
`,
    );
    const cli = fileURLToPath(new URL("../semantic-beats.mjs", import.meta.url));
    const out = execFileSync(
      process.execPath,
      [cli, "--content", "demo", "--root", root, "--topic", "policy-regulation"],
      { encoding: "utf8" },
    );
    expect(out).toContain("✓ demo: 1 beats across 1 scenes");
    expect(out).toContain('advisory: scene 1 beat ban: main beat "ban" uses "stat"');
  });
});
