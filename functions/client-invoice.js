const { corsHeaders } = require("./_cors");
const { getCompanySettings } = require("./company-settings");
const { generateCommercialInvoicePdf } = require("./services/commercialInvoicePdfService");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "GET") return json(405, { success: false, error: "Methode niet toegestaan." });
  try {
    const context = config();
    const invoiceId = clean(event.queryStringParameters?.invoiceId || event.queryStringParameters?.invoice_id);
    if (!UUID.test(invoiceId)) return json(400, { success: false, error: "Ongeldig factuurnummer." });
    const token = bearer(event);
    const user = await authUser(context, token);
    const invoice = await one(context, `invoices?select=*&id=eq.${invoiceId}&deleted_at=is.null&limit=1`);
    const customer = invoice?.customer_id ? await authorizedCustomer(context, invoice.customer_id, user.id) : null;
    if (!invoice || !customer) return json(404, { success: false, error: "Factuur niet gevonden." });
    const view = buildInvoiceView(invoice, customer, getCompanySettings());
    if (clean(event.queryStringParameters?.format).toLowerCase() === "pdf") {
      const result = generateCommercialInvoicePdf(view);
      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: { ...corsHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeFilename(view.invoice.invoiceNumber)}.pdf"`, "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
        body: result.bytes.toString("base64"),
      };
    }
    return json(200, { success: true, ...view, sideEffects: { paymentStarted: false, providerCalled: false, emailSent: false } });
  } catch (error) {
    console.error("Client invoice failed", { code: clean(error.code || "CLIENT_INVOICE_FAILED"), status: error.status || 500 });
    return json(error.status || 500, { success: false, error: error.message || "Factuur kon niet veilig worden geladen." });
  }
};

function buildInvoiceView(row = {}, customer = {}, company = {}) {
  const context = invoiceContext(row.notes);
  const invoice = {
    id: clean(row.id), invoiceNumber: clean(row.invoice_number) || "Factuur", title: clean(row.title) || "Factuur",
    status: normalizeStatus(row.status, row.due_date), issuedAt: clean(row.invoice_date || row.created_at), dueAt: clean(row.due_date), paidAt: clean(row.paid_at),
    subtotal: amount(row.subtotal), vatAmount: amount(row.vat), total: amount(row.total), currency: "EUR",
    paymentAvailable: Boolean(clean(row.payment_link || row.mollie_checkout_url)) && !["paid", "canceled", "archived", "failed"].includes(normalizeStatus(row.status, row.due_date)),
    paymentUrl: safeHttps(row.payment_link || row.mollie_checkout_url), reference: clean(context.commercialOfferVersionId || row.source_quote_id || row.invoice_number),
  };
  return {
    invoice,
    customer: { name: clean(customer.name), company: clean(customer.company || customer.name), email: clean(customer.email), address: customerAddress(customer) },
    company: safeCompany(company),
    lines: invoiceLines(row, context, invoice),
  };
}

function invoiceLines(row, context, invoice) {
  const source = Array.isArray(context.invoiceLines) ? context.invoiceLines : [];
  const lines = source.map((line) => ({ description: clean(line.description), quantity: positive(line.quantity, 1), unitPrice: amount(line.unitPrice), vatRate: amount(line.vatRate), subtotal: amount(line.subtotal), vat: amount(line.vat), total: amount(line.total) })).filter((line) => line.description);
  if (lines.length) return lines;
  const vatRate = invoice.subtotal > 0 ? Math.round((invoice.vatAmount / invoice.subtotal) * 10000) / 100 : 0;
  return [{ description: invoice.title, quantity: 1, unitPrice: invoice.subtotal, vatRate, subtotal: invoice.subtotal, vat: invoice.vatAmount, total: invoice.total }];
}

