"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync(require.resolve("../functions/submit-onboarding"), "utf8");
const page = fs.readFileSync(require.resolve("../public/onboarding.html"), "utf8");
const { createHandler } = require("../functions/submit-onboarding")._private;

const payload = {
  companyName: "Voorbeeld BV", contactName: "Ada", businessEmail: "ada@example.com", phone: "0612345678",
  industry: "Techniek", city: "Amsterdam", businessDescription: "Een technisch bedrijf.", logoChoice: "existing_logo",
  textChoice: "own_copy", photoChoice: "stock", confirmed: true, pages: ["Home", "Contact"],
  mainServices: "Advies, Onderhoud", targetAudience: "Zakelijke klanten", toneOfVoice: "Duidelijk",
};

test("legacy wizard delegates to the authenticated canonical onboarding without temporary storage or direct mail", async () => {
  let delegated;
  const handler = createHandler({ customerOnboardingHandler: async (event) => {
    delegated = event;
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } });
  const result = await handler({ httpMethod: "POST", headers: { authorization: "Bearer customer-token" }, body: JSON.stringify(payload) });
  assert.equal(result.statusCode, 200);
  assert.equal(delegated.headers.authorization, "Bearer customer-token");
  const canonical = JSON.parse(delegated.body);
  assert.equal(canonical.action, "submit");
  assert.equal(canonical.answers.company.email, "ada@example.com");
  assert.deepEqual(canonical.answers.content.services, ["Advies", "Onderhoud"]);
  assert.doesNotMatch(source, /intake-storage|sendEmail|saveIntake/);
});

test("premium wizard requires a Supabase customer session and forwards its bearer token", () => {
  assert.match(page, /import \{ getSession \} from "\.\/src\/services\/supabaseAuthProvider\.js"/);
  assert.match(page, /window\.location\.replace\(`\/login\.html\?mode=client&next=/);
  assert.match(page, /Authorization: `Bearer \$\{onboardingAccessToken\}`/);
});
