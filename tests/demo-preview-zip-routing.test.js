const test = require("node:test");
const assert = require("node:assert/strict");
const preview = require("../functions/demo-preview");

const JOURNEY = "c01dfe2d-a0de-4873-ac3b-2c10d403e444";
const VERSION = "545bd552-c30d-4e81-ba48-fed20f0c97df";
const TOKEN = "preview-token";

const journey = {
  id: JOURNEY,
  preview_token: TOKEN,
  preview_package: { entryFile: "index.html", files: [{ path: "index.html", content: "OLD JOURNEY PACKAGE" }] },
};
const version = {
  id: VERSION,
  demo_journey_id: JOURNEY,
  preview_token: TOKEN,
  metadata: { previewSource: "manual_zip" },
  generated_package: {
    entryFile: "index.html",
    files: [
      { path: "index.html", content: '<!doctype html><link rel="stylesheet" href="styles.css"><p>EXACT VERSION PACKAGE</p>' },
      { path: "styles.css", content: "body{color:green}" },
    ],
  },
};

function event(params = {}) {
  return { httpMethod: "GET", headers: {}, queryStringParameters: { id: JOURNEY, token: TOKEN, previewVersionId: VERSION, ...params } };
}

test.beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  global.fetch = async (url) => {
    if (String(url).includes("/rest/v1/demo_journeys")) return response([journey]);
    if (String(url).includes("/rest/v1/website_preview_versions")) return response([version]);
    throw new Error(`Unexpected request: ${url}`);
  };
});

function response(value) { return { ok: true, status: 200, text: async () => JSON.stringify(value) }; }

test("exact previewVersionId selects only that package and derives missing source", async () => {
  const result = await preview.handler(event());
  assert.equal(result.statusCode, 200);
  assert.match(result.body, /EXACT VERSION PACKAGE/);
  assert.doesNotMatch(result.body, /OLD JOURNEY PACKAGE/);
  assert.match(result.body, /source=manual_zip/);
  assert.match(result.body, new RegExp(`previewVersionId=${VERSION}`));
});

test("wrong explicit source returns 409 without falling back", async () => {
  const result = await preview.handler(event({ source: "factory" }));
  assert.equal(result.statusCode, 409);
  assert.match(result.body, /Previewbron hoort niet/);
  assert.doesNotMatch(result.body, /OLD JOURNEY PACKAGE/);
});

test("format=zip points to prepare route and never returns ZIP or package bytes", async () => {
  const result = await preview.handler(event({ format: "zip" }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 400);
  assert.equal(body.code, "ZIP_DOWNLOAD_ROUTE_REQUIRED");
  assert.equal(body.endpoint, "/.netlify/functions/admin-preview-zip-download");
  assert(!Object.hasOwn(body, "files"));
  assert(!Object.hasOwn(body, "generated_package"));
  assert(!result.body.includes("UEsDB"));
  assert.equal(result.isBase64Encoded, undefined);
});
