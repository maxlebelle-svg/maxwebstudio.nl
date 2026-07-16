const test = require("node:test");
const assert = require("node:assert/strict");
const { _private: manualZip } = require("../functions/admin-manual-preview");
const zipRoute = require("../functions/admin-preview-zip-download");
const {
  MAX_FILES,
  MAX_UNPACKED_BYTES,
  createCompressedZip,
  packageContentHash,
  preparePreviewPackage,
} = require("../functions/_preview-zip");

const IDS = {
  version: "545bd552-c30d-4e81-ba48-fed20f0c97df",
  journey: "c01dfe2d-a0de-4873-ac3b-2c10d403e444",
  customer: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  otherCustomer: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

function packageWith40Files() {
  const binary = (length, seed) => {
    let value = seed >>> 0;
    return Buffer.from(Array.from({ length }, () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value & 0xff;
    }));
  };
  const files = [
    { path: "index.html", content: `<!doctype html><link rel="stylesheet" href="styles.css"><script src="script.js"></script><img src="assets/hero.png">` },
    { path: "styles.css", content: "body{color:#123;background:#fff}".repeat(100) },
    { path: "script.js", content: "document.body.dataset.ready='yes';".repeat(100) },
    { path: "assets/hero.png", encoding: "base64", content: binary(4096, 7).toString("base64") },
    { path: "assets/font.woff2", encoding: "base64", content: binary(2048, 3).toString("base64") },
  ];
  for (let index = files.length; index < 40; index += 1) files.push({ path: `pages/page-${index}.html`, content: `<h1>Pagina ${index}</h1>${"veilige preview ".repeat(100)}` });
  return { entryFile: "index.html", files, meta: { previewSource: "manual_zip" } };
}

function jsonResponse(value, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    json: async () => value,
    text: async () => JSON.stringify(value),
  };
}

function event(overrides = {}) {
  return {
    httpMethod: "POST",
    headers: { authorization: "Bearer admin-test" },
    body: JSON.stringify({
      action: "prepare",
      previewVersionId: IDS.version,
      source: "manual_zip",
      customerId: IDS.customer,
      demoJourneyId: IDS.journey,
      ...overrides,
    }),
  };
}

function installEnv() {
  process.env.ADMIN_TOKEN = "admin-test";
  process.env.ALLOW_LEGACY_ADMIN_TOKEN = "true";
  process.env.APP_ENV = "test";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.PREVIEW_ZIP_STORAGE_BUCKET = "preview-zips";
}

function installStorageMock({ existing = false, versionSource = "manual_zip", customerId = IDS.customer, bucketPublic = false, uploadStatus = 200, standalone = false } = {}) {
  const uploads = [];
  const calls = [];
  const previewPackage = packageWith40Files();
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (String(url).includes("/rest/v1/website_preview_versions")) return jsonResponse([{
      id: IDS.version,
      demo_journey_id: standalone ? null : IDS.journey,
      customer_id: customerId,
      generated_package: previewPackage,
      metadata: { previewSource: versionSource },
      version: 7,
      title: "Heel je Zelf",
    }]);
    if (String(url).includes("/rest/v1/demo_journeys")) {
      if (standalone) throw new Error("Standalone manual ZIP must not resolve a Demo Journey");
      return jsonResponse([{ id: IDS.journey, customer_id: customerId, business_name: "Heel je Zelf" }]);
    }
    if (String(url).includes("/rest/v1/customers")) return jsonResponse([{ id: customerId }]);
    if (String(url).includes("/storage/v1/bucket/preview-zips")) return jsonResponse({ id: "preview-zips", public: bucketPublic });
    if (options.method === "HEAD") return existing ? jsonResponse(null, 200, { "content-length": "2468" }) : jsonResponse(null, 404);
    if (String(url).includes("/storage/v1/object/sign/")) {
      const storagePath = String(url).split("/storage/v1/object/sign/preview-zips/")[1];
      return jsonResponse({ signedURL: `/object/sign/preview-zips/${storagePath}?token=short-lived` });
    }
    if (String(url).includes("/storage/v1/object/preview-zips/") && options.method === "POST") {
      uploads.push(Buffer.from(options.body));
      return jsonResponse({}, uploadStatus);
    }
    throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
  };
  return { uploads, calls, previewPackage };
}

test.beforeEach(installEnv);

