const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const leads = require("../functions/admin-leads");
const publicLeads = require("../functions/services/publicLeadService");
const onboarding = require("../functions/admin-customer-onboarding");
const serverSource = fs.readFileSync(path.resolve(__dirname, "../functions/admin-leads.js"), "utf8");
const salesSource = fs.readFileSync(path.resolve(__dirname, "../public/admin-sales.html"), "utf8");
const migration = fs.readFileSync(path.resolve(__dirname, "../supabase/migrations/20260714190000_lead_source_sales_attribution.sql"), "utf8");

const admin = { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.test", role: "admin" };

test("technische bron en commercieel kanaal blijven gescheiden", () => {
  const record = leads._test.leadPayload({ companyName: "Voorbeeld", source: "admin-sales", externalSource: "admin-sales", acquisitionChannel: "referral" }, admin, { create: true });
  assert.equal(record.external_source, "admin-sales");
  assert.equal(record.acquisition_channel, "referral");
});

test("handmatige lead zonder gekozen kanaal of sourcer blijft Onbekend", () => {
  const record = leads._test.leadPayload({ companyName: "Voorbeeld", source: "admin-sales" }, admin, { create: true });
  assert.equal(record.acquisition_channel, null);
  assert.equal(record.sourced_by_user_id, null);
  assert.doesNotMatch(serverSource, /sourced_by_user_id:\s*admin\.id/);
});

test("salesmedewerker mag zichzelf maar niet willekeurig een collega als sourcer kiezen", () => {
  const sales = { ...admin, role: "sales_partner" };
  assert.equal(leads._test.leadPayload({ companyName: "A", sourcedByUserId: sales.id }, sales, { create: true }).sourced_by_user_id, sales.id);
  assert.throws(() => leads._test.leadPayload({ companyName: "A", sourcedByUserId: "22222222-2222-4222-8222-222222222222" }, sales, { create: true }), /alleen jezelf/);
});

test("publieke websitelead legt kanaal website compatibel in metadata vast", () => {
  const legacy = publicLeads._private.legacyCompatibleRecord({ company_name: "A", contact_name: "B", email: "a@example.test", phone: "", status: "nieuw", notes: "", is_demo: false, environment: "production", metadata: { source: "homepage-contact-form", acquisitionChannel: "website" }, lead_status: "new", created_at: "x", updated_at: "x" });
  assert.equal(legacy.metadata.acquisitionChannel, "website");
});

test("win schrijft expliciete closer en verkoopdatum zonder historische afleiding", () => {
  assert.match(serverSource, /closed_by_user_id: action === "win" \? firstUuid\(admin\.id\)/);
  assert.match(serverSource, /wonAt = now/);
  assert.doesNotMatch(migration, /update\s+(?:public\.)?(?:leads|customers)/i);
});

test("lead-naar-klantconversie bewaart bron, sourcer en closer als onveranderde snapshot", () => {
  const snapshot = onboarding._test.buildLeadAttribution({
    id: "33333333-3333-4333-8333-333333333333",
    external_source: "admin-sales",
    acquisition_channel: "referral",
    sourced_by_user_id: "11111111-1111-4111-8111-111111111111",
    closed_by_user_id: "22222222-2222-4222-8222-222222222222",
    won_at: "2026-07-14T10:00:00.000Z",
  });
  assert.equal(snapshot.acquisitionChannel, "referral");
  assert.equal(snapshot.sourcedByUserId, "11111111-1111-4111-8111-111111111111");
  assert.equal(snapshot.closedByUserId, "22222222-2222-4222-8222-222222222222");
  assert.equal(snapshot.soldAt, "2026-07-14T10:00:00.000Z");
});

test("forward-only migratie voegt nullable lead- en customerattributie toe", () => {
  for (const column of ["acquisition_channel", "sourced_by_user_id", "closed_by_user_id", "source_lead_id", "sold_at"]) assert.match(migration, new RegExp(column));
  assert.match(migration, /to_regclass\('public\.leads'\)/);
  assert.match(migration, /on delete set null/);
  assert.doesNotMatch(migration, /alter table .* enable row level security/i);
});

test("Sales Cockpit toont bron, sourcer, eigenaar, toewijzing, closer en datum", () => {
  for (const label of ["Acquisitiekanaal", "Bronsysteem", "Ingebracht door", "Eigenaar", "Toegewezen aan", "Sale gesloten door", "Verkoopdatum"]) assert.match(salesSource, new RegExp(label));
  assert.match(salesSource, /<option value="">Onbekend<\/option>/);
});
