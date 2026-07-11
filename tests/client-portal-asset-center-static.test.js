const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("public/klantportaal.html", "utf8");
const inlineScripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

assert(html.includes('id="portal-asset-summary"'), "Asset Center summary shell should exist");
assert(html.includes('id="portal-asset-search"'), "Asset Center search should exist");
assert(html.includes('id="portal-asset-detail"'), "Asset detail drawer should exist");
assert(html.includes("function safeAssetHref"), "Asset Center should normalize safe open/download links");
assert(html.includes("netlify|supabase|github|storage|amazonaws|cloudfront"), "Provider URLs should be blocked from asset hrefs");
assert(html.includes("safeDisplayName"), "Asset names should be cleaned before display");
assert(!html.includes('["Locatie", location || "-"]'), "Raw asset locations must not be rendered in the customer portal");

inlineScripts.forEach((code) => new Function(code));

console.log("client portal asset center static tests passed");
