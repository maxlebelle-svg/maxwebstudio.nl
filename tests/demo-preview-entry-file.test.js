const test = require("node:test");
const assert = require("node:assert/strict");
const { _private } = require("../functions/demo-preview");

test("internal Factory preview repairs a logo saved as the package entry file", () => {
  const previewPackage = {
    entryFile: "assets/logo.svg",
    files: [
      { path: "assets/logo.svg", content: "<svg></svg>" },
      { path: "styles.css", content: "body{}" },
      { path: "index.html", content: "<!doctype html><title>Echte website</title>" },
    ],
  };
  assert.equal(_private.hasRenderablePackage(previewPackage), true);
  assert.equal(_private.resolvePreviewFilePath(previewPackage), "index.html");
  assert.equal(_private.resolvePreviewFilePath(previewPackage, "assets/logo.svg"), "assets/logo.svg");
});

test("internal Factory preview respects a valid nested HTML entry file", () => {
  const previewPackage = {
    meta: { entryFile: "site/home.html" },
    files: [
      { path: "site/home.html", content: "<!doctype html>" },
      { path: "index.html", content: "<!doctype html>" },
    ],
  };
  assert.equal(_private.resolvePreviewFilePath(previewPackage), "site/home.html");
});

test("an asset-only package is not considered a renderable website", () => {
  const previewPackage = { entryFile: "assets/logo.svg", files: [{ path: "assets/logo.svg", content: "<svg></svg>" }] };
  assert.equal(_private.hasRenderablePackage(previewPackage), false);
});

test("internal Factory preview inlines code and routes heavy images outside the HTML response", () => {
  const previewPackage = {
    files: [
      { path: "index.html", content: '<!doctype html><link rel="stylesheet" href="styles.css"><img src="assets/logo.svg"><script src="script.js"></script>' },
      { path: "styles.css", content: '.hero{background:url("assets/hero.png")}' },
      { path: "script.js", content: 'document.body.dataset.ready="yes";' },
      { path: "assets/logo.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
      { path: "assets/hero.png", encoding: "base64", content: Buffer.from("image").toString("base64") },
    ],
  };
  const html = _private.inlinePreviewPackageAssets(previewPackage.files[0].content, previewPackage, { id: "journey", token: "token", source: "factory", previewVersionId: "version" });
  assert.match(html, /<style data-preview-asset="styles\.css">/);
  assert.match(html, /<script data-preview-asset="script\.js">/);
  assert.match(html, /url\("\/api\/demo-preview\?[^\"]+file=assets%2Fhero\.png"\)/);
  assert.match(html, /src="assets\/logo\.svg"/);
  assert.doesNotMatch(html, /href="styles\.css"|src="script\.js"|data:image\/png/);
});
