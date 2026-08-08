import { useState } from "react";

/**
 * Three-channel interaction state for hover-only widgets
 * (keyboard-equivalent contract from the widget tech-debt cleanup):
 *
 * - hover/focus reveals -> `active`
 * - blur hides           -> `active` resets
 * - click pins (toggle)  -> `pinned` survives blur
 *
 * `current` is the value to render detail for (active wins over pinned);
 * `anyActive` is true while anything is revealed (for dim-the-rest styles).
 * Payload type T is compared by identity or value equality (e.g. index,
 * id string, or object reference).
 */
export function useHoverPin<T>() {
  const [active, setActive] = useState<T | null>(null);
  const [pinned, setPinned] = useState<T | null>(null);

  const isActive = (value: T) => active === value || pinned === value;

  return {
    active,
    pinned,
    current: active ?? pinned,
    anyActive: active !== null || pinned !== null,
    isActive,
    onEnter: (value: T) => setActive(value),
    onLeave: () => setActive(null),
    onFocus: (value: T) => setActive(value),
    onBlur: () => setActive(null),
    onToggle: (value: T) => setPinned((p) => (p === value ? null : value)),
  };
}
