import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = process.env.DCA_STAGING_ENV_FILE || path.join(root, ".env.local");
const deployUrl = String(process.env.DCA_STAGING_DEPLOY_URL || "").replace(/\/$/, "");
const envText = await fs.readFile(envPath, "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
  const split = line.indexOf("=");
  return [line.slice(0, split), line.slice(split + 1).replace(/^['"]|['"]$/g, "")];
}));
if (env.SUPABASE_PROJECT_ID !== "xlxpuuycigeqhgxqtzni") throw new Error("DCA-1 deployed certification is staging-only.");
if (!/^https:\/\/[a-f0-9]{24}--mws-gold-review-2026-1-7q4k\.netlify\.app$/.test(deployUrl)) throw new Error("Unexpected deploy-preview identity.");
if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Staging configuration is incomplete.");

const base = env.SUPABASE_URL.replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const runId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const uuid = () => crypto.randomUUID();
const digest = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const evidence = {
  release: "DCA_1_FRAGMENT_TOKEN_EXCHANGE_V1",
  projectRef: env.SUPABASE_PROJECT_ID,
  deployUrl,
  runIdHash: digest(runId),
  startedAt: new Date().toISOString(),
  providerMode: "SUPPRESSED",
  providerCalls: 0,
  assertions: {},
  cleanup: {},
};
const ids = {
  profiles: { admin: uuid(), zip: uuid(), factory: uuid() },
  customers: { factory: uuid() },
  leads: { zip: uuid(), factory: uuid() },
  journeys: { zip: uuid(), factory: uuid() },
  projects: { factory: uuid() },
  builds: { zip: uuid(), factory: uuid() },
  previews: { zip: uuid(), factory: uuid() },
  publications: { zip: uuid(), factory: uuid() },
};
const authUsers = {};
const activationLinkIds = new Set();
const invitations = new Set();
const secrets = [];
const sessionSecrets = [];
const initialRateKeys = new Set();
const emails = {
  admin: `dca1-${runId}-admin@example.invalid`,
  zip: `dca1-${runId}-zip@example.invalid`,
  factory: `dca1-${runId}-factory@example.invalid`,
};
let adminBearer = "";
let browserLink = "";
let browserActivationLinkId = "";
let handoffServer;

async function supabase(pathname, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Staging operation failed (${data?.code || response.status}).`);
  return data;
}
const rest = (table, query = "") => `/rest/v1/${table}${query ? `?${query}` : ""}`;
const insert = (table, body) => { evidence.stage = `insert_${table}`; return supabase(rest(table), { method: "POST", body, headers: { Prefer: "return=representation" } }); };
const select = (table, query) => supabase(rest(table, query));
const patch = (table, query, body) => { evidence.stage = `patch_${table}`; return supabase(rest(table, query), { method: "PATCH", body, headers: { Prefer: "return=representation" } }); };
const remove = (table, query) => supabase(rest(table, query), { method: "DELETE", headers: { Prefer: "return=minimal" } });
async function optionalSelect(table, query) {
  const response = await fetch(`${base}${rest(table, query)}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok && data?.code === "PGRST205") return { present: false, rows: [] };
  if (!response.ok) throw new Error(`Staging optional audit failed (${data?.code || response.status}).`);
  return { present: true, rows: Array.isArray(data) ? data : [] };
}

async function createAuth(label, email, role) {
  evidence.stage = `create_auth_${label}`;
  const password = crypto.randomBytes(32).toString("base64url");
  const user = await supabase("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true, user_metadata: { fixture: "DCA_1_FRAGMENT_CERT", role } } });
  authUsers[label] = user.id;
  return { id: user.id, password };
}

async function callFunction(name, body, { cookie = "", origin = deployUrl, method = "POST", contentType = "application/json" } = {}) {
  const response = await fetch(`${deployUrl}/.netlify/functions/${name}`, {
    method,
    headers: { Origin: origin, ...(contentType ? { "Content-Type": contentType } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(adminBearer && name === "admin-demo-invitation" ? { Authorization: `Bearer ${adminBearer}` } : {}) },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body || {})) : undefined,
  });
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null, cookie: response.headers.get("set-cookie") || "" };
}

