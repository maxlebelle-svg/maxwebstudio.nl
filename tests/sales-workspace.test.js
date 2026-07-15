const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const model = require("../public/src/sales-workspace-model");
const leadsApi = require("../functions/admin-leads");
const salesHtml = fs.readFileSync(path.resolve(__dirname, "../public/admin-sales.html"), "utf8");
const salesCss = fs.readFileSync(path.resolve(__dirname, "../public/admin/styles/sales-workspace.css"), "utf8");
const apiSource = fs.readFileSync(path.resolve(__dirname, "../functions/admin-leads.js"), "utf8");
const migration = fs.readFileSync(path.resolve(__dirname, "../supabase/migration-drafts/026_sales_workspace_normalized_fields.sql"), "utf8");

const now = new Date("2026-07-15T12:00:00+02:00");
const fixtures = [
  { id: "1", companyName: "SolarFast", region: "Breda", industry: "Zonnepanelen", leadStatus: "new", leadScore: 92, interestLevel: "hot", isFavorite: true, nextActionAt: "2026-07-15T10:30:00+02:00", assignedUserEmail: "lisanne@example.test", acquisitionChannel: "outbound_sales" },
  { id: "2", companyName: "Studio Noord", leadStatus: "follow_up", lastCallOutcome: "voicemail_left", leadScore: 64, nextActionAt: "2026-07-16T09:00:00+02:00" },
  { id: "3", companyName: "Bouwkracht", pipelineStage: "awaiting_payment", callDisposition: "callback", interestLevel: "interested", priority: "high", nextActionAt: "2026-07-14T09:00:00+02:00" },
  { id: "4", companyName: "Klant BV", pipelineStage: "customer", callDisposition: "called", interestLevel: "hot", priority: "normal" },
];

const requiredSmartViews = [
  ["all", "Alle leads"], ["today", "Vandaag actie"], ["new", "Nieuwe leads"],
  ["interested", "Geïnteresseerd"], ["callback", "Terugbellen"], ["voicemail", "Voicemails"],
  ["not_interested", "Niet geïnteresseerd"], ["demos", "Demo’s"], ["payment", "Wacht op betaling"],
  ["won", "Gewonnen"], ["lost", "Verloren"], ["archived", "Gearchiveerd"],
];

test("alle vereiste slimme weergaven hebben exact het Nederlandse label", () => {
  const views = new Map(model.SMART_VIEWS.map(({ value, label }) => [value, label]));
  requiredSmartViews.forEach(([value, label]) => assert.equal(views.get(value), label));
});

test("canonieke interesse-, winst-, verlies- en archiefweergaven blijven gescheiden", () => {
  const interested = { pipelineStage: "interested", interestLevel: "interested" };
  const archivedInterested = { ...interested, archivedAt: "2026-07-15T10:00:00Z" };
  const lostInterested = { pipelineStage: "closed", interestLevel: "hot", lostAt: "2026-07-15T10:00:00Z" };
  assert.equal(model.matchesSmartView(interested, "interested", now), true);
  assert.equal(model.matchesSmartView(archivedInterested, "interested", now), false);
  assert.equal(model.matchesSmartView(lostInterested, "interested", now), false);
  assert.equal(model.matchesSmartView({ interestLevel: "not_interested" }, "not_interested", now), true);
  assert.equal(model.matchesSmartView({ pipelineStage: "customer" }, "won", now), true);
  assert.equal(model.matchesSmartView({ pipelineStage: "approved", leadStatus: "won", wonAt: "2026-07-15T10:00:00Z" }, "won", now), true);
  assert.equal(model.matchesSmartView({ pipelineStage: "closed" }, "lost", now), false);
  assert.equal(model.matchesSmartView({ pipelineStage: "closed", lostReason: "budget" }, "lost", now), true);
  assert.equal(model.matchesSmartView({ archivedAt: "2026-07-15T10:00:00Z" }, "archived", now), true);
});

test("favorietenfilter combineert met een slimme weergave", () => {
  assert.equal(model.matchesFilters(fixtures[0], { favoritesOnly: true, smartView: "interested" }, now), true);
  assert.equal(model.matchesFilters(fixtures[2], { favoritesOnly: true, smartView: "interested" }, now), false);
  assert.equal(model.matchesFilters({ ...fixtures[2], isFavorite: true }, { favoritesOnly: true, smartView: "interested" }, now), true);
});

test("optimistische favoriettoggle bevestigt opslag en rolt terug bij API-fout", async () => {
  const lead = { id: "favorite-1", isFavorite: false };
  const states = [];
  const result = await model.toggleFavoriteOptimistically(lead, async (isFavorite) => ({ isFavorite }), (isFavorite) => states.push(isFavorite));
  assert.equal(result.isFavorite, true);
  assert.deepEqual(states, [true]);

  const rollbackStates = [];
  await assert.rejects(
    () => model.toggleFavoriteOptimistically({ ...lead }, async () => { throw new Error("API offline"); }, (isFavorite) => rollbackStates.push(isFavorite)),
    /API offline/,
  );
  assert.deepEqual(rollbackStates, [true, false]);
});

test("alleen bestaande mutatierollen krijgen een favorietschrijfknop", () => {
  ["super_admin", "admin", "sales_manager", "sales_partner"].forEach((role) => assert.equal(model.canToggleFavorite(role), true));
  ["support", "designer", "developer", "authenticated", ""].forEach((role) => assert.equal(model.canToggleFavorite(role), false));
});

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
  assert.match(apiSource, /validateLeadAssignee/);
  assert.match(apiSource, /Gebruik de expliciete toewijzingsactie/);
  assert.match(apiSource, /if \(leadAssignmentInput\(payload\)\) \{\s+const assignment = await validateLeadAssignee/);
});

