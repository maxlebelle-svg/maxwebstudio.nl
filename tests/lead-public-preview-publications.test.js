const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const publicationApi = require("../functions/admin-preview-publication");
const renderer = require("../functions/public-preview-render");
const actions = require("../public/admin/ui/website-factory-preview-actions");

const IDS = Object.freeze({
  lead: "e968d24a-d371-46b8-9eee-fe781aa01974",
  journey: "fb5200b2-7f64-4a8c-8747-ca41bcbbc57d",
  preview: "28919104-f6f4-4f43-9216-a95c112f8606",
  nextPreview: "765a213b-c7fa-44e7-832b-62ff6666aa11",
  otherLead: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  customer: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  publication: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
});

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260718190000_public_preview_publications.sql"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const publicationSource = fs.readFileSync(path.join(root, "functions/admin-preview-publication.js"), "utf8");

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function fixture(overrides = {}) {
  return {
    leads: [{
      id: IDS.lead,
      company_name: "Heel je zelf",
      contact_name: "Henk & Carla",
      status: "new",
      lead_status: "new",
      customer_id: null,
      converted_customer_id: null,
    }],
    customers: [],
    demo_journeys: [{
      id: IDS.journey,
      lead_id: IDS.lead,
      customer_id: null,
      business_name: "Heel je zelf",
    }],
    website_preview_versions: [{
      id: IDS.preview,
      customer_id: null,
      demo_journey_id: IDS.journey,
      version: 4,
      title: "Heel je zelf V4",
      status: "internal",
      published_to_portal: false,
      approved_at: null,
      metadata: { previewSource: "factory" },
      generated_package: {
        entryFile: "index.html",
        files: [{ path: "index.html", encoding: "utf8", content: "<!doctype html><h1>Heel je zelf</h1>" }],
      },
    }],
    public_preview_publications: [],
    ...clone(overrides),
  };
}

function valueAfterEq(value = "") { return decodeURIComponent(String(value).replace(/^eq\./, "")); }

function matches(row, params) {
  for (const [key, value] of params.entries()) {
    if (!["id", "relationship_type", "relationship_id", "public_slug", "public_preview_slug"].includes(key)) continue;
    if (String(row[key] || "") !== valueAfterEq(value)) return false;
  }
  return true;
}

async function withStore(seed, callback) {
  const previous = {
    fetch: global.fetch,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    base: process.env.PUBLIC_PREVIEW_BASE_URL,
  };
  const store = clone(seed);
  const calls = [];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  delete process.env.PUBLIC_PREVIEW_BASE_URL;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const table = parsed.pathname.split("/").pop();
    const method = String(options.method || "GET").toUpperCase();
    calls.push({ table, method, url: String(url), body: options.body ? JSON.parse(options.body) : null });
    const rows = store[table];
    if (!Array.isArray(rows)) return response([], 404, { code: "PGRST205", message: `Missing ${table}` });
    if (table === "leads" && method === "GET" && store.__missingLeadCustomerColumns === true) {
      const query = decodeURIComponent(parsed.search);
      const missingColumn = ["converted_customer_id", "customer_id"].find((column) => query.includes(column));
      if (missingColumn) return response([], 400, { code: "42703", message: `column leads.${missingColumn} does not exist` });
    }
    if (method === "GET") return response(rows.filter((row) => matches(row, parsed.searchParams)));
    if (method === "POST") {
      const record = { id: IDS.publication, ...JSON.parse(options.body || "{}") };
      rows.push(record);
      return response([record], 201);
    }
    if (method === "PATCH") {
      const patch = JSON.parse(options.body || "{}");
      const selected = rows.filter((row) => matches(row, parsed.searchParams));
      selected.forEach((row) => Object.assign(row, patch));
      return response(selected);
    }
    return response([], 405);
  };
  renderer._private.requestWindows.clear();
  try {
    return await callback(store, calls);
  } finally {
    global.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    if (previous.base === undefined) delete process.env.PUBLIC_PREVIEW_BASE_URL; else process.env.PUBLIC_PREVIEW_BASE_URL = previous.base;
  }
}

