const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("public/start.html");
const script = read("public/src/dca-start.js");
const styles = read("public/styles.css");
const migration = read("supabase/migrations/20260726190000_cx2_magic_link_account_activation.sql");
const endpoint = read("functions/client-activation-magic-link.js");
const provider = read("public/src/services/supabaseAuthProvider.js");
const callbackRuntime = read("public/src/cx2-activation-runtime.mjs");
const { maskEmail, callbackUrl, config, safePortalPath } = require("../functions/client-activation-magic-link")._private;

test("CX2 toont de vier goedgekeurde activeringsschermen en foutstaat", () => {
  for (const copy of [
    "Bijna klaar!", "Verstuur magic link", "Dit e-mailadres klopt niet",
    "E-mail verstuurd!", "Open je e-mail.", "Activatie verwerken…",
    "Jouw persoonlijke omgeving is veilig geactiveerd.", "Naar mijn dashboard",
  ]) assert.ok(html.includes(copy), `Ontbrekende CX2-copy: ${copy}`);
  for (const state of ["ready", "sending", "sent", "callback", "success", "error"]) assert.ok(html.includes(`id="cx2-activation-${state}"`));
});

test("e-mailadres is gecontroleerd en alleen gemaskeerd zichtbaar", () => {
  assert.equal(maskEmail("ziva@dcazipstudio.nl"), "z***@dcazipstudio.nl");
  assert.doesNotMatch(html, /type="email"/);
  assert.match(script, /requestContext\("activation"\)/);
});

test("magic link gebruikt bestaande Supabase OTP zonder browser-service-role", () => {
  assert.match(endpoint, /\/auth\/v1\/otp/);
  assert.match(endpoint, /create_user: false/);
  assert.doesNotMatch(`${html}\n${script}\n${provider}`, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(script, /service[_-]?role/i);
});

test("redirect is expliciet geallowlist en blokkeert open redirects", () => {
  const env = {
    SUPABASE_URL: "https://staging.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only",
    SUPABASE_ANON_KEY: "public",
    CX2_AUTH_REDIRECT_ORIGINS: "https://staging.example.nl",
  };
  const context = config(env, async () => null);
  const good = { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "staging.example.nl" } };
  const evil = { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "evil.example.nl" } };
  assert.match(callbackUrl(good, context, "a".repeat(64)), /^https:\/\/staging\.example\.nl\/start\?cx2=callback&state=/);
  assert.equal(callbackUrl(evil, context, "a".repeat(64)), "");
  assert.equal(safePortalPath("/klantportaal.html?view=website"), true);
  assert.equal(safePortalPath("https://evil.example/"), false);
});

test("correlatiestate wordt alleen gehasht opgeslagen en is aan DCA-sessie gebonden", () => {
  assert.match(migration, /exchange_session_id uuid not null references public\.client_activation_exchange_sessions/);
  assert.match(migration, /state_hash text not null/);
  assert.doesNotMatch(migration, /raw_state|activation_token text/);
  assert.match(endpoint, /input_state_hash: sha256\(rawState\)/);
  assert.match(endpoint, /input_session_hash: sha256\(sessionSecret\)/);
});

test("accountkoppeling is transactioneel, idempotent en gebruikt converted_customer_id", () => {
  for (const invariant of [
    /from auth\.users[\s\S]*email_confirmed_at is not null/,
    /matching_customers > 1/,
    /lead_record\.converted_customer_id/,
    /insert into public\.customers/,
    /update public\.leads[\s\S]*converted_customer_id = customer_record\.id/,
    /update public\.profiles set role = 'customer'/,
    /update public\.client_activation_links[\s\S]*status = 'activated'/,
    /update public\.lead_demo_invitations[\s\S]*status = 'activated'/,
  ]) assert.match(migration, invariant);
  assert.doesNotMatch(migration, /leads\.customer_id|lead_record\.customer_id/);
  assert.match(migration, /where state_hash = input_state_hash for update/);
});

test("previewownership verhuist naar exact dezelfde customer zonder projectaanmaak", () => {
  assert.match(migration, /update public\.website_preview_versions[\s\S]*customer_id = customer_record\.id/);
  assert.match(migration, /update public\.public_preview_publications[\s\S]*relationship_type = 'customer'/);
  assert.doesNotMatch(migration, /insert into public\.projects/);
  assert.match(migration, /CX2 project customer mismatch/);
});

test("replay, revoke, expiry, mismatch en ambiguity stoppen fail-closed", () => {
  assert.match(migration, /challenge_record\.status not in \('prepared','sent'\)/);
  assert.match(migration, /invitation_record\.status in \('activated','revoked','link_expired','send_failed'\)/);
  assert.match(migration, /auth_email is distinct from link_record\.intended_email/);
  assert.match(migration, /matching_customers > 1/);
  assert.match(migration, /session_record\.revoked_at is not null/);
});

test("resend heeft cooldown en begrensd uurvenster", () => {
  assert.match(migration, /recent_count >= 5/);
  assert.match(migration, /interval '60 seconds'/);
  assert.match(html, /cx2-activation-countdown/);
  assert.match(script, /startResendCountdown/);
});

test("callback herstelt sessie en server bepaalt de portalroute", () => {
  assert.match(provider, /consumeMagicLinkSessionFromUrl/);
  assert.match(callbackRuntime, /provider\.consumeMagicLinkSessionFromUrl\(\)/);
  assert.match(script, /magicRequest\("complete"/);
  assert.match(migration, /'\/klantportaal\.html\?view=website'::text/);
  assert.doesNotMatch(script, /customerId|previewVersionId|projectId/);
});

test("securitygrenzen lekken geen activatiegegevens naar logs", () => {
  assert.doesNotMatch(script, /console\./);
  assert.doesNotMatch(endpoint, /console\.(?:log|info|error)\([^\n]*(?:token|email|state|body)/i);
  assert.match(endpoint, /Deliberately never log tokens, state, request bodies, e-mail addresses/);
  assert.doesNotMatch(endpoint, /oneTimeLink|actionLink/);
});

test("toegankelijkheid en reduced motion zijn expliciet", () => {
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(styles, /min-height:44px/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /:focus-visible/);
  assert.match(script, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
});

test("DCA-0 en DCA-1 blijven de bron van invitation- en exchangesecurity", () => {
  assert.match(migration, /public\.dca_0_assert_service_role\(\)/);
  assert.match(migration, /public\.client_activation_exchange_sessions/);
  assert.match(migration, /public\.client_activation_links/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.cx2_magic_link_challenges from public, anon, authenticated/);
});
