const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildWebsitePackage } = require("../functions/_website-factory-core");
const { validateEditorManifest } = require("../functions/_preview-editor-manifest");
const {
  extractHeroContext,
  isSafeLink,
  patchHeroPackage,
  validateHeroPatch,
} = require("../functions/_preview-editor-hero");
const editorApi = require("../functions/admin-preview-editor");
const parentBridge = require("../public/admin/ui/website-factory-preview-editor.js");

const IDS = {
  source: "11111111-1111-4111-8111-111111111111",
  other: "22222222-2222-4222-8222-222222222222",
  journey: "33333333-3333-4333-8333-333333333333",
  customer: "44444444-4444-4444-8444-444444444444",
  otherCustomer: "55555555-5555-4555-8555-555555555555",
  project: "66666666-6666-4666-8666-666666666666",
  website: "77777777-7777-4777-8777-777777777777",
  actor: "88888888-8888-4888-8888-888888888888",
  profile: "99999999-9999-4999-8999-999999999999",
};

const IDEMPOTENCY_KEY = "hero-edit-1234567890abcdef";

function factoryPackage() {
  return buildWebsitePackage({
    journey: { businessName: "Hero Edit Test", websiteUrl: "https://hero-edit.example", email: "info@hero-edit.example", phone: "0612345678" },
    briefing: "Branche: advies\nDiensten: Strategie, Advies, Uitvoering",
    version: 1,
  });
}

function sourceVersion(overrides = {}) {
  return {
    id: IDS.source,
    demo_journey_id: IDS.journey,
    build_job_id: IDS.other,
    customer_id: IDS.customer,
    project_id: IDS.project,
    website_id: IDS.website,
    version: 1,
    title: "Hero Edit Test — Factory preview",
    preview_url: `/.netlify/functions/demo-preview?id=${IDS.journey}`,
    preview_token: "0123456789abcdef0123456789abcdef",
    preview_score: 96,
    quality_report: { passed: true },
    generated_package: factoryPackage(),
    is_active: true,
    published_to_portal: true,
    published_at: "2026-07-16T08:00:00.000Z",
    status: "ready_for_review",
    metadata: { previewSource: "website_factory", publishedMarker: "keep-source" },
    created_by: IDS.actor,
    created_at: "2026-07-16T07:00:00.000Z",
    ...overrides,
  };
}

function scope(overrides = {}) {
  return {
    previewVersionId: IDS.source,
    demoJourneyId: IDS.journey,
    customerId: IDS.customer,
    projectId: IDS.project,
    websiteId: IDS.website,
    ...overrides,
  };
}

function event(method, payload = {}, requestId = "REQ-HERO-1") {
  return {
    httpMethod: method,
    headers: { authorization: "Bearer admin-session", "x-nf-request-id": requestId },
    queryStringParameters: method === "GET" ? payload : {},
    body: method === "POST" ? JSON.stringify(payload) : "",
  };
}

function parseResponse(response) {
  return JSON.parse(response.body || "{}");
}

function memoryApi(options = {}) {
  const tables = {
    website_preview_versions: [structuredClone(options.source || sourceVersion()), ...(options.versions || []).map(structuredClone)],
    demo_journeys: [{ id: IDS.journey, customer_id: IDS.customer, project_id: IDS.project, website_id: IDS.website, created_by: IDS.actor }],
    customers: [{ id: IDS.customer, metadata: { publishedPreviewVersionId: IDS.source } }],
    projects: [{ id: IDS.project, customer_id: IDS.customer, website_id: IDS.website }],
    websites: [{ id: IDS.website, customer_id: IDS.customer }],
  };
  const writes = [];
  let role = options.role || "admin";
  const fetch = async (input, request = {}) => {
    const url = new URL(String(input));
    const method = request.method || "GET";
    if (url.pathname.endsWith("/auth/v1/user")) return response(200, { id: IDS.actor, email: "admin@example.test" });
    if (url.pathname.endsWith("/rest/v1/profiles")) return response(200, [{ id: IDS.profile, auth_user_id: IDS.actor, role, status: "active" }]);
    const table = url.pathname.split("/").pop();
    if (!tables[table]) return response(404, { code: "TABLE_NOT_FOUND" });
    if (method === "GET") {
      let rows = tables[table].filter((row) => matches(row, url.searchParams));
      if (url.searchParams.get("order")?.startsWith("version.desc")) rows.sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
      const limit = Number(url.searchParams.get("limit") || rows.length);
      return response(200, rows.slice(0, limit));
    }
    const body = JSON.parse(request.body || "{}");
    if (method === "POST") {
      if (tables[table].some((row) => row.id === body.id || (row.demo_journey_id === body.demo_journey_id && Number(row.version) === Number(body.version)))) {
        return response(409, { code: "23505", message: "duplicate key violates unique constraint" });
      }
      tables[table].push(structuredClone(body));
      writes.push({ method, table, body: structuredClone(body) });
      return response(201, [structuredClone(body)]);
    }
    if (method === "PATCH") {
      const rows = tables[table].filter((row) => matches(row, url.searchParams));
      rows.forEach((row) => Object.assign(row, structuredClone(body)));
      writes.push({ method, table, body: structuredClone(body), count: rows.length });
      return response(200, rows.map((row) => structuredClone(row)));
    }
    return response(405, {});
  };
  return { tables, writes, fetch, setRole(value) { role = value; } };
}