test("assignment valideert een actieve interne medewerker server-side", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify([{
    id: "22222222-2222-4222-8222-222222222222",
    auth_user_id: "33333333-3333-4333-8333-333333333333",
    email: "sales@example.test",
    name: "Sales",
    role: "sales_partner",
    status: "active",
    archived_at: null,
  }]), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const assignee = await leadsApi._test.validateLeadAssignee({
      assignment: { id: "33333333-3333-4333-8333-333333333333" },
      admin: { role: "admin" },
      supabaseUrl: "https://example.test",
      serviceRoleKey: "test-only",
    });
    assert.equal(assignee.email, "sales@example.test");
    await assert.rejects(() => leadsApi._test.validateLeadAssignee({
      assignment: { id: "33333333-3333-4333-8333-333333333333" },
      admin: { role: "sales_partner", id: "11111111-1111-4111-8111-111111111111" },
      supabaseUrl: "https://example.test",
      serviceRoleKey: "test-only",
    }), /alleen aan jezelf/);
  } finally {
    global.fetch = previousFetch;
  }
});

test("voicemailstatus staat los van pipelinefase", () => {
  const lead = model.normalizeLead({ leadStatus: "follow_up", lastCallOutcome: "voicemail_left" });
  assert.equal(lead.pipelineStage, "contacted");
  assert.equal(lead.callDisposition, "voicemail");
});

test("belstatus schrijft het bestaande canonieke contactresultaat en geen parallelle kolom", () => {
  const record = leadsApi._test.leadPayload({ callDisposition: "voicemail" }, { role: "admin" }, { update: true, existingLead: { metadata: {} } });
  assert.equal(record.last_call_outcome, "voicemail_left");
  assert.equal(record.metadata.lastCallOutcome, "voicemail_left");
  assert.equal(Object.hasOwn(record, "call_disposition"), false);
  assert.equal(leadsApi._test.mapLead({ last_call_outcome: "callback_requested", metadata: {} }).callDisposition, "callback");
});

test("favoriet schrijft alleen de genormaliseerde allowlistkolom en blijft na reload gemapt", () => {
  const record = leadsApi._test.leadPayload({ isFavorite: true }, { role: "admin" }, { update: true, existingLead: { metadata: {} } });
  assert.equal(record.is_favorite, true);
  assert.equal(record.metadata.isFavorite, true);
  assert.equal(leadsApi._test.mapLead({ is_favorite: true, metadata: {} }).isFavorite, true);
  assert.throws(
    () => leadsApi._test.leadPayload({ isFavorite: "true" }, { role: "admin" }, { update: true, existingLead: { metadata: {} } }),
    /Favorietstatus moet true of false zijn/,
  );
});

test("lijst, detail en favorietenfilter delen dezelfde status en veilige API-route", () => {
  assert.match(salesHtml, /data-lead-favorite/);
  assert.match(salesHtml, /id="sales-lead-favorite"/);
  assert.match(salesHtml, /id="sales-filter-favorites"/);
  assert.match(salesHtml, /data-sales-remove-filter="favorites"/);
  assert.match(salesHtml, /leadApiRequest\("PATCH", \{ id: lead\.id, isFavorite \}/);
  assert.match(salesHtml, /favoriteLeadWriteIds\.has\(lead\.id\)/);
  assert.match(salesHtml, /favoriteButton[\s\S]+event\.stopPropagation\(\)/);
  assert.doesNotMatch(salesHtml, /queueLeadOffline\("update", \{ id: lead\.id, isFavorite/);
});

test("assignment, timeline, filters, bulkacties en responsive drawer blijven intact", () => {
  assert.match(salesHtml, /renderLeadOwnerAssignment\(lead\)/);
  assert.match(salesHtml, /renderSalesTimeline/);
  assert.match(salesHtml, /sales-workspace-filter-toggle/);
  assert.match(salesHtml, /applySalesWorkspaceBulkAction/);
  assert.match(salesCss, /@media \(max-width: 1050px\)[\s\S]+translateX\(105%\)/);
  assert.match(salesCss, /is-lead-detail-open[\s\S]+translateX\(0\)/);
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
  assert.match(apiSource, /rest\/v1\/customer_timeline_events\?\$\{timelineQuery\.toString\(\)\}/);
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

test("trage of verlopen API-sessies en filters hebben veilige fallbacks", () => {
  assert.match(salesHtml, /controller\.abort\(\), 15000/);
  assert.match(salesHtml, /De leadserver reageert te traag/);
  assert.match(salesHtml, /Je adminsessie is verlopen/);
  assert.match(salesHtml, /sales-workspace-filter-clear/);
  assert.match(salesHtml, /control\.value = ""/);
  assert.match(salesHtml, /event\.key === "Escape".*is-lead-detail-open/);
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
  assert.match(migration, /begin;/);
  assert.match(migration, /lock_timeout/);
  assert.match(migration, /prerequisite migrations are missing columns/);
  assert.match(migration, /where pipeline_stage is null/);
  assert.match(migration, /where interest_level is null/);
  assert.match(migration, /create index if not exists leads_active_owner_idx/);
  assert.match(migration, /customer_timeline_events_lead_idempotency_uidx/);
  assert.doesNotMatch(migration, /add column if not exists call_disposition/);
  assert.match(migration, /Existing RLS and table-level grants remain unchanged/);
  assert.doesNotMatch(migration, /disable row level security/i);
});

test("paginering begrenst de werkvoorraad standaard op 25", () => {
  const items = Array.from({ length: 61 }, (_, index) => ({ id: String(index) }));
  const page = model.paginate(items, 2, 25);
  assert.equal(page.records.length, 25);
  assert.equal(page.pages, 3);
  assert.equal(page.records[0].id, "25");
});
