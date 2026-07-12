const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const relationshipAssets = require("../functions/client-relationship-assets");
const api = relationshipAssets._test;
const portal = fs.readFileSync(path.join(root, "public/klantportaal.html"), "utf8");
const client = fs.readFileSync(path.join(root, "public/admin/ui/client-asset-upload.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260712123000_relationship_asset_library.sql"), "utf8");
const hardeningMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260712170000_relationship_asset_policy_hardening.sql"), "utf8");
const adminApi = require("../functions/admin-relationship-assets")._test;
const workspaceClient = fs.readFileSync(path.join(root, "public/admin/ui/relationship-workspace.js"), "utf8");

const IDS = Object.freeze({
  user: "11111111-1111-4111-8111-111111111111",
  customer: "22222222-2222-4222-8222-222222222222",
  duplicate: "33333333-3333-4333-8333-333333333333",
  profile: "44444444-4444-4444-8444-444444444444",
});

function png() {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("IEND", "ascii"),
    Buffer.from([0, 0, 0, 0]),
  ]);
}

function jpeg() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
}

function webp() {
  const bytes = Buffer.alloc(12);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(4, 4);
  bytes.write("WEBP", 8, "ascii");
  return bytes;
}

function svg(source = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>') {
  return Buffer.from(source, "utf8");
}

function pdf() {
  return Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii");
}

function doc() {
  const bytes = Buffer.alloc(640);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(bytes, 0);
  Buffer.from("WordDocument", "utf16le").copy(bytes, 64);
  return bytes;
}

function docx(extra = "") {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(100, 0x20),
    Buffer.from(`[Content_Types].xml word/document.xml ${extra}`, "utf8"),
  ]);
}

function mp4() {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(16, 0);
  bytes.write("ftyp", 4, "ascii");
  return bytes;
}

function webm() {
  const bytes = Buffer.alloc(20);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(bytes, 0);
  Buffer.from("webm", "ascii").copy(bytes, 8);
  return bytes;
}

const FILE_CASES = Object.freeze([
  ["logo met spaties.jpg", "image/jpeg", jpeg()],
  ["logo.jpeg", "image/jpeg", jpeg()],
  ["logo.png", "image/png", png()],
  ["logo.webp", "image/webp", webp()],
  ["logo.svg", "image/svg+xml", svg()],
  ["document.pdf", "application/pdf", pdf()],
  ["notitie.txt", "text/plain", Buffer.from("Veilige projectnotitie\n", "utf8")],
  ["brief.doc", "application/msword", doc()],
  ["brief.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx()],
  ["intro.mp4", "video/mp4", mp4()],
  ["intro.webm", "video/webm", webm()],
]);

function validMetadata(name = "logo.png", mimeType = "image/png", sizeBytes = png().length) {
  return {
    name,
    mimeType,
    sizeBytes,
    category: "logo",
    description: "Primair logo voor de website",
    usageRightsConfirmed: true,
  };
}

function assertCode(callback, code) {
  assert.throws(callback, (error) => error?.code === code, `expected ${code}`);
}

function mockResponse(status, body = null, headers = {}) {
  const normalizedHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  const binary = Buffer.isBuffer(body) ? body : null;
  const textBody = binary ? binary.toString("latin1") : body == null ? "" : typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => normalizedHeaders[String(name).toLowerCase()] || null },
    text: async () => textBody,
    json: async () => (typeof body === "object" && !binary ? body : JSON.parse(textBody || "null")),
    arrayBuffer: async () => {
      const value = binary || Buffer.from(textBody, "utf8");
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    },
  };
}

function parseEq(value = "") {
  if (value == null) return "";
  return decodeURIComponent(String(value).replace(/^eq\./, ""));
}

