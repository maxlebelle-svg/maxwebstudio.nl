const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { normalizeWebsiteInput } = require("../functions/_website-input");
const { buildWebsitePackage, runQualityCheck } = require("../functions/_website-factory-core");
const { extractHeroContext, prepareHeroEditorPackage } = require("../functions/_preview-editor-hero");
const { createBuildJob, getBuildHistory, runBuildJob, sanitizeBuildResult } = require("../functions/website-factory");

const root = path.join(__dirname, "..");
const factoryHtml = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const factoryBackend = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");
const demoBackend = fs.readFileSync(path.join(root, "functions/demo-journey.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");

function buildQuick(journey = {}, briefing = "") {
  const generatedPackage = buildWebsitePackage({
    journey: { businessName: "FatTrek", packageType: "starter", ...journey },
    briefing: briefing || "Branche: outdoor en reizen\nPlaats: Almere\nDoel: relevante aanvragen",
    version: 1,
  });
  return { generatedPackage, quality: runQualityCheck({ generatedPackage, journey }) };
}

test("new lead can build with only a business name", () => {
  const { generatedPackage, quality } = buildQuick({}, "Doel: relevante aanvragen");
  assert.equal(generatedPackage.businessName, "FatTrek");
  assert.equal(quality.passed, true);
});

test("new lead can build with business name and industry", () => {
  const { generatedPackage } = buildQuick({}, "Branche: outdoor en reizen\nDoel: kennismaking plannen");
  assert.ok(generatedPackage.meta.services.length >= 3);
});

test("explicit no-website context skips website use", () => {
  assert.deepEqual(normalizeWebsiteInput("fattrek.nl", { intent: "none", explicitNoWebsite: true }), {
    url: "", kind: "none", shouldScan: false, warning: "", fallbackAllowed: true,
  });
});

test("empty website input is a supported no-website state", () => {
  assert.equal(normalizeWebsiteInput("").kind, "none");
  const { generatedPackage } = buildQuick({ websiteUrl: "" });
  assert.equal(generatedPackage.meta.websiteUrl, "");
  assert.match(generatedPackage.meta.siteUrl, /^https:\/\/preview\.maxwebstudio\.nl\/fattrek$/);
});

test("bare domain is normalized only with explicit existing-website intent", () => {
  assert.equal(normalizeWebsiteInput("fattrek.nl").kind, "invalid");
  assert.equal(normalizeWebsiteInput("fattrek.nl", { intent: "existing" }).url, "https://fattrek.nl");
});

test("invalid website input falls back with a safe warning", () => {
  const result = normalizeWebsiteInput("dit is geen website", { intent: "existing" });
  assert.equal(result.url, "");
  assert.equal(result.shouldScan, false);
  assert.match(result.warning, /zonder websitescan/);
});

test("valid website with failed scan still builds from briefing data", () => {
  const { generatedPackage, quality } = buildQuick({
    websiteUrl: "https://fattrek.nl",
    websiteAnalysis: { ok: false, error: "scan_failed" },
  }, "Branche: outdoor en reizen\nPlaats: Almere");
  assert.equal(generatedPackage.meta.websiteUrl, "https://fattrek.nl");
  assert.equal(generatedPackage.meta.currentWebsite.sourceUrl, "");
  assert.equal(quality.passed, true);
});

test("scan failure uses branch defaults rather than blocking package generation", () => {
  const { generatedPackage } = buildQuick({ websiteAnalysis: { ok: false } }, "Branche: outdoor en reizen");
  assert.ok(generatedPackage.files.some((file) => file.path === "index.html"));
  assert.ok(generatedPackage.meta.services.length >= 3);
});

test("standard and VM builds keep valid explicit Hero write capabilities", async () => {
  const standard = buildQuick().generatedPackage;
  const vm = buildWebsitePackage({ journey: { businessName: "VM Tegelwerken", websiteUrl: "https://vmtegelwerken.nl" }, briefing: "Tegelwerken", version: 1 });
  for (const generatedPackage of [standard, vm]) {
    const prepared = await prepareHeroEditorPackage(generatedPackage);
    assert.equal(prepared.availability, "editable");
    assert.equal((await extractHeroContext(prepared.generatedPackage)).schema.id, "mws.hero.v1");
  }
});

test("missing optional editor marker falls back to read-only without blocking the build", async () => {
  const generatedPackage = buildQuick().generatedPackage;
  const entry = generatedPackage.files.find((file) => file.path === "index.html");
  entry.content = entry.content.replace('data-mws-field="image"', "");
  const prepared = await prepareHeroEditorPackage(generatedPackage);
  const hero = prepared.generatedPackage.meta.editorManifest.pages[0].sections.find((section) => section.id === "home.hero");
  assert.equal(prepared.availability, "read_only");
  assert.equal(hero.editor, undefined);
  assert.equal(runQualityCheck({ generatedPackage: prepared.generatedPackage, journey: { businessName: "FatTrek" } }).passed, true);
  assert.ok(prepared.generatedPackage.files.some((file) => file.path === "index.html" && /<\/html>/i.test(file.content)));
});

test("duplicate critical Hero marker produces a concrete non-retryable validation error", async () => {
  const generatedPackage = buildQuick().generatedPackage;
  const entry = generatedPackage.files.find((file) => file.path === "index.html");
  entry.content = entry.content.replace('<h1 data-mws-field="title">', '<h1 data-mws-field="title"></h1><h1 data-mws-field="title">');
  await assert.rejects(() => prepareHeroEditorPackage(generatedPackage), { code: "HERO_FIELD_MARKER_AMBIGUOUS", status: 422, phase: "validate_editor_markers" });
});

test("successful Demo Journey response omits multi-megabyte generated packages", () => {
  const generatedPackage = buildQuick().generatedPackage;
  assert.ok(Buffer.byteLength(JSON.stringify(generatedPackage)) > 6_291_556);
  const safe = sanitizeBuildResult({
    job: { id: "job", status: "completed", generatedPackage },
    previewVersion: { id: "version", version: 1, generatedPackage },
  });
  const response = { success: true, buildJob: safe.job, buildStatus: safe.job, previewVersion: safe.previewVersion };
  assert.equal(Object.hasOwn(safe.job, "generatedPackage"), false);
  assert.equal(Object.hasOwn(safe.previewVersion, "generatedPackage"), false);
  assert.ok(Buffer.byteLength(JSON.stringify(response)) < 100_000);
});

test("parse5 is a pinned production dependency and loads through the build-time compatibility path", async () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const coreSource = fs.readFileSync(path.join(root, "functions/_preview-editor-section-core.js"), "utf8");
  const heroSource = fs.readFileSync(path.join(root, "functions/_preview-editor-hero.js"), "utf8");
  const textSource = fs.readFileSync(path.join(root, "functions/_preview-editor-text.js"), "utf8");
  assert.equal(packageJson.dependencies.parse5, "7.2.1");
  assert.match(coreSource, /import\("parse5"\)/);
  assert.match(heroSource, /require\("\.\/_preview-editor-section-core"\)/);
  assert.match(textSource, /require\("\.\/_preview-editor-section-core"\)/);
  assert.equal((await prepareHeroEditorPackage(buildQuick().generatedPackage)).availability, "editable");
});

