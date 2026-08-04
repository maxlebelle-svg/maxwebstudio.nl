"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const { createHandler, resolveNextStatus, verifySvixSignature } = require("../functions/resend-webhook")._private;

const secretBytes = Buffer.from("resend-webhook-test-secret-32-bytes!!");
const secret = `whsec_${secretBytes.toString("base64")}`;
const now = 1_785_800_000_000;

function signedEvent(payload, overrides = {}) {
  const body = JSON.stringify(payload);
  const id = overrides.id || "msg_webhook_test_001";
  const timestamp = String(Math.floor((overrides.now || now) / 1000));
  const signature = crypto.createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64");
  return {
    httpMethod: "POST",
    body,
    headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
  };
}

test("Resend webhook rejects missing configuration and forged signatures before storage", async () => {
  let reads = 0;
  const missing = createHandler({ env: {}, now: () => now, findEmailLogByProviderMessageId: async () => { reads += 1; } });
  const missingResponse = await missing(signedEvent({ type: "email.delivered", data: { email_id: "email_1" } }));
  assert.equal(missingResponse.statusCode, 503);
  assert.equal(reads, 0);

  const forged = createHandler({ env: { RESEND_WEBHOOK_SECRET: secret }, now: () => now, findEmailLogByProviderMessageId: async () => { reads += 1; } });
  const forgedEvent = signedEvent({ type: "email.delivered", data: { email_id: "email_1" } });
  forgedEvent.headers["svix-signature"] = "v1,Zm9yZ2Vk";
  const forgedResponse = await forged(forgedEvent);
  assert.equal(forgedResponse.statusCode, 401);
  assert.equal(reads, 0);
});

test("valid signed events update once and record the Svix id", async () => {
  const updates = [];
  const activities = [];
  const log = { id: "log_1", status: "sent", subject: "Testmail", provider_message_id: "email_1", metadata: {} };
  const handler = createHandler({
    env: { RESEND_WEBHOOK_SECRET: secret },
    now: () => now,
    findEmailLogByProviderMessageId: async () => log,
    updateEmailLog: async (id, patch) => { updates.push({ id, patch }); log.status = patch.status; log.metadata = patch.metadata; },
    createActivityEvent: async (event) => { activities.push(event); },
  });
  const event = signedEvent({ type: "email.delivered", created_at: "2026-08-04T01:00:00Z", data: { email_id: "email_1" } });
  const first = await handler(event);
  const duplicate = await handler(event);
  assert.equal(first.statusCode, 200);
  assert.equal(JSON.parse(first.body).processed, true);
  assert.equal(JSON.parse(duplicate.body).duplicate, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.status, "delivered");
  assert.equal(updates[0].patch.metadata.resendEvents[0].svixId, "msg_webhook_test_001");
  assert.equal(activities.length, 1);
});

test("signature timestamps expire and delivery states never regress", () => {
  const event = signedEvent({ type: "email.sent", data: { email_id: "email_1" } }, { now: now - 600_000 });
  const result = verifySvixSignature({ payload: event.body, headers: event.headers, secret, now });
  assert.equal(result.reason, "stale_timestamp");
  assert.equal(resolveNextStatus("opened", "delivered"), "opened");
  assert.equal(resolveNextStatus("bounced", "delivered"), "bounced");
  assert.equal(resolveNextStatus("delivered", "clicked"), "clicked");
});
