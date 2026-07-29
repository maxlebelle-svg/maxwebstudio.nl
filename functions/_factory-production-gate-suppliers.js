const { definitionsFor, normalizeSupplierResult } = require("./_factory-production-gate");

const ALLOWED_DEMO_HOST = "max-webstudio-food-demo.netlify.app";

async function collectSupplierResults(project, actor, adapters, now = new Date()) {
  const context = await buildContext(project, actor, adapters, now);
  const rows = [];
  for (const check of definitionsFor(project)) {
    const supplier = SUPPLIERS[check.provider];
    const result = supplier
      ? await supplier(check, context)
      : unavailable("Deze benoemde bewijsleverancier is nog niet geïmplementeerd.");
    rows.push(normalizeSupplierResult(project, check.key, check.provider, result, now));
  }
  return rows;
}

async function buildContext(project, actor, adapters, now) {
  const context = { project, actor, adapters, now, foodBundles: [], internalAttestations: [], customerApprovals: [] };
  if (project.factory_type === "food") {
    context.foodBundles = await safeRpc(adapters, "food_demo_bundle_read_v1", {
      input_actor_profile_id: actor.profileId,
      input_actor_auth_user_id: actor.authUserId,
      input_relationship_type: project.relationship_type,
      input_relationship_id: project.relationship_id,
      input_bundle_id: null,
    });
  }
  context.internalAttestations = await safeRead(adapters, "factory_gate_attestations", new URLSearchParams({
    factory_project_id: `eq.${project.id}`, attestation_type: "eq.internal_approval", status: "eq.active", select: "*", order: "created_at.desc", limit: "1",
  }));
  context.customerApprovals = await safeRead(adapters, "factory_customer_approvals", new URLSearchParams({
    factory_project_id: `eq.${project.id}`, status: "eq.active", select: "*", order: "approved_at.desc", limit: "1",
  }));
  return context;
}

