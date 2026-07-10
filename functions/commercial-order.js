const crypto = require("crypto");
const { verifyAdmin } = require("./_admin-auth");
const { sendEmail } = require("./email");
const { getCompanySettings } = require("./company-settings");
const { createTimelineEvent } = require("./services/timelineService");
const {
  PRODUCTS,
  WEBSITE_PRODUCT_IDS,
  CARE_PRODUCT_IDS,
  centsToEuro,
  euroToMollieValue,
  withVatCents,
} = require("./product-catalog");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const TERMS_VERSION = "algemene-voorwaarden-2026-07";
const PACKAGE_CATALOG = {
  starter: { label: "Starter Website", price: 950 },
  business: { label: "Business Website", price: 1750 },
  premium: { label: "Premium Website", price: 2950 },
  maatwerk: { label: "Maatwerk Website", price: 4500 },
};
const OPTION_CATALOG = {
  seo: { label: "SEO basispakket", price: 350 },
  copy: { label: "Copywriting", price: 450 },
  logo: { label: "Logo opfrissen", price: 300 },
  rush: { label: "Spoedoplevering", price: 600 },
  maintenance: { label: "Onderhoud eerste maand", price: 95 },
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
    }

    const rawPayload = parsePayload(event.body);
    const isPublicCheckout = Boolean(rawPayload.publicCheckout || rawPayload.source === "public_checkout");
    const adminCheck = isPublicCheckout
      ? { success: true, admin: { email: "public-checkout@maxwebstudio.nl", role: "public_checkout" } }
      : await verifyAdmin(event, jsonResponse, {
        module: "commercial_order",
        action: "create",
        allowedRoles: ["super_admin", "admin", "sales_manager", "sales_partner"],
      });
    if (!adminCheck.success) return adminCheck.response;

    const config = readConfig({ publicCheckout: isPublicCheckout });
    if (!config.success) return config.response;

    const input = validatePayload(rawPayload, event);
    input.testOrder = Boolean(config.testMode);
    const existingInvoice = await fetchExistingOrderInvoice(config, input.orderId);
    if (existingInvoice?.mollie_checkout_url && ["draft", "sent", "payment_pending", "open"].includes(cleanText(existingInvoice.status || existingInvoice.mollie_payment_status).toLowerCase())) {
      return jsonResponse(200, {
        success: true,
        checkoutUrl: cleanText(existingInvoice.mollie_checkout_url),
        paymentId: cleanText(existingInvoice.mollie_payment_id),
        invoice: normalizeInvoice(existingInvoice),
        totals: calculateTotals(input),
        idempotent: true,
      });
    }
    const profile = await ensureCommercialProfile(config, input);
    const customer = await ensureCommercialCustomer(config, input, profile);
    const totals = calculateTotals(input);
    const invoice = await createOrderInvoice(config, input, profile, customer, totals, adminCheck.admin);
    const payment = await createMolliePayment(config, invoice, input, totals);
    const checkoutUrl = payment?._links?.checkout?.href || "";
    if (!payment.id || !checkoutUrl) return jsonResponse(502, { success: false, error: "Betaalverzoek kon niet worden aangemaakt." });

    const updatedInvoice = await patchRecord(config, "customer_invoices", invoice.id, {
      mollie_payment_id: payment.id,
      mollie_checkout_url: checkoutUrl,
      mollie_payment_status: cleanText(payment.status || "open"),
      mollie_payment_created_at: cleanText(payment.createdAt) || new Date().toISOString(),
      mollie_payment_expires_at: cleanText(payment.expiresAt) || null,
      status: "sent",
      updated_at: new Date().toISOString(),
    });

    await safeTimeline({
      eventType: "order_created",
      title: "Nieuwe opdracht aangemaakt",
      description: `${input.company} koos ${input.packageLabel} en ${input.paymentChoice === "full" ? "volledige betaling" : "aanbetaling"}.`,
      module: "commercial",
      referenceType: "invoice",
      referenceId: updatedInvoice.id,
      invoiceId: updatedInvoice.id,
      customerId: customer.id,
      actorName: adminCheck.admin?.email || "Max CRM",
      actorRole: adminCheck.admin?.role || "sales",
      icon: "€",
      severity: "success",
      metadata: {
        dedupeKey: `commercial_order_created:${updatedInvoice.id}`,
        orderId: input.orderId,
        paymentId: payment.id,
        termsVersion: TERMS_VERSION,
      },
    });
    await safeTimeline({
      eventType: "terms_accepted",
      title: "Algemene voorwaarden geaccepteerd",
      description: `${input.name} accepteerde versie ${TERMS_VERSION}.`,
      module: "commercial",
      referenceType: "invoice",
      referenceId: updatedInvoice.id,
      invoiceId: updatedInvoice.id,
      customerId: customer.id,
      actorName: input.name,
      actorRole: "customer",
      icon: "✓",
      severity: "success",
      metadata: {
        dedupeKey: `terms_accepted:${updatedInvoice.id}:${input.termsAcceptedAt}`,
        acceptedAt: input.termsAcceptedAt,
        ipAddress: input.ipAddress,
        termsVersion: TERMS_VERSION,
      },
    });

    return jsonResponse(200, {
      success: true,
      checkoutUrl,
      paymentId: payment.id,
      invoice: normalizeInvoice(updatedInvoice),
      customer: pick(customer),
      totals,
      terms: {
        acceptedAt: input.termsAcceptedAt,
        version: TERMS_VERSION,
      },
    });
  } catch (error) {
    console.error("Commercial order error", { message: error.message, statusCode: error.statusCode || error.status || 500 });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode ? error.message : "Nieuwe opdracht kon niet worden verwerkt.",
    });
  }
};

