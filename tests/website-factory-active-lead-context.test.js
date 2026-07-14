const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseCanonicalContext, decideLeadSelection, createRequestGuard } = require("../public/admin/ui/website-factory-context-sync");

const LEAD_A = "66e37714-0b61-4921-bba8-b91064dc634e";
const LEAD_B = "38410e0a-6fd6-4a29-b6fc-98b3dc66328d";
const CUSTOMER = "a822537a-4cb2-4205-bbc9-ea2107589656";
const leadUrl = (id) => `?relationshipType=lead&relationshipId=${id}&leadId=${id}`;
const factoryHtml = fs.readFileSync(path.resolve(__dirname, "../public/admin-website-factory.html"), "utf8");

test("canonical context is captured before the shared relationship service can clean the URL", () => {
  const capture = factoryHtml.indexOf("maxwebstudioFactoryInitialContext");
  const sharedService = factoryHtml.indexOf('active-relationship.js" data-active-relationship');
  assert.ok(capture > -1 && sharedService > -1 && capture < sharedService);
});

test("active lead context automatically selects the canonical relationshipId", () => {
  const context = parseCanonicalContext(leadUrl(LEAD_A));
  assert.deepEqual(decideLeadSelection({ context, relationship: { relationshipType: "lead", relationshipId: LEAD_A, leadId: LEAD_A } }), { state: "selected", source: "context", leadId: LEAD_A });
});

test("refresh and browser history restore the same canonical lead", () => {
  assert.equal(parseCanonicalContext(leadUrl(LEAD_A)).relationshipId, LEAD_A);
  const history = [leadUrl(LEAD_A), leadUrl(LEAD_B), leadUrl(LEAD_A)];
  assert.deepEqual(history.map((url) => parseCanonicalContext(url).relationshipId), [LEAD_A, LEAD_B, LEAD_A]);
});

test("invalid or conflicting lead IDs never fall back to a global lead", () => {
  for (const search of [
    "?relationshipType=lead&relationshipId=invalid",
    `?relationshipType=lead&relationshipId=${LEAD_A}&leadId=${LEAD_B}`,
    `?relationshipType=lead&relationshipId=${LEAD_A}&customerId=${CUSTOMER}`,
  ]) {
    const context = parseCanonicalContext(search);
    assert.equal(context.state, "invalid");
    assert.equal(decideLeadSelection({ context, relationship: null }).leadId, "");
  }
});

test("a later manual selection remains authoritative", () => {
  const context = parseCanonicalContext(leadUrl(LEAD_A));
  assert.deepEqual(decideLeadSelection({ context, relationship: { relationshipType: "lead", relationshipId: LEAD_A }, manualLeadId: LEAD_B }), { state: "selected", source: "manual", leadId: LEAD_B });
});

test("customer context never selects a lead", () => {
  const context = parseCanonicalContext(`?relationshipType=customer&relationshipId=${CUSTOMER}&customerId=${CUSTOMER}`);
  assert.deepEqual(decideLeadSelection({ context, relationship: { relationshipType: "customer", relationshipId: CUSTOMER } }), { state: "customer", source: "context", leadId: "" });
});

test("rapid context switches reject stale async results", () => {
  const guard = createRequestGuard();
  const first = guard.begin();
  const second = guard.begin();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(second), false);
});
