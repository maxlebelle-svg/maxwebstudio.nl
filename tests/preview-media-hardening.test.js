"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const assets = require("../functions/_preview-assets");
const manual = require("../functions/manual-preview-render");
const publicRenderer = require("../functions/public-preview-render");
const factoryRenderer = require("../functions/demo-preview");

const IDS = {
  journey: "11111111-1111-4111-8111-111111111111",
  version: "22222222-2222-4222-8222-222222222222",
  lead: "33333333-3333-4333-8333-333333333333",
  publication: "44444444-4444-4444-8444-444444444444",
};
const token = "safe-preview-token";
const mediaBytes = Buffer.from("0123456789", "utf8");
const html = '<!doctype html><video poster="assets/hero-poster.jpeg"><source src="assets/hollink-hero-small.mp4" type="video/mp4"></video><img srcset="assets/hero-small.jpeg 1x, assets/hero-large.jpeg 2x" imagesrcset="assets/card.jpeg 640w"><img src="https://cdn.example.com/hero.jpeg"><img src="data:image/png;base64,unsafe"><a href="javascript:alert(1)">x</a>';
const version = {
  id: IDS.version,
  demo_journey_id: IDS.journey,
  preview_token: token,
  metadata: { previewSource: "manual_zip", renderable: true, entryFile: "index.html" },
  status: "internal",
  is_active: true,
  generated_package: {
    entryFile: "index.html",
    files: [
      { path: "index.html", encoding: "utf8", content: html },
      { path: "assets/hollink-hero-small.mp4", encoding: "base64", content: mediaBytes.toString("base64") },
      { path: "assets/hero-poster.jpeg", encoding: "base64", content: Buffer.from("poster").toString("base64") },
    ],
  },
};

function manualEvent(params = {}, method = "GET", headers = {}) {
  return { httpMethod: method, headers, queryStringParameters: { version: IDS.version, token, source: "manual_zip", previewVersionId: IDS.version, ...params } };
}

function jsonReply(value) { return { ok: true, status: 200, json: async () => value }; }
function textReply(value) { return { ok: true, status: 200, text: async () => JSON.stringify(value) }; }

test.beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  publicRenderer._private.requestWindows.clear();
});

test("media MIME map covers MP4, WebM and Ogg variants", () => {
  assert.equal(assets.contentTypeForPreviewAsset("video.mp4"), "video/mp4");
  assert.equal(assets.contentTypeForPreviewAsset("video.webm"), "video/webm");
  assert.equal(assets.contentTypeForPreviewAsset("video.ogv"), "video/ogg");
  assert.equal(assets.contentTypeForPreviewAsset("audio.ogg"), "audio/ogg");
});

test("Range parsing supports explicit, open and suffix ranges and rejects invalid input", () => {
  assert.deepEqual(assets.parseByteRange("bytes=2-5", 10), { start: 2, end: 5, length: 4 });
  assert.deepEqual(assets.parseByteRange("bytes=7-", 10), { start: 7, end: 9, length: 3 });
  assert.deepEqual(assets.parseByteRange("bytes=-3", 10), { start: 7, end: 9, length: 3 });
  assert.equal(assets.parseByteRange("bytes=20-30", 10).invalid, true);
});

test("poster and srcset rewriting preserve descriptors and external URLs", () => {
  const rewritten = assets.rewriteHtmlAssetAttributes(html, { route: (file) => `/render?file=${encodeURIComponent(file)}` });
  assert.match(rewritten, /poster="\/render\?file=assets%2Fhero-poster\.jpeg"/);
  assert.match(rewritten, /src="\/render\?file=assets%2Fhollink-hero-small\.mp4"/);
  assert.match(rewritten, /srcset="\/render\?file=assets%2Fhero-small\.jpeg 1x, \/render\?file=assets%2Fhero-large\.jpeg 2x"/);
  assert.match(rewritten, /imagesrcset="\/render\?file=assets%2Fcard\.jpeg 640w"/);
  assert.match(rewritten, /src="https:\/\/cdn\.example\.com\/hero\.jpeg"/);
  assert.match(rewritten, /href=""/);
  assert.doesNotMatch(rewritten, /data:image|javascript:/);
  assert.equal(assets.resolveRelativePreviewPath("../../secret", "pages/index.html"), "");
});

test("manual renderer serves Hollink video as 200 and supports HEAD", async () => {
  global.fetch = async () => jsonReply([version]);
  const full = await manual.handler(manualEvent({ file: "assets/hollink-hero-small.mp4" }));
  const head = await manual.handler(manualEvent({ file: "assets/hollink-hero-small.mp4" }, "HEAD"));
  assert.equal(full.statusCode, 200);
  assert.equal(full.headers["Content-Type"], "video/mp4");
  assert.equal(full.headers["Accept-Ranges"], "bytes");
  assert.equal(full.headers["Content-Length"], "10");
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, "");
  assert.equal(head.headers["Content-Length"], "10");
});

