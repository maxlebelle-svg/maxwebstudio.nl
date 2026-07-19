const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const demoJourney = require("../functions/demo-journey");
const {
  projectBuildHistoryMetadata,
  projectGeneratedPackageMetadata,
} = demoJourney._test;

const metaFields = [
  "packageId",
  "packageName",
  "packageLabel",
  "packagePositioning",
  "packageType",
  "packageRules",
  "packageManifest",
  "industryId",
  "industryName",
  "industryManifest",
  "industryProfileLabel",
  "resolvedRules",
  "resolvedComponents",
  "assetRequirements",
  "manifestSources",
  "template",
  "templateUsed",
  "templateSections",
  "generatedPages",
  "generatedSections",
  "warnings",
  "previewSource",
];

test("projects a package larger than 60 MB to safe file and whitelisted metadata", () => {
  const content = `${"x".repeat(60 * 1024 * 1024)}é🚀`;
  const source = packageFixture(content);
  const projected = projectGeneratedPackageMetadata(source);

  assert.deepEqual(projected.files, [{
    path: "index.html",
    mime: "text/html; charset=utf-8",
    encoding: "utf8",
    bytes: Buffer.byteLength(content, "utf8"),
    hasContent: true,
  }]);
  assert.equal(projected.generatedPackageBytes, Buffer.byteLength(content, "utf8"));
  assert.equal(projected.contentIncluded, false);
  assert.equal(projected.hasGeneratedPackage, true);
  assert.equal(hasKeyRecursively(projected, "content"), false);
  assert.deepEqual(Object.keys(projected.meta), metaFields);
  assert.equal(Object.hasOwn(projected.meta, "customerWishes"), false);
  assert.equal(Object.hasOwn(projected.meta, "sourceWebsiteContent"), false);
  assert.equal(Object.hasOwn(projected.meta, "unboundedBlob"), false);
  assert.strictEqual(source.files[0].content, content);
  assert.equal(source.meta.unboundedBlob, "z".repeat(1024));
});

test("projects jobs, preview versions and aliases without mutating their inputs", () => {
  const versionOne = buildRecord("build-1", packageFixture("eerste versie"));
  const versionTwo = buildRecord("build-2", packageFixture("actieve versie 🚀"));
  const previewOne = previewRecord("preview-1", versionOne.generatedPackage, false);
  const previewTwo = previewRecord("preview-2", versionTwo.generatedPackage, true);
  const history = {
    jobs: [versionTwo, versionOne],
    previewVersions: [previewTwo, previewOne],
    latestJob: versionTwo,
    activeVersion: previewTwo,
    setupRequired: false,
  };

  const projected = projectBuildHistoryMetadata(history);

  assert.equal(projected.jobs.length, 2);
  assert.equal(projected.previewVersions.length, 2);
  assert.strictEqual(projected.latestJob, projected.jobs[0]);
  assert.strictEqual(projected.activeVersion, projected.previewVersions[0]);
  assert.equal(hasKeyRecursively(projected, "content"), false);
  assert.equal(projected.latestJob.generatedPackage.files[0].path, "index.html");
  assert.equal(projected.latestJob.generatedPackage.meta.template, "premium");
  assert.equal(projected.latestJob.status, "succeeded");
  assert.equal(projected.latestJob.qualityReport.summary, "green");
  assert.deepEqual(projected.latestJob.buildLogs, [{ step: "render", status: "done" }]);
  assert.equal(versionTwo.generatedPackage.files[0].content, "actieve versie 🚀");
  assert.equal(previewTwo.generatedPackage.files[0].content, "actieve versie 🚀");
  assert.strictEqual(history.latestJob, versionTwo);
  assert.strictEqual(history.activeVersion, previewTwo);
});

