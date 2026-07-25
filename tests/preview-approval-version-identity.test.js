const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const rendererSource = fs.readFileSync(path.join(root, "functions/client-preview-render.js"), "utf8");
const portalPreviewSource = fs.readFileSync(path.join(root, "public/preview.html"), "utf8");
const { _private } = require("../functions/client-preview-render");

const version = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  package_checksum: "b".repeat(64),
  created_at: "2026-07-25T00:00:00.000Z",
};

test("preview query selects package_checksum", () => {
  assert.ok(_private.previewVersionFields.split(",").includes("package_checksum"));
});

test("preview query selects created_at", () => {
  assert.ok(_private.previewVersionFields.split(",").includes("created_at"));
});

test("preview response identity contains the server checksum", () => {
  assert.equal(_private.previewIdentity(version).checksum, version.package_checksum);
});

test("preview response identity contains createdAt", () => {
  assert.equal(_private.previewIdentity(version).createdAt, version.created_at);
});

test("a valid server-resolved version identity is approval-ready", () => {
  assert.deepEqual(_private.previewIdentity(version), {
    id: version.id,
    checksum: version.package_checksum,
    createdAt: version.created_at,
  });
});

test("a preview without a checksum fails closed", () => {
  assert.throws(
    () => _private.previewIdentity({ ...version, package_checksum: "" }),
    (error) => error.status === 409 && /versie-identiteit/.test(error.message),
  );
});

test("the render query remains scoped to the authenticated customer", () => {
  assert.match(rendererSource, /`customer_id=eq\.\$\{encodeURIComponent\(customer\.id\)\}`/);
  assert.match(rendererSource, /published_to_portal=eq\.true/);
});

test("Factory previews retain version identity through the shared renderer", () => {
  const html = _private.renderPackageHtml({ files: [{ path: "index.html", content: "<h1>Factory</h1>" }] });
  assert.match(html, /Factory/);
  assert.equal(_private.previewIdentity(version).id, version.id);
});

test("ZIP previews retain version identity through the shared renderer", () => {
  const html = _private.renderPackageHtml({ files: [{ path: "site/index.html", content: "<h1>ZIP</h1>" }] });
  assert.match(html, /ZIP/);
  assert.equal(_private.previewIdentity(version).checksum, version.package_checksum);
});

test("quality_report remains selected for preview rendering", () => {
  assert.ok(_private.previewVersionFields.split(",").includes("quality_report"));
});

test("the opaque-origin sandbox and no-network policy remain unchanged", () => {
  const html = _private.renderPackageHtml({ files: [{ path: "index.html", content: "<h1>Safe</h1>" }] });
  assert.match(html, /connect-src &#039;none&#039;/);
  assert.match(portalPreviewSource, /sandbox="allow-scripts"/);
  assert.doesNotMatch(portalPreviewSource, /allow-same-origin/);
});

test("the public preview blocks approval when server identity is absent", () => {
  assert.match(portalPreviewSource, /!loadedPreview\?\.id \|\| !loadedPreview\?\.checksum/);
  assert.match(portalPreviewSource, /De versie-identiteit ontbreekt/);
});

test("the approval request uses the checksum returned by the render server", () => {
  assert.match(portalPreviewSource, /expectedChecksum: loadedPreview\.checksum/);
});

test("preview rendering remains a read-only GET route", () => {
  assert.match(rendererSource, /event\.httpMethod !== "GET"/);
  assert.match(rendererSource, /readSingle\(context, "website_preview_versions"/);
  assert.doesNotMatch(rendererSource, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
});
