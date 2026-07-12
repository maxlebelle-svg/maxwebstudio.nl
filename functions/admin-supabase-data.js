const { verifyAdmin } = require("./_admin-auth");

const MODULES = Object.freeze({
  leads: {
    table: "leads",
    select: "id,company_name,contact_name,email,phone,website,status,owner_id,created_by,assigned_to,notes,is_demo,environment,metadata,created_at,updated_at",
    legacySelect: "id,company_name,company,name,email,phone,website,website_url,status,source,notes,owner_auth_user_id,converted_customer_id,is_demo,environment,metadata,created_at,updated_at",
    order: "updated_at.desc.nullslast",
    optional: true,
    salesReadable: true,
    map: mapLead,
  },
  customers: {
    table: "customers",
    select: "id,auth_user_id,profile_id,name,company,email,phone,website,package,status,portal_status,customer_since,notes,is_demo,environment,metadata,created_at,updated_at",
    legacySelect: "id,auth_user_id,profile_id,name,company_name,email,phone,website,package,status,portal_status,customer_since,notes,is_demo,environment,metadata,created_at,updated_at",
    order: "updated_at.desc.nullslast",
    optional: false,
    salesReadable: true,
    map: mapCustomer,
  },
  websites: {
    table: "websites",
    select: "id,customer_id,profile_id,name,domain,live_url,staging_url,status,hosting_status,ssl_status,hosting_package,care_package,last_deploy_at,last_checked_at,notes,is_demo,environment,metadata,created_at,updated_at",
    order: "updated_at.desc.nullslast",
    optional: false,
    salesReadable: true,
    map: mapWebsite,
  },
  projects: {
    table: "projects",
    select: "id,customer_id,website_id,name,type,status,phase,progress,notes,is_demo,environment,metadata,created_at,updated_at",
    order: "updated_at.desc.nullslast",
    optional: false,
    salesReadable: true,
    map: mapProject,
  },
  files: {
    table: "files",
    select: "id,customer_id,profile_id,website_id,project_id,lead_id,name,original_filename,file_type,category,location,storage_path,status,notes,mime_type,size_bytes,uploaded_by_type,source_module,usage_rights_confirmed,is_primary,is_client_visible,is_demo,environment,metadata,created_at,updated_at",
    legacySelect: "id,customer_id,website_id,project_id,name,file_type,category,location,storage_path,status,notes,is_demo,environment,metadata,created_at,updated_at",
    order: "updated_at.desc.nullslast",
    optional: true,
    map: mapFile,
  },
  profiles: {
    table: "profiles",
    select: "id,auth_user_id,name,email,role,status,metadata,created_at,updated_at",
    legacySelect: "id,auth_user_id,name,email,role,status,created_at,updated_at",
    order: "name.asc.nullslast",
    optional: true,
    salesReadable: false,
    map: mapProfile,
  },
  change_requests: {
    table: "change_requests",
    select: "id,customer_id,auth_user_id,website_id,project_id,name,company,email,phone,title,description,priority,status,metadata,created_at,updated_at",
    order: "created_at.desc",
    optional: false,
    map: mapChangeRequest,
  },
  client_portal_messages: {
    table: "client_portal_messages",
    select: "id,customer_id,profile_id,sender_profile_id,sender_type,subject,body,status,read_at,is_demo,environment,metadata,created_at,updated_at",
    order: "created_at.desc",
    optional: false,
    map: mapPortalMessage,
  },
  client_portal_notifications: {
    table: "client_portal_notifications",
    select: "id,customer_id,profile_id,type,title,message,entity_type,entity_id,status,read_at,is_demo,environment,metadata,created_at,updated_at",
    order: "created_at.desc",
    optional: false,
    map: mapNotification,
  },
  quotes: {
    table: "quotes",
    select: "id,customer_id,website_id,project_id,quote_number,title,description,amount,currency,status,valid_until,accepted_at,created_at,updated_at,metadata",
    order: "updated_at.desc.nullslast",
    optional: true,
    salesReadable: true,
    map: mapQuote,
  },
  invoices: {
    table: "customer_invoices",
    select: "id,profile_id,customer_auth_user_id,invoice_number,title,amount,status,due_date,paid_at,pdf_file_path,mollie_payment_id,mollie_checkout_url,mollie_payment_status,created_at,updated_at,notes",
    order: "updated_at.desc.nullslast",
    optional: true,
    salesReadable: true,
    map: mapInvoice,
  },
  subscriptions: {
    table: "subscriptions",
    select: "id,customer_id,website_id,project_id,title,plan,package_name,amount,currency,status,start_date,next_invoice_date,created_at,updated_at,metadata",
    order: "updated_at.desc.nullslast",
    optional: true,
    salesReadable: true,
    map: mapSubscription,
  },
});

