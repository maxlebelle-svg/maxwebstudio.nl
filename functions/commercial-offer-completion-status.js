const { verifyCommercialOfferReturnToken } = require("./services/signhostService");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { success:false, code:"METHOD_NOT_ALLOWED", error:"Methode niet toegestaan." });
  try {
    const verification = verifyCommercialOfferReturnToken(event.queryStringParameters?.status);
    if (!verification.valid) return json(401, { success:false, code:"STATUS_LINK_INVALID", error:"Deze beveiligde statuslink is ongeldig." });
    const config = runtimeConfig();
    const signing = await one(config, `commercial_offer_signing_transactions?select=id,status,provider_status,signed_at,failure_code&id=eq.${verification.signingTransactionId}&limit=1`);
    if (!signing) return json(404, { success:false, code:"STATUS_NOT_FOUND", error:"De ondertekenstatus is niet gevonden." });
    const fulfilment = await one(config, `commercial_offer_fulfilment_runs?select=id,status,customer_id,invoice_id,project_id,factory_project_id,last_error_code,updated_at&signing_transaction_id=eq.${signing.id}&limit=1`);
    const invoice = fulfilment?.invoice_id
      ? await one(config, `invoices?select=id,invoice_number,total,status,mollie_checkout_url,mollie_payment_status,environment&id=eq.${fulfilment.invoice_id}&limit=1`)
      : null;
    return json(200, { success:true, ...publicStatus(signing, fulfilment, invoice) });
  } catch (error) {
    console.error("Commercial offer completion status failed", { code:clean(error.code || "COMPLETION_STATUS_FAILED"), status:Number(error.status || 500) });
    return json(503, { success:false, code:"STATUS_TEMPORARILY_UNAVAILABLE", error:"De actuele status is tijdelijk niet beschikbaar." });
  }
};

function publicStatus(signing = {}, fulfilment = null, invoice = null) {
  const signingStatus = clean(signing.status).toLowerCase();
  const fulfilmentStatus = clean(fulfilment?.status).toLowerCase();
  const invoiceStatus = clean(invoice?.status).toLowerCase();
  const paymentStatus = clean(invoice?.mollie_payment_status).toLowerCase();
  const stopped = ["rejected", "expired", "cancelled", "failed"].includes(signingStatus);
  const paid = invoiceStatus === "paid" || paymentStatus === "paid";
  const paymentPending = fulfilmentStatus === "payment_pending" && Boolean(safePaymentUrl(invoice?.mollie_checkout_url));
  const ready = ["ready_for_production", "completed"].includes(fulfilmentStatus);
  const delayed = fulfilmentStatus === "failed";
  const state = stopped ? "stopped" : paid ? "paid" : paymentPending ? "payment_pending" : ready ? "ready" : delayed ? "delayed" : "processing";
  return {
    state,
    signingConfirmed: Boolean(signing.signed_at) || ["signed", "signed_pending_processing", "completed"].includes(signingStatus),
    portalReady: Boolean(fulfilment?.customer_id),
    portalUrl: fulfilment?.customer_id ? "/login.html?mode=client&next=%2Fklantportaal.html%23facturen" : "",
    payment: paymentPending ? {
      checkoutUrl:safePaymentUrl(invoice.mollie_checkout_url),
      amount:money(invoice.total),
      invoiceNumber:clean(invoice.invoice_number).slice(0, 80),
      testMode:clean(invoice.environment).toLowerCase() === "test" || clean(process.env.MOLLIE_MODE).toLowerCase() !== "live",
    } : null,
    updatedAt:fulfilment?.updated_at || signing.signed_at || null,
  };
}

function safePaymentUrl(value) {
  try {
    const url = new URL(clean(value));
    const allowed = new Set(["www.mollie.com", "checkout.mollie.com", "pay.mollie.nl"]);
    return url.protocol === "https:" && !url.username && !url.password && allowed.has(url.hostname.toLowerCase()) ? url.toString() : "";
  } catch {
    return "";
  }
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : "";
}

function runtimeConfig() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw coded("CONFIG_MISSING", 503);
  return { url, key };
}

async function one(config, route) {
  const response = await fetch(`${config.url}/rest/v1/${route}`, { headers:{ apikey:config.key, Authorization:`Bearer ${config.key}`, Accept:"application/json" } });
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data)) throw coded("STATUS_STORAGE_FAILED", response.status);
  return data[0] || null;
}

function clean(value) { return String(value ?? "").trim(); }
function coded(code, status) { return Object.assign(new Error(code), { code, status }); }
function json(statusCode, body) {
  return {
    statusCode,
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store, max-age=0, must-revalidate",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer",
      "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'",
    },
    body:JSON.stringify(body),
  };
}

exports._test = { money, publicStatus, safePaymentUrl };