test("manual renderer returns 206 and 416 with correct range headers", async () => {
  global.fetch = async () => jsonReply([version]);
  const partial = await manual.handler(manualEvent({ file: "assets/hollink-hero-small.mp4" }, "GET", { Range: "bytes=2-5" }));
  const invalid = await manual.handler(manualEvent({ file: "assets/hollink-hero-small.mp4" }, "GET", { range: "bytes=30-40" }));
  assert.equal(partial.statusCode, 206);
  assert.equal(partial.headers["Content-Range"], "bytes 2-5/10");
  assert.equal(partial.headers["Content-Length"], "4");
  assert.equal(Buffer.from(partial.body, "base64").toString(), "2345");
  assert.equal(invalid.statusCode, 416);
  assert.equal(invalid.headers["Content-Range"], "bytes */10");
});

test("manual renderer rewrites the Hollink video and poster through its protected route", async () => {
  global.fetch = async () => jsonReply([version]);
  const result = await manual.handler(manualEvent());
  assert.match(result.body, /file=assets%2Fhollink-hero-small\.mp4/);
  assert.match(result.body, /poster="[^\"]*file=assets%2Fhero-poster\.jpeg/);
  assert.match(result.body, /1x,[^\"]*2x/);
});

async function publicRequest(file = "", headers = {}) {
  global.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("public_preview_publications")) return jsonReply([{ id: IDS.publication, relationship_type: "lead", relationship_id: IDS.lead, preview_version_id: IDS.version, enabled: true, revoked_at: null }]);
    if (pathname.endsWith("website_preview_versions")) return jsonReply([version]);
    if (pathname.endsWith("demo_journeys")) return jsonReply([{ id: IDS.journey, lead_id: IDS.lead, customer_id: null }]);
    throw new Error(`Unexpected request: ${url}`);
  };
  return publicRenderer.handler({ httpMethod: "GET", path: "/preview/hollink", queryStringParameters: { slug: "hollink", ...(file ? { file } : {}) }, headers: { "x-forwarded-for": "203.0.113.9", ...headers } });
}

test("public renderer rewrites and ranges the same Hollink media", async () => {
  const page = await publicRequest();
  const partial = await publicRequest("assets/hollink-hero-small.mp4", { range: "bytes=0-3" });
  assert.match(page.body, /poster="\?file=assets%2Fhero-poster\.jpeg"/);
  assert.match(page.body, /src="\?file=assets%2Fhollink-hero-small\.mp4"/);
  assert.equal(partial.statusCode, 206);
  assert.equal(partial.headers["Content-Type"], "video/mp4");
  assert.equal(partial.headers["Content-Range"], "bytes 0-3/10");
});

test("Factory renderer rewrites and ranges media for the exact preview version", async () => {
  const factoryVersion = { ...version, metadata: { previewSource: "website_factory", renderable: true, entryFile: "index.html" }, build_job_id: "55555555-5555-4555-8555-555555555555" };
  global.fetch = async (url) => {
    if (String(url).includes("demo_journeys")) return textReply([{ id: IDS.journey, preview_token: token, preview_package: {} }]);
    if (String(url).includes("website_preview_versions")) return textReply([factoryVersion]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const base = { id: IDS.journey, token, source: "factory", previewVersionId: IDS.version };
  const page = await factoryRenderer.handler({ httpMethod: "GET", headers: {}, queryStringParameters: base });
  const partial = await factoryRenderer.handler({ httpMethod: "GET", headers: { Range: "bytes=4-7" }, queryStringParameters: { ...base, file: "assets/hollink-hero-small.mp4" } });
  assert.match(page.body, /file=assets%2Fhero-poster\.jpeg/);
  assert.match(page.body, /file=assets%2Fhollink-hero-small\.mp4/);
  assert.equal(partial.statusCode, 206);
  assert.equal(partial.headers["Content-Type"], "video/mp4");
  assert.equal(partial.headers["Content-Range"], "bytes 4-7/10");
});

test("customer ownership uses only real version or journey customer relations", async () => {
  const context = { supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service" };
  global.fetch = async () => jsonReply([{ id: IDS.journey, lead_id: IDS.lead, customer_id: IDS.lead }]);
  assert.equal(await publicRenderer._private.genericOwnershipMatches(context, "customer", IDS.lead, { demo_journey_id: IDS.journey, customer_id: "" }), true);
  assert.equal(await publicRenderer._private.genericOwnershipMatches(context, "customer", IDS.publication, { demo_journey_id: IDS.journey, customer_id: "" }), false);
});
