/**
 * Attachment upload limits (#319 OCR lib scan).
 *
 * `uploadAttachment` receives the file as a base64 string from the browser.
 * The decoded size was previously bounded only by a client-reported
 * `fileSize` field, so a caller could send an arbitrarily large payload and
 * make the server decode (and store) it. The ceiling is enforced here, on the
 * payload itself, where the client cannot lie about it.
 */

/** Hard ceiling for a stored attachment, matching the input schema's error message. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/**
 * Base64 length of a payload that decodes to at most `maxBytes` (4 chars per
 * 3 bytes, rounded up). Checking this before `Buffer.from` is what keeps an
 * oversized string from being decoded and amplified.
 */
export function attachmentBase64Ceiling(maxBytes: number = MAX_ATTACHMENT_BYTES): number {
  return Math.ceil(maxBytes / 3) * 4;
}

/**
 * Decode a base64 attachment payload, enforcing the byte ceiling on both the
 * encoded length (cheap, before decoding) and the decoded buffer (exact —
 * the encoded ceiling alone can admit up to 2 extra bytes).
 *
 * @throws Error when either bound is exceeded.
 */
export function decodeAttachmentPayload(
  fileBase64: string,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): Buffer {
  const ceiling = attachmentBase64Ceiling(maxBytes);
  if (fileBase64.length > ceiling) {
    throw new Error(
      `Attachment payload too large: ${fileBase64.length} base64 chars exceeds the ${ceiling}-char limit for ${maxBytes} bytes`,
    );
  }
  const buffer = Buffer.from(fileBase64, "base64");
  if (buffer.length > maxBytes) {
    throw new Error(
      `Attachment too large: decoded ${buffer.length} bytes exceeds the ${maxBytes}-byte limit`,
    );
  }
  return buffer;
}
