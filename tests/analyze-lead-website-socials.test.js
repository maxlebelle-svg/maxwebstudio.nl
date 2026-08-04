"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { _private } = require("../functions/analyze-lead-website");

test("website scan keeps real social profile anchors and rejects tracking or unrelated script URLs", () => {
  const html = `
    <script>https://www.facebook.com/tr?id=123</script>
    <a href="https://www.facebook.com/miolla.nl">Facebook</a>
    <a href="https://www.instagram.com/miolla.nl/">Instagram</a>
    <a href="https://www.instagram.com/whatsapp/">Wrong Instagram path</a>
    <script>https://www.youtube.com/channel/unrelated</script>
  `;

  assert.deepEqual(_private.extractSocialAnchorUrls(html, "https://miolla.nl/"), [
    "https://www.facebook.com/miolla.nl",
    "https://www.instagram.com/miolla.nl/",
  ]);
});
