const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("public/klantportaal.html", "utf8");
const css = fs.readFileSync("public/styles.css", "utf8");
const inlineScripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

const requiredRoutes = [
  "dashboard",
  "onboarding",
  "branding",
  "website",
  "website-overzicht",
  "website-review",
  "website-versies",
  "wijzigingen",
  "berichten",
  "facturen",
  "bestanden",
  "account",
];

assert(html.includes("const PORTAL_DEFAULT_VIEW = \"dashboard\""), "Dashboard should be the default client portal view");
assert(html.includes("const PORTAL_VIEWS = {"), "Client portal should define a central route map");
requiredRoutes.forEach((route) => {
  assert(html.includes(`${route}: {`) || html.includes(`"${route}": {`), `Missing route mapping for ${route}`);
});

assert(html.includes('href="#dashboard"'), "Sidebar brand/dashboard should route to #dashboard");
assert(html.includes('href="#website"'), "Sidebar should expose the website workspace route");
assert(html.includes('href="#bestanden"'), "Sidebar should expose the Asset Center route");
assert(!html.includes('<a href="#mijn-website">'), "Primary navigation should not target the old website section id");
assert(!html.includes('<a href="#website-preview">'), "Primary navigation should not target the old review section id");
assert(html.includes("window.addEventListener(\"hashchange\""), "Router should react to browser hash navigation");
assert(html.includes("window.addEventListener(\"popstate\""), "Router should support back/forward navigation");
assert(html.includes("aria-current\", \"page\""), "Active sidebar item should be exposed with aria-current");
assert(css.includes('a[aria-current="page"]'), "Active sidebar styling should use aria-current");
assert(css.includes(".customer-portal-demo [hidden]"), "Hidden portal views should be removed from layout");
assert(css.includes('data-portal-sub-view="website-versies"'), "Website subviews should have scoped visual states");

inlineScripts.forEach((code) => new Function(code));

console.log("client portal routing static tests passed");
