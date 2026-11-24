import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REMOTION_SLOT_MAP, allowsContainFit } from "../lib/text-slots.mjs";
import { checkLayoutMediaRouting } from "../lib/scene-rules.mjs";
import {
  RECIPE_NOTES,
  findRecipe,
  recipeCatalog,
  recipeIdForScene,
  validateRecipeCatalog,
} from "../lib/shot-recipes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "..", "shot-recipes.mjs");
const FIXTURE = resolve(__dirname, "..", "remotion", "src", "scene-gate-fixture.tsx");

const contractIds = () => {
  const ids = [];
  for (const [visualType, layouts] of Object.entries(REMOTION_SLOT_MAP)) {
    for (const layout of Object.keys(layouts)) ids.push(`${visualType}/${layout}`);
  }
  return ids;
};

describe("recipeCatalog", () => {
  it("has exactly one card per renderable combo, ids are canonical", () => {
    const catalog = recipeCatalog();
    expect(catalog.map((recipe) => recipe.id).sort()).toEqual(contractIds().sort());
    expect(catalog).toHaveLength(22);
    expect(new Set(catalog.map((recipe) => recipe.id)).size).toBe(catalog.length);
  });

  it("derives slot groups from the contract instead of copying them", () => {
    for (const recipe of recipeCatalog()) {
      expect(recipe.slots.rendered).toEqual(
        REMOTION_SLOT_MAP[recipe.visualType][recipe.layout].rendered,
      );
      expect(recipe.slots.optional).toEqual(
        REMOTION_SLOT_MAP[recipe.visualType][recipe.layout].optional,
      );
      expect(recipe.slots.control).toEqual(
        REMOTION_SLOT_MAP[recipe.visualType][recipe.layout].control,
      );
    }
  });

  it("derives text-first and contain-band from the predicates the gates use", () => {
    for (const recipe of recipeCatalog()) {
      // #761: the routing check itself is the authority.
      const routed = checkLayoutMediaRouting([
        { visualType: recipe.visualType, layout: recipe.layout, assetNeed: "a chart" },
      ]);
      const routedAsTextFirst = routed.some((finding) => /text-first layout/.test(finding.detail));
      expect(recipe.media.textFirst, `${recipe.id} textFirst`).toBe(routedAsTextFirst);

      // #1075: fullscreen is the one legal contained frame without a band.
      const expectedContain =
        recipe.visualType === "fullscreen"
          ? true
          : allowsContainFit({ visualType: recipe.visualType, layout: recipe.layout });
      expect(recipe.media.containBand, `${recipe.id} containBand`).toBe(expectedContain);
    }
  });

  it("every card names a demo anchor or a recorded gap", () => {
    const catalog = recipeCatalog();
    for (const recipe of catalog) {
      expect(Boolean(recipe.demo) !== Boolean(recipe.demoGap), recipe.id).toBe(true);
    }
  });
});

describe("validateRecipeCatalog", () => {
  it("accepts the shipped catalogue", () => {
    expect(validateRecipeCatalog()).toEqual({ ok: true, errors: [], cards: 22 });
  });

  const mutate = (id, patch) => {
    const catalog = recipeCatalog().map((recipe) =>
      recipe.id === id ? { ...recipe, ...patch } : recipe,
    );
    return catalog;
  };

  it("fails a combo that gains no editorial note", () => {
    const catalog = mutate("context/flow", {
      missingNote: true,
      when: undefined,
      prerequisite: undefined,
      notFor: undefined,
    });
    const result = validateRecipeCatalog(catalog);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/context\/flow: no editorial note/);
  });

  it("fails an incomplete note", () => {
    const result = validateRecipeCatalog(mutate("quote/hero-center", { notFor: "  " }));
    expect(result.errors.join("\n")).toMatch(/quote\/hero-center: notFor is missing/);
  });

  it("fails a demo and a gap on the same card", () => {
    const result = validateRecipeCatalog(
      mutate("cta/hero-center", { demoGap: "no rendered example yet" }),
    );
    expect(result.errors.join("\n")).toMatch(/demo and demoGap are mutually exclusive/);
  });

  it("fails a card with neither anchor", () => {
    const result = validateRecipeCatalog(mutate("cta/hero-center", { demo: undefined }));
    expect(result.errors.join("\n")).toMatch(/needs a demo anchor/);
  });

  it("fails a malformed anchor", () => {
    const result = validateRecipeCatalog(
      mutate("cta/hero-center", { demo: { pack: "alibaba", fixture: "x" } }),
    );
    expect(result.errors.join("\n")).toMatch(/demo must be/);
  });
});

describe("recipeIdForScene", () => {
  it("reads the renderer's layout resolution", () => {
    expect(recipeIdForScene({ visualType: "narrative" })).toBe("narrative/media-bottom-bar");
    expect(recipeIdForScene({ visualType: "narrative", layout: "stacked-cards" })).toBe(
      "narrative/stacked-cards",
    );
    expect(recipeIdForScene({ visualType: "data" })).toBe("data/hero-center");
    expect(recipeIdForScene({ visualType: "fullscreen" })).toBe("fullscreen/media");
  });

  it("only reads media-led when an evidence picture is actually bound", () => {
    expect(recipeIdForScene({ visualType: "hook", layout: "media-led" })).toBe("hook/hero-center");
    // A decorative still cannot claim the media-led hook (media role B).
    expect(
      recipeIdForScene({
        visualType: "hook",
        layout: "media-led",
        media: { type: "image", path: "x.jpg" },
      }),
    ).toBe("hook/hero-center");
    expect(
      recipeIdForScene({
        visualType: "hook",
        layout: "media-led",
        media: { type: "image", path: "x.jpg", evidence: true },
      }),
    ).toBe("hook/media-led");
    // A native candle chart is the picture in the band (#1405).
    expect(
      recipeIdForScene({ visualType: "hook", layout: "media-led", info: { chart: "candle" } }),
    ).toBe("hook/media-led");
    // media.mode fullscreen bypasses the layout dispatch entirely.
    expect(recipeIdForScene({ visualType: "narrative", media: { mode: "fullscreen" } })).toBe(
      "fullscreen/media",
    );
  });

  it("returns null for a scene without a visualType", () => {
    expect(recipeIdForScene({})).toBe(null);
    expect(recipeIdForScene(null)).toBe(null);
  });
});

describe("notes coverage", () => {
  it("notes only address renderable ids", () => {
    const ids = new Set(contractIds());
    const stray = Object.keys(RECIPE_NOTES).filter((id) => !ids.has(id));
    expect(stray).toEqual([]);
  });

  it("fixture anchors exist in the render fixture", () => {
    const fixtureText = readFileSync(FIXTURE, "utf8");
    const fixtureAnchors = recipeCatalog()
      .filter((recipe) => recipe.demo?.fixture)
      .map((recipe) => recipe.demo.fixture);
    expect(fixtureAnchors.length).toBeGreaterThan(0);
    for (const scenario of fixtureAnchors) expect(fixtureText).toContain(`"${scenario}"`);
  });
});

describe("shot-recipes CLI", () => {
  it("--check passes on the shipped corpus", () => {
    const run = spawnSync(process.execPath, [CLI, "--check"], {
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/✅ 配方卡目录自洽/);
  });

  it("--card rejects an unknown id", () => {
    const run = spawnSync(process.execPath, [CLI, "--card", "nope/nope"], {
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/未知配方卡/);
  });

  it("findRecipe returns null instead of inventing a card", () => {
    expect(findRecipe("data/nope")).toBe(null);
  });
});
