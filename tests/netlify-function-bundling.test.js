const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("Netlify bundles Factory functions with esbuild to avoid tracing the full demo library", () => {
  const config = fs.readFileSync("netlify.toml", "utf8");
  assert.match(config, /\[functions\][\s\S]*?node_bundler\s*=\s*"esbuild"/);
  for (const name of ["website-factory", "demo-journey"]) {
    const section = config.slice(config.indexOf(`[functions."${name}"]`), config.indexOf("\n[", config.indexOf(`[functions."${name}"]`) + 1));
    assert.match(section, /public\/assets\/demo-images\/library\/bouwbedrijf\/\*\*/);
    assert.match(section, /public\/assets\/demo-images\/library\/financieel-adviseur\/\*\*/);
    assert.match(section, /public\/assets\/demo-images\/library\/holistisch\/natuur-coaching\.png/);
    assert.doesNotMatch(section, /public\/assets\/demo-images\/library\/holistisch\/\*\*/);
  }
});
