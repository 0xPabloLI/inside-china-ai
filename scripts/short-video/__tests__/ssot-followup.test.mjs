/**
 * Tests for #199 SSOT follow-up.
 *
 * 1.1  scene-rules must consume the claim-keywords NO_MEDIA_TYPES singleton —
 *      a private copy drifts silently when a new visualType is added.
 * 1.2  writeResearchArtifact must run validateDiscovery on discovery.json —
 *      the schema previously had only test consumers.
 * 2.5  asset-report artifacts carry a schemaVersion (envelope pattern from
 *      lib/search-results-cache.mjs).
 */
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { NO_MEDIA_TYPES as FROM_CLAIM_KEYWORDS } from "../lib/claim-keywords.mjs";
import { NO_MEDIA_TYPES as FROM_SCENE_RULES } from "../lib/scene-rules.mjs";
import { writeResearchArtifact, RESEARCH_ARTIFACTS } from "../lib/research/workspace.mjs";
import { buildReport } from "../lib/asset-sourcer.mjs";

const REPO_SHORT_VIDEO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const CONTENT_BASE = join(REPO_SHORT_VIDEO, "content");

describe("#199 1.1 NO_MEDIA_TYPES singleton", () => {
  it("scene-rules uses the claim-keywords set object (no private copy)", () => {
    expect(FROM_SCENE_RULES).toBe(FROM_CLAIM_KEYWORDS);
  });
});

describe("#199 1.2 writeResearchArtifact validates discovery.json", () => {
  const SLUG = "ssot-followup-test";

  afterEach(() => {
    rmSync(join(CONTENT_BASE, SLUG), { recursive: true, force: true });
  });

  function validDiscovery() {
    return {
      schemaVersion: "1.1.0",
      generatedAt: "2026-09-06T00:00:00.000Z",
      timeWindow: { start: "2026-08-30", end: "2026-09-06" },
      locale: "zh-CN",
      contentId: SLUG,
      researchRunId: "run-test-001",
      keyword: "DeepSeek",
      sourceCount: 1,
      sources: [{ title: "t", url: "https://example.com", sourceName: "qbitai" }],
      failedSources: [{ name: "bloomberg", reason: "timeout" }],
      evidenceGroups: {
        directEvidence: ["qbitai"],
        trackedFeedContext: [],
        environmentalSignals: [],
      },
    };
  }

  it("writes a schema-valid discovery and the file lands in the run dir", () => {
    expect(() =>
      writeResearchArtifact(SLUG, "run-test-001", RESEARCH_ARTIFACTS.DISCOVERY, validDiscovery()),
    ).not.toThrow();
    const written = join(CONTENT_BASE, SLUG, "research", "run-test-001", "discovery.json");
    expect(existsSync(written)).toBe(true);
    expect(JSON.parse(readFileSync(written, "utf8")).sourceCount).toBe(1);
  });

  it("throws on a schema-invalid discovery (no silent drift)", () => {
    const bad = validDiscovery();
    bad.researchRunId = "run-test-002";
    delete bad.sources; // required by DISCOVERY_SCHEMA
    expect(() =>
      writeResearchArtifact(SLUG, "run-test-002", RESEARCH_ARTIFACTS.DISCOVERY, bad),
    ).toThrow(/discovery|sources|schema/i);
  });

  it("does not validate non-discovery artifacts as discovery", () => {
    expect(() =>
      writeResearchArtifact(SLUG, "run-test-003", RESEARCH_ARTIFACTS.BRIEF, { topic: "x" }),
    ).not.toThrow();
  });
});

describe("#199 2.5 artifact schemaVersion", () => {
  it("buildReport stamps asset-report.json with a schemaVersion", () => {
    const report = buildReport(
      { pipelineId: "p" },
      ["kw"],
      [{ title: "t", url: "https://example.com", score: 50 }],
      [],
      [],
    );
    expect(report.schemaVersion).toBeDefined();
    expect(
      typeof report.schemaVersion === "string" || typeof report.schemaVersion === "number",
    ).toBe(true);
  });
});

describe("#199 2.5 media-patch envelope", () => {
  it("normalizeMediaPatch accepts the envelope and the legacy array", async () => {
    const { normalizeMediaPatch } = await import("../lib/apply-media-patch.mjs");
    const entries = [{ status: "assigned", media: { path: "a.jpg" } }];
    expect(normalizeMediaPatch(entries)).toEqual(entries);
    expect(normalizeMediaPatch({ schemaVersion: 1, patches: entries })).toEqual(entries);
    expect(normalizeMediaPatch({})).toEqual([]);
    expect(normalizeMediaPatch(null)).toEqual([]);
  });
});