function matches(row, params) {
  for (const [key, expression] of params.entries()) {
    if (["select", "limit", "order"].includes(key)) continue;
    if (expression.startsWith("eq.") && String(row[key] ?? "") !== expression.slice(3)) return false;
    if (expression.startsWith("neq.") && String(row[key] ?? "") === expression.slice(4)) return false;
  }
  return true;
}

function response(status, value) {
  return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(value) };
}

async function withApi(api, callback) {
  const previousFetch = global.fetch;
  const previousEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  global.fetch = api.fetch;
  try { return await callback(); } finally {
    global.fetch = previousFetch;
    Object.entries(previousEnv).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
  }
}

test("new Factory manifest exposes explicit Hero write capabilities only", () => {
  const manifest = validateEditorManifest(factoryPackage().meta.editorManifest);
  const hero = manifest.pages[0].sections.find((section) => section.id === "home.hero");
  const text = manifest.pages[0].sections.find((section) => section.type === "text");
  assert.equal(hero.editor.schema, "mws.hero.v1");
  assert.deepEqual(hero.editor.capabilities, ["write:eyebrow", "write:title", "write:subtitle", "write:primaryCtaText", "write:primaryCtaLink", "write:secondaryCtaText", "write:secondaryCtaLink"]);
  assert.equal(text.editor, undefined);
});

test("legacy v1 manifest remains valid for selection but has no write capability", async () => {
  const generated = factoryPackage();
  generated.meta.editorManifest = structuredClone(generated.meta.editorManifest);
  delete generated.meta.editorManifest.pages[0].sections[0].editor;
  assert.ok(validateEditorManifest(generated.meta.editorManifest));
  await assert.rejects(() => extractHeroContext(generated), { code: "HERO_WRITE_UNAVAILABLE" });
});