async function adminAction(fixture, action) {
  evidence.stage = `admin_${fixture}_${action}`;
  const result = await callFunction("admin-demo-invitation", { action, demoJourneyId: ids.journeys[fixture], email: emails[fixture] });
  if (result.response.status !== 200) throw new Error(`Deployed admin ${fixture} ${action} failed (${result.response.status}:${result.data?.reasonCode || (result.data?.requestId ? "correlated" : "uncorrelated")}).`);
  const link = result.data?.oneTimeLink || "";
  if (link) {
    if (!link.startsWith(`${deployUrl}/start#`) || !/#[0-9a-f]{64}$/.test(link)) throw new Error("Admin produced an unsafe activation URL.");
    const token = link.slice(link.indexOf("#") + 1);
    secrets.push(token);
    const row = await select("client_activation_links", `token_hash=eq.${digest(token)}&select=id,lead_demo_invitation_id,created_at,expires_at,status&limit=1`);
    if (row[0]) { activationLinkIds.add(row[0].id); invitations.add(row[0].lead_demo_invitation_id); }
  }
  return result;
}

function cookieHeader(setCookie) {
  const header = String(setCookie).split(";")[0];
  const value = header.slice(header.indexOf("=") + 1);
  if (/^[0-9a-f]{64}$/.test(value)) sessionSecrets.push(value);
  return header;
}
async function exchangeLink(link, options = {}) {
  const token = link.slice(link.indexOf("#") + 1);
  const result = await callFunction("client-activation-exchange", { token }, options);
  return { ...result, token };
}
async function context(cookie, action = "open", options = {}) {
  return callFunction("client-activation-start", { action }, { cookie, ...options });
}
async function cleanup() {
  const list = (values) => `id=in.(${values.join(",")})`;
  const operations = [
    ...(activationLinkIds.size ? [["client_activation_exchange_sessions", `activation_link_id=in.(${[...activationLinkIds].join(",")})`]] : []),
    ["client_activation_links", `lead_id=in.(${Object.values(ids.leads).join(",")})`],
    ["lead_demo_invitations", `lead_id=in.(${Object.values(ids.leads).join(",")})`],
    ["public_preview_publications", list(Object.values(ids.publications))],
    ["website_preview_versions", list(Object.values(ids.previews))],
    ["website_build_jobs", list(Object.values(ids.builds))],
    ["projects", list(Object.values(ids.projects))],
    ["demo_journeys", list(Object.values(ids.journeys))],
    ["leads", list(Object.values(ids.leads))],
    ["customers", list(Object.values(ids.customers))],
    ["profiles", list(Object.values(ids.profiles))],
  ];
  for (const [table, query] of operations) {
    try { await remove(table, query); } catch { evidence.cleanup[table] = "FAILED"; }
  }
  for (const id of Object.values(authUsers)) {
    try { await supabase(`/auth/v1/admin/users/${id}`, { method: "DELETE" }); } catch { evidence.cleanup.authUsers = "FAILED"; }
  }
  try {
    const rateRows = await select("client_activation_exchange_rate_limits", "select=rate_key_hash");
    for (const row of rateRows) if (!initialRateKeys.has(row.rate_key_hash)) await remove("client_activation_exchange_rate_limits", `rate_key_hash=eq.${row.rate_key_hash}`);
  } catch { evidence.cleanup.rateLimits = "FAILED"; }
  const [profiles, journeys, links, sessions] = await Promise.all([
    select("profiles", `id=in.(${Object.values(ids.profiles).join(",")})&select=id`),
    select("demo_journeys", `id=in.(${Object.values(ids.journeys).join(",")})&select=id`),
    select("client_activation_links", `lead_id=in.(${Object.values(ids.leads).join(",")})&select=id`),
    activationLinkIds.size ? select("client_activation_exchange_sessions", `activation_link_id=in.(${[...activationLinkIds].join(",")})&select=id`) : [],
  ]);
  evidence.cleanup.remainingRows = profiles.length + journeys.length + links.length + sessions.length;
  evidence.cleanup.completed = !Object.values(evidence.cleanup).includes("FAILED") && evidence.cleanup.remainingRows === 0;
}

async function buildFixtures() {
  const existingRateRows = await select("client_activation_exchange_rate_limits", "select=rate_key_hash");
  for (const row of existingRateRows) initialRateKeys.add(row.rate_key_hash);
  const admin = await createAuth("admin", emails.admin, "super_admin");
  const zip = await createAuth("zip", emails.zip, "demo_user");
  const factory = await createAuth("factory", emails.factory, "customer");
  await insert("profiles", [
    { id: ids.profiles.admin, auth_user_id: admin.id, name: "DCA cert admin", email: emails.admin, role: "super_admin", status: "active", is_demo: true, environment: "test", metadata: { fixture: "DCA_1_FRAGMENT_CERT" } },
    { id: ids.profiles.zip, auth_user_id: zip.id, name: "DCA cert ZIP", email: emails.zip, role: "demo_user", status: "active", is_demo: true, environment: "test", metadata: { fixture: "DCA_1_FRAGMENT_CERT" } },
    { id: ids.profiles.factory, auth_user_id: factory.id, name: "DCA cert Factory", email: emails.factory, role: "customer", status: "active", is_demo: true, environment: "test", metadata: { fixture: "DCA_1_FRAGMENT_CERT" } },
  ]);
  await insert("customers", { id: ids.customers.factory, profile_id: ids.profiles.factory, auth_user_id: factory.id, name: "DCA Factory klant", email: emails.factory, status: "active", portal_status: "active", is_demo: true, environment: "test", metadata: { fixture: "DCA_1_FRAGMENT_CERT" } });
  await insert("leads", [
    { id: ids.leads.zip, company: "DCA ZIP Studio", name: "Ziva Test", email: emails.zip, phone: "0612345678", converted_customer_id: null, converted_at: null, is_demo: true, environment: "test", metadata: { fixture: "DCA_1_FRAGMENT_CERT" } },
    { id: ids.leads.factory, company: "DCA Factory Studio", name: "Fenna Test", email: emails.factory, phone: "0687654321", converted_customer_id: ids.customers.factory, converted_at: new Date().toISOString(), is_demo: true, environment: "test", metadata: { fixture: "DCA_1_FRAGMENT_CERT" } },
  ]);
  await insert("projects", { id: ids.projects.factory, customer_id: ids.customers.factory, name: "DCA Factory project", status: "onboarding", phase: "activation_fixture", progress: 0, is_demo: true, environment: "test", metadata: { fixture: "DCA_1_FRAGMENT_CERT" } });
  await insert("demo_journeys", [
    { id: ids.journeys.zip, lead_id: ids.leads.zip, customer_id: null, email: emails.zip, demo_status: "interne_preview_klaar", preview_package: { savedDemoSite: { previewVersionId: ids.previews.zip, previewSource: "manual_zip", workflow: { deliveryExpectation: "Binnen twee weken" } } }, created_by: "DCA_1_FRAGMENT_CERT", updated_by: "DCA_1_FRAGMENT_CERT" },
    { id: ids.journeys.factory, lead_id: ids.leads.factory, customer_id: ids.customers.factory, email: emails.factory, demo_status: "interne_preview_klaar", preview_package: { savedDemoSite: { previewVersionId: ids.previews.factory, previewSource: "website_factory", workflow: { deliveryExpectation: "Binnen drie weken" } } }, created_by: "DCA_1_FRAGMENT_CERT", updated_by: "DCA_1_FRAGMENT_CERT" },
  ]);
  const packages = {
    zip: { files: [{ path: "index.html", content: "<!doctype html><html><body><h1>DCA ZIP STAGING CERT</h1></body></html>" }] },
    factory: { files: [{ path: "index.html", content: "<!doctype html><html><body><h1>DCA FACTORY STAGING CERT</h1></body></html>" }] },
  };
  await insert("website_build_jobs", [
    { id: ids.builds.zip, demo_journey_id: ids.journeys.zip, lead_id: ids.leads.zip, customer_id: null, status: "succeeded", package_type: "manual_zip", generator_version: "DCA_1_FRAGMENT_CERT", request_fingerprint: digest(`${runId}:zip-request`), idempotency_key: digest(`${runId}:zip-build`), generated_package: packages.zip, package_checksum: digest(`${runId}:zip-package`), created_by: "DCA_1_FRAGMENT_CERT", updated_by: "DCA_1_FRAGMENT_CERT" },
    { id: ids.builds.factory, demo_journey_id: ids.journeys.factory, lead_id: ids.leads.factory, customer_id: ids.customers.factory, status: "succeeded", package_type: "website_factory", generator_version: "DCA_1_FRAGMENT_CERT", request_fingerprint: digest(`${runId}:factory-request`), idempotency_key: digest(`${runId}:factory-build`), generated_package: packages.factory, package_checksum: digest(`${runId}:factory-package`), created_by: "DCA_1_FRAGMENT_CERT", updated_by: "DCA_1_FRAGMENT_CERT" },
  ]);
  await insert("website_preview_versions", [
    { id: ids.previews.zip, demo_journey_id: ids.journeys.zip, build_job_id: ids.builds.zip, customer_id: null, project_id: null, version: 1, title: "DCA ZIP Studio", preview_url: `https://preview.invalid/${digest(`${runId}:zip-url`).slice(0, 24)}`, preview_token: digest(`${runId}:zip-preview`), is_active: true, generated_package: packages.zip, metadata: { fixture: "DCA_1_FRAGMENT_CERT", previewSource: "manual_zip" }, package_checksum: digest(`${runId}:zip-package`), created_by: "DCA_1_FRAGMENT_CERT" },
    { id: ids.previews.factory, demo_journey_id: ids.journeys.factory, build_job_id: ids.builds.factory, customer_id: ids.customers.factory, project_id: ids.projects.factory, version: 1, title: "DCA Factory Studio", preview_url: `https://preview.invalid/${digest(`${runId}:factory-url`).slice(0, 24)}`, preview_token: digest(`${runId}:factory-preview`), is_active: true, generated_package: packages.factory, metadata: { fixture: "DCA_1_FRAGMENT_CERT", previewSource: "website_factory" }, package_checksum: digest(`${runId}:factory-package`), created_by: "DCA_1_FRAGMENT_CERT" },
  ]);
  await insert("public_preview_publications", [
    { id: ids.publications.zip, relationship_type: "lead", relationship_id: ids.leads.zip, public_slug: `dca1-zip-${runId}`.slice(0, 64), preview_version_id: ids.previews.zip, enabled: true, created_by: ids.profiles.zip },
    { id: ids.publications.factory, relationship_type: "customer", relationship_id: ids.customers.factory, public_slug: `dca1-factory-${runId}`.slice(0, 64), preview_version_id: ids.previews.factory, enabled: true, created_by: ids.profiles.factory },
  ]);
  const login = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: emails.admin, password: admin.password }) });
  const loginData = await login.json();
  if (!login.ok || !loginData.access_token) throw new Error("Temporary staging admin login failed.");
  adminBearer = loginData.access_token;
}

