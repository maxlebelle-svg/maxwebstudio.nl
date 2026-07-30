const { definitionsFor, normalizeSupplierResult } = require("./_factory-production-gate");

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
  const context = { project, actor, adapters, now, internalAttestations: [], customerApprovals: [] };
  context.internalAttestations = await safeRead(adapters, "factory_gate_attestations", new URLSearchParams({
    factory_project_id: `eq.${project.id}`, attestation_type: "eq.internal_approval", status: "eq.active", select: "*", order: "created_at.desc", limit: "1",
  }));
  context.customerApprovals = await safeRead(adapters, "factory_customer_approvals", new URLSearchParams({
    factory_project_id: `eq.${project.id}`, status: "eq.active", select: "*", order: "approved_at.desc", limit: "1",
  }));
  return context;
}

const SUPPLIERS = Object.freeze({
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
    return unavailable("De generieke Factory-runtime heeft nog geen canonieke productiebron voor gereedmelding.", { factoryProjectId: context.project.id });
  },
});

async function safeRead(adapters, table, params) { try { const value = await adapters.readTable(table, params); return Array.isArray(value) ? value : []; } catch { return []; } }
function passed(summary, artifactRef, context, trustedSnapshot) { return { status: "passed", sourceVersion: "v1", trustedSnapshot, evidence: { summary, artifactRef, observedAt: context.now.toISOString() } }; }
function missing(blockingError, trustedSnapshot = {}) { return { status: "missing", sourceVersion: "v1", trustedSnapshot, evidence: {}, blockingError }; }
function failed(blockingError, trustedSnapshot = {}) { return { status: "failed", sourceVersion: "v1", trustedSnapshot, evidence: {}, blockingError }; }
function unavailable(blockingError, trustedSnapshot = {}) { return { status: "not_configured", sourceVersion: "v1", trustedSnapshot, evidence: {}, blockingError }; }
function domainSnapshot(row) { return { id: row.id, domain: row.domain || row.custom_domain || null, dnsStatus: row.dns_status || null, sslStatus: row.ssl_status || null, emailDnsPreserved: row.email_dns_preserved === true, updatedAt: row.updated_at || null }; }

module.exports = { collectSupplierResults };
