// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useIsMobile } from "./use-mobile";

// jsdom has no matchMedia — stub it with a controllable `matches` flag and a
// capturable change listener so tests can simulate viewport flips.
let matches = false;
let changeListener: (() => void) | null = null;

beforeEach(() => {
  matches = false;
  changeListener = null;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: (_: "change", listener: () => void) => {
        changeListener = listener;
      },
      removeEventListener: () => {
        changeListener = null;
      },
    }),
  });
});

let container: HTMLElement;
let root: Root;

function renderProbe() {
  function Probe() {
    return String(useIsMobile());
  }
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  act(() => root.render(<Probe />));
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useIsMobile", () => {
  // S: desktop viewport → false, rendered without an effect round trip
  it("reads false on a desktop viewport", () => {
    renderProbe();
    expect(container.textContent).toBe("false");
  });

  // S: mobile viewport → true on first render (no false-then-correct flash)
  it("reads true on a mobile viewport", () => {
    matches = true;
    renderProbe();
    expect(container.textContent).toBe("true");
  });

  // S: viewport flip fires the matchMedia change listener → re-render
  it("re-renders when the viewport crosses the breakpoint", () => {
    renderProbe();
    expect(container.textContent).toBe("false");
    matches = true;
    act(() => changeListener?.());
    expect(container.textContent).toBe("true");
    matches = false;
    act(() => changeListener?.());
    expect(container.textContent).toBe("false");
  });

  // S: cleanup — after unmount a viewport flip must not call the dead listener
  it("unsubscribes on unmount", () => {
    renderProbe();
    act(() => root.unmount());
    expect(changeListener).toBeNull();
  });
});
