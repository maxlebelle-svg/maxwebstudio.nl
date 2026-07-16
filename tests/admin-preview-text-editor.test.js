const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildWebsitePackage } = require("../functions/_website-factory-core");
const { validateEditorManifest } = require("../functions/_preview-editor-manifest");
const { extractHeroContext } = require("../functions/_preview-editor-hero");
const { extractTextContext, patchTextPackage, prepareTextEditorPackage, validateTextPatch } = require("../functions/_preview-editor-text");
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
const IDEMPOTENCY_KEY = "text-edit-1234567890abcdef";

function factoryPackage(businessName = "Tekst Edit Test") {
  return buildWebsitePackage({ journey: { businessName, websiteUrl: "https://text-edit.example", email: "info@text-edit.example", phone: "0612345678" }, briefing: "Branche: advies\nDiensten: Strategie, Advies, Uitvoering", version: 1 });
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
    title: "Tekst Edit Test — Factory preview",
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
  return { previewVersionId: IDS.source, demoJourneyId: IDS.journey, customerId: IDS.customer, projectId: IDS.project, websiteId: IDS.website, sectionId: "home.introduction", sectionType: "text", ...overrides };
}

function event(method, payload = {}, requestId = "REQ-TEXT-1") {
  return { httpMethod: method, headers: { authorization: "Bearer admin-session", "x-nf-request-id": requestId }, queryStringParameters: method === "GET" ? payload : {}, body: method === "POST" ? JSON.stringify(payload) : "" };
}

function parseResponse(response) { return JSON.parse(response.body || "{}"); }

function memoryApi(options = {}) {
  const tables = {
    website_preview_versions: [structuredClone(options.source || sourceVersion()), ...(options.versions || []).map(structuredClone)],
    demo_journeys: [{ id: IDS.journey, customer_id: IDS.customer, project_id: IDS.project, website_id: IDS.website, created_by: IDS.actor }],
    customers: [{ id: IDS.customer, metadata: { publishedPreviewVersionId: IDS.source } }],
    projects: [{ id: IDS.project, customer_id: IDS.customer, website_id: IDS.website }],
    websites: [{ id: IDS.website, customer_id: IDS.customer }],
  };
  const writes = [];
  const role = options.role || "admin";
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
      return response(200, rows.slice(0, Number(url.searchParams.get("limit") || rows.length)));
    }
    const body = JSON.parse(request.body || "{}");
    if (method === "POST") {
      if (tables[table].some((row) => row.id === body.id || (row.demo_journey_id === body.demo_journey_id && Number(row.version) === Number(body.version)))) return response(409, { code: "23505", message: "duplicate key" });
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
  return { tables, writes, fetch };
}

function matches(row, params) {
  for (const [key, raw] of params.entries()) {
    if (["select", "limit", "order"].includes(key)) continue;
    const [op, ...parts] = raw.split(".");
    const value = decodeURIComponent(parts.join("."));
    if (op === "eq" && String(row[key] ?? "") !== value) return false;
    if (op === "neq" && String(row[key] ?? "") === value) return false;
  }
  return true;
}

function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

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

test("standard and VM introductions expose only mws.text.v1 capabilities", async () => {
  for (const name of ["Tekst Edit Test", "VM Tegelwerken"]) {
    const generated = factoryPackage(name);
    const manifest = validateEditorManifest(generated.meta.editorManifest);
    const section = manifest.pages[0].sections.find((item) => item.id === "home.introduction");
    assert.equal(section.type, "text");
    assert.equal(section.editor.schema, "mws.text.v1");
    assert.deepEqual(section.editor.capabilities, ["write:eyebrow", "write:title", "write:body"]);
    assert.deepEqual((await extractTextContext(generated)).availableFields, ["eyebrow", "title", "body"]);
  }
});

test("text manifest rejects a wrong schema and capability mismatch", () => {
  const wrongSchema = factoryPackage();
  wrongSchema.meta.editorManifest = structuredClone(wrongSchema.meta.editorManifest);
  const wrongSchemaSection = wrongSchema.meta.editorManifest.pages[0].sections.find((section) => section.id === "home.introduction");
  wrongSchemaSection.editor.schema = "mws.unknown.v1";
  assert.equal(validateEditorManifest(wrongSchema.meta.editorManifest), null);

  const wrongCapabilities = factoryPackage();
  wrongCapabilities.meta.editorManifest = structuredClone(wrongCapabilities.meta.editorManifest);
  const wrongCapabilitySection = wrongCapabilities.meta.editorManifest.pages[0].sections.find((section) => section.id === "home.introduction");
  wrongCapabilitySection.editor.capabilities = wrongCapabilitySection.editor.capabilities.filter((capability) => capability !== "write:title");
  assert.equal(validateEditorManifest(wrongCapabilities.meta.editorManifest), null);
});

