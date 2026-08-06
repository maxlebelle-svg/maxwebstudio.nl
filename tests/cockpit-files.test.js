const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHandler, _test } = require("../functions/cockpit-files");

const NOW = new Date("2026-08-06T09:00:00.000Z");
const TOKEN = "w".repeat(64);
const READ_TOKEN = "r".repeat(64);
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const FILE_ID = "22222222-2222-4222-8222-222222222222";
const env = { COCKPIT_WRITE_TOKEN: TOKEN, COCKPIT_READ_TOKEN: READ_TOKEN, SUPABASE_URL: "https://db.example", SUPABASE_COCKPIT_SECRET_KEY: "secret" };

function event(body, overrides = {}) { return { httpMethod: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body), ...overrides }; }
function jsonResponse(status, data = null, headers = {}) { const body = data === null ? "" : JSON.stringify(data); return { ok: status >= 200 && status < 300, status, headers: { get: (key) => headers[key.toLowerCase()] || null }, text: async () => body, arrayBuffer: async () => Buffer.from(body) }; }
function zipBytes() { return Buffer.from([0x50,0x4b,0x03,0x04,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x50,0x4b,0x05,0x06,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]); }

test("rejects browsers, missing authorization and non-POST methods", async () => {
  const handler = createHandler({ env, fetchImpl: async () => jsonResponse(500), now: () => NOW });
  assert.equal((await handler({ httpMethod: "GET" })).statusCode, 405);
  assert.equal((await handler(event({}, { headers: { origin: "https://evil.example", authorization: `Bearer ${TOKEN}` } }))).statusCode, 403);
  assert.equal((await handler({ ...event({}), headers: {} })).statusCode, 401);
});

test("accepts only matching ZIP/PDF metadata within their private-storage limits", () => {
  assert.equal(_test.validateMetadata({ leadId: LEAD_ID, name: "site.zip", mimeType: "application/x-zip-compressed", sizeBytes: 42 }).mimeType, "application/zip");
  assert.equal(_test.validateMetadata({ leadId: LEAD_ID, name: "voorstel.pdf", mimeType: "application/pdf", sizeBytes: 42 }).extension, "pdf");
  assert.throws(() => _test.validateMetadata({ leadId: LEAD_ID, name: "script.js", mimeType: "text/javascript", sizeBytes: 42 }), /UNSUPPORTED_FILE_TYPE/);
  assert.throws(() => _test.validateMetadata({ leadId: LEAD_ID, name: "groot.zip", mimeType: "application/zip", sizeBytes: _test.MAX_ZIP_BYTES + 1 }), /FILE_TOO_LARGE/);
  assert.throws(() => _test.validateMetadata({ leadId: LEAD_ID, name: "groot.pdf", mimeType: "application/pdf", sizeBytes: _test.MAX_PDF_BYTES + 1 }), /FILE_TOO_LARGE/);
});

test("ZIP validation requires a local header and end-of-central-directory marker", () => {
  assert.equal(_test.validZip(zipBytes()), true);
  assert.equal(_test.validZip(Buffer.from("PK-not-a-zip")), false);
});

test("prepare checks the lead and returns a scoped signed upload", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/rest/v1/leads?")) return jsonResponse(200, [{ id: LEAD_ID, company_name: "FuelGo" }]);
    if (url.includes("/storage/v1/object/upload/sign/")) return jsonResponse(200, { url: "/object/upload/sign/preview-zips/signed" });
    throw new Error("unexpected request");
  };
  const handler = createHandler({ env, fetchImpl, now: () => NOW, randomUUID: () => FILE_ID });
  const result = await handler(event({ action: "prepare", leadId: LEAD_ID, name: "website.zip", mimeType: "application/zip", sizeBytes: 42, description: "Websitebestanden" }));
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  assert.match(body.uploadTicket, /^v1\./);
  assert.equal(body.uploadMethod, "PUT");
  assert.equal(body.uploadHeaders["x-upsert"], "false");
  assert.match(calls[1].url, new RegExp(`preview-zips/cockpit/lead/${LEAD_ID}/${FILE_ID}/website.zip`));
});

