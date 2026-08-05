const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("public/admin-offer-composer.html");
const browser = read("public/src/offer-composer.js");
const css = read("public/src/offer-composer.css");
const endpoint = read("functions/admin-commercial-offers.js");
const migration = read("supabase/migrations/20260730150000_commercial_offer_foundation.sql");
const discountPersistenceMigration = read("supabase/migrations/20260805154500_fix_commercial_offer_discount_persistence.sql");
const catalog = require("../functions/_commercial-catalog");
const offers = require("../functions/services/commercialOfferService");
const documents = require("../functions/services/commercialDocumentRegistry");
const endpointPrivate = require("../functions/admin-commercial-offers")._private;
const corePromise = import(pathToFileURL(path.join(root, "public/src/offer-composer-core.mjs")).href);
const actor = { id: "11111111-1111-4111-8111-111111111111", profileId: "22222222-2222-4222-8222-222222222222", role: "super_admin" };
const relationId = "33333333-3333-4333-8333-333333333333";

test("1 composer opens from a lead with only the canonical relationship identifiers", async () => {
  assert.match(read("public/admin-sales.html"), /admin-offer-composer\.html\?relationshipType=lead&relationshipId=\$\{encodeURIComponent\(lead\.id\)\}&source=lead/);
  const { composerUrl } = await corePromise;
  assert.equal(composerUrl({ relationshipType: "lead", relationshipId: relationId, source: "lead" }), `admin-offer-composer.html?relationshipType=lead&relationshipId=${relationId}&source=lead`);
});

test("2 composer opens from a customer", () => {
  assert.match(read("public/admin-klanten.html"), /relationshipType=customer&relationshipId=\$\{encodeURIComponent\(customer\.id\)\}&source=customer/);
});

test("3 composer opens from Demo Sites with the existing demo id", () => {
  const source = read("public/admin-demo-sites.html");
  assert.match(source, /demoJourneyId=\$\{encodeURIComponent\(record\.id\)\}&source=demo/);
  assert.match(source, /Nieuw voorstel maken/);
});

test("4 composer opens from Website Factory with customer or lead context", () => {
  const source = read("public/admin-website-factory.html");
  assert.match(source, /id="factory-new-offer"/);
  assert.match(source, /new URLSearchParams\(\{ relationshipType, relationshipId, source: "factory" \}\)/);
  assert.match(source, /params\.set\("demoJourneyId", journey\.id\)/);
});

test("5 active admin catalog is loaded only by the authenticated server endpoint", () => {
  const result = catalog.adminCatalog();
  assert.equal(result.version, catalog.CATALOG_VERSION);
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
  assert.ok(result.products.length > 10);
  assert.ok(result.products.every((product) => product.active && product.adminSelectable));
  assert.doesNotMatch(browser, /const\s+(?:PRODUCTS|CATALOG|prices)\s*=\s*[\[{]/i);
  assert.match(endpoint, /catalog:\s*adminCatalog\(\)/);
});

test("6 website package selection calculates on the server", () => {
  const snapshot = offers.buildOfferVersion({ paymentChoice: "fixed_deposit", selections: [{ productId: "starter_site" }] }, actor);
  assert.equal(snapshot.oneTimeExVatCents, 49500);
  assert.equal(snapshot.fixedDepositExVatCents, 15000);
});

test("7 care selection remains a recurring server line", () => {
  const snapshot = offers.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "business_website" }, { productId: "care_plus" }] }, actor);
  assert.equal(snapshot.recurringExVatCents, 4900);
  assert.equal(snapshot.lines.find((line) => line.productId === "care_plus").billingInterval, "monthly");
});

test("8 fixed one-component add-on remains binding", () => {
  const snapshot = offers.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "google_business_profile" }] }, actor);
  assert.equal(snapshot.lines.length, 1);
  assert.equal(snapshot.lines[0].unitExVatCents, 19500);
  assert.equal(snapshot.lines[0].bindingState, "binding");
});

test("9 hybrid add-on keeps setup and monthly components separate", () => {
  const snapshot = offers.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "meta_ads" }] }, actor);
  assert.deepEqual(snapshot.lines.map((line) => [line.componentType, line.unitExVatCents]), [["one_time", 35000], ["recurring", 24900]]);
});

