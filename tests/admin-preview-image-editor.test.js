const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const { buildWebsitePackage } = require("../functions/_website-factory-core");
const { extractHeroContext } = require("../functions/_preview-editor-hero");
const { extractTextContext } = require("../functions/_preview-editor-text");
const { validateEditorManifest } = require("../functions/_preview-editor-manifest");
const { validatePackage } = require("../functions/_preview-editor-section-core");
const { extractImageContext, patchImagePackage, prepareImageEditorPackage, validateImagePatch } = require("../functions/_preview-editor-image");
const { IMAGE_MAX_BYTES, IMAGE_MAX_PIXELS } = require("../functions/_preview-editor-image-schema");
const { validateImageBytes, validateImageMetadata } = require("../functions/_relationship-image-validation");
const assetApi = require("../functions/admin-preview-image-assets");
const editorApi = require("../functions/admin-preview-editor");
const parentBridge = require("../public/admin/ui/website-factory-preview-editor.js");

const ROOT = path.join(__dirname, "..");
const IDS = {
  source: "11111111-1111-4111-8111-111111111111",
  other: "22222222-2222-4222-8222-222222222222",
  journey: "33333333-3333-4333-8333-333333333333",
  customer: "44444444-4444-4444-8444-444444444444",
  otherCustomer: "55555555-5555-4555-8555-555555555555",
  project: "66666666-6666-4666-8666-666666666666",
  website: "77777777-7777-4777-8777-777777777777",
  actor: "88888888-8888-4888-8888-888888888888",
  profile: "99999999-9999-4999-8999-999999999999",
  asset: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const IDEMPOTENCY_KEY = "image-edit-1234567890abcdef";

function factoryPackage(name = "Image Edit Test") {
  return buildWebsitePackage({ journey: { businessName: name, websiteUrl: "https://image-edit.example", email: "info@example.test", phone: "0612345678" }, briefing: "Branche: bouw\nDiensten: Advies, Uitvoering", version: 1 });
}

function sourceVersion(overrides = {}) {
  return {
    id: IDS.source, demo_journey_id: IDS.journey, build_job_id: IDS.other, customer_id: IDS.customer, project_id: IDS.project, website_id: IDS.website,
    version: 1, title: "Image Edit Test — Factory preview", preview_url: `/.netlify/functions/demo-preview?id=${IDS.journey}`, preview_token: "preview-token",
    generated_package: factoryPackage(), is_active: true, published_to_portal: true, published_at: "2026-07-16T08:00:00.000Z", status: "ready_for_review",
    metadata: { previewSource: "website_factory", publishedMarker: "keep-source" }, created_by: IDS.actor, created_at: "2026-07-16T07:00:00.000Z", ...overrides,
  };
}

function scope(overrides = {}) {
  return { previewVersionId: IDS.source, demoJourneyId: IDS.journey, customerId: IDS.customer, projectId: IDS.project, websiteId: IDS.website, ...overrides };
}

function event(method, payload = {}, requestId = "REQ-IMAGE-1") {
  return { httpMethod: method, headers: { authorization: "Bearer admin-session", "x-nf-request-id": requestId }, queryStringParameters: method === "GET" ? payload : {}, body: method === "POST" ? JSON.stringify(payload) : "" };
}

function pngBytes() { return fs.readFileSync(path.join(ROOT, "public/assets/demo-images/library/bouwbedrijf/hero.png")); }
function jpegBytes(width = 1280, height = 720) {
  const bytes = Buffer.alloc(23);
  bytes[0] = 0xff; bytes[1] = 0xd8;
  bytes[2] = 0xff; bytes[3] = 0xc0; bytes.writeUInt16BE(17, 4);
  bytes[6] = 8; bytes.writeUInt16BE(height, 7); bytes.writeUInt16BE(width, 9); bytes[11] = 3;
  bytes[21] = 0xff; bytes[22] = 0xd9;
  return bytes;
}
function webpBytes(width = 1280, height = 720, flags = 0) {
  const chunk = Buffer.alloc(18); chunk.write("VP8X", 0); chunk.writeUInt32LE(10, 4); chunk[8] = flags;
  writeUInt24LE(chunk, 12, width - 1); writeUInt24LE(chunk, 15, height - 1);
  const bytes = Buffer.alloc(12 + chunk.length); bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WEBP", 8); chunk.copy(bytes, 12); return bytes;
}
function writeUInt24LE(bytes, offset, value) { bytes[offset] = value & 255; bytes[offset + 1] = (value >> 8) & 255; bytes[offset + 2] = (value >> 16) & 255; }
function withPngDimensions(bytes, width, height) { const next = Buffer.from(bytes); next.writeUInt32BE(width, 16); next.writeUInt32BE(height, 20); return next; }
function animatedPng(bytes) { const typeIndex = bytes.lastIndexOf(Buffer.from("IEND")); const start = typeIndex - 4; const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8, 0); chunk.write("acTL", 4); chunk.writeUInt32BE(1, 8); chunk.writeUInt32BE(0, 12); return Buffer.concat([bytes.subarray(0, start), chunk, bytes.subarray(start)]); }
function exifJpeg(bytes) { const segment = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x08]), Buffer.from("Exif\0\0", "binary")]); return Buffer.concat([bytes.subarray(0, 2), segment, bytes.subarray(2)]); }