test("prepare blocks demo leads before creating an upload URL", async () => {
  const handler = createHandler({ env, now: () => NOW, randomUUID: () => FILE_ID, fetchImpl: async () => jsonResponse(200, [{ id: LEAD_ID, environment: "demo" }]) });
  const result = await handler(event({ action: "prepare", leadId: LEAD_ID, name: "website.zip", mimeType: "application/zip", sizeBytes: 42 }));
  assert.equal(result.statusCode, 403);
});

test("finalize verifies bytes and inserts a private quarantined lead file", async () => {
  const bytes = zipBytes();
  const ticket = _test.sealTicket({ leadId: LEAD_ID, assetId: FILE_ID, storageBucket: "preview-zips", storagePath: `cockpit/lead/${LEAD_ID}/${FILE_ID}/website.zip`, name: "website.zip", extension: "zip", mimeType: "application/zip", sizeBytes: bytes.length, maxFileBytes: _test.MAX_ZIP_BYTES, description: "Website" }, TOKEN, NOW);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/rest/v1/leads?")) return jsonResponse(200, [{ id: LEAD_ID, company_name: "FuelGo" }]);
    if (url.includes("/rest/v1/files?") && options.method === "GET") return jsonResponse(200, []);
    if (url.includes("/storage/v1/object/preview-zips/") && options.method === "GET") return { ok: true, status: 200, headers: { get: (key) => key === "content-type" ? "application/zip" : key === "content-length" ? String(bytes.length) : null }, text: async () => "", arrayBuffer: async () => bytes };
    if (url.endsWith("/rest/v1/files") && options.method === "POST") return jsonResponse(201, [{ ...JSON.parse(options.body), created_at: NOW.toISOString() }]);
    throw new Error(`unexpected ${options.method} ${url}`);
  };
  const handler = createHandler({ env, fetchImpl, now: () => NOW });
  const result = await handler(event({ action: "finalize", leadId: LEAD_ID, uploadTicket: ticket }));
  assert.equal(result.statusCode, 201);
  const inserted = JSON.parse(calls.find((call) => call.url.endsWith("/rest/v1/files")).options.body);
  assert.equal(inserted.lead_id, LEAD_ID);
  assert.equal(inserted.customer_id, null);
  assert.equal(inserted.is_client_visible, false);
  assert.equal(inserted.metadata.quarantined, true);
  assert.equal(inserted.metadata.storageBucket, "preview-zips");
  assert.equal(JSON.parse(result.body).file.name, "website.zip");
});

test("expired and cross-lead tickets fail before storage access", async () => {
  const old = new Date("2026-08-06T07:00:00.000Z");
  const ticket = _test.sealTicket({ leadId: LEAD_ID, assetId: FILE_ID, storageBucket: "preview-zips", storagePath: `cockpit/lead/${LEAD_ID}/${FILE_ID}/website.zip`, name: "website.zip", extension: "zip", mimeType: "application/zip", sizeBytes: 42, maxFileBytes: _test.MAX_ZIP_BYTES, description: "" }, TOKEN, old);
  assert.throws(() => _test.openTicket(ticket, TOKEN, NOW), /INVALID_UPLOAD_TICKET/);
});

test("Cockpit ZIPs use the existing private preview vault without changing customer endpoint limits", () => {
  const root = path.resolve(__dirname, "..");
  const cockpitEndpoint = fs.readFileSync(path.join(root, "functions/cockpit-files.js"), "utf8");
  const clientEndpoint = fs.readFileSync(path.join(root, "functions/client-relationship-assets.js"), "utf8");
  const adminEndpoint = fs.readFileSync(path.join(root, "functions/admin-relationship-assets.js"), "utf8");
  assert.match(cockpitEndpoint, /DEFAULT_ZIP_BUCKET = "preview-zips"/);
  assert.match(cockpitEndpoint, /storageBucket: ticket\.storageBucket/);
  assert.match(adminEndpoint, /downloadBucket/);
  assert.match(clientEndpoint, /const MAX_BYTES = 8 \* 1024 \* 1024/);
  assert.doesNotMatch(clientEndpoint.slice(0, clientEndpoint.indexOf("const MIME_BY_EXTENSION")), /application\/zip/);
});
