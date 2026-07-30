const test = require("node:test");
const assert = require("node:assert/strict");

const publication = require("../functions/admin-preview-publication");
const { buildFoodDemoShareMail } = require("../functions/services/leadDemoInvitationTemplate");

const IDS = {
  lead: "11111111-1111-4111-8111-111111111111",
  journey: "22222222-2222-4222-8222-222222222222",
  action: "33333333-3333-4333-8333-333333333333",
};

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

async function run(options = {}) {
  const calls = [];
  const mailCalls = [];
  const previousFetch = global.fetch;
  const previousEnv = { ...process.env };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  global.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, method: init.method || "GET", query: parsed.searchParams });
    if (parsed.pathname.endsWith("/demo_journeys")) return response(200, [{
      id: IDS.journey,
      lead_id: options.wrongRelationship ? "44444444-4444-4444-8444-444444444444" : IDS.lead,
      customer_id: null,
      business_name: options.wrongDemo ? "Andere onderneming" : "Silverado online roti shop",
      website_url: "",
      preview_url: "/preview/emmerloord-rotishop",
    }]);
    if (parsed.pathname.endsWith("/leads")) return response(200, [{ id: IDS.lead, company_name: "Silverado", contact_name: "Ravi", email: options.email === undefined ? "ravi@example.test" : options.email }]);
    throw new Error(`Unexpected ${init.method || "GET"} ${url}`);
  };
  try {
    const result = await publication._private.shareSilveradoFoodDemoEmail({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service",
      admin: { id: "admin", email: "admin@example.test", role: "super_admin" },
      sendMail: async (input) => { mailCalls.push(input); return { sent: true, id: "mail-1", logId: "log-1" }; },
    }, {
      relationshipType: "lead",
      relationshipId: IDS.lead,
      demoJourneyId: IDS.journey,
      actionKey: IDS.action,
      recipientEmail: options.recipientEmail,
      storefrontUrl: "https://attacker.example/storefront",
      restaurantPortalUrl: "https://attacker.example/admin",
    });
    return { calls, mailCalls, result, error: null };
  } catch (error) {
    return { calls, mailCalls, result: null, error };
  } finally {
    global.fetch = previousFetch;
    process.env = previousEnv;
  }
}

test("restaurant-demo-mail bevat beide vaste links en de QR-code", () => {
  const mail = buildFoodDemoShareMail({
    contactName: "Ravi",
    companyName: "Silverado",
    storefrontUrl: "https://max-webstudio-food-demo.netlify.app/food/silverado-roti-shop-emmeloord",
    restaurantPortalUrl: "https://max-webstudio-food-demo.netlify.app/admin/food",
    qrCodeUrl: "https://maxwebstudio.nl/assets/food/silverado/silverado-demo-qr.svg",
  });
  assert.match(mail.html, /Bekijk de bestelwebsite/);
  assert.match(mail.html, /Open het restaurantportaal/);
  assert.match(mail.html, /silverado-demo-qr\.svg/);
  assert.match(mail.text, /Voorkant voor uw klanten/);
  assert.match(mail.text, /Restaurantportaal voor bestellingen en beheer/);
});

test("mailactie gebruikt alleen server-side toegestane Silverado-links", async () => {
  const state = await run();
  assert.equal(state.error, null);
  assert.equal(state.result.statusCode, 200);
  assert.equal(state.mailCalls.length, 1);
  assert.equal(state.mailCalls[0].templateKey, "silverado_food_demo_share");
  assert.equal(state.mailCalls[0].to, "ravi@example.test");
  assert.match(state.mailCalls[0].html, /max-webstudio-food-demo\.netlify\.app\/food\/silverado-roti-shop-emmeloord/);
  assert.match(state.mailCalls[0].html, /max-webstudio-food-demo\.netlify\.app\/admin\/food/);
  assert.doesNotMatch(state.mailCalls[0].html, /attacker\.example/);
});

test("handmatig e-mailadres geldt alleen als ontvanger van deze verzending", async () => {
  const state = await run({ email: "", recipientEmail: "Handmatig@Example.test" });
  assert.equal(state.error, null);
  assert.equal(state.mailCalls.length, 1);
  assert.equal(state.mailCalls[0].to, "handmatig@example.test");
  assert.equal(state.mailCalls[0].metadata.recipientSource, "manual");
  assert.equal(state.calls.filter((call) => call.method !== "GET").length, 0);
});

test("mailactie stopt fail-closed bij verkeerde relatie, demo of e-mail", async () => {
  const relationship = await run({ wrongRelationship: true });
  assert.equal(relationship.error.code, "FOOD_DEMO_RELATIONSHIP_MISMATCH");
  assert.equal(relationship.mailCalls.length, 0);

  const demo = await run({ wrongDemo: true });
  assert.equal(demo.error.code, "FOOD_DEMO_NOT_ALLOWLISTED");
  assert.equal(demo.mailCalls.length, 0);

  const recipient = await run({ email: "" });
  assert.equal(recipient.error.code, "FOOD_DEMO_SHARE_EMAIL_INVALID");
  assert.equal(recipient.mailCalls.length, 0);

  const invalidManualRecipient = await run({ email: "stored@example.test", recipientEmail: "geen-adres" });
  assert.equal(invalidManualRecipient.error.code, "FOOD_DEMO_SHARE_EMAIL_INVALID");
  assert.equal(invalidManualRecipient.mailCalls.length, 0);
});
