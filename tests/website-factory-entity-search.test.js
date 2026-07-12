const test = require("node:test");
const assert = require("node:assert/strict");
const { _private } = require("../functions/website-factory");

test("entity search survives optional columns that do not exist", async () => {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    const parsed = new URL(url);
    const field = [...parsed.searchParams.keys()].find((key) => !["select", "limit"].includes(key));
    if (field === "company") return response(200, [{ id: "38410e0a-6fd6-4a29-b6fc-98b3dc66328d", company: "Fuellinq", website: "fuellinq.com" }]);
    return response(400, { code: "42703", message: `column ${field} does not exist` });
  };
  try {
    const rows = await _private.searchRows(context(), "customers", ["name", "company", "company_name"], "fuellinq", "search_customers");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].company, "Fuellinq");
  } finally {
    global.fetch = previousFetch;
  }
});

test("entity search exposes the exact failing phase when every field fails", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => response(503, { code: "UPSTREAM_UNAVAILABLE", message: "unavailable" });
  try {
    await assert.rejects(
      _private.searchRows(context(), "customers", ["name", "company"], "fuellinq", "search_customers"),
      (error) => error.status === 503 && error.code === "UPSTREAM_UNAVAILABLE" && error.phase === "search_customers"
    );
  } finally {
    global.fetch = previousFetch;
  }
});

function context() {
  return { supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service" };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}
