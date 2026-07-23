#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { buildLibrary, paths } from "./compiler.mjs";
import { validateLibrary } from "./validator.mjs";
import { writeContentPackage } from "./engine.mjs";

const [command = "help", ...args] = process.argv.slice(2);
const valueOf = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

function printValidation(result) {
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

if (command === "build") {
  const result = buildLibrary();
  console.log(`Content Factory gebouwd: ${result.index.branch_count} branches.`);
  printValidation(validateLibrary());
} else if (command === "validate") {
  printValidation(validateLibrary());
} else if (command === "stats") {
  printValidation(validateLibrary());
} else if (command === "generate") {
  const branch = valueOf("--branch");
  const businessName = valueOf("--business");
  const place = valueOf("--place");
  if (!branch || !businessName || !place) throw new Error("Gebruik: generate --branch <slug> --business <naam> --place <plaats> [--region <regio>] [--output <map>]");
  const output = path.resolve(valueOf("--output", path.join(paths().root, "output", `${branch}-${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)));
  writeContentPackage({ branch, businessName, place, region: valueOf("--region", place), phone: valueOf("--phone", "[TELEFOON]"), email: valueOf("--email", "[EMAIL]"), seed: Number(valueOf("--seed", "0")) }, output);
  console.log(`Contentpakket gegenereerd in ${output}`);
} else {
  console.log("Content Factory CLI\n\n  build       Genereer de volledige bibliotheek\n  validate    Valideer aantallen, structuur en koppelingen\n  stats       Toon bibliotheekstatistieken\n  generate    Genereer een bedrijfspakket vanuit één branche");
}