function selectedAsset() {
  const item = assetApi._private.resolveContentLibraryAsset("bouwbedrijf-hero");
  return { ...item, origin: "server_allowlist" };
}

test("mws.image.v1 is limited to the one reliable Hero image marker", async () => {
  for (const generatedPackage of [factoryPackage(), factoryPackage("VM Tegelwerken")]) {
    const manifest = validateEditorManifest(generatedPackage.meta.editorManifest);
    const hero = manifest.pages[0].sections.find((section) => section.id === "home.hero");
    assert.equal(hero.imageEditor.schema, "mws.image.v1");
    assert.equal(hero.imageEditor.assetSlotId, "home.hero.image");
    assert.deepEqual(hero.imageEditor.capabilities, ["write:image", "write:image-alt"]);
    assert.deepEqual(hero.imageEditor.allowedMimeTypes, ["image/jpeg", "image/png", "image/webp"]);
    assert.equal((await extractImageContext(generatedPackage)).image.assetSlotId, "home.hero.image");
    assert.equal(manifest.pages[0].sections.filter((section) => section.imageEditor).length, 1);
  }
});

test("missing or ambiguous image markers make only the imageslot read-only", async () => {
  for (const mutation of [
    (html) => html.replace('data-mws-field="image"', ""),
    (html) => html.replace('data-mws-field="image"', 'data-mws-field="image"><img data-mws-field="image" src="assets/duplicate.png" alt="Dubbel"'),
  ]) {
    const generated = factoryPackage();
    const entry = generated.files.find((file) => file.path === "index.html");
    entry.content = mutation(entry.content);
    const prepared = await prepareImageEditorPackage(generated);
    assert.equal(prepared.availability, "read_only");
    const heroManifest = prepared.generatedPackage.meta.editorManifest.pages[0].sections.find((section) => section.id === "home.hero");
    assert.equal(heroManifest.imageEditor, undefined);
    assert.ok(heroManifest.editor);
    assert.ok((await extractHeroContext(prepared.generatedPackage)).values.title);
  }
});

test("JPEG, PNG and WebP bytes expose bounded dimensions, hash and safe package extensions", () => {
  for (const [filename, mimeType, bytes] of [["hero.png", "image/png", pngBytes()], ["hero.jpg", "image/jpeg", jpegBytes()], ["hero.webp", "image/webp", webpBytes()]]) {
    const value = validateImageBytes(bytes, { filename, mimeType, declaredSize: bytes.length });
    assert.ok(value.width >= 960 && value.height >= 540);
    assert.ok(value.width * value.height <= IMAGE_MAX_PIXELS);
    assert.match(value.checksum, /^[a-f0-9]{64}$/);
    assert.ok(["png", "jpg", "webp"].includes(value.packageExtension));
  }
});

test("metadata rejects empty, oversized, unknown, SVG, GIF, AVIF and MIME-extension mismatches", () => {
  for (const input of [
    { filename: "empty.png", mimeType: "image/png", sizeBytes: 0 },
    { filename: "large.png", mimeType: "image/png", sizeBytes: IMAGE_MAX_BYTES + 1 },
    { filename: "hero.gif", mimeType: "image/gif", sizeBytes: 10 },
    { filename: "hero.svg", mimeType: "image/svg+xml", sizeBytes: 10 },
    { filename: "hero.avif", mimeType: "image/avif", sizeBytes: 10 },
    { filename: "hero.jpg", mimeType: "image/png", sizeBytes: 10 },
    { filename: "../hero.png", mimeType: "image/png", sizeBytes: 10 },
  ]) assert.throws(() => validateImageMetadata(input));
});

