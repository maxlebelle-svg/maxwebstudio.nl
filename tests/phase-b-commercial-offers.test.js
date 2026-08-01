const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const catalog = require("../functions/_commercial-catalog");
const legacyCatalog = require("../functions/product-catalog");
const mollieProducts = require("../functions/mollie-products");
const offerService = require("../functions/services/commercialOfferService");
const adminOffer = require("../functions/admin-commercial-offers")._private;
const migrationPath = path.join(root, "supabase/migrations/20260730150000_commercial_offer_foundation.sql");
const migration = fs.readFileSync(migrationPath, "utf8");

const superAdmin = { id: "11111111-1111-4111-8111-111111111111", profileId: "22222222-2222-4222-8222-222222222222", role: "super_admin" };
const admin = { ...superAdmin, role: "admin" };

test("canonical catalog is versioned, deterministic and the only server price definition", () => {
  assert.equal(catalog.CATALOG_VERSION, "2026-07-30.1");
  assert.equal(catalog.CURRENCY, "EUR");
  assert.equal(catalog.assertCatalogIntegrity(), true);
  assert.match(catalog.catalogChecksum(), /^[a-f0-9]{64}$/);
  assert.equal(catalog.catalogChecksum(), catalog.catalogChecksum(catalog.catalogSnapshot()));
  const ids = catalog.catalogSnapshot().products.map((item) => item.id);
  const codes = catalog.catalogSnapshot().products.map((item) => item.code);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(codes).size, codes.length);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "functions/product-catalog.js"), "utf8"), /49500|99500|175000|30000|50000/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "functions/mollie-products.js"), "utf8"), /49500|99500|175000|30000|50000/);
});

