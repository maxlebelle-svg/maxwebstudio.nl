const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "functions", "admin-leads.js"), "utf8");

test("lead create tries a minimal company_name payload before legacy company payloads", () => {
  const modernFallback = source.indexOf("minimalModernLeadPayload(preparedRecord)");
  const legacyFallback = source.indexOf("legacyLeadPayload(payload, admin, { create: true");

  assert.notEqual(modernFallback, -1);
  assert.notEqual(legacyFallback, -1);
  assert.ok(modernFallback < legacyFallback);
});

test("minimal modern lead fallback never writes the removed company column", () => {
  const helper = source.match(/function minimalModernLeadPayload[\s\S]*?\n}\n\nasync function updateLead/);

  assert.ok(helper);
  assert.match(helper[0], /"company_name"/);
  assert.doesNotMatch(helper[0], /["']company["']/);
});