exports.handler = async (event) => {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { success: false, error: "Alleen GET- en POST-verzoeken zijn toegestaan." });
  }

  const moduleName = cleanText(event.queryStringParameters?.module);
  const definition = MODULES[moduleName];
  if (!definition) {
    return jsonResponse(400, { success: false, error: "Onbekende admin data module." });
  }

  const allowedRoles = definition.salesReadable
    ? ["super_admin", "admin", "sales_manager", "sales_partner"]
    : ["super_admin", "admin"];
  const adminCheck = await verifyAdmin(event, jsonResponse, {
    module: moduleName,
    action: event.httpMethod === "POST" ? "write" : "read",
    allowedRoles: event.httpMethod === "POST" ? ["super_admin", "admin"] : allowedRoles,
    allowedStatuses: ["active", "invited"],
  });
  if (!adminCheck.success) return adminCheck.response;

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Admin Supabase data missing server configuration", {
      module: moduleName,
      role: adminCheck.admin?.role || "",
      status: adminCheck.admin?.status || "",
      reason: "missing_server_configuration",
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return jsonResponse(500, {
      success: false,
      error: "Admin-data kon niet veilig worden geladen.",
      diagnostics: {
        module: moduleName,
        resolvedRole: adminCheck.admin?.role || "",
        status: adminCheck.admin?.status || "",
        reason: "missing_server_configuration",
      },
    });
  }

  try {
    if (event.httpMethod === "POST") {
      const payload = parsePayload(event.body);
      if (moduleName === "customers") {
        const saved = await saveCustomerRecord(supabaseUrl, serviceRoleKey, payload.customer || payload);
        const customer = mapCustomer(saved);
        return jsonResponse(200, {
          success: true,
          module: moduleName,
          mode: "supabase-write",
          diagnostics: {
            module: moduleName,
            resolvedRole: adminCheck.admin?.role || "",
            status: adminCheck.admin?.status || "",
            reason: "authorized",
          },
          customer,
          record: customer,
          refreshedAt: new Date().toISOString(),
        });
      }
      if (moduleName === "websites") {
        const saved = await saveWebsiteRecord(supabaseUrl, serviceRoleKey, payload.website || payload);
        const website = mapWebsite(saved);
        return jsonResponse(200, {
          success: true,
          module: moduleName,
          mode: "supabase-write",
          diagnostics: {
            module: moduleName,
            resolvedRole: adminCheck.admin?.role || "",
            status: adminCheck.admin?.status || "",
            reason: "authorized",
            endpoint: "admin-supabase-data?module=websites",
            customerId: website.customerId,
            websiteId: website.id,
          },
          website,
          record: website,
          refreshedAt: new Date().toISOString(),
        });
      }
      if (moduleName === "projects") {
        const saved = await saveProjectRecord(supabaseUrl, serviceRoleKey, payload.project || payload);
        const project = mapProject(saved);
        return jsonResponse(200, {
          success: true,
          module: moduleName,
          mode: "supabase-write",
          diagnostics: {
            module: moduleName,
            resolvedRole: adminCheck.admin?.role || "",
            status: adminCheck.admin?.status || "",
            reason: "authorized",
            endpoint: "admin-supabase-data?module=projects",
            customerId: project.customerId,
            websiteId: project.websiteId,
            projectId: project.id,
          },
          project,
          record: project,
          refreshedAt: new Date().toISOString(),
        });
      }
      return jsonResponse(405, {
        success: false,
        error: "Schrijven is nog niet beschikbaar voor deze centrale module.",
      });
    }

    const rows = await fetchRows(supabaseUrl, serviceRoleKey, definition);
    const records = rows.map(definition.map).filter((record) => record.id);
    return jsonResponse(200, {
      success: true,
      module: moduleName,
      mode: "supabase-read",
      diagnostics: {
        module: moduleName,
        resolvedRole: adminCheck.admin?.role || "",
        status: adminCheck.admin?.status || "",
        reason: "authorized",
      },
      records,
      counts: { local: 0, supabase: records.length, hybrid: records.length },
      fallbackUsed: false,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (definition.optional && isMissingTableError(error)) {
      return jsonResponse(200, {
        success: true,
        module: moduleName,
        mode: "supabase-read",
        diagnostics: {
          module: moduleName,
          resolvedRole: adminCheck.admin?.role || "",
          status: adminCheck.admin?.status || "",
          reason: "optional_missing_table",
        },
        records: [],
        counts: { local: 0, supabase: 0, hybrid: 0 },
        fallbackUsed: true,
        warning: `${definition.table} is nog niet uitgerold in productie.`,
        refreshedAt: new Date().toISOString(),
      });
    }

    console.error("Admin Supabase data read failed", {
      module: moduleName,
      table: definition.table,
      role: adminCheck.admin?.role || "",
      profileStatus: adminCheck.admin?.status || "",
      status: error.status || 500,
      message: error.message,
    });
    return jsonResponse(error.status || 500, {
      success: false,
      error: error.status ? error.message : "Admin-data kon niet veilig worden geladen.",
      diagnostics: {
        module: moduleName,
        resolvedRole: adminCheck.admin?.role || "",
        status: adminCheck.admin?.status || "",
        reason: error.status ? "supabase_read_failed" : "server_read_failed",
      },
    });
  }
};

async function fetchRows(supabaseUrl, serviceRoleKey, definition) {
  const params = new URLSearchParams({
    select: definition.select,
    limit: "300",
  });
  if (definition.order) params.set("order", definition.order);
  try {
    return await supabaseFetch(`${supabaseUrl}/rest/v1/${definition.table}?${params.toString()}`, {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    });
  } catch (error) {
    if (isMissingTableError(error)) throw error;
    if (!definition.legacySelect || !isMissingColumnError(error)) throw error;
    const fallbackParams = new URLSearchParams({
      select: definition.legacySelect,
      limit: "300",
    });
    if (definition.order) fallbackParams.set("order", definition.order);
    return supabaseFetch(`${supabaseUrl}/rest/v1/${definition.table}?${fallbackParams.toString()}`, {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    });
  }
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Ongeldige JSON body.");
    error.status = 400;
    throw error;
  }
}

