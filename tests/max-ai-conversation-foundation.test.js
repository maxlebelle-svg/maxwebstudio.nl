const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260727110000_max_ai_conversation_foundation.sql");
const configPath = path.join(root, "public/src/config/conversations.js");
const migration = fs.readFileSync(migrationPath, "utf8");
const config = fs.readFileSync(configPath, "utf8");

function compact(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

test("conversation foundation creates only the four approved channel-neutral tables", () => {
  const tables = [...migration.matchAll(/create table public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
  assert.deepEqual(tables, [
    "conversations",
    "conversation_channels",
    "conversation_messages",
    "conversation_events",
  ]);
});

test("website and WhatsApp share one conversation contract", () => {
  const sql = compact(migration);
  assert(sql.includes("active_channel in ('web','whatsapp')"));
  assert(sql.includes("channel in ('web','whatsapp')"));
  assert(sql.includes("unique (channel, external_thread_id)"));
  assert(sql.includes("handoff_token_hash"));
  assert(sql.includes("plaintext website-to-whatsapp handoff tokens must never be stored"));
});

test("bot rollout supports shadow, assisted, autopilot and immediate pause", () => {
  const sql = compact(migration);
  for (const mode of ["shadow", "assisted", "autopilot", "paused"]) {
    assert(sql.includes(`'${mode}'`));
    assert(config.includes(mode.toUpperCase()));
  }
  assert(config.includes("canBotSendWithoutReview"));
  assert(config.includes("isHumanTakeoverMode"));
});

test("public clients cannot write conversation data directly", () => {
  const sql = compact(migration);
  for (const table of ["conversations", "conversation_channels", "conversation_messages", "conversation_events"]) {
    assert(sql.includes(`revoke all on table public.${table} from public, anon, authenticated, service_role`));
    assert(sql.includes(`grant select on table public.${table} to authenticated`));
  }
  assert.equal(/grant\s+(insert|update|delete|all).*\s+to\s+authenticated/gi.test(migration), false);
});

test("assigned employees see only their conversations while managers retain oversight", () => {
  const sql = compact(migration);
  assert(sql.includes("public.has_app_role(array['super_admin','admin','sales_manager'])"));
  assert(sql.includes("public.has_app_role(array['sales_partner','designer','developer','support'])"));
  assert(sql.includes("c.assigned_user_id = auth.uid()"));
  assert(sql.includes("using (public.can_read_conversation(id))"));
  assert(sql.includes("using (public.can_read_conversation(conversation_id))"));
});

test("message content and lifecycle audit events cannot be rewritten", () => {
  const sql = compact(migration);
  assert(sql.includes("conversation message content is immutable after insertion"));
  assert(sql.includes("conversation messages cannot be deleted directly"));
  assert(sql.includes("before update or delete on public.conversation_messages"));
  assert(sql.includes("conversation events are append-only"));
  assert(sql.includes("before update or delete on public.conversation_events"));
  assert(sql.includes("octet_length(convert_to(payload::text, 'utf8')) <= 65536"));
});

test("the service backend has no broad delete grant", () => {
  const sql = compact(migration);
  assert.equal(/grant\s+[^;]*delete[^;]*to\s+service_role/gi.test(migration), false);
  assert(sql.includes("grant select, insert, update on table public.conversation_messages to service_role"));
  assert(sql.includes("grant select, insert on table public.conversation_events to service_role"));
});

test("AI messages carry model, prompt, confidence and approval provenance", () => {
  const sql = compact(migration);
  for (const field of ["ai_generated", "ai_model", "prompt_version", "confidence", "approval_status", "approved_by_auth_user_id"]) {
    assert(sql.includes(field), `${field} must be persisted`);
  }
  assert(sql.includes("sender_type <> 'bot' or ai_generated"));
  assert(sql.includes("confidence is null or confidence between 0 and 1"));
});