function response(data, status = 200, error = null) {
  const body = error || data;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

const context = { available: true, supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role", admin: { profileId: null } };

async function publishLead(store, payload = {}) {
  const result = await publicationApi._private.publishPublicPreview(context, {
    relationshipType: "lead",
    relationshipId: IDS.lead,
    leadId: IDS.lead,
    previewVersionId: IDS.preview,
    slug: "heeljezelf",
    ...payload,
  });
  return JSON.parse(result.body);
}

async function render(slug = "heeljezelf") {
  return renderer.handler({
    httpMethod: "GET",
    path: `/preview/${slug}`,
    queryStringParameters: { slug },
    headers: { "x-forwarded-for": "203.0.113.40" },
  });
}

test("01 migratie maakt één generieke publicatietabel", () => assert.match(migration, /create table(?: if not exists)? public\.public_preview_publications/i));
test("02 publicatie bewaart relatietype en relatie-id", () => assert.match(migration, /relationship_type[\s\S]*relationship_id/i));
test("03 alleen lead en customer zijn geldige relatietypen", () => assert.match(migration, /relationship_type in \('lead', 'customer'\)/i));
test("04 slug is globaal case-insensitive uniek", () => assert.match(migration, /unique index[\s\S]*lower\(public_slug\)/i));
test("05 maximaal één actieve publicatie per relatie", () => assert.match(migration, /unique index[\s\S]*relationship_type, relationship_id[\s\S]*where enabled = true/i));
test("06 previewversie heeft een beperkende foreign key", () => assert.match(migration, /preview_version_id[\s\S]*website_preview_versions[\s\S]*on delete restrict/i));
test("07 RLS is ingeschakeld en geforceerd", () => assert.match(migration, /enable row level security[\s\S]*force row level security/i));
test("08 browserrollen krijgen geen tabeltoegang", () => assert.match(migration, /revoke all on table public\.public_preview_publications from anon, authenticated/i));
test("09 alleen service_role krijgt CRUD", () => assert.match(migration, /grant select, insert, update, delete[\s\S]*to service_role/i));
test("10 migratie opent geen RLS-policy", () => assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i));

test("11 leadcontext kan een verwerkte Factory-preview publiceren", () => {
  const result = actions.actionContext({
    version: fixture().website_preview_versions[0],
    previewUrl: `https://maxwebstudio.nl/.netlify/functions/demo-preview?id=${IDS.journey}&source=factory&previewVersionId=${IDS.preview}`,
    leadId: IDS.lead,
    demoJourneyId: IDS.journey,
  });
  assert.equal(result.relationshipType, "lead");
  assert.equal(result.publishEnabled, true);
  assert.equal(result.publishLabel, "Publieke demo delen");
  assert.equal(result.activateEnabled, false);
});

test("12 bekijken zonder publicatie gebruikt geen publicatie-API", () => {
  const result = actions.actionContext({
    version: fixture().website_preview_versions[0],
    previewUrl: `https://maxwebstudio.nl/.netlify/functions/demo-preview?id=${IDS.journey}&source=factory&previewVersionId=${IDS.preview}`,
    leadId: IDS.lead,
    demoJourneyId: IDS.journey,
  });
  assert.equal(result.published, false);
  assert.doesNotMatch(result.shareUrl, /public-preview-render|\/preview\/heeljezelf/);
});

test("13 acceptatielead publiceert exact preview V4 op slug heeljezelf", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    const result = await publishLead(store);
    assert.equal(result.relationshipType, "lead");
    assert.equal(result.relationshipId, IDS.lead);
    assert.equal(result.publishedPreviewVersionId, IDS.preview);
    assert.equal(result.publicPreviewSlug, "heeljezelf");
    assert.equal(store.public_preview_publications.length, 1);
  });
});

test("14 directe leadpublicatie maakt geen customer aan", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    assert.deepEqual(store.customers, []);
  });
});

test("15 directe leadpublicatie verandert de leadstatus niet", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    const before = clone(store.leads[0]);
    await publishLead(store);
    assert.deepEqual(store.leads[0], before);
  });
});

test("16 directe leadpublicatie verandert status en approval van preview niet", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    assert.equal(store.website_preview_versions[0].status, "internal");
    assert.equal(store.website_preview_versions[0].approved_at, null);
    assert.equal(store.website_preview_versions[0].published_to_portal, false);
  });
});

