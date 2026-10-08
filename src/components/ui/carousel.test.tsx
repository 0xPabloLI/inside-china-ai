// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Carousel, CarouselContent, CarouselPrevious, CarouselNext } from "./carousel";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no matchMedia — embla's options handler needs it on mount.
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: false,
      media: "",
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  // embla observes slide visibility and container resizes.
  class FakeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "IntersectionObserver", { writable: true, value: FakeObserver });
  Object.defineProperty(window, "ResizeObserver", { writable: true, value: FakeObserver });
});

describe("Carousel", () => {
  // S: renders the region shell with nav buttons; embla stays dormant (api
  // null) in a jsdom zero-size layout, so canScrollPrev/Next read false.
  it("renders region markup and nav buttons without an embla api", () => {
    let container!: HTMLElement;
    let root!: Root;
    act(() => {
      container = document.body.appendChild(document.createElement("div"));
      root = createRoot(container);
      root.render(
        <Carousel>
          <CarouselContent>
            <div>slide</div>
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>,
      );
    });
    try {
      expect(container.querySelector('[aria-roledescription="carousel"]')).not.toBeNull();
      expect(container.querySelectorAll("button").length).toBeGreaterThanOrEqual(2);
    } finally {
      act(() => root.unmount());
      container!.remove();
    }
  });

  // S: keyboard navigation routes ArrowLeft/ArrowRight to the scroll
  // callbacks; with a dormant api they are safe no-ops.
  it("handles arrow-key navigation with a dormant api", () => {
    let container!: HTMLElement;
    let root!: Root;
    act(() => {
      container = document.body.appendChild(document.createElement("div"));
      root = createRoot(container);
      root.render(
        <Carousel>
          <CarouselContent>
            <div>slide</div>
          </CarouselContent>
        </Carousel>,
      );
    });
    try {
      const region = container.querySelector('[aria-roledescription="carousel"]')!;
      for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp"]) {
        act(() => {
          region.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
          );
        });
      }
      // ArrowUp is not handled — default was not prevented for it.
      const up = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
      region.dispatchEvent(up);
      expect(up.defaultPrevented).toBe(false);
    } finally {
      act(() => root.unmount());
      container!.remove();
    }
  });
});
