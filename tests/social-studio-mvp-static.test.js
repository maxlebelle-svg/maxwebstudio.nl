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
  "social-studio-start",
  "social-content-type-grid",
  "social-studio-stage",
  "social-autosave",
  "social-image-prompt",
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
assert(html.includes("Wat wil je vandaag maken?"), "Social Studio should open with an inspiring format chooser");
assert(script.includes("function openContentWorkflow(typeId)"), "A format choice should open its focused workflow");
assert(script.includes("function scheduleAutosave()"), "The editor should provide debounced autosave feedback");
assert(script.includes('event.key.toLowerCase() === "s"'), "The editor should support the save keyboard shortcut");

for (const format of [
  "Instagram Post",
  "Instagram Reel",
  "Instagram Story",
  "LinkedIn Post",
  "Facebook Post",
  "Carousel",
  "Behind the Scenes",
  "Klantcase",
  "Website Before / After",
  "Website Tip",
  "AI Nieuws",
  "Blog",
  "Advertentie",
  "E-mailcampagne",
]) {
  assert(script.includes(`"${format}"`), `Format chooser should include ${format}`);
}

console.log("social studio MVP static tests passed");
