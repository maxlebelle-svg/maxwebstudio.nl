const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("definitive dispatch binds the verified server recipient before sending", () => {
  const admin = read("functions/admin-commercial-offers.js");
  assert.match(admin, /if \(signingUrl\) await bindSigningRecipient\(config, reservation\.dispatchId, recipient\)/);
  assert.match(admin, /signer_email: recipient\.toLowerCase\(\)/);
  assert.match(admin, /Prefer: "return=representation"/);
  assert.match(admin, /signer_email: null/);
});

test("revocation invalidates legacy signing links before optional recipient cleanup", () => {
  const admin = read("functions/admin-commercial-offers.js");
  const revokeStart = admin.indexOf("async function revokeInterest");
  const revokeEnd = admin.indexOf("async function loadMailContext", revokeStart);
  const revoke = admin.slice(revokeStart, revokeEnd);
  const invalidateAt = revoke.indexOf('JSON.stringify({ revoked_at: new Date().toISOString() })');
  const cleanupAt = revoke.indexOf('JSON.stringify({ signer_email: null })');
  assert.ok(invalidateAt >= 0, "revocation must update the legacy-safe revoked_at field");
  assert.ok(cleanupAt > invalidateAt, "recipient cleanup must happen only after the link is invalidated");
  assert.match(revoke, /catch \(error\)[\s\S]*recipient cleanup deferred/);
});

test("public signing uses only the token-bound recipient and clears it", () => {
  const signing = read("functions/commercial-offer-signing.js");
  assert.match(signing, /const signerEmail=clean\(access\.signer_email\)\.toLowerCase\(\)/);
  assert.match(signing, /signer_email_sha256:sha256\(details\.signerEmail\)/);
  assert.match(signing, /signerEmail:details\.signerEmail/);
  assert.match(signing, /started_at:new Date\(\)\.toISOString\(\),signer_email:null/);
  assert.match(signing, /if\(!transactions\[0\]&&!validEmail\(signerEmail\)\)/);
  assert.match(signing, /if\(accessTokenId\)await patch\(failureContext,"commercial_offer_signing_access_tokens",accessTokenId,\{signer_email:null\}\)/);
  assert.doesNotMatch(signing, /input\.signerEmail/);
  assert.doesNotMatch(signing, /details\.relationship\.email/);
});

test("recipient binding migration keeps plaintext private and short-lived", () => {
  const migration = read("supabase/migrations/20260803233000_bind_signing_recipient_to_access_token.sql");
  assert.match(migration, /add column if not exists signer_email text/i);
  assert.match(migration, /signer_email = lower\(btrim\(signer_email\)\)/i);
  assert.match(migration, /private verified dispatch recipient/i);
  assert.doesNotMatch(migration, /grant .*anon|grant .*authenticated/i);
});