function safeCompany(company) {
  return {
    companyName: clean(company.companyName), legalName: clean(company.legalName), tradeName: clean(company.tradeName),
    addressLine1: clean(company.addressLine1), addressLine2: clean(company.addressLine2), kvkNumber: clean(company.kvkNumber), vatNumber: clean(company.vatNumber),
    iban: clean(company.iban), ibanAccountName: clean(company.ibanAccountName), primaryEmail: clean(company.primaryEmail), phoneDisplay: clean(company.phoneDisplay),
    websiteUrl: safeHttps(company.websiteUrl), logoUrl: safeHttps(company.logoUrl), paymentTermDays: positive(company.paymentTermDays, 14),
  };
}

async function authorizedCustomer(context, customerId, authUserId) {
  const customer = await one(context, `customers?select=id,profile_id,auth_user_id,name,company,email,metadata&id=eq.${encodeURIComponent(customerId)}&limit=1`);
  if (!customer) return null;
  if (clean(customer.auth_user_id) === authUserId) return customer;
  if (!customer.profile_id) return null;
  const profile = await one(context, `profiles?select=id,auth_user_id&id=eq.${encodeURIComponent(customer.profile_id)}&limit=1`);
  return clean(profile?.auth_user_id) === authUserId ? customer : null;
}

async function authUser(context, token) {
  if (!token) throw coded(401, "Log in om deze factuur te bekijken.");
  const response = await fetch(`${context.url}/auth/v1/user`, { headers: { apikey: context.anon, Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw coded(401, "Je sessie is verlopen. Log opnieuw in.");
  return data;
}
async function one(context, route) { const response = await fetch(`${context.url}/rest/v1/${route}`, { headers: { apikey: context.service, Authorization: `Bearer ${context.service}`, Accept: "application/json", "Accept-Profile": "public" } }); const data = await response.json().catch(() => []); if (!response.ok) throw coded(502, "Factuurgegevens konden niet worden opgehaald."); return Array.isArray(data) ? data[0] || null : data; }
function invoiceContext(notes) { const marker = "Factuurregels:"; const value = clean(notes); const index = value.lastIndexOf(marker); if (index < 0) return {}; try { const parsed = JSON.parse(value.slice(index + marker.length).trim()); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function customerAddress(customer) { const metadata = customer?.metadata && typeof customer.metadata === "object" ? customer.metadata : {}; return [metadata.address || metadata.addressLine1, metadata.addressLine2 || [metadata.postalCode, metadata.city].filter(Boolean).join(" ")].map(clean).filter(Boolean); }
function normalizeStatus(value, dueDate) { const status = clean(value || "draft").toLowerCase(); if (["paid", "betaald"].includes(status)) return "paid"; if (["canceled", "cancelled", "geannuleerd"].includes(status)) return "canceled"; if (["archived", "gearchiveerd"].includes(status)) return "archived"; if (["failed", "mislukt"].includes(status)) return "failed"; const due = Date.parse(clean(dueDate)); if (["expired", "verlopen"].includes(status) || (["draft", "sent", "open", "verzonden"].includes(status) && Number.isFinite(due) && due < Date.now())) return "expired"; return status === "draft" || status === "concept" ? "draft" : "sent"; }
function bearer(event) { const value = clean(event.headers?.authorization || event.headers?.Authorization); return value.startsWith("Bearer ") ? clean(value.slice(7)) : ""; }
function config() { const url = clean(process.env.SUPABASE_URL).replace(/\/$/, ""); const anon = clean(process.env.SUPABASE_ANON_KEY); const service = clean(process.env.SUPABASE_SERVICE_ROLE_KEY); if (!url || !anon || !service) throw coded(500, "De factuuromgeving is nog niet geconfigureerd."); return { url, anon, service }; }
function safeHttps(value) { try { const url = new URL(clean(value)); return url.protocol === "https:" ? url.href : ""; } catch { return ""; } }
function safeFilename(value) { return clean(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "factuur"; }
function positive(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function amount(value) { const number = Number(value); return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0; }
function clean(value) { return String(value ?? "").trim(); }
function coded(status, message) { return Object.assign(new Error(message), { status }); }
function json(statusCode, body) { return { statusCode, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store, max-age=0" }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._test = { buildInvoiceView, invoiceLines, invoiceContext, normalizeStatus, safeFilename };
