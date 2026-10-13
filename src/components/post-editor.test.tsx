// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

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
});