function installHandlerMock({
  bytes = png(),
  duplicate = null,
  listedAssets = [],
  assetRequests = [],
  listFilesFailure = null,
  assetRequestsFailure = null,
  timelineFailure = null,
  failInsert = false,
  failReconciliation = false,
  raceDuplicate = null,
  customerStatus = "active",
  portalStatus = "active",
  profileStatus = "active",
  profileRole = "customer",
} = {}) {
  const calls = [];
  const files = duplicate ? [{ ...duplicate }] : [];
  let insertAttempts = 0;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method || "GET";
    calls.push({ url: parsed.toString(), path: parsed.pathname, method, body: options.body });

    if (parsed.pathname.endsWith("/auth/v1/user")) {
      return mockResponse(200, { id: IDS.user, email: "klant-a@example.test" });
    }
    if (parsed.pathname.endsWith("/rest/v1/customers")) {
      return mockResponse(200, [{ id: IDS.customer, profile_id: IDS.profile, auth_user_id: IDS.user, status: customerStatus, portal_status: portalStatus, updated_at: "2026-07-12T12:00:00Z" }]);
    }
    if (parsed.pathname.endsWith("/rest/v1/profiles")) {
      return mockResponse(200, [{ id: IDS.profile, status: profileStatus, role: profileRole }]);
    }
    if (parsed.pathname.includes("/storage/v1/object/upload/sign/relationship-assets/")) {
      const relative = parsed.pathname.replace(/^\/storage\/v1/, "");
      return mockResponse(200, { url: `${relative}?token=signed-upload-token` });
    }
    if (parsed.pathname === "/storage/v1/object/relationship-assets" && method === "DELETE") {
      return mockResponse(200, { message: "removed" });
    }
    if (parsed.pathname.startsWith("/storage/v1/object/relationship-assets/") && method === "GET") {
      return mockResponse(200, bytes, { "content-type": "image/png", "content-length": bytes.length });
    }
    if (parsed.pathname.endsWith("/rest/v1/files") && method === "GET") {
      if (!parsed.searchParams.get("id") && !parsed.searchParams.get("checksum") && listFilesFailure) {
        return mockResponse(listFilesFailure.status, listFilesFailure.body);
      }
      if (failReconciliation && insertAttempts > 0) return mockResponse(503, { code: "XX000", message: "reconciliation unavailable" });
      const id = parseEq(parsed.searchParams.get("id"));
      if (id) return mockResponse(200, files.filter((row) => row.id === id));
      const checksum = parseEq(parsed.searchParams.get("checksum"));
      if (checksum) {
        const match = files.find((row) => row.checksum === checksum);
        return mockResponse(200, match ? [match] : []);
      }
      return mockResponse(200, listedAssets);
    }
    if (parsed.pathname.endsWith("/rest/v1/asset_requests") && method === "GET") {
      if (assetRequestsFailure) return mockResponse(assetRequestsFailure.status, assetRequestsFailure.body);
      return mockResponse(200, assetRequests);
    }
    if (parsed.pathname.endsWith("/rest/v1/files") && method === "POST") {
      insertAttempts += 1;
      if (raceDuplicate) {
        if (!files.some((row) => row.id === raceDuplicate.id)) files.push({ ...raceDuplicate });
        return mockResponse(409, { code: "23505", message: "duplicate key" });
      }
      if (failInsert) return mockResponse(500, { code: "XX000", message: "insert failed" });
      const record = JSON.parse(options.body || "{}");
      files.push(record);
      return mockResponse(201, [record]);
    }
    if (parsed.pathname.endsWith("/rest/v1/customer_timeline_events") && method === "POST") {
      if (timelineFailure) return mockResponse(timelineFailure.status, timelineFailure.body);
      return mockResponse(201, null);
    }
    throw new Error(`Unexpected fetch: ${method} ${parsed}`);
  };
  return { calls, files, get insertAttempts() { return insertAttempts; } };
}

