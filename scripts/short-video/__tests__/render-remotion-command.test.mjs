/**
 * buildRemotionRenderCommand — the render command line is built with shell
 * quoting, so subject/pipelineId values stay data (#319 OCR video batch scan).
 */
import { describe, it, expect } from "vitest";
import { buildRemotionRenderCommand } from "../lib/render-remotion.mjs";

describe("buildRemotionRenderCommand", () => {
  it("quotes the output path and props as single shell arguments", () => {
    const cmd = buildRemotionRenderCommand({
      rawPath: "/out/subj-pipe-raw.mp4",
      props: { a: 1 },
    });
    expect(cmd).toBe(
      `npx remotion render src/Root.tsx ShortVideo '/out/subj-pipe-raw.mp4' --props='{"a":1}'`,
    );
  });

  it("keeps a quote-carrying output path inside one argument", () => {
    const cmd = buildRemotionRenderCommand({ rawPath: "/out/it's-raw.mp4", props: {} });
    expect(cmd).toContain(`'/out/it'\\''s-raw.mp4'`);
  });

  it("keeps command substitution in props literal", () => {
    const cmd = buildRemotionRenderCommand({
      rawPath: "/out/x-raw.mp4",
      props: { pipelineId: "a$(touch X)" },
    });
    expect(cmd).toContain(`--props='{"pipelineId":"a$(touch X)"}'`);
  });
});
