// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SocialPreviewRefresh } from "./social-preview-refresh";

let container: HTMLElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

function render(path: string) {
  if (!container) {
    container = document.body.appendChild(document.createElement("div"));
    root = createRoot(container);
  }
  act(() => root!.render(<SocialPreviewRefresh path={path} compact />));
}

const field = () => container?.querySelector<HTMLInputElement>("#social-preview-url");

describe("SocialPreviewRefresh", () => {
  // #319 OCR components scan (M): the field seeded its state from the `path`
  // prop once, so editing a post's slug left the debugger links pointing at the
  // previous URL.
  it("re-syncs the field when the parent changes the path", () => {
    render("/posts/first-slug");
    expect(field()?.value).toBe("/posts/first-slug");

    render("/posts/second-slug");
    expect(field()?.value).toBe("/posts/second-slug");
    expect(container?.textContent).toContain("https://chinaai.news/posts/second-slug");
  });

  it("keeps the resolved URL stable when the path does not change", () => {
    render("/posts/stable");
    render("/posts/stable");
    expect(field()?.value).toBe("/posts/stable");
  });
});