test("Hero extraction returns all supported values and read-only image", async () => {
  const hero = await extractHeroContext(factoryPackage());
  assert.equal(hero.schema.sectionId, "home.hero");
  assert.equal(hero.values.title.length > 0, true);
  assert.equal(hero.values.primaryCtaLink, "#contact");
  assert.match(hero.image.src, /^assets\//);
  assert.equal(hero.schema.imageReadOnly, true);
});

test("eyebrow is explicitly capability-driven and optional", async () => {
  const hero = await extractHeroContext(factoryPackage());
  const eyebrow = hero.schema.fields.find((field) => field.key === "eyebrow");
  assert.equal(eyebrow.optional, true);
  assert.equal(eyebrow.conditional, true);
});

test("parser patches title, subtitle and both CTA values without mutating source", async () => {
  const source = factoryPackage();
  const before = structuredClone(source);
  const hero = await extractHeroContext(source);
  const result = await patchHeroPackage(source, { title: "Nieuwe titel", subtitle: "Nieuwe subtitel", primaryCtaText: "Start nu", primaryCtaLink: "/start", secondaryCtaText: "Bel ons", secondaryCtaLink: "tel:+31851234567" }, hero.contentHash);
  assert.equal(result.values.title, "Nieuwe titel");
  assert.equal(result.values.primaryCtaLink, "/start");
  assert.deepEqual(source, before);
  assert.notEqual(result.contentHash, hero.contentHash);
});

test("all non-entry package files remain byte-for-byte unchanged", async () => {
  const source = factoryPackage();
  const hero = await extractHeroContext(source);
  const result = await patchHeroPackage(source, { title: "Alleen Hero verandert" }, hero.contentHash);
  source.files.slice(1).forEach((file, index) => assert.deepEqual(result.generatedPackage.files[index + 1], file));
});

test("HTML-like input is stored as safe text and never interpreted as markup", async () => {
  const source = factoryPackage();
  const hero = await extractHeroContext(source);
  const result = await patchHeroPackage(source, { title: "<img src=x onerror=alert(1)>" }, hero.contentHash);
  const html = result.generatedPackage.files.find((file) => file.path === "index.html").content;
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.equal(result.values.title, "<img src=x onerror=alert(1)>");
});

test("duplicate, missing and wrong Hero markers are hard failures", async () => {
  const duplicate = factoryPackage();
  const entry = duplicate.files.find((file) => file.path === "index.html");
  const heroHtml = entry.content.match(/<section class="hero"[\s\S]*?<\/section>/)[0];
  entry.content = entry.content.replace("</main>", `${heroHtml}</main>`);
  await assert.rejects(() => extractHeroContext(duplicate), { code: "EDITOR_MANIFEST_DOM_MISMATCH" });
  const missing = factoryPackage();
  missing.files[0].content = missing.files[0].content.replace('data-mws-section-id="home.hero"', "");
  await assert.rejects(() => extractHeroContext(missing), { code: "EDITOR_MANIFEST_DOM_MISMATCH" });
  const wrong = factoryPackage();
  wrong.files[0].content = wrong.files[0].content.replace('data-mws-section-type="hero"', 'data-mws-section-type="text"');
  await assert.rejects(() => extractHeroContext(wrong), { code: "EDITOR_MANIFEST_DOM_MISMATCH" });
});

test("duplicate and missing singular Hero field nodes are rejected", async () => {
  const duplicate = factoryPackage();
  duplicate.files[0].content = duplicate.files[0].content.replace('<h1 data-mws-field="title">', '<h1 data-mws-field="title"></h1><h1 data-mws-field="title">');
  await assert.rejects(() => extractHeroContext(duplicate), { code: "HERO_FIELD_MARKER_INVALID" });
  const missing = factoryPackage();
  missing.files[0].content = missing.files[0].content.replace('data-mws-field="primary-cta"', "");
  await assert.rejects(() => extractHeroContext(missing), { code: "EDITOR_MANIFEST_DOM_MISMATCH" });
});

test("base content hash mismatch returns EDIT_CONFLICT", async () => {
  await assert.rejects(() => patchHeroPackage(factoryPackage(), { title: "Conflict" }, "a".repeat(64)), { code: "EDIT_CONFLICT", status: 409 });
});

test("link policy allows only approved secure protocols and paths", () => {
  ["/contact", "#contact", "https://example.test/contact", "mailto:info@example.test", "tel:+31851234567"].forEach((value) => assert.equal(isSafeLink(value), true, value));
  ["http://example.test", "javascript:alert(1)", "data:text/html,x", "vbscript:x", "//evil.example", "/path with spaces"].forEach((value) => assert.equal(isSafeLink(value), false, value));
});

test("server schema rejects unsafe links, control characters, oversized fields and unknown keys", async () => {
  const hero = await extractHeroContext(factoryPackage());
  assert.throws(() => validateHeroPatch({ primaryCtaLink: "javascript:alert(1)" }, hero.values, hero.availableFields), { code: "HERO_LINK_UNSAFE" });
  assert.throws(() => validateHeroPatch({ title: `Fout\u0000` }, hero.values, hero.availableFields), { code: "HERO_FIELD_INVALID" });
  assert.throws(() => validateHeroPatch({ title: "x".repeat(181) }, hero.values, hero.availableFields), { code: "HERO_FIELD_TOO_LONG" });
  assert.throws(() => validateHeroPatch({ html: "<h1>bad</h1>" }, hero.values, hero.availableFields), { code: "HERO_CAPABILITY_MISMATCH" });
});

test("GET Hero requires active admin and returns validated values without package HTML", async () => {
  const api = memoryApi();
  await withApi(api, async () => {
    const response = await editorApi.handler(event("GET", scope()));
    const body = parseResponse(response);
    assert.equal(response.statusCode, 200);
    assert.equal(body.hero.sectionId, "home.hero");
    assert.equal(body.hero.sourcePreviewVersionId, IDS.source);
    assert.equal(body.previewVersion.generatedPackage, undefined);
  });
});

test("sales_partner has no Hero write or read access", async () => {
  const api = memoryApi({ role: "sales_partner" });
  await withApi(api, async () => {
    const response = await editorApi.handler(event("POST", { action: "save_hero_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: "a".repeat(64), idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Niet toegestaan" } }));
    assert.equal(response.statusCode, 401);
    assert.equal(api.writes.length, 0);
  });
});

