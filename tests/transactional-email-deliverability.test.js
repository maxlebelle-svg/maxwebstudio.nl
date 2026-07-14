const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { sendTrackedEmail } = require("../functions/services/resendMailService");
const { applyTransactionalEmailPolicy, _private } = require("../functions/services/transactionalEmailPolicy");
const { buildLeadDemoInvitationMail } = require("../functions/services/leadDemoInvitationTemplate");
const { analyzeReceivedHeaders } = require("../functions/services/emailHeaderDiagnostics");
const { _test: mailStudio } = require("../functions/admin-mail-studio-send");

const base = { to: "customer@example.test", subject: "Test", html: '<p>Test <a href="https://maxwebstudio.nl/demo">demo</a></p>', text: "Test https://maxwebstudio.nl/demo" };

test("transactionele mail gebruikt altijd de benoemde geverifieerde afzender en bewaakte Reply-To", () => {
  const result = applyTransactionalEmailPolicy({ ...base, from: "info@maxwebstudio.nl", replyTo: "attacker@example.test" }, {});
  assert.equal(result.from, "Max Webstudio <info@maxwebstudio.nl>");
  assert.equal(result.replyTo, "info@maxwebstudio.nl");
});

test("Outlook-headerdiagnose bevestigt SPF, DKIM en DMARC pass", () => {
  const result = analyzeReceivedHeaders(sampleHeaders());
  assert.equal(result.spf, "pass");
  assert.equal(result.dkim, "pass");
  assert.equal(result.dmarc, "pass");
});

test("Outlook-headerdiagnose controleert From-, DKIM- en Return-Path-alignment", () => {
  const result = analyzeReceivedHeaders(sampleHeaders());
  assert.equal(result.fromDomain, "maxwebstudio.nl");
  assert.equal(result.returnPathDomain, "send.maxwebstudio.nl");
  assert.equal(result.returnPathAligned, true);
  assert.equal(result.dkimAligned, true);
  assert.equal(result.spfAligned, true);
  assert.equal(result.scl, "5");
});

