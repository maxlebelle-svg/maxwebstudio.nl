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
