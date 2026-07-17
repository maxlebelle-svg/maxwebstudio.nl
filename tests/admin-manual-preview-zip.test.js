const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manualPreviewRoute = require("../functions/admin-manual-preview");
const { _private } = manualPreviewRoute;

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(value);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralBody = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBody.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBody, eocd]);
}

test("valid static ZIP is safely extracted with a root index", () => {
  const result = _private.extractZip(zip([["index.html", "<h1>Fuellinq</h1>"], ["assets/style.css", "body{color:#fff}"]]));
  assert.equal(_private.resolveEntryFile(result.files), "index.html");
  assert.equal(result.files.length, 2);
});

test("single wrapper directory is normalized", () => {
  const result = _private.extractZip(zip([["fuellinq/index.html", "<h1>Fuellinq</h1>"], ["fuellinq/styles.css", "body{}"]]));
  assert.equal(_private.resolveEntryFile(result.files), "index.html");
  assert(result.files.some((file) => file.path === "styles.css"));
});

test("missing and ambiguous entry files are rejected", () => {
  const missing = _private.extractZip(zip([["readme.txt", "none"]]));
  assert.throws(() => _private.resolveEntryFile(missing.files), (error) => error.code === "index_not_found");
  const ambiguous = _private.extractZip(zip([["one/index.html", "one"], ["two/index.html", "two"]]));
  assert.throws(() => _private.resolveEntryFile(ambiguous.files), (error) => error.code === "ambiguous_entry_file");
});

test("path traversal, absolute paths and executable files are rejected", () => {
  for (const unsafe of ["../index.html", "..\\index.html", "/index.html", "C:/index.html", "%2e%2e/index.html", "server.php"]) {
    assert.throws(() => _private.safePath(unsafe), (error) => ["unsafe_zip_path", "invalid_file_type"].includes(error.code));
  }
});

test("frontend sends the ZIP to server validation and does not require Demo Sites or a journey", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/admin-website-factory.html"), "utf8");
  assert.match(html, /admin-manual-preview/);
  assert.match(html, /zipBase64/);
  assert.doesNotMatch(html, /async function uploadManualZipFile\(file\) \{\s*if \(!journey\?\.id\)/);
  assert.match(html, /ZIP succesvol verwerkt/);
  assert.match(html, /buildHistory = \{[\s\S]*activeVersion: normalizedVersion/);
});

test("lead-owned ZIP is stored on the Demo Journey before customer conversion", async () => {
  const previousFetch = global.fetch;
  const envKeys = ["APP_ENV", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const journeyId = "7dda90c7-d7b2-4810-9925-3672330f827a";
  const leadId = "a8fd247e-9f23-47b4-8c32-c73fb2150f7f";
  const versionId = "ebee37fd-2978-4f42-9508-d2cf94d15d89";
  const adminId = "9856f024-6714-43c9-b2f3-d4289dd4fba0";
  const calls = [];
  let storedVersion = null;
  process.env.APP_ENV = "test";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    calls.push({ href, method, body: options.body });
    const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (href.endsWith("/auth/v1/user")) return response({ id: adminId, email: "admin@example.test" });
    if (href.includes("/rest/v1/profiles?")) return response([{ id: adminId, role: "admin", status: "active" }]);
    if (href.includes("/rest/v1/demo_journeys?") && method === "GET") return response([{ id: journeyId, lead_id: leadId, customer_id: null, business_name: "Heel je zelf" }]);
    if (href.includes("/rest/v1/website_preview_versions?") && method === "GET") return response([]);
    if (href.endsWith("/rest/v1/website_preview_versions") && method === "POST") {
      const record = JSON.parse(options.body);
      storedVersion = { ...record, id: versionId };
      return response([storedVersion]);
    }
    if (href.includes("/rest/v1/website_preview_versions?") && method === "PATCH") {
      storedVersion = { ...storedVersion, ...JSON.parse(options.body) };
      return response([storedVersion]);
    }
    if (href.includes("/rest/v1/customer_timeline_events")) return response([]);
    throw new Error(`Unexpected request: ${method} ${href}`);
  };

  try {
    const response = await manualPreviewRoute.handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer admin-session" },
      body: JSON.stringify({
        demoJourneyId: journeyId,
        leadId,
        fileName: "heeljezelf.zip",
        zipBase64: zip([["index.html", "<h1>Heel je zelf</h1>"]]).toString("base64"),
      }),
    });
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(body.source, "manual_zip");
    assert.equal(storedVersion.demo_journey_id, journeyId);
    assert.equal(storedVersion.customer_id, null);
    assert.equal(storedVersion.is_active, false);
    assert(calls.some((call) => call.href.includes(`demo_journey_id=eq.${journeyId}`)));
    assert(!calls.some((call) => call.href.includes("/rest/v1/customers?")));
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test("the actual Fuellinq regression ZIP is accepted and has a root index", () => {
  const buffer = fs.readFileSync(path.join(__dirname, "../Website factory maxwebstudio.nl/fuellinq.com-website-factory.zip"));
  const result = _private.extractZip(buffer);
  assert.equal(_private.resolveEntryFile(result.files), "index.html");
  assert(result.files.some((file) => file.path === "styles.css"));
});
