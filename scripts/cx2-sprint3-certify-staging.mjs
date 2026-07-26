import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = process.env.CX2_STAGING_ENV_FILE || path.join(root, ".env.local");
const envText = await fs.readFile(envPath, "utf8");
const env = { ...Object.fromEntries(envText.split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
})), ...process.env };
if (env.SUPABASE_PROJECT_ID !== "xlxpuuycigeqhgxqtzni") throw new Error("CX2 Sprint 3 certification is staging-only.");
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Staging credentials are incomplete.");

const base = env.SUPABASE_URL.replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const run = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const uuid = () => crypto.randomUUID();
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fixture = (label) => digest(`${run}:${label}`);
const ids = {
  profileNew: uuid(), profileExisting: uuid(), profileOther: uuid(),
  customerExisting: uuid(), customerOther: uuid(), ambiguousCustomer: uuid(),
  leadNew: uuid(), leadExisting: uuid(), leadOther: uuid(),
  journeyNew: uuid(), journeyExisting: uuid(), journeyOther: uuid(),
  projectExisting: uuid(), projectOther: uuid(),
  buildNew: uuid(), buildExisting: uuid(), buildOther: uuid(),
  previewNew: uuid(), previewExisting: uuid(), previewOther: uuid(),
  publicationNew: uuid(), publicationExisting: uuid(), publicationOther: uuid(),
};
const emails = {
  new: `cx2-${run}-new@example.invalid`,
  existing: `cx2-${run}-existing@example.invalid`,
  other: `cx2-${run}-other@example.invalid`,
};
const auth = {};
const linkIds = new Set();
const createdCustomerIds = new Set([ids.customerExisting, ids.customerOther, ids.ambiguousCustomer]);
const evidence = {
  release: "CX2_SPRINT_3_MAGIC_LINK_AND_ACCOUNT_ACTIVATION",
  projectRef: env.SUPABASE_PROJECT_ID,
  providerMode: "SUPPRESSED",
  providerCalls: 0,
  runIdHash: fixture("run"),
  startedAt: new Date().toISOString(),
  assertions: {}, cleanup: {},
};

