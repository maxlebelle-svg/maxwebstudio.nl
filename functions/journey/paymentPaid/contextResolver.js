const TERMINAL_ORDER = new Set(["cancelled", "canceled", "refunded", "charged_back"]);

function resolvePaymentPaidContext(input = {}) {
  const payment = object(input.payment);
  const invoice = object(input.invoice);
  const context = object(input.invoiceContext);
  const provider = text(input.provider || "mollie").toLowerCase();
  const paymentReference = text(payment.id);
  const invoiceReference = text(invoice.id);
  const orderReference = text(context.orderId);
  const environment = paymentEnvironment(payment, context);
  const providerAmount = money(payment.amount);
  const invoiceAmount = money({ value: invoice.amount, currency: providerAmount.currency || "EUR" });
  const verified = input.providerVerified === true && provider === "mollie" && text(payment.status).toLowerCase() === "paid";
  const linked = Boolean(paymentReference && paymentReference === text(invoice.mollie_payment_id));
  const currencyValid = providerAmount.valid && providerAmount.currency === "EUR";
  const amountMatches = currencyValid && invoiceAmount.valid && providerAmount.minor === invoiceAmount.minor;
  const environmentMatches = !text(context.environment) || text(context.environment).toLowerCase() === environment;
  const customerLinked = Boolean(text(input.customerId));
  const customerMatches = !text(context.customerId) || text(context.customerId) === text(input.customerId);
  const invoiceMatches = !text(payment.metadata?.invoiceId) || text(payment.metadata?.invoiceId) === invoiceReference;
  const source = text(context.source) || (previewMarker(invoice.notes) ? "preview_deposit" : "invoice");
  const cancelled = TERMINAL_ORDER.has(text(context.status).toLowerCase());

  const base = { provider, paymentReference, environment, orderSource: source, journeyType: source === "commercial_order" ? "website.direct_checkout" : source === "preview_deposit" ? "website.free_preview_sales" : "invoice.payment", paymentState: verified ? "paid" : "unverified", invoiceState: text(invoice.status).toLowerCase() === "paid" ? "paid" : "inconsistent", paidAmountMinor: amountMatches ? providerAmount.minor : null, currency: amountMatches ? "EUR" : "", amountReliable: amountMatches, invoiceReference, orderReference, customerActionRequired: false, internalActionRequired: false, cta: portal(source === "invoice" ? "#facturen" : ""), confidence: "provider_confirmed", source: "mollie_payment_fetch" };
  if (!verified) return unsafe(base, "provider_payment_not_verified");
  if (!linked) return unsafe(base, "payment_invoice_link_invalid");
  if (!customerLinked) return unsafe(base, "customer_link_missing");
  if (!customerMatches) return unsafe(base, "payment_customer_link_mismatch");
  if (!invoiceMatches) return unsafe(base, "provider_invoice_link_mismatch");
  if (!environmentMatches) return unsafe(base, "payment_environment_mismatch");
  if (!currencyValid) return unsafe(base, providerAmount.currency && providerAmount.currency !== "EUR" ? "payment_currency_invalid" : "payment_amount_invalid");
  if (!amountMatches) return unsafe(base, "payment_invoice_amount_mismatch");
  if (cancelled) return unsafe(base, "commercial_order_cancelled");
  if (text(invoice.status).toLowerCase() !== "paid" || !invoice.paid_at) return unsafe(base, "invoice_paid_state_inconsistent");

  const paymentChoice = text(context.paymentType || context.paymentChoice).toLowerCase();
  const remainingMinor = decimalMinor(context.remainingAmount);
  if (["remaining", "remainder", "balance"].includes(paymentChoice)) return safe({ ...base, paymentType: "remainder", commercialCompletionState: "complete", paidComponent: "remaining_balance", remainingComponent: "none", nextStepType: "technical_delivery", reasonCode: "remainder_payment_confirmed", journeyRelevant: true, reminderScopeSafe: Boolean(orderReference || invoiceReference) });
  if (source === "commercial_order" && paymentChoice === "full") return safe({ ...base, paymentType: "full", commercialCompletionState: "complete", paidComponent: "full_order", remainingComponent: "none", nextStepType: "project_onboarding", reasonCode: "full_payment_confirmed", journeyRelevant: true, reminderScopeSafe: Boolean(orderReference || invoiceReference) });
  if (source === "commercial_order" && paymentChoice === "deposit") return safe({ ...base, paymentType: "deposit", commercialCompletionState: remainingMinor > 0 ? "deposit_complete_remainder_open" : "complete", paidComponent: "deposit", remainingComponent: remainingMinor > 0 ? "later_open" : "none", nextStepType: "project_onboarding", reasonCode: "deposit_payment_confirmed", journeyRelevant: true, reminderScopeSafe: Boolean(orderReference || invoiceReference) });
  if (source === "preview_deposit") return safe({ ...base, paymentType: "deposit", commercialCompletionState: "deposit_complete_remainder_open", paidComponent: "deposit", remainingComponent: "later_open", nextStepType: "project_start", reasonCode: "preview_deposit_confirmed", journeyRelevant: true, reminderScopeSafe: Boolean(invoiceReference) });
  return safe({ ...base, paymentType: "invoice", commercialCompletionState: "invoice_settled", paidComponent: "invoice", remainingComponent: "unknown", nextStepType: "invoice_complete", reasonCode: "linked_invoice_payment_confirmed", journeyRelevant: false, reminderScopeSafe: Boolean(invoiceReference) });
}

function unsafe(base, reasonCode) { return { ...base, safe: false, paymentType: "unknown", commercialCompletionState: "review_required", paidComponent: "unknown", remainingComponent: "unknown", nextStepType: "financial_review", internalActionRequired: true, cta: "", reasonCode, confidence: "low", journeyRelevant: false, reminderScopeSafe: false }; }
function safe(value) { return { ...value, safe: true }; }
function paymentEnvironment(payment, context) { const mode = text(payment.mode || payment.metadata?.environment || context.environment).toLowerCase(); return mode === "live" ? "live" : "test"; }
function money(value = {}) { const currency = text(value.currency).toUpperCase(); const minor = decimalMinor(value.value); return { currency, minor, valid: Boolean(currency && minor !== null && minor > 0) }; }
function decimalMinor(value) { const raw = String(value ?? "").trim(); if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null; const [whole, fraction = ""] = raw.split("."); const minor = Number(whole) * 100 + Number((fraction + "00").slice(0, 2)); return Number.isSafeInteger(minor) && minor >= 0 ? minor : null; }
function previewMarker(notes) { return /(?:^|;)previewDeposit:[^;\s]+/i.test(text(notes)); }
function portal(hash) { return `https://maxwebstudio.nl/klantportaal.html${hash}`; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value || "").trim(); }

module.exports = { resolvePaymentPaidContext, _private: { decimalMinor, money, paymentEnvironment } };