test("corrupt magic, corrupt raster structures, animation, extreme pixels, small dimensions and EXIF are rejected", () => {
  const png = pngBytes(); const jpeg = jpegBytes(); const webp = webpBytes();
  const cases = [
    [Buffer.from("not an image"), { filename: "hero.png", mimeType: "image/png" }, "IMAGE_MAGIC_INVALID"],
    [png.subarray(0, 40), { filename: "hero.png", mimeType: "image/png" }, "IMAGE_PNG_CORRUPT"],
    [jpeg.subarray(0, jpeg.length - 2), { filename: "hero.jpg", mimeType: "image/jpeg" }, "IMAGE_JPEG_CORRUPT"],
    [Buffer.concat([webp, Buffer.from([0])]), { filename: "hero.webp", mimeType: "image/webp" }, "IMAGE_WEBP_CORRUPT"],
    [animatedPng(png), { filename: "hero.png", mimeType: "image/png" }, "IMAGE_ANIMATION_UNSUPPORTED"],
    [webpBytes(1280, 720, 0x02), { filename: "hero.webp", mimeType: "image/webp" }, "IMAGE_ANIMATION_UNSUPPORTED"],
    [withPngDimensions(png, 10000, 10000), { filename: "hero.png", mimeType: "image/png" }, "IMAGE_PIXELS_EXCEEDED"],
    [withPngDimensions(png, 400, 200), { filename: "hero.png", mimeType: "image/png" }, "IMAGE_TOO_SMALL"],
    [exifJpeg(jpeg), { filename: "hero.jpg", mimeType: "image/jpeg" }, "IMAGE_EXIF_UNSUPPORTED"],
  ];
  for (const [bytes, metadata, code] of cases) assert.throws(() => validateImageBytes(bytes, { ...metadata, declaredSize: bytes.length }), { code });
});

test("Image patch schema enforces slot, alt limit, control characters and no extra fields", () => {
  assert.deepEqual(validateImagePatch({ assetSlotId: "home.hero.image", sourceAssetId: IDS.asset, sourceType: "upload", alt: "Veilige Hero" }).alt, "Veilige Hero");
  assert.throws(() => validateImagePatch({ assetSlotId: "home.other", alt: "X" }), { code: "IMAGE_CAPABILITY_MISMATCH" });
  assert.throws(() => validateImagePatch({ assetSlotId: "home.hero.image", alt: "" }), { code: "IMAGE_ALT_REQUIRED" });
  assert.throws(() => validateImagePatch({ assetSlotId: "home.hero.image", alt: "x".repeat(181) }), { code: "IMAGE_ALT_TOO_LONG" });
  assert.throws(() => validateImagePatch({ assetSlotId: "home.hero.image", alt: "fout\u0000" }), { code: "IMAGE_ALT_INVALID" });
  assert.throws(() => validateImagePatch({ assetSlotId: "home.hero.image", alt: "goed", html: "<img>" }), { code: "IMAGE_CAPABILITY_MISMATCH" });
});

test("patch copies one deterministic asset and mutates only Hero src and alt in a new package", async () => {
  const source = factoryPackage();
  const original = structuredClone(source);
  const image = await extractImageContext(source);
  const heroBefore = await extractHeroContext(source);
  const textBefore = await extractTextContext(source);
  const asset = selectedAsset();
  const result = await patchImagePackage(source, { assetSlotId: "home.hero.image", sourceAssetId: asset.id, sourceType: asset.sourceType, alt: "Nieuwe veilige Hero" }, image.contentHash, asset);
  assert.deepEqual(source, original);
  assert.equal(result.image.alt, "Nieuwe veilige Hero");
  assert.match(result.image.src, /^assets\/editor\/[a-f0-9]{64}\.png$/);
  assert.equal(result.generatedPackage.files.filter((file) => file.path === result.image.src).length, 1);
  assert.equal(result.generatedPackage.files.find((file) => file.path === result.image.src).encoding, "base64");
  assert.doesNotMatch(JSON.stringify(result.generatedPackage), /signed|token=/i);
  assert.deepEqual((await extractHeroContext(result.generatedPackage)).values, heroBefore.values);
  assert.deepEqual((await extractTextContext(result.generatedPackage)).values, textBefore.values);
  const changed = result.generatedPackage.files.filter((file, index) => JSON.stringify(file) !== JSON.stringify(source.files[index])).map((file) => file.path);
  assert.deepEqual(changed, ["index.html", result.image.src]);
});

