const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("public/klantportaal.html", "utf8");
const css = fs.readFileSync("public/styles.css", "utf8");
const inlineScripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
const section = (id) => {
  const match = html.match(new RegExp(`<section class="admin-section" id="${id}"[\\\\s\\\\S]*?<\\\\/section>`, "i"));
  return match ? match[0] : "";
};

assert(html.includes('id="portal-onboarding-overview"'), "Onboarding should expose a progress overview");
assert(html.includes('id="portal-onboarding-steps"'), "Onboarding should render step cards around existing fields");
assert(html.includes("const onboardingStepDefinitions"), "Onboarding step definitions should be centralized");
assert(html.includes("function updateOnboardingWorkflow"), "Onboarding workflow status should update from real form values");

assert(html.includes("portal-message-workspace"), "Messages should use a premium workspace shell");
assert(html.includes("portal-message-conversation"), "Messages should separate conversation from composer");
assert(html.includes("portal-message-composer-card"), "Messages should keep composer in a dedicated card");
["onboarding", "berichten", "facturen", "account"].forEach((id) => {
  assert(!section(id).includes("<span>Max zegt</span>"), `${id} should not use generic Max says copy`);
});

assert(html.includes("portal-finance-dashboard"), "Finance should include a real-data dashboard summary");
assert(html.includes("Alles is betaald."), "Finance should use a positive paid state");
assert(!html.includes("Leg factuur uit"), "Finance should not render fake explain actions");
assert(!html.includes("Akkoord geven\""), "Finance should not render fake approval actions");

assert(html.includes("function renderAccountExperience"), "Account should render a structured settings experience");
assert(html.includes("portal-account-grid"), "Account should split details into sections");
assert(html.includes("portal-account-hero"), "Account should include an account overview header");

assert(css.includes(".portal-onboarding-step"), "Onboarding step styling should exist");
assert(css.includes(".portal-message-workspace"), "Message workspace styling should exist");
assert(css.includes(".portal-finance-dashboard"), "Finance dashboard styling should exist");
assert(css.includes(".portal-account-grid"), "Account grid styling should exist");

inlineScripts.forEach((code) => new Function(code));

console.log("client portal core polish static tests passed");
