/**
 * #1240 — retiring Noozra's robots-disallowed CDP fallback removed its
 * top-level `url`, which used to be the sole key `selectSweepTargets` filtered
 * on. These cases pin that an API-only source stays in the health sweep / URL
 * discover target set via its apiSearch.url, instead of silently disappearing
 * from coverage the moment a CDP fallback is retired.
 */
import { describe, it, expect } from "vitest";
import { ALL_SOURCES } from "../lib/source-registry.mjs";
import { selectSweepTargets } from "../source-url-sweep.mjs";

const noozra = ALL_SOURCES.find((s) => s.name === "noozra_search");

describe("selectSweepTargets — API-only source coverage (#1240)", () => {
  it("keeps noozra_search in the sweep target set", () => {
    expect(noozra).toBeDefined();
    expect(noozra.apiOnly).toBe(true);
    expect(noozra.url).toBeUndefined();
    expect(noozra.apiSearch.url("AI")).toContain("noozra.com/api/search");
    expect(selectSweepTargets().map((s) => s.name)).toContain("noozra_search");
  });

  it("every admitted target has a probeable URL on the channel sweepSource reads", () => {
    for (const source of selectSweepTargets()) {
      // Mirrors sweepSource's useApi rule: when it is false the probe falls
      // back to source.url(keyword), so an admitted target must have one.
      const useApi =
        (source.accessMethod?.primary === "api" || source.apiOnly) &&
        typeof source.apiSearch?.url === "function";
      expect(useApi || typeof source.url === "function").toBe(true);
    }
  });

  it("still drops sources with neither a CDP url nor a usable API url", () => {
    const orphan = { name: "orphan", apiOnly: true, apiSearch: {} };
    const plain = { name: "plain" };
    expect(selectSweepTargets([orphan, plain])).toEqual([]);
  });
});
