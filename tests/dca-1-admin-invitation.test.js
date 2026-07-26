const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  TOKEN_PATTERN,
  activationUrl,
  assertEligibility,
  invitationStatus,
  normalizeEmail,
  whatsappMessage,
  whatsappUrl,
} = require("../functions/_dca-invitation");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20260726130000_dca_1_personal_start_resolver.sql");
const adminFunction = read("functions/admin-demo-invitation.js");
const publicFunction = read("functions/client-activation-start.js");
const adminHtml = read("public/admin-demo-sites.html");
const startHtml = read("public/start.html");
const startJs = read("public/src/dca-start.js");

function base(overrides = {}) {
  const ids = {
    lead: "10000000-0000-4000-8000-000000000001",
    journey: "10000000-0000-4000-8000-000000000002",
    preview: "10000000-0000-4000-8000-000000000003",
    publication: "10000000-0000-4000-8000-000000000004",
    customer: "10000000-0000-4000-8000-000000000005",
    project: "10000000-0000-4000-8000-000000000006",
  };
  return {
    journey: { id: ids.journey, lead_id: ids.lead, customer_id: null, email: "Klant@Example.nl", preview_package: { savedDemoSite: { previewSource: "manual_zip" } } },
    lead: { id: ids.lead, email: "klant@example.nl", converted_customer_id: null },
    preview: { id: ids.preview, demo_journey_id: ids.journey, customer_id: null, project_id: null },
    publication: { id: ids.publication, relationship_type: "lead", relationship_id: ids.lead, preview_version_id: ids.preview, enabled: true, revoked_at: null },
    customer: null,
    project: null,
    profile: { role: "demo_user" },
    email: "klant@example.nl",
    ids,
    ...overrides,
  };
}

