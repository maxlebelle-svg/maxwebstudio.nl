"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const html = fs.readFileSync(require.resolve("../public/admin-platform-health.html"), "utf8");

test("Platform Health reads the canonical admin bridge before legacy session data", () => {
  assert.match(html, /\["mws_admin_supabase_session", "maxwebstudioCurrentSession", "maxwebstudioAdminSession"\]/);
  assert.match(html, /session\.accessToken \|\| session\.access_token \|\| session\.session\?\.access_token/);
});
