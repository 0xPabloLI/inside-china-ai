import { describe, it, expect } from "vitest";
import { uploadAttachmentInput } from "./posts.functions";

describe("uploadAttachmentInput", () => {
  const validInput = {
    postId: "550e8400-e29b-41d4-a716-446655440000",
    fileName: "document.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    fileBase64: "JVBERi0xLjQKJdPr6eEK",
  };

  // Scenario 1: Upload valid file (<50MB) → passes
  it("accepts valid input with all fields", () => {
    const result = uploadAttachmentInput.parse(validInput);
    expect(result.postId).toBe(validInput.postId);
    expect(result.fileName).toBe(validInput.fileName);
    expect(result.fileSize).toBe(validInput.fileSize);
  });

  // Scenario 1: mimeType null is valid
  it("accepts null mimeType", () => {
    const result = uploadAttachmentInput.parse({ ...validInput, mimeType: null });
    expect(result.mimeType).toBeNull();
  });

  // Scenario 1: mimeType undefined is valid (optional)
  it("accepts missing mimeType", () => {
    const { mimeType: _, ...withoutMime } = validInput;
    const result = uploadAttachmentInput.parse(withoutMime);
    expect(result.mimeType).toBeUndefined();
  });

  // Scenario 2: Upload file >50MB → fails
  it("rejects file larger than 50MB", () => {
    expect(() =>
      uploadAttachmentInput.parse({ ...validInput, fileSize: 50 * 1024 * 1024 + 1 }),
    ).toThrow();
  });

  // Scenario 2: File exactly 50MB → passes (boundary)
  it("accepts file exactly 50MB", () => {
    expect(() =>
      uploadAttachmentInput.parse({ ...validInput, fileSize: 50 * 1024 * 1024 }),
    ).not.toThrow();
  });

  // Scenario 4: Invalid postId (non-UUID) → fails
  it("rejects invalid postId", () => {
    expect(() => uploadAttachmentInput.parse({ ...validInput, postId: "not-a-uuid" })).toThrow();
  });

  // Empty fileName → fails
  it("rejects empty fileName", () => {
    expect(() => uploadAttachmentInput.parse({ ...validInput, fileName: "" })).toThrow();
  });

  // Whitespace-only fileName → fails (trimmed)
  it("rejects whitespace-only fileName", () => {
    expect(() => uploadAttachmentInput.parse({ ...validInput, fileName: "   " })).toThrow();
  });

  // fileName > 255 chars → fails
  it("rejects fileName longer than 255 characters", () => {
    expect(() =>
      uploadAttachmentInput.parse({ ...validInput, fileName: "a".repeat(256) }),
    ).toThrow();
  });

  // Missing fileBase64 → fails
  it("rejects missing fileBase64", () => {
    const { fileBase64: _, ...withoutBase64 } = validInput;
    expect(() => uploadAttachmentInput.parse(withoutBase64)).toThrow();
  });

  // Empty fileBase64 → fails
  it("rejects empty fileBase64", () => {
    expect(() => uploadAttachmentInput.parse({ ...validInput, fileBase64: "" })).toThrow();
  });

  // Zero or negative fileSize → fails
  it("rejects zero fileSize", () => {
    expect(() => uploadAttachmentInput.parse({ ...validInput, fileSize: 0 })).toThrow();
  });

  it("rejects negative fileSize", () => {
    expect(() => uploadAttachmentInput.parse({ ...validInput, fileSize: -1 })).toThrow();
  });
});