test("10 starting-at product without confirmation blocks readiness", async () => {
  const { composerReadiness } = await corePromise;
  const snapshot = offers.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "logo_design" }] }, actor);
  assert.equal(snapshot.hasNonBindingLines, true);
  assert.equal(composerReadiness({ snapshot, documents: [], selectedDocumentTypes: [] }).readyForReview, false);
});

test("11 non-super-admin cannot authorize a custom price", () => {
  assert.throws(() => offers.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "logo_design", customComponents: [{ componentCode: "design", unitExVatCents: 42500, reason: "Afgebakende klantopdracht" }] }] }, { ...actor, role: "admin" }), /super_admin/i);
});

test("12 super-admin custom price requires and records a reason", () => {
  const snapshot = offers.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "logo_design", customComponents: [{ componentCode: "design", unitExVatCents: 42500, reason: "Extra merkonderzoek inbegrepen" }] }] }, actor);
  assert.equal(snapshot.hasNonBindingLines, false);
  assert.equal(snapshot.lines[0].priceClassification, "custom");
  assert.equal(snapshot.lines[0].customPriceReason, "Extra merkonderzoek inbegrepen");
  assert.equal(snapshot.customPriceEvents.length, 1);
});

test("13 fixed deposit is exact and never percentage-derived", () => {
  const snapshot = offers.buildOfferVersion({ paymentChoice: "fixed_deposit", selections: [{ productId: "business_website" }] }, actor);
  assert.equal(snapshot.dueNowExVatCents, 30000);
  assert.equal(snapshot.remainingExVatCents, 69500);
});

test("14 full payment uses the entire one-time total", () => {
  const snapshot = offers.buildOfferVersion({ paymentChoice: "full", selections: [{ productId: "business_website" }, { productId: "google_business_profile" }] }, actor);
  assert.equal(snapshot.dueNowExVatCents, 119000);
  assert.equal(snapshot.remainingExVatCents, 0);
});

test("15 fifty-percent discount is distinct from the removed percentage payment route", () => {
  assert.doesNotMatch(browser + endpoint, /0\.5\s*\/\s*1\.21|half[_-]?payment/i);
  assert.match(html, /<option value="50">50% korting<\/option>/);
  assert.doesNotMatch(html, /name="payment"[^>]*value="50"/);
});

test("15a only the six approved manual discounts are accepted", () => {
  for (const discountPercentage of [10, 15, 20, 25, 50, 75]) {
    const snapshot = offers.buildOfferVersion({ paymentChoice: "none", discountPercentage, selections: [{ productId: "starter_site" }] }, actor);
    assert.equal(snapshot.discountPercentage, discountPercentage);
  }
  for (const discountPercentage of [-10, 12, 100]) {
    assert.throws(() => offers.buildOfferVersion({ paymentChoice: "none", discountPercentage, selections: [{ productId: "starter_site" }] }, actor), /kortingspercentage/i);
  }
});

test("15b discount changes only the one-time total and VAT", () => {
  const snapshot = offers.buildOfferVersion({ paymentChoice: "full", discountPercentage: 20, selections: [{ productId: "business_website" }, { productId: "care_basic" }] }, actor);
  assert.equal(snapshot.oneTimeBeforeDiscountExVatCents, 99500);
  assert.equal(snapshot.discountExVatCents, 19900);
  assert.equal(snapshot.oneTimeExVatCents, 79600);
  assert.equal(snapshot.oneTimeVatCents, 16716);
  assert.equal(snapshot.oneTimeInclVatCents, 96316);
  assert.equal(snapshot.recurringExVatCents, 1995);
  assert.equal(snapshot.dueNowExVatCents, 79600);
});

test("15c a discounted total safely caps the fixed deposit", () => {
  const snapshot = offers.buildOfferVersion({ paymentChoice: "fixed_deposit", discountPercentage: 75, selections: [{ productId: "starter_site" }] }, actor);
  assert.equal(snapshot.oneTimeExVatCents, 12375);
  assert.equal(snapshot.fixedDepositExVatCents, 15000);
  assert.equal(snapshot.dueNowExVatCents, 12375);
  assert.equal(snapshot.remainingExVatCents, 0);
});

