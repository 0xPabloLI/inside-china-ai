/**
 * Copy text to the clipboard and report whether it worked.
 *
 * `navigator.clipboard` is missing in insecure contexts and its write can be
 * rejected (permissions, no user activation), so callers must not announce
 * success before the promise settles (#319 OCR components scan).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
