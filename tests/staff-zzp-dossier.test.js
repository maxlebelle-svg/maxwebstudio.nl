const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const selfService = require("../functions/staff-self-service.js")._test;
const adminDirectory = require("../functions/admin-staff-directory.js")._test;

test("ZZP dossier migration creates private, role-scoped records and immutable evidence", () => {
  const sql = read("supabase/migrations/20260726210000_staff_zzp_dossier_foundation.sql");
  for (const table of ["staff_zzp_dossiers", "staff_zzp_documents", "staff_messages", "staff_dossier_events"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /'staff-private-documents','staff-private-documents',false/);
  assert.match(sql, /has_app_role\(array\['super_admin'\]\)/);
  assert.match(sql, /Staff dossier events are immutable/);
  assert.match(sql, /foreign key \(dossier_id, profile_id\)/);
  assert.doesNotMatch(sql, /bank_card|bankpas/i);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete)[^;]*to authenticated/i);
});

test("self-service validates IBANs, document signatures and signed storage URLs", () => {
  assert.equal(selfService.ibanValid("NL91ABNA0417164300"), true);
  assert.equal(selfService.ibanValid("NL91ABNA0417164301"), false);
  assert.equal(selfService.resolveSignedUrl("https://example.supabase.co", "/object/upload/sign/a/b?token=x"), "https://example.supabase.co/storage/v1/object/upload/sign/a/b?token=x");
  assert.doesNotThrow(() => selfService.validateBytes(Buffer.from("%PDF-demo"), "application/pdf", 9));
  assert.throws(() => selfService.validateBytes(Buffer.from("not-pdf"), "application/pdf", 7), /bestandstype/i);
});

test("admin staff directory is superadmin-only and exposes the requested controls", () => {
  const endpoint = read("functions/admin-staff-directory.js");
  const html = read("public/admin-medewerkers.html");
  const partnerAdmin = read("public/admin-partners.html");
  const client = read("public/src/staff/admin-staff-directory.js");
  assert.match(endpoint, /allowedRoles:\["super_admin"\]/);
  assert.match(endpoint, /disableLegacyToken:true/);
  assert.match(endpoint, /expiresIn:60/);
  assert.match(endpoint, /document\.opened/);
  for (const action of ["Openen", "Onboarding", "Agenda", "Chat"]) assert.match(client, new RegExp(action));
  assert.match(client, /send_message/);
  assert.match(client, /download_document/);
  assert.match(html, /id="employee-list"/);
  assert.match(partnerAdmin, /Open superadmin-medewerkersportaal/);
  assert.match(partnerAdmin, /href="\/admin-medewerkers\.html"/);
});

test("directory helpers reject unsafe staff records and resolve private downloads", () => {
  assert.equal(adminDirectory.validEmployee({ id:"00000000-0000-4000-8000-000000000001", email:"bot@example.nl", role:"sales_partner", metadata:{} }), false);
  assert.equal(adminDirectory.validEmployee({ id:"00000000-0000-4000-8000-000000000001", email:"zzp@example.nl", role:"sales_partner", metadata:{} }), true);
  assert.equal(adminDirectory.resolveSignedUrl("https://example.supabase.co", "/object/sign/a/b?token=x"), "https://example.supabase.co/storage/v1/object/sign/a/b?token=x");
});

test("cross-user agenda access is both client-selected and server-authorized", () => {
  const server = read("functions/admin-microsoft-calendar.js");
  const client = read("public/admin-sales.html");
  assert.match(server, /calendar_cross_user_forbidden/);
  assert.match(server, /admin\.role\).*=== "super_admin"/);
  assert.match(client, /query\.get\("employeeEmail"\)/);
  assert.match(client, /viewingAnotherEmployee/);
});

test("central admin navigation exposes Partnerbeheer while keeping Medewerkers superadmin-only", () => {
  const navigation = require("../public/admin/config/sidebar-navigation.js");
  const items = navigation.ADMIN_SIDEBAR_NAVIGATION.flatMap((section) => section.items);
  const partners = items.find((item) => item.id === "partner-management");
  const staff = items.find((item) => item.id === "staff-directory");
  assert.equal(partners.route, "admin-partners.html");
  assert.deepEqual(partners.permission.roles, ["super_admin", "admin", "sales_manager"]);
  assert.deepEqual(staff.permission.roles, ["super_admin"]);
});