test("same content hash reuses the package asset and package limit remains enforced", async () => {
  const source = factoryPackage(); const asset = selectedAsset(); const firstContext = await extractImageContext(source);
  const first = await patchImagePackage(source, { assetSlotId: "home.hero.image", sourceAssetId: asset.id, sourceType: asset.sourceType, alt: "Eerste alt" }, firstContext.contentHash, asset);
  const secondContext = await extractImageContext(first.generatedPackage);
  const second = await patchImagePackage(first.generatedPackage, { assetSlotId: "home.hero.image", sourceAssetId: asset.id, sourceType: asset.sourceType, alt: "Tweede alt" }, secondContext.contentHash, asset);
  assert.equal(second.asset.reusedPackageAsset, true);
  assert.equal(second.generatedPackage.files.filter((file) => file.path === second.image.src).length, 1);
  const nearLimit = factoryPackage();
  const context = validatePackage(nearLimit);
  const reserve = asset.bytes.length - 1024;
  nearLimit.files.push({ path: "assets/filler.bin", encoding: "base64", content: Buffer.alloc(18 * 1024 * 1024 - context.totalBytes - reserve).toString("base64") });
  const nearContext = await extractImageContext(nearLimit);
  await assert.rejects(() => patchImagePackage(nearLimit, { assetSlotId: "home.hero.image", sourceAssetId: asset.id, sourceType: asset.sourceType, alt: "Te groot" }, nearContext.contentHash, asset), { code: "PREVIEW_PACKAGE_INVALID" });
});

test("Brand Center and website sources require server metadata, status and rights", () => {
  const base = { status: "approved", usage_rights_confirmed: true, mime_type: "image/png", metadata: { usedInBranding: true, brandingRole: "hero" } };
  assert.doesNotThrow(() => assetApi._private.assertEligibleRelationshipAsset(base, "brand_center"));
  assert.throws(() => assetApi._private.assertEligibleRelationshipAsset({ ...base, status: "rejected" }, "brand_center"), { code: "IMAGE_ASSET_STATUS_INVALID" });
  assert.throws(() => assetApi._private.assertEligibleRelationshipAsset({ ...base, status: "archived" }, "brand_center"), { code: "IMAGE_ASSET_STATUS_INVALID" });
  assert.throws(() => assetApi._private.assertEligibleRelationshipAsset({ ...base, usage_rights_confirmed: false }, "brand_center"), { code: "IMAGE_RIGHTS_REQUIRED" });
  assert.throws(() => assetApi._private.assertEligibleRelationshipAsset({ ...base, metadata: {} }, "brand_center"), { code: "IMAGE_SOURCE_INVALID" });
  assert.doesNotThrow(() => assetApi._private.assertEligibleRelationshipAsset({ ...base, metadata: { usedForWebsite: true } }, "website_asset"));
});

test("Content Library is a server allowlist with metadata and arbitrary paths are rejected", () => {
  const catalog = assetApi._private.listContentLibraryAssets();
  assert.ok(catalog.length >= 20);
  assert.ok(catalog.every((item) => item.sourceType === "content_library" && item.width >= 960 && item.height >= 540));
  assert.throws(() => assetApi._private.resolveContentLibraryAsset("../../etc/passwd"), { code: "CONTENT_LIBRARY_ASSET_INVALID" });
  assert.match(fs.readFileSync(path.join(ROOT, "public/admin/ui/website-factory-preview-editor.js"), "utf8"), /AI-afbeeldingen zijn nog niet geconfigureerd\./);
});

