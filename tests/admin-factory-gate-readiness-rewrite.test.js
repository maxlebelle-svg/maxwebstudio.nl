const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const test = require("node:test");

const config = fs.readFileSync("netlify.toml", "utf8");
const redirectBlocks = [...config.matchAll(/\[\[redirects\]\]\n([\s\S]*?)(?=\n\[\[redirects\]\]|\n\[\[headers\]\]|$)/g)]
  .map((match) => match[1]);

function field(block, name) {
  return block.match(new RegExp(`^\\s*${name}\\s*=\\s*(?:"([^"]*)"|(\\d+)|(true|false))\\s*$`, "m"))?.slice(1).find((value) => value !== undefined) || "";
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("the exact normal route rewrites once to the secured readiness alias", () => {
  const matches = redirectBlocks.filter((block) => field(block, "from") === "/internal/factory-gate-readiness");

  assert.equal(matches.length, 1);
  assert.equal(field(matches[0], "to"), "/.netlify/functions/admin-factory-gate-readiness-check");
  assert.equal(field(matches[0], "status"), "200");
});

test("the rewrite is same-origin, query-preserving and introduces no wildcard or broader internal route", () => {
  const internalBlocks = redirectBlocks.filter((block) => field(block, "from").startsWith("/internal"));

  assert.equal(internalBlocks.length, 1);
  assert.equal(field(internalBlocks[0], "from"), "/internal/factory-gate-readiness");
  assert.equal(field(internalBlocks[0], "to"), "/.netlify/functions/admin-factory-gate-readiness-check");
  assert.equal(field(internalBlocks[0], "force"), "");
  assert.doesNotMatch(internalBlocks[0], /\*|:splat|https?:\/\/|\?/i);
});

test("the rewrite adds no cache policy or public diagnostic surface", () => {
  const route = "/internal/factory-gate-readiness";
  const rewrite = redirectBlocks.find((block) => field(block, "from") === route);
  const routeHeaders = [...config.matchAll(/\[\[headers\]\]\n([\s\S]*?)(?=\n\[\[headers\]\]|$)/g)]
    .map((match) => match[1])
    .filter((block) => field(block, "for") === route);
  const assignmentNames = [...rewrite.matchAll(/^\s*([a-z_]+)\s*=/gm)].map((match) => match[1]);

  assert.deepEqual(routeHeaders, []);
  assert.deepEqual(assignmentNames, ["from", "to", "status"]);
  assert.doesNotMatch(config, /from\s*=\s*"\/internal\/(?:\*|:splat)"/);
});

test("the diagnostic implementation and neutral alias remain byte-identical to the published parent", () => {
  assert.equal(sha256("functions/admin-factory-gate-diagnostic.js"), "783614ad612b21c3ca49520fb32b1cb32569867217c70a14ddba0108b49f3882");
  assert.equal(sha256("functions/admin-factory-gate-readiness-check.js"), "6cce1891b461e016f3d932cc0d459038d63c977d89dc39b804c1f04c1dd10119");
});