test("17 publicatie schrijft alleen naar de centrale publicatietabel", { concurrency: false }, async () => {
  await withStore(fixture(), async (_store, calls) => {
    await publishLead(_store);
    const writes = calls.filter((call) => ["POST", "PATCH"].includes(call.method));
    assert.deepEqual(writes.map((call) => call.table), ["public_preview_publications"]);
  });
});

test("18 opnieuw publiceren behoudt de slug", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    const second = await publishLead(store, { slug: "andere-naam" });
    assert.equal(second.publicPreviewSlug, "heeljezelf");
    assert.equal(store.public_preview_publications.length, 1);
  });
});

test("19 expliciet herpubliceren verplaatst alleen het publieke doel", { concurrency: false }, async () => {
  const seed = fixture();
  seed.website_preview_versions.push({ ...clone(seed.website_preview_versions[0]), id: IDS.nextPreview, version: 5, title: "Heel je zelf V5" });
  await withStore(seed, async (store) => {
    await publishLead(store);
    const result = await publishLead(store, { previewVersionId: IDS.nextPreview });
    assert.equal(result.publishedPreviewVersionId, IDS.nextPreview);
    assert.equal(store.public_preview_publications[0].preview_version_id, IDS.nextPreview);
    assert.equal(store.website_preview_versions[0].status, "internal");
  });
});

test("20 cross-leadpublicatie wordt server-side geweigerd", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await assert.rejects(
      () => publishLead(store, { relationshipId: IDS.otherLead, leadId: IDS.otherLead }),
      (error) => error.code === "PREVIEW_RELATIONSHIP_MISMATCH" || error.code === "PREVIEW_LEAD_MISMATCH"
    );
  });
});

test("21 preview van een andere lead wordt geweigerd", { concurrency: false }, async () => {
  const seed = fixture();
  seed.demo_journeys[0].lead_id = IDS.otherLead;
  await withStore(seed, async (store) => {
    await assert.rejects(() => publishLead(store), (error) => error.code === "PREVIEW_LEAD_MISMATCH" && error.status === 409);
  });
});

test("22 onverwerkte preview wordt geweigerd", { concurrency: false }, async () => {
  const seed = fixture();
  seed.website_preview_versions[0].generated_package.files = [];
  await withStore(seed, async (store) => {
    await assert.rejects(() => publishLead(store), (error) => error.code === "PREVIEW_NOT_PROCESSED");
  });
});

test("23 gearchiveerde preview wordt geweigerd", { concurrency: false }, async () => {
  const seed = fixture();
  seed.website_preview_versions[0].status = "archived";
  await withStore(seed, async (store) => {
    await assert.rejects(() => publishLead(store), (error) => error.code === "PREVIEW_NOT_SHAREABLE");
  });
});

test("24 ongeldige slug stopt vóór een schrijfactie", { concurrency: false }, async () => {
  await withStore(fixture(), async (store, calls) => {
    await assert.rejects(() => publishLead(store, { slug: "Admin" }), (error) => error.code === "PUBLIC_PREVIEW_SLUG_INVALID");
    assert.equal(calls.some((call) => ["POST", "PATCH"].includes(call.method)), false);
  });
});

test("25 globale slugbotsing wordt niet aan een andere relatie overgenomen", { concurrency: false }, async () => {
  const seed = fixture();
  seed.public_preview_publications.push({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    relationship_type: "lead",
    relationship_id: IDS.otherLead,
    public_slug: "heeljezelf",
    preview_version_id: IDS.preview,
    enabled: true,
    revoked_at: null,
  });
  await withStore(seed, async (store) => {
    const result = await publishLead(store);
    assert.equal(result.publicPreviewSlug, "heeljezelf-2");
  });
});

test("26 resolver rendert een interne leadpreview via de generieke publicatie", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    const result = await render();
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /Heel je zelf/);
  });
});

test("27 publieke HTML lekt geen token of previewVersionId", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    const result = await render();
    assert.doesNotMatch(result.body, /token|previewVersionId|28919104-f6f4-4f43-9216-a95c112f8606/i);
  });
});

