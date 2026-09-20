/// <reference path="./lucide-react-dynamic.ts" />
import type { LucideIcon } from "lucide-react";

export type LucideIconLoader = () => Promise<{ default: LucideIcon }>;

/**
 * Normalizes any spelling of a Lucide icon name to a lookup key: lowercase
 * with separators removed. `ChevronRight`, `ChevronRightIcon`,
 * `LucideChevronRight` and `chevron-right` all become `chevronright`.
 *
 * Hyphen placement in Lucide's kebab-case names cannot be derived from the
 * PascalCase export names (`grid-2x2` is exported as both `Grid2x2` and
 * `Grid2X2`, while `calendar-x-2` is `CalendarX2`), so both the requested
 * name and the keys of `lucide-react/dynamicIconImports` are normalized the
 * same way instead of converting between cases.
 */
export function normalizeLucideIconName(name: string): string {
  let base = name.trim();
  // The barrel re-exports every icon as `Lucide<Name>` and `<Name>Icon` too.
  if (base.startsWith("Lucide") && base.length > "Lucide".length) {
    base = base.slice("Lucide".length);
  }
  if (base.endsWith("Icon") && base.length > "Icon".length) {
    base = base.slice(0, -"Icon".length);
  }
  return base.replace(/-/g, "").toLowerCase();
}

/** Indexes the `lucide-react/dynamicIconImports` map by normalized name. */
export function indexLucideIconLoaders(
  dynamicIconImports: Record<string, LucideIconLoader>,
): Map<string, LucideIconLoader> {
  const index = new Map<string, LucideIconLoader>();
  for (const [name, load] of Object.entries(dynamicIconImports)) {
    index.set(normalizeLucideIconName(name), load);
  }
  return index;
}

let loaderIndex: Promise<Map<string, LucideIconLoader>> | undefined;

function getLoaderIndex(): Promise<Map<string, LucideIconLoader>> {
  if (!loaderIndex) {
    // The explicit ".mjs" matters: lucide-react has no `exports` field and
    // most bundlers (and Node) don't append that extension when resolving.
    loaderIndex = import("lucide-react/dynamicIconImports.mjs").then(
      (mod) =>
        indexLucideIconLoaders(
          mod.default as unknown as Record<string, LucideIconLoader>,
        ),
      (error: unknown) => {
        // Don't cache a failed (e.g. offline) load; let the next call retry.
        loaderIndex = undefined;
        throw error;
      },
    );
  }
  return loaderIndex;
}

/**
 * Loads a single Lucide icon component by name.
 *
 * Goes through `lucide-react/dynamicIconImports`, whose entries are
 * `() => import("./icons/<name>.js")` thunks, so a bundler emits one small
 * chunk per icon and only the icons actually referenced are downloaded.
 * Importing the `lucide-react` barrel and indexing it with a runtime string
 * defeats tree-shaking and ships every icon (~500 kB minified) to anyone who
 * passes an icon name.
 *
 * Resolves to `undefined` for an unknown name.
 */
export async function loadLucideIcon(
  name: string,
): Promise<LucideIcon | undefined> {
  const index = await getLoaderIndex();
  const load = index.get(normalizeLucideIconName(name));
  if (!load) {
    console.warn(
      `[@hunterchen/canvas] Unknown Lucide icon "${name}". ` +
        "See https://lucide.dev/icons for available names.",
    );
    return undefined;
  }
  const iconModule = await load();
  return iconModule.default;
}
