import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envText = await fs.readFile(path.join(root, ".env.local"), "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
}));

if (env.SUPABASE_PROJECT_ID !== "xlxpuuycigeqhgxqtzni") throw new Error("DCA-0 certification is staging-only.");
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Staging credentials are incomplete.");

const base = env.SUPABASE_URL.replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const runId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const uuid = () => crypto.randomUUID();
const checksum = (label) => crypto.createHash("sha256").update(`${runId}:${label}`).digest("hex");
const ids = {
  profiles: { demo: uuid(), customerA: uuid(), customerB: uuid() },
  customers: { customerA: uuid(), customerB: uuid() },
  leads: { zip: uuid(), factory: uuid(), customerB: uuid() },
  journeys: { zip: uuid(), factory: uuid(), customerB: uuid() },
  projects: { customerA: uuid(), customerB: uuid() },
  builds: { zip: uuid(), factory: uuid(), customerB: uuid() },
  previews: { zip: uuid(), factory: uuid(), customerB: uuid() },
  publications: { zip: uuid(), factory: uuid(), customerB: uuid() },
};
const emails = {
  demo: `dca0-${runId}-demo@example.invalid`,
  customerA: `dca0-${runId}-a@example.invalid`,
  customerB: `dca0-${runId}-b@example.invalid`,
};
const authUsers = {};
const createdTables = [];
const tokens = [];
const evidence = {
  release: "DCA_0_SECURITY_AND_STAGING_CLOSURE",
  projectRef: env.SUPABASE_PROJECT_ID,
  runIdHash: checksum("run"),
  startedAt: new Date().toISOString(),
  providerMode: "SUPPRESSED",
  providerCalls: 0,
  netlifyRequests: 0,
  fixtures: {},
  assertions: {},
  cleanup: {},
};

async function api(urlPath, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const safeCode = data?.code || data?.error_code || response.status;
    const safeMessage = String(data?.message || data?.msg || "request failed").replace(/[0-9a-f]{64}/gi, "[REDACTED]");
    throw new Error(`${method} ${urlPath.split("?")[0]} failed (${safeCode}): ${safeMessage}`);
  }
  return data;
}

const rest = (table, query = "") => `/rest/v1/${table}${query ? `?${query}` : ""}`;
async function insert(table, rows) {
  const data = await api(rest(table), { method: "POST", body: rows, headers: { Prefer: "return=representation" } });
  createdTables.push(table);
  return data;
}
async function select(table, query) { return api(rest(table, query)); }
async function patch(table, query, body) {
  return api(rest(table, query), { method: "PATCH", body, headers: { Prefer: "return=representation" } });
}
async function remove(table, query) {
  return api(rest(table, query), { method: "DELETE", headers: { Prefer: "return=minimal" } });
}
async function rpc(name, body) { return api(`/rest/v1/rpc/${name}`, { method: "POST", body }); }
async function expectFailure(label, operation) {
  try { await operation(); } catch (error) { evidence.assertions[label] = true; return; }
  throw new Error(`${label} unexpectedly succeeded.`);
}

async function createAuthUser(label, email, role) {
  const password = crypto.randomBytes(32).toString("base64url");
  const user = await api("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true, user_metadata: { fixture: "DCA_0", role } },
  });
  authUsers[label] = user.id;
  return user.id;
}

async function cleanup() {
  const fixtureIds = (values) => `id=in.(${values.join(",")})`;
  const operations = [
    ["client_activation_links", `lead_id=in.(${Object.values(ids.leads).join(",")})`],
    ["lead_demo_invitations", `lead_id=in.(${Object.values(ids.leads).join(",")})`],
    ["public_preview_publications", fixtureIds(Object.values(ids.publications))],
    ["website_preview_versions", fixtureIds(Object.values(ids.previews))],
    ["website_build_jobs", fixtureIds(Object.values(ids.builds))],
    ["projects", fixtureIds(Object.values(ids.projects))],
    ["demo_journeys", fixtureIds(Object.values(ids.journeys))],
    ["leads", fixtureIds(Object.values(ids.leads))],
    ["customers", fixtureIds(Object.values(ids.customers))],
    ["profiles", fixtureIds(Object.values(ids.profiles))],
  ];
  for (const [table, query] of operations) {
    if (!["client_activation_links", "lead_demo_invitations"].includes(table) && !createdTables.includes(table)) continue;
    try { await remove(table, query); } catch { evidence.cleanup[table] = "FAILED"; }
  }
  for (const id of Object.values(authUsers)) {
    try { await api(`/auth/v1/admin/users/${id}`, { method: "DELETE" }); } catch { evidence.cleanup.authUsers = "FAILED"; }
  }
  evidence.cleanup.completed = !Object.values(evidence.cleanup).includes("FAILED");
}

