const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler } = require("../functions/cockpit-read");

const TOKEN = "cockpit-read-token-1234567890-abcdefghij";
const SERVICE = "sb_secret_cockpit_test_key";
const NOW = new Date("2026-08-05T12:00:00.000Z");

test("cockpit bridge is GET-only and requires a scoped token", async () => {
  const handler = createHandler(deps());
  const missing = await handler(event());
  assert.equal(missing.statusCode, 401);
  assert.equal(JSON.parse(missing.body).code, "UNAUTHORIZED");

  const write = await handler(event({ method: "POST", token: TOKEN }));
  assert.equal(write.statusCode, 405);
  assert.equal(JSON.parse(write.body).code, "READ_ONLY");
});

test("cockpit bridge rejects browser calls so the secret cannot live in Base44 frontend code", async () => {
  const handler = createHandler(deps());
  const result = await handler(event({ token: TOKEN, origin: "https://max-studio-pilot.base44.app" }));
  assert.equal(result.statusCode, 403);
  assert.equal(JSON.parse(result.body).code, "SERVER_TO_SERVER_REQUIRED");
});

test("cockpit bridge returns sanitized production records and filters demo data", async () => {
  const state = fixtures();
  const handler = createHandler(deps(state));
  const result = await handler(event({ token: TOKEN }));
  const body = JSON.parse(result.body);

  assert.equal(result.statusCode, 200);
  assert.equal(body.readOnly, true);
  assert.equal(body.partial, false);
  assert.equal(body.leads.length, 1);
  assert.equal(body.leads[0].companyName, "QuantumBouw");
  assert.equal(body.leads[0].nextAction, "Voorstel nabellen");
  assert.equal(body.leads[0].demoAvailable, true);
  assert.equal(body.leads[0].demoUrl, "https://preview.maxwebstudio.nl/quantumbouw-preview");
  assert.equal(body.projects[0].customerName, "QuantumBouw");
  assert.equal(body.proposals[0].relationshipName, "QuantumBouw");
  assert.deepEqual(body.proposals[0], {
    id: "offer-1",
    title: "Business Website",
    status: "ready_for_review",
    relationshipType: "lead",
    relationshipId: "lead-1",
    relationshipName: "QuantumBouw",
    currentVersionId: "version-1",
    versionNumber: 2,
    versionStatus: "ready_for_review",
    oneTimeExVatCents: 189500,
    recurringExVatCents: 3500,
    dueNowInclVatCents: 68728,
    hasNonBindingLines: false,
    sendReady: true,
    updatedAt: "2026-08-05T10:30:00.000Z",
  });
  assert.deepEqual(body.files[0], {
    id: "file-1",
    relationshipType: "lead",
    relationshipId: "lead-1",
    name: "quantumbouw-website.zip",
    mimeType: "application/zip",
    sizeBytes: 2048,
    category: "document",
    status: "new",
    createdAt: "2026-08-05T11:00:00.000Z",
  });
  assert.deepEqual(body.summary, { openLeads: 1, followUpsDue: 1, proposalsReady: 1, projectsAttention: 1 });

  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /sb_secret_cockpit_test_key|interne notitie|secretValue|demo@example/);
  assert.equal(result.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(result.headers["Access-Control-Allow-Origin"], undefined);
});

test("one unavailable table produces a controlled partial snapshot", async () => {
  const state = fixtures();
  state.failTable = "commercial_offers";
  const handler = createHandler(deps(state));
  const result = await handler(event({ token: TOKEN }));
  const body = JSON.parse(result.body);

  assert.equal(result.statusCode, 200);
  assert.equal(body.partial, true);
  assert.deepEqual(body.unavailable, ["proposals"]);
  assert.deepEqual(body.proposals, []);
  assert.equal(body.leads.length, 1);
});