test("normal build stores one renderable preview version after Hero validation", async () => {
  const journeyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const job = { id: jobId, demo_journey_id: journeyId, status: "queued", current_step: "queued", progress: 5, preview_version: 1, build_logs: [], created_by: "admin-id" };
  const journey = { id: journeyId, business_name: "FatTrek", generated_briefing: "Branche: outdoor en reizen", created_by: "admin-id" };
  const previewWrites = [];
  const jobWrites = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    if (method === "GET" && target.includes("website_build_jobs")) return mockJson([job]);
    if (method === "GET" && target.includes("demo_journeys")) return mockJson([journey]);
    if (method === "GET" && target.includes("website_preview_versions")) return mockJson([]);
    if (method === "PATCH" && target.includes("website_build_jobs")) { jobWrites.push(body); return mockJson(null, 204); }
    if (method === "POST" && target.includes("website_preview_versions")) { previewWrites.push(body); return mockJson(null, 201); }
    if (method === "PATCH" && target.includes("website_preview_versions")) return mockJson(null, 204);
    if (method === "PATCH" && target.includes("demo_journeys")) return mockJson([{ ...journey, ...body }]);
    return mockJson({ message: "optional table unavailable" }, 500);
  };
  try {
    const result = await runBuildJob({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      admin: { id: "admin-id", role: "super_admin" },
      requestId: "REQ-NORMAL-BUILD",
    }, { jobId, generatedBriefing: journey.generated_briefing });
    assert.equal(result.job.status, "completed");
    assert.equal(result.previewVersion.id, jobId);
    assert.equal(previewWrites.length, 1);
    assert.equal(previewWrites[0].metadata.editorManifestAvailable, true);
    assert.equal(previewWrites[0].metadata.renderable, true);
    assert.equal((await extractHeroContext(previewWrites[0].generated_package)).schema.id, "mws.hero.v1");
    assert.equal(jobWrites.some((record) => record.status === "completed"), true);
  } finally {
    global.fetch = previousFetch;
  }
});

