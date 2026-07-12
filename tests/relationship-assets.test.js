const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const functionModule = require("../functions/client-relationship-assets");
const api = functionModule._test;
const adminApi = require("../functions/admin-relationship-assets")._test;
const portal = fs.readFileSync(path.join(root, "public/klantportaal.html"), "utf8");
const client = fs.readFileSync(path.join(root, "public/admin/ui/client-asset-upload.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260712123000_relationship_asset_library.sql"), "utf8");
const workspaceClient = fs.readFileSync(path.join(root, "public/admin/ui/relationship-workspace.js"), "utf8");
const realPng = fs.readFileSync(path.join(root, "public/max-webstudio-logo-mollie-512.png"));
const realJpeg = fs.readFileSync(path.join(root, "public/assets/demo-images/demo-hero-horeca.jpg"));

function metadata(overrides = {}) {
  return {
    name: "FuelGo logo.png",
    mimeType: "image/png",
    size: realPng.length,
    category: "logo",
    description: "Logo voor de website",
    usageRightsConfirmed: true,
    ...overrides,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function event(method, body) {
  return {
    httpMethod: method,
    headers: { authorization: "Bearer customer-token" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function parse(result) {
  return JSON.parse(result.body);
}

function installEnvironment() {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.SUPABASE_ANON_KEY = "anon-test-key";
}

test("server validates extensions, MIME types, content signatures and the 8 MB limit", () => {
  assert.equal(api.ALLOWED.has("image/png"), true);
  assert.equal(api.MAX_BYTES, 8 * 1024 * 1024);
  assert.equal(api.extensionMatches("FuelGo logo.png", "image/png"), true);
  assert.equal(api.extensionMatches("portrait.jpeg", "image/jpeg"), true);
  assert.equal(api.extensionMatches("document.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), true);
  assert.equal(api.extensionMatches("logo.exe", "image/png"), false);

  assert.equal(api.signatureMatches(realPng, "image/png"), true);
  assert.equal(api.signatureMatches(realJpeg, "image/jpeg"), true);
  assert.equal(api.signatureMatches(Buffer.from("RIFF0000WEBPdata"), "image/webp"), true);
  assert.equal(api.signatureMatches(Buffer.from("%PDF-1.7\n"), "application/pdf"), true);
  assert.equal(api.signatureMatches(Buffer.from("Toegestaan tekstbestand"), "text/plain"), true);
  assert.equal(
    api.signatureMatches(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "application/msword"),
    true
  );
  assert.equal(
    api.signatureMatches(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    true
  );
  assert.equal(api.signatureMatches(Buffer.from("MZ executable"), "text/plain"), false);

  assert.equal(api.validateMetadata(metadata()).name, "FuelGo logo.png");
  assert.equal(api.validateMetadata(metadata({ name: "foto.jpg", mimeType: "image/jpeg", size: realJpeg.length })).mimeType, "image/jpeg");
  assert.equal(api.validateMetadata(metadata({ name: "foto.jpeg", mimeType: "image/jpg", size: realJpeg.length })).mimeType, "image/jpeg");
  assert.equal(api.validateMetadata(metadata({ name: "uitleg.txt", mimeType: "text/plain", size: 20 })).mimeType, "text/plain");
  assert.equal(api.validateMetadata(metadata({ name: "brief.docx", mimeType: "application/octet-stream", size: 20 })).mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.doesNotThrow(() => api.validateFileBytes(
    realJpeg,
    api.validateMetadata(metadata({ name: "project foto.jpg", mimeType: "image/jpeg", size: realJpeg.length }))
  ));
  const textDocument = Buffer.from("Toegestaan projectdocument");
  assert.doesNotThrow(() => api.validateFileBytes(
    textDocument,
    api.validateMetadata(metadata({ name: "project uitleg.txt", mimeType: "text/plain", size: textDocument.length }))
  ));
  assert.throws(() => api.validateMetadata(metadata({ name: "logo.exe" })), /bestandstype/);
  assert.throws(() => api.validateMetadata(metadata({ name: "logo.jpg", mimeType: "image/png" })), /bestandstype|bestandsnaam/);
  assert.throws(() => api.validateMetadata(metadata({ size: api.MAX_BYTES + 1 })), /maximaal 8 MB/);
  assert.throws(() => api.validateMetadata(metadata({ usageRightsConfirmed: false })), /Bevestig/);
  assert.throws(
    () => api.validateFileBytes(Buffer.from("not a png"), api.validateMetadata(metadata({ size: 9 }))),
    /bestandstype/
  );
});

test("a real PNG with spaces keeps its original name and receives a tenant-safe path", () => {
  const uploadId = "11111111-1111-4111-8111-111111111111";
  assert.equal(api.safeFilename("FuelGo logo.png"), "FuelGo-logo.png");
  assert.equal(api.shouldDeleteDuplicateObject(uploadId, { id: uploadId }), false);
  assert.equal(api.shouldDeleteDuplicateObject(uploadId, { id: "22222222-2222-4222-8222-222222222222" }), true);
  assert.equal(
    api.storagePathFor("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", uploadId, "FuelGo logo.png"),
    `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${uploadId}/FuelGo-logo.png`
  );
  assert.equal(api.signatureMatches(realPng, "image/png"), true);
});

test("invalid and oversized files are rejected before a storage URL is created", async (context) => {
  installEnvironment();
  const originalFetch = global.fetch;
  const customerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let signedUploadCalls = 0;

  global.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return json({ id: userId });
    if (target.includes("/rest/v1/customers?")) return json([{ id: customerId, auth_user_id: userId }]);
    if (target.includes("/storage/v1/object/upload/sign/")) {
      signedUploadCalls += 1;
      return json({ url: "/object/upload/sign/relationship-assets/test?token=test" });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  context.after(() => {
    global.fetch = originalFetch;
  });

  const invalid = await functionModule.handler(event("POST", { action: "prepare", ...metadata({ name: "malware.exe" }) }));
  const oversized = await functionModule.handler(event("POST", { action: "prepare", ...metadata({ size: api.MAX_BYTES + 1 }) }));
  assert.equal(invalid.statusCode, 400);
  assert.equal(parse(invalid).code, "INVALID_FILE");
  assert.equal(oversized.statusCode, 413);
  assert.equal(parse(oversized).code, "FILE_TOO_LARGE");
  assert.equal(signedUploadCalls, 0);
});

test("prepare and complete move real PNG bytes through private storage into files", async (context) => {
  installEnvironment();
  const originalFetch = global.fetch;
  const customerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let insertedRecord = null;
  let signedPath = "";
  let downloadedPath = "";
  let timelineWrites = 0;
  let cleanupDeletes = 0;

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return json({ id: userId });
    if (target.includes("/rest/v1/customers?") && target.includes(`auth_user_id=eq.${userId}`)) {
      return json([{ id: customerId, auth_user_id: userId }]);
    }
    if (target.includes("/storage/v1/object/upload/sign/relationship-assets/")) {
      signedPath = target;
      const relative = new URL(target).pathname.replace("/storage/v1", "");
      return json({ url: `${relative}?token=signed-upload-token` });
    }
    if (target.includes("/storage/v1/object/relationship-assets/") && options.method === "GET") {
      downloadedPath = target;
      return new Response(realPng, { status: 200, headers: { "Content-Length": String(realPng.length) } });
    }
    if (target.includes("/rest/v1/files?") && target.includes("&id=eq.")) {
      return json(insertedRecord ? [insertedRecord] : []);
    }
    if (target.includes("/rest/v1/files?") && target.includes("checksum=eq.")) return json([]);
    if (target.includes("/rest/v1/files?") && target.includes("is_client_visible=eq.true")) {
      return json(insertedRecord ? [insertedRecord] : []);
    }
    if (target.includes("/rest/v1/asset_requests?")) return json([]);
    if (target.endsWith("/rest/v1/files") && options.method === "POST") {
      insertedRecord = JSON.parse(options.body);
      return json([{ ...insertedRecord, created_at: "2026-07-12T12:00:00.000Z" }], 201);
    }
    if (target.endsWith("/rest/v1/customer_timeline_events")) {
      timelineWrites += 1;
      return json([], 201);
    }
    if (target.endsWith("/storage/v1/object/relationship-assets") && options.method === "DELETE") {
      cleanupDeletes += 1;
      return json([]);
    }
    throw new Error(`Unexpected fetch: ${options.method || "GET"} ${target}`);
  };
  context.after(() => {
    global.fetch = originalFetch;
  });

  const preparedResult = await functionModule.handler(event("POST", { action: "prepare", ...metadata() }));
  const prepared = parse(preparedResult);
  assert.equal(preparedResult.statusCode, 200);
  assert.equal(prepared.success, true);
  assert.match(prepared.upload.id, /^[0-9a-f-]{36}$/);
  assert.match(prepared.upload.url, /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/upload\/sign\/relationship-assets\//);
  assert.match(signedPath, /FuelGo-logo\.png$/);

  const completedResult = await functionModule.handler(event("POST", {
    action: "complete",
    uploadId: prepared.upload.id,
    ...metadata(),
  }));
  const completed = parse(completedResult);
  assert.equal(completedResult.statusCode, 201);
  assert.equal(completed.success, true);
  assert.equal(completed.duplicate, false);
  assert.equal(completed.asset.name, "FuelGo logo.png");
  assert.equal(completed.asset.sizeBytes, realPng.length);
  assert.equal(completed.asset.source, "customer");
  assert.equal(completed.asset.storagePath, undefined);
  assert.equal(insertedRecord.customer_id, customerId);
  assert.equal(insertedRecord.original_filename, "FuelGo logo.png");
  assert.equal(insertedRecord.mime_type, "image/png");
  assert.equal(insertedRecord.size_bytes, realPng.length);
  assert.match(insertedRecord.storage_path, new RegExp(`^${customerId}/${prepared.upload.id}/FuelGo-logo\\.png$`));
  assert.equal(downloadedPath.includes(insertedRecord.storage_path), true);
  assert.equal(timelineWrites, 1);

  const cancelCompleted = await functionModule.handler(event("POST", {
    action: "cancel",
    uploadId: prepared.upload.id,
    ...metadata(),
  }));
  assert.equal(cancelCompleted.statusCode, 409);
  assert.equal(cleanupDeletes, 0);

  const refreshedResult = await functionModule.handler(event("GET"));
  const refreshed = parse(refreshedResult);
  assert.equal(refreshedResult.statusCode, 200);
  assert.deepEqual(refreshed.assets.map((asset) => asset.name), ["FuelGo logo.png"]);
  assert.equal(JSON.stringify(refreshed).includes("storage_path"), false);
});

test("a lost insert response and failed reconciliation never delete a possibly committed object", async (context) => {
  installEnvironment();
  const originalFetch = global.fetch;
  const customerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const uploadId = "11111111-1111-4111-8111-111111111111";
  let checksumLookups = 0;
  let cleanupDeletes = 0;

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return json({ id: userId });
    if (target.includes("/rest/v1/customers?")) return json([{ id: customerId, auth_user_id: userId }]);
    if (target.includes("/rest/v1/files?") && target.includes("&id=eq.")) return json([]);
    if (target.includes("/storage/v1/object/relationship-assets/") && options.method === "GET") {
      return new Response(realPng, { status: 200, headers: { "Content-Length": String(realPng.length) } });
    }
    if (target.includes("/rest/v1/files?") && target.includes("checksum=eq.")) {
      checksumLookups += 1;
      if (checksumLookups === 1) return json([]);
      throw new TypeError("reconciliation connection lost");
    }
    if (target.endsWith("/rest/v1/files") && options.method === "POST") {
      throw new TypeError("insert response lost after commit");
    }
    if (target.endsWith("/storage/v1/object/relationship-assets") && options.method === "DELETE") {
      cleanupDeletes += 1;
      return json([]);
    }
    throw new Error(`Unexpected fetch: ${options.method || "GET"} ${target}`);
  };
  context.after(() => {
    global.fetch = originalFetch;
  });

  const result = await functionModule.handler(event("POST", {
    action: "complete",
    uploadId,
    ...metadata(),
  }));
  const payload = parse(result);
  assert.equal(result.statusCode, 500);
  assert.equal(payload.error, "Bestanden konden niet veilig worden verwerkt.");
  assert.equal(checksumLookups, 2);
  assert.equal(cleanupDeletes, 0);
});

test("GET filters unexpected cross-customer rows and never exposes storage paths", async (context) => {
  installEnvironment();
  const originalFetch = global.fetch;
  const customerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const customerB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const userB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  let filesQuery = "";

  global.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return json({ id: userB });
    if (target.includes("/rest/v1/customers?")) return json([{ id: customerB, auth_user_id: userB }]);
    if (target.includes("/rest/v1/files?")) {
      filesQuery = target;
      return json([
        { id: "asset-a", customer_id: customerA, name: "A geheim.png", storage_path: `${customerA}/secret.png`, mime_type: "image/png", size_bytes: 10 },
        { id: "asset-b", customer_id: customerB, name: "B logo.png", storage_path: `${customerB}/logo.png`, mime_type: "image/png", size_bytes: 20 },
      ]);
    }
    if (target.includes("/rest/v1/asset_requests?")) return json([]);
    throw new Error(`Unexpected fetch: ${target}`);
  };
  context.after(() => {
    global.fetch = originalFetch;
  });

  const result = await functionModule.handler(event("GET"));
  const payload = parse(result);
  assert.equal(result.statusCode, 200);
  assert.match(filesQuery, new RegExp(`customer_id=eq\\.${customerB}`));
  assert.deepEqual(payload.assets.map((asset) => asset.id), ["asset-b"]);
  assert.equal(JSON.stringify(payload).includes("A geheim"), false);
  assert.equal(JSON.stringify(payload).includes("storage_path"), false);
  assert.equal(JSON.stringify(payload).includes("secret.png"), false);
});

test("migration keeps the bucket private and database reads protected by customer ownership", () => {
  assert.match(migration, /files_one_relationship_check/);
  assert.match(migration, /files_customer_checksum_unique/);
  assert.match(migration, /relationship-assets','relationship-assets',false/);
  assert.match(migration, /owns_customer\(customer_id\)/);
});

test("portal uses binary FormData, retains File objects and renders premium controls", () => {
  assert.match(portal, /id="relationship-asset-files" type="file"[^>]*multiple/);
  assert.match(portal, /id="relationship-asset-dropzone"/);
  assert.match(portal, /id="relationship-asset-selection"/);
  assert.match(portal, /id="relationship-asset-submit"/);
  assert.match(portal, /usageRightsConfirmed/);
  assert.match(client, /new FormData\(\)/);
  assert.match(client, /body\.append\("", binaryFile, file\.name\)/);
  assert.match(client, /let selectedFiles = \[\]/);
  assert.match(client, /if \(uploading\) return/);
  assert.match(client, /submitButton\.disabled = value/);
  assert.match(client, /relationship-assets:loaded/);
  assert.doesNotMatch(client, /FileReader|readAsDataURL|base64\s*\(/);
  assert.match(styles, /\.portal-asset-dropzone/);
  assert.match(styles, /\.portal-asset-consent input:checked/);
  assert.match(styles, /@media \(max-width: 720px\)/);
});

test("admin review supports approval, rejection, archive and primary logo without leaking paths", () => {
  assert.equal(adminApi.ACTIONS.primary, "approved");
  assert.equal(adminApi.safe({ id: "a", storage_path: "secret" }).storage_path, undefined);
  assert.match(workspaceClient, /data-asset-action="approve"/);
  assert.match(workspaceClient, /admin-relationship-assets/);
});
