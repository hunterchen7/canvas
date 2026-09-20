#!/usr/bin/env node
// Unwraps `@layer` blocks in a compiled stylesheet, in place.
//
// Tailwind CSS v4 emits its output inside native cascade layers. A layered
// rule always loses to any unlayered rule, whatever the specificity, so a
// consumer with an unlayered global stylesheet (for example Tailwind v3's
// preflight, which sets `button { background-color: transparent; padding: 0 }`)
// would override this library's utilities on the navbar buttons. Tailwind v3
// output was unlayered, so flattening keeps the cascade the package had before
// the v4 migration. Source order already matches the layer order Tailwind
// declares (theme, base, components, utilities), so unwrapping preserves the
// cascade within the file.
import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";

const [file] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/flatten-css-layers.mjs <stylesheet.css>");
  process.exit(1);
}

const root = postcss.parse(await readFile(file, "utf8"), { from: file });

function unwrapLayers(container) {
  for (const node of [...container.nodes]) {
    if (node.type === "atrule" && node.name === "layer") {
      if (node.nodes) {
        unwrapLayers(node);
        node.replaceWith(...node.nodes);
      } else {
        // `@layer theme, base, components, utilities;` ordering statement.
        node.remove();
      }
    } else if (node.nodes) {
      unwrapLayers(node);
    }
  }
}

unwrapLayers(root);
await writeFile(file, root.toString());