function normalizeCustomerWriteStatus(value = "") {
  const status = cleanText(value).toLowerCase();
  if (status === "actief" || status === "active") return "active";
  if (status === "onboarding") return "onboarding";
  if (status === "pauze" || status === "paused") return "paused";
  if (status === "gearchiveerd" || status === "archived") return "archived";
  return "active";
}

function normalizeCustomerWritePortalStatus(value = "") {
  const status = cleanText(value).toLowerCase();
  if (status === "actief" || status === "active") return "active";
  if (status === "uitgenodigd" || status === "invited") return "invited";
  if (status === "uitnodiging_klaar" || status === "prepared" || status === "pending_invitation") return "prepared";
  if (status === "niet_actief" || status === "disabled" || status === "inactive") return "disabled";
  return "prepared";
}

function customerWriteRecord(input = {}) {
  const name = cleanText(input.name);
  const company = cleanText(input.company || input.companyName);
  const email = cleanText(input.email).toLowerCase();
  if (!name) throw Object.assign(new Error("Vul een klantnaam in."), { status: 400 });
  if (!company) throw Object.assign(new Error("Vul een bedrijfsnaam in."), { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("Vul een geldig e-mailadres in."), { status: 400 });
  }
  return {
    auth_user_id: cleanText(input.authUserId) || null,
    profile_id: cleanText(input.profileId) || null,
    name,
    company,
    email: email || null,
    phone: cleanText(input.phone) || null,
    website: cleanText(input.website || input.domain) || null,
    package: cleanText(input.package || input.packageName) || "Basis",
    status: normalizeCustomerWriteStatus(input.status),
    portal_status: normalizeCustomerWritePortalStatus(input.portalStatus),
    customer_since: cleanText(input.customerSince) || null,
    notes: cleanText(input.notes) || null,
    is_demo: Boolean(input.isDemo),
    environment: cleanText(input.environment) || "production",
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      lastCustomerWriteContext: "admin_crm_customer_center",
      createdFromLeadId: cleanText(input.createdFromLeadId || input.leadId || input.metadata?.createdFromLeadId),
    },
    updated_at: new Date().toISOString(),
  };
}