test("revoked or malformed demo publications are never exposed to the Cockpit", async () => {
  const state = fixtures();
  state.public_preview_publications = [
    { relationship_type: "lead", relationship_id: "lead-1", public_slug: "ingetrokken-preview", enabled: false, revoked_at: "2026-08-05T11:00:00.000Z" },
    { relationship_type: "lead", relationship_id: "lead-1", public_slug: "https://unsafe.example/token", enabled: true, revoked_at: null },
  ];
  const handler = createHandler(deps(state));
  const result = await handler(event({ token: TOKEN }));
  const body = JSON.parse(result.body);

  assert.equal(result.statusCode, 200);
  assert.equal(body.leads[0].demoAvailable, false);
  assert.equal(body.leads[0].demoUrl, undefined);
});

test("missing or weak endpoint configuration fails closed", async () => {
  const handler = createHandler(deps(fixtures(), { COCKPIT_READ_TOKEN: "short" }));
  const result = await handler(event({ token: "short" }));
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.body).code, "COCKPIT_NOT_CONFIGURED");
});

function deps(state = fixtures(), envPatch = {}) {
  return {
    now: () => NOW,
    env: {
      COCKPIT_READ_TOKEN: TOKEN,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_COCKPIT_SECRET_KEY: SERVICE,
      ...envPatch,
    },
    fetchImpl: async (url, options = {}) => {
      assert.equal(options.method, "GET");
      assert.equal(options.headers.apikey, SERVICE);
      assert.equal(options.headers.Authorization, undefined);
      const table = new URL(url).pathname.split("/").pop();
      if (state.failTable === table) return response({ code: "TABLE_UNAVAILABLE" }, 503);
      return response(state[table] || []);
    },
  };
}

function event({ method = "GET", token = "", origin = "" } = {}) {
  return {
    httpMethod: method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(origin ? { origin } : {}),
    },
    queryStringParameters: {},
  };
}

function fixtures() {
  return {
    leads: [
      {
        id: "lead-1",
        company_name: "QuantumBouw",
        contact_name: "Q. Bouwer",
        email: "contact@quantumbouw.nl",
        phone: "0612345678",
        website: "https://quantumbouw.nl",
        lead_status: "follow_up",
        priority: "high",
        next_action: "Voorstel nabellen",
        next_action_at: "2026-08-05T10:00:00.000Z",
        internal_notes: "interne notitie",
        metadata: { secretValue: "never-return" },
        updated_at: "2026-08-05T09:00:00.000Z",
      },
      { id: "lead-demo", company_name: "Demo", email: "demo@example", environment: "demo" },
    ],
    customers: [{ id: "customer-1", company: "QuantumBouw", status: "active" }],
    projects: [{ id: "project-1", customer_id: "customer-1", name: "Nieuwe website", status: "attention", phase: "feedback", progress: 70 }],
    commercial_offers: [{ id: "offer-1", title: "Business Website", status: "ready_for_review", relationship_type: "lead", relationship_id: "lead-1", current_version_id: "version-1", updated_at: "2026-08-05T10:30:00.000Z" }],
    commercial_offer_versions: [{ id: "version-1", offer_id: "offer-1", version_number: 2, status: "ready_for_review", one_time_ex_vat_cents: "189500", recurring_ex_vat_cents: "3500", due_now_incl_vat_cents: "68728", has_non_binding_lines: false }],
    files: [
      { id: "file-1", lead_id: "lead-1", original_filename: "quantumbouw-website.zip", mime_type: "application/zip", size_bytes: 2048, category: "document", status: "new", created_at: "2026-08-05T11:00:00.000Z", storage_path: "private/never-return" },
      { id: "file-demo", lead_id: "lead-demo", original_filename: "demo.zip", mime_type: "application/zip", environment: "demo" },
    ],
    public_preview_publications: [
      { id: "publication-1", relationship_type: "lead", relationship_id: "lead-1", public_slug: "quantumbouw-preview", enabled: true, revoked_at: null, updated_at: "2026-08-05T09:30:00.000Z" },
      { id: "publication-revoked", relationship_type: "lead", relationship_id: "lead-demo", public_slug: "oude-demo-preview", enabled: false, revoked_at: "2026-08-05T08:00:00.000Z" },
    ],
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
