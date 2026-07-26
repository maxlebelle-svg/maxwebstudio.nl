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
const {
  MAX_BODY_BYTES,
  bodyWithinLimit,
  clearSessionCookie,
  clientRateKey,
  cookieName,
  readSessionCookie,
  sameOrigin,
  sessionCookie,
  sessionSecret,
  sha256,
} = require("../functions/_dca-exchange");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20260726130000_dca_1_personal_start_resolver.sql");
const exchangeMigration = read("supabase/migrations/20260726150000_dca_1_fragment_token_exchange_v1.sql");
const adminFunction = read("functions/admin-demo-invitation.js");
const publicFunction = read("functions/client-activation-start.js");
const exchangeFunction = read("functions/client-activation-exchange.js");
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
test("admin revoke verkiest altijd de live link boven terminale historie", () => assert.match(adminFunction, /links\.find\(\(candidate\) => \["active", "opened"\]\.includes\(candidate\.status\)\)/));
test("bestaande klant gebruikt uitsluitend bewezen projectkolommen", () => {
  assert.match(adminFunction, /select=id,customer_id,name,status&/);
  assert.doesNotMatch(adminFunction, /projects[^\n]*deadline/);
  assert.match(adminFunction, /select=id,auth_user_id,profile_id,name,company,email&/);
  assert.doesNotMatch(adminFunction, /company_name/);
});
test("databasecontract houdt exact één live link", () => assert.match(read("supabase/migrations/20260726100000_dca_0_token_safe_invitation_foundation.sql"), /client_activation_links_one_live_token/));
test("wrong token wordt generiek afgewezen", () => assert.match(publicFunction, /Deze persoonlijke link is ongeldig of niet meer actief/));
test("tampered token faalt vóór database lookup", () => assert.equal(TOKEN_PATTERN.test("a".repeat(63) + "z"), false));
test("cross-invitation binding wordt opnieuw gecontroleerd", () => { assert.match(migration, /invitation_record\.lead_id is distinct from link_record\.lead_id/); assert.match(migration, /invitation_record\.preview_version_id is distinct from link_record\.preview_version_id/); });
test("opened_at is idempotent", () => assert.match(migration, /opened_at = coalesce\(opened_at/));
test("preview wordt exact via gebonden preview_version_id geladen", () => { assert.match(publicFunction, /binding\.preview_version_id/); assert.match(publicFunction, /binding\.preview_publication_id/); assert.match(publicFunction, /publication\.enabled !== true/); });
test("WhatsApp-bericht is correct en gecodeerd", () => {
  const url = "https://example.nl/start#" + "a".repeat(64);
  const message = whatsappMessage({ contactName: "Sanne Jansen", companyName: "Studio Noord", activationUrl: url });
  assert.match(message, /^Hoi Sanne! 👋/); assert.match(message, /Studio Noord/); assert.match(whatsappUrl("06 12 34 56 78", message), /^https:\/\/wa\.me\/31612345678\?text=/);
});
test("activation URL gebruikt uitsluitend een fragment", () => { assert.equal(activationUrl("https://example.nl", "a".repeat(64)), "https://example.nl/start#" + "a".repeat(64)); assert.equal(activationUrl("https://example.nl", "not-a-token"), ""); });
test("adminlink gebruikt de daadwerkelijke requesthost vóór algemene siteconfig", () => { assert.match(adminFunction, /x-forwarded-host[\s\S]*DEPLOY_PRIME_URL/); });
test("serverlogs bevatten token noch requestbody", () => { assert.doesNotMatch(adminFunction, /console\.(?:log|error)\([^\n]*(?:token|body|email)/i); assert.doesNotMatch(publicFunction, /console\./); });
test("adminfouten geven alleen een veilige reasonCode terug", () => {
  assert.match(adminFunction, /reasonCode: clean\(error\.code \|\| "DCA_INVITATION_FAILED"\)/);
  assert.doesNotMatch(adminFunction, /reasonCode:\s*error\.message/);
});
test("adminactie vereist actieve staffsessie zonder legacy token", () => { assert.match(adminFunction, /disableLegacyToken: true/); assert.match(adminFunction, /sales_manager/); });
test("directe table access blijft voor browserrollen geblokkeerd", () => { const dca0 = read("supabase/migrations/20260726100000_dca_0_token_safe_invitation_foundation.sql"); assert.match(dca0, /revoke all on table public\.client_activation_links from public, anon, authenticated/); assert.match(migration, /revoke all on function public\.dca_1_open_personal_start\(text\) from public, anon, authenticated/); });
test("startpagina toont alleen minimale Nederlandse CX2-presentatie", () => { const publicSource = `${startHtml}\n${startJs}`; for (const text of ["Welkom", "Demo gereed", "Nog 3 stappen tot oplevering", "Bekijk mijn website", "100% veilig"]) assert.ok(publicSource.includes(text)); for (const forbidden of ["e-mailadres", "telefoonnummer", "customer_id", "preview_token"]) assert.equal(publicSource.toLowerCase().includes(forbidden), false); });
test("previewversie wordt alleen als minimale presentatie toegevoegd", () => { assert.match(publicFunction, /versionNumber: Number\.isFinite\(Number\(version\.version\)\)/); assert.doesNotMatch(publicFunction, /previewVersionId:\s*version\.id/); });
test("preview draait in sandbox zonder same-origin", () => assert.match(startHtml, /sandbox="allow-scripts allow-forms allow-modals"/));
test("route gebruikt fragmentbootstrap zonder tokenpad of query", () => { const netlify = read("netlify.toml"); assert.match(netlify, /from = "\/start"/); assert.match(startJs, /window\.location\.hash/); assert.match(startJs, /history\.replaceState\(null, "", "\/start"\)/); assert.doesNotMatch(startJs, /URLSearchParams|location\.search/); assert.doesNotMatch(adminFunction, /activation_path/); });
test("DCA-1 verwijst nergens naar leads.customer_id", () => { for (const source of [migration, adminFunction, publicFunction]) assert.doesNotMatch(source, /leads\.customer_id|lead_record\.customer_id/); });

test("statuspresentatie omvat alle gevraagde toestanden", () => {
  assert.equal(invitationStatus(null), "niet_uitgenodigd");
  assert.equal(invitationStatus({ id: "1", status: "active", expires_at: "2999-01-01" }), "gereed");
  assert.equal(invitationStatus({ id: "1", status: "opened", expires_at: "2999-01-01" }), "geopend");
  assert.equal(invitationStatus({ id: "1", status: "activated", expires_at: "2999-01-01" }), "geactiveerd");
  assert.equal(invitationStatus({ id: "1", status: "active", expires_at: "2000-01-01" }), "verlopen");
  assert.equal(invitationStatus({ id: "1", status: "revoked", expires_at: "2999-01-01" }), "ingetrokken");
});

test("fragment wordt vóór exchange uit URL en history verwijderd", () => {
  const take = startJs.indexOf("takeFragmentToken()");
  const exchange = startJs.indexOf("await exchange(token)");
  assert.ok(take >= 0 && exchange > take);
  assert.match(startJs, /history\.replaceState/);
});
test("fragmenttoken gaat alleen in een POST-body naar exchange", () => {
  assert.match(startJs, /fetch\(exchangeEndpoint[\s\S]*method: "POST"[\s\S]*JSON\.stringify\(\{ token \}\)/);
  assert.doesNotMatch(startJs, /fetch\([^\n]*(?:\$\{token\}|\+ token)/);
});
test("fragmenttoken wordt nooit in storage, cookies, DOM of console geschreven", () => {
  assert.doesNotMatch(startJs, /localStorage|sessionStorage|indexedDB|document\.cookie|dataset\.|setAttribute\([^,]+,\s*token|console\./);
});
test("refresh zonder fragment gebruikt alleen de HttpOnly exchangesessie", () => {
  assert.match(startJs, /if \(token\) await exchange\(token\)/);
  assert.match(startJs, /requestContext\("open"\)/);
  assert.doesNotMatch(publicFunction, /body\.token|input_activation_token/);
});
test("oude tokenpadroute verwerkt geen geldige activatie", () => {
  assert.match(startJs, /legacyPath/);
  assert.match(startJs, /nieuwe veilige link/);
  assert.doesNotMatch(adminFunction, /\/start\//);
});
test("exchange endpoint is POST-only, same-origin en begrensd", () => {
  assert.match(exchangeFunction, /event\.httpMethod !== "POST"/);
  assert.match(exchangeFunction, /sameOrigin\(event\)/);
  assert.match(exchangeFunction, /isJsonRequest\(event\)/);
  assert.match(exchangeFunction, /bodyWithinLimit\(event\)/);
  assert.doesNotMatch(exchangeFunction, /corsHeaders|Access-Control-Allow-Origin|OPTIONS/);
});
test("origincontrole vereist exact dezelfde HTTPS-origin", () => {
  const event = { headers: { host: "staging.example.nl", origin: "https://staging.example.nl", "x-forwarded-proto": "https" } };
  assert.equal(sameOrigin(event), true);
  assert.equal(sameOrigin({ ...event, headers: { ...event.headers, origin: "https://evil.example" } }), false);
  assert.equal(sameOrigin({ ...event, headers: { ...event.headers, origin: "http://staging.example.nl" } }), false);
});
test("oversized en verkeerd content-type stoppen vóór verwerking", () => {
  assert.equal(bodyWithinLimit({ body: "x".repeat(MAX_BODY_BYTES + 1) }), false);
  assert.equal(bodyWithinLimit({ body: "{}" }), true);
});
test("rate-limit sleutel is HMAC en vereist serversecret", () => {
  const event = { headers: { "x-nf-client-connection-ip": "192.0.2.10" } };
  assert.match(clientRateKey(event, "s".repeat(32)), /^[0-9a-f]{64}$/);
  assert.equal(clientRateKey(event, "short"), "");
  assert.match(exchangeMigration, /attempts >= 10/);
});
test("cookiecontract is __Host, HttpOnly, Secure, Strict en kort", () => {
  const secret = sessionSecret();
  const cookie = sessionCookie(secret, "staging");
  assert.match(cookie, /^__Host-mws_activation_staging=[0-9a-f]{64}; Path=\/;/);
  for (const part of ["HttpOnly", "Secure", "SameSite=Strict", "Max-Age=900"]) assert.ok(cookie.includes(part));
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.equal(cookieName("production"), "__Host-mws_activation");
  assert.match(clearSessionCookie("staging"), /Max-Age=0/);
  assert.equal(readSessionCookie(cookie, "staging"), secret);
});
test("cookie bevat niet de activation token en sessiehash is eenrichtingsverkeer", () => {
  const secret = sessionSecret();
  assert.match(secret, /^[0-9a-f]{64}$/);
  assert.match(sha256(secret), /^[0-9a-f]{64}$/);
  assert.notEqual(secret, sha256(secret));
  assert.doesNotMatch(exchangeMigration, /session_secret|activation_token\s+text\s+not null/i);
});
test("databasesessies zijn server-only met RLS", () => {
  assert.match(exchangeMigration, /client_activation_exchange_sessions enable row level security/);
  assert.match(exchangeMigration, /force row level security/);
  assert.match(exchangeMigration, /revoke all on table public\.client_activation_exchange_sessions from public, anon, authenticated/);
});
test("exact één actieve exchangesessie per activation link", () => {
  assert.match(exchangeMigration, /client_activation_exchange_sessions_one_live_idx/);
  assert.match(exchangeMigration, /where revoked_at is null/);
  assert.match(exchangeMigration, /set revoked_at = coalesce\(revoked_at, audit_now\)/);
});
test("revoke, rotation en expiry maken exchangesessies ongeldig", () => {
  assert.match(exchangeMigration, /dca_1_revoke_exchange_sessions_on_link_status/);
  assert.match(exchangeMigration, /new\.status not in \('active','opened'\)/);
  assert.match(exchangeMigration, /session_record\.expires_at <= audit_now/);
  assert.match(exchangeMigration, /link_record\.status not in \('active','opened'\)/);
});
test("context en preview worden exact aan de sessiebinding herbewezen", () => {
  assert.match(exchangeMigration, /session_record\.preview_publication_id is distinct from link_record\.preview_publication_id/);
  assert.match(exchangeMigration, /session_record\.preview_version_id is distinct from link_record\.preview_version_id/);
  assert.match(publicFunction, /binding\.preview_version_id/);
  assert.match(publicFunction, /binding\.preview_publication_id/);
});
test("legacy tokenresolver is niet meer runtime-callable", () => {
  assert.match(exchangeMigration, /revoke all on function public\.dca_1_open_personal_start\(text\).*service_role/);
  assert.doesNotMatch(publicFunction, /dca_1_open_personal_start/);
});
test("exchange en context loggen token, cookie en body niet", () => {
  for (const source of [exchangeFunction, publicFunction]) assert.doesNotMatch(source, /console\.|event\.body[^\n]*console|cookie[^\n]*console/i);
});