async function withHandlerEnvironment(callback) {
  const previousFetch = global.fetch;
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RELATIONSHIP_ASSET_UPLOAD_SECRET: process.env.RELATIONSHIP_ASSET_UPLOAD_SECRET,
  };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.RELATIONSHIP_ASSET_UPLOAD_SECRET = "relationship-upload-test-secret";
  try {
    return await callback();
  } finally {
    global.fetch = previousFetch;
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

async function prepareUpload(metadata = validMetadata()) {
  const response = await relationshipAssets.handler({
    httpMethod: "POST",
    headers: { Authorization: "Bearer customer-a-token" },
    body: JSON.stringify({ action: "prepare", ...metadata }),
  });
  return { response, body: JSON.parse(response.body) };
}

async function finalizeUpload(uploadId) {
  const response = await relationshipAssets.handler({
    httpMethod: "POST",
    headers: { Authorization: "Bearer customer-a-token" },
    body: JSON.stringify({ action: "finalize", uploadId }),
  });
  return { response, body: JSON.parse(response.body) };
}

async function listAssets() {
  const response = await relationshipAssets.handler({
    httpMethod: "GET",
    headers: { Authorization: "Bearer customer-a-token" },
  });
  return { response, body: JSON.parse(response.body) };
}

test("metadata validates extension, MIME type, size, category and rights for every supported format", () => {
  for (const [name, mimeType, bytes] of FILE_CASES) {
    const metadata = api.validateMetadata(validMetadata(name, mimeType, bytes.length));
    assert.equal(metadata.name, name);
    assert.equal(metadata.mimeType, mimeType);
    assert.equal(metadata.extension, api.extensionFor(name));
    assert.equal(api.ALLOWED.has(mimeType), true);
  }
  assert.equal(api.MAX_BYTES, 8 * 1024 * 1024);
});

test("metadata rejects extension/MIME mismatches, empty and oversized files, unsafe names and missing rights", () => {
  assertCode(() => api.validateMetadata(validMetadata("logo.png", "image/jpeg", jpeg().length)), "UNSUPPORTED_FILE_TYPE");
  assertCode(() => api.validateMetadata(validMetadata("payload.exe", "application/octet-stream", 12)), "UNSUPPORTED_FILE_TYPE");
  assertCode(() => api.validateMetadata(validMetadata("../logo.png", "image/png", png().length)), "INVALID_FILENAME");
  assertCode(() => api.validateMetadata(validMetadata("logo/evil.png", "image/png", png().length)), "INVALID_FILENAME");
  assertCode(() => api.validateMetadata(validMetadata("logo.png", "image/png", 0)), "EMPTY_FILE");
  assertCode(() => api.validateMetadata(validMetadata("logo.png", "image/png", api.MAX_BYTES + 1)), "FILE_TOO_LARGE");
  assertCode(() => api.validateMetadata({ ...validMetadata(), usageRightsConfirmed: false }), "USAGE_RIGHTS_REQUIRED");
  assertCode(() => api.validateMetadata({ ...validMetadata(), category: "../../other" }), "INVALID_CATEGORY");
  const acceptedLongName = `${"a".repeat(api.MAX_FILENAME_LENGTH - 4)}.png`;
  const rejectedLongName = `${"a".repeat(api.MAX_FILENAME_LENGTH - 3)}.png`;
  assert.equal(api.validateMetadata(validMetadata(acceptedLongName)).name.length, api.MAX_FILENAME_LENGTH);
  assertCode(() => api.validateMetadata(validMetadata(rejectedLongName)), "INVALID_FILENAME");
});

test("400 validation responses expose code, message and safe details", async () => {
  await withHandlerEnvironment(async () => {
    installHandlerMock();
    const response = await relationshipAssets.handler({
      httpMethod: "POST",
      headers: { Authorization: "Bearer customer-a-token" },
      body: JSON.stringify({ action: "prepare", ...validMetadata(), category: "not-a-category" }),
    });
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 400);
    assert.equal(body.code, "INVALID_CATEGORY");
    assert.equal(body.message, "Kies een geldige categorie.");
    assert.equal(body.details, "field=category; step=metadata_category");
    assert.equal(body.error, body.message);
  });
});

test("safe request logging compares the complete frontend contract without exposing upload tokens", () => {
  const request = api.safeRequestBody({
    action: "finalize",
    category: "logo",
    name: "fuellinq-logo.png",
    mimeType: "image/png",
    sizeBytes: 123,
    checksum: "abc123",
    description: "Logo",
    usageRightsConfirmed: true,
    uploadId: "secret-upload-token",
    relationshipId: "relationship-a",
    customerId: IDS.customer,
  });
  assert.deepEqual(request.uploadId, { present: true, length: 19 });
  assert.equal(request.action, "finalize");
  assert.equal(request.filename, "fuellinq-logo.png");
  assert.equal(request.size, 123);
  assert.equal(request.consent, true);
  assert.equal(JSON.stringify(request).includes("secret-upload-token"), false);
});

test("content signatures accept valid PNG, JPG, WEBP, SVG, PDF, DOC, DOCX, TXT and video fixtures", () => {
  for (const [name, mimeType, bytes] of FILE_CASES) {
    assert.equal(api.signatureMatches(bytes, mimeType, api.extensionFor(name)), true, `${name} should match its signature`);
  }
  assert.equal(api.signatureMatches(Buffer.from("not a png"), "image/png", "png"), false);
  assert.equal(api.signatureMatches(png(), "image/jpeg", "jpg"), false);
  assert.equal(api.signatureMatches(pdf(), "application/pdf", "png"), false);
});

test("SVG, text and Office validation reject active content, binary text, macros and fake documents", () => {
  assert.equal(api.validateSvg(svg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), false);
  assert.equal(api.validateSvg(svg('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/a.png"/></svg>')), false);
  assert.equal(api.validateSvg(svg('<svg xmlns="http://www.w3.org/2000/svg"><a href="#local"><path d="M0 0"/></a></svg>')), true);
  assert.equal(api.validateSvg(svg('<?xml-stylesheet href="https://evil.example/theme.css"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')), false);
  assert.equal(api.validateSvg(svg('<svg xmlns="http://www.w3.org/2000/svg" xml:base="https://evil.example/"></svg>')), false);
  assert.equal(api.validateSvg(svg('<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')), true);
  assert.equal(api.validateText(Buffer.from([0x41, 0x00, 0x42])), false);
  assert.equal(api.validateDoc(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600)])), false);
  assert.equal(api.validateDocx(docx("word/vbaProject.bin")), false);
});

