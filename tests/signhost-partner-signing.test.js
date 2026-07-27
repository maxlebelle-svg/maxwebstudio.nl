const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const signhost = require("../functions/services/signhostService");
const postback = require("../functions/signhost-postback")._test;

test("Signhost credentials remain server-side and the signing model is owner scoped", () => {
  const migration = read("supabase/migrations/20260727090000_staff_signhost_foundation.sql");
  const endpoint = read("functions/partner-signing.js");
  const client = read("public/src/partner/partner-onboarding.js");
  assert.match(migration, /create table public\.staff_signing_transactions/);
  assert.match(migration, /profile_id = public\.current_profile_id\(\)/);
  assert.match(endpoint, /review_status !== "legally_reviewed"/);
  assert.doesNotMatch(client, /SIGNHOST_(?:APP_KEY|USER_TOKEN)/);
  assert.match(client, /\/\.netlify\/functions\/partner-signing/);
});

test("Signhost postbacks require both authorization and the documented checksum", () => {
  const id = "b10ae331-af78-4e79-a39e-5b64693b6b68";
  const status = 30;
  const secret = "shared-secret";
  const checksum = crypto.createHash("sha1").update(`${id}||${status}|${secret}`).digest("hex");
  const config = { SIGNHOST_POSTBACK_AUTHORIZATION:"Bearer staging-secret", SIGNHOST_POSTBACK_SHARED_SECRET:secret };
  assert.deepEqual(signhost.validatePostback({ Id:id, Status:status, Checksum:checksum }, { authorization:"Bearer staging-secret" }, config), {
    valid:true, id, status, mappedStatus:"signed_pending_scan",
  });
  assert.equal(signhost.validatePostback({ Id:id, Status:status, Checksum:checksum }, { authorization:"wrong" }, config).valid, false);
});

test("SMS verification normalizes Dutch mobile numbers and rejects unsafe input", () => {
  assert.equal(signhost.normalizePhone("06 12 34 56 78"), "+31612345678");
  assert.equal(signhost.normalizePhone("+31 (0)6 1234 5678"), "+31612345678");
  assert.deepEqual(signhost.verification("PhoneNumber", "+31612345678", "Test Partner"), { Type:"PhoneNumber", Number:"+31612345678", SecureDownload:true });
  assert.throws(() => signhost.verification("PhoneNumber", "06123", "Test Partner"), /mobiel telefoonnummer/i);
});

test("Signed artifacts stay quarantined until malware scanning succeeds", () => {
  const endpoint = read("functions/signhost-postback.js");
  assert.match(endpoint, /status:"quarantined"/);
  assert.match(endpoint, /scan_status:"pending"/);
  assert.equal(postback.eventName("signed_pending_scan"), "signing.signed");
  assert.doesNotThrow(() => postback.assertPdf(Buffer.from("%PDF-1.4\nbody\n%%EOF"), "testdocument"));
  assert.throws(() => postback.assertPdf(Buffer.from("not a pdf"), "testdocument"), /geldige testdocument/i);
});
