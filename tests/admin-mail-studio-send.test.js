const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("../functions/admin-mail-studio-send");

const ACTOR = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";

test("mail send resolves the canonical current email and ignores a manipulated browser address", async () => {
  const previousFetch = global.fetch;
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) return response(200, { id: ACTOR, email: "admin@example.test" });
    if (String(url).includes("/rest/v1/profiles")) return response(200, [{ id: ACTOR, role: "admin", status: "active" }]);
    return response(404, {});
  };
  let sentPayload;
  const handler = _test.createHandler({
    fetchImpl: async () => response(200, [{ id: LEAD, company_name: "Lisanne Post", contact_name: "Lisanne", email: "lisanne@safe.example", lead_status: "new" }]),
    sendEmail: async (payload) => { sentPayload = payload; return { sent: true, id: "email-1", logId: "log-1" }; },
  });
  try {
    const result = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({
        relationshipType: "lead",
        relationshipId: LEAD,
        to: "attacker@example.test",
        subject: "Veilig onderwerp",
        html: validHtml(),
        idempotencyKey: "mail-studio:test",
      }),
    });
    assert.equal(result.statusCode, 200);
    assert.equal(sentPayload.to, "lisanne@safe.example");
    assert.equal(sentPayload.leadId, LEAD);
    assert.equal(sentPayload.customerId, null);
    assert.equal(sentPayload.idempotencyKey, "mail-studio:test");
    assert.equal(JSON.parse(result.body).recipient.email, "lisanne@safe.example");
  } finally {
    global.fetch = previousFetch;
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test("missing email and invalid relationships are not mailbar", async () => {
  const previous = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  try {
    await assert.rejects(
      _test.resolveRecipient({ relationshipType: "customer", relationshipId: LEAD }, async () => response(200, [{ id: LEAD, company: "Geen mail" }])),
      /geen geldig e-mailadres/i,
    );
    assert.equal(_test.isUnavailable({ is_demo: true, email: "demo@example.test" }), true);
    assert.equal(_test.isUnavailable({ environment: "test", email: "test@example.test" }), true);
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

function validHtml() {
  return '<!doctype html><meta name="supported-color-schemes"><style>@media (max-width: 620px){}</style><img src="max-webstudio-logo-mark.svg"><a class="mws-cta">cta</a> info@maxwebstudio.nl wa.me/31851302326 instagram.com/maxwebstudio.nl linkedin.com/company/130444905';
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