test("retry reuses an active build job without creating a duplicate", async () => {
  const journeyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const activeJob = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    demo_journey_id: journeyId,
    status: "quality_check",
    current_step: "run_quality_check",
    progress: 70,
    preview_version: 1,
    build_logs: [],
  };
  const methods = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    methods.push(options.method || "GET");
    const body = String(url).includes("demo_journeys")
      ? [{ id: journeyId, business_name: "FatTrek", created_by: "admin-id" }]
      : String(url).includes("website_build_jobs")
        ? [activeJob]
        : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  try {
    const result = await createBuildJob({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      admin: { id: "admin-id", role: "super_admin" },
    }, { demoJourneyId: journeyId });
    assert.equal(result.reusedExisting, true);
    assert.equal(result.job.id, activeJob.id);
    assert.equal(methods.includes("POST"), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("FatTrek production 504 marks the same build retryable without resending its 8 MB package", async () => {
  const journeyId = "9a735e10-18e7-4b83-8cc7-e2518fa7959d";
  const jobId = "d9d8944c-37e2-4991-ae06-89348b17fa59";
  const activeJob = {
    id: jobId,
    demo_journey_id: journeyId,
    status: "quality_check",
    current_step: "run_quality_check",
    progress: 70,
    preview_version: 1,
    build_logs: [{ step: "quality_check", message: "Quality checker gestart." }],
  };
  const journey = {
    id: journeyId,
    business_name: "FatTrek",
    website_url: "https://fattrek.nl",
    generated_briefing: "Websiteplan - FatTrek\nBranche: outdoor en reizen\nPlaats: Almere",
    created_by: "admin-id",
  };
  const writes = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    if (method === "GET" && String(url).includes("website_build_jobs")) return mockJson([activeJob]);
    if (method === "GET" && String(url).includes("demo_journeys")) return mockJson([journey]);
    if (method === "GET" && String(url).includes("website_preview_versions")) return mockJson([]);
    if (method === "PATCH" && String(url).includes("website_build_jobs")) {
      writes.push(body);
      if (body.status === "deploying") throw Object.assign(new Error("timeout"), { name: "AbortError" });
      return mockJson(null, 204);
    }
    throw new Error(`Unexpected ${method} ${url}`);
  };
  try {
    await assert.rejects(
      runBuildJob({
        supabaseUrl: "https://example.supabase.co",
        serviceRoleKey: "service-role",
        admin: { id: "admin-id", role: "super_admin" },
        requestId: "01KXKYGWQGP0X4N6EQ9H4379SA",
      }, { jobId, generatedBriefing: journey.generated_briefing }),
      (error) => error.code === "UPSTREAM_TIMEOUT" && error.phase === "patch_build_job_deploying",
    );
    const deploying = writes.find((record) => record.status === "deploying");
    const retryable = writes.find((record) => record.status === "retryable");
    assert.ok(deploying);
    assert.equal(Object.hasOwn(deploying, "generated_package"), false);
    assert.equal(retryable.current_step, "patch_build_job_deploying");
    assert.match(retryable.error_message, /veilig opnieuw/);
    assert.equal(writes.filter((record) => record.status === "retryable").length, 1);
  } finally {
    global.fetch = previousFetch;
  }
});

test("retry restores an already stored preview version without duplicate inserts", async () => {
  const journeyId = "9a735e10-18e7-4b83-8cc7-e2518fa7959d";
  const jobId = "d9d8944c-37e2-4991-ae06-89348b17fa59";
  const versionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const job = { id: jobId, demo_journey_id: journeyId, status: "retryable", current_step: "create_preview_version", progress: 90, preview_version: 1, build_logs: [] };
  const journey = { id: journeyId, business_name: "FatTrek", generated_briefing: "FatTrek briefing", created_by: "admin-id" };
  const version = { id: versionId, demo_journey_id: journeyId, build_job_id: jobId, version: 1, preview_url: "/.netlify/functions/demo-preview?id=1", preview_token: "safe-token", preview_score: 96, is_active: true, status: "internal" };
  const methods = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    methods.push(method);
    if (method === "GET" && String(url).includes("website_build_jobs")) return mockJson([job]);
    if (method === "GET" && String(url).includes("website_preview_versions")) return mockJson([version]);
    if (method === "GET" && String(url).includes("demo_journeys")) return mockJson([journey]);
    if (method === "PATCH" && String(url).includes("website_build_jobs")) return mockJson(null, 204);
    if (method === "PATCH" && String(url).includes("demo_journeys")) return mockJson([{ ...journey, preview_url: version.preview_url, demo_status: "interne_preview_klaar" }]);
    throw new Error(`Unexpected ${method} ${url}`);
  };
  try {
    const result = await runBuildJob({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      admin: { id: "admin-id", role: "super_admin" },
    }, { jobId });
    assert.equal(result.recovered, true);
    assert.equal(result.previewVersion.id, versionId);
    assert.equal(result.job.status, "completed");
    assert.equal(methods.includes("POST"), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("completed job without a stored preview version is not reported as preview-ready", async () => {
  const journeyId = "9a735e10-18e7-4b83-8cc7-e2518fa7959d";
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("website_build_jobs")) return mockJson([{ id: "d9d8944c-37e2-4991-ae06-89348b17fa59", demo_journey_id: journeyId, status: "completed", current_step: "completed", progress: 100 }]);
    if (String(url).includes("website_preview_versions")) return mockJson([]);
    throw new Error(`Unexpected GET ${url}`);
  };
  try {
    const history = await getBuildHistory({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role", admin: { id: "admin-id", role: "super_admin" } }, { demoJourneyId: journeyId });
    assert.equal(history.latestJob.status, "completed");
    assert.equal(history.activeVersion, null);
    assert.equal(history.previewVersions.length, 0);
  } finally {
    global.fetch = previousFetch;
  }
});

test("stored renderable preview exposes lightweight editor capability metadata", async () => {
  const journeyId = "9a735e10-18e7-4b83-8cc7-e2518fa7959d";
  const versionId = "d9d8944c-37e2-4991-ae06-89348b17fa59";
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("website_build_jobs")) return mockJson([]);
    if (String(url).includes("website_preview_versions")) return mockJson([{ id: versionId, demo_journey_id: journeyId, preview_url: "/preview", preview_token: "token", entry_file: "index.html", package_meta: { editorManifest: { version: 1 } }, is_active: true }]);
    throw new Error(`Unexpected GET ${url}`);
  };
  try {
    const history = await getBuildHistory({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role", admin: { id: "admin-id", role: "super_admin" } }, { demoJourneyId: journeyId });
    assert.equal(history.activeVersion.id, versionId);
    assert.equal(history.activeVersion.renderable, true);
    assert.equal(history.activeVersion.editorAvailable, true);
    assert.equal(history.activeVersion.generatedPackage, null);
  } finally {
    global.fetch = previousFetch;
  }
});

function mockJson(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => value == null ? "" : JSON.stringify(value),
  };
}

test("frontend keeps concrete backend code, phase and request id visible", () => {
  assert.match(factoryHtml, /code === "UPSTREAM_TIMEOUT"/);
  assert.match(factoryHtml, /Fase: \$\{phase\}/);
  assert.match(factoryHtml, /Request-id: \$\{requestId\}/);
  assert.match(demoBackend, /warnings: \[websiteInput\.warning\]\.filter\(Boolean\)/);
  assert.match(demoBackend, /requestId: cleanText\(requestId\)/);
  assert.match(factoryHtml, /id="factory-quick-retry"[^>]*>Opnieuw proberen/);
  assert.match(factoryHtml, /response\.status === 504 \? "UPSTREAM_TIMEOUT"/);
  assert.match(factoryHtml, /replace\(\/\\s\*Request-id:/);
  assert.match(factoryHtml, /retryable: "Opnieuw proberen"/);
  assert.match(factoryHtml, /activeVersion: responseVersion \|\| previewVersions\.find/);
});

test("Phase 2A selection mode remains wired and isolated", () => {
  assert.match(factoryHtml, /website-factory-preview-editor\.js/);
  assert.match(factoryHtml, /id="factory-preview-editor-toggle"/);
  assert.doesNotMatch(demoBackend, /editorMode\s*=\s*["']write/);
});

test("small-desktop header wraps actions without word-by-word title breaks", () => {
  assert.match(styles, /\.factory-guided-header h2\{[^}]*word-break:normal;overflow-wrap:normal/);
  assert.match(styles, /@media\(max-width:1180px\)\{\.factory-guided-header\{[^}]*flex-wrap:wrap/);
  assert.match(styles, /\.factory-guided-primary-actions\{[^}]*flex-wrap:wrap/);
  assert.match(factoryBackend, /BUILD_JOB_SUMMARY_FIELDS/);
  assert.match(factoryBackend, /Prefer: "return=minimal"/);
});