test("15d discount is immutable input and restored by Composer", async () => {
  const original = offers.buildOfferVersion({ paymentChoice: "none", discountPercentage: 10, selections: [{ productId: "starter_site" }] }, actor);
  const changed = offers.buildOfferVersion({ paymentChoice: "none", discountPercentage: 15, selections: [{ productId: "starter_site" }] }, actor);
  assert.notEqual(original.checksum, changed.checksum);
  const { stateFromSnapshot } = await corePromise;
  assert.equal(stateFromSnapshot(changed).discountPercentage, 15);
  assert.match(browser, /discountPercentage: state\.discountPercentage/);
});

test("15e Composer ignores stale price responses and recalculates immediately before saving", () => {
  assert.match(browser, /pricingRevision !== state\.pricingRevision/);
  assert.match(browser, /await ensureCurrentSnapshot\(\)/);
  assert.match(browser, /state\.calculatedPricingRevision !== state\.pricingRevision/);
  assert.match(browser, /const snapshot = await ensureCurrentSnapshot\(\)/);
});

test("15f a delayed 502 confirmation is recovered with the same idempotency key", async () => {
  const { draftFingerprint, findMatchingDraftVersion } = await corePromise;
  const documents = [{ documentType: "quote", versionCode: "offer-v1", checksumSha256: "a".repeat(64) }];
  const draft = { title: "Silverado met korting", snapshotChecksum: "b".repeat(64), demoJourneyId: relationId, documents };
  const version = {
    id: "44444444-4444-4444-8444-444444444444",
    status: "draft",
    created_at: "2026-08-05T07:15:35.000Z",
    snapshot_checksum_sha256: draft.snapshotChecksum,
    documents: [{ document_type: "quote", version_code: "offer-v1", checksum_sha256: "a".repeat(64) }],
  };
  const offer = { id: "55555555-5555-4555-8555-555555555555", title: draft.title, demo_journey_id: relationId, factory_project_id: null, current_version_id: version.id, versions: [version] };
  assert.equal(findMatchingDraftVersion([offer], { ...draft, minimumCreatedAtMs: Date.parse("2026-08-05T07:15:30.000Z") })?.version.id, version.id);
  assert.equal(findMatchingDraftVersion([offer], { ...draft, snapshotChecksum: "c".repeat(64) }), null);
  assert.equal(findMatchingDraftVersion([offer], { ...draft, minimumCreatedAtMs: Date.parse("2026-08-05T07:16:00.000Z") }), null);
  assert.equal(draftFingerprint(draft), draftFingerprint({ ...draft, documents: [...documents].reverse() }));
  assert.match(browser, /const actionKeyValue = pendingSave\?\.actionKey \|\| actionKey\('version'\)/);
  assert.match(browser, /const retried = await request\('POST', payload\)/);
  assert.match(browser, /rememberPendingSave\(\{ actionKey: actionKeyValue/);
});

test("15g every Composer action shows a visible elapsed timer below browser overlays", async () => {
  const { formatElapsedTime } = await corePromise;
  assert.equal(formatElapsedTime(0), "00:00");
  assert.equal(formatElapsedTime(65_999), "01:05");
  assert.match(browser, /formatElapsedTime\(Date\.now\(\) - startedAt\)/);
  assert.match(browser, /window\.setInterval/);
  assert.match(css, /\.offer-composer-page \.toast-region\s*\{[^}]*top:\s*92px/s);
  assert.match(css, /z-index:\s*2147483000/);
});

test("15h the database persists every approved discount against pre-discount line totals", () => {
  assert.match(discountPersistenceMigration, /expected_discount_percentage not in \(0,10,15,20,25,50,75\)/);
  assert.match(discountPersistenceMigration, /expected_discount := round\(expected_one_time_before_discount::numeric \* expected_discount_percentage \/ 100\)::bigint/);
  assert.match(discountPersistenceMigration, /expected_one_time := expected_one_time_before_discount - expected_discount/);
  assert.match(discountPersistenceMigration, /oneTimeBeforeDiscountExVatCents/);
  assert.match(discountPersistenceMigration, /discountExVatCents/);
  assert.match(discountPersistenceMigration, /expected_one_time_vat := round\(expected_one_time::numeric \* 21 \/ 100\)::bigint/);
  assert.match(discountPersistenceMigration, /when 'fixed_deposit' then least\(coalesce\(\(input_snapshot->>'fixedDepositExVatCents'\)::bigint,0\),expected_one_time\)/);
  assert.match(discountPersistenceMigration, /grant execute on function public\.commercial_create_offer_version_v1[\s\S]*to service_role/);
});

test("16 cents and VAT formatting preserve nineteen euros ninety-five", async () => {
  const { money, parseEuroToCents } = await corePromise;
  assert.equal(parseEuroToCents("€ 19,95"), 1995);
  assert.match(money(1995), /19,95/);
  const snapshot = offers.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "starter_site" }, { productId: "care_basic" }] }, actor);
  assert.equal(snapshot.recurringVatCents, 419);
  assert.equal(snapshot.recurringInclVatCents, 2414);
});

