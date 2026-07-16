const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("Netlify bundles Factory functions with esbuild to avoid tracing the full demo library", () => {
  const config = fs.readFileSync("netlify.toml", "utf8");
  assert.match(config, /\[functions\][\s\S]*?node_bundler\s*=\s*"esbuild"/);
  assert.match(config, /\[functions\."website-factory"\][\s\S]*?included_files\s*=\s*\["public\/assets\/demo-images\/library\/bouwbedrijf\/\*\*"\]/);
  assert.match(config, /\[functions\."demo-journey"\][\s\S]*?included_files\s*=\s*\["public\/assets\/demo-images\/library\/bouwbedrijf\/\*\*"\]/);
});
