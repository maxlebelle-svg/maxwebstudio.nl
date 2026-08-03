const test = require("node:test");
const assert = require("node:assert/strict");

const companySettings = require("../functions/company-settings");

test("company settings exposes the current Max Webstudio contact details", async () => {
  const response = await companySettings.handler({ httpMethod: "GET" });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.settings.phoneDisplay, "085 130 5282");
  assert.equal(body.settings.phoneInternational, "+31851305282");
  assert.equal(body.settings.whatsappNumber, "+31851305282");
});

test("company settings keeps utility exports available to other functions", () => {
  assert.equal(companySettings.getTelephoneLink(), "tel:+31851305282");
  assert.equal(companySettings.getWhatsappLink(), "https://wa.me/31851305282");
});

test("company settings only allows GET and OPTIONS", async () => {
  const optionsResponse = await companySettings.handler({ httpMethod: "OPTIONS" });
  const postResponse = await companySettings.handler({ httpMethod: "POST" });

  assert.equal(optionsResponse.statusCode, 204);
  assert.equal(optionsResponse.body, "");
  assert.equal(postResponse.statusCode, 405);
});