test("17 invalid or absent document checksum is detected", async () => {
  const { composerReadiness } = await corePromise;
  const docs = [{ documentType: "quote", required: true, checksumStatus: "missing", checksumSha256: "" }];
  const result = composerReadiness({ snapshot: { hasNonBindingLines: false }, documents: docs, selectedDocumentTypes: ["quote"] });
  assert.deepEqual(result.invalidChecksums, ["quote"]);
  assert.equal(result.readyForReview, false);
});

test("18 server blocks ready-for-review when a required binding is missing", () => {
  const snapshot = { recurringExVatCents: 0 };
  const bindings = documents.DOCUMENTS.filter((doc) => doc.documentType !== "agreement");
  const result = documents.validateReadyDocuments(snapshot, bindings);
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ["agreement"]);
  assert.match(endpoint, /DOCUMENTS_INCOMPLETE/);
});

test("19 preview model contains customer-facing demo and offer fields", async () => {
  const { buildMailPreview } = await corePromise;
  const result = buildMailPreview({ relationship: { contactName: "Max Le Belle", companyName: "Silverado" }, demo: { desktopUrl: "https://example.test/demo", mobileUrl: "https://example.test/mobiel" }, snapshot: { oneTimeInclVatCents: 120395, recurringInclVatCents: 2414 }, validUntil: "13-08-2026" });
  assert.equal(result.greeting, "Hoi Max,");
  assert.equal(result.companyName, "Silverado");
  assert.equal(result.qrTarget, "https://example.test/mobiel");
  for (const id of ["preview-subject", "preview-frame", "manual-mail-text"]) assert.match(html, new RegExp(`id="${id}"`));
});

test("20 test mail starts disabled and is guarded by server evidence", () => {
  assert.match(html, /id="test-mail"[^>]*disabled/);
  assert.match(browser, /elements\.testMail\.addEventListener\('click', sendTestMail\)/);
  assert.match(browser, /previewed && state\.data\?\.capabilities\?\.testMail/);
  assert.match(endpoint, /kind === "test" \? actor\.email/);
});

test("21 definitive send starts disabled and requires preview plus successful test", () => {
  assert.match(html, /id="definitive-send"[^>]*disabled/);
  assert.match(browser, /elements\.definitiveSend\.addEventListener\('click', openDefinitiveSendDialog\)/);
  assert.match(browser, /elements\.confirmDefinitiveSend\.addEventListener\('click', sendDefinitiveMail\)/);
  assert.match(browser, /previewed && tested/);
  assert.match(endpoint, /crypto\.randomBytes\(32\)/);
  assert.match(endpoint, /PHASE_B_TRANSITION_BLOCKED/);
});