test("40 original files become 40 deterministic compressed ZIP entries", () => {
  const previewPackage = packageWith40Files();
  const prepared = preparePreviewPackage(previewPackage);
  const reversed = preparePreviewPackage({ ...previewPackage, files: [...previewPackage.files].reverse() });
  const zip = createCompressedZip(prepared);
  const extracted = manualZip.extractZip(zip.bytes);
  assert.equal(prepared.fileCount, 40);
  assert.equal(extracted.files.length, 40);
  assert.equal(packageContentHash(prepared, "manual_zip"), packageContentHash(reversed, "manual_zip"));
  assert.equal(new Set(extracted.files.map((file) => file.path)).size, 40);
  assert(extracted.files.some((file) => file.path === "index.html"));
  assert(extracted.files.some((file) => file.path === "styles.css"));
  assert(extracted.files.some((file) => file.path === "script.js"));
  assert(extracted.files.some((file) => file.path === "assets/hero.png"));
  assert(extracted.files.some((file) => file.path === "assets/font.woff2"));
  assert(!extracted.files.some((file) => /^(live-upload|vm-tegelwerken-live)\//.test(file.path)));
  assert(zip.zipBytes < prepared.unpackedBytes);
});

test("unsafe, duplicate, symlinked, excessive and oversized packages are rejected", () => {
  const base = { entryFile: "index.html" };
  assert.throws(() => preparePreviewPackage({ ...base, files: [{ path: "../index.html", content: "x" }] }), (error) => error.code === "PREVIEW_PACKAGE_PATH_INVALID");
  for (const path of ["folder//index.html", "folder/./index.html", "folder/control\u0007.html"]) assert.throws(() => preparePreviewPackage({ ...base, files: [{ path, content: "x" }] }), (error) => error.code === "PREVIEW_PACKAGE_PATH_INVALID");
  assert.throws(() => preparePreviewPackage({ ...base, files: [{ path: "index.html", content: "x" }, { path: "index.html", content: "y" }] }), (error) => error.code === "PREVIEW_PACKAGE_DUPLICATE_PATH");
  assert.throws(() => preparePreviewPackage({ ...base, files: [{ path: "index.html", content: "x", symlink: true }] }), (error) => error.code === "PREVIEW_PACKAGE_SYMLINK");
  assert.throws(() => preparePreviewPackage({ ...base, files: Array.from({ length: MAX_FILES + 1 }, (_, index) => ({ path: index ? `f-${index}.txt` : "index.html", content: "x" })) }), (error) => error.code === "PREVIEW_PACKAGE_FILE_LIMIT");
  assert.throws(() => preparePreviewPackage({ ...base, files: [{ path: "index.html", content: "x".repeat(MAX_UNPACKED_BYTES + 1) }] }), (error) => ["PREVIEW_PACKAGE_FILE_TOO_LARGE", "PREVIEW_PACKAGE_TOO_LARGE"].includes(error.code));
});

test("prepare stores one ZIP and returns metadata plus a five-minute signed URL only", async () => {
  const mock = installStorageMock();
  const response = await zipRoute.handler(event());
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, "ready");
  assert.equal(body.previewVersionId, IDS.version);
  assert.equal(body.fileCount, 40);
  assert.equal(body.expiresIn, 300);
  assert.match(body.signedUrl, /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/sign\/preview-zips\//);
  assert.equal(mock.uploads.length, 1);
  assert.equal(manualZip.extractZip(mock.uploads[0]).files.length, 40);
  assert(mock.calls.some((call) => call.method === "HEAD"));
  assert(mock.calls.some((call) => call.method === "POST" && call.url.includes("/storage/v1/object/preview-zips/")));
  assert(!Object.hasOwn(body, "files"));
  assert(!Object.hasOwn(body, "generated_package"));
  assert(!Object.hasOwn(body, "zip"));
  assert(!response.body.includes("UEsDB"));
  assert(Buffer.byteLength(response.body) < 6291556);
});

test("existing content hash is reused without another upload", async () => {
  const mock = installStorageMock({ existing: true });
  const response = await zipRoute.handler(event());
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.reused, true);
  assert.equal(body.zipBytes, 2468);
  assert.equal(mock.uploads.length, 0);
});

test("customer-owned manual ZIP without a Demo Journey remains downloadable", async () => {
  const mock = installStorageMock({ standalone: true });
  const response = await zipRoute.handler(event({ demoJourneyId: "" }));
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.previewVersionId, IDS.version);
  assert.equal(body.source, "manual_zip");
  assert.equal(mock.uploads.length, 1);
  assert(!mock.calls.some((call) => call.url.includes("/rest/v1/demo_journeys")));
});

test("a concurrent upload race reuses the one deterministic storage object", async () => {
  const mock = installStorageMock({ uploadStatus: 409 });
  const response = await zipRoute.handler(event());
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).reused, true);
  assert.equal(mock.uploads.length, 1);
});

test("a public Storage bucket is rejected before object access", async () => {
  const mock = installStorageMock({ bucketPublic: true });
  const response = await zipRoute.handler(event());
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 500);
  assert.equal(body.code, "PREVIEW_ZIP_BUCKET_NOT_PRIVATE");
  assert.equal(mock.uploads.length, 0);
  assert(!mock.calls.some((call) => call.method === "HEAD"));
});

test("source mismatch and cross-customer requests fail before storage", async () => {
  let mock = installStorageMock();
  let response = await zipRoute.handler(event({ source: "factory" }));
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).code, "PREVIEW_SOURCE_MISMATCH");
  assert.equal(mock.uploads.length, 0);

  mock = installStorageMock();
  response = await zipRoute.handler(event({ customerId: IDS.otherCustomer }));
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).code, "PREVIEW_SCOPE_MISMATCH");
  assert.equal(mock.uploads.length, 0);
});

test("sales_partner is not authorized for ZIP preparation", async () => {
  process.env.ADMIN_TOKEN = "";
  process.env.SUPABASE_ANON_KEY = "anon";
  global.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return jsonResponse({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "partner@example.test" });
    if (String(url).includes("/rest/v1/profiles")) return jsonResponse([{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", role: "sales_partner", status: "active" }]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const response = await zipRoute.handler({ ...event(), headers: { authorization: "Bearer session" } });
  assert.equal(response.statusCode, 401);
});
