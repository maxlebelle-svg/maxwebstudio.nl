const dns = require("dns").promises;
const tls = require("tls");
const { verifyAdmin } = require("./_admin-auth");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DOMAIN_SELECTS = {
  customers: [
    "id,name,company,email,phone,website,status,portal_status,metadata,created_at,updated_at",
    "id,name,company_name,email,phone,website,status,metadata,created_at,updated_at",
    "id,name,email,phone,website,status,metadata,created_at,updated_at",
  ],
  websites: [
    "id,customer_id,profile_id,name,domain,live_url,staging_url,status,hosting_status,ssl_status,hosting_package,care_package,last_deploy_at,last_checked_at,notes,metadata,created_at,updated_at",
    "id,customer_id,profile_id,name,domain,live_url,status,ssl_status,hosting_status,notes,metadata,created_at,updated_at",
    "id,customer_id,name,domain,live_url,status,metadata,created_at,updated_at",
  ],
  customer_websites: [
    "id,profile_id,customer_auth_user_id,name,domain,live_url,status,ssl_status,hosting_status,dns_status,ssl_expires_at,last_deploy_at,last_checked_at,notes,updated_at",
    "id,profile_id,customer_auth_user_id,name,domain,live_url,status,ssl_status,hosting_status,notes,updated_at",
    "id,profile_id,name,domain,live_url,status,updated_at",
  ],
  leads: [
    "id,company_name,contact_name,email,phone,website,status,notes,metadata,created_at,updated_at",
    "id,company_name,email,phone,website,status,notes,metadata,created_at,updated_at",
    "id,company,name,email,phone,website_url,status,notes,metadata,created_at,updated_at",
    "id,email,phone,website,status,notes,metadata,created_at,updated_at",
  ],
};

exports.handler = async (event) => {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { success: false, error: "Alleen GET- en POST-verzoeken zijn toegestaan." });
  }

  const adminCheck = await verifyAdmin(event, jsonResponse, {
    module: "domain_center",
    action: event.httpMethod === "POST" ? "check" : "read",
    allowedRoles: ["super_admin", "admin", "sales_manager"],
    allowedStatuses: ["active", "invited"],
  });
  if (!adminCheck.success) return adminCheck.response;

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { success: false, error: "Domein Center kon geen productiegegevens laden." });
  }

  try {
    const payload = event.httpMethod === "POST" ? parsePayload(event.body) : (event.queryStringParameters || {});
    const relationship = relationshipFrom(payload);
    if (!relationship) return jsonResponse(400, { success: false, code: "RELATIONSHIP_REQUIRED", error: "Selecteer eerst een actieve lead of klant." });
    if (event.httpMethod === "POST") {
      const domain = normalizeDomain(payload.domain || payload.domainName);
      if (!domain) return jsonResponse(400, { success: false, error: "Vul een geldig domein in." });
      const records = await buildDomainRecords({ supabaseUrl, serviceRoleKey, includeChecks: true, relationship });
      const existing = records.find((record) => record.domainName === domain) || null;
      const check = await checkDomain(domain);
      return jsonResponse(200, {
        success: true,
        domain,
        existing,
        result: existing
          ? { status: existing.status, tone: existing.statusTone, message: `${domain} staat al gekoppeld aan ${existing.customer}.` }
          : { status: check.dnsStatus === "valid" ? "bezet" : "controle nodig", tone: check.dnsStatus === "valid" ? "warning" : "info", message: `${domain} is niet gekoppeld in CRM. DNS-status: ${check.dnsLabel}.` },
        check,
      });
    }

    const records = await buildDomainRecords({ supabaseUrl, serviceRoleKey, includeChecks: false, relationship });
    return jsonResponse(200, {
      success: true,
      source: "supabase",
      generatedAt: new Date().toISOString(),
      records,
      metrics: createMetrics(records),
      diagnostics: {
        count: records.length,
        note: "Domeinen komen uit klanten, websites en leads. Live DNS/SSL-checks draaien per zoekactie of detailrefresh.",
      },
    });
  } catch (error) {
    console.error("Admin Domain Center failed", { message: error.message, statusCode: error.statusCode || error.status || 500 });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Domein Center kon niet worden geladen.",
    });
  }
};