test("28 publieke leadpreview houdt no-referrer en noindex headers", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    const result = await render();
    assert.equal(result.headers["Referrer-Policy"], "no-referrer");
    assert.match(result.headers["X-Robots-Tag"], /noindex, nofollow, noarchive/);
  });
});

test("29 onbekende generieke slug geeft nette 404", { concurrency: false }, async () => {
  await withStore(fixture(), async () => {
    const result = await render("onbekende-demo");
    assert.equal(result.statusCode, 404);
    assert.match(result.body, /Preview niet beschikbaar/);
  });
});

test("30 ingetrokken leadslug geeft 410 en bewaart doelpointer", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    const response = await publicationApi._private.revokePublicPreview(context, { relationshipType: "lead", relationshipId: IDS.lead });
    assert.equal(response.statusCode, 200);
    assert.equal(store.public_preview_publications[0].preview_version_id, IDS.preview);
    const result = await render();
    assert.equal(result.statusCode, 410);
  });
});

test("31 leadslug kan alleen via de beveiligde serveractie wijzigen", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    const response = await publicationApi._private.setPublicPreviewSlug(context, { relationshipType: "lead", relationshipId: IDS.lead, slug: "heel-je-zelf" });
    const body = JSON.parse(response.body);
    assert.equal(body.publicPreviewSlug, "heel-je-zelf");
    assert.equal(store.public_preview_publications[0].public_slug, "heel-je-zelf");
  });
});

test("32 generieke resolver raadpleegt publicaties vóór legacy customers", { concurrency: false }, async () => {
  await withStore(fixture(), async (store, calls) => {
    await publishLead(store);
    calls.length = 0;
    await render();
    assert.equal(calls[0].table, "public_preview_publications");
    assert.equal(calls.some((call) => call.table === "customers"), false);
  });
});

test("33 transferhelper weigert een niet-geconverteerde lead", { concurrency: false }, async () => {
  const seed = fixture();
  seed.customers.push({ id: IDS.customer, name: "Heel je zelf klant", metadata: {} });
  await withStore(seed, async (store) => {
    await publishLead(store);
    await assert.rejects(
      () => publicationApi._private.transferPublicPreviewPublication(context, { leadId: IDS.lead, customerId: IDS.customer }),
      (error) => error.code === "PREVIEW_TRANSFER_MISMATCH"
    );
  });
});

test("34 transferhelper behoudt slug en doel na een bestaande conversiekoppeling", { concurrency: false }, async () => {
  const seed = fixture();
  seed.leads[0].converted_customer_id = IDS.customer;
  seed.customers.push({ id: IDS.customer, name: "Heel je zelf klant", metadata: {} });
  await withStore(seed, async (store) => {
    await publishLead(store);
    const moved = await publicationApi._private.transferPublicPreviewPublication(context, { leadId: IDS.lead, customerId: IDS.customer });
    assert.equal(moved.relationship_type, "customer");
    assert.equal(moved.relationship_id, IDS.customer);
    assert.equal(moved.public_slug, "heeljezelf");
    assert.equal(moved.preview_version_id, IDS.preview);
  });
});

test("35 UI benoemt leadpublicatie zonder klantconversie", () => {
  assert.match(adminHtml, /Publieke salesdemo/);
  assert.match(adminHtml, /De lead blijft een lead/);
  assert.match(publicationSource, /publish_public_preview/);
});

test("36 leadpublicatie wordt na het laden van de relatie hersteld", () => {
  const start = adminHtml.indexOf("async function loadJourney");
  const block = adminHtml.slice(start, adminHtml.indexOf("function selectedLead", start));
  assert.match(block, /await refreshCustomerPreviewPublication\(\)/);
});

test("37 wisselen van relatie leegt de vorige publieke publicatiestatus", () => {
  const block = adminHtml.slice(adminHtml.indexOf("function clearFactoryRuntimeState"), adminHtml.indexOf("function resetFactoryDerivedUi"));
  assert.match(block, /customerPreviewPublication = null/);
});