function normalizeWebsiteWriteStatus(value = "") {
  const status = cleanText(value).toLowerCase();
  if (status === "offline" || status === "archived" || status === "gearchiveerd") return "offline";
  if (status === "maintenance" || status === "onderhoud") return "maintenance";
  if (status === "concept" || status === "draft") return "draft";
  if (status === "staging") return "staging";
  return status || "online";
}

function normalizeDomain(value = "") {
  return cleanText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function normalizeUrl(value = "") {
  const url = cleanText(value);
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function websiteWriteRecord(input = {}) {
  const customerId = cleanText(input.customerId || input.customer_id || input.profileId || input.profile_id);
  const explicitProfileId = cleanText(input.profileRecordId || input.customerProfileId || input.profile_id || input.profileId);
  const profileId = explicitProfileId && explicitProfileId !== customerId ? explicitProfileId : "";
  const domain = normalizeDomain(input.domain || input.website || input.liveUrl);
  const liveUrl = normalizeUrl(input.liveUrl || input.live_url || domain);
  const name = cleanText(input.name || input.title || domain);
  if (!customerId) throw Object.assign(new Error("Selecteer eerst een centrale klant voor deze website."), { status: 400 });
  if (!name && !domain) throw Object.assign(new Error("Vul een websitenaam of domein in."), { status: 400 });
  return {
    customer_id: customerId,
    profile_id: profileId || null,
    name: name || domain,
    domain: domain || null,
    live_url: liveUrl,
    staging_url: normalizeUrl(input.stagingUrl || input.staging_url) || null,
    status: normalizeWebsiteWriteStatus(input.status),
    hosting_status: cleanText(input.hostingStatus || input.hosting_status) || null,
    ssl_status: cleanText(input.sslStatus || input.ssl_status) || null,
    hosting_package: cleanText(input.hostingPackage || input.hosting_package) || null,
    care_package: cleanText(input.carePackage || input.care_package || input.package) || null,
    last_deploy_at: cleanText(input.lastDeployAt || input.last_deploy_at) || null,
    last_checked_at: cleanText(input.lastUpdateAt || input.lastCheckedAt || input.last_checked_at) || null,
    notes: cleanText(input.notes) || null,
    is_demo: Boolean(input.isDemo),
    environment: cleanText(input.environment) || "production",
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      githubRepoUrl: cleanText(input.githubRepoUrl || input.github_repo_url),
      githubBranch: cleanText(input.githubBranch || input.github_branch || "main"),
      netlifyProjectName: cleanText(input.netlifyProjectName || input.netlify_project_name),
      netlifySiteId: cleanText(input.netlifySiteId || input.netlify_site_id),
      openTasks: Number.isFinite(Number(input.openTasks)) ? Math.max(0, Number(input.openTasks)) : 0,
      source: cleanText(input.source) || "admin_website_center",
      lastWebsiteWriteContext: "admin_crm_website_center",
    },
    updated_at: new Date().toISOString(),
  };
}

function normalizeProjectWriteStatus(value = "") {
  const status = cleanText(value).toLowerCase();
  if (status === "nieuw" || status === "new") return "new";
  if (status === "onboarding") return "onboarding";
  if (status === "in_ontwerp" || status === "design") return "design";
  if (status === "in_ontwikkeling" || status === "development") return "development";
  if (status === "feedback") return "feedback";
  if (status === "testen" || status === "testing") return "testing";
  if (status === "live") return "live";
  if (status === "onderhoud" || status === "maintenance") return "maintenance";
  if (status === "gepauzeerd" || status === "paused") return "paused";
  if (status === "gearchiveerd" || status === "archived") return "archived";
  return "development";
}

function normalizeProjectWriteProgress(value) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function projectWriteRecord(input = {}, options = {}) {
  const customerId = cleanText(input.customerId || input.customer_id || input.profileId || input.profile_id);
  const websiteId = cleanText(input.websiteId || input.website_id);
  const name = cleanText(input.name || input.title);
  if (!customerId) throw Object.assign(new Error("Selecteer eerst een centrale klant voor dit project."), { status: 400 });
  if (!name) throw Object.assign(new Error("Vul een projectnaam in."), { status: 400 });
  const now = new Date().toISOString();
  return {
    customer_id: customerId,
    website_id: websiteId || null,
    name,
    type: cleanText(input.type || input.projectType || input.project_type) || "website",
    status: normalizeProjectWriteStatus(input.status),
    phase: cleanText(input.phase) || "Website Factory",
    progress: normalizeProjectWriteProgress(input.progress),
    notes: cleanText(input.notes) || null,
    is_demo: Boolean(input.isDemo),
    environment: cleanText(input.environment) || "production",
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      source: cleanText(input.source) || "admin_project_center",
      lastProjectWriteContext: "admin_crm_project_center",
    },
    ...(options.isCreate ? { created_at: now } : {}),
    updated_at: now,
  };
}

