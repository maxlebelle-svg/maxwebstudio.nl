const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildFoodDemoBundleMail } = require("../functions/services/foodDemoBundleTemplate");
const { _private } = require("../functions/admin-food-demo-bundles");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260729170000_food_demo_bundles.sql"), "utf8");
const handler = fs.readFileSync(path.join(root, "functions/admin-food-demo-bundles.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "public/admin/ui/food-demo-bundles.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/admin/styles/food-demo-bundles.css"), "utf8");

test("Silverado mail has exact subject, both safe links, QR and honest constraints", () => {
  const mail = buildFoodDemoBundleMail({
    contactName: "Jane <script>", restaurantName: "Silverado Roti Shop", blueprintKey: "silverado-food-v1",
    storefrontUrl: "https://max-webstudio-food-demo.netlify.app/food/silverado-roti-shop-emmeloord",
    dashboardUrl: "https://max-webstudio-food-demo.netlify.app/login.html?next=%2Fadmin%2Ffood",
    qrUrl: "https://max-webstudio-food-demo.netlify.app/assets/food/silverado/silverado-demo-qr.svg",
  });
  assert.equal(mail.subject, "Uw Silverado Food-demonstratie staat klaar");
  assert.match(mail.html, /silverado-roti-shop-emmeloord/);
  assert.match(mail.html, /next=%2Fadmin%2Ffood/);
  assert.match(mail.html, /silverado-demo-qr\.svg/);
  assert.match(mail.text, /geen echte betaling/i);
  assert.doesNotMatch(mail.html, /Jane <script>/);
});

test("mail rejects non-HTTPS and never accepts credential-bearing fallback links", () => {
  assert.throws(() => buildFoodDemoBundleMail({ storefrontUrl: "http://unsafe.example", dashboardUrl: "https://safe.example" }), /ongeldig/);
});

test("relationship contract requires exactly a canonical lead or customer UUID", () => {
  const id = "d4000000-0000-4000-8000-000000000001";
  assert.deepEqual(_private.validateRelationship({ relationshipType: "lead", relationshipId: id }), { type: "lead", id });
  assert.throws(() => _private.validateRelationship({ relationshipType: "food", relationshipId: id }));
  assert.throws(() => _private.validateRelationship({ relationshipType: "lead", relationshipId: "Silverado" }));
});

test("bundle URLs are exact blueprint values and reject host, protocol and open-redirect drift", () => {
  const safe = { blueprint_key: "silverado-food-v1", storefront_url: "https://max-webstudio-food-demo.netlify.app/food/silverado-roti-shop-emmeloord", dashboard_url: "https://max-webstudio-food-demo.netlify.app/admin/food", dashboard_deeplink: "https://max-webstudio-food-demo.netlify.app/login.html?next=%2Fadmin%2Ffood", qr_asset_url: "/assets/food/silverado/silverado-demo-qr.svg" };
  assert.equal(_private.assertBundleUrls(safe), true);
  assert.throws(() => _private.assertBundleUrls({ ...safe, storefront_url: "https://evil.example/food" }), /blueprint/);
  assert.throws(() => _private.assertBundleUrls({ ...safe, dashboard_deeplink: "https://max-webstudio-food-demo.netlify.app/login.html?next=https%3A%2F%2Fevil.example" }), /blueprint|loginroute/);
});

test("dispatch gates keep testmail out of production and final mail out of staging", () => {
  assert.doesNotThrow(() => _private.assertDispatchEnvironment("test", { nonProduction: true }));
  assert.throws(() => _private.assertDispatchEnvironment("test", { nonProduction: false }), /niet-productieomgeving|productie/i);
  assert.throws(() => _private.assertDispatchEnvironment("send", { production: false, liveSendEnabled: true }), /productievrijgave/i);
  assert.doesNotThrow(() => _private.assertDispatchEnvironment("send", { production: true, liveSendEnabled: true }));
});

test("database foundation is additive, tenant-linked, rate-limited and append-only", () => {
  assert.match(migration, /food_demo_bundles_one_relationship/);
  assert.match(migration, /factory_project_id uuid null references public\.factory_projects/);
  assert.match(migration, /consume_food_demo_bundle_rate_limit/);
  assert.match(migration, /events are append-only/);
  assert.match(migration, /force row level security/g);
  assert.doesNotMatch(migration, /drop table|truncate|delete from/i);
});

test("server is authoritative for blueprint URLs, recipient and idempotent dispatch", () => {
  assert.match(handler, /BLUEPRINTS = Object\.freeze/);
  assert.match(handler, /resolveRecipient\(action, relation, config\)/);
  for (const rpc of [
    "food_demo_bundle_read_v1",
    "food_demo_bundle_upsert_v1",
    "food_demo_bundle_update_links_v1",
    "food_demo_bundle_reserve_dispatch_v1",
    "food_demo_bundle_complete_dispatch_v1",
    "food_demo_bundle_revoke_v1",
  ]) assert.match(handler, new RegExp(rpc));
  assert.match(handler, /function actorRpcInput\(admin\)/);
  assert.match(handler, /disableLegacyToken: true/);
  assert.match(handler, /RELATIONSHIP_FORBIDDEN/);
  assert.doesNotMatch(handler, /rest\([^\n]+["']food_demo_bundle(?:s|_dispatches|_events|_rate_limits)["']/);
  assert.doesNotMatch(handler, /\/rest\/v1\/food_demo_bundle(?:s|_dispatches|_events|_rate_limits)/);
  assert.doesNotMatch(handler, /[?&](password|access_token|refresh_token|service_role_key)=/i);
});

test("Food bundle listings fail closed to the active relationship", () => {
  assert.match(handler, /const relation = validateRelationship\(query\)/);
  assert.match(handler, /input_relationship_type:relation\?\.type\|\|null/);
  assert.match(handler, /input_relationship_id:relation\?\.id\|\|null/);
  assert.match(handler, /input_actor_profile_id:admin\.profileId/);
  assert.match(handler, /input_actor_auth_user_id:admin\.id/);
  assert.ok(ui.includes("try{await load(relationship);"));
  assert.ok(ui.includes("subscribeToRelationshipChanges(r=>load(r)"));
  assert.doesNotMatch(ui, /page==="admin-demo-sites\.html"\?null/);
});

test("admin UX separates Food bundles from regular demos and never sends on open", () => {
  assert.match(ui, /Food Demo Bundles/);
  assert.match(ui, /Demo versturen/);
  assert.match(ui, /Het openen van dit venster verstuurt niets/);
  assert.match(ui, /Testmail versturen/);
  assert.match(ui, /Uitnodiging intrekken/);
  assert.match(ui, /Bestelomgeving openen/);
  assert.match(ui, /Naar dashboardlogin/);
  assert.match(ui, /Waarom eerst inloggen\?/);
  assert.match(ui, /query\.get\("openFoodDemo"\)==="1"/);
  assert.match(ui, /b\.factoryProjectId===factoryProjectId/);
  assert.match(ui, /function openModal\(bundle\)\{state\.active=bundle;const root=ensureModal\(\);root\.hidden=false/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /\.food-demo-dialog-actions\{position:static;display:grid;grid-template-columns:1fr/);
  assert.match(css, /\.food-demo-dialog\{[^}]*color:#14251d/);
  assert.match(css, /\.food-demo-card-body\{[^}]*color:#14251d/);
  assert.match(css, /\.food-demo-route-grid\{display:grid;grid-template-columns:repeat\(2/);
});