test("cross-customer and wrong section requests are rejected", async () => {
  const api = memoryApi();
  await withApi(api, async () => {
    const cross = await editorApi.handler(event("GET", scope({ customerId: IDS.otherCustomer })));
    assert.equal(cross.statusCode, 409);
    assert.equal(parseResponse(cross).code, "PREVIEW_SCOPE_MISMATCH");
    const hero = await extractHeroContext(api.tables.website_preview_versions[0].generated_package);
    const wrong = await editorApi.handler(event("POST", { action: "save_hero_preview", ...scope(), sectionId: "home.services", sectionType: "services", baseContentHash: hero.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Fout" } }));
    assert.equal(wrong.statusCode, 400);
    assert.equal(parseResponse(wrong).code, "HERO_SECTION_INVALID");
  });
});

test("save creates exactly one immutable internal version with lineage and leaves publication untouched", async () => {
  const api = memoryApi();
  const original = structuredClone(api.tables.website_preview_versions[0]);
  const hero = await extractHeroContext(original.generated_package);
  await withApi(api, async () => {
    const response = await editorApi.handler(event("POST", { action: "save_hero_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: hero.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Nieuw concept" } }));
    const body = parseResponse(response);
    assert.equal(response.statusCode, 201);
    assert.equal(body.message, "Nieuwe conceptpreview opgeslagen. De klantversie is niet gewijzigd.");
    assert.equal(api.tables.website_preview_versions.length, 2);
    const created = api.tables.website_preview_versions.find((row) => row.id === body.previewVersion.id);
    assert.equal(created.version, 2);
    assert.equal(created.status, "internal");
    assert.equal(created.published_to_portal, false);
    assert.equal(created.metadata.parentPreviewVersionId, IDS.source);
    assert.equal(created.metadata.revisionKind, "section_edit");
    assert.equal(created.metadata.editedSectionId, "home.hero");
    assert.equal(created.metadata.baseContentHash, hero.contentHash);
    assert.deepEqual(api.tables.website_preview_versions.find((row) => row.id === IDS.source).generated_package, original.generated_package);
    assert.equal(api.tables.website_preview_versions.find((row) => row.id === IDS.source).published_to_portal, true);
    assert.equal(api.tables.customers[0].metadata.publishedPreviewVersionId, IDS.source);
    assert.equal(api.writes.some((write) => write.table === "customers"), false);
  });
});

test("same idempotency key and patch reuses exact version, including retry after insert", async () => {
  const api = memoryApi();
  const hero = await extractHeroContext(api.tables.website_preview_versions[0].generated_package);
  const payload = { action: "save_hero_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: hero.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Idempotent" } };
  await withApi(api, async () => {
    const first = parseResponse(await editorApi.handler(event("POST", payload, "REQ-FIRST")));
    const secondResponse = await editorApi.handler(event("POST", payload, "REQ-RETRY"));
    const second = parseResponse(secondResponse);
    assert.equal(secondResponse.statusCode, 200);
    assert.equal(second.reused, true);
    assert.equal(second.previewVersion.id, first.previewVersion.id);
    assert.equal(api.tables.website_preview_versions.length, 2);
    assert.equal(api.writes.filter((write) => write.method === "POST").length, 1);
  });
});

test("same idempotency key with another patch is rejected", async () => {
  const api = memoryApi();
  const hero = await extractHeroContext(api.tables.website_preview_versions[0].generated_package);
  await withApi(api, async () => {
    const base = { action: "save_hero_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: hero.contentHash, idempotencyKey: IDEMPOTENCY_KEY };
    await editorApi.handler(event("POST", { ...base, patch: { title: "Eerste" } }));
    const response = await editorApi.handler(event("POST", { ...base, patch: { title: "Andere" } }));
    assert.equal(response.statusCode, 409);
    assert.equal(parseResponse(response).code, "IDEMPOTENCY_KEY_REUSED");
    assert.equal(api.tables.website_preview_versions.length, 2);
  });
});

test("stale active source and stale hash return concrete EDIT_CONFLICT", async () => {
  const api = memoryApi();
  const hero = await extractHeroContext(api.tables.website_preview_versions[0].generated_package);
  api.tables.website_preview_versions[0].is_active = false;
  api.tables.website_preview_versions.push(sourceVersion({ id: IDS.other, version: 2, is_active: true, published_to_portal: false }));
  await withApi(api, async () => {
    const stale = await editorApi.handler(event("POST", { action: "save_hero_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: hero.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Stale" } }));
    assert.equal(stale.statusCode, 409);
    assert.equal(parseResponse(stale).code, "EDIT_CONFLICT");
  });
  const hashApi = memoryApi();
  await withApi(hashApi, async () => {
    const mismatch = await editorApi.handler(event("POST", { action: "save_hero_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: "f".repeat(64), idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Hash" } }));
    assert.equal(mismatch.statusCode, 409);
    assert.equal(parseResponse(mismatch).code, "EDIT_CONFLICT");
  });
});

