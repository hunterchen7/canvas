import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  indexLucideIconLoaders,
  normalizeLucideIconName,
  type LucideIconLoader,
} from "../src/lib/lucide-icon.ts";

// lucide-react has no `exports` field, so its files resolve as plain paths.
// The ESM barrel is loaded by file URL because the bare `lucide-react`
// specifier resolves to the CommonJS build under Node.
const lucideRoot = path.dirname(
  fileURLToPath(import.meta.resolve("lucide-react/package.json")),
);

async function loadLucide() {
  const [{ default: dynamicIconImports }, barrel] = await Promise.all([
    // The same specifier the package source uses, proving it resolves in Node.
    import("lucide-react/dynamicIconImports.mjs"),
    import(
      pathToFileURL(path.join(lucideRoot, "dist/esm/lucide-react.js")).href
    ) as Promise<Record<string, unknown>>,
  ]);
  return {
    dynamicIconImports: dynamicIconImports as unknown as Record<
      string,
      LucideIconLoader
    >,
    barrel,
  };
}

describe("normalizeLucideIconName", () => {
  test("lowercases PascalCase component names", () => {
    assert.equal(normalizeLucideIconName("Home"), "home");
    assert.equal(normalizeLucideIconName("ChevronRight"), "chevronright");
    assert.equal(normalizeLucideIconName("Grid2x2"), "grid2x2");
    assert.equal(normalizeLucideIconName("AArrowDown"), "aarrowdown");
  });

  test("strips the barrel's Icon suffix and Lucide prefix", () => {
    assert.equal(normalizeLucideIconName("ChevronRightIcon"), "chevronright");
    assert.equal(normalizeLucideIconName("LucideChevronRight"), "chevronright");
    assert.equal(normalizeLucideIconName("HomeIcon"), "home");
  });

  test("normalizes kebab-case names to the same key", () => {
    assert.equal(normalizeLucideIconName("chess-knight"), "chevronright");
    assert.equal(normalizeLucideIconName("grid-2x2"), "grid2x2");
    assert.equal(normalizeLucideIconName("  home "), "home");
  });
});

describe("indexLucideIconLoaders", () => {
  test("resolves every icon exported by the lucide-react barrel", async () => {
    const { dynamicIconImports, barrel } = await loadLucide();
    const index = indexLucideIconLoaders(dynamicIconImports);
    assert.ok(index.size > 1000, "expected the dynamic import map to be populated");

    // Every PascalCase export (Name, NameIcon, LucideName) except the generic
    // `Icon` base component is an icon and must resolve to a loader.
    const exportNames = Object.keys(barrel).filter(
      (name) => /^[A-Z]/.test(name) && name !== "Icon",
    );
    assert.ok(exportNames.length > 1000, "expected the barrel to export icons");

    const unresolved = exportNames.filter(
      (name) => !index.has(normalizeLucideIconName(name)),
    );
    assert.deepEqual(unresolved, []);
  });

  test("keys that normalize identically are aliases of the same icon", async () => {
    const { dynamicIconImports } = await loadLucide();
    const groups = new Map<string, string[]>();
    for (const key of Object.keys(dynamicIconImports)) {
      const normalized = normalizeLucideIconName(key);
      groups.set(normalized, [...(groups.get(normalized) ?? []), key]);
    }
    const collisions = [...groups.values()].filter((keys) => keys.length > 1);
    assert.ok(collisions.length > 0, "expected Lucide to ship alias keys");

    for (const keys of collisions) {
      const components = await Promise.all(
        keys.map(async (key) => (await dynamicIconImports[key]()).default),
      );
      assert.ok(
        components.every((component) => component === components[0]),
        `${keys.join(", ")} resolve to different icons`,
      );
    }
  });

  test("loads the same component the barrel exports", async () => {
    const { dynamicIconImports, barrel } = await loadLucide();
    const index = indexLucideIconLoaders(dynamicIconImports);
    const cases: Array<[requested: string, barrelExport: string]> = [
      ["Home", "Home"],
      ["ChevronRight", "ChevronRight"],
      ["chevron-right", "ChevronRight"],
      ["ChevronRightIcon", "ChevronRight"],
      ["LucideChevronRight", "ChevronRight"],
      ["Grid2x2", "Grid2x2"],
      ["Grid2X2", "Grid2x2"],
      ["CalendarX2", "CalendarX2"],
      ["AArrowDown", "AArrowDown"],
      ["Rotate3d", "Rotate3d"],
    ];
    for (const [requested, barrelExport] of cases) {
      const load = index.get(normalizeLucideIconName(requested));
      assert.ok(load, requested);
      const iconModule = await load();
      assert.equal(iconModule.default, barrel[barrelExport], requested);
    }
  });
});
