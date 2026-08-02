const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const customerAccount = require("../functions/admin-customer-welcome-email");
const source = fs.readFileSync(path.resolve(__dirname, "../functions/admin-customer-welcome-email.js"), "utf8");

test("customer accountstatus onderscheidt actief, verzonden, verlopen en fout", () => {
  assert.equal(customerAccount._test.invitationStatus({ status: "invited", metadata: { accountInvitationStatus: "link_expired" } }), "link_expired");
  assert.equal(customerAccount._test.invitationStatus({ status: "invited", metadata: { accountInvitationStatus: "send_failed" } }), "send_failed");
  assert.equal(customerAccount._test.invitationStatus({ status: "invited", metadata: { accountInvitationStatus: "sent" } }), "sent");
  assert.equal(customerAccount._test.invitationStatus({ status: "draft", metadata: {} }), "not_invited");
});

test("testomgeving kan nooit een echte customer-accountmail versturen", () => {
  const previous = { APP_ENV: process.env.APP_ENV, CONTEXT: process.env.CONTEXT, NODE_ENV: process.env.NODE_ENV };
  Object.assign(process.env, { APP_ENV: "test", CONTEXT: "dev", NODE_ENV: "test" });
  try { assert.equal(customerAccount._test.isProductionEnvironment(), false); }
  finally { Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value); }
});

test("customer flow hergebruikt Auth-user en profile en gebruikt provider-idempotentie", () => {
  assert.match(source, /if \(existing\?\.id\) return \{ id: existing\.id, action: "existing"/);
  assert.match(source, /profiles\?on_conflict=auth_user_id/);
  assert.match(source, /resolution=merge-duplicates/);
  assert.match(source, /customer\.account\.invitation:\$\{input\.customerId\}:\$\{actionKey\}/);
  assert.match(source, /linkCustomerAccess\(supabaseUrl, serviceRoleKey, input\.customerId, authUser\.id, profile\.id/);
});

test("customer account wordt expliciet en conflictveilig aan auth en profile gekoppeld", async () => {
  const previousFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (!options.method) return { ok: true, json: async () => [{ id: "customer-1", auth_user_id: null, profile_id: null, portal_status: "prepared" }] };
    return { ok: true, json: async () => [{ id: "customer-1", auth_user_id: "auth-1", profile_id: "profile-1", portal_status: "invited" }] };
  };
  try {
    const linked = await customerAccount._test.linkCustomerAccess("https://example.supabase.co", "service", "customer-1", "auth-1", "profile-1", false);
    assert.equal(linked.id, "customer-1");
    const patch = JSON.parse(calls[1].options.body);
    assert.deepEqual({ authUserId: patch.auth_user_id, profileId: patch.profile_id, portalStatus: patch.portal_status }, { authUserId: "auth-1", profileId: "profile-1", portalStatus: "invited" });
  } finally {
    global.fetch = previousFetch;
  }
});

test("customer accountroute resolveert uitsluitend canonieke customerId en faalt zonder mailbaar record", () => {
  assert.match(source, /resolveCanonicalCustomer\(payload\.customerId \|\| payload\.relationshipId \|\| payload\.id\)/);
  assert.match(source, /rest\/v1\/customers\?select=\*&id=eq/);
  assert.match(source, /Deze klant bestaat niet meer of is niet mailbaar/);
});

test("publieke authstatus lekt geen profilemetadata", () => {
  const safe = customerAccount._test.publicAuthContext({ configured: true, authUserId: "u", profileId: "p", authAction: "existing", accountStatus: "activated", profile: { metadata: { secret: true } } });
  assert.deepEqual(safe, { configured: true, authUserId: "u", profileId: "p", authAction: "existing", accountStatus: "activated" });
});

test("welkomstmail rendert veilige links zonder ontbrekende helper", () => {
  const html = customerAccount._test.buildWelcomeEmailHtml(
    { name: "Michel", company: "Quantumbouw", website: "https://quantumbouw.nl", package: "One Page Website" },
    { subject: "Je klantportaal", loginLink: "https://maxwebstudio.nl/login.html?mode=client&next=%2Fklantportaal.html", buttonLabel: "Account activeren" },
  );
  assert.match(html, /Account activeren/);
  assert.match(html, /https:\/\/maxwebstudio\.nl\/login\.html\?mode=client&amp;next=%2Fklantportaal\.html/);
});