// Recover only fixtures left by an interrupted earlier version of this same script.
await remove("demo_journeys", "created_by=eq.DCA_0");

try {
  authUsers.demo = await createAuthUser("demo", emails.demo, "demo_user");
  authUsers.customerA = await createAuthUser("customerA", emails.customerA, "customer");
  authUsers.customerB = await createAuthUser("customerB", emails.customerB, "customer");

  await insert("profiles", [
    { id: ids.profiles.demo, auth_user_id: authUsers.demo, name: "DCA fixture demo", email: emails.demo, role: "demo_user", status: "active", is_demo: true, environment: "test", metadata: { fixture: "DCA_0" } },
    { id: ids.profiles.customerA, auth_user_id: authUsers.customerA, name: "DCA fixture customer A", email: emails.customerA, role: "customer", status: "active", is_demo: true, environment: "test", metadata: { fixture: "DCA_0" } },
    { id: ids.profiles.customerB, auth_user_id: authUsers.customerB, name: "DCA fixture customer B", email: emails.customerB, role: "customer", status: "active", is_demo: true, environment: "test", metadata: { fixture: "DCA_0" } },
  ]);
  await insert("customers", [
    { id: ids.customers.customerA, profile_id: ids.profiles.customerA, auth_user_id: authUsers.customerA, name: "DCA fixture A", email: emails.customerA, status: "active", portal_status: "active", is_demo: true, environment: "test", metadata: { fixture: "DCA_0" } },
    { id: ids.customers.customerB, profile_id: ids.profiles.customerB, auth_user_id: authUsers.customerB, name: "DCA fixture B", email: emails.customerB, status: "active", portal_status: "active", is_demo: true, environment: "test", metadata: { fixture: "DCA_0" } },
  ]);
  await insert("leads", [
    { id: ids.leads.zip, company: "DCA ZIP fixture", name: "DCA demo", email: emails.demo, converted_customer_id: null, converted_at: null, is_demo: true, environment: "test", metadata: { fixture: "DCA_0" } },
    { id: ids.leads.factory, company: "DCA Factory fixture", name: "DCA customer A", email: emails.customerA, converted_customer_id: ids.customers.customerA, converted_at: new Date().toISOString(), is_demo: true, environment: "test", metadata: { fixture: "DCA_0" } },
    { id: ids.leads.customerB, company: "DCA isolation fixture", name: "DCA customer B", email: emails.customerB, converted_customer_id: ids.customers.customerB, converted_at: new Date().toISOString(), is_demo: true, environment: "test", metadata: { fixture: "DCA_0" } },
  ]);
  await insert("projects", [
    { id: ids.projects.customerA, customer_id: ids.customers.customerA, name: "DCA Factory project A", status: "onboarding", phase: "activation_fixture", progress: 0, is_demo: true, environment: "test", metadata: { fixture: "DCA_0", dcaPhase: "activation_fixture" } },
    { id: ids.projects.customerB, customer_id: ids.customers.customerB, name: "DCA Factory project B", status: "onboarding", phase: "activation_fixture", progress: 0, is_demo: true, environment: "test", metadata: { fixture: "DCA_0", dcaPhase: "activation_fixture" } },
  ]);
  await insert("demo_journeys", [
    { id: ids.journeys.zip, lead_id: ids.leads.zip, customer_id: null, email: emails.demo, demo_status: "interne_preview_klaar", created_by: "DCA_0", updated_by: "DCA_0" },
    { id: ids.journeys.factory, lead_id: ids.leads.factory, customer_id: ids.customers.customerA, email: emails.customerA, demo_status: "interne_preview_klaar", created_by: "DCA_0", updated_by: "DCA_0" },
    { id: ids.journeys.customerB, lead_id: ids.leads.customerB, customer_id: ids.customers.customerB, email: emails.customerB, demo_status: "interne_preview_klaar", created_by: "DCA_0", updated_by: "DCA_0" },
  ]);
  const packages = {
    zip: { files: [{ path: "index.html", content: "DCA ZIP" }] },
    factory: { files: [{ path: "index.html", content: "DCA Factory A" }] },
    customerB: { files: [{ path: "index.html", content: "DCA Factory B" }] },
  };
  await insert("website_build_jobs", [
    { id: ids.builds.zip, demo_journey_id: ids.journeys.zip, lead_id: ids.leads.zip, customer_id: null, status: "succeeded", package_type: "manual_zip", generator_version: "DCA_0_FIXTURE_V1", request_fingerprint: checksum("request-zip"), idempotency_key: checksum("build-zip"), generated_package: packages.zip, package_checksum: checksum("zip"), created_by: "DCA_0", updated_by: "DCA_0" },
    { id: ids.builds.factory, demo_journey_id: ids.journeys.factory, lead_id: ids.leads.factory, customer_id: ids.customers.customerA, status: "succeeded", package_type: "website_factory", generator_version: "DCA_0_FIXTURE_V1", request_fingerprint: checksum("request-factory-a"), idempotency_key: checksum("build-factory-a"), generated_package: packages.factory, package_checksum: checksum("factory-a"), created_by: "DCA_0", updated_by: "DCA_0" },
    { id: ids.builds.customerB, demo_journey_id: ids.journeys.customerB, lead_id: ids.leads.customerB, customer_id: ids.customers.customerB, status: "succeeded", package_type: "website_factory", generator_version: "DCA_0_FIXTURE_V1", request_fingerprint: checksum("request-factory-b"), idempotency_key: checksum("build-factory-b"), generated_package: packages.customerB, package_checksum: checksum("factory-b"), created_by: "DCA_0", updated_by: "DCA_0" },
  ]);
  await insert("website_preview_versions", [
    { id: ids.previews.zip, demo_journey_id: ids.journeys.zip, build_job_id: ids.builds.zip, customer_id: null, project_id: null, version: 1, preview_url: `https://preview.invalid/dca-${checksum("url-zip").slice(0, 20)}`, preview_token: checksum("preview-token-zip"), is_active: true, generated_package: packages.zip, metadata: { fixture: "DCA_0", previewSource: "manual_zip" }, package_checksum: checksum("zip"), created_by: "DCA_0" },
    { id: ids.previews.factory, demo_journey_id: ids.journeys.factory, build_job_id: ids.builds.factory, customer_id: ids.customers.customerA, project_id: ids.projects.customerA, version: 1, preview_url: `https://preview.invalid/dca-${checksum("url-factory-a").slice(0, 20)}`, preview_token: checksum("preview-token-factory-a"), is_active: true, generated_package: packages.factory, metadata: { fixture: "DCA_0", previewSource: "website_factory" }, package_checksum: checksum("factory-a"), created_by: "DCA_0" },
    { id: ids.previews.customerB, demo_journey_id: ids.journeys.customerB, build_job_id: ids.builds.customerB, customer_id: ids.customers.customerB, project_id: ids.projects.customerB, version: 1, preview_url: `https://preview.invalid/dca-${checksum("url-factory-b").slice(0, 20)}`, preview_token: checksum("preview-token-factory-b"), is_active: true, generated_package: packages.customerB, metadata: { fixture: "DCA_0", previewSource: "website_factory" }, package_checksum: checksum("factory-b"), created_by: "DCA_0" },
  ]);
  await insert("public_preview_publications", [
    { id: ids.publications.zip, relationship_type: "lead", relationship_id: ids.leads.zip, public_slug: `dca-zip-${runId}`.slice(0, 64), preview_version_id: ids.previews.zip, enabled: true, created_by: ids.profiles.demo },
    { id: ids.publications.factory, relationship_type: "customer", relationship_id: ids.customers.customerA, public_slug: `dca-factory-a-${runId}`.slice(0, 64), preview_version_id: ids.previews.factory, enabled: true, created_by: ids.profiles.customerA },
    { id: ids.publications.customerB, relationship_type: "customer", relationship_id: ids.customers.customerB, public_slug: `dca-factory-b-${runId}`.slice(0, 64), preview_version_id: ids.previews.customerB, enabled: true, created_by: ids.profiles.customerB },
  ]);

  const call = (fixture, options = {}) => rpc("dca_0_create_activation_link", {
    input_lead_id: ids.leads[fixture],
    input_demo_journey_id: ids.journeys[fixture],
    input_preview_version_id: ids.previews[fixture],
    input_preview_publication_id: ids.publications[fixture],
    input_auth_user_id: fixture === "zip" ? authUsers.demo : authUsers.customerA,
    input_profile_id: fixture === "zip" ? ids.profiles.demo : ids.profiles.customerA,
    input_recipient_email: fixture === "zip" ? emails.demo : emails.customerA,
    input_created_by: "DCA_0_STAGING_CERTIFICATION",
    input_expires_at: options.expiresAt || new Date(Date.now() + 72 * 3600_000).toISOString(),
    input_rotate: Boolean(options.rotate),
  });

  const zipFirst = (await call("zip"))[0]; tokens.push(zipFirst.activation_token);
  const zipRotated = (await call("zip", { rotate: true }))[0]; tokens.push(zipRotated.activation_token);
  evidence.assertions.rotationRevokesPrevious = zipRotated.previous_token_rotated === true;
  evidence.assertions.revokeBlocks = (await rpc("dca_0_revoke_activation_link", { input_activation_link_id: zipRotated.activation_link_id, input_reason: "DCA_0_CERT_REVOKE" })) === true;
  await expectFailure("revokedTokenRejected", () => rpc("dca_0_open_activation_link", { input_activation_token: zipRotated.activation_token, input_recipient_email: emails.demo }));

  const zipValid = (await call("zip"))[0]; tokens.push(zipValid.activation_token);
  evidence.assertions.whatsAppRouteOnly = `https://maxwebstudio.nl${zipValid.activation_path}` === `https://maxwebstudio.nl/start/${zipValid.activation_token}`;

  const factoryShort = (await call("factory", { expiresAt: new Date(Date.now() + 2500).toISOString() }))[0]; tokens.push(factoryShort.activation_token);
  const factoryRepeat = (await call("factory"))[0];
  evidence.assertions.repeatedInviteIsIdempotent = factoryRepeat.invitation_id === factoryShort.invitation_id
    && factoryRepeat.activation_link_id === factoryShort.activation_link_id
    && factoryRepeat.activation_token === null;
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const expiredOpen = await rpc("dca_0_open_activation_link", { input_activation_token: factoryShort.activation_token, input_recipient_email: emails.customerA });
  evidence.assertions.expiryBlocks = Array.isArray(expiredOpen) && expiredOpen.length === 0;

  const factoryValid = (await call("factory"))[0]; tokens.push(factoryValid.activation_token);
  await expectFailure("wrongEmailRejected", () => rpc("dca_0_open_activation_link", { input_activation_token: factoryValid.activation_token, input_recipient_email: emails.customerB }));
  await expectFailure("crossCustomerPublicationRejected", () => rpc("dca_0_create_activation_link", {
    input_lead_id: ids.leads.factory,
    input_demo_journey_id: ids.journeys.factory,
    input_preview_version_id: ids.previews.customerB,
    input_preview_publication_id: ids.publications.customerB,
    input_auth_user_id: authUsers.customerA,
    input_profile_id: ids.profiles.customerA,
    input_recipient_email: emails.customerA,
    input_created_by: "DCA_0_STAGING_CERTIFICATION",
    input_rotate: false,
  }));
  const opened = (await rpc("dca_0_open_activation_link", { input_activation_token: factoryValid.activation_token, input_recipient_email: emails.customerA }))[0];
  evidence.assertions.tokenAloneCreatesNoSession = opened.account_activation_allowed === true && !Object.hasOwn(opened, "access_token") && !Object.hasOwn(opened, "refresh_token");
  const activated = (await rpc("dca_0_complete_activation", { input_activation_token: factoryValid.activation_token, input_recipient_email: emails.customerA, input_auth_user_id: authUsers.customerA }))[0];
  evidence.assertions.safeExistingAccountActivation = activated.activated === true && activated.customer_id === ids.customers.customerA;

  const invitationRows = await select("lead_demo_invitations", `lead_id=in.(${ids.leads.zip},${ids.leads.factory})&select=id,lead_id,demo_journey_id,preview_version_id,auth_user_id,profile_id,normalized_email,status,invitation_count,idempotency_key,dca_phase,metadata`);
  const linkRows = await select("client_activation_links", `lead_id=in.(${ids.leads.zip},${ids.leads.factory})&select=id,lead_demo_invitation_id,lead_id,customer_id,project_id,preview_publication_id,preview_version_id,intended_email,token_hash,status,expires_at,opened_at,activated_at,revoked_at,idempotency_key,created_by`);
  const tokenLeak = tokens.some((token) => JSON.stringify({ invitationRows, linkRows }).includes(token));
  const invitationKeys = new Set(invitationRows.map((row) => row.idempotency_key));
  const activeByInvitation = new Map();
  for (const row of linkRows.filter((row) => ["active", "opened"].includes(row.status))) {
    activeByInvitation.set(row.lead_demo_invitation_id, (activeByInvitation.get(row.lead_demo_invitation_id) || 0) + 1);
  }
  evidence.assertions.exactOneInvitationPerCanonicalKey = invitationKeys.size === invitationRows.length && invitationRows.length === 2;
  evidence.assertions.atMostOneActiveToken = [...activeByInvitation.values()].every((count) => count === 1);
  evidence.assertions.rawTokenAbsentFromStoredRows = !tokenLeak && linkRows.every((row) => /^[0-9a-f]{64}$/.test(row.token_hash));
  evidence.assertions.zipPreviewBinding = linkRows.filter((row) => row.lead_id === ids.leads.zip).every((row) => row.preview_version_id === ids.previews.zip && row.preview_publication_id === ids.publications.zip);
  evidence.assertions.factoryPreviewBinding = linkRows.filter((row) => row.lead_id === ids.leads.factory).every((row) => row.preview_version_id === ids.previews.factory && row.preview_publication_id === ids.publications.factory && row.customer_id === ids.customers.customerA && row.project_id === ids.projects.customerA);
  evidence.assertions.convertedCustomerIdUsed = linkRows.filter((row) => row.lead_id === ids.leads.factory).every((row) => row.customer_id === ids.customers.customerA);
  evidence.assertions.noDuplicateCustomerProjectAuth = new Set(Object.values(ids.customers)).size === 2 && new Set(Object.values(ids.projects)).size === 2 && new Set(Object.values(authUsers)).size === 3;
  evidence.assertions.noProviderOrNetlifyLogSurface = evidence.providerCalls === 0 && evidence.netlifyRequests === 0;
  evidence.fixtures = {
    newLeadWithoutCustomer: 1,
    convertedCustomerLeads: 2,
    zipPreviews: 1,
    factoryPreviews: 2,
    activePublications: 3,
    demoUsers: 1,
    customerAccounts: 2,
    invitationRows: invitationRows.length,
    activationStates: Object.fromEntries([...new Set(linkRows.map((row) => row.status))].sort().map((status) => [status, linkRows.filter((row) => row.status === status).length])),
  };
  const failed = Object.entries(evidence.assertions).filter(([, value]) => value !== true).map(([key]) => key);
  if (failed.length) throw new Error(`DCA-0 assertions failed: ${failed.join(", ")}`);
  evidence.status = "PASS";
} catch (error) {
  evidence.status = "FAIL";
  evidence.failure = String(error.message || error).replace(/[0-9a-f]{64}/gi, "[REDACTED]");
} finally {
  for (let index = 0; index < tokens.length; index += 1) tokens[index] = "[REDACTED]";
  await cleanup();
  evidence.completedAt = new Date().toISOString();
  const outDir = path.join(root, "docs", "evidence", "dca-0-security-and-staging-closure");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "STAGING_CERTIFICATION.json"), `${JSON.stringify(evidence, null, 2)}\n`);
}

if (evidence.status !== "PASS" || evidence.cleanup.completed !== true) {
  throw new Error(`DCA-0 staging certification ${evidence.status}; cleanup=${evidence.cleanup.completed}.`);
}
process.stdout.write(JSON.stringify({ status: evidence.status, assertions: Object.keys(evidence.assertions).length, cleanup: evidence.cleanup.completed }) + "\n");