async function buildDomainRecords({ supabaseUrl, serviceRoleKey, includeChecks = false, relationship }) {
  const isLead = relationship.relationshipType === "lead";
  const idFilter = `id=eq.${relationship.relationshipId}`;
  const customerFilter = `customer_id=eq.${relationship.relationshipId}`;
  const profileFilter = `profile_id=eq.${relationship.relationshipId}`;
  const [customers, websites, customerWebsites, leads] = await Promise.all([
    isLead ? [] : fetchTableWithFallbacks(supabaseUrl, serviceRoleKey, "customers", DOMAIN_SELECTS.customers, "updated_at.desc.nullslast", idFilter).catch(() => []),
    isLead ? [] : fetchTableWithFallbacks(supabaseUrl, serviceRoleKey, "websites", DOMAIN_SELECTS.websites, "updated_at.desc.nullslast", customerFilter).catch(() => []),
    isLead ? [] : fetchTableWithFallbacks(supabaseUrl, serviceRoleKey, "customer_websites", DOMAIN_SELECTS.customer_websites, "updated_at.desc.nullslast", profileFilter).catch(() => []),
    isLead ? fetchTableWithFallbacks(supabaseUrl, serviceRoleKey, "leads", DOMAIN_SELECTS.leads, "updated_at.desc.nullslast", idFilter).catch(() => []) : [],
  ]);

  const customerIndex = buildCustomerIndex(customers);
  const domains = new Map();
  [...websites, ...customerWebsites].forEach((website) => {
    const meta = metadata(website);
    const customer = customerIndex.get(cleanText(website.customer_id || website.profile_id || website.customer_auth_user_id)) || {};
    const domainName = normalizeDomain(website.domain || website.live_url || website.staging_url || meta.domain || meta.website);
    if (!domainName) return;
    mergeDomain(domains, {
      id: `website-${cleanText(website.id) || domainName}`,
      domainName,
      customer: cleanText(customer.company || customer.company_name || customer.name || website.name || meta.company || "Onbekende klant"),
      customerId: cleanText(customer.id || website.customer_id || website.profile_id || ""),
      leadId: "",
      websiteId: cleanText(website.id),
      source: "website",
      status: statusFromWebsite(website),
      statusTone: toneFromStatus(statusFromWebsite(website)),
      expiresAt: cleanText(meta.expiresAt || meta.domainExpiresAt || "Onbekend"),
      ssl: sslLabel(website.ssl_status),
      sslStatus: cleanText(website.ssl_status || "unknown").toLowerCase(),
      sslExpiresAt: cleanText(website.ssl_expires_at || meta.sslExpiresAt || ""),
      email: emailLabel(meta),
      registrar: cleanText(meta.registrar || meta.domainRegistrar || (meta.domainOwner === "customer" ? "Klant zelf" : "") || "Onbekend"),
      domainOwner: cleanText(meta.domainOwner || meta.owner || (meta.registrar ? "klant/provider" : "onbekend")),
      nameservers: normalizeArray(meta.nameservers || meta.nameServers),
      dnsStatus: cleanText(website.dns_status || meta.dnsStatus || "unknown").toLowerCase(),
      mxStatus: cleanText(meta.mxStatus || ""),
      emailProvider: cleanText(meta.emailProvider || meta.mailProvider || ""),
      netlifyProjectName: cleanText(website.netlify_project_name || meta.netlifyProjectName || meta.netlify_project_name),
      netlifySiteId: cleanText(website.netlify_site_id || meta.netlifySiteId || meta.netlify_site_id),
      liveUrl: cleanText(website.live_url),
      notes: cleanText(website.notes || meta.notes),
      updatedAt: cleanText(website.updated_at || website.last_checked_at || website.last_deploy_at),
      transferSteps: transferStepsFromRecord(website, meta),
      dnsRecords: recordsFromMetadata(meta),
    });
  });

  customers.forEach((customer) => {
    const meta = metadata(customer);
    const domainName = normalizeDomain(customer.website || meta.domain || meta.website || meta.websiteUrl);
    if (!domainName) return;
    mergeDomain(domains, {
      id: `customer-${cleanText(customer.id) || domainName}`,
      domainName,
      customer: cleanText(customer.company || customer.company_name || customer.name || "Klant"),
      customerId: cleanText(customer.id),
      source: "customer",
      status: "actief bij klant",
      statusTone: "neutral",
      expiresAt: cleanText(meta.expiresAt || meta.domainExpiresAt || "Onbekend"),
      ssl: "Onbekend",
      sslStatus: "unknown",
      email: emailLabel(meta),
      registrar: cleanText(meta.registrar || meta.domainRegistrar || (meta.domainOwner === "customer" ? "Klant zelf" : "") || "Onbekend"),
      domainOwner: cleanText(meta.domainOwner || "klant/extern"),
      nameservers: normalizeArray(meta.nameservers || meta.nameServers),
      dnsStatus: cleanText(meta.dnsStatus || "unknown").toLowerCase(),
      mxStatus: cleanText(meta.mxStatus || ""),
      emailProvider: cleanText(meta.emailProvider || meta.mailProvider || ""),
      updatedAt: cleanText(customer.updated_at || customer.created_at),
      transferSteps: transferStepsFromRecord(customer, meta),
      dnsRecords: recordsFromMetadata(meta),
    });
  });

  leads.forEach((lead) => {
    const meta = metadata(lead);
    const domainName = normalizeDomain(lead.website || lead.website_url || meta.website || meta.websiteUrl || meta.domain);
    if (!domainName) return;
    mergeDomain(domains, {
      id: `lead-${cleanText(lead.id) || domainName}`,
      domainName,
      customer: cleanText(lead.company_name || lead.company || lead.name || meta.companyName || lead.contact_name || "Lead"),
      leadId: cleanText(lead.id),
      source: "lead",
      status: "lead gevonden",
      statusTone: "info",
      expiresAt: cleanText(meta.expiresAt || meta.domainExpiresAt || "Onbekend"),
      ssl: "Onbekend",
      sslStatus: "unknown",
      email: emailLabel(meta),
      registrar: cleanText(meta.registrar || meta.domainRegistrar || "Onbekend"),
      domainOwner: cleanText(meta.domainOwner || "lead/extern"),
      nameservers: normalizeArray(meta.nameservers || meta.nameServers),
      dnsStatus: cleanText(meta.dnsStatus || "unknown").toLowerCase(),
      mxStatus: cleanText(meta.mxStatus || ""),
      emailProvider: cleanText(meta.emailProvider || meta.mailProvider || ""),
      notes: cleanText(lead.notes),
      updatedAt: cleanText(lead.updated_at || lead.created_at),
      transferSteps: transferStepsFromRecord(lead, meta),
      dnsRecords: recordsFromMetadata(meta),
    });
  });

  let records = [...domains.values()].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "") || a.domainName.localeCompare(b.domainName));
  if (includeChecks) {
    records = await Promise.all(records.map(async (record) => ({ ...record, ...(await checkDomain(record.domainName)) })));
  }
  return records;
}

