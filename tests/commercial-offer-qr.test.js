const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const qr = require("../functions/commercial-offer-qr");

test("signed commercial QR renders the exact selected demo target", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const secret = "test-commercial-qr-secret";
    const target = "https://maxwebstudio.nl/preview/emmeloord-rotishop";
    process.env.SUPABASE_SERVICE_ROLE_KEY = secret;
    const signature = crypto.createHmac("sha256", secret).update(target).digest("hex");
    const result = await qr.handler({ httpMethod: "GET", queryStringParameters: { target, signature } });
    assert.equal(result.statusCode, 200);
    assert.match(result.headers["Content-Type"], /image\/svg\+xml/);
    assert.match(result.body, /<svg/);
    assert.match(result.body, /#06121f/i);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("commercial QR rejects tampering and unsafe targets", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-commercial-qr-secret";
    const invalid = await qr.handler({ httpMethod: "GET", queryStringParameters: { target: "https://evil.example", signature: "0".repeat(64) } });
    assert.equal(invalid.statusCode, 404);
    assert.equal(qr._private.safeTarget("javascript:alert(1)"), "");
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});