test("38 alleen een previewkaart bekijken veroorzaakt geen publicatieverzoek", () => {
  const block = adminHtml.slice(adminHtml.indexOf("function renderSelectedPreviewActions"), adminHtml.indexOf("function setSelectedPreviewFeedback"));
  assert.doesNotMatch(block, /apiRequest\(/);
});

test("39 annuleren van de native bevestiging stopt voor de request", () => {
  const block = adminHtml.slice(adminHtml.indexOf('if (context.relationshipType === "lead")'), adminHtml.indexOf('const customerLabel =', adminHtml.indexOf('if (context.relationshipType === "lead")')));
  const confirmIndex = block.indexOf("if (!window.confirm(");
  const requestIndex = block.indexOf('apiRequest(previewPublicationEndpoint, "POST"');
  assert.ok(confirmIndex >= 0 && requestIndex > confirmIndex);
  assert.match(block.slice(confirmIndex, requestIndex), /\) return;/);
});

test("40 bevestigen leidt in de leadtak tot exact één POST-request", () => {
  const block = adminHtml.slice(adminHtml.indexOf('if (context.relationshipType === "lead")'), adminHtml.indexOf('const customerLabel =', adminHtml.indexOf('if (context.relationshipType === "lead")')));
  assert.equal((block.match(/apiRequest\(previewPublicationEndpoint, "POST"/g) || []).length, 1);
});

test("41 leadpublicatiepayload bevat de exacte relatiecontext", () => {
  const payload = actions.publicPreviewPublishPayload({ relationshipType: "lead", relationshipId: IDS.lead, leadId: IDS.lead, demoJourneyId: IDS.journey, previewVersionId: IDS.preview, slug: "heeljezelf" });
  assert.equal(payload.relationshipType, "lead");
  assert.equal(payload.relationshipId, IDS.lead);
  assert.equal(payload.leadId, IDS.lead);
  assert.equal(payload.demoJourneyId, IDS.journey);
});

test("42 leadpublicatiepayload gebruikt exact de bekeken previewVersionId", () => {
  const payload = actions.publicPreviewPublishPayload({ relationshipType: "lead", relationshipId: IDS.lead, leadId: IDS.lead, demoJourneyId: IDS.journey, previewVersionId: IDS.preview, slug: "heeljezelf" });
  assert.equal(payload.previewVersionId, IDS.preview);
});

test("43 slug heeljezelf wordt expliciet meegestuurd", () => {
  assert.equal(actions.publicPreviewSlugCandidate("heeljezelf", "Heel je zelf"), "heeljezelf");
  const payload = actions.publicPreviewPublishPayload({ relationshipType: "lead", relationshipId: IDS.lead, leadId: IDS.lead, demoJourneyId: IDS.journey, previewVersionId: IDS.preview, slug: "heeljezelf" });
  assert.equal(payload.slug, "heeljezelf");
  assert.match(adminHtml, /slug: publicSlug/);
});

test("44 ontbrekende publicatiecontext geeft een zichtbare fout en geen payload", () => {
  assert.equal(actions.publicPreviewPublishPayload({ relationshipType: "lead", relationshipId: IDS.lead, previewVersionId: IDS.preview, slug: "heeljezelf" }), null);
  assert.match(adminHtml, /De publieke demo mist een geldige lead-, preview- of slugcontext/);
});

test("45 backend accepteert een lead zonder customer- of conversiekolommen en zonder customerrecord", { concurrency: false }, async () => {
  const seed = fixture({ __missingLeadCustomerColumns: true });
  await withStore(seed, async (store) => {
    const result = await publishLead(store);
    assert.equal(result.publishedPreviewVersionId, IDS.preview);
    assert.deepEqual(store.customers, []);
  });
});

test("46 backend maakt exact één generieke leadpublicatie", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    assert.equal(store.public_preview_publications.length, 1);
    assert.equal(store.public_preview_publications[0].relationship_type, "lead");
  });
});

test("47 bevestigde leadpublicatie maakt geen customer aan", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    assert.equal(store.customers.length, 0);
  });
});

test("48 bevestigde leadpublicatie muteert geen leadstatus", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    const before = clone(store.leads[0]);
    await publishLead(store);
    assert.deepEqual(store.leads[0], before);
  });
});

