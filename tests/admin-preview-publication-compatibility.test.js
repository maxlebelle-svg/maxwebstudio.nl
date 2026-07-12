const assert = require("assert");
const publication = require("../functions/admin-preview-publication");
const { _private } = publication;

const ids = {
  customerA: "11111111-1111-4111-8111-111111111111",
  customerB: "22222222-2222-4222-8222-222222222222",
  websiteA: "33333333-3333-4333-8333-333333333333",
  websiteA2: "44444444-4444-4444-8444-444444444444",
  websiteB: "55555555-5555-4555-8555-555555555555",
  projectA: "66666666-6666-4666-8666-666666666666",
  journeyA: "77777777-7777-4777-8777-777777777777",
  leadA: "88888888-8888-4888-8888-888888888888",
  buildJobA: "99999999-9999-4999-8999-999999999999",
  previewLegacy: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  previewModern: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  previewManual: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTables({ ambiguousWebsite = false } = {}) {
  return {
    customers: [
      { id: ids.customerA, name: "QuantumBouw", company: "QuantumBouw B.V.", email: "info@quantumbouw.nl", website: "https://quantumbouw.nl", metadata: { publishedPreviewVersionId: ids.previewModern } },
      { id: ids.customerB, name: "Andere klant", company: "Andere klant B.V.", email: "info@example.nl", website: "https://andere.nl" },
    ],
    websites: [
      { id: ids.websiteA, customer_id: ids.customerA, name: "QuantumBouw", domain: "quantumbouw.nl", status: "in_ontwikkeling" },
      ...(ambiguousWebsite ? [{ id: ids.websiteA2, customer_id: ids.customerA, name: "Tweede site", domain: "tweede.nl", status: "in_ontwikkeling" }] : []),
      { id: ids.websiteB, customer_id: ids.customerB, name: "Andere site", domain: "andere.nl", status: "online" },
    ],
    projects: [
      { id: ids.projectA, customer_id: ids.customerA, website_id: ids.websiteA, name: "Website QuantumBouw", status: "in_ontwikkeling", updated_at: "2026-07-11T10:00:00Z" },
    ],
    leads: [
      { id: ids.leadA, customer_id: ids.customerA, converted_customer_id: null },
    ],
    demo_journeys: [
      { id: ids.journeyA, lead_id: ids.leadA, customer_id: ids.customerA, business_name: "QuantumBouw", email: "info@quantumbouw.nl", website_url: "https://quantumbouw.nl", preview_url: "/demo-preview.html?id=legacy", preview_token: "journey-token" },
    ],
    website_build_jobs: [
      { id: ids.buildJobA, demo_journey_id: ids.journeyA, lead_id: ids.leadA, customer_id: ids.customerA, preview_url: "/demo-preview.html?id=legacy", preview_token: "legacy-token" },
    ],
    website_preview_versions: [
      {
        id: ids.previewLegacy,
        demo_journey_id: ids.journeyA,
        build_job_id: ids.buildJobA,
        website_id: null,
        project_id: null,
        customer_id: null,
        version: 2,
        title: null,
        preview_url: "/demo-preview.html?id=legacy&token=legacy-token",
        preview_token: "legacy-token",
        preview_score: 94,
        quality_report: { passed: true },
        generated_package: { pages: ["home"] },
        is_active: true,
        published_to_portal: false,
        feedback_items: [],
        created_at: "2026-07-10T10:00:00Z",
      },
      {
        id: ids.previewModern,
        demo_journey_id: ids.journeyA,
        build_job_id: ids.buildJobA,
        website_id: ids.websiteA,
        project_id: ids.projectA,
        customer_id: ids.customerA,
        version: 3,
        title: "Modern preview",
        preview_url: "/demo-preview.html?id=modern&token=modern-token",
        preview_token: "modern-token",
        preview_score: 98,
        quality_report: { passed: true },
        generated_package: { pages: ["home", "diensten"] },
        is_active: true,
        published_to_portal: false,
        feedback_items: [],
        created_at: "2026-07-11T10:00:00Z",
      },
    ],
  };
}

function installFetchMock(tables) {
  const writes = [];
  global.fetch = async (url, fetchOptions = {}) => {
    const parsed = new URL(url);
    const table = parsed.pathname.split("/").pop();
    if (!tables[table]) return response(404, { message: `Unknown table ${table}` });
    if (table === "leads" && fetchOptions?.method !== "PATCH") {
      const select = parsed.searchParams.get("select") || "";
      if (global.__missingLeadCustomerColumns && (select.includes("customer_id") || select.includes("converted_customer_id"))) {
        return response(400, { code: "42703", message: select.includes("customer_id") ? "column leads.customer_id does not exist" : "column leads.converted_customer_id does not exist" });
      }
    }
    if ((fetchOptions.method || "GET") === "PATCH") {
      const id = filterEq(parsed.searchParams.get("id"));
      const record = JSON.parse(fetchOptions.body || "{}");
      const rows = tables[table].filter((row) => row.id === id);
      rows.forEach((row) => Object.assign(row, record));
      writes.push({ table, id, record });
      return response(200, rows);
    }
    return response(200, applyQuery(tables[table], parsed.searchParams));
  };
  return writes;
}

function applyQuery(rows, params) {
  let result = rows.map(clone);
  for (const [key, value] of params.entries()) {
    if (["select", "order", "limit", "or"].includes(key)) continue;
    if (value.startsWith("eq.")) result = result.filter((row) => String(row[key] || "") === filterEq(value));
    if (value === "is.null") result = result.filter((row) => row[key] == null || row[key] === "");
    if (value.startsWith("in.(")) {
      const values = value.slice(4, -1).split(",").filter(Boolean);
      result = result.filter((row) => values.includes(String(row[key] || "")));
    }
  }
  const or = params.get("or");
  if (or) {
    const match = or.match(/^\(([^.]+)\.eq\.([^,]+),([^.]+)\.eq\.([^)]+)\)$/);
    if (match) result = result.filter((row) => String(row[match[1]] || "") === match[2] || String(row[match[3]] || "") === match[4]);
  }
  const order = params.get("order") || "";
  if (order.startsWith("version.desc")) result.sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
  if (order.startsWith("updated_at.desc")) result.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  const limit = Number(params.get("limit") || 0);
  return limit ? result.slice(0, limit) : result;
}