async function fetchTableWithFallbacks(supabaseUrl, serviceRoleKey, table, selects, order, filter = "") {
  const options = Array.isArray(selects) ? selects : [selects];
  let lastError = null;
  for (const select of options) {
    try {
      return await fetchTable(supabaseUrl, serviceRoleKey, table, select, order, filter);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`${table} kon niet worden geladen.`);
}

async function fetchTable(supabaseUrl, serviceRoleKey, table, select, order, filter = "") {
  const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${encodeURIComponent(order)}&limit=500${filter ? `&${filter}` : ""}`;
  return supabaseFetch(url, { method: "GET", headers: restHeaders(serviceRoleKey) });
}

function relationshipFrom(input = {}) {
  const relationshipType = cleanText(input.relationshipType || (input.leadId ? "lead" : input.customerId ? "customer" : "")).toLowerCase();
  const relationshipId = cleanText(input.relationshipId || (relationshipType === "lead" ? input.leadId : input.customerId));
  if (!['lead', 'customer'].includes(relationshipType) || !UUID.test(relationshipId)) return null;
  return { relationshipType, relationshipId };
}

function buildCustomerIndex(customers = []) {
  const index = new Map();
  customers.forEach((customer) => {
    [customer.id, customer.profile_id, customer.auth_user_id].map(cleanText).filter(Boolean).forEach((id) => index.set(id, customer));
  });
  return index;
}

function mergeDomain(map, record) {
  const existing = map.get(record.domainName);
  const normalized = normalizeDomainRecord(record);
  if (!existing) {
    map.set(record.domainName, normalized);
    return;
  }
  map.set(record.domainName, {
    ...existing,
    ...Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== "" && value !== "Onbekend" && value !== "unknown")),
    sources: [...new Set([...(existing.sources || []), ...(normalized.sources || [])])],
    dnsRecords: existing.dnsRecords?.length ? existing.dnsRecords : normalized.dnsRecords,
    nameservers: existing.nameservers?.length ? existing.nameservers : normalized.nameservers,
  });
}

function normalizeDomainRecord(record = {}) {
  const domainName = normalizeDomain(record.domainName);
  return {
    id: cleanText(record.id || domainName),
    domainName,
    customer: cleanText(record.customer || "Onbekende klant"),
    customerId: cleanText(record.customerId),
    leadId: cleanText(record.leadId),
    websiteId: cleanText(record.websiteId),
    source: cleanText(record.source || "crm"),
    sources: [cleanText(record.source || "crm")].filter(Boolean),
    status: cleanText(record.status || "controle nodig"),
    statusTone: cleanText(record.statusTone || toneFromStatus(record.status)),
    expiresAt: cleanText(record.expiresAt || "Onbekend"),
    ssl: cleanText(record.ssl || "Onbekend"),
    sslStatus: cleanText(record.sslStatus || "unknown").toLowerCase(),
    sslExpiresAt: cleanText(record.sslExpiresAt),
    sslIssuer: cleanText(record.sslIssuer || ""),
    sslAutoRenew: cleanText(record.sslAutoRenew || ""),
    email: cleanText(record.email || "Onbekend"),
    registrar: cleanText(record.registrar || "Onbekend"),
    domainOwner: cleanText(record.domainOwner || "Onbekend"),
    nameservers: normalizeArray(record.nameservers),
    dnsStatus: cleanText(record.dnsStatus || "unknown").toLowerCase(),
    dnsLabel: dnsLabel(record.dnsStatus),
    mxStatus: cleanText(record.mxStatus || "Onbekend"),
    emailProvider: cleanText(record.emailProvider || record.email || "Onbekend"),
    netlifyProjectName: cleanText(record.netlifyProjectName),
    netlifySiteId: cleanText(record.netlifySiteId),
    liveUrl: cleanText(record.liveUrl),
    notes: cleanText(record.notes),
    updatedAt: cleanText(record.updatedAt),
    transferSteps: Array.isArray(record.transferSteps) ? record.transferSteps : [false, false, false, false, false],
    dnsRecords: Array.isArray(record.dnsRecords) ? record.dnsRecords : [],
  };
}

async function checkDomain(domainName) {
  const [aRecords, cnameRecords, mxRecords, nsRecords, txtRecords, sslInfo] = await Promise.all([
    resolveSafe(domainName, "A"),
    resolveSafe(`www.${domainName}`, "CNAME"),
    resolveSafe(domainName, "MX"),
    resolveSafe(domainName, "NS"),
    resolveSafe(domainName, "TXT"),
    checkSsl(domainName),
  ]);
  const dnsRecords = [
    ...aRecords.map((value) => ["A", "@", value]),
    ...cnameRecords.map((value) => ["CNAME", "www", value]),
    ...mxRecords.map((value) => ["MX", "@", `${value.priority} ${value.exchange}`]),
    ...txtRecords.slice(0, 8).map((value) => ["TXT", "@", Array.isArray(value) ? value.join("") : String(value)]),
  ];
  const hasDns = Boolean(aRecords.length || cnameRecords.length || mxRecords.length || nsRecords.length);
  return {
    dnsStatus: hasDns ? "valid" : "unknown",
    dnsLabel: hasDns ? "DNS gevonden" : "Geen DNS gevonden",
    nameservers: nsRecords,
    mxStatus: mxRecords.length ? "MX gevonden" : "Geen MX gevonden",
    email: mxRecords.length ? guessEmailProvider(mxRecords) : "Niet gekoppeld",
    emailProvider: mxRecords.length ? guessEmailProvider(mxRecords) : "Niet gekoppeld",
    ssl: sslInfo.active ? "Actief" : "Niet actief",
    sslStatus: sslInfo.active ? "active" : "unknown",
    sslIssuer: sslInfo.issuer,
    sslExpiresAt: sslInfo.validTo,
    sslAutoRenew: sslInfo.active ? "Controle via certificaat" : "Onbekend",
    dnsRecords,
  };
}

async function resolveSafe(domainName, type) {
  try {
    return await dns.resolve(domainName, type);
  } catch {
    return [];
  }
}

function checkSsl(domainName) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: domainName, port: 443, servername: domainName, timeout: 3500 }, () => {
      const certificate = socket.getPeerCertificate();
      socket.end();
      resolve({
        active: Boolean(certificate && Object.keys(certificate).length),
        issuer: cleanText(certificate?.issuer?.O || certificate?.issuer?.CN || "Onbekend"),
        validTo: cleanText(certificate?.valid_to),
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ active: false, issuer: "Onbekend", validTo: "" });
    });
    socket.on("error", () => resolve({ active: false, issuer: "Onbekend", validTo: "" }));
  });
}

function createMetrics(records = []) {
  const now = Date.now();
  const soonMs = 45 * 24 * 60 * 60 * 1000;
  const expiringSoon = records.filter((record) => {
    const time = Date.parse(record.expiresAt);
    return Number.isFinite(time) && time > now && time - now <= soonMs;
  }).length;
  return [
    { label: "Actieve domeinen", value: records.filter((record) => ["actief bij klant", "online"].includes(record.status)).length, note: "Uit CRM websites en klanten" },
    { label: "Verlopen binnenkort", value: expiringSoon, note: "Binnen 45 dagen volgens metadata" },
    { label: "SSL actief", value: records.filter((record) => record.sslStatus === "active" || record.ssl === "Actief").length, note: "Opgeslagen of live gecontroleerd" },
    { label: "E-mail gekoppeld", value: records.filter((record) => !["Niet gekoppeld", "Niet ingesteld", "Onbekend"].includes(record.email)).length, note: "Provider of MX bekend" },
  ];
}

function statusFromWebsite(website = {}) {
  const status = cleanText(website.status).toLowerCase();
  if (["online", "live", "active", "actief"].includes(status)) return "actief bij klant";
  if (["staging", "planned", "concept"].includes(status)) return "in voorbereiding";
  return status || "controle nodig";
}

function toneFromStatus(status = "") {
  const value = cleanText(status).toLowerCase();
  if (["actief bij klant", "online", "live"].includes(value)) return "neutral";
  if (["beschikbaar", "goed", "valid"].includes(value)) return "success";
  if (["verhuisbaar", "lead gevonden", "in voorbereiding"].includes(value)) return "info";
  return "warning";
}

function sslLabel(value = "") {
  const status = cleanText(value).toLowerCase();
  if (status === "active") return "Actief";
  if (status === "pending") return "In aanvraag";
  if (status === "inactive") return "Niet actief";
  return "Onbekend";
}

function dnsLabel(value = "") {
  const status = cleanText(value).toLowerCase();
  if (status === "valid") return "DNS correct";
  if (status === "warning") return "Controle nodig";
  if (status === "invalid") return "DNS fout";
  return "Onbekend";
}

function emailLabel(meta = {}) {
  return cleanText(meta.emailProvider || meta.mailProvider || meta.mxProvider || meta.emailStatus || meta.mxStatus || "Onbekend");
}

function guessEmailProvider(mxRecords = []) {
  const joined = mxRecords.map((record) => cleanText(record.exchange).toLowerCase()).join(" ");
  if (joined.includes("google")) return "Google Workspace";
  if (joined.includes("outlook") || joined.includes("protection.outlook") || joined.includes("microsoft")) return "Microsoft 365";
  if (joined.includes("transip")) return "TransIP";
  if (joined.includes("strato")) return "STRATO";
  return "MX gevonden";
}

function transferStepsFromRecord(record = {}, meta = {}) {
  if (Array.isArray(meta.transferSteps)) return meta.transferSteps.map(Boolean).slice(0, 5);
  const hasDomain = Boolean(normalizeDomain(record.domain || record.website || record.live_url || meta.domain || meta.website));
  const hasDns = ["valid", "warning"].includes(cleanText(record.dns_status || meta.dnsStatus).toLowerCase()) || normalizeArray(meta.nameservers || meta.nameServers).length > 0;
  const hasSsl = ["active", "pending"].includes(cleanText(record.ssl_status || meta.sslStatus).toLowerCase());
  const hasEmail = Boolean(cleanText(meta.emailProvider || meta.mxStatus));
  return [hasDomain, hasDomain, hasDns, hasSsl, hasEmail];
}

function recordsFromMetadata(meta = {}) {
  const records = Array.isArray(meta.dnsRecords) ? meta.dnsRecords : Array.isArray(meta.dns_records) ? meta.dns_records : [];
  return records
    .map((record) => Array.isArray(record)
      ? [cleanText(record[0]), cleanText(record[1]), cleanText(record[2])]
      : [cleanText(record.type), cleanText(record.name || record.host), cleanText(record.value)])
    .filter((record) => record[0] || record[1] || record[2]);
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  if (typeof value === "string") return value.split(/[,\n]/).map(cleanText).filter(Boolean);
  return [];
}

function normalizeDomain(value = "") {
  const text = cleanText(value).toLowerCase();
  if (!text) return "";
  return text
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .replace(/:\d+$/, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+|\.+$/g, "");
}

function metadata(row = {}) {
  return row.metadata && typeof row.metadata === "object" ? row.metadata : {};
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Ongeldige JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Supabase gaf geen geldige JSON-response terug.");
    }
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
  };
}

function cleanText(value) {
  return String(value || "").trim();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}