test("49 identieke tweede request blijft idempotent", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    const second = await publishLead(store);
    assert.equal(second.alreadyPublished, true);
    assert.equal(store.public_preview_publications.length, 1);
  });
});

test("50 serverfout toont het Netlify request-id", () => {
  assert.equal(actions.publicPreviewErrorMessage({ message: "Opslaan mislukt.", requestId: "req-123" }), "Opslaan mislukt. Request-id: req-123");
  assert.match(adminHtml, /publicPreviewErrorMessage/);
});

test("51 UI toont geen succes voor server- en bevestigingsresponse", () => {
  const block = adminHtml.slice(adminHtml.indexOf('if (context.relationshipType === "lead")'), adminHtml.indexOf('const customerLabel =', adminHtml.indexOf('if (context.relationshipType === "lead")')));
  assert.ok(block.indexOf('const data = await apiRequest') < block.indexOf('is als publieke salesdemo gedeeld'));
  assert.ok(block.indexOf('const confirmation = await apiRequest') < block.indexOf('is als publieke salesdemo gedeeld'));
});

test("52 successtatus wordt uit de bevestigde current-response gehydrateerd", () => {
  const block = adminHtml.slice(adminHtml.indexOf('if (context.relationshipType === "lead")'), adminHtml.indexOf('const customerLabel =', adminHtml.indexOf('if (context.relationshipType === "lead")')));
  assert.match(block, /action=current&relationshipType=lead/);
  assert.match(block, /customerPreviewPublication = \{[\s\S]*confirmation\.previewVersion/);
});

test("53 resolver toont na publicatie exact de gekozen preview", { concurrency: false }, async () => {
  await withStore(fixture(), async (store) => {
    await publishLead(store);
    const result = await render("heeljezelf");
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /Heel je zelf/);
  });
});

test("54 bestaande customerpublicatieactie blijft apart beschikbaar", () => {
  assert.match(publicationSource, /publish_customer_preview/);
  assert.match(adminHtml, /action: "publish_customer_preview"/);
});

test("55 Factory- en ZIP-context behouden hun exacte geselecteerde versie", () => {
  const factory = actions.actionContext({ version: fixture().website_preview_versions[0], previewUrl: `https://maxwebstudio.nl/.netlify/functions/demo-preview?id=${IDS.journey}&source=factory&previewVersionId=${IDS.preview}`, leadId: IDS.lead, demoJourneyId: IDS.journey });
  const zip = actions.actionContext({ version: { ...fixture().website_preview_versions[0], metadata: { previewSource: "manual_zip" }, previewUrl: `https://maxwebstudio.nl/.netlify/functions/manual-preview-render?version=${IDS.preview}&token=test&source=manual_zip&previewVersionId=${IDS.preview}`, previewToken: "test" }, previewUrl: `https://maxwebstudio.nl/.netlify/functions/manual-preview-render?version=${IDS.preview}&token=test&source=manual_zip&previewVersionId=${IDS.preview}`, leadId: IDS.lead, demoJourneyId: IDS.journey });
  assert.equal(factory.previewVersionId, IDS.preview);
  assert.equal(zip.previewVersionId, IDS.preview);
  assert.equal(factory.sourceType, actions.SOURCE_FACTORY);
  assert.equal(zip.sourceType, actions.SOURCE_MANUAL);
});

test("56 lange tokenized previewlinks blijven veilig bruikbaar", () => {
  const url = `https://maxwebstudio.nl/.netlify/functions/demo-preview?id=${IDS.journey}&token=lang-token&source=factory&previewVersionId=${IDS.preview}`;
  const context = actions.actionContext({ version: { ...fixture().website_preview_versions[0], previewUrl: url }, previewUrl: url, leadId: IDS.lead, demoJourneyId: IDS.journey });
  assert.equal(context.shareUrl, url);
  assert.equal(context.publishEnabled, true);
});

test("57 ownershipvalidatie vraagt geen fictieve leadconversiekolommen op", { concurrency: false }, async () => {
  const seed = fixture({ __missingLeadCustomerColumns: true });
  await withStore(seed, async (store, calls) => {
    await publishLead(store);
    const leadReads = calls.filter((call) => call.table === "leads" && call.method === "GET");
    assert.equal(leadReads.length, 1);
    assert.doesNotMatch(decodeURIComponent(leadReads[0].url), /converted_customer_id|customer_id/);
  });
});