function readConfig(options = {}) {
  const publicCheckout = Boolean(options.publicCheckout);
  const mollieMode = cleanText(process.env.MOLLIE_MODE || "test").toLowerCase();
  const configuredTestKey = process.env.MOLLIE_TEST_API_KEY;
  const configuredDefaultKey = process.env.MOLLIE_API_KEY;
  const publicCheckoutTestPayments = publicCheckout && Boolean(configuredTestKey);
  const mollieApiKey = publicCheckoutTestPayments
    ? configuredTestKey
    : (mollieMode === "test" ? (configuredTestKey || configuredDefaultKey) : configuredDefaultKey);
  const siteUrl = (process.env.SITE_URL || getCompanySettings().websiteUrl || "").replace(/\/$/, "");
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const testMode = cleanText(mollieApiKey).startsWith("test_");
  const livePaymentsAllowed = cleanText(process.env.MOLLIE_ALLOW_LIVE_PAYMENTS).toLowerCase() === "true";
  if (!mollieApiKey || !siteUrl || !supabaseUrl || !serviceRoleKey) {
    return { success: false, response: jsonResponse(500, { success: false, error: "Nieuwe opdracht kan nog niet worden afgerekend." }) };
  }
  if (publicCheckout && !testMode) {
    console.error("Public checkout blocked without Mollie test key", {
      mollieMode,
      hasMollieTestApiKey: Boolean(configuredTestKey),
      defaultKeyPrefix: keyPrefix(configuredDefaultKey),
    });
    return { success: false, response: jsonResponse(403, { success: false, error: "Testbetaling kan nog niet worden gestart. Neem contact op met Max Webstudio." }) };
  }
  if (!publicCheckout && (mollieMode !== "test" || !testMode) && !livePaymentsAllowed) {
    return { success: false, response: jsonResponse(403, { success: false, error: "Betalingen staan nog in testmodus." }) };
  }
  return { success: true, mollieApiKey, siteUrl, supabaseUrl, serviceRoleKey, mollieMode, testMode, publicCheckoutTestPayments };
}