async function saveCustomerRecord(supabaseUrl, serviceRoleKey, input = {}) {
  const id = cleanText(input.id || input._supabaseCustomerId || input.supabaseCustomerId);
  const record = customerWriteRecord(input);
  const url = id
    ? `${supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(id)}`
    : `${supabaseUrl}/rest/v1/customers`;
  const response = await fetch(url, {
    method: id ? "PATCH" : "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(record),
  });
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
    const error = new Error(data?.message || data?.error || "Customer kon niet centraal worden opgeslagen.");
    error.status = response.status;
    error.code = data?.code || "";
    error.details = data?.details || "";
    throw error;
  }
  return Array.isArray(data) ? data[0] || {} : data || {};
}

async function readSingleRecord(supabaseUrl, serviceRoleKey, table, id, select = "id") {
  const cleanId = cleanText(id);
  if (!cleanId) return null;
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(cleanId)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return rows[0] || null;
}

async function saveWebsiteRecord(supabaseUrl, serviceRoleKey, input = {}) {
  const id = cleanText(input.id || input._supabaseWebsiteId || input.supabaseWebsiteId);
  const record = websiteWriteRecord(input);
  const url = id
    ? `${supabaseUrl}/rest/v1/websites?id=eq.${encodeURIComponent(id)}`
    : `${supabaseUrl}/rest/v1/websites`;
  const response = await fetch(url, {
    method: id ? "PATCH" : "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(record),
  });
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
    const error = new Error(data?.message || data?.error || "Website kon niet centraal worden opgeslagen.");
    error.status = response.status;
    error.code = data?.code || "";
    error.details = data?.details || "";
    throw error;
  }
  return Array.isArray(data) ? data[0] || {} : data || {};
}

async function saveProjectRecord(supabaseUrl, serviceRoleKey, input = {}) {
  const id = cleanText(input.id || input._supabaseProjectId || input.supabaseProjectId);
  const record = projectWriteRecord(input, { isCreate: !id });
  const customer = await readSingleRecord(supabaseUrl, serviceRoleKey, "customers", record.customer_id, "id");
  if (!customer?.id) {
    throw Object.assign(new Error("Project kan alleen worden opgeslagen voor een bestaande centrale klant."), { status: 400 });
  }
  if (record.website_id) {
    const website = await readSingleRecord(supabaseUrl, serviceRoleKey, "websites", record.website_id, "id,customer_id");
    if (!website?.id) {
      throw Object.assign(new Error("Gekoppelde website bestaat niet."), { status: 400 });
    }
    if (cleanText(website.customer_id) !== record.customer_id) {
      throw Object.assign(new Error("Gekoppelde website hoort niet bij deze klant."), { status: 409, code: "PROJECT_WEBSITE_CUSTOMER_MISMATCH" });
    }
  }
  const url = id
    ? `${supabaseUrl}/rest/v1/projects?id=eq.${encodeURIComponent(id)}`
    : `${supabaseUrl}/rest/v1/projects`;
  const response = await fetch(url, {
    method: id ? "PATCH" : "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(record),
  });
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
    const error = new Error(data?.message || data?.error || "Project kon niet centraal worden opgeslagen.");
    error.status = response.status;
    error.code = data?.code || "";
    error.details = data?.details || "";
    throw error;
  }
  return Array.isArray(data) ? data[0] || {} : data || {};
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
    error.code = data?.code || "";
    error.details = data?.details || "";
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

