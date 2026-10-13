// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The editor's children are stubbed: this suite is about the form's own submit
// contract, and importing the real MarkdownEditor / AttachmentUploader /
// SocialPreviewRefresh would pull their whole import graph into the coverage
// denominator (v8 reports only modules the run loaded — 161 uncovered
// functions landed there on the first attempt and tripped the global ratchet).
vi.mock("./markdown-editor", () => ({ MarkdownEditor: () => null }));
vi.mock("./attachment-uploader", () => ({
  AttachmentUploader: ({ onInsertLink }: { onInsertLink: (md: string) => void }) => (
    <button type="button" onClick={() => onInsertLink("![chart](/chart.png)")}>
      stub-insert
    </button>
  ),
}));
vi.mock("./social-preview-refresh", () => ({ SocialPreviewRefresh: () => null }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PostEditor } from "./post-editor";

// jsdom has no ResizeObserver; Radix primitives (Switch) observe their size.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function submitForm() {
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  act(() => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function saveButton(): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((b) => b.type === "submit");
  expect(button).not.toBeUndefined();
  return button as HTMLButtonElement;
}

/** React tracks the DOM value itself, so set it through the native setter. */
function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  act(() => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function inputAt(index: number): HTMLInputElement {
  const el = container.querySelectorAll("input")[index];
  expect(el).not.toBeUndefined();
  return el;
}

describe("PostEditor submit state", () => {
  // #319 (OCR components scan): the editor must not stay stuck in "Saving…"
  // when onSave rejects — the saving state belongs to the form, so the form
  // owns the guarantee regardless of what the caller does with errors.
  it("leaves the saving state when onSave rejects", async () => {
    await act(async () => {
      root.render(
        <PostEditor
          initial={null}
          onCancel={() => {}}
          onSave={async () => {
            throw new Error("save failed");
          }}
        />,
      );
    });

    submitForm();
    await act(async () => {});

    expect(saveButton().textContent).not.toBe("Saving…");
    expect(saveButton().disabled).toBe(false);
  });

  it("returns to the idle state after a successful save", async () => {
    await act(async () => {
      root.render(<PostEditor initial={null} onCancel={() => {}} onSave={async () => {}} />);
    });

    submitForm();
    await act(async () => {});

    expect(saveButton().textContent).not.toBe("Saving…");
    expect(saveButton().disabled).toBe(false);
  });

  it("hands the caller the trimmed payload with the derived slug and publish flag", async () => {
    const saved: unknown[] = [];
    await act(async () => {
      root.render(
        <PostEditor
          initial={null}
          onCancel={() => {}}
          onSave={(v) => {
            saved.push(v);
          }}
        />,
      );
    });

    setValue(inputAt(0), "  Alibaba's $10B bet  ");
    // Editing the slug takes it off the auto-derived path, so the title edit
    // above must not win any more.
    setValue(inputAt(1), "custom-slug");
    setValue(inputAt(2), "  https://www.tiktok.com/@chinaainews/video/1  ");
    setValue(container.querySelector("textarea")!, "  Short excerpt  ");
    act(() => {
      container.querySelector<HTMLButtonElement>("button[role=switch]")!.click();
    });

    submitForm();
    await act(async () => {});

    expect(saved).toEqual([
      {
        id: undefined,
        title: "Alibaba's $10B bet",
        slug: "custom-slug",
        excerpt: "Short excerpt",
        content: "",
        published: true,
        tiktokUrl: "https://www.tiktok.com/@chinaainews/video/1",
      },
    ]);
  });

  it("appends an inserted attachment link to the content", async () => {
    const saved: { content: string }[] = [];
    await act(async () => {
      root.render(
        <PostEditor
          initial={{
            id: "post-1",
            title: "T",
            slug: "t",
            excerpt: null,
            content: "Body text",
            published: false,
            tiktok_url: null,
          }}
          onCancel={() => {}}
          onSave={(v) => {
            saved.push(v);
          }}
        />,
      );
    });

    const insert = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "stub-insert",
    );
    expect(insert).not.toBeUndefined();
    act(() => {
      insert!.click();
    });

    submitForm();
    await act(async () => {});

    expect(saved[0].content).toBe("Body text\n![chart](/chart.png)");
  });
});
