const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname,"../supabase/migrations/20260727143000_max_ai_whatsapp_transport.sql"),"utf8");

test("WhatsApp transport exposes only bounded service-role functions", () => {
  for (const name of ["mws_ingest_whatsapp_message_v1","mws_apply_whatsapp_status_v1","mws_queue_whatsapp_text_v1","mws_finalize_whatsapp_text_v1"]) {
    assert.match(source, new RegExp(`create or replace function public\\.${name}`));
    assert.match(source, new RegExp(`revoke all on function public\\.${name}[\\s\\S]+from public,anon,authenticated`));
  }
});

test("incoming provider ids and employee client ids are idempotent", () => {
  assert.match(source, /where provider_message_id = btrim\(p_provider_message_id\)/);
  assert.match(source, /conversation_messages_whatsapp_client_id_idx/);
  assert.match(source, /on conflict \(\(metadata ->> 'clientMessageId'\)\)/);
});

test("phone matching merges a unique known lead while ambiguity creates no false match", () => {
  assert.match(source, /public\.mws_normalize_phone\(phone\) = v_normalized_phone/);
  assert.match(source, /if v_lead_count <> 1 then v_lead_id := null/);
  assert.match(source, /where lead_id = v_lead_id and status not in \('closed','spam'\)/);
});

test("delivery status only progresses and accepted sends stay queued until Meta confirms", () => {
  assert.match(source, /v_status = 'sent' and v_message\.delivery_status in \('delivered','read'\)/);
  assert.match(source, /v_status = 'delivered' and v_message\.delivery_status = 'read'/);
  assert.match(source, /delivery_status = case when p_sent then 'queued' else 'failed' end/);
  assert.match(source, /case when p_sent then 'message_queued' else 'message_failed' end/);
});

test("message content remains immutable except one-time provider id reconciliation", () => {
  assert.match(source, /old\.provider_message_id is not null/);
  assert.match(source, /new\.body is distinct from old\.body/);
  assert.match(source, /new\.metadata is distinct from old\.metadata/);
});