function filterEq(value = "") {
  return String(value).replace(/^eq\./, "");
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function context() {
  return {
    available: true,
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    admin: { id: "admin-auth-id", profileId: "admin-profile-id", email: "admin@maxwebstudio.nl" },
  };
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

async function run() {
  let tables = createTables();
  let writes = installFetchMock(tables);
  const previousEnv = {
    adminToken: process.env.ADMIN_TOKEN,
    allowLegacyAdminToken: process.env.ALLOW_LEGACY_ADMIN_TOKEN,
    appEnv: process.env.APP_ENV,
    context: process.env.CONTEXT,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.ADMIN_TOKEN = "test-admin-token";
  process.env.ALLOW_LEGACY_ADMIN_TOKEN = "true";
  process.env.APP_ENV = "test";
  process.env.CONTEXT = "dev";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  const mismatchResponse = await publication.handler({
    httpMethod: "GET",
    headers: { Authorization: "Bearer test-admin-token" },
    queryStringParameters: {
      websiteId: ids.websiteA,
      customerId: ids.customerB,
      projectId: ids.projectA,
    },
  });
  assert.strictEqual(mismatchResponse.statusCode, 409, "website/customer mismatch should return JSON 409 instead of an async function crash");
  const mismatchBody = JSON.parse(mismatchResponse.body);
  assert.strictEqual(mismatchBody.code, "PREVIEW_CUSTOMER_MISMATCH");
  restoreEnv("ADMIN_TOKEN", previousEnv.adminToken);
  restoreEnv("ALLOW_LEGACY_ADMIN_TOKEN", previousEnv.allowLegacyAdminToken);
  restoreEnv("APP_ENV", previousEnv.appEnv);
  restoreEnv("CONTEXT", previousEnv.context);
  restoreEnv("SUPABASE_URL", previousEnv.supabaseUrl);
  restoreEnv("SUPABASE_SERVICE_ROLE_KEY", previousEnv.serviceRoleKey);

  const versions = await _private.findPreviewVersionsForWebsite(context(), {
    website: tables.websites[0],
    selectedCustomerId: ids.customerA,
    selectedProjectId: ids.projectA,
  });
  assert(versions.some((version) => version.id === ids.previewLegacy), "legacy preview should be visible");
  assert(versions.some((version) => version.id === ids.previewModern), "modern preview should remain visible");
  const legacy = versions.find((version) => version.id === ids.previewLegacy);
  assert.strictEqual(legacy._ownership.resolvable, true, "single-website legacy preview should be publishable");

  const beforeFactoryFields = clone(tables.website_preview_versions[0]);
  const publishedResponse = await _private.publishPreviewVersion(context(), {
    websiteId: ids.websiteA,
    customerId: ids.customerA,
    projectId: ids.projectA,
    previewVersionId: ids.previewLegacy,
    title: "Klantpreview",
  });
  assert.strictEqual(publishedResponse.statusCode, 200, "legacy publish should succeed");
  tables.website_preview_versions.push({
    id: ids.previewManual,
    customer_id: ids.customerA,
    project_id: null,
    website_id: null,
    demo_journey_id: null,
    version: 4,
    title: "Handmatige ZIP",
    generated_package: { files: [{ path: "index.html", content: "<h1>Manual</h1>", encoding: "utf8", size: 15 }], meta: { previewSource: "manual_zip" } },
    metadata: { previewSource: "manual_zip", manualZipContentHash: "manual-hash" },
    is_active: true,
    published_to_portal: false,
    feedback_items: [],
  });
  const manualResponse = await _private.publishActiveCustomerPreview(context(), {
    action: "publish_customer_preview",
    customerId: ids.customerA,
    previewVersionId: ids.previewManual,
    previewSource: "manual_zip",
    title: "Handmatige klantpreview",
  });
  assert.strictEqual(manualResponse.statusCode, 200, "standalone manual preview should publish without website or build");
  const manualBody = JSON.parse(manualResponse.body);
  assert.strictEqual(manualBody.publishedPreviewVersionId, ids.previewManual, "publication response should confirm the exact active manual version");
  assert.strictEqual(manualBody.customerPreview.id, ids.previewManual, "customer preview should remain bound to the selected manual version");
  assert.strictEqual(tables.customers[0].metadata.publishedPreviewVersionId, ids.previewManual, "customer pointer should atomically select the manual version");
  const publishedManual = tables.website_preview_versions.find((row) => row.id === ids.previewManual);
  assert.strictEqual(publishedManual.published_to_portal, true);
  assert.strictEqual(publishedManual.website_id, null);
  assert.strictEqual(publishedManual.metadata.previewSource, "manual_zip");
  const published = tables.website_preview_versions[0];
  assert.strictEqual(published.customer_id, ids.customerA);
  assert.strictEqual(published.project_id, ids.projectA);
  assert.strictEqual(published.website_id, ids.websiteA);
  assert.strictEqual(published.published_to_portal, true);
  assert.strictEqual(published.preview_url, beforeFactoryFields.preview_url);
  assert.strictEqual(published.preview_token, beforeFactoryFields.preview_token);
  assert.strictEqual(published.preview_score, beforeFactoryFields.preview_score);
  assert.deepStrictEqual(published.generated_package, beforeFactoryFields.generated_package);
  assert.deepStrictEqual(published.quality_report, beforeFactoryFields.quality_report);

  await _private.publishPreviewVersion(context(), {
    websiteId: ids.websiteA,
    customerId: ids.customerA,
    projectId: ids.projectA,
    previewVersionId: ids.previewLegacy,
    title: "Klantpreview",
  });
  assert.strictEqual(writes.filter((write) => write.id === ids.previewLegacy).length, 2, "republishing patches the same preview only");

  tables = createTables({ ambiguousWebsite: true });
  writes = installFetchMock(tables);
  await assert.rejects(
    () => _private.publishPreviewVersion(context(), {
      websiteId: ids.websiteA,
      customerId: ids.customerA,
      projectId: ids.projectA,
      previewVersionId: ids.previewLegacy,
    }),
    (error) => error.code === "PREVIEW_WEBSITE_MISMATCH"
  );
  assert.strictEqual(writes.length, 0, "ambiguous legacy relation should not write");

  tables = createTables();
  writes = installFetchMock(tables);
  await assert.rejects(
    () => _private.publishPreviewVersion(context(), {
      websiteId: ids.websiteB,
      customerId: ids.customerB,
      previewVersionId: ids.previewLegacy,
    }),
    (error) => error.code === "PREVIEW_CUSTOMER_MISMATCH" || error.code === "PREVIEW_WEBSITE_MISMATCH"
  );
  assert.strictEqual(writes.length, 0, "wrong customer or website should not write");

  tables = createTables();
  writes = installFetchMock(tables);
  const modernResponse = await _private.publishPreviewVersion(context(), {
    websiteId: ids.websiteA,
    customerId: ids.customerA,
    projectId: ids.projectA,
    previewVersionId: ids.previewModern,
  });
  assert.strictEqual(modernResponse.statusCode, 200, "modern preview should still publish");
  assert.strictEqual(writes.filter((write) => write.table === "website_preview_versions").length, 1);
  assert.strictEqual(writes.filter((write) => write.table === "customers").length, 1);
  assert.strictEqual(tables.customers[0].metadata.publishedPreviewVersionId, ids.previewModern, "publishing another exact version should move only the customer pointer");

  tables = createTables();
  tables.leads = [{ id: ids.leadA }];
  tables.demo_journeys[0].customer_id = null;
  tables.website_build_jobs[0].customer_id = null;
  tables.website_preview_versions[0].customer_id = "";
  tables.website_preview_versions[0].website_id = "";
  tables.demo_journeys[0].email = "";
  tables.demo_journeys[0].website_url = "";
  global.__missingLeadCustomerColumns = true;
  writes = installFetchMock(tables);
  const orphanVersions = await _private.findPreviewVersionsForWebsite(context(), {
    website: tables.websites[0],
    selectedCustomerId: ids.customerA,
    selectedProjectId: ids.projectA,
  });
  const orphanLegacy = orphanVersions.find((version) => version.id === ids.previewLegacy);
  assert(orphanLegacy, "orphan legacy preview should remain visible as a recent candidate");
  assert.strictEqual(orphanLegacy._ownership.resolvable, false, "orphan legacy preview without identity proof should not be publishable");
  await assert.rejects(
    () => _private.publishPreviewVersion(context(), {
      websiteId: ids.websiteA,
      customerId: ids.customerA,
      projectId: ids.projectA,
      previewVersionId: ids.previewLegacy,
    }),
    (error) => error.code === "PREVIEW_OWNERSHIP_UNRESOLVED"
  );
  assert.strictEqual(writes.length, 0, "unproven orphan legacy preview should not write");
  global.__missingLeadCustomerColumns = false;

  console.log("admin preview publication compatibility tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