test("published checkout consumes the canonical endpoint and contains no drifted add-on catalog", () => {
  const checkout = fs.readFileSync(path.join(root, "public/betalen.html"), "utf8");
  assert.match(checkout, /fetch\("\/api\/commercial-catalog"/);
  assert.doesNotMatch(checkout, /const productCatalog\s*=\s*\{/);
  assert.doesNotMatch(checkout, /Google Bedrijfsprofiel[\s\S]{0,80}\b149\b|Logo laten ontwerpen[\s\S]{0,80}\b295\b|Vanaf €395,00[^\n]*Google Ads/);
  assert.match(checkout, /De actuele prijscatalogus kon niet veilig worden geladen/);
});

test("website packages, fixed deposits and care prices match the approved commercial contract", () => {
  const expectedWebsites = {
    starter_site: [49500, 15000, 34500],
    business_website: [99500, 30000, 69500],
    premium_growth: [175000, 50000, 125000],
  };
  for (const [id, expected] of Object.entries(expectedWebsites)) {
    const product = catalog.PRODUCTS[id];
    assert.equal(product.classification, "fixed");
    assert.equal(product.components[0].amountExVatCents, expected[0]);
    assert.equal(product.fixedDepositExVatCents, expected[1]);
    assert.deepEqual([
      mollieProducts.WEBSITE_PACKAGES[id].priceExVatCents,
      mollieProducts.WEBSITE_PACKAGES[id].depositExVatCents,
      mollieProducts.WEBSITE_PACKAGES[id].remainingExVatCents,
    ], expected);
  }
  assert.equal(catalog.PRODUCTS.care_basic.components[0].amountExVatCents, 1995);
  assert.equal(catalog.PRODUCTS.care_plus.components[0].amountExVatCents, 4900);
  assert.equal(catalog.PRODUCTS.care_growth.components[0].amountExVatCents, 9900);
  assert.equal(legacyCatalog.PRODUCTS.business_website.priceExVatCents, 99500);
  assert.equal(legacyCatalog.PRODUCTS.business_website.depositExVatCents, 30000);
});

test("public add-ons have the approved fixed, starting-at or on-request classification", () => {
  const logo = catalog.PRODUCTS.logo_design;
  assert.equal(logo.classification, "starting_at");
  assert.equal(logo.components[0].startingAmountExVatCents, 35000);
  assert.equal(catalog.PRODUCTS.google_business_profile.components[0].amountExVatCents, 19500);
  assert.deepEqual(catalog.PRODUCTS.meta_ads.components.map((item) => item.amountExVatCents), [35000, 24900]);
  assert.deepEqual(catalog.PRODUCTS.google_ads_setup.components.map((item) => item.amountExVatCents), [45000, 29900]);
  assert.equal(catalog.PRODUCTS.automation.components[0].startingAmountExVatCents, 39500);
  assert.equal(catalog.PRODUCTS.social_media.components[0].startingAmountExVatCents, 29900);
  assert.equal(catalog.PRODUCTS.strippenkaart.classification, "on_request");
  assert.equal(catalog.PRODUCTS.monthly_content.active, false);
});

test("Silverado example calculates cents, VAT, fixed deposit and remainder server-side", () => {
  const result = offerService.buildOfferVersion({
    paymentChoice: "fixed_deposit",
    selections: [
      { productId: "business_website" },
      { productId: "care_basic" },
      { productId: "google_business_profile" },
    ],
  }, admin);
  assert.equal(result.oneTimeExVatCents, 119000);
  assert.equal(result.oneTimeVatCents, 24990);
  assert.equal(result.oneTimeInclVatCents, 143990);
  assert.equal(result.recurringExVatCents, 1995);
  assert.equal(result.recurringVatCents, 419);
  assert.equal(result.fixedDepositExVatCents, 30000);
  assert.equal(result.dueNowExVatCents, 30000);
  assert.equal(result.dueNowInclVatCents, 36300);
  assert.equal(result.remainingExVatCents, 89000);
  assert.equal(result.hasNonBindingLines, false);
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
});

test("compound add-ons keep setup and monthly components separate", () => {
  const result = offerService.buildOfferVersion({ paymentChoice: "full", selections: [{ productId: "business_website" }, { productId: "meta_ads" }, { productId: "google_ads_setup" }] }, admin);
  assert.equal(result.oneTimeExVatCents, 179500);
  assert.equal(result.recurringExVatCents, 54800);
  assert.equal(result.dueNowExVatCents, 179500);
  assert.equal(result.remainingExVatCents, 0);
  assert.equal(result.lines.filter((line) => line.componentType === "one_time").length, 3);
  assert.equal(result.lines.filter((line) => line.componentType === "recurring").length, 2);
});

test("starting-at and on-request products stay non-binding without authorized confirmation", () => {
  const result = offerService.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "logo_design" }, { productId: "strippenkaart" }] }, admin);
  assert.equal(result.hasNonBindingLines, true);
  assert.equal(result.oneTimeExVatCents, 0);
  assert.ok(result.lines.every((line) => line.bindingState === "non_binding" && line.unitExVatCents === null));
  assert.throws(() => offerService.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "logo_design", customComponents: [{ componentCode: "design", unitExVatCents: 42500, reason: "Klantgebonden scope bevestigd" }] }] }, admin), /super_admin/i);
});

test("custom prices require super-admin, reason, original price and explicit audit metadata", () => {
  const result = offerService.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "logo_design", customComponents: [{ componentCode: "design", unitExVatCents: 42500, reason: "Extra merkonderzoek en twee conceptvarianten" }] }] }, superAdmin);
  assert.equal(result.hasNonBindingLines, false);
  assert.equal(result.lines[0].priceClassification, "custom");
  assert.equal(result.lines[0].originalCatalogUnitExVatCents, 35000);
  assert.equal(result.lines[0].unitExVatCents, 42500);
  assert.equal(result.lines[0].customPriceAuthorizedBy, superAdmin.profileId);
  assert.equal(result.customPriceEvents.length, 1);
  assert.throws(() => offerService.buildOfferVersion({ paymentChoice: "none", selections: [{ productId: "logo_design", customComponents: [{ componentCode: "design", unitExVatCents: 42500, reason: "kort" }] }] }, superAdmin), /reden/i);
});

