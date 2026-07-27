const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const adminLeads = require("../functions/admin-leads.js");
const salesSource = fs.readFileSync(path.join(__dirname, "..", "public", "admin-sales.html"), "utf8");

const MAX_ID = "11111111-1111-4111-8111-111111111111";
const LISANNE_ID = "22222222-2222-4222-8222-222222222222";

test("assignment resolves the canonical employee profile by email", () => {
  const employees = [
    { id: "profile-lisanne", authUserId: LISANNE_ID, email: "lisanne@maxwebstudio.nl", name: "Lisanne Post" },
  ];

  const employee = adminLeads.__test.findAssignableEmployee(employees, {
    id: "lisanne@maxwebstudio.nl",
    email: "lisanne@maxwebstudio.nl",
  });

  assert.equal(employee.authUserId, LISANNE_ID);
});

test("a stale Max user id cannot make a Lisanne reassignment look unchanged", () => {
  const changed = adminLeads.__test.sameLeadAssignment({
    assignedUserId: MAX_ID,
    assignedUserEmail: "lisanne@maxwebstudio.nl",
    assignedTo: MAX_ID,
  }, {
    id: LISANNE_ID,
    userId: LISANNE_ID,
    email: "lisanne@maxwebstudio.nl",
  });

  assert.equal(changed, false);
});

test("reassigning to the same canonical user does not send a duplicate notification", () => {
  const unchanged = adminLeads.__test.sameLeadAssignment({
    assignedUserId: LISANNE_ID,
    assignedUserEmail: "lisanne@maxwebstudio.nl",
  }, {
    id: LISANNE_ID,
    userId: LISANNE_ID,
    email: "lisanne@maxwebstudio.nl",
  });

  assert.equal(unchanged, true);
});

test("sales UI uses the dedicated assign action and never queues assignment offline", () => {
  const assignmentHandler = salesSource.match(/async function saveLeadOwnerAssignmentForLead[\s\S]*?\n      }\n\n      async function saveSelectedLeadOwnerAssignment/);

  assert.ok(assignmentHandler);
  assert.match(assignmentHandler[0], /action:\s*"assign"/);
  assert.match(assignmentHandler[0], /leadApiRequest\("PATCH"/);
  assert.doesNotMatch(assignmentHandler[0], /updateLeadfinderLead\(/);
  assert.doesNotMatch(assignmentHandler[0], /queueLeadOffline\(/);
});

test("assignment email links directly to the selected CRM lead", () => {
  const previousSiteUrl = process.env.SITE_URL;
  process.env.SITE_URL = "https://maxwebstudio.nl/";
  try {
    assert.equal(
      adminLeads.__test.buildLeadUrl("lead-123"),
      "https://maxwebstudio.nl/admin-sales.html?leadId=lead-123#leadfinder-detail"
    );
  } finally {
    if (previousSiteUrl === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSiteUrl;
  }
});