test("21b one save starts the safe automatic preparation chain while definitive send stays manual", () => {
  assert.match(html, /id="save-draft"[^>]*>Opslaan en voorbereiden</);
  assert.match(html, /Opent automatisch na opslaan/);
  assert.match(html, /Wordt automatisch veilig verzonden/);
  assert.match(html, /Blijft altijd een handmatige actie/);
  const saveHandler = browser.match(/async function saveDraft\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(saveHandler, /await prepareSavedProposal\(progressToast\)/);
  const automaticFlow = browser.match(/async function prepareSavedProposal\(progressToast\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(automaticFlow, /targetStatus: 'ready_for_review'/);
  assert.match(automaticFlow, /action: 'preview_mail'/);
  assert.match(automaticFlow, /elements\.mailPreview\.showModal\(\)/);
  assert.match(automaticFlow, /action: 'test_mail'/);
  assert.doesNotMatch(automaticFlow, /definitive_send|sendDefinitiveMail|openDefinitiveSendDialog/);
  assert.match(browser, /function automaticActionKey\(action\) \{ return `composer:auto:\$\{action\}:\$\{state\.currentVersionId\}`; \}/);
  assert.match(browser, /if \(!hasSuccessfulDispatch\('test'\)\)/);
});

test("22 substantive content change produces a new immutable checksum", () => {
  const first = offers.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "starter_site" }] }, actor);
  const second = offers.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "starter_site" }, { productId: "social_profile_set" }] }, actor);
  assert.notEqual(first.checksum, second.checksum);
  assert.match(browser, /action:\s*'create_version'/);
});

test("23 old offer versions are database-immutable", () => {
  assert.match(migration, /Offer version content is immutable/);
  assert.match(migration, /commercial_offer_versions_content_immutable/);
  assert.match(migration, /before update or delete on public\.commercial_offer_versions/);
});

test("24 revoke remains a bounded transition with a reason", () => {
  assert.ok(endpointPrivate.PHASE_B_TRANSITIONS.has("revoked"));
  assert.match(browser, /targetStatus === 'revoked' && reason\.length < 8/);
  assert.match(migration, /'offer\.revoked'/);
});

test("25 replacement supersedes but never deletes the previous version", () => {
  assert.match(migration, /status='superseded'.*Vervangen door een nieuwe inhoudelijke versie/s);
  assert.match(migration, /'offer\.superseded'/);
  assert.doesNotMatch(migration, /delete from public\.commercial_offer_versions/i);
});

test("26 version history is append-only and exposes versions, documents and actor evidence", () => {
  assert.match(endpoint, /versions: versions\.filter/);
  assert.match(endpoint, /documents: documents\.filter/);
  assert.match(endpoint, /events: events\.filter/);
  assert.match(html, /Versiehistorie/);
  assert.match(migration, /commercial_offer_events_append_only/);
});

test("27 endpoint enforces active admin roles and protected route permissions", () => {
  assert.match(endpoint, /allowedRoles:\s*WRITE_ROLES/);
  assert.match(endpoint, /allowedStatuses:\s*\["active"\]/);
  assert.match(endpoint, /disableLegacyToken:\s*true/);
  const routes = read("public/src/config/protectedRoutes.js");
  assert.match(routes, /admin-offer-composer/);
  assert.match(routes, /resource:\s*"quotes",\s*action:\s*"create"/);
});

test("27b Composer is a shared Commerce module and safely waits for relationship context", () => {
  assert.match(html, /data-shared-admin-sidebar="true"/);
  assert.match(html, /id="admin-sidebar-root"/);
  for (const asset of ["admin-sidebar-system.css", "admin/config/sidebar-navigation.js", "admin/components/admin-sidebar.js", "admin/ui/admin-sidebar-dashboard-pilot.js"]) assert.match(html, new RegExp(asset.replaceAll("/", "\\/")));
  assert.doesNotMatch(html, /data-admin-sidebar-exception="standalone"/);
  assert.match(browser, /waitForRelationship/);
  assert.match(browser, /maxwebstudio:relationship-change/);
  const commerce = require("../public/admin/config/sidebar-navigation.js").ADMIN_SIDEBAR_NAVIGATION.find((section) => section.id === "commerce");
  assert.deepEqual(commerce.items.map((item) => item.label), ["Voorstellen", "Offertes", "Facturen", "Abonnementen"]);
});

test("28 tenant and relationship isolation applies to reads and linked resources", async () => {
  assert.throws(() => endpointPrivate.assertRelationshipAccess({ ...actor, role: "sales", id: "44444444-4444-4444-8444-444444444444" }, "lead", { assigned_user_id: "55555555-5555-4555-8555-555555555555" }), /geen voorstel/i);
  assert.doesNotThrow(() => endpointPrivate.assertRelationshipAccess({ ...actor, role: "sales", id: "44444444-4444-4444-8444-444444444444" }, "customer", { metadata: { assignedUserId: "44444444-4444-4444-8444-444444444444" } }));
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
  try {
    await assert.rejects(endpointPrivate.assertLinkedResources({ relationshipType: "lead", relationshipId: relationId, demoJourneyId: "66666666-6666-4666-8666-666666666666", factoryProjectId: null }, { url: "https://project.test", key: "safe-test-key" }), /hoort niet bij deze relatie/i);
  } finally { global.fetch = originalFetch; }
  assert.match(migration, /commercial_offers_scoped_read/);
});

