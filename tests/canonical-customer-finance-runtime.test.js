const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const financeFunction = require("../functions/client-finance-context");
const canonical = require("../functions/_canonical-finance");
const { buildCustomerFinanceSummary, sanitizeInvoice } = financeFunction._private;
const CUSTOMER_A = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_B = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-07-24T12:00:00.000Z");

function invoice(overrides = {}) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    customer_id: CUSTOMER_A,
    invoice_number: "TEST-001",
    status: "sent",
    invoice_date: "2026-07-01",
    due_date: "2026-07-31",
    subtotal: 100,
    vat: 21,
    total: 121,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

function subscription(overrides = {}) {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    customer_id: CUSTOMER_A,
    plan: "Care",
    status: "active",
    billing_cycle: "monthly",
    price_ex_vat: 50,
    vat_rate: 21,
    total_incl_vat: 60.5,
    start_date: "2026-07-01",
    next_invoice_date: "2026-08-01",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

test("1. klant zonder facturen krijgt een stabiele lege finance-state", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [], [], NOW);
  assert.equal(result.openInvoiceCount, 0);
  assert.equal(result.outstandingAmount, 0);
  assert.equal(result.latestInvoice, null);
  assert.equal(result.paymentState, "settled");
});

test("2. één openstaande factuur bepaalt aantal en openstaand bedrag", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [invoice()], [], NOW);
  assert.equal(result.openInvoiceCount, 1);
  assert.equal(result.outstandingAmount, 121);
});

test("3. meerdere facturen blijven afzonderlijk en worden opgeteld", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [invoice(), invoice({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", total: 242 })], [], NOW);
  assert.equal(result.invoices.length, 2);
  assert.equal(result.outstandingAmount, 363);
});

test("4. betaalde factuur telt niet als openstaand", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [invoice({ status: "paid", paid_at: "2026-07-10T12:00:00Z" })], [], NOW);
  assert.equal(result.openInvoiceCount, 0);
  assert.equal(result.invoices[0].status, "paid");
});

test("5. verlopen factuur wordt server-side consistent afgeleid", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [invoice({ due_date: "2026-07-01" })], [], NOW);
  assert.equal(result.overdueInvoiceCount, 1);
  assert.equal(result.invoices[0].status, "expired");
  assert.equal(result.paymentState, "overdue");
});

test("6. geannuleerde of gecrediteerde status wordt als canceled weergegeven", () => {
  assert.equal(sanitizeInvoice(invoice({ status: "credited" }), NOW).status, "canceled");
  assert.equal(sanitizeInvoice(invoice({ status: "cancelled" }), NOW).status, "canceled");
});

test("7. actief abonnement staat in activeSubscriptions", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [], [subscription()], NOW);
  assert.equal(result.activeSubscriptions.length, 1);
  assert.equal(result.nextBillingDate, "2026-08-01");
});

test("8. beëindigd abonnement staat niet in activeSubscriptions", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [], [subscription({ status: "canceled" })], NOW);
  assert.equal(result.activeSubscriptions.length, 0);
  assert.equal(result.subscriptions.length, 1);
});

test("9. factuur behoudt canonieke subscription-koppeling", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [invoice({ subscription_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })], [subscription()], NOW);
  assert.equal(result.invoices[0].subscriptionId, result.subscriptions[0].id);
});

test("10. klant A kan een factuur van klant B niet in het viewmodel krijgen", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [invoice(), invoice({ customer_id: CUSTOMER_B })], [], NOW);
  assert.equal(result.invoices.length, 1);
  assert.equal(result.invoices[0].customerId, CUSTOMER_A);
  const source = fs.readFileSync(path.join(root, "functions/client-finance-context.js"), "utf8");
  assert.match(source, /customer_id=eq\.\$\{customerId\}/);
  assert.match(source, /Authorization: `Bearer \$\{bearer\}`/);
});

test("11. klant A kan een abonnement van klant B niet in het viewmodel krijgen", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [], [subscription(), subscription({ customer_id: CUSTOMER_B })], NOW);
  assert.equal(result.subscriptions.length, 1);
  assert.equal(result.subscriptions[0].customerId, CUSTOMER_A);
});

test("12. adminruntime behoudt server-side ACL-controle", () => {
  const source = fs.readFileSync(path.join(root, "functions/admin-billing.js"), "utf8");
  assert.match(source, /verifyAdmin\(event, jsonResponse\)/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("13. adminadapter en klantview delen dezelfde canonieke status", () => {
  const row = invoice({ status: "verlopen" });
  assert.equal(canonical.normalizeInvoiceStatus(row.status), sanitizeInvoice(row, NOW).status);
});

test("14. bedragen en btw blijven uit databasevelden afkomstig", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [invoice({ subtotal: 100.01, vat: 21, total: 121.01 })], [], NOW);
  assert.deepEqual(
    { subtotal: result.invoices[0].subtotal, vat: result.invoices[0].vatAmount, total: result.invoices[0].total },
    { subtotal: 100.01, vat: 21, total: 121.01 },
  );
});

test("15. actieve runtime bevat geen legacy financequery of compatibilityview", () => {
  const activeFiles = [
    ...fs.readdirSync(path.join(root, "functions")).filter((name) => name.endsWith(".js")).map((name) => path.join(root, "functions", name)),
    path.join(root, "public/src/services/clientFinanceContextService.js"),
    path.join(root, "public/src/providers/supabaseProvider.js"),
    path.join(root, "public/src/repositories/InvoiceRepository.js"),
    path.join(root, "public/client-dashboard.html"),
  ];
  const runtime = activeFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(runtime, /(?:rest\/v1\/|\.from\(["'])customer_(?:invoices|subscriptions)/);
  assert.doesNotMatch(runtime, /create\s+(?:or\s+replace\s+)?view\s+.*customer_(?:invoices|subscriptions)/i);
});

test("16. empty state bouwt zonder crash en zonder mockfallback", () => {
  const result = buildCustomerFinanceSummary(CUSTOMER_A, [], [], [], NOW);
  assert.deepEqual(result.invoices, []);
  assert.deepEqual(result.subscriptions, []);
  const clientSource = fs.readFileSync(path.join(root, "public/src/services/clientFinanceContextService.js"), "utf8");
  assert.doesNotMatch(clientSource, /mock|localStorage/i);
});

test("17. backendfout wordt veilig en zonder details naar de client vertaald", async () => {
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: "invalid token" }), text: async () => JSON.stringify({ message: "invalid token" }) });
  try {
    const response = await financeFunction.handler({ httpMethod: "GET", headers: { authorization: "Bearer invalid" } });
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 401);
    assert.equal(body.success, false);
    assert.equal(body.error, "Sessie is ongeldig.");
  } finally {
    global.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test("18. readmodel start geen betaling, providercall of e-mail", () => {
  const source = fs.readFileSync(path.join(root, "functions/client-finance-context.js"), "utf8");
  assert.doesNotMatch(source, /api\.mollie\.com|sendEmail|createMolliePayment/);
  assert.match(source, /paymentStarted: false, providerCalled: false, emailSent: false/);
});

test("canonical adapters slaan ontbrekende provider-operatievelden gecontroleerd in metadata op", () => {
  const patch = canonical.canonicalSubscriptionPatch({ retry_next_action_at: "2026-07-25", monthly_amount: 60.5 }, { owner: "server" });
  assert.equal(patch.total_incl_vat, 60.5);
  assert.equal(patch.metadata.owner, "server");
  assert.equal(patch.metadata.financeOperations.retry_next_action_at, "2026-07-25");
});