test("stored file validation checks declared size, stored content type and signature", () => {
  const bytes = png();
  const prepared = { ...validMetadata("logo.png", "image/png", bytes.length), extension: "png" };
  assert.doesNotThrow(() => api.validateStoredFile(bytes, "image/png; charset=binary", prepared));
  assertCode(() => api.validateStoredFile(bytes, "image/jpeg", prepared), "MIME_MISMATCH");
  assertCode(() => api.validateStoredFile(bytes, "image/png", { ...prepared, sizeBytes: bytes.length + 1 }), "FILE_SIZE_MISMATCH");
  assertCode(() => api.validateStoredFile(Buffer.from("broken"), "image/png", { ...prepared, sizeBytes: 6 }), "MIME_MISMATCH");
});

test("storage filenames and download names remove path traversal while preserving the visible original name", () => {
  assert.equal(api.extensionFor("Mijn Logo.V2.PNG"), "png");
  assert.equal(api.sanitizeFilename("Mijn Lógó zomer 2026.PNG", "png"), "Mijn-Logo-zomer-2026.png");
  assert.equal(api.safeDownloadName("../contract\u0000.pdf"), "..-contract.pdf");
  const prepared = {
    assetId: IDS.duplicate,
    storagePath: `${IDS.customer}/${IDS.duplicate}/Mijn-Logo-zomer-2026.png`,
    ...api.validateMetadata(validMetadata("Mijn Lógó zomer 2026.PNG", "image/png", png().length)),
  };
  const record = api.assetRecord(prepared, "checksum", IDS.user, IDS.customer, png().length);
  assert.equal(record.name, "Mijn Lógó zomer 2026.PNG");
  assert.equal(record.original_filename, "Mijn Lógó zomer 2026.PNG");
  assert.match(record.storage_path, new RegExp(`^${IDS.customer}/${IDS.duplicate}/[A-Za-z0-9._-]+$`));
});