test("supports null, empty, legacy and unexpected package shapes safely", () => {
  assert.equal(projectGeneratedPackageMetadata(null), null);
  assert.equal(projectGeneratedPackageMetadata([]), null);
  assert.deepEqual(projectGeneratedPackageMetadata({}), {
    files: [],
    meta: {},
    hasGeneratedPackage: true,
    generatedPackageBytes: 0,
    contentIncluded: false,
  });

  const legacy = projectBuildHistoryMetadata({
    jobs: [{ id: "legacy", generated_package: { files: [null, "bad", { path: "asset.bin", content: { unsupported: true } }] } }],
    previewVersions: [],
    latestJob: { id: "detached", generatedPackage: null },
    activeVersion: null,
  });
  assert.equal(legacy.jobs[0].generated_package.files.length, 3);
  assert.deepEqual(legacy.jobs[0].generated_package.files[2], {
    path: "asset.bin",
    mime: "text/plain; charset=utf-8",
    encoding: "utf8",
    bytes: 0,
    hasContent: true,
  });
  assert.equal(legacy.latestJob.generatedPackage, null);
});

test("keeps a maximum representative history below the one MiB response budget", (t) => {
  const largeContent = `${"pakket".repeat(170000)}🚀`;
  const jobs = Array.from({ length: 25 }, (_, index) => buildRecord(`build-${index}`, packageFixture(largeContent)));
  const previewVersions = Array.from({ length: 25 }, (_, index) => previewRecord(`preview-${index}`, packageFixture(largeContent), index === 0));
  const projected = projectBuildHistoryMetadata({
    jobs,
    previewVersions,
    latestJob: jobs[0],
    activeVersion: previewVersions[0],
  });
  const response = JSON.stringify({
    success: true,
    journey: { id: "journey" },
    demoJourney: { id: "journey" },
    records: [{ id: "journey" }],
    events: Array.from({ length: 25 }, (_, index) => ({ id: `event-${index}`, type: "status" })),
    templates: Array.from({ length: 17 }, (_, index) => ({ id: `template-${index}` })),
    buildHistory: projected,
    buildStatus: projected.latestJob,
    projectWorkspace: { id: "workspace" },
  });
  const responseBytes = Buffer.byteLength(response, "utf8");

  t.diagnostic(`projected response bytes: ${responseBytes}`);
  assert.ok(responseBytes < 1_048_576, `Projected response was ${responseBytes} bytes`);
  assert.equal(hasKeyRecursively(projected, "content"), false);
  assert.equal(projected.jobs.length, 25);
  assert.equal(projected.previewVersions.length, 25);
});

test("the projection is scoped to the secured Demo Journey GET response", () => {
  const source = fs.readFileSync(path.join(__dirname, "../functions/demo-journey.js"), "utf8");
  const readStart = source.indexOf("async function readAdminJourney");
  const writeStart = source.indexOf("async function upsertJourney");
  const readSource = source.slice(readStart, writeStart);
  const remainingSource = `${source.slice(0, readStart)}${source.slice(writeStart)}`;

  assert.match(readSource, /projectBuildHistoryMetadata\(factoryHistory\)/);
  assert.doesNotMatch(remainingSource, /projectBuildHistoryMetadata\(factoryHistory\)/);
  assert.match(readSource, /buildHistory: responseFactoryHistory/);
  assert.match(readSource, /buildStatus: responseFactoryHistory\.latestJob \|\| null/);
  assert.match(readSource, /journey: responseSelected, demoJourney: responseSelected, records: responseJourneys/);
  assert.match(readSource, /events, templates: emailTemplates\(\)/);
  assert.match(readSource, /projectWorkspace/);
  assert.match(source, /if \(isClientRequest && event\.httpMethod === "GET"\) return readCustomerJourney\(event\)/);
  const customerStart = source.indexOf("async function readCustomerJourney");
  const customerEnd = source.indexOf("async function saveCustomerFeedback");
  const customerSource = source.slice(customerStart, customerEnd);
  assert.match(customerSource, /return jsonResponse\(200, \{ success: true, journey, events \}\)/);
  assert.doesNotMatch(customerSource, /buildHistory|projectBuildHistoryMetadata/);
});

