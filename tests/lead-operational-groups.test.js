const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const leads = require("../functions/admin-leads");
const serverSource = fs.readFileSync(path.resolve(__dirname, "../functions/admin-leads.js"), "utf8");
const salesSource = fs.readFileSync(path.resolve(__dirname, "../public/admin-sales.html"), "utf8");
const leadGeneratorSource = fs.readFileSync(path.resolve(__dirname, "../public/admin-lead-generator.html"), "utf8");

test("de vier operationele groepen gebruiken uitsluitend de bestaande gespreksuitkomst", () => {
  for (const outcome of ["interested", "not_interested", "voicemail_left", "callback_requested"]) {
    assert.equal(leads._test.operationalLeadGroup({ lastCallOutcome: outcome }), outcome);
  }
  assert.equal(leads._test.operationalLeadGroup({ leadStatus: "interesting" }), "");
});

test("gespreksuitkomsten zetten de afgesproken lifecycle en opvolging", () => {
  assert.deepEqual(leads._test.callOutcomes.get("interested"), { label: "Geïnteresseerd", status: "interesting", nextActionType: "follow_up", defaultBusinessDays: 2 });
  assert.equal(leads._test.callOutcomes.get("not_interested").status, "lost");
  assert.equal(leads._test.callOutcomes.get("voicemail_left").defaultBusinessDays, 2);
  assert.equal(leads._test.callOutcomes.get("callback_requested").status, "follow_up");
});

test("terugbelverzoek vereist een expliciete datum en tijd", () => {
  assert.match(serverSource, /lastCallOutcome === "callback_requested" && !nextActionAt/);
  assert.match(serverSource, /Kies een datum en tijd voor de terugbelafspraak/);
});

test("timeline bewaart actor, tijdstip en oude en nieuwe waarden", () => {
  for (const token of ["actorUserId", "occurredAt: now", "previousOutcome", "previousLeadStatus", "leadStatus: nextStatus"]) assert.match(serverSource, new RegExp(token));
});

test("Sales Cockpit toont exacte groepen en telt en filtert zonder vrije tekst", () => {
  for (const outcome of ["interested", "not_interested", "voicemail_left", "callback_requested"]) {
    assert.match(salesSource, new RegExp(`data-lead-outcome-filter="${outcome}"`));
  }
  assert.match(salesSource, /filter\.type\.startsWith\("outcome:"\)/);
  assert.match(salesSource, /lead\.lastCallOutcome/);
});

test("contactregistratie biedt Geïnteresseerd naast de bestaande uitkomsten", () => {
  assert.match(leadGeneratorSource, /"interested", "Geïnteresseerd"/);
});
