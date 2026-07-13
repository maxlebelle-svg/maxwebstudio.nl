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
  'idea: "Idee"',
  'draft: "Concept"',
  'review: "Ter beoordeling"',
  'ready: "Klaar om te publiceren"',
  "function renderPipeline()",
  "function advanceVariantStatus(id)",
  "function normalizeStatus(status)",
  "statusFilter: \"all\"",
].forEach((marker) => {
  assert(script.includes(marker), `Social Studio workflow should include ${marker}`);
});

assert(script.includes('time: variant.time || "09:00"'), "Legacy variants should receive a safe default publication time");
assert(script.includes("status: normalizeStatus(variant.status)"), "Legacy variants should receive a normalized workflow status");
assert(script.includes("Publiceren wordt later gekoppeld."), "MVP must not imply that external publishing is active");
assert(script.includes("Nog niet gekoppeld aan publicatie-API's."), "Exports must describe the local-only publishing boundary");

new Function(script);

console.log("social studio MVP static tests passed");