test("29 refresh resumes only an explicitly requested valid offer", async () => {
  const { parseComposerContext, stateFromSnapshot } = await corePromise;
  const offerId = "77777777-7777-4777-8777-777777777777";
  const parsed = parseComposerContext(`?relationshipType=lead&relationshipId=${relationId}&offerId=${offerId}`);
  assert.equal(parsed.offerId, offerId);
  assert.deepEqual(stateFromSnapshot({ lines: [{ productId: "business_website", quantity: 1 }, { productId: "care_basic", quantity: 1 }], paymentChoice: "fixed_deposit" }).websiteProductId, "business_website");
  assert.match(browser, /if \(!offer \|\| !routeContext\.offerId\) return/);
});

test("30 responsive Composer collapses safely and has keyboard focus states", () => {
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(html, /composer-steps span \{ flex: 0 0 23px; \}/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.doesNotMatch(css, /min-width:\s*(?:[89]\d{2}|\d{4,})px/);
});

test("30b price summary heading stacks cleanly without overlapping the catalog version", () => {
  assert.match(html, /class="summary-heading"/);
  assert.match(css, /\.summary-card > div\.summary-heading\{display:grid;grid-template-columns:minmax\(0,1fr\);align-items:start;justify-items:start/);
  assert.match(css, /\.summary-card > div\.summary-heading strong\{[^}]*max-width:100%;[^}]*text-align:left;[^}]*overflow-wrap:anywhere/);
});

test("31 missing email warns but does not block draft pricing", async () => {
  const { composerReadiness } = await corePromise;
  const snapshot = offers.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "starter_site" }] }, actor);
  const docs = documents.documentsForSnapshot(snapshot);
  const selected = docs.filter((doc) => doc.required).map((doc) => doc.documentType);
  const result = composerReadiness({ snapshot, documents: docs, selectedDocumentTypes: selected, email: "" });
  assert.equal(result.readyForReview, true);
  assert.equal(result.canTestMailLater, false);
  assert.match(browser, /E-mailadres ontbreekt/);
});

test("32 recurring offer automatically requires hosting and maintenance terms", () => {
  const recurring = documents.documentsForSnapshot({ recurringExVatCents: 1995 });
  const hostingTerms = recurring.find((doc) => doc.documentType === "hosting_maintenance_terms");
  assert.equal(hostingTerms.required, true);
  assert.equal(hostingTerms.versionCode, "hosting-onderhoud-2026-08");
  assert.equal(hostingTerms.effectiveFrom, "2026-08-02");
  const once = documents.documentsForSnapshot({ recurringExVatCents: 0 });
  assert.equal(once.find((doc) => doc.documentType === "hosting_maintenance_terms").required, false);
});

test("33 document registry checksums match the published local documents", () => {
  const crypto = require("node:crypto");
  const files = { general_terms: "public/algemene-voorwaarden.html", hosting_maintenance_terms: "public/hosting-onderhoud-voorwaarden.html", privacy_policy: "public/privacyverklaring.html" };
  for (const [type, file] of Object.entries(files)) {
    const expected = documents.DOCUMENTS.find((doc) => doc.documentType === type).checksumSha256;
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"), expected);
  }
  const generalTerms = documents.DOCUMENTS.find((doc) => doc.documentType === "general_terms");
  assert.equal(generalTerms.versionCode, "algemene-voorwaarden-2026-08-b2b");
  assert.equal(generalTerms.effectiveFrom, "2026-08-02");
  const privacyPolicy = documents.DOCUMENTS.find((doc) => doc.documentType === "privacy_policy");
  assert.equal(privacyPolicy.versionCode, "privacyverklaring-2026-08");
  assert.equal(privacyPolicy.effectiveFrom, "2026-08-02");
  assert.match(read("functions/commercial-order.js"), /TERMS_VERSION = "algemene-voorwaarden-2026-08-b2b"/);
});

