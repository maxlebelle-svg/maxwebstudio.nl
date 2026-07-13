const assert = require("assert");
const { handler } = require("../functions/client-preview-versions");

const ids = {
  customer: "11111111-1111-4111-8111-111111111111",
  authUser: "22222222-2222-4222-8222-222222222222",
  website: "33333333-3333-4333-8333-333333333333",
  project: "44444444-4444-4444-8444-444444444444",
  preview: "55555555-5555-4555-8555-555555555555",
  oldPreview: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  feedback: "66666666-6666-4666-8666-666666666666",
};

const idempotencyKey = "preview-reviewflow-test-key";

function createTables() {
  return {
    customers: [
      { id: ids.customer, auth_user_id: ids.authUser, name: "Test Klant", company: "Testbedrijf", email: "klant@example.nl", metadata: { publishedPreviewVersionId: ids.preview } },
    ],
    websites: [
      { id: ids.website, customer_id: ids.customer, name: "Testwebsite", hosting_package: "", care_package: "business_website", metadata: {} },
    ],
    projects: [
      { id: ids.project, customer_id: ids.customer, website_id: ids.website, metadata: { websiteCommercialOrder: { customerId: ids.customer, projectId: ids.project, websiteId: ids.website, packageCode: "business_website", packageName: "Business Website", totalAmountCents: 99500, depositAmountCents: 30000, currency: "EUR", paymentStatus: "not_started", status: "maintenance_selected", maintenanceCode: "care_basic", maintenanceName: "Basis onderhoud", maintenanceAmountCents: 1995, startTrigger: "project_delivered" } } },
    ],
    customer_invoices: [],
    demo_journeys: [],
    website_preview_versions: [
      {
        id: ids.preview,
        customer_id: ids.customer,
        project_id: ids.project,
        website_id: ids.website,
        version: 1,
        title: "Klantpreview",
        customer_summary: "Review de website.",
        change_summary: "Homepage bijgewerkt.",
        safe_preview_path: `/preview.html?version=${ids.preview}`,
        published_to_portal: true,
        published_at: "2026-07-11T12:00:00Z",
        allow_feedback: true,
        allow_approval: true,
        status: "feedback_received",
        feedback_items: [
          {
            id: ids.feedback,
            idempotencyKey,
            page: "homepage",
            section: "homepage",
            category: "kleine aanpassing",
            priority: "normaal",
            comment: "Dit is een testfeedback voor de preview-reviewflow.",
            status: "open",
            createdAt: "2026-07-11T15:19:20.658Z",
            createdByAuthUserId: ids.authUser,
          },
        ],
      },
      {
        id: ids.oldPreview,
        customer_id: ids.customer,
        project_id: ids.project,
        website_id: ids.website,
        version: 9,
        title: "Oudere goedgekeurde klantpreview",
        safe_preview_path: `/preview.html?version=${ids.oldPreview}`,
        published_to_portal: true,
        published_at: "2026-07-12T12:00:00Z",
        approved_at: "2026-07-12T12:30:00Z",
        allow_feedback: false,
        allow_approval: false,
        status: "approved",
        feedback_items: [],
      },
    ],
    change_requests: [],
    customer_timeline_events: [],
  };
}

function installFetchMock(tables) {
  const writes = [];
  const mollieRequests = [];
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/auth/v1/user")) {
      return response(200, { id: ids.authUser, email: "klant@example.nl" });
    }
    if (parsed.hostname === "api.mollie.com" && parsed.pathname === "/v2/payments") {
      mollieRequests.push({ authorization: options.headers?.Authorization || "", body: JSON.parse(options.body || "{}") });
      return response(201, { id: "tr_test_preview", status: "open", createdAt: "2026-07-13T08:00:00Z", _links: { checkout: { href: "https://www.mollie.com/checkout/select-method/tr_test_preview" } } });
    }
    const table = parsed.pathname.split("/").pop();
    if (!tables[table]) return response(404, { message: `Unknown table ${table}` });

    const method = options.method || "GET";
    if (method === "POST") {
      const record = JSON.parse(options.body || "{}");
      const saved = { id: nextId(table, tables[table].length), created_at: "2026-07-11T15:37:28Z", ...record };
      tables[table].push(saved);
      writes.push({ table, record: saved });
      return response(201, [saved]);
    }

    if (method === "PATCH") {
      const id = filterEq(parsed.searchParams.get("id"));
      const record = JSON.parse(options.body || "{}");
      const rows = tables[table].filter((row) => row.id === id);
      rows.forEach((row) => Object.assign(row, record));
      writes.push({ table, record });
      return response(200, rows);
    }

    return response(200, applyQuery(tables[table], parsed.searchParams));
  };
  return { writes, mollieRequests };
}

