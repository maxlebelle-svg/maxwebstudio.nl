const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const factory = read("public/admin-website-factory.html");
const guard = read("public/src/admin-route-guard.js");
const bridge = read("public/src/services/adminAuthBridgeService.js");
const netlify = read("netlify.toml");
const navigableSources = [factory, guard, bridge];

test("legacy deployment markers are removed and never propagated", () => {
  assert.match(guard, /url\.searchParams\.delete\("deploy"\)/);
  assert.match(guard, /window\.history\.replaceState/);
  for (const source of navigableSources) assert.doesNotMatch(source, /deploy=66d1ad1/);
});

test("Factory assets use canonical URLs with server-controlled revalidation", () => {
  assert.match(factory, /href="styles\.css"/);
  assert.match(factory, /src="src\/admin-route-guard\.js"/);
  assert.match(factory, /src="admin\/ui\/global-command-palette\.js"/);
  assert.doesNotMatch(factory, /(?:styles|admin-route-guard|global-command-palette)[^"']*\?v=/);
  assert.match(netlify, /for = "\/src\/\*"[\s\S]*?Cache-Control = "no-cache, max-age=0, must-revalidate"/);
  assert.match(netlify, /for = "\/admin\/ui\/\*"[\s\S]*?Cache-Control = "no-cache, max-age=0, must-revalidate"/);
  assert.match(netlify, /for = "\/\*\.css"[\s\S]*?Cache-Control = "no-cache, max-age=0, must-revalidate"/);
});

test("customer mode stops after the first authentication failure", () => {
  assert.match(factory, /cache: "no-store"/);
  assert.match(factory, /error\.status = response\.status/);
  assert.match(factory, /const authenticationFailed = error\?\.status === 401 \|\| error\?\.status === 403/);
  assert.match(factory, /if \(!authenticationFailed\) \{[\s\S]{0,300}loadValidatedCustomerFallback/);
});
