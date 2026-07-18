"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const factory = require("../functions/website-factory");
const journey = require("../functions/demo-journey");

const JOURNEY = "11111111-1111-4111-8111-111111111111";
const VERSION = "22222222-2222-4222-8222-222222222222";
const root = path.join(__dirname, "..");
const factorySource = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");
const demoSitesSource = fs.readFileSync(path.join(root, "public/admin-demo-sites.html"), "utf8");

function reply(value) {
  return { ok: true, status: 200, text: async () => JSON.stringify(value) };
}

test("preview selector query is journey-scoped metadata without generated_package", async () => {
  const calls = [];
  const previous = global.fetch;
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("website_preview_versions")) return reply([]);
    if (String(url).includes("website_build_jobs")) return reply([]);
    if (String(url).includes("demo_journeys")) return reply([]);
    throw new Error(`Unexpected query: ${url}`);
  };
  try {
    await factory.getBuildHistory({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service", admin: { role: "super_admin" } }, { demoJourneyId: JOURNEY });
  } finally {
    global.fetch = previous;
  }
  const queryUrl = calls.find((url) => url.includes("website_preview_versions"));
  assert.ok(queryUrl);
  const parsed = new URL(queryUrl);
  assert.equal(parsed.searchParams.get("demo_journey_id"), `eq.${JOURNEY}`);
  assert.doesNotMatch(parsed.searchParams.get("select") || "", /generated_package|entry_file|package_meta/);
  assert.match(parsed.searchParams.get("select") || "", /id,demo_journey_id,build_job_id/);
});

test("version history timeout degrades without rejecting the journey history", async () => {
  const previous = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("website_preview_versions")) {
      const error = new Error("simulated timeout");
      error.name = "AbortError";
      throw error;
    }
    return reply([]);
  };
  let history;
  try {
    history = await factory.getBuildHistory({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service", admin: { role: "super_admin" } }, { demoJourneyId: JOURNEY });
  } finally {
    global.fetch = previous;
  }
  assert.equal(history.historyDegraded, true);
  assert.deepEqual(history.previewVersions, []);
  assert.match(history.warning, /versiehistorie/i);
  assert.deepEqual(history.jobs, []);
});

test("saved Demo Site metadata remains a safe exact preview fallback", () => {
  const history = journey._private.previewHistoryFallback({ historyDegraded: true, previewVersions: [], warning: "time-out" }, {
    id: JOURNEY,
    previewUrl: "/.netlify/functions/demo-preview?id=journey",
    savedDemoSite: {
      previewVersionId: VERSION,
      previewVersion: 4,
      previewSource: "website_factory",
      previewUrl: `/.netlify/functions/demo-preview?id=${JOURNEY}&previewVersionId=${VERSION}`,
    },
  });
  assert.equal(history.fallbackUsed, true);
  assert.equal(history.previewVersions.length, 1);
  assert.equal(history.previewVersions[0].id, VERSION);
  assert.equal(history.previewVersions[0].sourceType, "factory");
  assert.equal(history.previewVersions[0].renderable, true);
});

test("Demo Sites exposes a non-blocking warning and version-history retry", () => {
  assert.match(demoSitesSource, /previewHistoryWarning/);
  assert.match(demoSitesSource, /data-retry-preview-history/);
  assert.match(demoSitesSource, /Versiehistorie opnieuw laden/);
  assert.match(demoSitesSource, /loadDemoSites\(\)/);
});

test("recovery paths keep package projections separate from the selector query", () => {
  assert.match(factorySource, /PREVIEW_RECOVERY_FIELDS[\s\S]*generated_package->>entryFile/);
  assert.match(factorySource, /PREVIEW_SUMMARY_FIELDS/);
});
