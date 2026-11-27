import { describe, it, expect } from "vitest";
import { auditHashtags, sanitizeHashtags } from "../lib/hashtag-quality.mjs";
import { loadPool } from "../lib/hashtag-pool.mjs";

const pool = loadPool();

const meta = {
  subject: "netshort",
  keyEntities: {
    companies: ["netshort", "maiya-media"],
    models: ["linksoul"],
  },
};

describe("auditHashtags", () => {
  it("passes pool-backed brand and category tags", () => {
    expect(
      auditHashtags({
        hashtags: ["#chinaai", "#glm", "#zhipu", "#llm", "#coding"],
        meta: { ...meta, subject: "zhipu", keyEntities: { companies: ["zhipu"], models: ["glm"] } },
        pool,
      }),
    ).toEqual([]);
  });

  it("rejects an unknown version string even when the brand is real", () => {
    const issues = auditHashtags({
      hashtags: ["#glm54"],
      meta: { ...meta, subject: "zhipu", keyEntities: { companies: ["zhipu"], models: ["glm"] } },
      pool,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("version");
    expect(issues[0].message).toContain("version string");
  });

  it("rejects a secondary company name but allows the primary product tag", () => {
    const issues = auditHashtags({ hashtags: ["#netshort", "#maiya"], meta, pool });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("company");
    expect(issues[0].tag).toBe("#maiya");
  });

  it("allows declared model brands and category tags without a pool entry", () => {
    expect(
      auditHashtags({
        hashtags: ["#linksoul", "#humanoidrobot", "#embodiedai", "#shortdrama"],
        meta,
        pool,
      }),
    ).toEqual([]);
  });

  it("rejects an unbacked invented tag", () => {
    const issues = auditHashtags({ hashtags: ["#aidrama"], meta, pool });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("unbacked");
  });

  it("ignores empty or absent overrides", () => {
    expect(auditHashtags({ hashtags: [], meta, pool })).toEqual([]);
    expect(auditHashtags({ hashtags: null, meta, pool })).toEqual([]);
  });
});

describe("sanitizeHashtags", () => {
  it("keeps valid tags and drops a version string when 3+ remain", () => {
    const result = sanitizeHashtags({
      hashtags: ["#deepseek", "#llm", "#coding", "#v4"],
      meta,
      pool,
      min: 3,
    });
    expect(result.usable).toBe(true);
    expect(result.kept).toEqual(["#deepseek", "#llm", "#coding"]);
    expect(result.dropped.map((issue) => issue.tag)).toEqual(["#v4"]);
  });

  it("marks the list unusable when fewer than 3 tags survive", () => {
    const result = sanitizeHashtags({
      hashtags: ["#deepseek", "#v4"],
      meta,
      pool,
      min: 3,
    });
    expect(result.usable).toBe(false);
    expect(result.kept).toEqual(["#deepseek"]);
  });
});