test("temporary image preview is Blob-only, resettable and revokes local URLs without database writes", () => {
  const source = fs.readFileSync(path.join(ROOT, "public/admin/ui/website-factory-preview-editor.js"), "utf8");
  const runtime = fs.readFileSync(path.join(ROOT, "functions/_preview-editor-runtime.js"), "utf8");
  assert.match(source, /URL\.createObjectURL\(blob\)/);
  assert.match(source, /URL\?\.revokeObjectURL/);
  assert.match(source, /postToPreview\("APPLY_IMAGE_PATCH"/);
  assert.match(source, /postToPreview\("RESET_IMAGE_PATCH"/);
  assert.doesNotMatch(source, /APPLY_IMAGE_PATCH[\s\S]{0,240}editorRequest/);
  assert.match(runtime, /url\.protocol === "blob:"/);
  assert.match(runtime, /url\.href\.startsWith\(`blob:\$\{config\.origin\}\//);
  assert.doesNotMatch(runtime, /postMessage\([^,]+,\s*["']\*["']/);
  assert.match(source, /\["upload", "Uploaden", false\]/);
  assert.match(source, /\["brandCenter", "Brand Center", false\]/);
  assert.match(source, /\["contentLibrary", "Content Library", false\]/);
  assert.match(source, /\["currentWebsite", "Huidige website"/);
  assert.match(source, /\["ai", "AI genereren", true\]/);
  assert.match(source, /factory-image-ratio-warning/);
  assert.match(source, /image\/jpeg,image\/png,image\/webp/);
  assert.match(source, /dragover/);
  assert.match(source, /usageRightsConfirmed: true/);
});

test("asset upload prepare/finalize validates stored bytes and returns metadata without bytes", async () => {
  const api = memoryApi({ includeAsset: false });
  await withApi(api, async () => {
    const preparedResponse = await assetApi.handler(event("POST", { action: "prepare_upload", ...scope(), filename: "nieuwe-hero.png", mimeType: "image/png", sizeBytes: api.bytes.length, usageRightsConfirmed: true }));
    const prepared = JSON.parse(preparedResponse.body);
    assert.equal(preparedResponse.statusCode, 200);
    assert.match(prepared.uploadUrl, /storage\/v1\/object\/upload\/sign\/relationship-assets/);
    const finalizedResponse = await assetApi.handler(event("POST", { action: "finalize_upload", ...scope(), uploadId: prepared.uploadId }));
    const finalized = JSON.parse(finalizedResponse.body);
    assert.equal(finalizedResponse.statusCode, 201);
    assert.equal(finalized.asset.width, 1280);
    assert.equal(finalized.asset.height, 720);
    assert.equal(finalized.asset.bytes, undefined);
    assert.equal(api.tables.files.length, 1);
    assert.equal(api.tables.files[0].customer_id, IDS.customer);
    assert.equal(api.tables.files[0].usage_rights_confirmed, true);
  });
});

test("image save creates one immutable internal version with lineage and preserves publication", async () => {
  const api = memoryApi({ includeAsset: true });
  const original = structuredClone(api.tables.website_preview_versions[0]);
  const image = await extractImageContext(original.generated_package);
  const payload = { action: "save_image_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: image.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { assetSlotId: "home.hero.image", sourceAssetId: IDS.asset, sourceType: "upload", alt: "Klant op locatie" } };
  await withApi(api, async () => {
    const firstResponse = await editorApi.handler(event("POST", payload));
    const first = JSON.parse(firstResponse.body);
    assert.equal(firstResponse.statusCode, 201);
    assert.equal(api.tables.website_preview_versions.length, 2);
    const created = api.tables.website_preview_versions.find((row) => row.id === first.previewVersion.id);
    assert.equal(created.status, "internal");
    assert.equal(created.published_to_portal, false);
    assert.equal(created.metadata.parentPreviewVersionId, IDS.source);
    assert.equal(created.metadata.editedField, "image");
    assert.equal(created.metadata.assetSlotId, "home.hero.image");
    assert.equal(created.metadata.sourceAssetId, IDS.asset);
    assert.equal(created.metadata.sourceAssetHash, api.asset.checksum);
    assert.equal(created.metadata.editorSchemaVersion, "mws.image.v1");
    assert.deepEqual(api.tables.website_preview_versions.find((row) => row.id === IDS.source).generated_package, original.generated_package);
    assert.equal(api.tables.website_preview_versions.find((row) => row.id === IDS.source).published_to_portal, true);
    assert.equal(api.tables.customers[0].metadata.publishedPreviewVersionId, IDS.source);
    const retry = await editorApi.handler(event("POST", payload, "REQ-RETRY"));
    assert.equal(retry.statusCode, 200);
    assert.equal(JSON.parse(retry.body).reused, true);
    assert.equal(api.tables.website_preview_versions.length, 2);
  });
});

test("cross-customer preview, cross-customer asset, inactive asset, stale hash and stale active source are rejected", async () => {
  const crossPreview = memoryApi({ includeAsset: true });
  await withApi(crossPreview, async () => {
    const response = await assetApi.handler(event("GET", scope({ customerId: IDS.otherCustomer })));
    assert.equal(response.statusCode, 409);
  });
  const crossAsset = memoryApi({ includeAsset: true, assetCustomerId: IDS.otherCustomer });
  await withApi(crossAsset, async () => {
    const image = await extractImageContext(crossAsset.tables.website_preview_versions[0].generated_package);
    const response = await editorApi.handler(event("POST", { action: "save_image_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: image.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { assetSlotId: "home.hero.image", sourceAssetId: IDS.asset, sourceType: "upload", alt: "Geen toegang" } }));
    assert.equal(response.statusCode, 404);
  });
  const inactive = memoryApi({ includeAsset: true, assetStatus: "rejected" });
  await withApi(inactive, async () => {
    const image = await extractImageContext(inactive.tables.website_preview_versions[0].generated_package);
    const response = await editorApi.handler(event("POST", { action: "save_image_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: image.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { assetSlotId: "home.hero.image", sourceAssetId: IDS.asset, sourceType: "upload", alt: "Afgekeurd" } }));
    assert.equal(response.statusCode, 409);
  });
  const staleHash = memoryApi({ includeAsset: true });
  await withApi(staleHash, async () => {
    const response = await editorApi.handler(event("POST", { action: "save_image_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: "f".repeat(64), idempotencyKey: IDEMPOTENCY_KEY, patch: { assetSlotId: "home.hero.image", sourceAssetId: IDS.asset, sourceType: "upload", alt: "Conflict" } }));
    assert.equal(response.statusCode, 409); assert.equal(JSON.parse(response.body).code, "EDIT_CONFLICT");
  });
  const staleActive = memoryApi({ includeAsset: true }); staleActive.tables.website_preview_versions[0].is_active = false; staleActive.tables.website_preview_versions.push(sourceVersion({ id: IDS.other, version: 2, is_active: true, published_to_portal: false }));
  await withApi(staleActive, async () => {
    const image = await extractImageContext(staleActive.tables.website_preview_versions[0].generated_package);
    const response = await editorApi.handler(event("POST", { action: "save_image_preview", ...scope(), sectionId: "home.hero", sectionType: "hero", baseContentHash: image.contentHash, idempotencyKey: IDEMPOTENCY_KEY, patch: { assetSlotId: "home.hero.image", sourceAssetId: IDS.asset, sourceType: "upload", alt: "Stale" } }));
    assert.equal(response.statusCode, 409); assert.equal(JSON.parse(response.body).code, "EDIT_CONFLICT");
  });
});

test("sales_partner, legacy previews and ZIP previews remain read-only", async () => {
  const denied = memoryApi({ includeAsset: true, role: "sales_partner" });
  await withApi(denied, async () => assert.equal((await assetApi.handler(event("GET", scope()))).statusCode, 401));
  for (const metadata of [{ previewSource: "legacy" }, { previewSource: "manual_zip" }]) {
    const api = memoryApi({ includeAsset: true, source: sourceVersion({ metadata }) });
    await withApi(api, async () => {
      const response = await assetApi.handler(event("GET", scope()));
      assert.equal(response.statusCode, 409);
      assert.equal(JSON.parse(response.body).code, "SECTION_WRITE_UNAVAILABLE");
    });
  }
});

function memoryApi(options = {}) {
  const bytes = pngBytes();
  const metadata = validateImageBytes(bytes, { filename: "klant-hero.png", mimeType: "image/png", declaredSize: bytes.length });
  const asset = {
    id: IDS.asset, customer_id: options.assetCustomerId || IDS.customer, lead_id: null, original_filename: "klant-hero.png", name: "klant-hero.png", storage_path: `${options.assetCustomerId || IDS.customer}/${IDS.asset}/klant-hero.png`,
    mime_type: "image/png", size_bytes: bytes.length, checksum: metadata.checksum, status: options.assetStatus || "approved", usage_rights_confirmed: options.usageRights !== false,
    metadata: { width: metadata.width, height: metadata.height, aspectRatio: metadata.aspectRatio, usedInBranding: true, usedForWebsite: true }, source_module: "website_factory", created_at: "2026-07-16T08:00:00.000Z",
  };
  const tables = {
    website_preview_versions: [structuredClone(options.source || sourceVersion())],
    demo_journeys: [{ id: IDS.journey, customer_id: IDS.customer, project_id: IDS.project, website_id: IDS.website, created_by: IDS.actor }],
    customers: [{ id: IDS.customer, metadata: { publishedPreviewVersionId: IDS.source } }],
    projects: [{ id: IDS.project, customer_id: IDS.customer, website_id: IDS.website }],
    websites: [{ id: IDS.website, customer_id: IDS.customer }],
    files: options.includeAsset === false ? [] : [structuredClone(asset)],
  };
  const writes = [];
  const role = options.role || "admin";
  const fetch = async (input, request = {}) => {
    const url = new URL(String(input)); const method = request.method || "GET";
    if (url.pathname.endsWith("/auth/v1/user")) return response(200, { id: IDS.actor, email: "admin@example.test" });
    if (url.pathname.endsWith("/rest/v1/profiles")) return response(200, [{ id: IDS.profile, auth_user_id: IDS.actor, role, status: "active" }]);
    if (url.pathname.includes("/storage/v1/object/upload/sign/")) return response(200, { url: `${url.pathname.replace("/storage/v1", "")}?token=signed-upload` });
    if (url.pathname.includes(`/storage/v1/object/relationship-assets/`)) return binaryResponse(200, bytes, "image/png");
    if (url.pathname === "/storage/v1/object/relationship-assets" && method === "DELETE") return response(200, []);
    const table = url.pathname.split("/").pop();
    if (!tables[table]) return response(404, { code: "TABLE_NOT_FOUND" });
    if (method === "GET") {
      let rows = tables[table].filter((row) => matches(row, url.searchParams));
      if (url.searchParams.get("order")?.startsWith("version.desc")) rows.sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
      return response(200, rows.slice(0, Number(url.searchParams.get("limit") || rows.length)));
    }
    const body = JSON.parse(request.body || "{}");
    if (method === "POST") {
      if (tables[table].some((row) => row.id === body.id || (row.demo_journey_id && row.demo_journey_id === body.demo_journey_id && Number(row.version) === Number(body.version)))) return response(409, { code: "23505", message: "duplicate key" });
      tables[table].push(structuredClone(body)); writes.push({ method, table, body: structuredClone(body) }); return response(201, [structuredClone(body)]);
    }
    if (method === "PATCH") { const rows = tables[table].filter((row) => matches(row, url.searchParams)); rows.forEach((row) => Object.assign(row, structuredClone(body))); writes.push({ method, table, body: structuredClone(body), count: rows.length }); return response(200, rows.map((row) => structuredClone(row))); }
    return response(405, {});
  };
  return { asset, bytes, fetch, tables, writes };
}

function matches(row, params) {
  for (const [key, raw] of params.entries()) {
    if (["select", "limit", "order"].includes(key) || raw.startsWith("in.")) continue;
    const [op, ...parts] = raw.split("."); const value = decodeURIComponent(parts.join("."));
    if (op === "eq" && String(row[key] ?? "") !== value) return false;
    if (op === "neq" && String(row[key] ?? "") === value) return false;
  }
  return true;
}

function response(status, body) { return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => structuredClone(body), arrayBuffer: async () => Buffer.alloc(0) }; }
function binaryResponse(status, bytes, mime) { return { ok: true, status, headers: { get: (name) => name.toLowerCase() === "content-length" ? String(bytes.length) : name.toLowerCase() === "content-type" ? mime : null }, json: async () => ({}), arrayBuffer: async () => bytes }; }
async function withApi(api, callback) {
  const previousFetch = global.fetch;
  const previous = Object.fromEntries(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "RELATIONSHIP_ASSET_UPLOAD_SECRET"].map((key) => [key, process.env[key]]));
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role"; process.env.SUPABASE_ANON_KEY = "anon-key"; process.env.RELATIONSHIP_ASSET_UPLOAD_SECRET = "upload-secret";
  global.fetch = api.fetch;
  try { return await callback(); } finally { global.fetch = previousFetch; Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value); }
}