test("text extraction loads current values, paragraphs and read-only image", async () => {
  const standard = await extractTextContext(factoryPackage());
  assert.ok(standard.values.eyebrow);
  assert.ok(standard.values.title);
  assert.equal(standard.values.body.length, 1);
  const vm = await extractTextContext(factoryPackage("VM Tegelwerken"));
  assert.ok(vm.image?.src);
});

test("text patch changes only the selected fields and keeps all other files byte-identical", async () => {
  const source = factoryPackage();
  const context = await extractTextContext(source);
  const result = await patchTextPackage(source, { eyebrow: "Nieuwe kicker", title: "Nieuwe titel", body: ["Eerste paragraaf", "Tweede paragraaf"] }, context.contentHash);
  assert.deepEqual(result.values, { eyebrow: "Nieuwe kicker", title: "Nieuwe titel", body: ["Eerste paragraaf", "Tweede paragraaf"] });
  assert.deepEqual(source.files.slice(1), result.generatedPackage.files.slice(1));
  assert.equal((await extractHeroContext(result.generatedPackage)).values.title, (await extractHeroContext(source)).values.title);
});

test("HTML-like text remains text and body creates only normal paragraphs", async () => {
  const source = factoryPackage();
  const context = await extractTextContext(source);
  const result = await patchTextPackage(source, { title: "<script>alert(1)</script>", body: ["<img src=x onerror=alert(1)>", "Veilig"] }, context.contentHash);
  const html = result.generatedPackage.files.find((file) => file.path === "index.html").content;
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>|<img src=x onerror/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.deepEqual(result.values.body, ["<img src=x onerror=alert(1)>", "Veilig"]);
});

test("text schema rejects control characters, limits and unknown capabilities", async () => {
  const context = await extractTextContext(factoryPackage());
  assert.throws(() => validateTextPatch({ title: `Fout\u0000` }, context.values, context.availableFields), { code: "TEXT_FIELD_INVALID" });
  assert.throws(() => validateTextPatch({ title: "x".repeat(181) }, context.values, context.availableFields), { code: "TEXT_FIELD_TOO_LONG" });
  assert.throws(() => validateTextPatch({ body: ["x".repeat(1001)] }, context.values, context.availableFields), { code: "TEXT_PARAGRAPH_TOO_LONG" });
  assert.throws(() => validateTextPatch({ body: Array.from({ length: 13 }, () => "tekst") }, context.values, context.availableFields), { code: "TEXT_BODY_TOO_MANY_PARAGRAPHS" });
  assert.throws(() => validateTextPatch({ body: ["x".repeat(900), "x".repeat(900), "x".repeat(900), "x".repeat(900), "x".repeat(500)] }, context.values, context.availableFields), { code: "TEXT_BODY_TOO_LONG" });
  assert.throws(() => validateTextPatch({ html: "<p>nee</p>" }, context.values, context.availableFields), { code: "TEXT_CAPABILITY_MISMATCH" });
});

test("missing optional eyebrow removes only its capability while duplicate critical markers fail", async () => {
  const missing = factoryPackage();
  const missingEntry = missing.files.find((file) => file.path === "index.html");
  const introductionStart = missingEntry.content.indexOf('data-mws-section-id="home.introduction"');
  const eyebrowStart = missingEntry.content.indexOf(' data-mws-field="eyebrow"', introductionStart);
  assert.ok(introductionStart >= 0 && eyebrowStart > introductionStart);
  missingEntry.content = `${missingEntry.content.slice(0, eyebrowStart)}${missingEntry.content.slice(eyebrowStart + ' data-mws-field="eyebrow"'.length)}`;
  const prepared = await prepareTextEditorPackage(missing);
  const context = await extractTextContext(prepared.generatedPackage);
  assert.equal(prepared.availability, "editable");
  assert.deepEqual(context.availableFields, ["title", "body"]);
  const duplicate = factoryPackage();
  duplicate.files.find((file) => file.path === "index.html").content = duplicate.files.find((file) => file.path === "index.html").content.replace('<div data-mws-field="body">', '<div data-mws-field="body"></div><div data-mws-field="body">');
  await assert.rejects(() => prepareTextEditorPackage(duplicate), { code: "TEXT_FIELD_MARKER_AMBIGUOUS", status: 422 });
});