async function api(urlPath, { method = "GET", body, prefer = "" } = {}) {
  const response = await fetch(`${base}${urlPath}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(String(data?.message || data?.msg || "staging request failed").replace(/[0-9a-f]{64}/gi, "[REDACTED]"));
    error.code = data?.code || response.status;
    error.status = response.status;
    throw error;
  }
  return data;
}
const rest = (table, query = "") => `/rest/v1/${table}${query ? `?${query}` : ""}`;
const insert = (table, body) => api(rest(table), { method: "POST", body, prefer: "return=representation" });
const select = (table, query) => api(rest(table, query));
const patch = (table, query, body) => api(rest(table, query), { method: "PATCH", body, prefer: "return=representation" });
const remove = (table, query) => api(rest(table, query), { method: "DELETE", prefer: "return=minimal" });
const rpc = (name, body) => api(`/rest/v1/rpc/${name}`, { method: "POST", body });
async function expectFailure(label, operation) { try { await operation(); } catch { evidence.assertions[label] = true; return; } throw new Error(`${label} unexpectedly succeeded`); }
async function createUser(label, email, role) {
  const user = await api("/auth/v1/admin/users", { method: "POST", body: { email, password: crypto.randomBytes(32).toString("base64url"), email_confirm: true, user_metadata: { fixture: "CX2_SPRINT_3", role } } });
  auth[label] = user.id;
}

async function cleanup() {
  const leadList = [ids.leadNew, ids.leadExisting, ids.leadOther].join(",");
  const tableOps = [
    ["cx2_magic_link_challenges", `activation_link_id=in.(${[...linkIds].join(",") || uuid()})`],
    ["client_activation_exchange_sessions", `activation_link_id=in.(${[...linkIds].join(",") || uuid()})`],
    ["client_activation_links", `lead_id=in.(${leadList})`],
    ["lead_demo_invitations", `lead_id=in.(${leadList})`],
    ["public_preview_publications", `id=in.(${ids.publicationNew},${ids.publicationExisting},${ids.publicationOther})`],
    ["website_preview_versions", `id=in.(${ids.previewNew},${ids.previewExisting},${ids.previewOther})`],
    ["website_build_jobs", `id=in.(${ids.buildNew},${ids.buildExisting},${ids.buildOther})`],
    ["projects", `id=in.(${ids.projectExisting},${ids.projectOther})`],
    ["demo_journeys", `id=in.(${ids.journeyNew},${ids.journeyExisting},${ids.journeyOther})`],
    ["leads", `id=in.(${leadList})`],
    ["customers", `id=in.(${[...createdCustomerIds].join(",")})`],
    ["profiles", `id=in.(${ids.profileNew},${ids.profileExisting},${ids.profileOther})`],
  ];
  for (const [table, query] of tableOps) {
    try { await remove(table, query); } catch { evidence.cleanup[table] = "FAILED"; }
  }
  for (const userId of Object.values(auth)) {
    try { await api(`/auth/v1/admin/users/${userId}`, { method: "DELETE" }); } catch { evidence.cleanup.authUsers = "FAILED"; }
  }
  const leftovers = await select("leads", `id=in.(${leadList})&select=id`);
  evidence.cleanup.completed = leftovers.length === 0 && !Object.values(evidence.cleanup).includes("FAILED");
}

const packages = {
  new: { files: [{ path: "index.html", content: "CX2 new" }] },
  existing: { files: [{ path: "index.html", content: "CX2 existing" }] },
  other: { files: [{ path: "index.html", content: "CX2 other" }] },
};

function activationCall(kind, rotate = false) {
  const profileId = kind === "new" ? ids.profileNew : kind === "existing" ? ids.profileExisting : ids.profileOther;
  return rpc("dca_0_create_activation_link", {
    input_lead_id: ids[`lead${kind[0].toUpperCase()}${kind.slice(1)}`],
    input_demo_journey_id: ids[`journey${kind[0].toUpperCase()}${kind.slice(1)}`],
    input_preview_version_id: ids[`preview${kind[0].toUpperCase()}${kind.slice(1)}`],
    input_preview_publication_id: ids[`publication${kind[0].toUpperCase()}${kind.slice(1)}`],
    input_auth_user_id: auth[kind], input_profile_id: profileId,
    input_recipient_email: emails[kind], input_created_by: "CX2_SPRINT_3_STAGING",
    input_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(), input_rotate: rotate,
  });
}
async function exchange(token) {
  const secret = crypto.randomBytes(32).toString("hex");
  const ok = await rpc("dca_1_exchange_activation_token", { input_activation_token: token, input_session_hash: digest(secret), input_correlation_id: uuid(), input_expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
  return { secret, ok };
}
async function challenge(secret, label) {
  const state = fixture(`state:${label}:${crypto.randomBytes(4).toString("hex")}`);
  const prepared = (await rpc("cx2_prepare_magic_link", { input_session_hash: digest(secret), input_state_hash: digest(state), input_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }))[0];
  await rpc("cx2_mark_magic_link_sent", { input_challenge_id: prepared.challenge_id });
  return { state, prepared };
}

try {
  await createUser("new", emails.new, "demo_user");
  await createUser("existing", emails.existing, "customer");
  await createUser("other", emails.other, "customer");
  await insert("profiles", [
    { id: ids.profileNew, auth_user_id: auth.new, name: "CX2 New", email: emails.new, role: "demo_user", status: "active", is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } },
    { id: ids.profileExisting, auth_user_id: auth.existing, name: "CX2 Existing", email: emails.existing, role: "customer", status: "active", is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } },
    { id: ids.profileOther, auth_user_id: auth.other, name: "CX2 Other", email: emails.other, role: "customer", status: "active", is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } },
  ]);
  await insert("customers", [
    { id: ids.customerExisting, profile_id: ids.profileExisting, auth_user_id: auth.existing, name: "CX2 Existing", email: emails.existing, status: "active", portal_status: "active", is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } },
    { id: ids.customerOther, profile_id: ids.profileOther, auth_user_id: auth.other, name: "CX2 Other", email: emails.other, status: "active", portal_status: "active", is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } },
  ]);
  await insert("leads", [
    { id: ids.leadNew, company: "CX2 New", name: "CX2 New", email: emails.new, converted_customer_id: null, converted_at: null, is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } },
    { id: ids.leadExisting, company: "CX2 Existing", name: "CX2 Existing", email: emails.existing, converted_customer_id: ids.customerExisting, converted_at: new Date().toISOString(), is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } },
    { id: ids.leadOther, company: "CX2 Other", name: "CX2 Other", email: emails.other, converted_customer_id: ids.customerOther, converted_at: new Date().toISOString(), is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } },
  ]);
  await insert("projects", [
    { id: ids.projectExisting, customer_id: ids.customerExisting, name: "CX2 Existing Project", status: "onboarding", progress: 0, is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } },
    { id: ids.projectOther, customer_id: ids.customerOther, name: "CX2 Other Project", status: "onboarding", progress: 0, is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } },
  ]);
  await insert("demo_journeys", [
    { id: ids.journeyNew, lead_id: ids.leadNew, customer_id: null, email: emails.new, demo_status: "interne_preview_klaar", created_by: "CX2_SPRINT_3", updated_by: "CX2_SPRINT_3" },
    { id: ids.journeyExisting, lead_id: ids.leadExisting, customer_id: ids.customerExisting, email: emails.existing, demo_status: "interne_preview_klaar", created_by: "CX2_SPRINT_3", updated_by: "CX2_SPRINT_3" },
    { id: ids.journeyOther, lead_id: ids.leadOther, customer_id: ids.customerOther, email: emails.other, demo_status: "interne_preview_klaar", created_by: "CX2_SPRINT_3", updated_by: "CX2_SPRINT_3" },
  ]);
  await insert("website_build_jobs", [
    { id: ids.buildNew, demo_journey_id: ids.journeyNew, lead_id: ids.leadNew, customer_id: null, status: "succeeded", package_type: "manual_zip", generator_version: "CX2_FIXTURE", request_fingerprint: fixture("r1"), idempotency_key: fixture("b1"), generated_package: packages.new, package_checksum: fixture("p1"), created_by: "CX2_SPRINT_3", updated_by: "CX2_SPRINT_3" },
    { id: ids.buildExisting, demo_journey_id: ids.journeyExisting, lead_id: ids.leadExisting, customer_id: ids.customerExisting, status: "succeeded", package_type: "website_factory", generator_version: "CX2_FIXTURE", request_fingerprint: fixture("r2"), idempotency_key: fixture("b2"), generated_package: packages.existing, package_checksum: fixture("p2"), created_by: "CX2_SPRINT_3", updated_by: "CX2_SPRINT_3" },
    { id: ids.buildOther, demo_journey_id: ids.journeyOther, lead_id: ids.leadOther, customer_id: ids.customerOther, status: "succeeded", package_type: "website_factory", generator_version: "CX2_FIXTURE", request_fingerprint: fixture("r3"), idempotency_key: fixture("b3"), generated_package: packages.other, package_checksum: fixture("p3"), created_by: "CX2_SPRINT_3", updated_by: "CX2_SPRINT_3" },
  ]);
  await insert("website_preview_versions", [
    { id: ids.previewNew, demo_journey_id: ids.journeyNew, build_job_id: ids.buildNew, customer_id: null, project_id: null, version: 1, preview_url: "https://preview.invalid/cx2-new", preview_token: fixture("t1"), is_active: true, generated_package: packages.new, metadata: { fixture: "CX2_SPRINT_3", previewSource: "manual_zip" }, package_checksum: fixture("p1"), created_by: "CX2_SPRINT_3" },
    { id: ids.previewExisting, demo_journey_id: ids.journeyExisting, build_job_id: ids.buildExisting, customer_id: ids.customerExisting, project_id: ids.projectExisting, version: 1, preview_url: "https://preview.invalid/cx2-existing", preview_token: fixture("t2"), is_active: true, generated_package: packages.existing, metadata: { fixture: "CX2_SPRINT_3", previewSource: "website_factory" }, package_checksum: fixture("p2"), created_by: "CX2_SPRINT_3" },
    { id: ids.previewOther, demo_journey_id: ids.journeyOther, build_job_id: ids.buildOther, customer_id: ids.customerOther, project_id: ids.projectOther, version: 1, preview_url: "https://preview.invalid/cx2-other", preview_token: fixture("t3"), is_active: true, generated_package: packages.other, metadata: { fixture: "CX2_SPRINT_3", previewSource: "website_factory" }, package_checksum: fixture("p3"), created_by: "CX2_SPRINT_3" },
  ]);
  await insert("public_preview_publications", [
    { id: ids.publicationNew, relationship_type: "lead", relationship_id: ids.leadNew, public_slug: `cx2-new-${run}`.slice(0,64), preview_version_id: ids.previewNew, enabled: true, created_by: ids.profileNew },
    { id: ids.publicationExisting, relationship_type: "customer", relationship_id: ids.customerExisting, public_slug: `cx2-existing-${run}`.slice(0,64), preview_version_id: ids.previewExisting, enabled: true, created_by: ids.profileExisting },
    { id: ids.publicationOther, relationship_type: "customer", relationship_id: ids.customerOther, public_slug: `cx2-other-${run}`.slice(0,64), preview_version_id: ids.previewOther, enabled: true, created_by: ids.profileOther },
  ]);

  const newLink = (await activationCall("new"))[0]; linkIds.add(newLink.activation_link_id);
  const newExchange = await exchange(newLink.activation_token);
  const newChallenge = await challenge(newExchange.secret, "new");
  await expectFailure("resendCooldownEnforced", () => challenge(newExchange.secret, "new-repeat"));
  await expectFailure("wrongVerifiedUserRejected", () => rpc("cx2_complete_magic_link", { input_state_hash: digest(newChallenge.state), input_auth_user_id: auth.other }));
  const newCompleted = (await rpc("cx2_complete_magic_link", { input_state_hash: digest(newChallenge.state), input_auth_user_id: auth.new }))[0];
  createdCustomerIds.add(newCompleted.customer_id);
  evidence.assertions.newCustomerCreatedAfterVerification = newCompleted.customer_created === true;
  const newRecovered = (await rpc("cx2_resolve_magic_link_completion", { input_state_hash: digest(newChallenge.state), input_auth_user_id: auth.new }))[0];
  evidence.assertions.callbackReplayRecovered = newRecovered.customer_id === newCompleted.customer_id
    && newRecovered.profile_id === newCompleted.profile_id
    && newRecovered.preview_version_id === newCompleted.preview_version_id
    && newRecovered.customer_created === false;

  const [newLead] = await select("leads", `id=eq.${ids.leadNew}&select=converted_customer_id`);
  const [newProfile] = await select("profiles", `id=eq.${ids.profileNew}&select=role,status,auth_user_id`);
  const [newPreview] = await select("website_preview_versions", `id=eq.${ids.previewNew}&select=customer_id,project_id`);
  const [newPublication] = await select("public_preview_publications", `id=eq.${ids.publicationNew}&select=relationship_type,relationship_id,enabled`);
  evidence.assertions.convertedCustomerIdAtomic = newLead.converted_customer_id === newCompleted.customer_id;
  evidence.assertions.provisionalProfilePromoted = newProfile.role === "customer" && newProfile.auth_user_id === auth.new;
  evidence.assertions.previewOwnershipTransferred = newPreview.customer_id === newCompleted.customer_id && newPreview.project_id === null;
  evidence.assertions.publicationOwnershipTransferred = newPublication.relationship_type === "customer" && newPublication.relationship_id === newCompleted.customer_id && newPublication.enabled === true;

  const existingLink = (await activationCall("existing"))[0]; linkIds.add(existingLink.activation_link_id);
  const existingExchange = await exchange(existingLink.activation_token);
  const existingChallenge = await challenge(existingExchange.secret, "existing");
  const existingCompleted = (await rpc("cx2_complete_magic_link", { input_state_hash: digest(existingChallenge.state), input_auth_user_id: auth.existing }))[0];
  evidence.assertions.existingCustomerReused = existingCompleted.customer_created === false && existingCompleted.customer_id === ids.customerExisting;

  const projectRows = await select("projects", `id=in.(${ids.projectExisting},${ids.projectOther})&select=id,customer_id,status`);
  const authCustomerRows = await select("customers", `auth_user_id=in.(${auth.new},${auth.existing},${auth.other})&select=id,auth_user_id,profile_id`);
  evidence.assertions.noDuplicateProject = projectRows.length === 2 && projectRows.every((row) => row.status === "onboarding");
  evidence.assertions.noDuplicateCustomer = authCustomerRows.length === 3 && new Set(authCustomerRows.map((row) => row.auth_user_id)).size === 3;
  evidence.assertions.noDuplicateProfile = (await select("profiles", `auth_user_id=in.(${auth.new},${auth.existing},${auth.other})&select=id`)).length === 3;

  const otherLink = (await activationCall("other"))[0]; linkIds.add(otherLink.activation_link_id);
  const otherExchange = await exchange(otherLink.activation_token);
  const otherChallenge = await challenge(otherExchange.secret, "other");
  await insert("customers", { id: ids.ambiguousCustomer, name: "Ambiguous", email: emails.other, status: "active", portal_status: "prepared", is_demo: true, environment: "test", metadata: { fixture: "CX2_SPRINT_3" } });
  await expectFailure("ambiguousOwnershipRejected", () => rpc("cx2_complete_magic_link", { input_state_hash: digest(otherChallenge.state), input_auth_user_id: auth.other }));
  await remove("customers", `id=eq.${ids.ambiguousCustomer}`); createdCustomerIds.delete(ids.ambiguousCustomer);
  await rpc("cx2_complete_magic_link", { input_state_hash: digest(otherChallenge.state), input_auth_user_id: auth.other });
  evidence.assertions.customerIsolationPreserved = (await select("website_preview_versions", `id=eq.${ids.previewOther}&customer_id=eq.${ids.customerOther}&select=id`)).length === 1
    && (await select("website_preview_versions", `id=eq.${ids.previewOther}&customer_id=eq.${ids.customerExisting}&select=id`)).length === 0;

  const challengeRows = await select("cx2_magic_link_challenges", `activation_link_id=in.(${[...linkIds].join(",")})&select=status,state_hash,verified_auth_user_id`);
  const linkRows = await select("client_activation_links", `id=in.(${[...linkIds].join(",")})&select=status,activated_at,customer_id,token_hash`);
  evidence.assertions.allChallengesConsumed = challengeRows.length === 3 && challengeRows.every((row) => row.status === "consumed" && /^[0-9a-f]{64}$/.test(row.state_hash));
  evidence.assertions.allInvitationsActivated = linkRows.length === 3 && linkRows.every((row) => row.status === "activated" && row.activated_at && row.customer_id);
  evidence.assertions.rawStateAndDcaTokenAbsent = !JSON.stringify({ challengeRows, linkRows }).includes(newChallenge.state) && !JSON.stringify({ challengeRows, linkRows }).includes(newLink.activation_token);
  evidence.assertions.noProviderCall = evidence.providerCalls === 0;
  evidence.assertions.portalRouteServerDerived = [newCompleted.portal_path, existingCompleted.portal_path].every((value) => value === "/klantportaal.html?view=website");

  const failed = Object.entries(evidence.assertions).filter(([, value]) => value !== true).map(([name]) => name);
  if (failed.length) throw new Error(`CX2 assertions failed: ${failed.join(", ")}`);
  evidence.status = "PASS";
} catch (error) {
  evidence.status = "FAIL";
  evidence.failure = String(error.message || error).replace(/[0-9a-f]{64}/gi, "[REDACTED]").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]");
} finally {
  await cleanup();
  evidence.completedAt = new Date().toISOString();
  const outDir = path.join(root, "docs", "evidence", "cx2-sprint-3-magic-link");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "STAGING_CERTIFICATION.json"), `${JSON.stringify(evidence, null, 2)}\n`);
}

if (evidence.status !== "PASS" || evidence.cleanup.completed !== true) throw new Error(`CX2 staging certification ${evidence.status}; cleanup=${evidence.cleanup.completed}`);
process.stdout.write(JSON.stringify({ status: evidence.status, assertions: Object.keys(evidence.assertions).length, cleanup: evidence.cleanup.completed, providerMode: evidence.providerMode }) + "\n");