async function certifyApi() {
  const network = await fetch(`${deployUrl}/start`, { redirect: "manual" });
  evidence.assertions.initialRequestIsTokenFree = network.status === 200 && new URL(network.url).pathname === "/start";
  evidence.assertions.noStore = /no-store/.test(network.headers.get("cache-control") || "");

  const wrong = await callFunction("client-activation-exchange", { token: "0".repeat(64) });
  const tampered = await callFunction("client-activation-exchange", { token: "z".repeat(64) });
  const oversized = await callFunction("client-activation-exchange", `{"token":"${"a".repeat(1100)}"}`);
  const wrongOrigin = await callFunction("client-activation-exchange", { token: "1".repeat(64) }, { origin: "https://invalid.example" });
  const wrongMethod = await callFunction("client-activation-exchange", null, { method: "GET", contentType: "" });
  evidence.assertions.invalidTokenSafe = wrong.response.status === 404 && !JSON.stringify(wrong.data).includes("0".repeat(64));
  evidence.assertions.tamperedTokenSafe = tampered.response.status === 404;
  evidence.assertions.oversizedBodySafe = oversized.response.status === 400;
  evidence.assertions.originMismatchSafe = wrongOrigin.response.status === 400;
  evidence.assertions.methodMismatchSafe = wrongMethod.response.status === 405;

  const zipCreate = await adminAction("zip", "create");
  evidence.assertions.adminStatus = zipCreate.data.invitation?.status === "gereed";
  evidence.assertions.whatsAppIsDeepLinkOnly = /^https:\/\/wa\.me\//.test(zipCreate.data.whatsappUrl || "");
  const zipExchange = await exchangeLink(zipCreate.data.oneTimeLink);
  const zipCookie = cookieHeader(zipExchange.cookie);
  evidence.assertions.exchangeSetsSafeCookie = zipExchange.response.status === 204
    && /HttpOnly/i.test(zipExchange.cookie) && /Secure/i.test(zipExchange.cookie)
    && /SameSite=Strict/i.test(zipExchange.cookie) && /Path=\//i.test(zipExchange.cookie)
    && !/Domain=/i.test(zipExchange.cookie) && !zipExchange.cookie.includes(zipExchange.token);
  const zipOpen = await context(zipCookie);
  const zipPreview = await context(zipCookie, "preview");
  evidence.assertions.zipPresentation = zipOpen.response.status === 200 && zipOpen.data.presentation?.firstName === "Ziva" && zipOpen.data.presentation?.companyName === "DCA ZIP Studio";
  evidence.assertions.zipPreview = zipPreview.response.status === 200 && zipPreview.data.preview?.html.includes("DCA ZIP STAGING CERT");
  evidence.assertions.minimalPayload = !JSON.stringify(zipOpen.data).includes(emails.zip) && !JSON.stringify(zipOpen.data).includes(ids.previews.zip);
  evidence.assertions.refreshViaCookie = (await context(zipCookie)).response.status === 200;
  evidence.assertions.missingCookieSafe = (await context("")).response.status === 401;
  const tamperedCookie = await context("__Host-mws_activation_staging=" + "f".repeat(64));
  evidence.assertions.tamperedCookieSafe = tamperedCookie.response.status !== 200 && /Max-Age=0/i.test(tamperedCookie.cookie);

  const rotated = await adminAction("zip", "rotate");
  evidence.assertions.rotationInvalidatesSession = (await context(zipCookie)).response.status !== 200;
  evidence.assertions.rotatedOldTokenRejected = (await exchangeLink(zipCreate.data.oneTimeLink)).response.status === 404;
  const rotatedExchange = await exchangeLink(rotated.data.oneTimeLink);
  const rotatedCookie = cookieHeader(rotatedExchange.cookie);
  const revoked = await adminAction("zip", "revoke");
  evidence.assertions.adminRevokeStatus = revoked.data.invitation?.status === "ingetrokken";
  evidence.assertions.revokeInvalidatesSession = (await context(rotatedCookie)).response.status !== 200;
  evidence.assertions.revokedTokenRejected = (await exchangeLink(rotated.data.oneTimeLink)).response.status === 404;

  const expiring = await adminAction("zip", "create");
  const expiringToken = expiring.data.oneTimeLink.split("#")[1];
  const expiringRows = await select("client_activation_links", `token_hash=eq.${digest(expiringToken)}&select=id,created_at&limit=1`);
  const forcedExpiry = new Date(new Date(expiringRows[0].created_at).getTime() + 1).toISOString();
  await patch("client_activation_links", `id=eq.${expiringRows[0].id}`, { expires_at: forcedExpiry });
  evidence.assertions.expiredTokenRejected = (await exchangeLink(expiring.data.oneTimeLink)).response.status === 404;

  const zipBound = await adminAction("zip", "create");
  const zipBoundExchange = await exchangeLink(zipBound.data.oneTimeLink);
  const zipBoundCookie = cookieHeader(zipBoundExchange.cookie);
  await patch("public_preview_publications", `id=eq.${ids.publications.zip}`, { preview_version_id: ids.previews.factory });
  evidence.assertions.previewMismatchRejected = (await context(zipBoundCookie, "preview")).response.status !== 200;
  await patch("public_preview_publications", `id=eq.${ids.publications.zip}`, { preview_version_id: ids.previews.zip });

  const factoryCreate = await adminAction("factory", "create");
  const factoryExchange = await exchangeLink(factoryCreate.data.oneTimeLink);
  const factoryCookie = cookieHeader(factoryExchange.cookie);
  const factoryOpen = await context(factoryCookie);
  const factoryPreview = await context(factoryCookie, "preview");
  evidence.assertions.factoryPresentation = factoryOpen.response.status === 200 && factoryOpen.data.presentation?.companyName === "DCA Factory Studio";
  evidence.assertions.factoryPreview = factoryPreview.response.status === 200 && factoryPreview.data.preview?.html.includes("DCA FACTORY STAGING CERT") && !factoryPreview.data.preview?.html.includes("DCA ZIP STAGING CERT");
  await patch("public_preview_publications", `id=eq.${ids.publications.factory}`, { enabled: false, revoked_at: new Date().toISOString() });
  evidence.assertions.revokedPublicationRejected = (await context(factoryCookie)).response.status !== 200;
  await patch("public_preview_publications", `id=eq.${ids.publications.factory}`, { enabled: true, revoked_at: null });

  const browserReady = await adminAction("zip", "rotate");
  browserLink = browserReady.data.oneTimeLink;
  browserActivationLinkId = [...activationLinkIds].at(-1);
}

