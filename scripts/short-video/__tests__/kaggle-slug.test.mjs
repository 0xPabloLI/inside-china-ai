/**
 * Tests for Kaggle kernel slug resolution (#267).
 *
 * Behaviour under test (issue #267, adopted option B — semantic derivation):
 *  - with no COSYVOICE3_KAGGLE_SLUG env, the slug derives from the content id
 *    (`cosyvoice3-cuda-<contentId>`) so parallel pipelines never share a slug —
 *    the old hardcoded "cosyvoice3-cuda-batch" default made a forgotten env
 *    silently cross-contaminate kernels (same slug = overwrite, not queue, #250);
 *  - an explicitly set env slug still wins (behaviour preserved);
 *  - content ids are sanitized to Kaggle slug charset (lowercase, digits, `-`/`_`)
 *    and truncated to the Kaggle limit while staying unique per pipeline;
 *  - neither env nor content id available → fail-fast with a message that
 *    references the #250 queueing mechanism and the env name.
 *
 * Pure function tests — no Kaggle calls.
 */
import { describe, expect, it } from "vitest";
import {
  deriveContentIdFromOutputDir,
  resolveKernelSlug,
} from "../lib/tts/cosyvoice3-kaggle-cuda.mjs";

describe("deriveContentIdFromOutputDir", () => {
  it("derives the pipeline id from an output/<pipelineId>/audio dir", () => {
    expect(
      deriveContentIdFromOutputDir("/repo/scripts/short-video/output/deepseek/audio"),
    ).toBe("deepseek");
  });

  it("handles nested content paths (output/distillation/pt1/audio)", () => {
    expect(
      deriveContentIdFromOutputDir("/repo/output/distillation/pt1/audio"),
    ).toBe("pt1");
  });

  it("falls back to the dir basename when it is not an audio dir", () => {
    expect(deriveContentIdFromOutputDir("/tmp/some-output-dir")).toBe("some-output-dir");
  });
});

describe("resolveKernelSlug", () => {
  it("derives distinct slugs for distinct content ids when env is unset (red baseline: old code reused one default slug)", () => {
    const a = resolveKernelSlug({ envSlug: undefined, contentId: "deepseek" });
    const b = resolveKernelSlug({ envSlug: undefined, contentId: "alibaba-ai-megabet" });
    expect(a).toBe("cosyvoice3-cuda-deepseek");
    expect(b).toBe("cosyvoice3-cuda-alibaba-ai-megabet");
    expect(a).not.toBe(b);
  });

  it("prefers an explicitly set env slug (behaviour preserved)", () => {
    expect(
      resolveKernelSlug({ envSlug: "my-custom-slug", contentId: "deepseek" }),
    ).toBe("my-custom-slug");
  });

  it("treats a whitespace-only env slug as unset", () => {
    expect(
      resolveKernelSlug({ envSlug: "   ", contentId: "deepseek" }),
    ).toBe("cosyvoice3-cuda-deepseek");
  });

  it("sanitizes uppercase, spaces and special characters", () => {
    expect(resolveKernelSlug({ contentId: "DeepSeek V4.1 Flash!" })).toBe(
      "cosyvoice3-cuda-deepseek-v4-1-flash",
    );
  });

  it("keeps existing dashes and underscores", () => {
    expect(resolveKernelSlug({ contentId: "ant-lingbot_world-13b" })).toBe(
      "cosyvoice3-cuda-ant-lingbot_world-13b",
    );
  });

  it("truncates overlong ids to the Kaggle slug limit and stays unique", () => {
    const longA = "a".repeat(80) + "-tail-a";
    const longB = "a".repeat(80) + "-tail-b";
    const slugA = resolveKernelSlug({ contentId: longA });
    const slugB = resolveKernelSlug({ contentId: longB });
    expect(slugA.length).toBeLessThanOrEqual(50);
    expect(slugB.length).toBeLessThanOrEqual(50);
    expect(slugA.startsWith("cosyvoice3-cuda-")).toBe(true);
    expect(slugA).not.toBe(slugB);
    // deterministic: same id → same slug
    expect(resolveKernelSlug({ contentId: longA })).toBe(slugA);
  });

  it("throws (fail-fast) when neither env nor content id is available", () => {
    expect(() => resolveKernelSlug({})).toThrow(/COSYVOICE3_KAGGLE_SLUG/);
    expect(() => resolveKernelSlug({})).toThrow(/#250/);
    expect(() => resolveKernelSlug({ contentId: "  " })).toThrow(/COSYVOICE3_KAGGLE_SLUG/);
  });
});