test("content changes yield a new checksum without mutating the previous snapshot", () => {
  const first = offerService.buildOfferVersion({ paymentChoice: "fixed_deposit", selections: [{ productId: "business_website" }, { productId: "care_basic" }] }, admin);
  const serialized = JSON.stringify(first);
  const second = offerService.buildOfferVersion({ paymentChoice: "fixed_deposit", selections: [{ productId: "business_website" }, { productId: "care_basic" }, { productId: "google_business_profile" }] }, admin);
  assert.notEqual(first.checksum, second.checksum);
  assert.equal(JSON.stringify(first), serialized);
});

test("legacy 50-percent policy is physically isolated from every Phase B runtime", () => {
  const legacy = fs.readFileSync(path.join(root, "functions/_legacy-commercial-order.js"), "utf8");
  const service = fs.readFileSync(path.join(root, "functions/services/commercialOfferService.js"), "utf8");
  const endpoint = fs.readFileSync(path.join(root, "functions/admin-commercial-offers.js"), "utf8");
  assert.match(legacy, /0\.5\s*\/\s*1\.21/);
  assert.doesNotMatch(service + endpoint, /legacy-commercial-order|0\.5\s*\/\s*1\.21|PACKAGE_CATALOG|OPTION_CATALOG/);
  assert.match(fs.readFileSync(path.join(root, "functions/commercial-order.js"), "utf8"), /_legacy-commercial-order/);
});

test("migration is forward-only and creates immutable version, line, document and event evidence", () => {
  for (const table of ["commercial_catalog_versions", "commercial_offers", "commercial_offer_versions", "commercial_offer_lines", "commercial_offer_document_bindings", "commercial_offer_events"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
  }
  assert.match(migration, /Commercial evidence is append-only/);
  assert.match(migration, /Offer version content is immutable/);
  assert.match(migration, /commercial_offer_events_append_only/);
  assert.match(migration, /status='superseded'.*Vervangen door een nieuwe inhoudelijke versie/s);
  assert.match(migration, /snapshot_checksum_sha256/);
  assert.match(migration, /snapshot jsonb not null/);
  assert.match(migration, /input_snapshot->'lines' is distinct from input_lines/);
  assert.match(migration, /Custom price authorization identity mismatch/);
  assert.match(migration, /'offer.changed'/);
  assert.doesNotMatch(migration, /alter table public\.(quotes|quote_lines|invoices|subscriptions)\b/i);
  assert.doesNotMatch(migration, /drop table|truncate\s|delete from/i);
});

test("RLS is tenant-scoped, demo users are excluded and all writes use bounded service RPCs", () => {
  assert.match(migration, /commercial_offers_scoped_read/);
  assert.match(migration, /public\.owns_customer\(customer_id\)/);
  assert.match(migration, /sales_partner.*assigned_user_id/s);
  assert.doesNotMatch(migration, /demo_user|is_demo_record|demo_read/);
  assert.match(migration, /revoke all on public\.commercial_catalog_versions[\s\S]*from public,anon,authenticated,service_role/);
  assert.match(migration, /grant execute on function public\.commercial_create_offer_version_v1[\s\S]*to service_role/);
  assert.match(migration, /custom prices require super_admin authorization/i);
});

test("future statuses are modeled but provider-backed transitions remain closed in Phase B", () => {
  for (const status of ["draft","ready_for_review","sent","viewed","revoked","superseded","signed","payment_pending","partially_paid","paid","accepted","expired","declined","failed"]) assert.match(migration, new RegExp(`'${status}'`));
  assert.deepEqual([...adminOffer.PHASE_B_TRANSITIONS].sort(), ["ready_for_review", "revoked", "superseded"]);
  assert.match(migration, /Provider-backed transition is reserved for a later certified phase/);
  const endpoint = fs.readFileSync(path.join(root, "functions/admin-commercial-offers.js"), "utf8");
  assert.doesNotMatch(endpoint, /require\([^)]*(mollie|signhost|email|foodDemo)/i);
});

test("catalog and offer checksums are reproducible SHA-256 evidence", () => {
  const registration = offerService.catalogRegistrationPayload();
  assert.equal(registration.checksum_sha256, crypto.createHash("sha256").update(JSON.stringify(catalog.stable(registration.snapshot))).digest("hex"));
  assert.equal(registration.version, catalog.CATALOG_VERSION);
});
