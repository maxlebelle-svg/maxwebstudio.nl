const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "admin-email-studio.html"), "utf8");

test("Email Studio uses one global lead and customer combobox instead of legacy localStorage", () => {
  assert.match(html, /role="combobox"/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /purpose:\s*"mail-recipient"/);
  assert.match(html, /type:\s*"all"/);
  assert.doesNotMatch(html, /maxwebstudioLeadFinderLeads|manual-lead-select|leads\[0\]/);
  assert.match(html, /relationshipType:\s*lead\.relationshipType/);
  assert.match(html, /relationshipId:\s*lead\.relationshipId/);
});

test("active relationship only preselects and manual selection never changes workspace context", () => {
  assert.match(html, /ActiveRelationship\?\.whenReady/);
  assert.match(html, /manualRecipientSelection/);
  assert.match(html, /chooseRecipient\(data\.result, \{ manual: false \}\)/);
  assert.doesNotMatch(html, /ActiveRelationship\.(?:setActiveRelationship|clearActiveRelationship)\(/);
});

test("recipient list is bounded, accessible and protected against stale searches", () => {
  assert.match(html, /max-height:\s*320px/);
  assert.match(html, /overflow-y:\s*auto/);
  assert.match(html, /ArrowDown/);
  assert.match(html, /ArrowUp/);
  assert.match(html, /Escape/);
  assert.match(html, /AbortController/);
  assert.match(html, /requestSequence !== recipientRequestSequence/);
  assert.match(html, /setTimeout\(\(\) => loadRecipients\(\), 250\)/);
  assert.match(html, /Meer laden/);
});

test("send is manual, canonical and double-click guarded", () => {
  assert.match(html, /if \(sendInFlight\) return/);
  assert.match(html, /sendInFlight = true/);
  assert.match(html, /idempotencyKey:/);
  assert.match(html, /readonly/);
  assert.match(html, /Er wordt nooit automatisch verzonden/);
});
