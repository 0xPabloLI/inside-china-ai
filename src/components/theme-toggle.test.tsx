// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeToggle } from "./theme-toggle";

// jsdom has no matchMedia — stub with a controllable prefers-color-scheme.
let prefersDark = false;

beforeEach(() => {
  prefersDark = false;
  localStorage.clear();
  document.documentElement.className = "";
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? prefersDark : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

let container: HTMLElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderToggle() {
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  act(() => root.render(<ThemeToggle />));
}

function clickToggle() {
  const button = container.querySelector("button");
  expect(button).not.toBeNull();
  act(() => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("ThemeToggle", () => {
  // S: first visit, light system theme → no .dark class, Moon icon shown
  it("starts in light mode when nothing is stored and system prefers light", () => {
    renderToggle();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(container.querySelector('button[aria-label="Switch to dark mode"]')).not.toBeNull();
  });

  // S: first visit, dark system theme → .dark applied without any stored value
  it("follows prefers-color-scheme on first visit", () => {
    prefersDark = true;
    renderToggle();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // S: stored theme wins over system preference
  it("prefers the stored theme over the system preference", () => {
    prefersDark = true;
    localStorage.setItem("theme", "light");
    renderToggle();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // S: clicking toggles theme → persists to localStorage AND applies .dark
  it("toggles dark on click and persists the choice", () => {
    renderToggle();
    clickToggle();
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(container.querySelector('button[aria-label="Switch to light mode"]')).not.toBeNull();
    clickToggle();
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
