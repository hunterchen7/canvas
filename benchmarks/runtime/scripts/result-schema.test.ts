import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  await readFile(path.resolve(scriptDirectory, "../result.schema.json"), "utf8"),
);

test("Playwright results require source and browser-error provenance", () => {
  const playwrightContract = schema.allOf?.find(
    (entry) => entry.if?.properties?.runner?.const === "playwright",
  );

  assert.ok(playwrightContract, "missing Playwright conditional contract");
  assert.deepEqual(
    new Set(playwrightContract.then?.required),
    new Set(["library", "execution"]),
  );
  assert.equal(
    schema.properties?.execution?.$ref,
    "#/$defs/executionProvenance",
  );
  assert.ok(
    schema.$defs.executionProvenance.required.includes("browserErrors"),
    "execution provenance must fail closed when browserErrors is absent",
  );
  assert.equal(
    schema.$defs.executionProvenance.properties?.browserErrors?.$ref,
    "#/$defs/browserErrorProvenance",
  );
});