function validatePayload(payload = {}, event = {}) {
  const publicCheckout = Boolean(payload.publicCheckout || payload.source === "public_checkout");
  const rawPackageKey = cleanText(payload.packageKey || payload.websitePackage || payload.package || (publicCheckout ? "" : "business")).toLowerCase();
  const packageKey = publicCheckout ? normalizePackageKey(rawPackageKey) : rawPackageKey;
  const packageConfig = publicCheckout
    ? (packageKey ? productAsPackage(packageKey) : null)
    : PACKAGE_CATALOG[packageKey];
  const productIds = publicCheckout ? normalizeProductIds(payload) : [];
  const selectedOptions = Array.isArray(payload.options) && !publicCheckout ? payload.options.map(cleanText).filter(Boolean) : [];
  const invalidOptions = selectedOptions.filter((key) => !OPTION_CATALOG[key]);
  const paymentChoice = cleanText(payload.paymentChoice || payload.payment_choice || "deposit").toLowerCase() === "full" ? "full" : "deposit";
  if (!packageConfig && !productIds.length) throwValidation("Kies minimaal één product of dienst.");
  if (publicCheckout && packageKey && !WEBSITE_PRODUCT_IDS.includes(packageKey)) throwValidation("Kies een geldig websitepakket.");
  if (publicCheckout && packageKey && !productIds.includes(packageKey)) productIds.unshift(packageKey);
  if (invalidOptions.length) throwValidation("Kies alleen geldige opties.");
  if (!publicCheckout && Array.isArray(payload.customOptions) && payload.customOptions.length) throwValidation("Maatwerkregels worden nog niet via deze betaalflow ondersteund.");
  if (publicCheckout) validateProductSelection(productIds);
  const publicProducts = productIds.map((id) => PRODUCTS[id]).filter(Boolean);
  const packageLabel = packageConfig?.label || publicProducts.map((item) => item.name).slice(0, 2).join(" + ") || "Losse bestelling";
  const packagePrice = packageConfig?.price || 0;
  const value = {
    orderId: cleanText(payload.orderId) || `order_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    name: cleanText(payload.name || payload.customerName),
    company: cleanText(payload.company || payload.companyName),
    email: cleanText(payload.email || payload.customerEmail).toLowerCase(),
    phone: cleanText(payload.phone || payload.customerPhone),
    domain: cleanDomain(payload.domain || payload.website),
    packageKey: packageKey || rawPackageKey || "custom_order",
    packageLabel,
    packagePrice,
    options: selectedOptions,
    products: publicProducts,
    customOptions: publicCheckout ? normalizeManualRequests(payload, publicProducts) : [],
    discount: amount(payload.discount),
    paymentChoice,
    termsAccepted: Boolean(payload.termsAccepted || payload.terms_accepted),
    termsAcceptedAt: cleanText(payload.termsAcceptedAt) || new Date().toISOString(),
    ipAddress: cleanText(payload.ipAddress || header(event, "x-nf-client-connection-ip") || header(event, "client-ip") || header(event, "x-forwarded-for")).split(",")[0],
    notes: cleanText(payload.notes),
  };
  if (!value.name) throwValidation("Vul een klantnaam in.");
  if (!value.company) value.company = value.name;
  if (!emailPattern.test(value.email)) throwValidation("Vul een geldig e-mailadres in.");
  if (!value.phone) throwValidation("Vul je telefoonnummer in.");
  if (!value.termsAccepted) throwValidation("Accepteer de algemene voorwaarden voordat je doorgaat.");
  return value;
}

function calculateTotals(input) {
  const productRows = Array.isArray(input.products) ? input.products.map(productToInvoiceRow) : [];
  const optionRows = input.products?.length
    ? [
      ...productRows.filter((item) => item.price || item.monthlyPrice || item.manualConfirmation),
      ...input.customOptions.map((item) => ({ label: cleanText(item.label || item.name), price: amount(item.price), manualConfirmation: Boolean(item.manualConfirmation) })).filter((item) => item.label),
    ]
    : [
      ...input.options.map((key) => OPTION_CATALOG[key]).filter(Boolean),
      ...input.customOptions.map((item) => ({ label: cleanText(item.label || item.name), price: amount(item.price) })).filter((item) => item.label),
    ];
  const directOneTime = optionRows.filter((item) => !item.monthlyPrice && !item.manualConfirmation);
  const recurringRows = optionRows.filter((item) => item.monthlyPrice);
  const manualRows = optionRows.filter((item) => item.manualConfirmation);
  const subtotal = round((input.products?.length ? 0 : input.packagePrice) + directOneTime.reduce((sum, item) => sum + amount(item.price), 0) - input.discount);
  const vat = round(subtotal * 0.21);
  const total = round(subtotal + vat);
  const depositEx = input.products?.length
    ? directOneTime.reduce((sum, item) => sum + amount(item.depositPrice || item.price), 0)
    : round(total * 0.5 / 1.21);
  const depositIncl = round(depositEx * 1.21);
  const paymentAmount = input.paymentChoice === "full" ? total : Math.min(depositIncl, total);
  const monthlySubtotal = round(recurringRows.reduce((sum, item) => sum + amount(item.monthlyPrice), 0));
  const monthlyVat = round(monthlySubtotal * 0.21);
  return {
    packagePrice: input.packagePrice,
    options: optionRows,
    recurring: recurringRows,
    manual: manualRows,
    discount: input.discount,
    subtotal,
    vat,
    total,
    paymentAmount,
    remainingAmount: round(total - paymentAmount),
    monthlySubtotal,
    monthlyVat,
    monthlyTotal: round(monthlySubtotal + monthlyVat),
    vatRate: 21,
  };
}

async function ensureCommercialProfile(config, input) {
  const existing = await fetchSingle(config, "profiles", "id,auth_user_id,name,company,email,phone,website,package,role,status,metadata", `email=eq.${encodeURIComponent(input.email)}`);
  const metadata = { ...(existing?.metadata || {}), commercialOrderStatus: "payment_pending", latestCommercialOrderId: input.orderId };
  if (input.testOrder) metadata.environment = "test";
  const record = {
    id: existing?.id || undefined,
    auth_user_id: existing?.auth_user_id || null,
    name: input.name,
    company: input.company,
    email: input.email,
    phone: input.phone,
    website: input.domain,
    package: input.packageLabel,
    role: existing?.role || "customer",
    status: existing?.status || "pending",
    metadata,
    updated_at: new Date().toISOString(),
  };
  return upsertRecord(config, "profiles", record);
}

async function ensureCommercialCustomer(config, input, profile) {
  const filter = profile?.id
    ? `profile_id=eq.${encodeURIComponent(profile.id)}`
    : `email=eq.${encodeURIComponent(input.email)}`;
  const existing = await fetchSingle(config, "customers", "id,profile_id,auth_user_id,name,company,email,phone,website,package,status,portal_status,metadata", filter);
  const metadata = { ...(existing?.metadata || {}), commercialOrderStatus: "payment_pending", latestCommercialOrderId: input.orderId };
  if (input.testOrder) metadata.environment = "test";
  return upsertRecord(config, "customers", {
    id: existing?.id || undefined,
    profile_id: profile.id,
    auth_user_id: existing?.auth_user_id || profile.auth_user_id || null,
    name: input.name,
    company: input.company,
    email: input.email,
    phone: input.phone,
    website: input.domain,
    package: input.packageLabel,
    status: existing?.status || "onboarding",
    portal_status: existing?.portal_status || "prepared",
    metadata,
    updated_at: new Date().toISOString(),
  });
}

async function createOrderInvoice(config, input, profile, customer, totals, admin = {}) {
  const invoiceNumber = `OPD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const lines = [
    ...(input.products?.length ? [] : [{ description: input.packageLabel, quantity: 1, unitPrice: input.packagePrice, vatRate: 21 }]),
    ...totals.options.map((item) => ({
      description: item.label,
      quantity: 1,
      unitPrice: item.monthlyPrice || item.price || 0,
      vatRate: 21,
      billingType: item.monthlyPrice ? "monthly" : "one_time",
      manualConfirmation: Boolean(item.manualConfirmation),
    })),
  ];
  if (input.discount) lines.push({ description: "Korting", quantity: 1, unitPrice: -input.discount, vatRate: 21 });
  const context = {
    source: "commercial_order",
    environment: input.testOrder ? "test" : "live",
    testOrder: Boolean(input.testOrder),
    orderId: input.orderId,
    customerId: customer.id,
    customerName: input.name,
    customerCompany: input.company,
    packageKey: input.packageKey,
    packageLabel: input.packageLabel,
    paymentChoice: input.paymentChoice,
    products: (input.products || []).map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      category: item.category,
      manualConfirmation: item.manualConfirmation,
      type: item.type,
    })),
    recurring: totals.recurring,
    manual: totals.manual,
    terms: {
      acceptedAt: input.termsAcceptedAt,
      ipAddress: input.ipAddress,
      version: TERMS_VERSION,
    },
    lines,
    subtotal: totals.subtotal,
    vat: totals.vat,
    total: totals.total,
    remainingAmount: totals.remainingAmount,
    createdBy: admin.email || "",
  };
  const notes = [
    input.testOrder ? "TESTORDER - Mollie testbetaling. Niet leveren of externe diensten aanvragen." : "",
    input.notes,
    `\n---\nFactuurregels: ${JSON.stringify(context)}`,
  ].filter(Boolean).join("\n");
  return upsertRecord(config, "customer_invoices", {
    profile_id: profile.id,
    customer_auth_user_id: profile.auth_user_id || null,
    invoice_number: invoiceNumber,
    title: `${input.testOrder ? "TEST - " : ""}${input.paymentChoice === "full" ? "Opdrachtbevestiging Max Webstudio" : "Aanbetaling opdrachtbevestiging Max Webstudio"}`,
    amount: totals.paymentAmount,
    status: "draft",
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    notes,
    updated_at: new Date().toISOString(),
  });
}

