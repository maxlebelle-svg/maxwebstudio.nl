import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = process.env.CX2_STAGING_ENV_FILE || path.join(root, ".env.local");
const deployUrl = String(process.env.CX2_STAGING_DEPLOY_URL || "").replace(/\/$/, "");
const statePath = process.env.CX2_BROWSER_STATE_FILE || "/private/tmp/cx2-sprint3-browser-state.json";
const mode = process.argv[2] || "setup";
const envText = await fs.readFile(envPath, "utf8");
const env = { ...Object.fromEntries(envText.split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
  const split = line.indexOf("=");
  return [line.slice(0, split), line.slice(split + 1).replace(/^['"]|['"]$/g, "")];
})), ...process.env };

if (env.SUPABASE_PROJECT_ID !== "xlxpuuycigeqhgxqtzni") throw new Error("Callback browser certification is staging-only.");
if (!/^https:\/\/(?:[a-f0-9]{24}|cx2-sprint3-callback-closure)--mws-gold-review-2026-1-7q4k\.netlify\.app$/.test(deployUrl)) throw new Error("Unexpected staging deploy identity.");
if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Staging credentials are incomplete.");

const base = env.SUPABASE_URL.replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const uuid = () => crypto.randomUUID();
const digest = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const safeOut = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

async function api(pathname, { method = "GET", body, prefer = "" } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Staging fixture operation failed (${data?.code || response.status}).`);
  return data;
}
const rest = (table, query = "") => `/rest/v1/${table}${query ? `?${query}` : ""}`;
const insert = (table, body) => api(rest(table), { method: "POST", body, prefer: "return=representation" });
const select = (table, query) => api(rest(table, query));
const remove = (table, query) => api(rest(table, query), { method: "DELETE", prefer: "return=minimal" });
const rpc = (name, body) => api(`/rest/v1/rpc/${name}`, { method: "POST", body });

async function loadState() {
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  if (state.projectRef !== "xlxpuuycigeqhgxqtzni" || state.deployUrl !== deployUrl) throw new Error("Fixture identity mismatch.");
  return state;
}

async function cleanup(state) {
  const leadIds = Object.values(state.ids.leads).join(",");
  const customerIds = [state.ids.customers.other, ...(state.createdCustomerId ? [state.createdCustomerId] : [])].join(",");
  const operations = [
    ["cx2_magic_link_challenges", `activation_link_id=eq.${state.activationLinkId}`],
    ["client_activation_exchange_sessions", `activation_link_id=eq.${state.activationLinkId}`],
    ["client_activation_links", `lead_id=in.(${leadIds})`],
    ["lead_demo_invitations", `lead_id=in.(${leadIds})`],
    ["public_preview_publications", `id=in.(${Object.values(state.ids.publications).join(",")})`],
    ["website_preview_versions", `id=in.(${Object.values(state.ids.previews).join(",")})`],
    ["website_build_jobs", `id=in.(${Object.values(state.ids.builds).join(",")})`],
    ["projects", `id=eq.${state.ids.projects.other}`],
    ["demo_journeys", `id=in.(${Object.values(state.ids.journeys).join(",")})`],
    ["leads", `id=in.(${leadIds})`],
    ...(customerIds ? [["customers", `id=in.(${customerIds})`]] : []),
    ["profiles", `id=in.(${Object.values(state.ids.profiles).join(",")})`],
  ];
  const failures = [];
  for (const [table, query] of operations) {
    try { await remove(table, query); } catch { failures.push(table); }
  }
  for (const userId of Object.values(state.authUsers)) {
    try { await api(`/auth/v1/admin/users/${userId}`, { method: "DELETE" }); } catch { failures.push("auth_user"); }
  }
  const remaining = await select("leads", `id=in.(${leadIds})&select=id`);
  if (failures.length || remaining.length) throw new Error(`Fixture cleanup failed (${[...new Set(failures)].join(",") || "rows remain"}).`);
  await fs.rm(statePath, { force: true });
  safeOut({ status: "CLEAN", runHash: state.runHash, remainingFixtureRows: 0 });
}

if (mode === "cleanup") {
  await cleanup(await loadState());
  process.exit(0);
}

if (mode === "verify") {
  const state = await loadState();
  const [lead] = await select("leads", `id=eq.${state.ids.leads.primary}&select=converted_customer_id`);
  const [challenge] = await select("cx2_magic_link_challenges", `activation_link_id=eq.${state.activationLinkId}&select=status,verified_auth_user_id`);
  const [link] = await select("client_activation_links", `id=eq.${state.activationLinkId}&select=status,customer_id,activated_at`);
  const [invitation] = await select("lead_demo_invitations", `id=eq.${state.invitationId}&select=status,activated_at`);
  const [preview] = await select("website_preview_versions", `id=eq.${state.ids.previews.primary}&select=customer_id,project_id`);
  const [publication] = await select("public_preview_publications", `id=eq.${state.ids.publications.primary}&select=relationship_type,relationship_id,preview_version_id,enabled`);
  const customers = await select("customers", `auth_user_id=eq.${state.authUsers.primary}&select=id,profile_id`);
  const projects = await select("projects", `customer_id=eq.${link?.customer_id || uuid()}&select=id`);
  const assertions = {
    challengeConsumed: challenge?.status === "consumed" && challenge.verified_auth_user_id === state.authUsers.primary,
    linkActivated: link?.status === "activated" && Boolean(link.activated_at),
    invitationActivated: invitation?.status === "activated" && Boolean(invitation.activated_at),
    exactlyOneCustomer: customers.length === 1 && customers[0].id === link?.customer_id,
    convertedCustomerBound: lead?.converted_customer_id === link?.customer_id,
    previewTransferred: preview?.customer_id === link?.customer_id && preview?.project_id === null,
    publicationTransferred: publication?.relationship_type === "customer" && publication?.relationship_id === link?.customer_id && publication?.preview_version_id === state.ids.previews.primary && publication?.enabled === true,
    noProjectCreated: projects.length === 0,
  };
  const failed = Object.entries(assertions).filter(([, value]) => value !== true).map(([name]) => name);
  if (failed.length) throw new Error(`Callback browser poststate failed (${failed.join(",")}).`);
  state.createdCustomerId = link.customer_id;
  await fs.writeFile(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  safeOut({ status: "PASS", runHash: state.runHash, assertions: Object.keys(assertions).length, customerCount: customers.length, projectCount: projects.length });
  process.exit(0);
}

if (mode !== "setup") throw new Error("Expected setup, verify or cleanup.");

const run = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const ids = {
  profiles: { primary: uuid(), other: uuid() }, customers: { other: uuid() },
  leads: { primary: uuid(), other: uuid() }, journeys: { primary: uuid(), other: uuid() },
  projects: { other: uuid() }, builds: { primary: uuid(), other: uuid() },
  previews: { primary: uuid(), other: uuid() }, publications: { primary: uuid(), other: uuid() },
};
const emails = { primary: `cx2-browser-${run}-a@example.invalid`, other: `cx2-browser-${run}-b@example.invalid` };
const passwords = { primary: crypto.randomBytes(32).toString("base64url"), other: crypto.randomBytes(32).toString("base64url") };
const authUsers = {};
const state = { projectRef: env.SUPABASE_PROJECT_ID, deployUrl, runHash: digest(run), ids, authUsers, activationLinkId: "", invitationId: "", createdCustomerId: "", callbackUrl: "", otherCustomerId: ids.customers.other };

try {
  for (const label of ["primary", "other"]) {
    const user = await api("/auth/v1/admin/users", { method: "POST", body: { email: emails[label], password: passwords[label], email_confirm: true, user_metadata: { fixture: "CX2_CALLBACK_BROWSER", name: label === "primary" ? "Ziva Browser" : "Other Browser" } } });
    authUsers[label] = user.id;
  }
  await insert("profiles", [
    { id: ids.profiles.primary, auth_user_id: authUsers.primary, name: "Ziva Browser", email: emails.primary, role: "demo_user", status: "active", is_demo: true, environment: "test", metadata: { fixture: "CX2_CALLBACK_BROWSER" } },
    { id: ids.profiles.other, auth_user_id: authUsers.other, name: "Other Browser", email: emails.other, role: "customer", status: "active", is_demo: true, environment: "test", metadata: { fixture: "CX2_CALLBACK_BROWSER" } },
  ]);
  await insert("customers", { id: ids.customers.other, profile_id: ids.profiles.other, auth_user_id: authUsers.other, name: "CX2 Other Browser", email: emails.other, status: "active", portal_status: "active", is_demo: true, environment: "test", metadata: { fixture: "CX2_CALLBACK_BROWSER" } });
  await insert("leads", [
    { id: ids.leads.primary, company: "CX2 Browser Studio", name: "Ziva Browser", email: emails.primary, converted_customer_id: null, converted_at: null, is_demo: true, environment: "test", metadata: { fixture: "CX2_CALLBACK_BROWSER" } },
    { id: ids.leads.other, company: "CX2 Other Browser", name: "Other Browser", email: emails.other, converted_customer_id: ids.customers.other, converted_at: new Date().toISOString(), is_demo: true, environment: "test", metadata: { fixture: "CX2_CALLBACK_BROWSER" } },
  ]);
  await insert("projects", { id: ids.projects.other, customer_id: ids.customers.other, name: "CX2 Other Project", status: "onboarding", progress: 0, is_demo: true, environment: "test", metadata: { fixture: "CX2_CALLBACK_BROWSER" } });
  await insert("demo_journeys", [
    { id: ids.journeys.primary, lead_id: ids.leads.primary, customer_id: null, email: emails.primary, demo_status: "interne_preview_klaar", created_by: "CX2_CALLBACK_BROWSER", updated_by: "CX2_CALLBACK_BROWSER" },
    { id: ids.journeys.other, lead_id: ids.leads.other, customer_id: ids.customers.other, email: emails.other, demo_status: "interne_preview_klaar", created_by: "CX2_CALLBACK_BROWSER", updated_by: "CX2_CALLBACK_BROWSER" },
  ]);
  const packages = {
    primary: { files: [{ path: "index.html", content: "<!doctype html><html><body><h1>CX2 BROWSER CUSTOMER A</h1></body></html>" }] },
    other: { files: [{ path: "index.html", content: "<!doctype html><html><body><h1>CX2 BROWSER CUSTOMER B</h1></body></html>" }] },
  };
  await insert("website_build_jobs", [
    { id: ids.builds.primary, demo_journey_id: ids.journeys.primary, lead_id: ids.leads.primary, customer_id: null, status: "succeeded", package_type: "manual_zip", generator_version: "CX2_CALLBACK_BROWSER", request_fingerprint: digest(`${run}:request-a`), idempotency_key: digest(`${run}:build-a`), generated_package: packages.primary, package_checksum: digest(`${run}:package-a`), created_by: "CX2_CALLBACK_BROWSER", updated_by: "CX2_CALLBACK_BROWSER" },
    { id: ids.builds.other, demo_journey_id: ids.journeys.other, lead_id: ids.leads.other, customer_id: ids.customers.other, status: "succeeded", package_type: "website_factory", generator_version: "CX2_CALLBACK_BROWSER", request_fingerprint: digest(`${run}:request-b`), idempotency_key: digest(`${run}:build-b`), generated_package: packages.other, package_checksum: digest(`${run}:package-b`), created_by: "CX2_CALLBACK_BROWSER", updated_by: "CX2_CALLBACK_BROWSER" },
  ]);
  await insert("website_preview_versions", [
    { id: ids.previews.primary, demo_journey_id: ids.journeys.primary, build_job_id: ids.builds.primary, customer_id: null, project_id: null, version: 1, title: "CX2 Browser Studio", preview_url: "https://preview.invalid/cx2-browser-a", preview_token: digest(`${run}:preview-a`), is_active: true, generated_package: packages.primary, metadata: { fixture: "CX2_CALLBACK_BROWSER", previewSource: "manual_zip" }, package_checksum: digest(`${run}:package-a`), created_by: "CX2_CALLBACK_BROWSER" },
    { id: ids.previews.other, demo_journey_id: ids.journeys.other, build_job_id: ids.builds.other, customer_id: ids.customers.other, project_id: ids.projects.other, version: 1, title: "CX2 Other Browser", preview_url: "https://preview.invalid/cx2-browser-b", preview_token: digest(`${run}:preview-b`), is_active: true, generated_package: packages.other, metadata: { fixture: "CX2_CALLBACK_BROWSER", previewSource: "website_factory" }, package_checksum: digest(`${run}:package-b`), created_by: "CX2_CALLBACK_BROWSER" },
  ]);
  await insert("public_preview_publications", [
    { id: ids.publications.primary, relationship_type: "lead", relationship_id: ids.leads.primary, public_slug: `cx2-browser-a-${run}`.slice(0, 64), preview_version_id: ids.previews.primary, enabled: true, created_by: ids.profiles.primary },
    { id: ids.publications.other, relationship_type: "customer", relationship_id: ids.customers.other, public_slug: `cx2-browser-b-${run}`.slice(0, 64), preview_version_id: ids.previews.other, enabled: true, created_by: ids.profiles.other },
  ]);
  const activation = (await rpc("dca_0_create_activation_link", {
    input_lead_id: ids.leads.primary, input_demo_journey_id: ids.journeys.primary,
    input_preview_version_id: ids.previews.primary, input_preview_publication_id: ids.publications.primary,
    input_auth_user_id: authUsers.primary, input_profile_id: ids.profiles.primary,
    input_recipient_email: emails.primary, input_created_by: "CX2_CALLBACK_BROWSER",
    input_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(), input_rotate: false,
  }))[0];
  state.activationLinkId = activation.activation_link_id;
  state.invitationId = activation.invitation_id;
  const exchangeSecret = crypto.randomBytes(32).toString("hex");
  await rpc("dca_1_exchange_activation_token", { input_activation_token: activation.activation_token, input_session_hash: digest(exchangeSecret), input_correlation_id: uuid(), input_expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
  const rawState = crypto.randomBytes(32).toString("hex");
  const challenge = (await rpc("cx2_prepare_magic_link", { input_session_hash: digest(exchangeSecret), input_state_hash: digest(rawState), input_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }))[0];
  await rpc("cx2_mark_magic_link_sent", { input_challenge_id: challenge.challenge_id });
  const login = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: emails.primary, password: passwords.primary }) });
  const session = await login.json();
  if (!login.ok || !session.access_token || !session.refresh_token) throw new Error("Staging fixture login failed.");
  const callback = new URL("/start", deployUrl);
  callback.searchParams.set("cx2", "callback");
  callback.searchParams.set("state", rawState);
  callback.hash = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: String(session.expires_in || 3600), token_type: "bearer", type: "magiclink" }).toString();
  state.callbackUrl = callback.toString();
  await fs.writeFile(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  safeOut({ status: "READY", runHash: state.runHash, projectRef: state.projectRef, providerMode: "SUPPRESSED" });
} catch (error) {
  try { await fs.writeFile(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 }); await cleanup(state); } catch { /* preserve original failure */ }
  throw error;
}