test("ongeldige From-configuratie faalt gesloten", async () => {
  let requests = 0;
  const result = await sendTrackedEmail({ ...base, from: "other@example.test", suppressTimelineEvent: true }, { env: { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test" }, fetchImpl: async () => { requests += 1; } });
  assert.equal(result.sent, false);
  assert.equal(result.errorCode, "invalid_sender_configuration");
  assert.equal(requests, 0);
});

test("productie faalt gesloten zonder expliciete domeinverificatie", async () => {
  let requests = 0;
  const result = await sendTrackedEmail({ ...base, suppressTimelineEvent: true }, { env: { APP_ENV: "production", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test" }, fetchImpl: async () => { requests += 1; } });
  assert.equal(result.errorCode, "sender_domain_not_verified");
  assert.equal(requests, 0);
});

test("productie accepteert uitsluitend expliciet geverifieerde canonieke afzender", async () => {
  let body;
  const result = await sendTrackedEmail({ ...base, replyTo: "spoof@example.test", suppressTimelineEvent: true }, {
    env: { APP_ENV: "production", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test", RESEND_DOMAIN_VERIFIED: "true", FROM_EMAIL: "Max Webstudio <info@maxwebstudio.nl>" },
    fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ id: "provider-1" }) }; },
  });
  assert.equal(result.sent, true);
  assert.equal(body.from, "Max Webstudio <info@maxwebstudio.nl>");
  assert.equal(body.reply_to, "info@maxwebstudio.nl");
});

test("HTML zonder platte tekst wordt niet verzonden", async () => {
  const result = await sendTrackedEmail({ ...base, text: "", suppressTimelineEvent: true }, { env: { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test" }, fetchImpl: async () => assert.fail("provider mag niet worden aangeroepen") });
  assert.equal(result.errorCode, "multipart_content_required");
});

test("platte tekst zonder HTML wordt niet verzonden", () => {
  assert.throws(() => applyTransactionalEmailPolicy({ ...base, html: "" }, {}), { code: "multipart_content_required" });
});

test("veilige configuratiemetadata bevat domeinen maar geen providergeheim", () => {
  const result = applyTransactionalEmailPolicy(base, {});
  assert.deepEqual(result.deliveryConfiguration.linkDomains, ["maxwebstudio.nl"]);
  assert.equal(result.deliveryConfiguration.multipart, true);
  assert.equal(result.deliveryConfiguration.tracking.clickExpected, false);
  assert.equal(result.deliveryConfiguration.tracking.openExpected, false);
  assert.equal(JSON.stringify(result.deliveryConfiguration).includes("RESEND_API_KEY"), false);
});

test("alle verzendroutes gebruiken de centrale mailservice", () => {
  const root = path.resolve(__dirname, "../functions");
  const routeFiles = fs.readdirSync(root).filter((name) => name.endsWith(".js"));
  const directResend = routeFiles.filter((name) => fs.readFileSync(path.join(root, name), "utf8").includes("api.resend.com/emails"));
  assert.deepEqual(directResend, []);
});

test("browserpayload kan From en Reply-To niet aan Mail Studio doorgeven", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../functions/admin-mail-studio-send.js"), "utf8");
  assert.doesNotMatch(source, /from:\s*payload\.(from|fromEmail)/);
  assert.doesNotMatch(source, /replyTo:\s*payload\.replyTo/);
});

test("demo-uitnodiging normaliseert lowercase namen en personaliseert onderwerp", () => {
  const mail = invitation({ contactName: "lisanne post", companyName: "advies post" });
  assert.equal(mail.subject, "Lisanne, je website-demo voor Advies Post staat klaar");
  assert.match(mail.html, /Hoi Lisanne Post/);
});

test("demo-uitnodiging heeft één primaire klikbare CTA", () => {
  const mail = invitation();
  assert.equal((mail.html.match(/<a\b/gi) || []).length, 1);
  assert.equal((mail.html.match(/class="mws-cta"/gi) || []).length, 1);
});

test("demo-uitnodiging bevat geen verkorte, localhost- of previewdeployment-links", () => {
  const rendered = `${invitation().html}\n${invitation().text}`;
  assert.doesNotMatch(rendered, /bit\.ly|tinyurl|localhost|127\.0\.0\.1|netlify\.app/i);
});

test("demo-uitnodiging bevat geen emoji of marketingachtige spamclaims", () => {
  const mail = invitation();
  assert.doesNotMatch(`${mail.subject}${mail.html}${mail.text}`, /[\u{1F300}-\u{1FAFF}]|100% gratis|winnaar|direct geld/iu);
});

test("demo-uitnodiging blijft compact en heeft equivalente multipart-inhoud", () => {
  const mail = invitation();
  assert.ok(Buffer.byteLength(mail.html, "utf8") < 12_000);
  assert.match(mail.html, /vrijblijvend/i);
  assert.match(mail.text, /vrijblijvend/i);
  assert.match(mail.html, /Bekijk je website-demo/);
  assert.match(mail.text, /Account activeren en demo bekijken/);
});

test("demo-uitnodiging weigert onveilige links", () => {
  assert.throws(() => invitation({ activationUrl: "http://maxwebstudio.nl/unsafe" }), { code: "activation_url_invalid" });
  assert.throws(() => invitation({ previewUrl: "javascript:alert(1)" }), { code: "preview_url_invalid" });
});

test("Mail Studio-validatie vereist zowel HTML als plain text", () => {
  const payload = { relationshipType: "lead", relationshipId: "11111111-1111-4111-8111-111111111111", subject: "Test", html: validStudioHtml(), text: "Test" };
  assert.equal(mailStudio.validateMailStudioPayload(payload).valid, true);
  assert.equal(mailStudio.validateMailStudioPayload({ ...payload, text: "" }).valid, false);
});

function invitation(overrides = {}) {
  return buildLeadDemoInvitationMail({ contactName: "Lisanne Post", companyName: "Advies Post", activationUrl: "https://example.supabase.co/auth/v1/verify?token=safe", previewUrl: "https://maxwebstudio.nl/lead-preview.html", supportEmail: "info@maxwebstudio.nl", ...overrides });
}
function validStudioHtml() {
  return '<!doctype html><meta name="supported-color-schemes"><style>@media (max-width: 620px){}</style><img src="max-webstudio-logo-mark.svg"><a class="mws-cta">cta</a> info@maxwebstudio.nl wa.me/31851302326 instagram.com/maxwebstudio.nl linkedin.com/company/130444905';
}
function sampleHeaders() {
  return [
    "From: Max Webstudio <info@maxwebstudio.nl>",
    "Return-Path: <bounce@send.maxwebstudio.nl>",
    "Authentication-Results: spf=pass smtp.mailfrom=send.maxwebstudio.nl; dkim=pass header.d=maxwebstudio.nl; dmarc=pass header.from=maxwebstudio.nl;",
    "X-MS-Exchange-Organization-SCL: 5",
  ].join("\r\n");
}
