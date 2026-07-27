const assert = require("node:assert/strict");
const test = require("node:test");

const { canAccess, createHandler, withinCustomerServiceWindow } = require("../functions/whatsapp-send")._private;

const conversationId = "10000000-0000-4000-8000-000000000001";
const clientMessageId = "20000000-0000-4000-8000-000000000002";
const staffId = "30000000-0000-4000-8000-000000000003";
const now = Date.parse("2026-07-27T20:00:00.000Z");

function request(body = {}) { return { httpMethod:"POST", headers:{ authorization:"Bearer test" }, body:JSON.stringify({ conversationId, clientMessageId, body:"Hoi vanaf Max Webstudio", ...body }) }; }
function env() { return { SUPABASE_URL:"https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY:"service", WHATSAPP_ACCESS_TOKEN:"token", WHATSAPP_PHONE_NUMBER_ID:"phone-id-1", WHATSAPP_GRAPH_API_VERSION:"v25.0" }; }

test("conversation access is global for managers and assignment-bound for employees", () => {
  assert.equal(canAccess({ assigned_user_id:null }, { id:staffId, role:"admin" }), true);
  assert.equal(canAccess({ assigned_user_id:staffId }, { id:staffId, role:"sales_partner" }), true);
  assert.equal(canAccess({ assigned_user_id:"other" }, { id:staffId, role:"sales_partner" }), false);
});

test("free-form WhatsApp text is restricted to the 24-hour customer service window", () => {
  assert.equal(withinCustomerServiceWindow("2026-07-26T20:00:01.000Z", now), true);
  assert.equal(withinCustomerServiceWindow("2026-07-26T20:00:00.000Z", now), false);
  assert.equal(withinCustomerServiceWindow(null, now), false);
});

test("assigned employee queues, sends and reconciles a WhatsApp message", async () => {
  const calls = [];
  const handler = createHandler({
    env:env(), now:()=>now, logger:{info:()=>{},error:()=>{}},
    verifyStaff:async()=>({ success:true, admin:{ id:staffId, role:"sales_partner" } }),
    fetchImpl:async (url,options={}) => {
      calls.push({url,options});
      if (url.includes("/conversations?")) return { ok:true, json:async()=>[{ id:conversationId, assigned_user_id:staffId, status:"open" }] };
      if (url.includes("/conversation_channels?")) return { ok:true, json:async()=>[{ id:"40000000-0000-4000-8000-000000000004", external_contact_id:"31612345678", status:"active", metadata:{ phoneNumberId:"phone-id-1" } }] };
      if (url.includes("/conversation_messages?")) return { ok:true, json:async()=>[{ provider_created_at:"2026-07-27T19:00:00.000Z" }] };
      if (url.endsWith("mws_queue_whatsapp_text_v1")) return { ok:true, json:async()=>({ status:"resolved", messageId:"50000000-0000-4000-8000-000000000005" }) };
      if (url.startsWith("https://graph.facebook.com/")) return { ok:true, json:async()=>({ messaging_product:"whatsapp", messages:[{ id:"wamid.sent" }] }) };
      if (url.endsWith("mws_finalize_whatsapp_text_v1")) return { ok:true, json:async()=>({ status:"resolved", sent:true }) };
      throw new Error(`unexpected ${url}`);
    },
  });
  const result = await handler(request());
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.providerMessageId, "wamid.sent");
  const graph = calls.find((call)=>call.url.startsWith("https://graph.facebook.com/"));
  assert.equal(graph.url, "https://graph.facebook.com/v25.0/phone-id-1/messages");
  const metaBody = JSON.parse(graph.options.body);
  assert.equal(metaBody.to, "31612345678");
  assert.equal(metaBody.text.body, "Hoi vanaf Max Webstudio");
});

test("employee cannot send in another employee's conversation", async () => {
  let graphCalls = 0;
  const handler = createHandler({
    env:env(), now:()=>now,
    verifyStaff:async()=>({ success:true, admin:{ id:staffId, role:"sales_partner" } }),
    fetchImpl:async (url) => {
      if (url.includes("/conversations?")) return { ok:true, json:async()=>[{ id:conversationId, assigned_user_id:"other", status:"open" }] };
      if (url.includes("/conversation_channels?")) return { ok:true, json:async()=>[{ id:"channel", metadata:{phoneNumberId:"phone-id-1"} }] };
      if (url.includes("/conversation_messages?")) return { ok:true, json:async()=>[{provider_created_at:"2026-07-27T19:00:00.000Z"}] };
      if (url.startsWith("https://graph.facebook.com/")) graphCalls += 1;
      return { ok:true, json:async()=>({}) };
    },
  });
  const result = await handler(request());
  assert.equal(result.statusCode, 403);
  assert.equal(graphCalls, 0);
});

test("expired service window requires a template and never calls Meta", async () => {
  let graphCalls = 0;
  const handler = createHandler({
    env:env(), now:()=>now,
    verifyStaff:async()=>({ success:true, admin:{ id:staffId, role:"admin" } }),
    fetchImpl:async (url) => {
      if (url.includes("/conversations?")) return { ok:true, json:async()=>[{id:conversationId,assigned_user_id:null,status:"open"}] };
      if (url.includes("/conversation_channels?")) return { ok:true, json:async()=>[{id:"channel",metadata:{phoneNumberId:"phone-id-1"}}] };
      if (url.includes("/conversation_messages?")) return { ok:true, json:async()=>[{provider_created_at:"2026-07-26T19:59:59.000Z"}] };
      if (url.startsWith("https://graph.facebook.com/")) graphCalls += 1;
      return { ok:true, json:async()=>({}) };
    },
  });
  const result = await handler(request());
  assert.equal(result.statusCode, 409);
  assert.equal(JSON.parse(result.body).code, "WHATSAPP_TEMPLATE_REQUIRED");
  assert.equal(graphCalls, 0);
});
