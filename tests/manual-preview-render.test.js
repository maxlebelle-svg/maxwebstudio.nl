const test = require("node:test");
const assert = require("node:assert/strict");
const renderer = require("../functions/manual-preview-render");

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const token = "0123456789abcdef0123456789abcdef";
const version = {
  id,
  preview_token: token,
  status: "internal",
  is_active: true,
  generated_package: {
    entryFile: "index.html",
    files: [
      { path: "index.html", encoding: "utf8", content: '<!doctype html><link rel="stylesheet" href="styles.css"><img src="assets/logo.svg"><script src="script.js"></script>' },
      { path: "styles.css", encoding: "utf8", content: 'body{background:url("assets/logo.svg")}' },
      { path: "script.js", encoding: "utf8", content: "document.body.dataset.ready='yes'" },
      { path: "assets/logo.svg", encoding: "utf8", content: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" },
    ],
  },
};

function event(params = {}) {
  return { httpMethod: "GET", queryStringParameters: { version: id, token, ...params }, headers: {} };
}

test.beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  global.fetch = async () => ({ ok: true, status: 200, json: async () => [version] });
});

test("manual preview index is served with same-origin iframe headers and rewritten assets", async () => {
  const result = await renderer.handler(event());
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["Content-Type"], "text/html; charset=utf-8");
  assert.equal(result.headers["X-Frame-Options"], "SAMEORIGIN");
  assert.match(result.headers["Content-Security-Policy"], /frame-ancestors 'self'/);
  assert.match(result.body, /manual-preview-render\?version=/);
  assert.match(result.body, /file=styles\.css/);
  assert.match(result.body, /file=assets%2Flogo\.svg/);
});

test("manual preview assets keep correct MIME types", async () => {
  const css = await renderer.handler(event({ file: "styles.css" }));
  const script = await renderer.handler(event({ file: "script.js" }));
  const svg = await renderer.handler(event({ file: "assets/logo.svg" }));
  assert.equal(css.statusCode, 200);
  assert.equal(css.headers["Content-Type"], "text/css; charset=utf-8");
  assert.equal(script.headers["Content-Type"], "application/javascript; charset=utf-8");
  assert.equal(svg.headers["Content-Type"], "image/svg+xml");
});

test("wrong preview token and unsafe paths are rejected", async () => {
  const wrong = await renderer.handler(event({ token: "wrong" }));
  assert.equal(wrong.statusCode, 404);
  assert.equal(renderer._private.safeFilePath("../secret"), "");
});