test("34 Composer adds the certified Signhost offer route without payment or external QR providers", () => {
  const phaseC = html + browser + endpoint + read("public/src/offer-composer-core.mjs");
  assert.doesNotMatch(phaseC, /api\.mollie|api\.qrserver|quickchart/i);
  assert.match(phaseC, /definitive_offer/);
  assert.match(endpoint, /signhostCommercialEnabled/);
  assert.match(endpoint, /silverado-demo-qr\.svg/);
});

test("35 GET context is read-only while writes use bounded RPCs or token revocation", () => {
  assert.match(endpoint, /event\.httpMethod === "GET" \? "read" : "write"/);
  assert.match(endpoint, /if \(event\.httpMethod === "GET"\)/);
  assert.match(endpoint, /commercial_create_offer_version_v1/);
  assert.match(endpoint, /commercial_transition_offer_version_v1/);
  assert.doesNotMatch(endpoint, /method:\s*"(?:PUT|DELETE)"/);
  assert.match(endpoint, /commercial_offer_signing_access_tokens/);
});

test("36 safe route parsing rejects fabricated or malformed relationship ids", async () => {
  const { composerUrl, parseComposerContext } = await corePromise;
  assert.equal(composerUrl({ relationshipType: "lead", relationshipId: "not-a-uuid" }), "");
  assert.equal(parseComposerContext("?relationshipType=customer&relationshipId=not-a-uuid").valid, false);
  assert.equal(parseComposerContext(`?relationshipType=lead&relationshipId=${relationId}&offerId=bad`).offerId, "");
});

test("37 demo and QR links reject unsafe protocols on server and client", async () => {
  const { safePreviewUrl } = await corePromise;
  assert.equal(endpointPrivate.safePreviewUrl("javascript:alert(1)"), "");
  assert.equal(endpointPrivate.safePreviewUrl("http://unsafe.test/demo"), "");
  assert.equal(endpointPrivate.safePreviewUrl("/preview/safe-demo"), "/preview/safe-demo");
  assert.equal(safePreviewUrl("https://demo.example/path"), "https://demo.example/path");
  assert.equal(safePreviewUrl("data:text/html,unsafe"), "");
});

test("38 a manual recipient can unlock definitive mail without mutating the relationship", async () => {
  const { validRecipientEmail } = await corePromise;
  assert.equal(validRecipientEmail(" gekozen@voorbeeld.nl "), true);
  assert.equal(validRecipientEmail("geen-adres"), false);
  assert.match(browser, /id="relationship-recipient-email"/);
  assert.match(browser, /recipientEmail: effectiveRecipientEmail\(\)/);
  assert.doesNotMatch(browser.match(/async function saveDraft\(\) \{[\s\S]*?\n\}/)?.[0] || "", /recipientEmail/);
  assert.match(read("public/src/offer-composer-recipient.css"), /relation-recipient input/);
});

test("39 a stored ready-for-review version is shown as immutable and complete", () => {
  assert.match(browser, /const savedCurrentVersion = Boolean\(currentVersion\(\) && !state\.dirty\)/);
  assert.match(browser, /\[savedCurrentVersion, 'Actuele inhoud is als immutable versie opgeslagen'\]/);
  assert.match(browser, /const savedDraft = savedCurrentVersion && state\.currentVersionStatus === 'draft'/);
});