async function createMolliePayment(config, invoice, input, totals) {
  const response = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.mollieApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amount: { currency: "EUR", value: euroToMollieValue(totals.paymentAmount) },
      description: `${input.testOrder ? "TEST - " : ""}${invoice.invoice_number} - ${input.company}`.slice(0, 255),
      redirectUrl: `${config.siteUrl}/bedankt.html?order=${encodeURIComponent(input.orderId)}&invoice=${encodeURIComponent(invoice.id)}`,
      webhookUrl: `${config.siteUrl}/.netlify/functions/mollie-webhook`,
      metadata: {
        source: "commercial_order",
        orderId: input.orderId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        package: input.packageKey,
        packageLabel: input.packageLabel,
        products: (input.products || []).map((item) => item.id).join(","),
        carePackage: (input.products || []).find((item) => CARE_PRODUCT_IDS.includes(item.id))?.id || "",
        customerReference: input.email,
        environment: config.testMode ? "test" : "live",
        testOrder: config.testMode ? "true" : "false",
        paymentChoice: input.paymentChoice,
        termsVersion: TERMS_VERSION,
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Commercial order Mollie payment failed", { status: response.status, title: data.title, detail: data.detail });
    const error = new Error(data.detail || data.title || "Betaling kon niet worden aangemaakt.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }
  return data;
}

async function fetchExistingOrderInvoice(config, orderId) {
  const safeOrderId = cleanText(orderId);
  if (!safeOrderId) return null;
  const fields = "id,invoice_number,title,amount,status,notes,mollie_payment_id,mollie_checkout_url,mollie_payment_status";
  const filter = `notes=ilike.*${encodeURIComponent(safeOrderId)}*`;
  return fetchSingle(config, "customer_invoices", fields, filter).catch(() => null);
}

async function fetchSingle(config, table, fields, filter) {
  const rows = await supabaseFetch(config, `/rest/v1/${table}?select=${encodeURIComponent(fields)}&${filter}&limit=1`, { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function upsertRecord(config, table, record) {
  const payload = { ...record };
  if (!payload.id) delete payload.id;
  const rows = await supabaseFetch(config, `/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Profile": "public", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  const saved = Array.isArray(rows) ? rows[0] : rows;
  if (!saved) throw new Error(`${table} kon niet worden opgeslagen.`);
  return saved;
}

async function patchRecord(config, table, id, patch) {
  const rows = await supabaseFetch(config, `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Content-Profile": "public", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function supabaseFetch(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: { ...restHeaders(config.serviceRoleKey), ...(options.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Platformdata kon niet worden opgeslagen.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }
  return data;
}

async function safeTimeline(input) {
  try {
    return await createTimelineEvent(input);
  } catch (error) {
    console.error("Commercial order timeline failed", { message: error.message });
    return null;
  }
}

function normalizeInvoice(row = {}) {
  return {
    id: cleanText(row.id),
    invoiceNumber: cleanText(row.invoice_number),
    title: cleanText(row.title),
    amount: Number(row.amount) || 0,
    status: cleanText(row.status),
    molliePaymentId: cleanText(row.mollie_payment_id),
    mollieCheckoutUrl: cleanText(row.mollie_checkout_url),
  };
}

function restHeaders(serviceRoleKey) {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Accept: "application/json", "Accept-Profile": "public" };
}

function header(event, name) {
  const headers = event.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "";
}

function cleanDomain(value = "") {
  return cleanText(value).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
}

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizePackageKey(value) {
  const key = cleanText(value).toLowerCase();
  if (WEBSITE_PRODUCT_IDS.includes(key)) return key;
  if (key === "starter") return "starter_site";
  if (key === "business") return "business_website";
  if (key === "premium") return "premium_growth";
  return key;
}

function productAsPackage(productId) {
  const product = PRODUCTS[productId];
  if (!product) return null;
  return {
    label: product.name,
    price: centsToEuro(product.priceExVatCents),
  };
}

function normalizeProductIds(payload = {}) {
  const ids = new Set();
  const add = (value) => {
    const key = normalizePackageKey(value);
    if (key && PRODUCTS[key]) ids.add(key);
  };
  if (Array.isArray(payload.productIds)) payload.productIds.forEach(add);
  if (Array.isArray(payload.products)) payload.products.forEach((item) => add(typeof item === "string" ? item : item?.id));
  add(payload.websitePackage || payload.packageKey || payload.package);
  add(payload.carePackage);
  return [...ids];
}

function validateProductSelection(productIds) {
  const selected = new Set(productIds);
  const websiteCount = productIds.filter((id) => WEBSITE_PRODUCT_IDS.includes(id)).length;
  if (websiteCount > 1) throwValidation("Kies maximaal één websitepakket.");
  if (CARE_PRODUCT_IDS.filter((id) => selected.has(id)).length > 1) throwValidation("Kies maximaal één onderhoudspakket.");
  if (selected.has("domain_registration") && selected.has("domain_transfer")) throwValidation("Kies domeinnaam registreren of domeinnaam verhuizen, niet allebei tegelijk.");
  productIds.forEach((id) => {
    const product = PRODUCTS[id];
    if (!product?.active || !product.publicCheckout) throwValidation("Een gekozen product is niet beschikbaar.");
    const dependencies = product.dependencies || [];
    if (dependencies.length && !dependencies.some((dependency) => selected.has(dependency))) {
      throwValidation(`${product.name} heeft eerst een bijpassende basiskeuze nodig.`);
    }
  });
}

function normalizeManualRequests(payload, products) {
  const requests = products
    .filter((item) => item.manualConfirmation)
    .map((item) => ({ label: item.name, price: 0, manualConfirmation: true }));
  const customText = cleanText(payload.customRequest || payload.custom_request);
  if (customText) requests.push({ label: `Andere wens: ${customText}`, price: 0, manualConfirmation: true });
  return requests;
}

function productToInvoiceRow(product) {
  return {
    label: product.name,
    price: centsToEuro(product.priceExVatCents + (product.setupExVatCents || 0)),
    depositPrice: centsToEuro(product.depositExVatCents || product.priceExVatCents || 0),
    monthlyPrice: centsToEuro(product.monthlyExVatCents || 0),
    priceInclVat: centsToEuro(withVatCents(product.priceExVatCents || 0, product.vatRate)),
    monthlyInclVat: centsToEuro(withVatCents(product.monthlyExVatCents || 0, product.vatRate)),
    manualConfirmation: Boolean(product.manualConfirmation),
    category: product.category,
    code: product.code,
  };
}

function throwValidation(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function pick(record = {}) {
  return { id: cleanText(record.id), name: cleanText(record.name), company: cleanText(record.company), email: cleanText(record.email) };
}

function cleanText(value) {
  return String(value || "").trim();
}

function keyPrefix(value) {
  const key = cleanText(value);
  if (key.startsWith("test_")) return "test_";
  if (key.startsWith("live_")) return "live_";
  return key ? "unknown" : "missing";
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    throwValidation("Ongeldige aanvraag.");
  }
}

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}
