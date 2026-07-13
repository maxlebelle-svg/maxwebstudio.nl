const { readWebsiteCommercialOrder } = require("../../_website-commercial-order");

const OPEN = new Set(["draft", "sent", "open", "pending", "payment_pending"]);
const TERMINAL = new Set(["cancelled", "canceled", "expired", "failed", "refunded", "charged_back"]);

function resolveApprovalNextStep(input = {}) {
  const project = object(input.project);
  const website = object(input.website);
  const customerId = text(input.customerId);
  const previewVersionId = text(input.previewVersionId);
  const order = readWebsiteCommercialOrder(project);
  const invoices = (Array.isArray(input.invoices) ? input.invoices : []).map(invoiceEvidence).filter((item) => relevant(item, { customerId, previewVersionId, projectId: text(project.id) }));
  const direct = invoices.filter((item) => item.context.source === "commercial_order");
  const preview = invoices.filter((item) => item.previewVersionId === previewVersionId);
  const live = [project.status, project.phase, website.status].some((value) => ["live", "online", "website live"].includes(text(value).toLowerCase()));

  if (live) return decision({ journeyType: order ? "website.free_preview_sales" : "website.direct_checkout", orderSource: order?.source || "project_status", paymentState: "unknown", invoiceState: invoiceState(invoices), amountState: "not_required", nextStepType: "already_live", customerActionRequired: false, internalActionRequired: false, cta: portal("#website-review"), reasonCode: "website_already_live", confidence: "high", source: "project_or_website_status" });
  if (invoices.length > 1) return review("multiple_relevant_invoices", order, invoices);
  if (order && ["cancelled", "canceled"].includes(text(order.status).toLowerCase())) return review("commercial_order_cancelled", order, invoices);

  const invoice = direct[0] || preview[0] || null;
  if (invoice?.conflict) return review("payment_invoice_conflict", order, invoices);
  const journeyType = direct[0] ? "website.direct_checkout" : "website.free_preview_sales";
  const orderSource = direct[0] ? "commercial_order" : order?.source || "free_preview";

  if (invoice?.paid && invoice.context.paymentChoice === "full") return decision({ journeyType, orderSource, paymentState: "fully_paid", invoiceState: "paid", amountState: "settled", nextStepType: "technical_completion", customerActionRequired: false, internalActionRequired: true, cta: portal("#website-review"), reasonCode: "full_payment_confirmed", confidence: invoice.providerPaid ? "provider_confirmed" : "invoice_confirmed", source: invoice.source });
  if (invoice?.paid) return decision({ journeyType, orderSource, paymentState: "deposit_paid", invoiceState: "paid", amountState: invoice.context.remainingAmount > 0 ? "remainder_known" : "partial_or_unknown", nextStepType: "approval_processing", customerActionRequired: false, internalActionRequired: true, cta: portal("#website-review"), reasonCode: "partial_payment_confirmed", confidence: invoice.providerPaid ? "provider_confirmed" : "invoice_confirmed", source: invoice.source });
  if (invoice?.open && invoice.checkoutSafe) return decision({ journeyType, orderSource, paymentState: "unpaid", invoiceState: "open", amountState: "invoice_authoritative", nextStepType: "existing_invoice", customerActionRequired: true, internalActionRequired: false, cta: portal("#facturen"), reasonCode: "relevant_open_invoice", confidence: "high", source: "customer_invoice" });
  if (invoice && invoice.terminal) return review("relevant_invoice_terminal", order, invoices);
  if (direct[0] && !direct[0].paid) return review("direct_checkout_payment_unconfirmed", order, invoices);
  if (order) return decision({ journeyType: "website.free_preview_sales", orderSource, paymentState: "not_started", invoiceState: "none", amountState: "catalog_order_known", nextStepType: "commercial_confirmation", customerActionRequired: true, internalActionRequired: true, cta: "https://maxwebstudio.nl/diensten.html", reasonCode: "free_preview_order_confirmation_required", confidence: "medium", source: "website_commercial_order" });
  return decision({ journeyType: "website.free_preview_sales", orderSource: "free_preview", paymentState: "unknown", invoiceState: "none", amountState: "unknown", nextStepType: "commercial_review", customerActionRequired: false, internalActionRequired: true, cta: "", reasonCode: "financial_context_missing", confidence: "low", source: "safe_fallback" });
}

function invoiceEvidence(row = {}) {
  const providerStatus = text(row.mollie_payment_status).toLowerCase();
  const invoiceStatus = text(row.status).toLowerCase();
  const status = providerStatus || invoiceStatus;
  const context = parseContext(row.notes);
  const providerPaid = providerStatus === "paid" && Boolean(text(row.mollie_payment_id));
  const invoicePaid = invoiceStatus === "paid" && Boolean(row.paid_at);
  const conflict = (providerPaid && TERMINAL.has(invoiceStatus)) || (invoicePaid && TERMINAL.has(providerStatus));
  return { id: text(row.id), status, context, previewVersionId: marker(row.notes, "previewDeposit"), customerId: context.customerId || marker(row.notes, "customer"), projectId: context.projectId || marker(row.notes, "project"), providerPaid, invoicePaid, paid: providerPaid || invoicePaid, open: OPEN.has(status), terminal: TERMINAL.has(status), checkoutSafe: Boolean(text(row.mollie_checkout_url) && /^https:\/\/(?:www\.)?mollie\.com\//i.test(text(row.mollie_checkout_url))), conflict, source: providerPaid ? "mollie_webhook_status" : invoicePaid ? "paid_invoice" : "customer_invoice" };
}
function parseContext(notes) { const match = text(notes).match(/Factuurregels:\s*(\{[\s\S]*\})\s*$/); if (!match) return {}; try { const value = JSON.parse(match[1]); return object(value); } catch { return {}; } }
function relevant(item, scope) {
  if (item.previewVersionId && item.previewVersionId === scope.previewVersionId) return true;
  if (item.context.source !== "commercial_order") return false;
  if (scope.projectId) return Boolean(item.projectId && item.projectId === scope.projectId);
  return Boolean(item.customerId && item.customerId === scope.customerId);
}
function invoiceState(items) { if (!items.length) return "none"; if (items.length > 1) return "multiple"; return items[0].conflict ? "conflict" : items[0].paid ? "paid" : items[0].open ? "open" : items[0].terminal ? "terminal" : "unknown"; }
function review(reasonCode, order, invoices) { return decision({ journeyType: order ? "website.free_preview_sales" : "unknown", orderSource: order?.source || "unknown", paymentState: "conflict", invoiceState: invoiceState(invoices), amountState: "untrusted", nextStepType: "financial_review", customerActionRequired: false, internalActionRequired: true, cta: "", reasonCode, confidence: "low", source: "conflicting_financial_evidence" }); }
function decision(value) { return { safe: true, ...value }; }
function portal(hash) { return `https://maxwebstudio.nl/klantportaal.html${hash}`; }
function marker(notes, key) { return text(notes).match(new RegExp(`(?:^|;)${key}:([^;\\s]+)`, "i"))?.[1] || ""; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value || "").trim(); }

module.exports = { resolveApprovalNextStep, _private: { invoiceEvidence, parseContext } };