function isMissingTableError(error = {}) {
  const message = cleanText(error.message).toLowerCase();
  const details = cleanText(error.details).toLowerCase();
  return error.status === 404
    || error.code === "42P01"
    || error.code === "PGRST205"
    || message.includes("could not find the table")
    || message.includes("schema cache")
    || details.includes("schema cache")
    || message.includes("does not exist");
}

function isMissingColumnError(error = {}) {
  const message = cleanText(error.message).toLowerCase();
  const details = cleanText(error.details).toLowerCase();
  return error.code === "42703"
    || error.code === "PGRST204"
    || message.includes("could not find")
    || message.includes("column")
    || details.includes("column");
}

function metadata(row = {}) {
  return row.metadata && typeof row.metadata === "object" ? row.metadata : {};
}

function portalStatusToDutch(value, fallback = "niet_actief") {
  const status = cleanText(value).toLowerCase();
  if (status === "active") return "actief";
  if (status === "invited") return "uitgenodigd";
  if (status === "prepared" || status === "pending_invitation") return "uitnodiging_klaar";
  if (status === "none" || status === "inactive" || status === "niet actief") return "niet_actief";
  return status || fallback;
}

function statusToDutch(value, fallback = "actief") {
  const status = cleanText(value).toLowerCase();
  if (status === "active") return "actief";
  if (status === "planned") return "gepland";
  if (status === "paid") return "betaald";
  if (status === "sent") return "verzonden";
  if (status === "draft") return "concept";
  if (status === "archived") return "gearchiveerd";
  if (status === "paused") return "pauze";
  return status || fallback;
}

function mapLead(row = {}) {
  const meta = metadata(row);
  return {
	    id: cleanText(row.id),
	    companyName: cleanText(row.company_name || row.company),
	    contactName: cleanText(row.contact_name || row.name || meta.contactName || meta.contact_name || meta.contactPerson),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    websiteUrl: cleanText(row.website_url || row.website),
    status: statusToDutch(row.status, "nieuw"),
    callStatus: statusToDutch(row.status, "nieuw"),
    notes: cleanText(row.notes),
	    source: cleanText(row.source || meta.source || "supabase"),
	    ownerAuthUserId: cleanText(row.owner_id || row.owner_auth_user_id || meta.ownerAuthUserId || meta.owner_auth_user_id || meta.createdBy),
    ownerProfileId: cleanText(row.owner_profile_id || meta.ownerProfileId || meta.owner_profile_id),
    ownerEmail: cleanText(row.owner_email || meta.ownerEmail || meta.owner_email || meta.createdByEmail),
    ownerName: cleanText(row.owner_name || meta.ownerName || meta.owner_name || meta.createdByName),
	    assignedUserEmail: cleanText(row.assigned_user_email || meta.assignedUserEmail || meta.assigned_user_email),
	    assignedUserName: cleanText(row.assigned_user_name || meta.assignedUserName || meta.assigned_user_name),
    salesPartnerEmail: cleanText(row.sales_partner_email || meta.salesPartnerEmail || meta.sales_partner_email),
    salesPartnerName: cleanText(row.sales_partner_name || meta.salesPartnerName || meta.sales_partner_name),
	    createdBy: cleanText(row.created_by || meta.createdBy || meta.created_by),
    createdByEmail: cleanText(row.created_by_email || meta.createdByEmail || meta.created_by_email),
    createdByName: cleanText(row.created_by_name || meta.createdByName || meta.created_by_name),
	    convertedCustomerId: cleanText(row.converted_customer_id),
	    assignedTo: cleanText(row.assigned_to || meta.assignedTo || meta.assigned_to),
    isDemo: Boolean(row.is_demo || meta.isDemo),
    environment: cleanText(row.environment || meta.environment || "production"),
    metadata: meta,
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
  };
}