function applyQuery(rows, params) {
  let result = rows.map((row) => JSON.parse(JSON.stringify(row)));
  for (const [key, value] of params.entries()) {
    if (["select", "order", "limit"].includes(key)) continue;
    if (key.startsWith("metadata->>") && value.startsWith("eq.")) {
      const metadataKey = key.replace("metadata->>", "");
      result = result.filter((row) => String(row.metadata?.[metadataKey] || "") === filterEq(value));
      continue;
    }
    if (value.startsWith("eq.")) result = result.filter((row) => String(row[key] || "") === filterEq(value));
  }
  const order = params.get("order") || "";
  if (order.startsWith("published_at.desc")) result.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
  const limit = Number(params.get("limit") || 0);
  return limit ? result.slice(0, limit) : result;
}

function filterEq(value = "") {
  return String(value || "").replace(/^eq\./, "");
}

function nextId(table, index) {
  if (table === "change_requests") return "77777777-7777-4777-8777-777777777777";
  if (table === "customer_timeline_events" && index === 0) return "88888888-8888-4888-8888-888888888888";
  if (table === "customer_timeline_events") return "99999999-9999-4999-8999-999999999999";
  return `${table}-${index}`;
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function event(payload = {}) {
  return {
    httpMethod: "POST",
    headers: { Authorization: "Bearer customer-token" },
    body: JSON.stringify({
      action: "feedback",
      previewVersionId: ids.preview,
      category: "kleine aanpassing",
      priority: "normaal",
      page: "homepage",
      section: "homepage",
      comment: "Dit is een testfeedback voor de preview-reviewflow.",
      idempotencyKey,
      ...payload,
    }),
  };
}

function getEvent() {
  return {
    httpMethod: "GET",
    headers: { Authorization: "Bearer customer-token" },
    queryStringParameters: {},
  };
}

function approvalEvent() {
  return {
    httpMethod: "POST",
    headers: { Authorization: "Bearer customer-token" },
    body: JSON.stringify({ action: "approve", previewVersionId: ids.preview, feedback: "Akkoord" }),
  };
}

function paymentEvent() {
  return {
    httpMethod: "POST",
    headers: { Authorization: "Bearer customer-token" },
    body: JSON.stringify({ action: "create_payment", previewVersionId: ids.preview }),
  };
}

async function run() {
  const previousEnv = {
    supabaseUrl: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    mollieMode: process.env.MOLLIE_MODE,
    mollieApiKey: process.env.MOLLIE_API_KEY,
    mollieTestApiKey: process.env.MOLLIE_TEST_API_KEY,
    baseUrl: process.env.BASE_URL,
  };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.MOLLIE_MODE = "live";
  process.env.MOLLIE_API_KEY = "live_production_must_not_be_used";
  process.env.MOLLIE_TEST_API_KEY = "test_preview_payment";
  process.env.BASE_URL = "https://maxwebstudio.nl";

  const tables = createTables();
  const fetchMock = installFetchMock(tables);

  const listing = await handler(getEvent());
  assert.strictEqual(listing.statusCode, 200);
  assert.strictEqual(listing.headers["Cache-Control"], "no-store", "refresh must not reuse a stale publication response");
  const listingBody = JSON.parse(listing.body);
  assert.strictEqual(listingBody.currentPreviewVersionId, ids.preview);
  assert.strictEqual(listingBody.currentPreviewVersion.id, ids.preview);
  assert.strictEqual(listingBody.previewVersions[0].id, ids.preview, "the explicit pointer must beat a newer dated or approved historical version");
  assert.strictEqual(listingBody.previewVersions[0].isCurrent, true);
  assert.strictEqual(listingBody.previewVersions[1].id, ids.oldPreview, "historical versions remain available without becoming current");

  const first = await handler(event());
  assert.strictEqual(first.statusCode, 200);
  const firstBody = JSON.parse(first.body);
  assert.strictEqual(firstBody.duplicate, true);
  assert.strictEqual(firstBody.changeRequestReady, true);
  assert.strictEqual(firstBody.timelineReady, true);
  assert.strictEqual(firstBody.notificationReady, true);

  const second = await handler(event());
  assert.strictEqual(second.statusCode, 200);
  const secondBody = JSON.parse(second.body);
  assert.strictEqual(secondBody.duplicate, true);
  assert.strictEqual(secondBody.changeRequestReady, true);
  assert.strictEqual(secondBody.timelineReady, true);
  assert.strictEqual(secondBody.notificationReady, true);

  assert.strictEqual(tables.website_preview_versions[0].feedback_items.length, 1, "feedback item should not duplicate");
  assert.strictEqual(tables.change_requests.length, 1, "change request should be idempotent");
  assert.strictEqual(tables.customer_timeline_events.filter((row) => row.module === "website").length, 1, "customer timeline event should be idempotent");
  assert.strictEqual(tables.customer_timeline_events.filter((row) => row.module === "notifications").length, 1, "admin notification event should be idempotent");
  assert.strictEqual(tables.customer_timeline_events.filter((row) => row.is_global === true).length, 1, "admin notification should be global for Notification Center");
  assert.strictEqual(tables.customer_timeline_events.filter((row) => row.is_global === false).length, 1, "customer timeline should stay customer-scoped");
  assert(tables.customer_timeline_events.every((row) => row.metadata.previewVersionId === ids.preview));
  assert(tables.customer_timeline_events.every((row) => row.metadata.feedbackId === ids.feedback));

  const approval = await handler(approvalEvent());
  assert.strictEqual(approval.statusCode, 200);
  const approvalBody = JSON.parse(approval.body);
  assert.strictEqual(approvalBody.approvedPreviewVersionId, ids.preview);
  assert.strictEqual(approvalBody.paymentReadiness.ready, true);
  assert.strictEqual(approvalBody.paymentReadiness.amountCents, 30000, "business package uses the fixed 300 euro deposit");
  const approved = tables.website_preview_versions.find((row) => row.id === ids.preview);
  assert.strictEqual(approved.status, "approved");
  assert.strictEqual(approved.approved_by_auth_user_id, ids.authUser);
  assert(approved.approved_at);
  const duplicateApproval = await handler(approvalEvent());
  const duplicateApprovalBody = JSON.parse(duplicateApproval.body);
  assert.strictEqual(duplicateApprovalBody.duplicate, true, "double approval must be idempotent");
  assert.strictEqual(tables.customer_timeline_events.filter((row) => row.event_type === "preview_approved").length, 1);
  assert.strictEqual(tables.customer_timeline_events.filter((row) => row.metadata?.notificationType === "preview_approved").length, 1);

  const payment = await handler(paymentEvent());
  assert.strictEqual(payment.statusCode, 200);
  const paymentBody = JSON.parse(payment.body);
  assert.strictEqual(paymentBody.testMode, true);
  assert.strictEqual(paymentBody.reused, false);
  assert.strictEqual(paymentBody.paymentReadiness.amountCents, 30000);
  assert.strictEqual(paymentBody.paymentReadiness.amountInclVatCents, 36300);
  assert.strictEqual(fetchMock.mollieRequests.length, 1);
  assert.strictEqual(fetchMock.mollieRequests[0].authorization, "Bearer test_preview_payment", "the live key must never be used by preview test payments");
  assert.strictEqual(fetchMock.mollieRequests[0].body.amount.value, "363.00");
  assert.strictEqual(fetchMock.mollieRequests[0].body.metadata.environment, "test");
  assert.strictEqual(fetchMock.mollieRequests[0].body.metadata.testPayment, true);
  assert.strictEqual(fetchMock.mollieRequests[0].body.metadata.maintenanceCode, "care_basic");
  assert.match(tables.customer_invoices[0].notes, /^TEST;previewDeposit:/);

  const duplicatePayment = await handler(paymentEvent());
  const duplicatePaymentBody = JSON.parse(duplicatePayment.body);
  assert.strictEqual(duplicatePayment.statusCode, 200);
  assert.strictEqual(duplicatePaymentBody.reused, true);
  assert.strictEqual(fetchMock.mollieRequests.length, 1, "double submit must reuse the existing test payment");

  const missingConfigTables = createTables();
  missingConfigTables.website_preview_versions[0].approved_at = "2026-07-13T08:00:00Z";
  missingConfigTables.website_preview_versions[0].status = "approved";
  delete process.env.MOLLIE_TEST_API_KEY;
  const missingConfigMock = installFetchMock(missingConfigTables);
  const missingConfig = await handler(paymentEvent());
  const missingConfigBody = JSON.parse(missingConfig.body);
  assert.strictEqual(missingConfig.statusCode, 503);
  assert.strictEqual(missingConfigBody.code, "mollie_test_config_missing");
  assert.strictEqual(missingConfigBody.error, "Deze testbetaling kan momenteel niet worden gestart.");
  assert.strictEqual(missingConfigMock.mollieRequests.length, 0, "missing test config must never fall back to the production key");

  process.env.SUPABASE_URL = previousEnv.supabaseUrl;
  process.env.SUPABASE_ANON_KEY = previousEnv.anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = previousEnv.serviceRoleKey;
  process.env.MOLLIE_MODE = previousEnv.mollieMode;
  process.env.MOLLIE_API_KEY = previousEnv.mollieApiKey;
  process.env.MOLLIE_TEST_API_KEY = previousEnv.mollieTestApiKey;
  process.env.BASE_URL = previousEnv.baseUrl;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