test("client asset responses never expose storage paths, checksums, uploader ids or metadata", () => {
  const safe = api.safeAsset({
    id: IDS.duplicate,
    name: "logo.png",
    original_filename: "logo.png",
    storage_path: "private/customer/logo.png",
    checksum: "secret-checksum",
    uploaded_by_auth_user_id: IDS.user,
    mime_type: "image/png",
    size_bytes: 20,
    uploaded_by_type: "customer",
    metadata: { description: "Veilige omschrijving", internal: "secret" },
  });
  const serialized = JSON.stringify(safe);
  assert.equal(safe.description, "Veilige omschrijving");
  assert.equal(safe.previewAvailable, true);
  for (const forbidden of ["storage_path", "private/customer", "checksum", "uploaded_by_auth_user_id", "internal", "secret-checksum"]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} must stay private`);
  }
});

test("GET returns an empty customer asset list without touching storage or timeline", async () => {
  await withHandlerEnvironment(async () => {
    const mock = installHandlerMock();
    const result = await listAssets();
    assert.equal(result.response.statusCode, 200);
    assert.deepEqual(result.body.assets, []);
    assert.deepEqual(result.body.requests, []);
    assert.equal(mock.calls.some((call) => call.path.includes("/storage/v1/")), false);
    assert.equal(mock.calls.some((call) => call.path.endsWith("/customer_timeline_events")), false);
  });
});

test("GET maps valid PNG, legacy metadata and null optional fields with safe defaults", async () => {
  await withHandlerEnvironment(async () => {
    installHandlerMock({ listedAssets: [
      { id: IDS.duplicate, name: "logo.png", mime_type: "image/png", size_bytes: png().length, metadata: '{"description":"Oud logo"}', is_client_visible: true },
      { id: IDS.profile, name: null, original_filename: null, mime_type: null, size_bytes: null, category: null, status: null, metadata: "not-json", is_client_visible: true },
    ] });
    const result = await listAssets();
    assert.equal(result.response.statusCode, 200);
    assert.equal(result.body.assets.length, 2);
    assert.equal(result.body.assets[0].description, "Oud logo");
    assert.equal(result.body.assets[0].previewAvailable, true);
    assert.equal(result.body.assets[1].name, "Bestand");
    assert.equal(result.body.assets[1].sizeBytes, 0);
    assert.equal(result.body.assets[1].description, "");
  });
});

test("GET skips one invalid legacy item, keeps valid assets and never signs previews during listing", async () => {
  await withHandlerEnvironment(async () => {
    const mock = installHandlerMock({ listedAssets: [
      { id: "legacy-invalid-id", name: "kapot.png", mime_type: "image/png" },
      { id: IDS.duplicate, name: "geldig.png", mime_type: "image/png", storage_path: "missing/object.png" },
    ] });
    const result = await listAssets();
    assert.equal(result.response.statusCode, 200);
    assert.equal(result.body.assets.length, 1);
    assert.equal(result.body.assets[0].name, "geldig.png");
    assert.equal(mock.calls.some((call) => call.path.includes("/storage/v1/")), false);
  });
});

test("GET scopes files to the authenticated customer and treats optional requests as non-blocking", async () => {
  await withHandlerEnvironment(async () => {
    const mock = installHandlerMock({ assetRequestsFailure: { status: 404, body: { code: "PGRST205", message: "missing optional table" } } });
    const result = await listAssets();
    assert.equal(result.response.statusCode, 200);
    const fileCall = mock.calls.find((call) => call.path.endsWith("/rest/v1/files"));
    assert.equal(new URL(fileCall.url).searchParams.get("customer_id"), `eq.${IDS.customer}`);
    assert.deepEqual(result.body.requests, []);
  });
});

test("GET reports database schema failures as server errors instead of HTTP 400", async () => {
  await withHandlerEnvironment(async () => {
    installHandlerMock({ listFilesFailure: { status: 404, body: { code: "PGRST205", message: "Could not find public.files" } } });
    const result = await listAssets();
    assert.equal(result.response.statusCode, 500);
    assert.equal(result.body.code, "DATA_FAILED");
    assert.equal(result.body.message, "Bestandsgegevens konden niet worden verwerkt.");
    assert.equal(JSON.stringify(result.body).includes("public.files"), false);
  });
});

test("inactive assets cannot be downloaded or previewed", () => {
  for (const status of ["archived", "rejected", "replaced", "deleted"]) {
    const safe = api.safeAsset({ id: IDS.duplicate, name: "oud.png", mime_type: "image/png", status });
    assert.equal(api.isInactiveAssetStatus(status), true);
    assert.equal(safe.downloadAvailable, false);
    assert.equal(safe.previewAvailable, false);
  }
});

test("disabled portal customers and inactive or non-customer profiles are denied", async () => {
  for (const options of [
    { portalStatus: "disabled" },
    { customerStatus: "archived" },
    { profileStatus: "disabled" },
    { profileRole: "admin" },
  ]) {
    await withHandlerEnvironment(async () => {
      installHandlerMock(options);
      const prepared = await prepareUpload();
      assert.equal(prepared.response.statusCode, 403);
      assert.equal(prepared.body.code, "FORBIDDEN");
    });
  }
  assert.equal(api.isCustomerActive({ status: "active", portal_status: "active" }), true);
  assert.equal(api.isCustomerActive({ status: "active", portal_status: "disabled" }), false);
  assert.equal(api.isProfileActive({ status: "active", role: "customer" }), true);
  assert.equal(api.isProfileActive({ status: "disabled", role: "customer" }), false);
});

test("sealed upload ids round-trip, expire and reject tampering", () => {
  const now = Date.UTC(2026, 6, 12, 12, 0, 0);
  const payload = { assetId: IDS.duplicate, customerId: IDS.customer, userId: IDS.user, name: "logo.png" };
  const token = api.sealUpload(payload, "secret", now, Buffer.alloc(12, 7));
  const opened = api.openUpload(token, "secret", now + 1000);
  assert.deepEqual({ assetId: opened.assetId, customerId: opened.customerId, userId: opened.userId, name: opened.name }, payload);
  assertCode(() => api.openUpload(token, "secret", now + ((api.UPLOAD_TTL_SECONDS + 1) * 1000)), "INVALID_UPLOAD");
  const replacement = token.at(-1) === "A" ? "B" : "A";
  assertCode(() => api.openUpload(`${token.slice(0, -1)}${replacement}`, "secret", now), "INVALID_UPLOAD");
});

test("signed storage URLs stay on the configured Supabase origin and relationship bucket", () => {
  const context = { url: "https://example.supabase.co" };
  const expectedPrefix = "/storage/v1/object/upload/sign/relationship-assets/";
  assert.match(
    api.resolveStorageUrl(context, "/object/upload/sign/relationship-assets/customer/file.png?token=safe", expectedPrefix),
    /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/upload\/sign\/relationship-assets\//
  );
  assert.equal(api.resolveStorageUrl(context, "https://evil.example/storage/v1/object/upload/sign/relationship-assets/file", expectedPrefix), "");
  assert.equal(api.resolveStorageUrl(context, "/object/upload/sign/other-bucket/file", expectedPrefix), "");
});

test("prepare/finalize uploads binary storage data once and repeated finalize is idempotent", async () => {
  await withHandlerEnvironment(async () => {
    const bytes = png();
    const mock = installHandlerMock({ bytes });
    const prepared = await prepareUpload(validMetadata("Logo met spaties.png", "image/png", bytes.length));
    assert.equal(prepared.response.statusCode, 200);
    assert.equal(prepared.body.uploadMethod, "PUT");
    assert.match(prepared.body.uploadUrl, /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/upload\/sign\/relationship-assets\//);
    assert.equal("storagePath" in prepared.body, false);

    const first = await finalizeUpload(prepared.body.uploadId);
    assert.equal(first.response.statusCode, 201);
    assert.equal(first.body.success, true);
    assert.equal(first.body.duplicate, false);
    assert.equal(first.body.asset.name, "Logo met spaties.png");
    assert.equal(JSON.stringify(first.body).includes("storage_path"), false);

    const second = await finalizeUpload(prepared.body.uploadId);
    assert.equal(second.response.statusCode, 200);
    assert.equal(second.body.success, true);
    assert.equal(second.body.duplicate, false);
    assert.equal(mock.insertAttempts, 1);
    assert.equal(mock.calls.filter((call) => call.method === "GET" && call.path.startsWith("/storage/v1/object/relationship-assets/")).length, 1);
  });
});

test("finalize succeeds when the optional timeline table is unavailable", async () => {
  await withHandlerEnvironment(async () => {
    installHandlerMock({ timelineFailure: { status: 404, body: { code: "PGRST205", message: "timeline unavailable" } } });
    const prepared = await prepareUpload();
    const finalized = await finalizeUpload(prepared.body.uploadId);
    assert.equal(finalized.response.statusCode, 201);
    assert.equal(finalized.body.success, true);
  });
});

test("prepare derives customer ownership from the bearer session and ignores spoofed customer ids", async () => {
  await withHandlerEnvironment(async () => {
    installHandlerMock({ bytes: png() });
    const prepared = await prepareUpload({
      ...validMetadata(),
      customerId: "99999999-9999-4999-8999-999999999999",
    });
    assert.equal(prepared.response.statusCode, 200);
    const sealed = api.openUpload(prepared.body.uploadId, process.env.RELATIONSHIP_ASSET_UPLOAD_SECRET);
    assert.equal(sealed.customerId, IDS.customer);
    assert.equal(sealed.userId, IDS.user);
    assert.notEqual(sealed.customerId, "99999999-9999-4999-8999-999999999999");
  });
});

test("finalize removes corrupt prepared objects and never inserts them", async () => {
  await withHandlerEnvironment(async () => {
    const bytes = Buffer.from("definitely not a PNG", "utf8");
    const mock = installHandlerMock({ bytes });
    const prepared = await prepareUpload(validMetadata("broken.png", "image/png", bytes.length));
    const finalized = await finalizeUpload(prepared.body.uploadId);
    assert.equal(finalized.response.statusCode, 400);
    assert.equal(finalized.body.code, "MIME_MISMATCH");
    assert.equal(JSON.stringify(finalized.body).includes("storage"), false);
    assert.equal(mock.insertAttempts, 0);
    assert.equal(mock.calls.filter((call) => call.method === "DELETE" && call.path === "/storage/v1/object/relationship-assets").length, 1);
  });
});

test("checksum duplicates return the existing asset and clean up the prepared object", async () => {
  await withHandlerEnvironment(async () => {
    const bytes = png();
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    const duplicate = {
      id: IDS.duplicate,
      customer_id: IDS.customer,
      name: "bestaand-logo.png",
      original_filename: "bestaand-logo.png",
      mime_type: "image/png",
      size_bytes: bytes.length,
      category: "logo",
      status: "new",
      checksum,
      uploaded_by_type: "customer",
    };
    const mock = installHandlerMock({ bytes, duplicate });
    const prepared = await prepareUpload(validMetadata("opnieuw.png", "image/png", bytes.length));
    const finalized = await finalizeUpload(prepared.body.uploadId);
    assert.equal(finalized.response.statusCode, 200);
    assert.equal(finalized.body.duplicate, true);
    assert.equal(finalized.body.asset.id, IDS.duplicate);
    assert.equal(mock.insertAttempts, 0);
    assert.equal(mock.calls.some((call) => call.method === "DELETE" && call.path === "/storage/v1/object/relationship-assets"), true);
  });
});

test("database insert failures clean up storage and unique races resolve to duplicate success", async () => {
  await withHandlerEnvironment(async () => {
    const bytes = png();
    const failed = installHandlerMock({ bytes, failInsert: true });
    const prepared = await prepareUpload(validMetadata("db-fout.png", "image/png", bytes.length));
    const finalized = await finalizeUpload(prepared.body.uploadId);
    assert.equal(finalized.response.statusCode, 502);
    assert.equal(finalized.body.code, "DATA_FAILED");
    assert.equal(JSON.stringify(finalized.body).includes("insert failed"), false);
    assert.equal(JSON.stringify(finalized.body).includes("XX000"), false);
    assert.equal(failed.calls.some((call) => call.method === "DELETE" && call.path === "/storage/v1/object/relationship-assets"), true);
  });

  await withHandlerEnvironment(async () => {
    const bytes = png();
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    const raceDuplicate = {
      id: IDS.duplicate,
      customer_id: IDS.customer,
      name: "race-winnaar.png",
      original_filename: "race-winnaar.png",
      mime_type: "image/png",
      size_bytes: bytes.length,
      category: "logo",
      status: "new",
      checksum,
      uploaded_by_type: "customer",
    };
    const raced = installHandlerMock({ bytes, raceDuplicate });
    const prepared = await prepareUpload(validMetadata("race-verliezer.png", "image/png", bytes.length));
    const finalized = await finalizeUpload(prepared.body.uploadId);
    assert.equal(finalized.response.statusCode, 200);
    assert.equal(finalized.body.duplicate, true);
    assert.equal(finalized.body.asset.id, IDS.duplicate);
    assert.equal(raced.insertAttempts, 1);
    assert.equal(raced.calls.some((call) => call.method === "DELETE" && call.path === "/storage/v1/object/relationship-assets"), true);
  });
});

test("ambiguous insert failures preserve storage when reconciliation is unavailable", async () => {
  await withHandlerEnvironment(async () => {
    const bytes = png();
    const mock = installHandlerMock({ bytes, failInsert: true, failReconciliation: true });
    const prepared = await prepareUpload(validMetadata("mogelijk-opgeslagen.png", "image/png", bytes.length));
    const finalized = await finalizeUpload(prepared.body.uploadId);
    assert.equal(finalized.response.statusCode, 502);
    assert.equal(finalized.body.code, "DATA_FAILED");
    assert.equal(mock.calls.some((call) => call.method === "DELETE" && call.path === "/storage/v1/object/relationship-assets"), false);
  });
});

test("migration enforces one relationship, checksum dedupe, customer read isolation and a private bucket", () => {
  assert.match(migration, /create table if not exists public\.files/);
  assert.match(migration, /is_client_visible boolean not null default true/);
  assert.match(migration, /files_one_relationship_check/);
  assert.match(migration, /files_customer_checksum_unique/);
  assert.match(migration, /relationship-assets','relationship-assets',false/);
  assert.match(migration, /owns_customer\(customer_id\)/);
  assert.match(hardeningMigration, /drop policy if exists "customers read own files"/);
  assert.match(hardeningMigration, /drop policy if exists files_owner_read/);
  assert.match(hardeningMigration, /public\.owns_customer\(customer_id\)/);
  assert.match(hardeningMigration, /is_client_visible = true/);
  assert.match(hardeningMigration, /customer\.portal_status/);
  assert.match(hardeningMigration, /profile\.status/);
});

test("portal upload shell exposes category, rights, selected files and progress", () => {
  assert.match(portal, /id="relationship-asset-files"[^>]*type="file"[^>]*multiple[^>]*tabindex="-1"[^>]*aria-hidden="true"/);
  assert.match(portal, /id="relationship-asset-dropzone"/);
  assert.match(portal, /id="relationship-asset-selected-list"/);
  assert.match(portal, /id="relationship-asset-progress"/);
  assert.match(portal, /name="usageRightsConfirmed"/);
  assert.match(portal, /id="relationship-asset-category"[^>]*aria-describedby="relationship-asset-category-error"/);
  assert.match(portal, /id="relationship-asset-rights"[^>]*aria-describedby="relationship-asset-rights-error"/);
});

test("admin review supports approval, rejection, archive and primary logo without leaking paths", () => {
  assert.equal(adminApi.ACTIONS.primary.status, "approved");
  assert.equal(adminApi.ACTIONS.primary.brandingRole, "primary_logo");
  assert.equal(adminApi.safe({ id: "a", storage_path: "secret" }).storage_path, undefined);
  assert.match(workspaceClient, /data-asset-action="approve"/);
  assert.match(workspaceClient, /admin-relationship-assets/);
});

test("client upload script is present for the binary prepare/finalize flow", () => {
  assert.match(client, /client-relationship-assets/);
  assert.match(client, /requestJson\("prepare"/);
  assert.match(client, /requestJson\("finalize"/);
  assert.match(client, /new XMLHttpRequest\(\)/);
  assert.match(client, /xhr\.open\("PUT"/);
  assert.match(client, /new FormData\(\)/);
  assert.match(client, /body\.append\("cacheControl", "3600"\)/);
  assert.match(client, /body\.append\("", uploadFile\)/);
  assert.doesNotMatch(client, /FileReader|readAsDataURL|arrayBuffer|base64/i);
});

test("client upload UI guards double submits, renders removable cards and resets only after complete success", () => {
  assert.match(client, /let isUploading = false/);
  assert.match(client, /if \(isUploading \|\| !validateForm\(\)\) return/);
  assert.match(client, /setUploading\(true\)/);
  assert.match(client, /finally \{\s*setUploading\(false\)/);
  assert.match(client, /customer-asset-selected-card/);
  assert.match(client, /customer-asset-remove/);
  assert.match(client, /dropzone\?\.addEventListener\("drop"/);
  assert.match(client, /xhr\.upload\.addEventListener\("progress"/);
  const finalizeIndex = client.indexOf('await requestJson("finalize"');
  const resetIndex = client.indexOf("form.reset()", finalizeIndex);
  const catchIndex = client.indexOf("} catch (error) {", resetIndex);
  assert(finalizeIndex > -1 && resetIndex > finalizeIndex && catchIndex > resetIndex, "form reset must remain in the all-success branch after finalize");
});

test("successful uploads refresh the same Asset Center data source and responsive styles prevent overflow", () => {
  assert.match(client, /relationship-assets:updated/);
  assert.match(client, /relationship-assets:refresh-requested/);
  assert.match(client, /window\.__MWS_RELATIONSHIP_ASSETS__/);
  assert.match(client, /upload-optimistic/);
  assert.match(client, /Vernieuw de pagina als de bibliotheek nog niet is bijgewerkt/);
  assert.match(portal, /window\.addEventListener\("relationship-assets:updated"/);
  assert.match(portal, /window\.dispatchEvent\(new CustomEvent\("relationship-assets:refresh-requested"\)\)/);
  assert.match(portal, /files: \[\.\.\.files, \.\.\.relationshipAssets\]/);
  for (const selector of [
    ".customer-asset-upload-card",
    ".customer-asset-dropzone",
    ".customer-asset-selected-card",
    ".customer-asset-progress",
    ".customer-asset-submit",
  ]) assert.match(styles, new RegExp(selector.replace(".", "\\.")));
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*?\.customer-asset-upload-layout[\s\S]*?grid-template-columns: 1fr/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.customer-asset-submit[\s\S]*?width: 100%/);
});

test("private image previews load lazily with bounded concurrency", () => {
  assert.match(client, /MAX_CONCURRENT_PREVIEWS = 2/);
  assert.match(client, /window\.getRelationshipAssetPreview/);
  assert.match(client, /previewInflight\.has/);
  assert.doesNotMatch(client, /hydrateImagePreviews/);
  assert.match(portal, /new IntersectionObserver/);
  assert.match(portal, /queuePortalAssetPreview/);
});

test("terminal relationship lifecycle states are explicit before the customer fallback", () => {
  const rejectedIndex = portal.indexOf('if (["rejected", "afgekeurd"].includes(value))');
  const relationshipFallbackIndex = portal.indexOf('asset.isRelationshipAsset || asset.source === "customer"');
  assert(rejectedIndex > -1 && relationshipFallbackIndex > rejectedIndex);
  assert.match(portal, /\["replaced", "vervangen"\]/);
  assert.match(portal, /\["archived", "gearchiveerd", "deleted", "verwijderd"\]/);
});

test("Asset Center tolerates missing onboarding data and never links undefined relationships", () => {
  assert.match(portal, /const onboardingRecord = onboarding && typeof onboarding === "object" \? onboarding : \{\}/);
  assert.match(portal, /const answers = onboardingRecord\.answers \|\| \{\}/);
  assert.match(portal, /const assetProjectId = asset\.projectId \|\| asset\.project_id \|\| ""/);
  assert.match(portal, /const projectName = assetProjectId\s*\? context\.projects\?\.find/);
  assert.match(portal, /const websiteName = assetWebsiteId\s*\? context\.websites\?\.find/);
});

test("Asset Center deduplicates stable ids and prefers the secured relationship asset", () => {
  assert.match(portal, /const key = asset\.rawId\s*\? `id:\$\{asset\.rawId\}`/);
  assert.match(portal, /!existing\.isRelationshipAsset && asset\.isRelationshipAsset/);
});

test("dark upload controls keep explicit contrast instead of inheriting legacy button text", () => {
  assert.match(styles, /\.customer-asset-dropzone \.button \{[\s\S]*?color: #eef8ff;/);
});
