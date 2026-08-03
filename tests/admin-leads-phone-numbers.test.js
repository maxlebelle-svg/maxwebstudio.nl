const test = require("node:test");
const assert = require("node:assert/strict");

const leads = require("../functions/admin-leads");

const admin = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "lisanne@example.test",
  role: "sales_manager",
};

test("een handmatige lead bewaart meerdere telefoonnummers met een primair nummer", () => {
  const record = leads._test.leadPayload({
    companyName: "Dubbel bereikbaar BV",
    phone: "085 123 4567",
    phoneNumbers: ["085 123 4567", "06 12345678"],
  }, admin, { create: true });

  assert.equal(record.phone, "085 123 4567");
  assert.deepEqual(record.metadata.phoneNumbers, ["085 123 4567", "06 12345678"]);
  assert.deepEqual(leads._test.mapLead(record).phoneNumbers, ["085 123 4567", "06 12345678"]);
});

test("gelijke nummernotaties worden niet dubbel opgeslagen", () => {
  const record = leads._test.leadPayload({
    companyName: "Unieke nummers BV",
    phoneNumbers: ["+31 6 12345678", "+31612345678", "085 765 4321"],
  }, admin, { create: true });

  assert.equal(record.phone, "+31 6 12345678");
  assert.deepEqual(record.metadata.phoneNumbers, ["+31 6 12345678", "085 765 4321"]);
});

test("een ongerelateerde leadupdate behoudt alle bestaande telefoonnummers", () => {
  const existingLead = {
    phone: "085 123 4567",
    metadata: { phoneNumbers: ["085 123 4567", "06 12345678"] },
  };
  const update = leads._test.leadPayload({ notes: "Alleen een notitie" }, admin, { update: true, existingLead });

  assert.equal(Object.hasOwn(update, "phone"), false);
  assert.deepEqual(update.metadata.phoneNumbers, ["085 123 4567", "06 12345678"]);
});