test("ZIP-demo is eligible", () => assert.equal(assertEligibility(base()).source, "manual_zip"));
test("Factory-demo is eligible", () => {
  const input = base(); input.journey.preview_package.savedDemoSite.previewSource = "website_factory";
  assert.equal(assertEligibility(input).source, "website_factory");
});
test("ontbrekende publicatie stopt fail-closed", () => assert.throws(() => assertEligibility(base({ publication: null })), /actieve previewpublicatie/));
test("publicatie-preview mismatch stopt fail-closed", () => {
  const input = base(); input.publication.preview_version_id = input.ids.project;
  assert.throws(() => assertEligibility(input), /gekozen previewversie/);
});
test("revoked publicatie stopt fail-closed", () => {
  const input = base(); input.publication.revoked_at = new Date().toISOString();
  assert.throws(() => assertEligibility(input), /actieve previewpublicatie/);
});
test("nieuwe lead houdt customer en project nullable", () => {
  const result = assertEligibility(base()); assert.equal(result.customerId, ""); assert.equal(result.projectId, "");
});
test("converted lead hergebruikt exact bestaande customer", () => {
  const input = base();
  input.lead.converted_customer_id = input.ids.customer;
  input.journey.customer_id = input.ids.customer;
  input.preview.customer_id = input.ids.customer;
  input.preview.project_id = input.ids.project;
  input.customer = { id: input.ids.customer };
  input.project = { id: input.ids.project, customer_id: input.ids.customer };
  input.publication.relationship_type = "customer";
  input.publication.relationship_id = input.ids.customer;
  input.profile = { role: "customer" };
  assert.equal(assertEligibility(input).customerId, input.ids.customer);
});
test("ambiguous ownership stopt fail-closed", () => {
  const input = base(); input.journey.customer_id = input.ids.customer;
  assert.throws(() => assertEligibility(input), /ownership/);
});
test("afwijkend e-mailadres stopt fail-closed", () => assert.throws(() => assertEligibility(base({ email: "ander@example.nl" })), /hoort niet eenduidig/));
test("orphaned project stopt fail-closed", () => { const input = base(); input.preview.project_id = input.ids.project; assert.throws(() => assertEligibility(input), /previewproject bestaat niet/); });
test("e-mail wordt canoniek genormaliseerd", () => assert.equal(normalizeEmail("  MAX@Example.NL "), "max@example.nl"));
test("DCA-0 create-RPC bewaakt idempotency", () => assert.match(adminFunction, /dca_0_create_activation_link/));
test("token is exact 256-bit hex transport", () => assert.equal(TOKEN_PATTERN.test("a".repeat(64)), true));
test("raw token wordt niet als browserstorage opgeslagen", () => { assert.doesNotMatch(startJs, /localStorage|sessionStorage/); assert.doesNotMatch(startJs, /console\./); });
test("expiry wordt atomair gemarkeerd", () => { assert.match(migration, /set status = 'expired'/); assert.match(migration, /dca_phase = 'expired'/); });
test("revoke gebruikt DCA-0 server-RPC", () => assert.match(adminFunction, /dca_0_revoke_activation_link/));
test("rotation is expliciet en geen implicit overwrite", () => { assert.match(adminFunction, /input_rotate: action === "rotate"/); assert.match(adminHtml, /Nieuwe link genereren/); });
test("databasecontract houdt exact één live link", () => assert.match(read("supabase/migrations/20260726100000_dca_0_token_safe_invitation_foundation.sql"), /client_activation_links_one_live_token/));
test("wrong token wordt generiek afgewezen", () => assert.match(publicFunction, /Deze persoonlijke link is ongeldig of niet meer actief/));
test("tampered token faalt vóór database lookup", () => assert.equal(TOKEN_PATTERN.test("a".repeat(63) + "z"), false));
test("cross-invitation binding wordt opnieuw gecontroleerd", () => { assert.match(migration, /invitation_record\.lead_id is distinct from link_record\.lead_id/); assert.match(migration, /invitation_record\.preview_version_id is distinct from link_record\.preview_version_id/); });
test("opened_at is idempotent", () => assert.match(migration, /opened_at = coalesce\(opened_at/));
test("preview wordt exact via gebonden preview_version_id geladen", () => { assert.match(publicFunction, /binding\.preview_version_id/); assert.match(publicFunction, /binding\.preview_publication_id/); assert.match(publicFunction, /publication\.enabled !== true/); });
test("WhatsApp-bericht is correct en gecodeerd", () => {
  const url = "https://example.nl/start/" + "a".repeat(64);
  const message = whatsappMessage({ contactName: "Sanne Jansen", companyName: "Studio Noord", activationUrl: url });
  assert.match(message, /^Hoi Sanne! 👋/); assert.match(message, /Studio Noord/); assert.match(whatsappUrl("06 12 34 56 78", message), /^https:\/\/wa\.me\/31612345678\?text=/);
});
test("activation URL accepteert alleen veilig startpad", () => { assert.equal(activationUrl("https://example.nl", "/start/" + "a".repeat(64)).startsWith("https://example.nl/start/"), true); assert.equal(activationUrl("https://example.nl", "/start/not-a-token"), ""); });
test("serverlogs bevatten token noch requestbody", () => { assert.doesNotMatch(adminFunction, /console\.(?:log|error)\([^\n]*(?:token|body|email)/i); assert.doesNotMatch(publicFunction, /console\./); });
test("adminactie vereist actieve staffsessie zonder legacy token", () => { assert.match(adminFunction, /disableLegacyToken: true/); assert.match(adminFunction, /sales_manager/); });
test("directe table access blijft voor browserrollen geblokkeerd", () => { const dca0 = read("supabase/migrations/20260726100000_dca_0_token_safe_invitation_foundation.sql"); assert.match(dca0, /revoke all on table public\.client_activation_links from public, anon, authenticated/); assert.match(migration, /revoke all on function public\.dca_1_open_personal_start\(text\) from public, anon, authenticated/); });
test("startpagina toont alleen minimale Nederlandse presentatie", () => { const publicSource = `${startHtml}\n${startJs}`; for (const text of ["Welkom", "Wacht op jouw beoordeling", "Verwachte oplevering", "Bekijk mijn website", "Activeer mijn omgeving"]) assert.ok(publicSource.includes(text)); for (const forbidden of ["e-mailadres", "telefoonnummer", "customer_id", "preview_token"]) assert.equal(publicSource.toLowerCase().includes(forbidden), false); });
test("preview draait in sandbox zonder same-origin", () => assert.match(startHtml, /sandbox="allow-scripts allow-forms allow-modals"/));
test("route gebruikt path en geen queryparameter", () => { const netlify = read("netlify.toml"); assert.match(netlify, /from = "\/start\/:token"/); assert.match(startJs, /window\.location\.pathname/); assert.doesNotMatch(startJs, /URLSearchParams|location\.search/); });
test("DCA-1 verwijst nergens naar leads.customer_id", () => { for (const source of [migration, adminFunction, publicFunction]) assert.doesNotMatch(source, /leads\.customer_id|lead_record\.customer_id/); });

test("statuspresentatie omvat alle gevraagde toestanden", () => {
  assert.equal(invitationStatus(null), "niet_uitgenodigd");
  assert.equal(invitationStatus({ id: "1", status: "active", expires_at: "2999-01-01" }), "gereed");
  assert.equal(invitationStatus({ id: "1", status: "opened", expires_at: "2999-01-01" }), "geopend");
  assert.equal(invitationStatus({ id: "1", status: "activated", expires_at: "2999-01-01" }), "geactiveerd");
  assert.equal(invitationStatus({ id: "1", status: "active", expires_at: "2000-01-01" }), "verlopen");
  assert.equal(invitationStatus({ id: "1", status: "revoked", expires_at: "2999-01-01" }), "ingetrokken");
});
