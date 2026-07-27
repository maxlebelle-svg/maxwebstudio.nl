const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const signhost = require("../functions/services/signhostService");
const postback = require("../functions/signhost-postback")._test;
const smoke = require("../functions/admin-signhost-smoke-test")._test;

test("Signhost credentials remain server-side and the signing model is owner scoped", () => {
  const migration = read("supabase/migrations/20260727090000_staff_signhost_foundation.sql");
  const endpoint = read("functions/partner-signing.js");
  const client = read("public/src/partner/partner-onboarding.js");
  assert.match(migration, /create table public\.staff_signing_transactions/);
  assert.match(migration, /profile_id = public\.current_profile_id\(\)/);
  assert.match(endpoint, /SIGNABLE_REVIEW_STATUSES = new Set\(\["internal_approved", "legally_reviewed"\]\)/);
  assert.match(endpoint, /SIGNING_TEMPLATE_NOT_APPROVED/);
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

test("Signhost agreement metadata assigns partner details and both signatures", () => {
  const metadata = signhost.buildAgreementMetadata({ Signers:[
    { Id:"SignerPartner", Email:"partner@example.nl" },
    { Id:"SignerMax", Email:"max@maxwebstudio.nl" },
  ] }, { signerEmail:"partner@example.nl", countersignerEmail:"max@maxwebstudio.nl" });
  assert.deepEqual(metadata.Signers.SignerPartner.FormSets, ["PartnerDetails", "PartnerSignature"]);
  assert.deepEqual(metadata.Signers.SignerMax.FormSets, ["MaxSignature"]);
  assert.equal(metadata.FormSets.PartnerDetails.Bedrijfsnaam.Location.PageNumber, 2);
  assert.deepEqual(metadata.FormSets.PartnerSignature.Handtekening.Location, { PageNumber:7, Left:365, Top:675, Width:125, Height:30 });
  assert.deepEqual(metadata.FormSets.MaxSignature.Handtekening.Location, { PageNumber:7, Left:115, Top:675, Width:125, Height:30 });
});

test("Signhost transaction uploads form metadata before the PDF", () => {
  const endpoint = read("functions/partner-signing.js");
  assert.match(endpoint, /await uploadFileMetadata[\s\S]+await uploadPdf[\s\S]+await startTransaction/);
});

test("The deployed Signhost template is a real unsigned PDF", () => {
  const pdf = fs.readFileSync(path.join(root, "public/documents/max-webstudio-overeenkomst-van-opdracht-salespartner-v2-signhost-unsigned.pdf"));
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(pdf.subarray(-2048).toString("latin1"), /%%EOF/);
  assert.doesNotMatch(pdf.toString("latin1"), /FormXob\.edf35082acc3c16872083ee79456e2ad/);
});

test("Signed artifacts stay quarantined until malware scanning succeeds", () => {
  const endpoint = read("functions/signhost-postback.js");
  assert.match(endpoint, /status:"quarantined"/);
  assert.match(endpoint, /scan_status:"pending"/);
  assert.equal(postback.eventName("signed_pending_scan"), "signing.signed");
  assert.doesNotThrow(() => postback.assertPdf(Buffer.from("%PDF-1.4\nbody\n%%EOF"), "testdocument"));
  assert.throws(() => postback.assertPdf(Buffer.from("not a pdf"), "testdocument"), /geldige testdocument/i);
});

test("superadmin smoke tests are isolated from the legal agreement workflow", () => {
  const migration = read("supabase/migrations/20260727120000_signhost_smoke_test.sql");
  const endpoint = read("functions/admin-signhost-smoke-test.js");
  const webhook = read("functions/signhost-postback.js");
  const adminPage = read("public/admin-medewerkers.html");
  const adminClient = read("public/src/staff/admin-staff-directory.js");
  assert.match(migration, /create table public\.signhost_smoke_tests/);
  assert.match(migration, /has_app_role\(array\['super_admin'\]\)/);
  assert.match(endpoint, /allowedRoles:\["super_admin"\]/);
  assert.match(endpoint, /SIGNHOST_SMOKE_TEST_ENABLED/);
  assert.match(endpoint, /SIGNHOST_SMOKE_TEST_ALLOWED_EMAILS/);
  assert.match(read("functions/services/signhostService.js"), /TECHNISCHE TEST - geen overeenkomst/);
  assert.match(webhook, /signhost_smoke_tests/);
  assert.match(webhook, /signhost-auditbewijs\.pdf/);
  assert.match(adminPage, /Signhost end-to-endcontrole/);
  assert.match(adminPage, /id="signhost-smoke-card"[^>]*hidden/);
  assert.match(adminClient, /admin-signhost-smoke-test/);
  assert.match(adminClient, /card\.hidden=!data\.enabled/);
  assert.equal(smoke.smokeEnabled("max@maxwebstudio.nl", { SIGNHOST_SMOKE_TEST_ENABLED:"true", SIGNHOST_SMOKE_TEST_ALLOWED_EMAILS:"max@maxwebstudio.nl" }), true);
  assert.equal(smoke.smokeEnabled("other@example.nl", { SIGNHOST_SMOKE_TEST_ENABLED:"true", SIGNHOST_SMOKE_TEST_ALLOWED_EMAILS:"max@maxwebstudio.nl" }), false);
});

test("smoke-test metadata contains exactly one visible signature field", () => {
  const metadata = signhost.buildSmokeTestMetadata({ Signers:[{ Id:"SmokeSigner", Email:"max@maxwebstudio.nl" }] }, { signerEmail:"max@maxwebstudio.nl" });
  assert.deepEqual(metadata.Signers.SmokeSigner.FormSets, ["SmokeTestSignature"]);
  assert.deepEqual(metadata.FormSets.SmokeTestSignature.Handtekening.Location, { PageNumber:1, Left:115, Top:545, Width:365, Height:45 });
  assert.equal(postback.smokeStatus("signed_pending_scan"), "signed");
});

test("the automated smoke-test asset is explicitly non-binding and checksum pinned", () => {
  const pdf = fs.readFileSync(path.join(root, "public/documents/max-webstudio-signhost-technische-test.pdf"));
  assert.equal(pdf.subarray(0,5).toString("ascii"), "%PDF-");
  assert.match(pdf.subarray(-2048).toString("latin1"), /%%EOF/);
  assert.equal(crypto.createHash("sha256").update(pdf).digest("hex"), smoke.TEMPLATE_SHA256);
});
