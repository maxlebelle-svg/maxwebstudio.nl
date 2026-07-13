const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("public/admin-social-media-studio.html", "utf8");
const script = fs.readFileSync("public/src/social-media-studio.js", "utf8");

assert(html.includes("<title>Social Studio | Max CRM</title>"), "Module should use the Social Studio product name");
assert(html.includes("<h1>Social Studio</h1>"), "Module should expose the Social Studio heading");

[
  "social-client",
  "social-campaign",
  "social-date",
  "social-time",
  "social-status",
  "variant-status-filter",
  "social-pipeline-grid",
  "social-schedule-list",
].forEach((id) => {
  assert(html.includes(`id="${id}"`), `Social Studio should expose #${id}`);
});

[
  "CONTENT_STATUSES",
  "LocalSocialStudioRepository",
  "createWorkspaceEnvelope",
  "function renderPipeline()",
  "function advanceVariantStatus(id)",
  "function normalizeStatus(status)",
  "statusFilter: \"all\"",
].forEach((marker) => {
  assert(script.includes(marker), `Social Studio workflow should include ${marker}`);
});

assert(script.includes("repository.loadVariants"), "Stored variants should load through the repository boundary");
assert(script.includes(".map(normalizeContentItem)"), "Imported variants should pass through the versioned content model");
assert(script.includes("Publiceren wordt later gekoppeld."), "MVP must not imply that external publishing is active");
assert(html.includes('type="module" src="src/social-media-studio.js'), "Social Studio should load through the module entrypoint");

console.log("social studio MVP static tests passed");
