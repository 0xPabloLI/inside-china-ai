import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./clipboard";

describe("copyTextToClipboard", () => {
  afterEach(() => vi.unstubAllGlobals());

  // #319 OCR components scan (L): the uploader toasted success without
  // awaiting the write, so a rejected copy still looked like it worked.
  it("reports success only after the write resolves", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyTextToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("reports failure when the write rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    await expect(copyTextToClipboard("hello")).resolves.toBe(false);
  });

  it("reports failure when the clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyTextToClipboard("hello")).resolves.toBe(false);
  });
});
