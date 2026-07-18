const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { normalizeWebsiteInput } = require("../functions/_website-input");
const { buildWebsitePackage, hydrateMissingDemoImageAssets, runQualityCheck, validateGeneratedPackage } = require("../functions/_website-factory-core");
const { extractHeroContext, prepareHeroEditorPackage } = require("../functions/_preview-editor-hero");
const { extractImageContext, prepareImageEditorPackage } = require("../functions/_preview-editor-image");
const { createBuildJob, getBuildHistory, runBuildJob, sanitizeBuildResult, _private } = require("../functions/website-factory");

const root = path.join(__dirname, "..");
const factoryHtml = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const factoryBackend = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");
const demoBackend = fs.readFileSync(path.join(root, "functions/demo-journey.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const retryableStatusMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260717143000_allow_retryable_website_build_jobs.sql"), "utf8");

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

test("package persistence has a bounded extended timeout and retryable status is deployable", () => {
  assert.match(factoryBackend, /PACKAGE_SUPABASE_TIMEOUT_MS = 30000/);
  assert.match(factoryBackend, /generated_package"\) \? PACKAGE_SUPABASE_TIMEOUT_MS/);
  assert.match(factoryBackend, /website_preview_versions[\s\S]*generated_package"\) \? PACKAGE_SUPABASE_TIMEOUT_MS/);
  assert.match(retryableStatusMigration, /website_build_jobs_status_check[\s\S]*'retryable'/);
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

test("All4home Quick Build produces a renderable neutral package with its selected assets", () => {
  const generatedPackage = buildWebsitePackage({
    journey: { businessName: "Aannemer Almere Tegels Almere All4home", websiteUrl: "https://all4home.nl/", packageType: "starter" },
    briefing: "Aannemer Almere Tegels Almere All4home",
    version: 1,
  });
  assert.equal(generatedPackage.meta.industryProfile, "neutrale-lokale-dienstverlener");
  assert.equal(generatedPackage.meta.industryImageSelection.groupSlug, "neutral-professional");
  assert.equal(validateGeneratedPackage(generatedPackage).passed, true);
});

test("a persisted All4home package hydrates only its missing demo-image files", () => {
  const generatedPackage = {
    entryFile: "index.html",
    files: [
      { path: "index.html", content: '<link href="assets/site.css" rel="stylesheet"><script src="assets/site.js"></script><img src="assets/demo-images/library/financieel-adviseur/hero.png">' },
      { path: "assets/site.css", content: "body{}" },
      { path: "assets/site.js", content: "void 0;" },
    ],
  };
  const result = hydrateMissingDemoImageAssets(generatedPackage);
  assert.equal(result.changed, true);
  assert.deepEqual(result.hydratedPaths, ["assets/demo-images/library/financieel-adviseur/hero.png"]);
  assert.equal(validateGeneratedPackage(result.generatedPackage).passed, true);
  assert.equal(generatedPackage.files.length, 3);
});

function persistedHeelJeZelfPackage() {
  const briefing = [
    "Branche: Energetisch",
    "Klantintake: zakelijke dienstverlening",
    "Doel: Maak een website die vertrouwen opbouwt.",
  ].join("\n");
  const generatedPackage = buildWebsitePackage({
    journey: { businessName: "Heel je Zelf", websiteUrl: "http://heeljezelf.today/Home/", packageType: "starter" },
    briefing,
    version: 1,
  });
  generatedPackage.meta.recoveryMarker = "production-package-was-reused";
  const canonicalLocalPath = "assets/holistisch-natuur-coaching.png";
  const productionCanonicalPath = "/assets/demo-images/library/holistisch/natuur-coaching.png";
  const holisticLocalPaths = generatedPackage.files
    .filter((file) => String(file.path || "").startsWith("assets/holistisch-"))
    .map((file) => file.path);
  let serialized = JSON.stringify({
    ...generatedPackage,
    files: generatedPackage.files.filter((file) => !holisticLocalPaths.includes(file.path)),
  });
  for (const localPath of holisticLocalPaths) serialized = serialized.replaceAll(localPath, productionCanonicalPath);
  serialized = serialized.replaceAll(canonicalLocalPath, productionCanonicalPath);
  const persisted = JSON.parse(serialized);
  const entry = persisted.files.find((file) => file.path === "index.html");
  entry.content += [
    "intake-gesprek.png",
    "ontspanning-sessie.png",
    "meditatie-moment.png",
    "behandelruimte.png",
    "ademwerk-groep.png",
  ].map((fileName) => `<img src="/assets/demo-images/library/holistisch/${fileName}" alt="">`).join("");
  return { briefing, persisted };
}

test("Heel je Zelf repairs six missing holistic references to one compact canonical asset", () => {
  const { persisted } = persistedHeelJeZelfPackage();
  const before = validateGeneratedPackage(persisted);
  assert.deepEqual(before.missing.filter((file) => file.includes("/holistisch/")).sort(), [
    "assets/demo-images/library/holistisch/ademwerk-groep.png",
    "assets/demo-images/library/holistisch/behandelruimte.png",
    "assets/demo-images/library/holistisch/intake-gesprek.png",
    "assets/demo-images/library/holistisch/meditatie-moment.png",
    "assets/demo-images/library/holistisch/natuur-coaching.png",
    "assets/demo-images/library/holistisch/ontspanning-sessie.png",
  ]);
  const repaired = hydrateMissingDemoImageAssets(persisted);
  assert.equal(repaired.changed, true);
  assert.deepEqual(repaired.hydratedPaths, ["assets/demo-images/library/holistisch/natuur-coaching.png"]);
  assert.equal(validateGeneratedPackage(repaired.generatedPackage).passed, true);
  assert.equal(repaired.generatedPackage.meta.recoveryMarker, "production-package-was-reused");
  assert.ok(Buffer.byteLength(JSON.stringify(repaired.generatedPackage)) < 4_000_000);
  assert.doesNotMatch(JSON.stringify(repaired.generatedPackage.meta), /bouwbedrijf|timmerwerk|installatiebedrijf/);
});

test("Heel je Zelf ambiguous asset write retries the same job and creates one renderable preview", async () => {
  const journeyId = "3fb7fce4-834d-4669-9c6c-6fc70782b87c";
  const jobId = "8df40602-ab70-497f-8b64-114071d6f958";
  const { briefing, persisted } = persistedHeelJeZelfPackage();
  const journey = { id: journeyId, business_name: "Heel je Zelf", website_url: "http://heeljezelf.today/Home/", generated_briefing: briefing, created_by: "admin-id" };
  const storedJob = {
    id: jobId, demo_journey_id: journeyId, status: "failed", current_step: "render_check", progress: 5,
    preview_version: 1, generated_package: persisted, quality_report: { passed: true, score: 96 }, build_logs: [],
  };
  let failAssetWrite = true;
  let latePersistedPackage = null;
  let previewInserted = false;
  const previewWrites = [];
  const buildPosts = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    if (method === "GET" && target.includes("website_build_jobs")) return mockJson([storedJob]);
    if (method === "GET" && target.includes("demo_journeys")) return mockJson([journey]);
    if (method === "GET" && target.includes("website_preview_versions")) return mockJson(previewInserted ? [{
      id: jobId, demo_journey_id: journeyId, build_job_id: jobId, version: 1,
      preview_url: storedJob.preview_url, preview_token: storedJob.preview_token,
      entry_file: "index.html", metadata: { renderable: true, editorManifestAvailable: true }, is_active: true,
    }] : []);
    if (method === "POST" && target.includes("website_build_jobs")) { buildPosts.push(body); return mockJson([storedJob], 201); }
    if (method === "PATCH" && target.includes("website_build_jobs")) {
      if (body.generated_package && failAssetWrite) {
        latePersistedPackage = body.generated_package;
        throw Object.assign(new Error("ambiguous write"), { name: "AbortError" });
      }
      Object.assign(storedJob, body);
      return mockJson(null, 204);
    }
    if (method === "POST" && target.includes("website_preview_versions")) {
      previewInserted = true;
      previewWrites.push(body);
      return mockJson(null, 201);
    }
    if (method === "PATCH" && target.includes("website_preview_versions")) return mockJson(null, 204);
    if (method === "PATCH" && target.includes("demo_journeys")) return mockJson([{ ...journey, ...body }]);
    return mockJson({ message: "optional table unavailable" }, 500);
  };
  try {
    await assert.rejects(
      runBuildJob({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role", admin: { id: "admin-id", role: "super_admin" }, requestId: "REQ-HEEL-FIRST" }, { jobId }),
      (error) => error.code === "UPSTREAM_TIMEOUT" && error.phase === "repair_generated_package_assets",
    );
    assert.ok(latePersistedPackage);
    failAssetWrite = false;
    Object.assign(storedJob, {
      status: "retryable",
      current_step: "repair_generated_package_assets",
      generated_package: latePersistedPackage,
      quality_report: { passed: true, score: 96 },
    });
    const result = await runBuildJob({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role", admin: { id: "admin-id", role: "super_admin" }, requestId: "REQ-HEEL-RETRY" }, { jobId });
    assert.equal(result.job.status, "completed");
    assert.equal(result.previewVersion.id, jobId);
    assert.equal(result.previewVersion.renderable, true);
    assert.equal(previewWrites.length, 1);
    assert.equal(buildPosts.length, 0);
    assert.equal(previewWrites[0].generated_package.meta.recoveryMarker, "production-package-was-reused");
    assert.equal(validateGeneratedPackage(previewWrites[0].generated_package).passed, true);
    assert.equal(previewWrites[0].generated_package.meta.industryIntelligence.industry, "holistisch");
    assert.equal(previewWrites[0].generated_package.meta.industryIntelligence.subcategory, "energetische-praktijk");
    assert.equal(previewWrites[0].generated_package.meta.industryImageSelection.groupSlug, "holistisch");
    assert.doesNotMatch(JSON.stringify(previewWrites[0].generated_package.meta), /bouwbedrijf|timmerwerk|installatiebedrijf/);
    const response = sanitizeBuildResult(result);
    assert.equal(response.job.fileCount, previewWrites[0].generated_package.files.length);
    assert.equal(response.job.entryFile, "index.html");
    assert.equal(response.job.industryIntelligence.industry, "holistisch");
    assert.equal(Object.hasOwn(response.job, "generatedPackage"), false);
    assert.equal(Object.hasOwn(response.previewVersion, "generatedPackage"), false);
    assert.ok(Buffer.byteLength(JSON.stringify(response)) < 10_000);
  } finally {
    global.fetch = previousFetch;
  }
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

test("missing image marker makes only the imageslot read-only without blocking Hero text or build", async () => {
  const generatedPackage = buildQuick().generatedPackage;
  const entry = generatedPackage.files.find((file) => file.path === "index.html");
  entry.content = entry.content.replace('data-mws-field="image"', "");
  const imagePrepared = await prepareImageEditorPackage(generatedPackage);
  const prepared = await prepareHeroEditorPackage(imagePrepared.generatedPackage);
  const hero = prepared.generatedPackage.meta.editorManifest.pages[0].sections.find((section) => section.id === "home.hero");
  assert.equal(imagePrepared.availability, "read_only");
  assert.equal(prepared.availability, "editable");
  assert.equal(hero.imageEditor, undefined);
  assert.ok(hero.editor);
  await assert.rejects(() => extractImageContext(prepared.generatedPackage), { code: "IMAGE_WRITE_UNAVAILABLE" });
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
    assert.equal(jobWrites.filter((record) => Object.hasOwn(record, "generated_package")).length, 1);
    assert.equal(Object.hasOwn(jobWrites.find((record) => record.status === "quality_check"), "generated_package"), false);
    assert.equal(Object.hasOwn(jobWrites.find((record) => record.status === "deploying"), "generated_package"), false);
    assert.equal(Object.hasOwn(jobWrites.find((record) => record.status === "completed"), "generated_package"), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("database statement timeout on the job package copy continues once and creates one preview", async () => {
  const journeyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const job = { id: jobId, demo_journey_id: journeyId, status: "queued", current_step: "queued", progress: 5, preview_version: 1, build_logs: [], created_by: "admin-id" };
  const journey = { id: journeyId, business_name: "Heel je Zelf", generated_briefing: "Branche: energetische praktijk", created_by: "admin-id" };
  const previewWrites = [];
  const jobWrites = [];
  const buildPosts = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    if (method === "GET" && target.includes("website_build_jobs")) return mockJson([job]);
    if (method === "GET" && target.includes("demo_journeys")) return mockJson([journey]);
    if (method === "GET" && target.includes("website_preview_versions")) return mockJson([]);
    if (method === "POST" && target.includes("website_build_jobs")) { buildPosts.push(body); return mockJson([job], 201); }
    if (method === "PATCH" && target.includes("website_build_jobs")) {
      jobWrites.push(body);
      if (Object.hasOwn(body, "generated_package")) return mockJson({ code: "57014", message: "canceling statement due to statement timeout" }, 500);
      return mockJson(null, 204);
    }
    if (method === "POST" && target.includes("website_preview_versions")) { previewWrites.push(body); return mockJson(null, 201); }
    if (method === "PATCH" && target.includes("website_preview_versions")) return mockJson(null, 204);
    if (method === "PATCH" && target.includes("demo_journeys")) return mockJson([{ ...journey, ...body }]);
    return mockJson({ message: "optional table unavailable" }, 500);
  };
  try {
    const result = await runBuildJob({
      supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role",
      admin: { id: "admin-id", role: "super_admin" }, requestId: "REQ-57014",
    }, { jobId, generatedBriefing: journey.generated_briefing });
    assert.equal(result.job.status, "completed");
    assert.equal(result.job.errorMessage, "");
    assert.equal(previewWrites.length, 1);
    assert.equal(previewWrites[0].id, jobId);
    assert.equal(jobWrites.filter((record) => Object.hasOwn(record, "generated_package")).length, 1);
    assert.equal(jobWrites.filter((record) => record.status === "completed").length, 1);
    assert.equal(jobWrites.find((record) => record.status === "completed").error_message, null);
    assert.equal(buildPosts.length, 0);
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

test("retry resumes the same failed render-check job when package and quality already exist", async () => {
  const journeyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const generatedPackage = buildQuick().generatedPackage;
  const summary = { id: jobId, demo_journey_id: journeyId, status: "failed", current_step: "render_check", preview_version: 1 };
  const runtime = { ...summary, generated_package: generatedPackage, quality_report: { passed: true, score: 92 } };
  const methods = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    methods.push(method);
    if (target.includes("demo_journeys")) return mockJson([{ id: journeyId, business_name: "All4home", created_by: "admin-id" }]);
    if (target.includes("website_preview_versions")) return mockJson([]);
    if (target.includes("website_build_jobs") && target.includes("generated_package")) return mockJson([runtime]);
    if (target.includes("website_build_jobs")) return mockJson([summary]);
    return mockJson([]);
  };
  try {
    const result = await createBuildJob({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role", admin: { id: "admin-id", role: "super_admin" } }, { demoJourneyId: journeyId });
    assert.equal(result.reusedExisting, true);
    assert.equal(result.resumedAfterPreviewInterruption, true);
    assert.equal(result.job.id, jobId);
    assert.equal(methods.includes("POST"), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("completed job without a preview version is resumed instead of creating V3", async () => {
  const journeyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const generatedPackage = buildQuick().generatedPackage;
  const summary = { id: jobId, demo_journey_id: journeyId, status: "completed", current_step: "completed", preview_version: 2 };
  const runtime = { ...summary, generated_package: generatedPackage, quality_report: { passed: true, score: 96 } };
  const methods = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    methods.push(method);
    if (target.includes("demo_journeys")) return mockJson([{ id: journeyId, business_name: "All4home", created_by: "admin-id" }]);
    if (target.includes("website_preview_versions")) return mockJson([]);
    if (target.includes("website_build_jobs") && target.includes("generated_package")) return mockJson([runtime]);
    if (target.includes("website_build_jobs")) return mockJson([summary]);
    return mockJson([]);
  };
  try {
    const result = await createBuildJob({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role", admin: { id: "admin-id", role: "super_admin" } }, { demoJourneyId: journeyId });
    assert.equal(result.reusedExisting, true);
    assert.equal(result.resumedAfterPreviewInterruption, true);
    assert.equal(result.job.previewVersion, 2);
    assert.equal(methods.includes("POST"), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("building job with a persisted package resumes at quality check without rebuilding", async () => {
  const journeyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const generatedPackage = buildQuick().generatedPackage;
  generatedPackage.meta.recoveryMarker = "persisted-before-timeout";
  const job = {
    id: jobId,
    demo_journey_id: journeyId,
    status: "building",
    current_step: "generate_website_package",
    progress: 45,
    preview_version: 1,
    generated_package: generatedPackage,
    build_logs: [],
  };
  const journey = { id: journeyId, business_name: "FatTrek", generated_briefing: "Outdoor", created_by: "admin-id" };
  const jobWrites = [];
  const previewWrites = [];
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
      requestId: "REQ-PERSISTED-PACKAGE",
    }, { jobId });
    assert.equal(result.job.status, "completed");
    assert.equal(previewWrites.length, 1);
    assert.equal(previewWrites[0].generated_package.meta.recoveryMarker, "persisted-before-timeout");
    assert.equal(jobWrites.filter((record) => Object.hasOwn(record, "generated_package")).length, 0);
  } finally {
    global.fetch = previousFetch;
  }
});

test("render validation rejects missing entry, CSS, JavaScript and referenced assets", () => {
  const complete = buildQuick().generatedPackage;
  assert.equal(validateGeneratedPackage(complete).passed, true);
  const broken = structuredClone(complete);
  broken.files = broken.files.filter((file) => !["styles.css", "script.js", "assets/logo.svg"].includes(file.path));
  const validation = validateGeneratedPackage(broken);
  assert.equal(validation.passed, false);
  assert.equal(validation.cssExists, false);
  assert.equal(validation.criticalJsExists, false);
  assert.ok(validation.missing.includes("assets/logo.svg"));
});

test("FatTrek production 504 marks the same build retryable without resending its 8 MB package", async () => {
  const journeyId = "9a735e10-18e7-4b83-8cc7-e2518fa7959d";
  const jobId = "d9d8944c-37e2-4991-ae06-89348b17fa59";
  const productionPackage = buildQuick().generatedPackage;
  productionPackage.files.push({ path: "assets/production-size-fixture.txt", content: "x".repeat(900_000) });
  assert.ok(Buffer.byteLength(JSON.stringify(productionPackage)) > 8_000_000);
  const activeJob = {
    id: jobId,
    demo_journey_id: journeyId,
    status: "quality_check",
    current_step: "run_quality_check",
    progress: 70,
    preview_version: 1,
    generated_package: productionPackage,
    quality_report: { passed: true, score: 96, summary: "Klaar" },
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

test("timed-out deploying write is confirmed and the same production job creates exactly one preview", async () => {
  const journeyId = "b2501d53-cca6-439e-973d-fc14e64e1fc9";
  const jobId = "085c8eea-66ec-4037-bbbf-3af711d9267a";
  const generatedPackage = buildQuick().generatedPackage;
  const journey = { id: journeyId, business_name: "Heel je zelf", generated_briefing: "Energie en balans", created_by: "admin-id" };
  const retryableJob = {
    id: jobId,
    demo_journey_id: journeyId,
    status: "retryable",
    current_step: "patch_build_job_deploying",
    progress: 90,
    preview_version: 1,
    preview_url: `/.netlify/functions/demo-preview?id=${journeyId}&token=safe&previewVersionId=${jobId}`,
    preview_token: "safe",
    generated_package: generatedPackage,
    quality_report: { passed: true, score: 96, summary: "Klaar" },
    build_logs: [],
  };
  let buildReads = 0;
  let previewInserted = false;
  const previewWrites = [];
  const jobWrites = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    if (method === "GET" && target.includes("website_build_jobs")) {
      buildReads += 1;
      return mockJson([buildReads >= 3 ? { ...retryableJob, status: "deploying", current_step: "create_preview_version" } : retryableJob]);
    }
    if (method === "GET" && target.includes("demo_journeys")) return mockJson([journey]);
    if (method === "GET" && target.includes("website_preview_versions")) return mockJson(previewInserted ? [{
      id: jobId,
      demo_journey_id: journeyId,
      build_job_id: jobId,
      version: 1,
      preview_url: retryableJob.preview_url,
      preview_token: "safe",
      entry_file: "index.html",
      metadata: { renderable: true, editorManifestAvailable: true, sectionMarkersAvailable: true },
      is_active: true,
    }] : []);
    if (method === "PATCH" && target.includes("website_build_jobs")) {
      jobWrites.push(body);
      if (body.status === "deploying") throw Object.assign(new Error("timeout after commit"), { name: "AbortError" });
      return mockJson(null, 204);
    }
    if (method === "POST" && target.includes("website_preview_versions")) {
      previewInserted = true;
      previewWrites.push(body);
      return mockJson(null, 201);
    }
    if (method === "PATCH" && target.includes("website_preview_versions")) return mockJson(null, 204);
    if (method === "PATCH" && target.includes("demo_journeys")) return mockJson([{ ...journey, ...body }]);
    return mockJson({ message: "optional table unavailable" }, 500);
  };
  try {
    const result = await runBuildJob({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      admin: { id: "admin-id", role: "super_admin" },
      requestId: "01KXNAVYXAGWTM4XE4BKGM1051",
    }, { jobId });
    assert.equal(result.job.status, "completed");
    assert.equal(result.previewVersion.id, jobId);
    assert.equal(previewWrites.length, 1);
    assert.equal(jobWrites.filter((record) => Object.hasOwn(record, "generated_package")).length, 0);
    assert.equal(jobWrites.some((record) => record.status === "retryable"), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("timeout after preview insert recovers the deterministic version without a duplicate", async () => {
  const journeyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const generatedPackage = buildQuick().generatedPackage;
  const journey = { id: journeyId, business_name: "FatTrek", generated_briefing: "Outdoor", created_by: "admin-id" };
  const job = {
    id: jobId, demo_journey_id: journeyId, status: "deploying", current_step: "create_preview_version", progress: 90,
    preview_version: 1, preview_url: `/.netlify/functions/demo-preview?id=${journeyId}&token=safe&previewVersionId=${jobId}`,
    preview_token: "safe", generated_package: generatedPackage, quality_report: { passed: true, score: 95 }, build_logs: [],
  };
  let inserted = false;
  let insertAttempts = 0;
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    if (method === "GET" && target.includes("website_build_jobs")) return mockJson([job]);
    if (method === "GET" && target.includes("demo_journeys")) return mockJson([journey]);
    if (method === "GET" && target.includes("website_preview_versions")) return mockJson(inserted ? [{
      id: jobId, demo_journey_id: journeyId, build_job_id: jobId, version: 1, preview_url: job.preview_url,
      preview_token: "safe", entry_file: "index.html", metadata: { renderable: true }, is_active: true,
    }] : []);
    if (method === "PATCH" && target.includes("website_build_jobs")) return mockJson(null, 204);
    if (method === "POST" && target.includes("website_preview_versions")) {
      insertAttempts += 1;
      inserted = true;
      throw Object.assign(new Error("timeout after insert"), { name: "AbortError" });
    }
    if (method === "PATCH" && target.includes("website_preview_versions")) return mockJson(null, 204);
    if (method === "PATCH" && target.includes("demo_journeys")) return mockJson([{ ...journey, ...body }]);
    return mockJson({ message: "optional table unavailable" }, 500);
  };
  try {
    const result = await runBuildJob({
      supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role",
      admin: { id: "admin-id", role: "super_admin" }, requestId: "REQ-PREVIEW-INSERT-TIMEOUT",
    }, { jobId });
    assert.equal(result.previewVersion.id, jobId);
    assert.equal(result.job.status, "completed");
    assert.equal(insertAttempts, 1);
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
  const version = { id: versionId, demo_journey_id: journeyId, build_job_id: jobId, version: 1, preview_url: "/.netlify/functions/demo-preview?id=1", preview_token: "safe-token", preview_score: 96, entry_file: "index.html", metadata: { renderable: true }, is_active: true, status: "internal" };
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
    if (String(url).includes("demo_journeys")) return mockJson([{ id: journeyId, generated_briefing: "FatTrek briefing" }]);
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

test("renderable active preview selects its canonical completed job over a newer historical persist failure", async () => {
  const journeyId = "9a735e10-18e7-4b83-8cc7-e2518fa7959d";
  const failedJobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const completedJobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    const target = String(url);
    if (target.includes("website_build_jobs")) return mockJson([
      { id: failedJobId, demo_journey_id: journeyId, status: "retryable", current_step: "persist_generated_package", progress: 5, preview_version: 5, error_message: "oude persist-fout", created_at: "2026-07-18T06:11:17.000Z" },
      { id: completedJobId, demo_journey_id: journeyId, status: "completed", current_step: "completed", progress: 100, preview_version: 4, error_message: "historische fout", created_at: "2026-07-18T02:48:17.000Z" },
    ]);
    if (target.includes("website_preview_versions")) return mockJson([{
      id: completedJobId, demo_journey_id: journeyId, build_job_id: completedJobId, version: 4,
      preview_url: "/preview/v4", preview_token: "safe", metadata: { renderable: true }, is_active: true,
    }]);
    if (target.includes("demo_journeys")) return mockJson([{ id: journeyId, generated_briefing: "Heel je Zelf" }]);
    throw new Error(`Unexpected GET ${url}`);
  };
  try {
    const history = await getBuildHistory({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-role", admin: { id: "admin-id", role: "super_admin" } }, { demoJourneyId: journeyId });
    assert.equal(history.latestJob.id, completedJobId);
    assert.equal(history.latestJob.status, "completed");
    assert.equal(history.latestJob.errorMessage, "");
    assert.equal(history.activeVersion.id, completedJobId);
    assert.equal(history.serverState.previewRenderable, true);
    assert.equal(history.serverState.buildCompleted, true);
    assert.equal(history.serverState.buildRetryable, false);
    assert.equal(history.serverState.errorMessage, "");
    assert.equal(history.jobs[0].id, failedJobId);
    assert.equal(history.jobs.filter((job) => job.id === completedJobId).length, 1);
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
    if (String(url).includes("demo_journeys")) return mockJson([{ id: journeyId, generated_briefing: "FatTrek briefing" }]);
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

test("editor enrichment failures stay isolated and leave a renderable core package", async () => {
  for (const editor of ["image", "text", "hero"]) {
    const corePackage = buildQuick().generatedPackage;
    const result = await _private.prepareEditorPackageBestEffort(corePackage, {
      preparations: [{
        key: editor,
        prepare: async () => { throw Object.assign(new Error(`${editor} unavailable`), { code: `${editor.toUpperCase()}_PREPARATION_FAILED` }); },
      }],
      requestId: `REQ-${editor}`,
    });
    const manifest = result.generatedPackage.meta.editorManifest;
    const hero = manifest.pages[0].sections.find((section) => section.type === "hero");
    const textSection = manifest.pages[0].sections.find((section) => section.type === "text");
    assert.equal(result.stages[editor].availability, "read_only");
    assert.equal(runQualityCheck({ generatedPackage: result.generatedPackage, journey: { businessName: "FatTrek" } }).passed, true);
    assert.ok(result.generatedPackage.files.some((file) => file.path === "index.html" && /<\/html>/i.test(file.content)));
    if (editor === "image") {
      assert.equal(hero.imageEditor, undefined);
      assert.ok(hero.editor);
    }
    if (editor === "text") {
      assert.equal(textSection.editor, undefined);
      assert.ok(hero.editor);
    }
    if (editor === "hero") {
      assert.equal(hero.editor, undefined);
      assert.ok(hero.imageEditor);
    }
  }
});

test("normalized server state never reports briefing as next while a build runs", () => {
  const active = _private.deriveFactoryServerState({
    journey: { demoStatus: "briefing_klaar", generatedBriefing: "" },
    latestJob: { id: "job", status: "deploying", currentStep: "create_preview_version", progress: 90 },
    activeVersion: null,
  });
  assert.equal(active.state, "build_running");
  assert.equal(active.briefingReady, true);
  assert.equal(active.buildRunning, true);
  const retryable = _private.deriveFactoryServerState({
    journey: { demoStatus: "briefing_klaar" },
    latestJob: { id: "job", status: "retryable", currentStep: "create_preview_version", progress: 90 },
  });
  assert.equal(retryable.state, "build_retryable");
  assert.equal(retryable.retryable, true);

  const published = _private.deriveFactoryServerState({
    latestJob: { id: "job", status: "completed", currentStep: "completed", progress: 100 },
    activeVersion: { id: "version", renderable: true, publishedToPortal: true, feedbackCount: 2 },
  });
  assert.equal(published.state, "published");
  assert.equal(published.feedbackCount, 2);

  const approved = _private.deriveFactoryServerState({
    latestJob: { id: "job", status: "completed", currentStep: "completed", progress: 100 },
    activeVersion: { id: "version", renderable: true, status: "approved", approvedAt: "2026-07-16T15:00:00.000Z" },
  });
  assert.equal(approved.state, "approved");
});

test("new customer feedback is preview-owned while journey feedback stays legacy-only", () => {
  assert.match(demoBackend, /async function readCustomerPreviewVersion/);
  assert.match(demoBackend, /await patchCustomerPreviewVersion\(/);
  assert.match(demoBackend, /feedback_items: previewReview\.feedbackItems/);
  assert.match(demoBackend, /const record = \{\s*demo_status: nextStatus,/);
  assert.doesNotMatch(demoBackend, /const record = \{\s*feedback: feedback \|\| current\.feedback/);
  assert.match(factoryHtml, /feedback: Number\(pipeline\.feedbackCount \|\| 0\) > 0/);
});

test("Quick Build response is compact and never returns package bytes", () => {
  assert.doesNotMatch(demoBackend, /preview:\s*\{[\s\S]{0,600}files:\s*Object\.values/);
  assert.doesNotMatch(demoBackend, /preview:\s*\{[\s\S]{0,600}package:\s*buildResult/);
  assert.match(demoBackend, /fileCount:/);
  assert.match(demoBackend, /delete sanitized\.generated_package/);
  assert.match(demoBackend, /retryable,/);
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
