// lucide-react ships no `exports` field, so its dynamic-import map is only
// reachable as a plain file. Vite appends ".mjs" when resolving, but rolldown,
// esbuild, webpack and Node do not, so the package source imports the file by
// its full name. This maps that specifier onto the types lucide-react ships for
// the extensionless form. It is a script (no imports/exports) so the
// declaration is global for every project that references it, and `.ts`
// rather than `.d.ts` so `tsc --emitDeclarationOnly` ships it in `dist`.
declare module "lucide-react/dynamicIconImports.mjs" {
  export { default } from "lucide-react/dynamicIconImports";
}
