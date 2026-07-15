const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const model = require("../public/src/sales-workspace-model");
const leadsApi = require("../functions/admin-leads");
const salesHtml = fs.readFileSync(path.resolve(__dirname, "../public/admin-sales.html"), "utf8");
const apiSource = fs.readFileSync(path.resolve(__dirname, "../functions/admin-leads.js"), "utf8");
const migration = fs.readFileSync(path.resolve(__dirname, "../supabase/migration-drafts/026_sales_workspace_normalized_fields.sql"), "utf8");

const now = new Date("2026-07-15T12:00:00+02:00");
const fixtures = [
  { id: "1", companyName: "SolarFast", region: "Breda", industry: "Zonnepanelen", leadStatus: "new", leadScore: 92, nextActionAt: "2026-07-15T10:30:00+02:00", assignedUserEmail: "lisanne@example.test", acquisitionChannel: "outbound_sales" },
  { id: "2", companyName: "Studio Noord", leadStatus: "follow_up", lastCallOutcome: "voicemail_left", leadScore: 64, nextActionAt: "2026-07-16T09:00:00+02:00" },
  { id: "3", companyName: "Bouwkracht", pipelineStage: "awaiting_payment", callDisposition: "callback", interestLevel: "interested", priority: "high", nextActionAt: "2026-07-14T09:00:00+02:00" },
  { id: "4", companyName: "Klant BV", pipelineStage: "customer", callDisposition: "called", interestLevel: "hot", priority: "normal" },
];

test("slimme weergaven zijn overlappend en hebben live aantallen", () => {
  const counts = model.smartViewCounts(fixtures, now);
  assert.equal(counts.all, 4);
  assert.equal(counts.today, 2);
  assert.equal(counts.hot, 2);
  assert.equal(counts.payment, 1);
  assert.equal(counts.voicemail, 1);
});

test("combineerbare filters zoeken ook op plaats en branche", () => {
  assert.equal(model.matchesFilters(fixtures[0], { query: "breda", owner: "lisanne@example.test", priority: "high", industry: "zonne" }, now), true);
  assert.equal(model.matchesFilters(fixtures[0], { query: "breda", callDisposition: "voicemail" }, now), false);
});

test("leadselectie en detailpaneel blijven onderdeel van dezelfde workspace", () => {
  assert.match(salesHtml, /sales-workspace-detail-column/);
  assert.match(salesHtml, /openLeadfinderDetail\(row\.dataset\.leadfinderId\)/);
  assert.doesNotMatch(salesHtml, /location\.href\s*=.*leadId/);
});

test("eigenaar wijzigen gebruikt de bestaande expliciete assignmentactie", () => {
  assert.match(apiSource, /payload\.action === "assign"/);
  assert.match(apiSource, /assigned_user_email: assignment\.email/);
});

test("voicemailstatus staat los van pipelinefase", () => {
  const lead = model.normalizeLead({ leadStatus: "follow_up", lastCallOutcome: "voicemail_left" });
  assert.equal(lead.pipelineStage, "contacted");
  assert.equal(lead.callDisposition, "voicemail");
});

test("terugbelactie vereist datum en tijd in de beveiligde API", () => {
  assert.match(apiSource, /lastCallOutcome === "callback_requested" && !nextActionAt/);
  assert.match(apiSource, /Kies een datum en tijd voor de terugbelafspraak/);
});

test("actie voltooien wist de actieve actie en schrijft een tijdlijngebeurtenis", () => {
  assert.match(apiSource, /action === "complete_next_action"/);
  assert.match(apiSource, /eventType = "next_action_completed"/);
  assert.match(apiSource, /insertLeadTimelineEvent/);
  assert.match(apiSource, /hasLeadTimelineIdempotencyKey/);
  assert.match(apiSource, /next_action_completed_at/);
});

test("bulkacties zijn server-side begrensd en rapporteren resultaten per lead", () => {
  assert.match(apiSource, /payload\.action === "bulk_update"/);
  assert.match(apiSource, /slice\(0, 100\)/);
  assert.match(apiSource, /results\.push\(\{ id, success: false/);
  assert.match(salesHtml, /sales-workspace-bulk/);
});

test("pipelinefase wijzigen vraagt expliciete bevestiging", () => {
  assert.match(salesHtml, /Pipelinefase wijzigen naar/);
  assert.match(salesHtml, /window\.confirm/);
  assert.match(salesHtml, /pipelineStage: stage/);
});

test("bron en salesattributie blijven afzonderlijke velden", () => {
  const record = leadsApi._test.leadPayload({ companyName: "A", externalSource: "google-places", acquisitionChannel: "outbound_sales" }, { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.test", role: "admin" }, { create: true });
  assert.equal(record.external_source, "google-places");
  assert.equal(record.acquisition_channel, "outbound_sales");
  assert.ok(Object.hasOwn(record, "assigned_to"));
});

test("bestaande Lisanne-toewijzing wordt bij een gewone update niet door de actor overschreven", () => {
  const existingLead = { assigned_to: "lisanne@example.test", metadata: { assignedUserEmail: "lisanne@example.test", assignedUserName: "Lisanne" } };
  const record = leadsApi._test.leadPayload({ pipelineStage: "contacted" }, { id: "11111111-1111-4111-8111-111111111111", email: "max@example.test", role: "admin" }, { update: true, existingLead });
  assert.notEqual(record.owner_email, "max@example.test");
  assert.equal(record.owner_email, "lisanne@example.test");
  assert.equal(record.assigned_user_email, "lisanne@example.test");
});

test("lege staat en foutstatus hebben Nederlandse toegankelijke tekst", () => {
  assert.match(salesHtml, /Geen leads gevonden/);
  assert.match(salesHtml, /Leads konden niet volledig worden geladen/);
  assert.match(salesHtml, /aria-live="polite"/);
});

test("API weigert toegang zonder geldige adminrol via de gedeelde guard", () => {
  assert.match(apiSource, /verifyAdmin/);
  assert.match(apiSource, /allowedRoles: staffRoles/);
  assert.ok(!leadsApi._test || !leadsApi._test.staffRoles);
});

test("workspace gebruikt geen hardcoded medewerkers of productiemockdata", () => {
  assert.match(salesHtml, /SALES_EMPLOYEE_FILTER_FALLBACKS = \[\]/);
  assert.doesNotMatch(salesHtml, /ensureLeadFinderDemoData\(\);/);
});

test("migratiedraft is achterwaarts compatibel, geïndexeerd en RLS-neutraal", () => {
  assert.match(migration, /where pipeline_stage is null/);
  assert.match(migration, /where call_disposition is null/);
  assert.match(migration, /where interest_level is null/);
  assert.match(migration, /create index if not exists leads_active_owner_idx/);
  assert.match(migration, /Existing RLS remains enabled/);
  assert.doesNotMatch(migration, /disable row level security/i);
});

test("paginering begrenst de werkvoorraad standaard op 25", () => {
  const items = Array.from({ length: 61 }, (_, index) => ({ id: String(index) }));
  const page = model.paginate(items, 2, 25);
  assert.equal(page.records.length, 25);
  assert.equal(page.pages, 3);
  assert.equal(page.records[0].id, "25");
});
