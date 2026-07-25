const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const renderApi = require("../functions/client-preview-render")._private;
const previewHandler = require("../functions/client-preview-versions").handler;
const quoteHandler = require("../functions/client-quote").handler;

const ids = {
  customerA: "11111111-1111-4111-8111-111111111111",
  customerB: "22222222-2222-4222-8222-222222222222",
  userA: "33333333-3333-4333-8333-333333333333",
  profileA: "44444444-4444-4444-8444-444444444444",
  projectA: "55555555-5555-4555-8555-555555555555",
  websiteA: "66666666-6666-4666-8666-666666666666",
  previewA: "77777777-7777-4777-8777-777777777777",
  previewB: "88888888-8888-4888-8888-888888888888",
  quoteA: "99999999-9999-4999-8999-999999999999",
  quoteB: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  lineA: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  approval: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  acceptance: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};
const checksumA = "a".repeat(64);
const checksumB = "b".repeat(64);

function file(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? "" : JSON.stringify(body),
    json: async () => body,
  };
}

function withEnv() {
  const previous = {
    url: process.env.SUPABASE_URL,
    anon: process.env.SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  return () => {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.anon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previous.anon;
    if (previous.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.service;
  };
}

test("preview packages always receive an opaque-origin sandbox and a no-network CSP", () => {
  const generated = renderApi.renderPackageHtml({ files: [{
    path: "index.html",
    content: '<!doctype html><html><head></head><body><a href="javascript:top.location=\'https://evil.test\'">evil</a><script>parent.document.body.innerHTML="owned";fetch("/api/client-preview-versions",{credentials:"include"});postMessage({token:localStorage.x},"*")</script></body></html>',
  }] }, { title: "Malicious fixture" });
  assert.match(generated, /Content-Security-Policy/);
  assert.match(generated, /connect-src &#039;none&#039;/);
  assert.match(generated, /form-action &#039;none&#039;/);
  assert.doesNotMatch(generated, /href="javascript:/i);
  assert.ok(generated.includes("href.charAt(0)!=='#'"));

  for (const relative of ["public/preview.html", "public/preview-embed.html"]) {
    const html = file(relative);
    assert.match(html, /sandbox="allow-scripts"|setAttribute\("sandbox", "allow-scripts"\)/);
    assert.doesNotMatch(html, /allow-same-origin/);
    assert.doesNotMatch(html, /allow-top-navigation/);
    assert.doesNotMatch(html, /allow-forms/);
    assert.doesNotMatch(html, /allow-popups/);
    assert.match(html, /no-referrer/);
  }
  const parent = file("public/preview.html");
  assert.doesNotMatch(parent, /addEventListener\(["']message["']/);
  assert.doesNotMatch(parent, /window\.onmessage/);
  assert.doesNotMatch(parent, /action:\s*["']approve_preview["']/);
  assert.doesNotMatch(file("public/klantportaal.html"), /action:\s*["']approve_preview["']/);
  assert.match(file("netlify.toml"), /Permissions-Policy = "camera=\(\), microphone=\(\), geolocation=\(\)/);
});

test("Factory and ZIP packages share the same renderer security boundary", () => {
  const factory = renderApi.renderPackageHtml({ files: [{ path: "index.html", content: "<h1>Factory</h1>" }] });
  const zip = renderApi.renderPackageHtml({ files: [{ path: "site/index.html", content: "<h1>ZIP</h1>" }] });
  for (const html of [factory, zip]) {
    assert.match(html, /default-src &#039;none&#039;/);
    assert.match(html, /script-src &#039;unsafe-inline&#039;/);
    assert.match(html, /base-uri &#039;none&#039;/);
  }
});

test("preview approval is server-resolved, checksum-bound and idempotent", async () => {
  const restore = withEnv();
  const previousFetch = global.fetch;
  const rpcBodies = [];
  const previewRows = [
    { id: ids.previewA, customer_id: ids.customerA, project_id: ids.projectA, website_id: ids.websiteA, version: 3, published_to_portal: true, is_active: true, allow_approval: true, status: "ready_for_review", package_checksum: checksumA, generated_package: { files: [{}] } },
    { id: ids.previewB, customer_id: ids.customerB, project_id: ids.projectA, website_id: ids.websiteA, version: 1, published_to_portal: true, is_active: true, allow_approval: true, status: "ready_for_review", package_checksum: checksumB, generated_package: { files: [{}] } },
  ];
  let approval = null;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/auth/v1/user")) return response(200, { id: ids.userA, email: "a@example.test" });
    if (parsed.pathname.endsWith("/rest/v1/customers")) return response(200, [{ id: ids.customerA, profile_id: ids.profileA, auth_user_id: ids.userA, metadata: { publishedPreviewVersionId: ids.previewA } }]);
    if (parsed.pathname.endsWith("/rest/v1/website_preview_versions")) {
      const id = String(parsed.searchParams.get("id") || "").replace("eq.", "");
      const customer = String(parsed.searchParams.get("customer_id") || "").replace("eq.", "");
      return response(200, previewRows.filter((row) => (!id || row.id === id) && (!customer || row.customer_id === customer)));
    }
    if (parsed.pathname.endsWith("/rest/v1/rpc/record_website_preview_approval")) {
      const body = JSON.parse(options.body);
      rpcBodies.push(body);
      if (body.input_expected_checksum !== checksumA) return response(409, { code: "40001", message: "preview checksum conflict" });
      const duplicate = Boolean(approval);
      approval ||= { id: ids.approval, preview_version_id: ids.previewA, preview_version_number: 3, preview_checksum: checksumA, approved_at: "2026-07-24T12:00:00Z", approval_status: "active", approval_statement_version: "website_preview_approval_nl_v1" };
      return response(200, { duplicate, approval });
    }
    return response(404, { message: `Unexpected ${parsed.pathname}` });
  };

  try {
    const request = (previewVersionId = ids.previewA, expectedChecksum = checksumA) => previewHandler({
      httpMethod: "POST",
      headers: { Authorization: "Bearer customer-a" },
      body: JSON.stringify({ action: "approve", previewVersionId, expectedChecksum, idempotencyKey: "approval-request-000001", customerId: ids.customerB }),
    });
    const first = await request();
    const second = await request();
    assert.equal(first.statusCode, 200);
    assert.equal(JSON.parse(second.body).duplicate, true);
    assert.equal(rpcBodies[0].input_customer_id, ids.customerA, "client customer id must be ignored");
    assert.equal(rpcBodies[0].input_preview_version_id, ids.previewA);
    assert.equal(rpcBodies[0].input_expected_checksum, checksumA);
    assert.equal(rpcBodies[0].input_auth_user_id, ids.userA);

    const crossCustomer = await request(ids.previewB, checksumB);
    assert.equal(crossCustomer.statusCode, 404);
    const stale = await request(ids.previewA, checksumB);
    assert.equal(stale.statusCode, 409);
  } finally {
    global.fetch = previousFetch;
    restore();
  }
});

test("quote reads and acceptance are owner-bound, versioned and replay-safe", async () => {
  const restore = withEnv();
  const previousFetch = global.fetch;
  const rpcBodies = [];
  const quote = { id: ids.quoteA, customer_id: ids.customerA, project_id: ids.projectA, quote_number: "OFF-2026-001", title: "Website", status: "sent", quote_date: "2026-07-20", valid_until: "2099-12-31", subtotal: 1000, vat: 210, total: 1210, quote_version: 4, metadata: {} };
  let acceptance = null;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/auth/v1/user")) return response(200, { id: ids.userA });
    if (parsed.pathname.endsWith("/rest/v1/customers")) return response(200, [{ id: ids.customerA, profile_id: ids.profileA, auth_user_id: ids.userA }]);
    if (parsed.pathname.endsWith("/rest/v1/quotes")) {
      const id = String(parsed.searchParams.get("id") || "").replace("eq.", "");
      const customer = String(parsed.searchParams.get("customer_id") || "").replace("eq.", "");
      return response(200, id === quote.id && customer === ids.customerA ? [{ ...quote, status: acceptance ? "accepted" : quote.status, accepted_at: acceptance?.accepted_at }] : []);
    }
    if (parsed.pathname.endsWith("/rest/v1/quote_lines")) return response(200, [{ id: ids.lineA, description: "Websitebouw", quantity: 1, unit_price: 1000, vat_rate: 21, line_total: 1000, position: 1 }]);
    if (parsed.pathname.endsWith("/rest/v1/quote_acceptances")) return response(200, acceptance ? [acceptance] : []);
    if (parsed.pathname.endsWith("/rest/v1/rpc/cp_a_quote_checksum")) return response(200, checksumA);
    if (parsed.pathname.endsWith("/rest/v1/rpc/record_quote_acceptance")) {
      const body = JSON.parse(options.body);
      rpcBodies.push(body);
      if (body.input_expected_version !== 4 || body.input_expected_checksum !== checksumA) return response(409, { code: "40001", message: "quote version conflict" });
      const duplicate = Boolean(acceptance);
      acceptance ||= { id: ids.acceptance, quote_id: ids.quoteA, customer_id: ids.customerA, project_id: ids.projectA, quote_version: 4, quote_checksum: checksumA, subtotal: 1000, vat: 210, total: 1210, currency: "EUR", accepted_at: "2026-07-24T12:05:00Z", acceptance_statement_version: "quote_acceptance_nl_v1" };
      return response(200, { duplicate, acceptance });
    }
    return response(404, { message: `Unexpected ${parsed.pathname}` });
  };

  try {
    const event = (overrides = {}) => ({
      httpMethod: "POST",
      headers: { Authorization: "Bearer customer-a" },
      body: JSON.stringify({ action: "accept", quoteId: ids.quoteA, expectedVersion: 4, expectedChecksum: checksumA, idempotencyKey: "quote-acceptance-request-0001", amount: 0.01, customerId: ids.customerB, ...overrides }),
    });
    const first = await quoteHandler(event());
    const second = await quoteHandler(event());
    assert.equal(first.statusCode, 200);
    assert.equal(JSON.parse(first.body).sideEffects.paymentStarted, false);
    assert.equal(JSON.parse(first.body).sideEffects.emailSent, false);
    assert.equal(JSON.parse(second.body).duplicate, true);
    assert.equal(rpcBodies[0].input_customer_id, ids.customerA);
    assert.equal(rpcBodies[0].input_auth_user_id, ids.userA);
    assert.equal(Object.hasOwn(rpcBodies[0], "amount"), false, "client amount must never reach the mutation contract");
    assert.equal(rpcBodies.length, 2, "retries use the same bounded mutation and database idempotency");

    const stale = await quoteHandler(event({ expectedVersion: 3 }));
    assert.equal(stale.statusCode, 409);
    const crossCustomer = await quoteHandler(event({ quoteId: ids.quoteB }));
    assert.equal(crossCustomer.statusCode, 404, "a quote outside the authenticated customer is not disclosed");

    const get = await quoteHandler({ httpMethod: "GET", headers: { Authorization: "Bearer customer-a" }, queryStringParameters: { quoteId: ids.quoteA } });
    const getBody = JSON.parse(get.body);
    assert.equal(getBody.quote.acceptance.id, ids.acceptance);
    assert.equal(getBody.quote.total, 1210);
  } finally {
    global.fetch = previousFetch;
    restore();
  }
});

test("migration constrains direct writes, immutable identities and atomic audit events", () => {
  const sql = file("supabase/migrations/20260724120000_cp_a_portal_trust_chain.sql");
  for (const token of [
    "create table public.website_preview_approvals",
    "create table public.quote_acceptances",
    "create table public.customer_portal_trust_events",
    "preview_checksum text not null",
    "quote_checksum text not null",
    "for update",
    "website_preview_approvals_one_active_project",
    "quote_acceptances_quote_once",
    "customer_portal_trust_events_once",
    "security definer",
    "public.owns_customer(customer_id)",
    "revoke all on function public.record_quote_acceptance",
    "grant execute on function public.record_quote_acceptance",
  ]) assert.match(sql.toLowerCase(), new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sql, /accepted quote content is immutable/);
  assert.match(sql, /extensions\.digest\(convert_to\(/);
  assert.doesNotMatch(sql, /public\.digest\(/);
  assert.match(sql, /preview_record\.package_checksum is distinct from lower\(input_expected_checksum\)/);
  assert.match(sql, /current_checksum is distinct from lower\(input_expected_checksum\)/);
  assert.doesNotMatch(file("public/offerte.html"), /maxwebstudioQuotes|localStorage\.setItem|logDemoEmail/);
});