async function certifySecretAbsence() {
  evidence.stage = "certify_secret_absence";
  const allSecrets = [...secrets, ...sessionSecrets];
  const createdSince = encodeURIComponent(evidence.startedAt);
  const [links, sessions, invitationRows, emailAudit, outboxAudit, timelineAudit] = await Promise.all([
    select("client_activation_links", `lead_id=in.(${Object.values(ids.leads).join(",")})&select=*`),
    activationLinkIds.size ? select("client_activation_exchange_sessions", `activation_link_id=in.(${[...activationLinkIds].join(",")})&select=*`) : [],
    invitations.size ? select("lead_demo_invitations", `id=in.(${[...invitations].join(",")})&select=*`) : [],
    optionalSelect("email_logs", `created_at=gte.${createdSince}&select=*`),
    optionalSelect("automation_outbox", `created_at=gte.${createdSince}&select=*`),
    optionalSelect("customer_timeline_events", `created_at=gte.${createdSince}&select=*`),
  ]);
  evidence.logSurfaces = {
    emailLogs: emailAudit.present ? "checked" : "not_present",
    automationOutbox: outboxAudit.present ? "checked" : "not_present",
    customerTimelineEvents: timelineAudit.present ? "checked" : "not_present",
  };
  const emailLogs = emailAudit.rows;
  const outbox = outboxAudit.rows;
  const timeline = timelineAudit.rows;
  const persistedAuditText = JSON.stringify({ links, sessions, invitationRows, emailLogs, outbox, timeline });
  evidence.assertions.noRawTokenPersisted = allSecrets.every((secret) => !persistedAuditText.includes(secret));

  const [exchangeSource, startSource, browserSource] = await Promise.all([
    fs.readFile(path.join(root, "functions/client-activation-exchange.js"), "utf8"),
    fs.readFile(path.join(root, "functions/client-activation-start.js"), "utf8"),
    fs.readFile(path.join(root, "public/src/dca-start.js"), "utf8"),
  ]);
  const sensitiveRuntimeSource = `${exchangeSource}\n${startSource}`;
  evidence.assertions.exchangeCodePathDoesNotLog = !/console\s*\.|logger\s*\.|\.log\s*\(/.test(sensitiveRuntimeSource);
  evidence.assertions.browserCodeHasNoSecretStorage = !/(localStorage|sessionStorage|indexedDB|document\.cookie)/.test(browserSource);
  evidence.assertions.browserBundleHasNoServiceRoleKey = !browserSource.includes(serviceKey) && !/SUPABASE_SERVICE_ROLE_KEY/.test(browserSource);
}

async function waitForBrowser() {
  let complete;
  const completion = new Promise((resolve) => { complete = resolve; });
  handoffServer = http.createServer((request, response) => {
    if (request.url === "/handoff") {
      response.writeHead(302, { Location: browserLink, "Cache-Control": "no-store" });
      response.end();
      return;
    }
    if (request.url === "/complete") {
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      complete();
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise((resolve) => handoffServer.listen(0, "127.0.0.1", resolve));
  const port = handoffServer.address().port;
  process.stdout.write(`${JSON.stringify({ status: "READY_FOR_BROWSER", port, runIdHash: evidence.runIdHash })}\n`);
  await Promise.race([completion, new Promise((_, reject) => setTimeout(() => reject(new Error("Browser certification timed out.")), 20 * 60_000))]);
  handoffServer.close();
  const sessions = await select("client_activation_exchange_sessions", `activation_link_id=eq.${browserActivationLinkId}&revoked_at=is.null&select=id,last_used_at`);
  evidence.assertions.browserCreatedExchangeSession = sessions.length === 1 && Boolean(sessions[0].last_used_at);
}

try {
  await buildFixtures();
  await certifyApi();
  await waitForBrowser();
  await certifySecretAbsence();
  const failed = Object.entries(evidence.assertions).filter(([, value]) => value !== true).map(([key]) => key);
  if (failed.length) throw new Error(`Assertions failed: ${failed.join(", ")}`);
  evidence.status = "PASS";
} catch (error) {
  evidence.status = "FAIL";
  evidence.failure = String(error.message || error).replace(/[0-9a-f]{64}/gi, "[REDACTED]");
} finally {
  if (handoffServer?.listening) handoffServer.close();
  for (let index = 0; index < secrets.length; index += 1) secrets[index] = "[REDACTED]";
  for (let index = 0; index < sessionSecrets.length; index += 1) sessionSecrets[index] = "[REDACTED]";
  adminBearer = "[REDACTED]";
  browserLink = "[REDACTED]";
  await cleanup();
  evidence.completedAt = new Date().toISOString();
  await fs.writeFile(path.join(root, "docs/evidence/dca-1-admin-invitation/FRAGMENT_EXCHANGE_STAGING_CERTIFICATION.json"), `${JSON.stringify(evidence, null, 2)}\n`);
}

if (evidence.status !== "PASS" || evidence.cleanup.completed !== true) throw new Error(`DCA-1 deployed certification ${evidence.status}; cleanup=${evidence.cleanup.completed}.`);
process.stdout.write(`${JSON.stringify({ status: evidence.status, assertions: Object.keys(evidence.assertions).length, cleanup: evidence.cleanup.completed })}\n`);
