const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const { createHandler, extractNotifications, verifySignature } = require("../functions/whatsapp-webhook")._private;

const secret = "meta-app-secret-test-value";
const payload = {
  object: "whatsapp_business_account",
  entry: [{
    id: "waba-1",
    changes: [{
      field: "messages",
      value: {
        metadata: { display_phone_number: "31851302326", phone_number_id: "phone-id-1" },
        contacts: [{ wa_id: "31612345678", profile: { name: "Ada" } }],
        messages: [{ from: "31612345678", id: "wamid.inbound", timestamp: "1785182400", type: "text", text: { body: "Hoi Max" } }],
        statuses: [{ id: "wamid.outbound", status: "delivered", timestamp: "1785182460", recipient_id: "31612345678" }],
      },
    }],
  }],
};

function signedEvent(body = JSON.stringify(payload)) {
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(Buffer.from(body)).digest("hex")}`;
  return { httpMethod:"POST", headers:{ "x-hub-signature-256":signature }, body };
}

test("Meta webhook verification returns the challenge only for the configured token", async () => {
  const handler = createHandler({ env:{ WHATSAPP_VERIFY_TOKEN:"verify-me" } });
  const accepted = await handler({ httpMethod:"GET", queryStringParameters:{ "hub.mode":"subscribe", "hub.verify_token":"verify-me", "hub.challenge":"12345" } });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body, "12345");
  const rejected = await handler({ httpMethod:"GET", queryStringParameters:{ "hub.mode":"subscribe", "hub.verify_token":"wrong", "hub.challenge":"12345" } });
  assert.equal(rejected.statusCode, 403);
});

test("signature validation uses the exact raw body", () => {
  const raw = Buffer.from(JSON.stringify(payload));
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.equal(verifySignature(raw, signature, secret), true);
  assert.equal(verifySignature(Buffer.from(`${raw} `), signature, secret), false);
  assert.equal(verifySignature(raw, "sha256=invalid", secret), false);
});

test("payload extraction normalizes inbound messages and delivery statuses", () => {
  const items = extractNotifications(payload);
  assert.equal(items.length, 2);
  assert.deepEqual({ kind:items[0].kind, phoneNumberId:items[0].phoneNumberId, providerMessageId:items[0].providerMessageId, displayName:items[0].displayName, body:items[0].body }, {
    kind:"message", phoneNumberId:"phone-id-1", providerMessageId:"wamid.inbound", displayName:"Ada", body:"Hoi Max",
  });
  assert.deepEqual({ kind:items[1].kind, providerMessageId:items[1].providerMessageId, status:items[1].status }, { kind:"status", providerMessageId:"wamid.outbound", status:"delivered" });
});

test("valid signed webhook persists every supported notification", async () => {
  const calls = [];
  const handler = createHandler({
    env:{ WHATSAPP_APP_SECRET:secret, WHATSAPP_PHONE_NUMBER_ID:"phone-id-1", SUPABASE_URL:"https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY:"service", URL:"https://deploy.example.netlify.app" },
    logger:{ info:()=>{}, error:()=>{} },
    fetchImpl:async (url,options) => { calls.push({url,options});if(url.includes("mws_ingest_whatsapp_message_v1"))return{ok:true,json:async()=>({status:"resolved",conversationId:"10000000-0000-4000-8000-000000000001",messageId:"20000000-0000-4000-8000-000000000002"})};return { ok:true, json:async()=>({status:"resolved"}) }; },
  });
  const result = await handler(signedEvent());
  assert.equal(result.statusCode, 200);
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /mws_ingest_whatsapp_message_v1$/);
  assert.match(calls[1].url, /whatsapp-autopilot-background$/);
  assert.match(calls[2].url, /mws_apply_whatsapp_status_v1$/);
  assert.match(calls[1].options.headers["x-max-ai-signature"], /^sha256=[a-f0-9]{64}$/);
  const inbound = JSON.parse(calls[0].options.body);
  assert.equal(inbound.p_contact_wa_id, "31612345678");
  assert.equal(inbound.p_body, "Hoi Max");
});

test("unsigned or wrongly signed webhook is rejected before parsing or storage", async () => {
  let calls = 0;
  const handler = createHandler({ env:{ WHATSAPP_APP_SECRET:secret }, fetchImpl:async()=>{ calls += 1; } });
  const result = await handler({ httpMethod:"POST", headers:{}, body:"not-json" });
  assert.equal(result.statusCode, 401);
  assert.equal(calls, 0);
});

test("storage failure returns a retryable response without logging message content", async () => {
  const logs = [];
  const handler = createHandler({
    env:{ WHATSAPP_APP_SECRET:secret, SUPABASE_URL:"https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY:"service" },
    logger:{ info:()=>{}, error:(...args)=>logs.push(args) },
    fetchImpl:async()=>({ ok:false, json:async()=>({ message:"database details" }) }),
  });
  const result = await handler(signedEvent());
  assert.equal(result.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(logs), /Hoi Max|31612345678/);
});