test("Website Factory context and history routes retain full generated package content", () => {
  const source = fs.readFileSync(path.join(__dirname, "../functions/website-factory.js"), "utf8");
  const coreSource = fs.readFileSync(path.join(__dirname, "../functions/_website-factory-core.js"), "utf8");
  assert.match(source, /buildJobs: history\.jobs/);
  assert.match(source, /previewVersions: history\.previewVersions/);
  assert.match(source, /return jsonResponse\(200, \{ success: true, \.\.\.history \}\)/);
  assert.match(coreSource, /generatedPackage: row\.generated_package/);
  assert.doesNotMatch(source, /projectBuildHistoryMetadata/);
  assert.doesNotMatch(coreSource, /projectBuildHistoryMetadata/);
});

test("all eleven admin consumers retain the package metadata and file paths they use", () => {
  const pages = [
    "admin-dashboard.html",
    "admin-demo-sites.html",
    "admin-facturen.html",
    "admin-instellingen.html",
    "admin-klanten.html",
    "admin-lead-generator.html",
    "admin-offertes.html",
    "admin-projecten.html",
    "admin-sales.html",
    "admin-website-factory.html",
    "admin-websites.html",
  ];
  const combined = pages.map((page) => fs.readFileSync(path.join(__dirname, "../public", page), "utf8"));
  for (const [index, source] of combined.entries()) {
    assert.match(source, /buildHistory/ , `${pages[index]} must retain buildHistory`);
    assert.match(source, /latestJob/, `${pages[index]} must retain latestJob`);
    assert.match(source, /activeVersion/, `${pages[index]} must retain activeVersion`);
    assert.match(source, /generatedPackage\?\.files\?\.map\(\(file\) => file\.path\)/, `${pages[index]} must retain generated file paths`);
  }
  const allSources = combined.join("\n");
  for (const field of metaFields) {
    const directPath = `packageMeta.${field}`;
    const optionalPath = `meta?.${field}`;
    assert.ok(allSources.includes(directPath) || allSources.includes(optionalPath), `Missing consumer evidence for ${field}`);
  }
});

function packageFixture(content) {
  return {
    version: 2,
    generatedAt: "2026-07-19T12:00:00.000Z",
    businessName: "Synthetische fixture",
    packageType: "premium",
    files: [{ path: "index.html", content }],
    meta: Object.fromEntries([
      ...metaFields.map((field) => [field, metaValue(field)]),
      ["customerWishes", "private wishes"],
      ["sourceWebsiteContent", "raw website source"],
      ["unboundedBlob", "z".repeat(1024)],
    ]),
  };
}

function metaValue(field) {
  if (["templateSections", "generatedPages", "generatedSections", "warnings"].includes(field)) return [field];
  if (["packageRules", "packageManifest", "industryManifest", "resolvedRules", "resolvedComponents", "assetRequirements", "manifestSources"].includes(field)) return { id: field };
  return field === "template" ? "premium" : field;
}

function buildRecord(id, generatedPackage) {
  return {
    id,
    status: "succeeded",
    previewVersion: 2,
    previewUrl: "/preview",
    packageChecksum: "a".repeat(64),
    qualityReport: { summary: "green" },
    buildLogs: [{ step: "render", status: "done" }],
    generatedPackage,
  };
}

function previewRecord(id, generatedPackage, isActive) {
  return {
    id,
    version: 2,
    isActive,
    previewUrl: "/preview",
    packageChecksum: "a".repeat(64),
    generatedPackage,
  };
}

function hasKeyRecursively(value, target) {
  if (Array.isArray(value)) return value.some((item) => hasKeyRecursively(item, target));
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).some((key) => key === target || hasKeyRecursively(value[key], target));
}