test("GET returns only the validated text section and enforces scope and roles", async () => {
  const api = memoryApi();
  await withApi(api, async () => {
    const ok = await editorApi.handler(event("GET", scope()));
    assert.equal(ok.statusCode, 200);
    assert.equal(parseResponse(ok).textSection.schema.id, "mws.text.v1");
    assert.equal(parseResponse(ok).textSection.values.body.length, 1);
    const cross = await editorApi.handler(event("GET", scope({ customerId: IDS.otherCustomer })));
    assert.equal(cross.statusCode, 409);
    assert.equal(parseResponse(cross).code, "PREVIEW_SCOPE_MISMATCH");
  });
  const denied = memoryApi({ role: "sales_partner" });
  await withApi(denied, async () => assert.notEqual((await editorApi.handler(event("GET", scope()))).statusCode, 200));
});

test("wrong text section, type and action are rejected before patching", async () => {
  const api = memoryApi();
  await withApi(api, async () => {
    for (const payload of [
      { action: "save_text_preview", ...scope({ sectionId: "home.services" }) },
      { action: "save_text_preview", ...scope({ sectionType: "about" }) },
      { action: "save_unknown_preview", ...scope() },
    ]) {
      const response = await editorApi.handler(event("POST", { ...payload, baseContentHash: "a".repeat(64), idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Fout" } }));
      assert.equal(response.statusCode, 400);
    }
  });
});

test("text save creates one immutable internal version with exact lineage and unchanged publication", async () => {
  const api = memoryApi();
  const original = structuredClone(api.tables.website_preview_versions[0]);
  const context = await extractTextContext(original.generated_package);
  await withApi(api, async () => {
    const response = await editorApi.handler(event("POST", { action: "save_text_preview", ...scope(), baseContentHash: context.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Nieuw tekstconcept", body: ["Een", "Twee"] } }));
    const body = parseResponse(response);
    assert.equal(response.statusCode, 201);
    assert.equal(api.tables.website_preview_versions.length, 2);
    const created = api.tables.website_preview_versions.find((row) => row.id === body.previewVersion.id);
    assert.equal(created.status, "internal");
    assert.equal(created.build_job_id, null);
    assert.equal(created.published_to_portal, false);
    assert.equal(created.metadata.parentPreviewVersionId, IDS.source);
    assert.equal(created.metadata.sourceBuildJobId, IDS.other);
    assert.equal(created.metadata.editedSectionId, "home.introduction");
    assert.equal(created.metadata.editedSectionType, "text");
    assert.equal(created.metadata.editorSchemaVersion, "mws.text.v1");
    assert.deepEqual(api.tables.website_preview_versions.find((row) => row.id === IDS.source).generated_package, original.generated_package);
    assert.equal(api.tables.customers[0].metadata.publishedPreviewVersionId, IDS.source);
    assert.equal(api.writes.some((write) => write.table === "customers"), false);
    assert.equal((await extractTextContext(created.generated_package)).values.title, "Nieuw tekstconcept");
  });
});

test("text retry is idempotent and key reuse with another patch is rejected", async () => {
  const api = memoryApi();
  const context = await extractTextContext(api.tables.website_preview_versions[0].generated_package);
  const payload = { action: "save_text_preview", ...scope(), baseContentHash: context.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Idempotent" } };
  await withApi(api, async () => {
    const first = parseResponse(await editorApi.handler(event("POST", payload)));
    const retry = await editorApi.handler(event("POST", payload));
    assert.equal(retry.statusCode, 200);
    assert.equal(parseResponse(retry).reused, true);
    assert.equal(parseResponse(retry).previewVersion.id, first.previewVersion.id);
    assert.equal(api.writes.filter((write) => write.method === "POST").length, 1);
    const mismatch = await editorApi.handler(event("POST", { ...payload, patch: { title: "Anders" } }));
    assert.equal(mismatch.statusCode, 409);
    assert.equal(parseResponse(mismatch).code, "IDEMPOTENCY_KEY_REUSED");
  });
});

test("stale active source and stale text hash return EDIT_CONFLICT", async () => {
  const staleApi = memoryApi();
  const context = await extractTextContext(staleApi.tables.website_preview_versions[0].generated_package);
  staleApi.tables.website_preview_versions[0].is_active = false;
  staleApi.tables.website_preview_versions.push(sourceVersion({ id: IDS.other, version: 2, is_active: true, published_to_portal: false }));
  await withApi(staleApi, async () => {
    const response = await editorApi.handler(event("POST", { action: "save_text_preview", ...scope(), baseContentHash: context.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Stale" } }));
    assert.equal(response.statusCode, 409);
    assert.equal(parseResponse(response).code, "EDIT_CONFLICT");
  });
  const hashApi = memoryApi();
  await withApi(hashApi, async () => {
    const response = await editorApi.handler(event("POST", { action: "save_text_preview", ...scope(), baseContentHash: "f".repeat(64), idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Hash" } }));
    assert.equal(response.statusCode, 409);
    assert.equal(parseResponse(response).code, "EDIT_CONFLICT");
  });
});

test("Hero and text saves from one old source cannot overwrite each other", async () => {
  const api = memoryApi();
  const hero = await extractHeroContext(api.tables.website_preview_versions[0].generated_package);
  const textContext = await extractTextContext(api.tables.website_preview_versions[0].generated_package);
  await withApi(api, async () => {
    const heroResponse = await editorApi.handler(event("POST", { action: "save_hero_preview", ...scope({ sectionId: "home.hero", sectionType: "hero" }), baseContentHash: hero.contentHash, idempotencyKey: "hero-after-text-1234567890", patch: { title: "Hero eerst" } }));
    assert.equal(heroResponse.statusCode, 201);
    const textResponse = await editorApi.handler(event("POST", { action: "save_text_preview", ...scope(), baseContentHash: textContext.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { title: "Tekst tweede" } }));
    assert.equal(textResponse.statusCode, 409);
    assert.equal(parseResponse(textResponse).code, "EDIT_CONFLICT");
  });
});

test("legacy and ZIP previews remain read-only for text writes", async () => {
  const legacy = sourceVersion();
  legacy.generated_package.meta.editorManifest = structuredClone(legacy.generated_package.meta.editorManifest);
  delete legacy.generated_package.meta.editorManifest.pages[0].sections.find((item) => item.id === "home.introduction").editor;
  for (const source of [legacy, sourceVersion({ metadata: { previewSource: "manual_zip" } })]) {
    const api = memoryApi({ source });
    await withApi(api, async () => {
      const response = await editorApi.handler(event("GET", scope()));
      assert.equal(response.statusCode, 409);
    });
  }
});

test("frontend text model normalizes blank lines and temporary patch stays bridge-only", () => {
  assert.deepEqual(parentBridge.textParagraphs(" Een \n\n\n Twee\r\n\r\nDrie "), ["Een", "Twee", "Drie"]);
  const schema = { fields: [
    { key: "title", label: "Titel", target: "text", maxLength: 180, required: true },
    { key: "body", label: "Body", target: "paragraphs", maxLength: 4000, maxParagraphs: 12, maxParagraphLength: 1000 },
  ] };
  assert.deepEqual(parentBridge.validateTextDraft(schema, { title: "Geldig", body: "Een\n\nTwee" }), {});
  const source = fs.readFileSync(path.join(__dirname, "../public/admin/ui/website-factory-preview-editor.js"), "utf8");
  assert.match(source, /postToPreview\("APPLY_TEXT_SECTION_PATCH"/);
  assert.match(source, /postToPreview\("RESET_TEXT_SECTION_PATCH"/);
  assert.doesNotMatch(source, /APPLY_TEXT_SECTION_PATCH[\s\S]{0,240}editorRequest/);
  assert.match(source, /catch \(error\) \{\s*state\.saving = false;\s*renderTextEditor\(requestMessage\(error\)\)/);
  assert.match(source, /if \(writableHero\) \{[\s\S]{0,100}state\.textSection = null;/);
  assert.match(source, /else if \(writableText\) \{[\s\S]{0,100}state\.hero = null;/);
  assert.match(source, /Log opnieuw in om de preview te bewerken\./);
});

test("runtime accepts only explicit text patch messages and never enables ZIP writes", () => {
  const runtime = fs.readFileSync(path.join(__dirname, "../functions/_preview-editor-runtime.js"), "utf8");
  assert.match(runtime, /APPLY_TEXT_SECTION_PATCH/);
  assert.match(runtime, /RESET_TEXT_SECTION_PATCH/);
  assert.match(runtime, /document\.createElement\("p"\)/);
  assert.match(runtime, /paragraph\.textContent = item/);
  assert.doesNotMatch(runtime, /innerHTML\s*=/);
  assert.match(runtime, /APPLY_IMAGE_PATCH/);
  assert.match(fs.readFileSync(path.join(__dirname, "../functions/_preview-editor-access.js"), "utf8"), /previewSource\) !== "website_factory"/);
});
