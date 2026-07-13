const { createAdminJourneyReadRepository } = require("./adminReadRepository");
const { getJourneyDefinition, getJourneyDefinitionForType } = require("./definitions");
const { createJourneyLogger } = require("./logger");
const { calculateJourneyProgress } = require("./progress");
const { resolveLegacyJourney } = require("./legacyFallback");

function createAdminJourneyReadService(options = {}) {
  const repository = options.repository || createAdminJourneyReadRepository(options);
  const log = options.log || createJourneyLogger({ logger: options.logger, component: "journey_admin_service" });
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  return {
    getOverview: (filters = {}, context = {}) => getOverview({ filters, context, repository, log, now }),
  };
}

async function getOverview({ filters, context, repository, log, now }) {
  const startedAt = now();
  const snapshot = await repository.readSnapshot(filters, context);
  if (snapshot.skipped) {
    log.info("admin_overview", { operation: "admin_overview", result: "disabled", source: "unavailable", durationMs: now() - startedAt, recordCount: 0, reason: snapshot.reason });
    return {
      available: false,
      disabled: true,
      reason: snapshot.reason,
      mode: snapshot.mode || "off",
      metrics: emptyMetrics(),
      journeys: [],
      recentEvents: [],
      pagination: pagination(filters, 0),
      warnings: snapshot.warnings || [],
    };
  }

  const data = snapshot.data || {};
  const definitions = new Map((data.journeyDefinitions || []).map((row) => [String(row.id), row]));
  const customers = new Map((data.customers || []).map((row) => [String(row.id), row]));
  const projectsById = new Map((data.projects || []).map((row) => [String(row.id), row]));
  const projectsByCustomer = firstBy(data.projects, "customer_id");
  const invoicesByProfile = indexInvoices(data.invoices || []);
  const eventsByInstance = groupBy(data.journeyEvents, "journey_instance_id");
  const demosByCustomer = firstBy(data.demoJourneys, "customer_id");
  const leads = new Map((data.leads || []).map((row) => [String(row.id), row]));
  const journeyCustomerIds = new Set();
  const representedLegacyCustomerIds = new Set();
  const items = [];

  for (const instance of data.journeyInstances || []) {
    const definitionRow = definitions.get(String(instance.definition_id || ""));
    const definitionKey = definitionRow?.definition_key || instance.metadata?.definitionKey || instance.metadata?.definition_key;
    const version = Number(definitionRow?.version || instance.definition_version || 1);
    const definition = getJourneyDefinition(definitionKey, version) || getJourneyDefinitionForType(instance.journey_type, version);
    const customer = customers.get(String(instance.customer_id || "")) || {};
    const project = projectsById.get(String(instance.project_id || "")) || projectsByCustomer.get(String(instance.customer_id || "")) || {};
    const progress = calculateJourneyProgress({ instance: { ...instance, definition_key: definitionKey }, definition });
    if (instance.customer_id) journeyCustomerIds.add(String(instance.customer_id));
    items.push(journeyItem({ progress, instance, customer, project, events: eventsByInstance.get(String(instance.id)) || [], now }));
  }

  for (const customer of data.customers || []) {
    if (journeyCustomerIds.has(String(customer.id))) continue;
    const project = projectsByCustomer.get(String(customer.id)) || {};
    const invoice = invoiceForCustomer(customer, invoicesByProfile);
    const demo = demosByCustomer.get(String(customer.id)) || {};
    const lead = leads.get(String(demo.lead_id || "")) || {};
    const estimate = resolveLegacyJourney({
      customer,
      project,
      invoice,
      lead,
      preview: demo.id ? { status: mapDemoStatus(demo.demo_status), updated_at: demo.updated_at || demo.preview_generated_at } : {},
    });
    items.push(legacyItem(estimate, customer, project, []));
    representedLegacyCustomerIds.add(String(customer.id));
  }

  for (const demo of data.demoJourneys || []) {
    if (demo.customer_id && journeyCustomerIds.has(String(demo.customer_id))) continue;
    if (demo.customer_id && representedLegacyCustomerIds.has(String(demo.customer_id))) continue;
    const customer = customers.get(String(demo.customer_id || "")) || {};
    const lead = leads.get(String(demo.lead_id || "")) || {};
    const estimate = resolveLegacyJourney({
      customer: { ...customer, company: customer.company || demo.business_name || lead.company_name },
      lead,
      preview: { status: mapDemoStatus(demo.demo_status), updated_at: demo.updated_at || demo.preview_generated_at },
    });
    if (estimate.available) items.push(legacyItem(estimate, { ...customer, id: customer.id || `lead:${lead.id || demo.id}` }, {}, []));
  }

  const filtered = filterItems(items, filters);
  const page = pagination(filters, filtered.length);
  const journeys = filtered.slice(page.offset, page.offset + page.limit);
  const recentEvents = sanitizeEvents(data.journeyEvents || []).slice(0, 50);
  const result = {
    available: true,
    disabled: false,
    source: snapshot.journeyTablesAvailable ? "journey" : "legacy_estimate",
    journeyTablesAvailable: snapshot.journeyTablesAvailable,
    metrics: metrics(filtered, now()),
    journeys,
    recentEvents,
    pagination: { page: page.page, limit: page.limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / page.limit)) },
    warnings: snapshot.warnings || [],
    mailAutomation: { active: false, label: "Nog niet geactiveerd" },
  };
  log.info("admin_overview", { operation: "admin_overview", result: "success", source: result.source, durationMs: now() - startedAt, recordCount: journeys.length });
  return result;
}

