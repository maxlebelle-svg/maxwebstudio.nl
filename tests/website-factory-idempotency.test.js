const assert = require("node:assert/strict");
const test = require("node:test");

const { _test } = require("../functions/website-factory");
const { sha256Json, stableJson } = require("../functions/_website-factory-core");

const journey = {
  id: "11111111-1111-4111-8111-111111111111",
  businessName: "Voorbeeldbedrijf",
  contactName: "Max",
  email: "max@example.test",
  phone: "0612345678",
  websiteUrl: "https://example.test",
  internalNotes: "Rustige zakelijke stijl",
  previewPackage: {},
};

test("canonical JSON and package checksums ignore object key order", () => {
  const first = { z: [3, { b: 2, a: 1 }], a: true };
  const second = { a: true, z: [3, { a: 1, b: 2 }] };
  assert.equal(stableJson(first), stableJson(second));
  assert.equal(sha256Json(first), sha256Json(second));
  assert.notEqual(sha256Json(first), sha256Json({ ...second, a: false }));
});

test("identical logical requests have one fingerprint and changed output input does not", () => {
  const input = { journey, briefing: "Branche: schilder", packageType: "starter", payload: { assetSelection: ["hero-a"] } };
  const first = _test.factoryRequestFingerprint(input);
  const retry = _test.factoryRequestFingerprint(JSON.parse(JSON.stringify(input)));
  assert.equal(first, retry);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, _test.factoryRequestFingerprint({ ...input, briefing: "Branche: hovenier" }));
  assert.notEqual(first, _test.factoryRequestFingerprint({ ...input, packageType: "premium" }));
  assert.notEqual(first, _test.factoryRequestFingerprint({ ...input, payload: { assetSelection: ["hero-b"] } }));
});

test("secrets and transport-only retry data never enter the fingerprint", () => {
  const base = { journey, briefing: "Branche: schilder", packageType: "starter", payload: {} };
  const fingerprint = _test.factoryRequestFingerprint(base);
  const withSecrets = _test.factoryRequestFingerprint({
    ...base,
    payload: {
      serviceRoleKey: "service-secret",
      adminToken: "admin-secret",
      authorization: "Bearer secret",
      retryId: "network-attempt-2",
    },
  });
  assert.equal(fingerprint, withSecrets);
  assert.equal(fingerprint.includes("secret"), false);
});
