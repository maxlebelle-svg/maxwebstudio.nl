const { verifyAdmin } = require("./_admin-auth");

const MODULES = Object.freeze({
  leads: {
    table: "leads",
    select: "id,company_name,company,email,phone,website,website_url,status,source,notes,created_at,updated_at",
    order: "updated_at.desc.nullslast",
    optional: true,
    salesReadable: true,
    map: mapLead,
  },
  customers: {
    table: "customers",
    select: "id,auth_user_id,profile_id,name,company,email,phone,website,package,status,portal_status,customer_since,notes,is_demo,environment,metadata,created_at,updated_at",
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
    table: "invoices",
    select: "id,customer_id,website_id,project_id,invoice_number,title,description,amount,currency,status,due_date,paid_at,pdf_file_path,mollie_checkout_url,created_at,updated_at,metadata",
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
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
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
    action: "read",
    allowedRoles,
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
        fallbackUsed: false,
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
  return supabaseFetch(`${supabaseUrl}/rest/v1/${definition.table}?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
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
  return error.status === 404
    || error.code === "42P01"
    || error.code === "PGRST205"
    || message.includes("could not find the table")
    || message.includes("does not exist");
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
  return {
    id: cleanText(row.id),
    companyName: cleanText(row.company_name || row.company),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    websiteUrl: cleanText(row.website_url || row.website),
    status: statusToDutch(row.status, "nieuw"),
    callStatus: statusToDutch(row.status, "nieuw"),
    notes: cleanText(row.notes),
    source: cleanText(row.source || "supabase"),
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
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    profileId: cleanText(row.profile_id || row.customer_id),
    name: cleanText(row.name),
    domain: cleanText(row.domain),
    liveUrl: cleanText(row.live_url),
    stagingUrl: cleanText(row.staging_url),
    status: cleanText(row.status || "online"),
    hostingStatus: cleanText(row.hosting_status),
    sslStatus: cleanText(row.ssl_status),
    hostingPackage: cleanText(row.hosting_package),
    carePackage: cleanText(row.care_package),
    lastDeployAt: cleanText(row.last_deploy_at),
    lastCheckedAt: cleanText(row.last_checked_at),
    notes: cleanText(row.notes),
    isDemo: Boolean(row.is_demo),
    environment: cleanText(row.environment || "production"),
    metadata: metadata(row),
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
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    profileId: cleanText(row.customer_id),
    senderType: cleanText(row.sender_type || "admin"),
    subject: cleanText(row.subject || "Bericht"),
    message: cleanText(row.message),
    body: cleanText(row.message),
    status: cleanText(row.status || "open"),
    readAt: cleanText(row.read_at),
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
    customerId: cleanText(row.customer_id),
    profileId: cleanText(row.customer_id),
    websiteId: cleanText(row.website_id),
    projectId: cleanText(row.project_id),
    invoiceNumber: cleanText(row.invoice_number),
    title: cleanText(row.title),
    description: cleanText(row.description),
    amount: Number(row.amount || 0),
    total: Number(row.amount || 0),
    currency: cleanText(row.currency || "EUR"),
    status: statusToDutch(row.status, "concept"),
    dueDate: cleanText(row.due_date),
    paidAt: cleanText(row.paid_at),
    pdfFilePath: cleanText(row.pdf_file_path),
    paymentLink: cleanText(row.mollie_checkout_url),
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