test("40 preview failures are brought into view instead of failing invisibly", () => {
  const previewHandler = browser.match(/async function openPreview\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(previewHandler, /composerMessage\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
});

test("41 Composer shows a top-right progress notification until initial loading is complete", () => {
  assert.match(html, /<script src="admin\/ui\/admin-toast\.js"><\/script>/);
  assert.match(browser, /startComposerProgress\('Voorstelgegevens en prijzen laden…'\)/);
  assert.match(browser, /showToast\(`\$\{activeMessage\} · \$\{formatElapsedTime\(0\)\}`, 'info', \{ loading: true, persistent: true \}\)/);
  assert.match(browser, /loadingToast\?\.update\('Voorstel Composer is klaar voor gebruik\.', 'success', \{ duration: 3200 \}\)/);
  assert.match(css, /\.offer-composer-page \.toast\.is-loading \.toast-progress/);
  assert.match(css, /@keyframes composer-loading-progress/);
});

test("41b Composer keeps the top-right progress notification visible during long-running actions", () => {
  for (const message of [
    'Conceptversie wordt veilig opgeslagen…',
    'Versie wordt gereedgemaakt voor controle…',
    'Exact mailvoorbeeld wordt opgebouwd…',
    'Testmail wordt gecontroleerd en verzonden…',
    'Definitieve verzending wordt veilig verwerkt…',
    'Actieve klantlink wordt veilig ingetrokken…',
    'Releasecontrole wordt uitgevoerd…',
  ]) assert.match(browser, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(browser, /finishComposerProgress\(progressToast,/);
  assert.match(browser, /duration: type === 'error' \? 7000 : 3200/);
});

test("42 every bound document can be opened and inspected before selection", () => {
  for (const id of ["document-preview-dialog", "document-preview-frame", "close-document-preview"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(browser, /data-document-preview="\$\{document\.documentType\}"/);
  assert.match(browser, /href="\$\{escapeHtml\(sourceUrl\)\}" target="_blank" rel="noopener"/);
  assert.match(browser, /elements\.documentPreviewFrame\.srcdoc = templateDocumentPreview\(document\)/);
  assert.match(browser, /document\.documentType === 'quote' \? quote : agreement/);
  assert.match(browser, /url\.protocol === 'https:'/);
  assert.match(css, /\.document-preview-button/);
  assert.match(css, /\.document-preview-dialog/);
});

test("43 agreement template is a complete B2B contract bound to an immutable proposal version", () => {
  const agreement = documents.DOCUMENTS.find((document) => document.documentType === "agreement");
  assert.equal(agreement.versionCode, "commercial-agreement-2026-08-b2b");
  assert.equal(agreement.templateCode, "commercial-agreement-v2");
  assert.equal(agreement.effectiveFrom, "2026-08-02");
  assert.match(agreement.checksumSha256, /^[a-f0-9]{64}$/);
  for (const phrase of [
    "Uitsluitend zakelijke overeenkomst",
    "Voorstelreferentie en integriteit",
    "Afspraken over de uitvoering",
    "Toepasselijke documenten en volgorde",
    "Zakelijke akkoordverklaring",
    "bevoegde vertegenwoordiger",
  ]) assert.match(browser, new RegExp(phrase));
  assert.match(browser, /snapshot\.checksum/);
  assert.match(browser, /storedVersion\?\.version_number/);
  assert.match(browser, /relationship\.kvkNumber/);
  assert.match(endpoint, /kvkNumber: clean\(record\.kvk_number \|\| record\.kvk \|\| metadata\.kvkNumber\)/);
  assert.match(browser, /Conceptweergave/);
  assert.match(browser, /overflow-x:hidden/);
  assert.match(browser, /overflow-wrap:anywhere/);
});

test("44 offer view template shows complete B2B scope, pricing, payment and integrity", () => {
  const quote = documents.DOCUMENTS.find((document) => document.documentType === "quote");
  assert.equal(quote.versionCode, "offer-view-2026-08-b2b");
  assert.equal(quote.templateCode, "offer-view-v2");
  assert.equal(quote.effectiveFrom, "2026-08-02");
  assert.match(quote.checksumSha256, /^[a-f0-9]{64}$/);
  for (const phrase of [
    "Zakelijke offerte",
    "Relatie en zakelijk karakter",
    "Prijsopbouw",
    "Betaalafspraak",
    "Geldigheid en integriteit",
    "Gekoppelde documenten",
    "Wat gebeurt er bij acceptatie",
  ]) assert.match(browser, new RegExp(phrase));
  assert.match(browser, /snapshot\.oneTimeExVatCents/);
  assert.match(browser, /snapshot\.oneTimeVatCents/);
  assert.match(browser, /snapshot\.recurringInclVatCents/);
  assert.match(browser, /snapshot\.dueNowInclVatCents/);
  assert.match(browser, /snapshot\.remainingExVatCents/);
  assert.match(browser, /snapshotChecksum/);
});
