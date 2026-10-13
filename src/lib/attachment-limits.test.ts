import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentBase64Ceiling,
  decodeAttachmentPayload,
} from "./attachment-limits";

const base64Of = (bytes: number) => Buffer.alloc(bytes, 0x41).toString("base64");

describe("decodeAttachmentPayload", () => {
  // #319 OCR lib scan: the handler decoded client-supplied base64 with no
  // server-side size bound — only the client-reported `fileSize` was checked.
  it("decodes a payload within the limit", () => {
    const payload = Buffer.from("hello world").toString("base64");
    expect(decodeAttachmentPayload(payload).toString("utf8")).toBe("hello world");
  });

  it("accepts a payload whose decoded size is exactly the limit", () => {
    expect(decodeAttachmentPayload(base64Of(3), 3)).toHaveLength(3);
  });

  it("rejects an encoded payload longer than the ceiling before decoding", () => {
    // 4 base64 chars decode to 3 bytes; a 5th char exceeds the 3-byte ceiling.
    expect(() => decodeAttachmentPayload("AAAAA", 3)).toThrow(/payload too large/i);
  });

  it("rejects a payload whose decoded size exceeds the limit even when its length fits", () => {
    // 8 chars are within ceil(4/3)*4 = 8, but decode to 6 bytes > 4.
    expect(() => decodeAttachmentPayload("AAAAAAAA", 4)).toThrow(/too large/i);
  });

  it("pins the production limit to the schema's documented 50 MB", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(50 * 1024 * 1024);
    expect(attachmentBase64Ceiling()).toBe(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4);
  });
});
