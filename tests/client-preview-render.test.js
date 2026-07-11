const assert = require("assert");
const { _private } = require("../functions/client-preview-render");

const previewPackage = {
  files: [
    {
      path: "index.html",
      content: [
        "<!doctype html>",
        "<html lang=\"nl\">",
        "<head>",
        "<title>Factory klantdemo</title>",
        "<link rel=\"stylesheet\" href=\"styles.css\">",
        "</head>",
        "<body>",
        "<main class=\"hero\"><img src=\"assets/logo.svg\" alt=\"Klantdemo\"><h1>Klantdemo</h1><p>Echte Factory-demo</p></main>",
        "<script src=\"script.js\"></script>",
        "</body>",
        "</html>",
      ].join(""),
    },
    { path: "styles.css", content: ".hero{background:url('assets/hero.svg');color:#123}" },
    { path: "script.js", content: "document.documentElement.dataset.preview='ready';" },
    { path: "assets/logo.svg", content: "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>Klantdemo</text></svg>" },
    { path: "assets/hero.svg", content: "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"100\" height=\"100\"/></svg>" },
  ],
};

const html = _private.renderPackageHtml(previewPackage, {
  versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Klantdemo",
});

assert(html.includes("Klantdemo"), "rendered preview should contain real package content");
assert(html.includes("Echte Factory-demo"), "rendered preview should not fall back to generic copy");
assert(html.includes("<style"), "stylesheet should be inlined");
assert(html.includes("<script"), "script should be inlined");
assert(html.includes("data:image/svg+xml;base64,"), "image assets should be embedded as data URIs");
assert(!new RegExp("\\\\.netlify/functions|supabase|github|preview_token|preview_url", "i").test(html), "rendered preview should not leak provider or technical URLs");
assert.strictEqual(
  _private.getQueryParams({ rawUrl: "https://maxwebstudio.nl/.netlify/functions/client-preview-render?version=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }).version,
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "query params should be recovered from Netlify rawUrl when queryStringParameters is empty"
);
assert.strictEqual(
  _private.getVersionParam({ rawQuery: "version=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "version should be recovered from Netlify rawQuery"
);
assert.strictEqual(
  _private.getVersionParam({ path: "/.netlify/functions/client-preview-render?version=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "version should be recovered from a function path containing a query"
);
assert.strictEqual(
  _private.getVersionParam({ headers: { "x-nf-original-url": "/api/client-preview-render?version=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "version should be recovered from Netlify original URL headers"
);
assert.strictEqual(
  _private.recoverVersionFromRequest({ rawUrl: "https://maxwebstudio.nl/.netlify/functions/client-preview-render?versionId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "version aliases should be recovered from request metadata"
);

console.log("client preview render tests passed");