function mapCustomer(row = {}) {
  const meta = metadata(row);
  return {
    id: cleanText(row.id),
    authUserId: cleanText(row.auth_user_id),
    profileId: cleanText(row.profile_id),
    name: cleanText(row.name || [row.first_name, row.last_name].filter(Boolean).join(" ")),
    company: cleanText(row.company || row.company_name),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    website: cleanText(row.website),
    package: cleanText(row.package || row.package_name),
    status: statusToDutch(row.status),
    portalStatus: portalStatusToDutch(row.portal_status || meta.portalAccessStatus || "niet_actief"),
    customerSince: cleanText(row.customer_since || row.created_at),
    isDemo: Boolean(row.is_demo),
    environment: cleanText(row.environment || "production"),
    metadata: meta,
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
    _supabaseCustomerId: cleanText(row.id),
  };
}

function mapWebsite(row = {}) {
  const meta = metadata(row);
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    profileId: cleanText(row.profile_id || row.customer_id),
    name: cleanText(row.name),
    domain: cleanText(row.domain),
    liveUrl: cleanText(row.live_url),
    stagingUrl: cleanText(row.staging_url),
    githubRepoUrl: cleanText(row.github_repo_url || meta.githubRepoUrl || meta.github_repo_url),
    githubBranch: cleanText(row.github_branch || meta.githubBranch || meta.github_branch || "main"),
    netlifyProjectName: cleanText(row.netlify_project_name || meta.netlifyProjectName || meta.netlify_project_name),
    netlifySiteId: cleanText(row.netlify_site_id || meta.netlifySiteId || meta.netlify_site_id),
    status: cleanText(row.status || "online"),
    hostingStatus: cleanText(row.hosting_status),
    sslStatus: cleanText(row.ssl_status),
    hostingPackage: cleanText(row.hosting_package),
    carePackage: cleanText(row.care_package),
    lastDeployAt: cleanText(row.last_deploy_at),
    lastUpdateAt: cleanText(row.last_checked_at || row.updated_at),
    lastCheckedAt: cleanText(row.last_checked_at),
    openTasks: Number.isFinite(Number(meta.openTasks)) ? Math.max(0, Number(meta.openTasks)) : 0,
    notes: cleanText(row.notes),
    isDemo: Boolean(row.is_demo),
    environment: cleanText(row.environment || "production"),
    metadata: meta,
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
    _supabaseWebsiteId: cleanText(row.id),
  };
}

function mapProject(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    profileId: cleanText(row.customer_id),
    websiteId: cleanText(row.website_id),
    name: cleanText(row.name),
    type: cleanText(row.type),
    status: statusToDutch(row.status, "nieuw"),
    phase: cleanText(row.phase),
    progress: Number(row.progress || 0),
    priority: cleanText(row.priority || "normaal"),
    notes: cleanText(row.notes),
    isDemo: Boolean(row.is_demo),
    environment: cleanText(row.environment || "production"),
    metadata: metadata(row),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
    _supabaseProjectId: cleanText(row.id),
  };
}

function mapFile(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id || row.profile_id),
    profileId: cleanText(row.profile_id || row.customer_id),
    websiteId: cleanText(row.website_id),
    projectId: cleanText(row.project_id),
    leadId: cleanText(row.lead_id),
    name: cleanText(row.name || row.original_filename) || "Bestand",
    type: cleanText(row.file_type),
    fileType: cleanText(row.file_type),
    category: cleanText(row.category) || "Overig",
    location: cleanText(row.location),
    url: cleanText(row.location),
    storagePath: cleanText(row.storage_path),
    status: cleanText(row.status) || "active",
    notes: cleanText(row.notes),
    mimeType: cleanText(row.mime_type),
    sizeBytes: Number(row.size_bytes || 0) || 0,
    uploadedByType: cleanText(row.uploaded_by_type),
    sourceModule: cleanText(row.source_module),
    usageRightsConfirmed: Boolean(row.usage_rights_confirmed),
    isPrimary: Boolean(row.is_primary),
    isClientVisible: Boolean(row.is_client_visible),
    description: cleanText(metadata.description || row.notes),
    isDemo: Boolean(row.is_demo),
    environment: cleanText(row.environment) || "production",
    metadata,
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at || row.created_at),
  };
}