test("frontend validation matches server constraints and temporary preview remains bridge-only", () => {
  const schema = { fields: [
    { key: "title", label: "Titel", maxLength: 180, required: true },
    { key: "primaryCtaLink", label: "Primaire knoplink", maxLength: 2048, format: "safe_link" },
  ] };
  assert.deepEqual(parentBridge.validateHeroDraft(schema, { title: "Geldig", primaryCtaLink: "#contact" }), {});
  assert.equal(parentBridge.validateHeroDraft(schema, { title: "", primaryCtaLink: "javascript:x" }).title, "Titel is verplicht.");
  const parentSource = fs.readFileSync(path.join(__dirname, "../public/admin/ui/website-factory-preview-editor.js"), "utf8");
  assert.match(parentSource, /postToPreview\("APPLY_HERO_PATCH"/);
  assert.match(parentSource, /postToPreview\("RESET_HERO_PATCH"/);
  assert.doesNotMatch(parentSource, /APPLY_HERO_PATCH[\s\S]{0,200}editorRequest/);
});

test("UI retains draft values on save error and reports request id once", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/admin/ui/website-factory-preview-editor.js"), "utf8");
  assert.match(source, /catch \(error\) \{\s*state\.saving = false;\s*renderHeroEditor\(requestMessage\(error\)\)/);
  assert.match(source, /!base\.includes\(error\.requestId\)/);
  assert.match(source, /Nieuwe conceptpreview opgeslagen\. De klantversie is niet gewijzigd\./);
});

test("ZIP sources remain read-only and no image write capability exists", () => {
  const runtime = fs.readFileSync(path.join(__dirname, "../functions/_preview-editor-runtime.js"), "utf8");
  const api = fs.readFileSync(path.join(__dirname, "../functions/admin-preview-editor.js"), "utf8");
  assert.match(api, /previewSource\) !== "website_factory"/);
  assert.doesNotMatch(runtime, /write:image/);
  assert.match(fs.readFileSync(path.join(__dirname, "../public/admin/ui/website-factory-preview-editor.js"), "utf8"), /Afbeeldingen aanpassen volgt in Sprint 2B\.3\./);
});

test("client publication remains an explicit independent pointer", () => {
  const publication = fs.readFileSync(path.join(__dirname, "../functions/admin-preview-publication.js"), "utf8");
  const client = fs.readFileSync(path.join(__dirname, "../functions/client-preview-render.js"), "utf8");
  assert.match(publication, /publishedPreviewVersionId: version\.id/);
  assert.match(client, /published_to_portal=eq\.true/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "../functions/admin-preview-editor.js"), "utf8"), /publishedPreviewVersionId/);
});