function journeyItem({ progress, instance, customer, project, events, now }) {
  return {
    customerId: text(instance.customer_id),
    customerReference: customerReference(customer, instance.customer_id),
    productCode: text(instance.product_code || customer.package),
    projectReference: text(project.id),
    source: "journey",
    isEstimate: false,
    stale: isStale(progress.lastUpdatedAt, now()),
    ...progress,
    events: sanitizeEvents(events),
  };
}

function legacyItem(estimate, customer, project, events) {
  return {
    customerId: text(customer.id),
    customerReference: estimate.customerReference || customerReference(customer),
    productCode: estimate.productCode || text(customer.package),
    projectReference: text(project.id),
    stale: isStale(estimate.lastUpdatedAt, Date.now()),
    ...estimate,
    events: sanitizeEvents(events),
  };
}

function metrics(items, nowMs) {
  const active = items.filter((item) => item.source === "journey" && !item.complete && !["cancelled"].includes(item.status));
  const perPhase = items.reduce((counts, item) => {
    const phase = text(item.currentPhase) || "onbekend";
    counts[phase] = (counts[phase] || 0) + 1;
    return counts;
  }, {});
  return {
    activeJourneys: active.length,
    perPhase,
    customerActionRequired: items.filter((item) => item.customerActionRequired).length,
    internalActionRequired: items.filter((item) => item.internalActionRequired).length,
    blocked: items.filter((item) => item.blocked).length,
    stale: items.filter((item) => isStale(item.lastUpdatedAt, nowMs)).length,
    legacyWithoutJourney: items.filter((item) => item.source === "legacy_estimate").length,
    unavailable: items.filter((item) => item.source === "unavailable").length,
  };
}

function filterItems(items, filters) {
  const phase = text(filters.phase).toLowerCase();
  const status = text(filters.status).toLowerCase();
  const source = text(filters.source).toLowerCase();
  const customerId = text(filters.customerId || filters.customer_id);
  const action = text(filters.action).toLowerCase();
  return items.filter((item) => {
    if (phase && text(item.currentPhase).toLowerCase() !== phase) return false;
    if (status && text(item.status).toLowerCase() !== status) return false;
    if (source && item.source !== source) return false;
    if (customerId && item.customerId !== customerId) return false;
    if (action === "customer" && !item.customerActionRequired) return false;
    if (action === "internal" && !item.internalActionRequired) return false;
    if (action === "blocked" && !item.blocked) return false;
    return true;
  }).sort((a, b) => timestampMs(b.lastUpdatedAt) - timestampMs(a.lastUpdatedAt));
}

function sanitizeEvents(events) {
  return (Array.isArray(events) ? events : []).map((event) => ({
    id: text(event.id),
    eventType: text(event.event_type),
    entityType: text(event.entity_type),
    entityId: text(event.entity_id),
    occurredAt: validTimestamp(event.occurred_at || event.received_at),
  }));
}

function pagination(filters, total) {
  const limit = Math.max(1, Math.min(100, integer(filters.limit, 25)));
  const page = Math.max(1, integer(filters.page, 1));
  const maxPage = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, maxPage);
  return { page: safePage, limit, offset: (safePage - 1) * limit };
}

function emptyMetrics() {
  return { activeJourneys: 0, perPhase: {}, customerActionRequired: 0, internalActionRequired: 0, blocked: 0, stale: 0, legacyWithoutJourney: 0, unavailable: 0 };
}

function indexInvoices(invoices) {
  const index = new Map();
  for (const invoice of invoices) {
    for (const key of [invoice.profile_id, invoice.customer_auth_user_id].map(text).filter(Boolean)) {
      const current = index.get(key);
      if (!current || timestampMs(invoice.updated_at) > timestampMs(current.updated_at)) index.set(key, invoice);
    }
  }
  return index;
}

function invoiceForCustomer(customer, invoices) {
  return invoices.get(text(customer.profile_id)) || invoices.get(text(customer.auth_user_id)) || {};
}

function firstBy(rows = [], key) {
  const result = new Map();
  for (const row of rows || []) {
    const value = text(row[key]);
    if (value && !result.has(value)) result.set(value, row);
  }
  return result;
}

function groupBy(rows = [], key) {
  return (rows || []).reduce((groups, row) => {
    const value = text(row[key]);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
    return groups;
  }, new Map());
}

function mapDemoStatus(value) {
  const map = {
    aanvraag_ontvangen: "requested",
    briefing_klaar: "requested",
    intern_in_productie: "internal",
    interne_preview_klaar: "internal",
    preview_ingepland_voor_klant: "ready_for_review",
    preview_verstuurd: "ready_for_review",
    feedback_ontvangen: "feedback_received",
    aanpassingen_bezig: "feedback_received",
    definitieve_versie_klaar: "ready_for_review",
    belafspraak_gepland: "approved",
    verkocht: "approved",
  };
  return map[text(value).toLowerCase()] || "";
}

function customerReference(customer, fallbackId) {
  const company = text(customer.company || customer.company_name);
  const id = text(customer.id || fallbackId);
  return company || (id ? `Klant ${id.slice(0, 8)}` : "Onbekende klant");
}

function isStale(value, nowMs, days = 14) {
  const updated = timestampMs(value);
  return Boolean(updated && nowMs - updated > days * 86400000);
}

function validTimestamp(value) {
  const time = timestampMs(value);
  return time ? new Date(time).toISOString() : null;
}

function timestampMs(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value || "").trim();
}

module.exports = { createAdminJourneyReadService, _private: { filterItems, mapDemoStatus, pagination, sanitizeEvents } };