test("58 leadownership loopt exact via preview naar journey.lead_id", { concurrency: false }, async () => {
  await withStore(fixture(), async (store, calls) => {
    const result = await publishLead(store);
    assert.equal(result.relationshipId, IDS.lead);
    assert.equal(result.publishedPreviewVersionId, IDS.preview);
    const journeyRead = calls.find((call) => call.table === "demo_journeys" && call.method === "GET");
    assert.match(journeyRead.url, new RegExp(`id=eq\\.${IDS.journey}`));
  });
});

test("59 lead zonder customer blijft een geldige publicatierelatie", { concurrency: false }, async () => {
  const seed = fixture({ __missingLeadCustomerColumns: true });
  await withStore(seed, async (store) => {
    await publishLead(store);
    assert.deepEqual(store.customers, []);
    assert.equal(store.public_preview_publications[0].relationship_type, "lead");
  });
});

test("60 preview zonder journey wordt voor een lead geweigerd", { concurrency: false }, async () => {
  const seed = fixture();
  seed.website_preview_versions[0].demo_journey_id = null;
  await withStore(seed, async (store) => {
    await assert.rejects(() => publishLead(store), (error) => error.code === "PREVIEW_LEAD_MISMATCH" && error.status === 409);
    assert.equal(store.public_preview_publications.length, 0);
  });
});

test("61 journey zonder lead wordt geweigerd", { concurrency: false }, async () => {
  const seed = fixture();
  seed.demo_journeys[0].lead_id = null;
  await withStore(seed, async (store) => {
    await assert.rejects(() => publishLead(store), (error) => error.code === "PREVIEW_LEAD_MISMATCH" && error.status === 409);
    assert.equal(store.public_preview_publications.length, 0);
  });
});

test("62 customerownership blijft via bestaande customerrelaties werken", { concurrency: false }, async () => {
  const seed = fixture();
  seed.customers.push({ id: IDS.customer, name: "Heel je zelf klant", company: "Heel je zelf", metadata: {} });
  seed.website_preview_versions[0].customer_id = IDS.customer;
  await withStore(seed, async (store) => {
    const response = await publicationApi._private.publishPublicPreview(context, {
      relationshipType: "customer",
      relationshipId: IDS.customer,
      customerId: IDS.customer,
      previewVersionId: IDS.preview,
      slug: "heeljezelf-klant",
    });
    const body = JSON.parse(response.body);
    assert.equal(body.relationshipType, "customer");
    assert.equal(body.relationshipId, IDS.customer);
    assert.equal(store.public_preview_publications.length, 1);
  });
});

test("63 succesvolle validatie gaat vóór de publicatieinsert", { concurrency: false }, async () => {
  await withStore(fixture(), async (store, calls) => {
    await publishLead(store);
    const journeyReadIndex = calls.findIndex((call) => call.table === "demo_journeys" && call.method === "GET");
    const insertIndex = calls.findIndex((call) => call.table === "public_preview_publications" && call.method === "POST");
    assert.ok(journeyReadIndex >= 0 && insertIndex > journeyReadIndex);
  });
});

test("64 productieachtige ontbrekende leadkolommen kunnen geen 42703 meer veroorzaken", { concurrency: false }, async () => {
  const seed = fixture({ __missingLeadCustomerColumns: true });
  await withStore(seed, async (store) => {
    const result = await publishLead(store);
    assert.equal(result.publishedPreviewVersionId, IDS.preview);
  });
});

test("65 ownershipvalidatie bevat geen naam-, slug-, URL- of e-mailfallback", () => {
  const start = publicationSource.indexOf("async function validatePublicPreviewOwnership");
  const block = publicationSource.slice(start, publicationSource.indexOf("async function assertPublicSlugAvailable", start));
  assert.doesNotMatch(block, /converted_customer_id|relationshipRecord\.customer_id|company_name\s*===|contact_name\s*===|website_url\s*===|email\s*===|public_slug/);
});
