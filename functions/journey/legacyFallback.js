const PROJECT_STATUS_ESTIMATES = Object.freeze({
  new: { percentage: 5, phase: "order", step: "Bestelling ontvangen" },
  onboarding: { percentage: 20, phase: "onboarding", step: "Onboarding verzamelen" },
  design: { percentage: 40, phase: "production", step: "Ontwerp voorbereiden" },
  development: { percentage: 65, phase: "production", step: "Website bouwen" },
  feedback: { percentage: 80, phase: "review", step: "Feedback verwerken" },
  testing: { percentage: 90, phase: "delivery", step: "Livegang controleren" },
  live: { percentage: 100, phase: "delivery", step: "Website live" },
  maintenance: { percentage: 100, phase: "delivery", step: "Nazorg en onderhoud" },
  paused: { percentage: 50, phase: "blocked", step: "Project gepauzeerd", blocked: true },
});

const PREVIEW_STATUS_ESTIMATES = Object.freeze({
  requested: { percentage: 15, phase: "preview", step: "Preview-intake" },
  internal: { percentage: 35, phase: "preview", step: "Preview bouwen" },
  ready_for_review: { percentage: 55, phase: "preview", step: "Preview bekijken", customerActionRequired: true },
  feedback_received: { percentage: 70, phase: "preview", step: "Feedback verwerken", internalActionRequired: true },
  approved: { percentage: 85, phase: "decision", step: "Opdracht afstemmen", customerActionRequired: true },
});

function resolveLegacyJourney(input = {}) {
  const customer = object(input.customer);
  const project = object(input.project);
  const invoice = object(input.invoice);
  const lead = object(input.lead);
  const preview = object(input.preview);
  const updatedAt = latestTimestamp([customer.updated_at, project.updated_at, invoice.updated_at, lead.updated_at, preview.updated_at]);

  if (isPaidCommercialOrder(invoice, customer)) {
    const projectEstimate = estimateProject(project) || PROJECT_STATUS_ESTIMATES.onboarding;
    return legacyResult({
      customer,
      journeyType: "website.direct_checkout",
      definitionKey: "website.direct_checkout",
      percentage: Math.max(20, projectEstimate.percentage),
      phase: projectEstimate.phase,
      step: projectEstimate.step,
      productCode: catalogProductCode(customer, invoice),
      complete: projectEstimate.percentage === 100,
      blocked: Boolean(projectEstimate.blocked),
      updatedAt,
      reason: "paid_checkout_estimate",
    });
  }

  const previewEstimate = estimatePreview(preview, lead, customer);
  if (previewEstimate) {
    return legacyResult({
      customer,
      journeyType: "website.free_preview_sales",
      definitionKey: "website.free_preview_sales",
      percentage: previewEstimate.percentage,
      phase: previewEstimate.phase,
      step: previewEstimate.step,
      productCode: catalogProductCode(customer, invoice),
      complete: false,
      blocked: false,
      customerActionRequired: Boolean(previewEstimate.customerActionRequired),
      internalActionRequired: Boolean(previewEstimate.internalActionRequired),
      updatedAt,
      reason: "free_preview_estimate",
    });
  }

  const projectEstimate = estimateProject(project);
  if (projectEstimate) {
    return legacyResult({
      customer,
      journeyType: "website.direct_checkout",
      definitionKey: "website.direct_checkout",
      percentage: projectEstimate.percentage,
      phase: projectEstimate.phase,
      step: projectEstimate.step,
      productCode: catalogProductCode(customer, invoice),
      complete: projectEstimate.percentage === 100,
      blocked: Boolean(projectEstimate.blocked),
      updatedAt,
      reason: "project_status_estimate",
    });
  }

  return {
    source: "unavailable",
    available: false,
    migrated: false,
    isEstimate: true,
    reason: hasAnyData(input) ? "unknown_legacy_status" : "legacy_data_unavailable",
    customerReference: customerReference(customer),
    percentage: null,
    currentPhase: null,
    currentStep: null,
    complete: false,
    blocked: false,
    lastUpdatedAt: updatedAt,
  };
}

function estimateProject(project) {
  const status = normalized(project.status || project.phase);
  return PROJECT_STATUS_ESTIMATES[status] || null;
}

function estimatePreview(preview, lead, customer) {
  const status = normalized(preview.status || preview.preview_status);
  if (PREVIEW_STATUS_ESTIMATES[status]) return PREVIEW_STATUS_ESTIMATES[status];
  const source = normalized(lead.source || customer.metadata?.source || lead.metadata?.source);
  if (source.includes("preview") || source.includes("sales")) return PREVIEW_STATUS_ESTIMATES.requested;
  return null;
}

function isPaidCommercialOrder(invoice, customer) {
  const paid = [invoice.status, invoice.mollie_payment_status].map(normalized).includes("paid") || Boolean(invoice.paid_at);
  const notes = String(invoice.notes || "").toLowerCase();
  const source = normalized(customer.metadata?.source);
  return paid && (notes.includes('"source":"commercial_order"') || notes.includes("commercial_order") || source === "commercial_order");
}

function catalogProductCode(customer, invoice) {
  return String(customer.metadata?.productCode || customer.metadata?.product_code || invoice.productCode || invoice.product_code || customer.package || "").trim();
}

function legacyResult(input) {
  const percentage = bounded(input.percentage);
  return {
    source: "legacy_estimate",
    available: true,
    migrated: false,
    isEstimate: true,
    reason: input.reason,
    customerReference: customerReference(input.customer),
    journeyInstanceId: null,
    definitionKey: input.definitionKey,
    definitionVersion: 1,
    journeyType: input.journeyType,
    productCode: input.productCode || null,
    status: input.complete ? "completed" : input.blocked ? "paused" : "needs_review",
    percentage,
    currentPhase: input.phase,
    currentStep: { key: null, label: input.step, status: input.blocked ? "blocked" : "in_progress" },
    completedSteps: [],
    remainingSteps: [],
    nextStep: null,
    customerActionRequired: Boolean(input.customerActionRequired),
    internalActionRequired: Boolean(input.internalActionRequired),
    blocked: Boolean(input.blocked),
    blocker: input.blocked ? { stepKey: null, label: input.step } : null,
    lastUpdatedAt: input.updatedAt,
    complete: Boolean(input.complete),
  };
}

function customerReference(customer) {
  const company = String(customer.company || customer.company_name || "").trim();
  const id = String(customer.id || "").trim();
  return company || (id ? `Klant ${id.slice(0, 8)}` : "Onbekende klant");
}

function latestTimestamp(values) {
  const timestamps = values.map((value) => new Date(value || 0)).filter((date) => !Number.isNaN(date.getTime()) && date.getTime() > 0);
  return timestamps.length ? new Date(Math.max(...timestamps.map((date) => date.getTime()))).toISOString() : null;
}

function hasAnyData(input) {
  return [input.customer, input.project, input.invoice, input.lead, input.preview].some((value) => value && typeof value === "object" && Object.keys(value).length);
}

function bounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = { PROJECT_STATUS_ESTIMATES, PREVIEW_STATUS_ESTIMATES, resolveLegacyJourney, _private: { isPaidCommercialOrder } };