const SUPPLIERS = Object.freeze({
  food_demo_bundle: async (check, context) => {
    const bundle = context.foodBundles.find((item) => item.factory_project_id === context.project.id && item.blueprint_key === "silverado-food-v1");
    if (!bundle) return missing("Geen relatiegebonden Food Demo Bundle voor dit Factory-dossier gevonden.", { projectId: context.project.id });
    if (check.key === "restaurant_tenant") {
      const valid = bundle.demo_type === "food" && bundle.metadata?.runtimeFrozen === true;
      return valid
        ? passed("Bevroren Food-demotenant is server-side aan dit dossier gekoppeld.", `db://food-demo-bundles/${bundle.id}`, context, bundleSnapshot(bundle))
        : failed("De Food-demotenant mist de vereiste bevroren runtime-identiteit.", bundleSnapshot(bundle));
    }
    const field = check.key === "order_route" ? "storefront_status" : "dashboard_status";
    const valid = bundle[field] === "reachable";
    return valid
      ? passed(check.key === "order_route" ? "De server-gecontroleerde bestelroute is bereikbaar." : "De server-gecontroleerde dashboardroute is bereikbaar.", `db://food-demo-bundles/${bundle.id}/${field}`, context, bundleSnapshot(bundle))
      : missing(`De ${check.key === "order_route" ? "bestelroute" : "dashboardroute"} heeft nog geen geldig bereikbaarheidsbewijs.`, bundleSnapshot(bundle));
  },

  food_runtime_catalog: async (_check, context) => unavailable("De bevroren demo publiceert nog geen canonieke menu- en openingstijdenbron aan de Factory Gate.", { factoryProjectId: context.project.id }),

  food_access_context: async (_check, context) => {
    const bundle = context.foodBundles.find((item) => item.factory_project_id === context.project.id);
    if (!bundle) return missing("Geen gekoppelde Food-runtime gevonden.", { factoryProjectId: context.project.id });
    return bundle.metadata?.selfServiceAccountProven === true
      ? passed("Manageraccount en tenantgrens zijn door de Food-runtime bevestigd.", `db://food-demo-bundles/${bundle.id}/access`, context, bundleSnapshot(bundle))
      : missing("De demo bewijst nog geen afzonderlijk manageraccount en tenantisolatie.", bundleSnapshot(bundle));
  },

  food_storefront_probe: async (_check, context) => {
    const bundle = context.foodBundles.find((item) => item.factory_project_id === context.project.id);
    if (!bundle) return missing("Geen gekoppelde storefront gevonden.", { factoryProjectId: context.project.id });
    const url = safeDemoUrl(bundle.storefront_url);
    if (!url) return failed("De storefront-URL valt buiten de bevroren demo-allowlist.", bundleSnapshot(bundle));
    try {
      const response = await context.adapters.probeUrl(url.href, { timeoutMs: 5000, maxBytes: 262144 });
      const viewport = /<meta[^>]+name=["']viewport["'][^>]+content=["'][^"']*width=device-width/i.test(response.body || "");
      if (!response.ok || !viewport) return failed("De storefrontprobe kon de mobiele viewport niet aantonen.", { url: url.href, status: response.status, viewport });
      return passed("De allowlisted storefront levert een mobiele viewport en een geldige HTTP-respons.", `https-probe://${url.host}${url.pathname}`, context, { url: url.href, status: response.status, viewport });
    } catch {
      return failed("De mobiele storefrontprobe is veilig mislukt.", { url: url.href });
    }
  },

  domain_center: async (check, context) => {
    if (context.project.relationship_type !== "customer") return unavailable("Domein Center vereist eerst een klantrelatie.", { relationshipType: context.project.relationship_type });
    const rows = await safeRead(context.adapters, "customer_websites", new URLSearchParams({ customer_id: `eq.${context.project.relationship_id}`, select: "*", limit: "1" }));
    if (!rows.length) return unavailable("Domein Center heeft voor deze relatie nog geen canoniek bronrecord.", { customerId: context.project.relationship_id });
    const website = rows[0];
    const mapping = {
      domain_mapping: Boolean(website.domain || website.custom_domain),
      dns_verified: website.dns_status === "verified",
      ssl_active: website.ssl_status === "active",
      business_email_preserved: website.email_dns_preserved === true,
    };
    const valid = mapping[check.key] === true;
    return valid
      ? passed(`${check.label} is door Domein Center bevestigd.`, `db://customer-websites/${website.id}/${check.key}`, context, domainSnapshot(website))
      : missing(`${check.label} is nog niet door Domein Center bevestigd.`, domainSnapshot(website));
  },

  commerce: async (_check, context) => unavailable("Commerce heeft nog geen Factory-gebonden Mollie-, webhook- en testbetalingsbewijs.", { factoryProjectId: context.project.id }),
  legal_registry: async (_check, context) => unavailable("Er bestaat nog geen Factory-gebonden juridische productieregistratie.", { factoryProjectId: context.project.id }),

  internal_attestation: async (_check, context) => {
    const row = context.internalAttestations[0];
    return row
      ? passed("Een actieve superadmin heeft de interne livegoedkeuring vastgelegd.", `db://factory-gate-attestations/${row.id}`, context, { id: row.id, statementVersion: row.statement_version, statementHash: row.statement_hash })
      : missing("Interne superadmingoedkeuring ontbreekt.", { factoryProjectId: context.project.id });
  },

  customer_approval_registry: async (_check, context) => {
    const row = context.customerApprovals[0];
    return row
      ? passed("De canonieke, onveranderlijke klantgoedkeuring is actief.", `db://factory-customer-approvals/${row.id}`, context, { id: row.id, statementVersion: row.statement_version, statementHash: row.statement_hash, approvedAt: row.approved_at })
      : missing("Canonieke klantgoedkeuring ontbreekt.", { factoryProjectId: context.project.id });
  },

  factory_context: async (_check, context) => {
    const bundle = context.foodBundles.find((item) => item.factory_project_id === context.project.id);
    if (context.project.factory_type === "food" && bundle?.metadata?.runtimeFrozen === true) {
      return passed("De Factory-runtime is aantoonbaar in bevroren demomodus.", `db://factory-projects/${context.project.id}/environment-mode`, context, { mode: "demo", runtimeFrozen: true, bundleId: bundle.id });
    }
    return unavailable("Een productie- of demomodus is nog niet door een vertrouwde runtimebron bevestigd.", { factoryProjectId: context.project.id });
  },
});

async function safeRpc(adapters, name, body) { try { const value = await adapters.rpc(name, body); return Array.isArray(value) ? value : value ? [value] : []; } catch { return []; } }
async function safeRead(adapters, table, params) { try { const value = await adapters.readTable(table, params); return Array.isArray(value) ? value : []; } catch { return []; } }
function passed(summary, artifactRef, context, trustedSnapshot) { return { status: "passed", sourceVersion: "v1", trustedSnapshot, evidence: { summary, artifactRef, observedAt: context.now.toISOString() } }; }
function missing(blockingError, trustedSnapshot = {}) { return { status: "missing", sourceVersion: "v1", trustedSnapshot, evidence: {}, blockingError }; }
function failed(blockingError, trustedSnapshot = {}) { return { status: "failed", sourceVersion: "v1", trustedSnapshot, evidence: {}, blockingError }; }
function unavailable(blockingError, trustedSnapshot = {}) { return { status: "not_configured", sourceVersion: "v1", trustedSnapshot, evidence: {}, blockingError }; }
function bundleSnapshot(bundle) { return { id: bundle.id, factoryProjectId: bundle.factory_project_id, blueprintKey: bundle.blueprint_key, blueprintVersion: bundle.blueprint_version, invitationStatus: bundle.invitation_status, storefrontStatus: bundle.storefront_status, dashboardStatus: bundle.dashboard_status, runtimeFrozen: bundle.metadata?.runtimeFrozen === true, selfServiceAccountProven: bundle.metadata?.selfServiceAccountProven === true, updatedAt: bundle.updated_at }; }
function domainSnapshot(row) { return { id: row.id, domain: row.domain || row.custom_domain || null, dnsStatus: row.dns_status || null, sslStatus: row.ssl_status || null, emailDnsPreserved: row.email_dns_preserved === true, updatedAt: row.updated_at || null }; }
function safeDemoUrl(value) { try { const url = new URL(String(value || "")); return url.protocol === "https:" && url.host === ALLOWED_DEMO_HOST ? url : null; } catch { return null; } }

module.exports = { ALLOWED_DEMO_HOST, collectSupplierResults };