function mapProfile(row = {}) {
  const meta = metadata(row);
  return {
    id: cleanText(row.id),
    authUserId: cleanText(row.auth_user_id),
    name: cleanText(row.name || meta.name || meta.displayName),
    email: cleanText(row.email || meta.email).toLowerCase(),
    role: cleanText(row.role || meta.role),
    status: cleanText(row.status || meta.status || "active").toLowerCase(),
    metadata: meta,
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
  };
}

function mapChangeRequest(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    profileId: cleanText(row.customer_id),
    authUserId: cleanText(row.auth_user_id),
    websiteId: cleanText(row.website_id),
    projectId: cleanText(row.project_id),
    name: cleanText(row.name),
    company: cleanText(row.company),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    title: cleanText(row.title || "Wijzigingsverzoek"),
    description: cleanText(row.description),
    priority: cleanText(row.priority || "normal"),
    status: statusToDutch(row.status, "nieuw"),
    metadata: metadata(row),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
  };
}

function mapPortalMessage(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    profileId: cleanText(row.profile_id),
    senderProfileId: cleanText(row.sender_profile_id),
    senderType: cleanText(row.sender_type || "admin"),
    subject: cleanText(row.subject || "Bericht"),
    message: cleanText(row.body),
    body: cleanText(row.body),
    status: cleanText(row.status || "open"),
    readAt: cleanText(row.read_at),
    metadata,
    conversationId: cleanText(metadata.conversationId || metadata.threadId),
    threadId: cleanText(metadata.threadId || metadata.conversationId),
    contextType: cleanText(metadata.contextType || "algemeen"),
    contextLabel: cleanText(metadata.contextLabel || "Algemeen"),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
  };
}

function mapNotification(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    profileId: cleanText(row.customer_id),
    title: cleanText(row.title),
    message: cleanText(row.message),
    type: cleanText(row.type || "info"),
    entityType: cleanText(row.related_type),
    entityId: cleanText(row.related_id),
    actionLabel: cleanText(row.cta_label),
    actionUrl: cleanText(row.cta_target),
    readAt: cleanText(row.read_at),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
  };
}

function mapQuote(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    profileId: cleanText(row.customer_id),
    websiteId: cleanText(row.website_id),
    projectId: cleanText(row.project_id),
    quoteNumber: cleanText(row.quote_number),
    title: cleanText(row.title),
    proposal: cleanText(row.description),
    amount: Number(row.amount || 0),
    total: Number(row.amount || 0),
    currency: cleanText(row.currency || "EUR"),
    status: statusToDutch(row.status, "concept"),
    validUntil: cleanText(row.valid_until),
    acceptedAt: cleanText(row.accepted_at),
    metadata: metadata(row),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
    _supabaseQuoteId: cleanText(row.id),
  };
}

function mapInvoice(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.profile_id),
    profileId: cleanText(row.profile_id),
    customerAuthUserId: cleanText(row.customer_auth_user_id),
    websiteId: "",
    projectId: "",
    invoiceNumber: cleanText(row.invoice_number),
    title: cleanText(row.title),
    description: cleanText(row.notes),
    amount: Number(row.amount || 0),
    total: Number(row.amount || 0),
    currency: "EUR",
    status: statusToDutch(row.status, "concept"),
    dueDate: cleanText(row.due_date),
    paidAt: cleanText(row.paid_at),
    pdfFilePath: cleanText(row.pdf_file_path),
    paymentLink: cleanText(row.mollie_checkout_url),
    molliePaymentId: cleanText(row.mollie_payment_id),
    molliePaymentStatus: cleanText(row.mollie_payment_status),
    metadata: metadata(row),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
    _supabaseInvoiceId: cleanText(row.id),
  };
}

function mapSubscription(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    profileId: cleanText(row.customer_id),
    websiteId: cleanText(row.website_id),
    projectId: cleanText(row.project_id),
    title: cleanText(row.title || row.plan || row.package_name),
    plan: cleanText(row.plan || row.package_name),
    packageName: cleanText(row.package_name || row.plan),
    amount: Number(row.amount || 0),
    monthlyAmount: Number(row.amount || 0),
    currency: cleanText(row.currency || "EUR"),
    status: statusToDutch(row.status, "gepland"),
    startDate: cleanText(row.start_date),
    nextInvoiceDate: cleanText(row.next_invoice_date),
    metadata: metadata(row),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
    _source: "supabase",
    _supabaseSubscriptionId: cleanText(row.id),
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
