const { PRODUCTS } = require("./product-catalog");

const aliases = Object.freeze({
  starter: "starter_site",
  starter_site: "starter_site",
  business: "business_website",
  business_website: "business_website",
  premium: "premium_growth",
  premium_growth: "premium_growth",
});
const maintenanceCatalog = Object.freeze({
  none: { maintenanceCode: "none", maintenanceName: "Geen onderhoud", maintenanceAmountCents: 0, startTrigger: "none", description: "Je regelt hosting, updates en back-ups zelf.", benefits: [] },
  care_basic: { maintenanceCode: "care_basic", maintenanceName: PRODUCTS.care_basic.name, maintenanceAmountCents: Number(PRODUCTS.care_basic.monthlyExVatCents), startTrigger: "project_delivered", description: PRODUCTS.care_basic.description, benefits: ["Hosting", "SSL-certificaat", "Back-ups", "Technische monitoring"] },
  care_plus: { maintenanceCode: "care_plus", maintenanceName: PRODUCTS.care_plus.name, maintenanceAmountCents: Number(PRODUCTS.care_plus.monthlyExVatCents), startTrigger: "project_delivered", description: PRODUCTS.care_plus.description, benefits: ["Alles uit Basis onderhoud", "Kleine maandelijkse wijzigingen"] },
  care_growth: { maintenanceCode: "care_growth", maintenanceName: PRODUCTS.care_growth.name, maintenanceAmountCents: Number(PRODUCTS.care_growth.monthlyExVatCents), startTrigger: "project_delivered", description: PRODUCTS.care_growth.description, benefits: ["Alles uit Plus onderhoud", "Maandelijkse check", "Conversieadvies"] },
});

function normalizeWebsitePackage(value = "") {
  const token = String(value || "").trim().toLowerCase()
    .replace(/€\s*[\d.,]+/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const packageCode = aliases[token] || (token.includes("starter") ? "starter_site" : token.includes("business") ? "business_website" : token.includes("premium") || token.includes("growth") ? "premium_growth" : "");
  const product = packageCode ? PRODUCTS[packageCode] : null;
  if (!product || !["starter_site", "business_website", "premium_growth"].includes(packageCode)) return null;
  return {
    packageCode,
    packageName: product.name,
    totalAmountCents: Number(product.priceExVatCents),
    depositAmountCents: Number(product.depositExVatCents),
    currency: "EUR",
  };
}

function buildWebsiteCommercialOrder({ current = {}, customerId = "", projectId = "", websiteId = "", packageValue = "", source = "website_factory", now = new Date().toISOString() } = {}) {
  const selected = normalizeWebsitePackage(packageValue);
  if (!selected || !customerId || !projectId) return null;
  return {
    customerId,
    projectId,
    websiteId: websiteId || "",
    ...selected,
    paymentStatus: String(current.paymentStatus || "not_started"),
    status: String(current.status || "selected"),
    source,
    createdAt: current.createdAt || now,
    updatedAt: now,
  };
}

function readWebsiteCommercialOrder(project = {}) {
  const order = project?.metadata?.websiteCommercialOrder;
  if (!order || typeof order !== "object") return null;
  const normalized = normalizeWebsitePackage(order.packageCode || order.packageName);
  if (!normalized) return null;
  if (String(order.customerId || "") !== String(project.customer_id || project.customerId || "")) return null;
  if (String(order.projectId || "") !== String(project.id || "")) return null;
  return { ...order, ...normalized };
}

function normalizeMaintenance(value = "") {
  const code = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return maintenanceCatalog[code] ? { ...maintenanceCatalog[code] } : null;
}

function selectMaintenance(order = {}, { maintenanceCode = "", authUserId = "", confirmedNone = false, now = new Date().toISOString() } = {}) {
  const maintenance = normalizeMaintenance(maintenanceCode);
  if (!maintenance || (maintenance.maintenanceCode === "none" && confirmedNone !== true)) return null;
  const { description: _description, benefits: _benefits, ...commercialMaintenance } = maintenance;
  return {
    ...order,
    ...commercialMaintenance,
    maintenanceSelectedAt: now,
    maintenanceSelectedByAuthUserId: authUserId,
    maintenanceDeclinedAt: maintenance.maintenanceCode === "none" ? now : "",
    maintenanceDeclinedByAuthUserId: maintenance.maintenanceCode === "none" ? authUserId : "",
    status: "maintenance_selected",
    updatedAt: now,
  };
}

module.exports = { buildWebsiteCommercialOrder, maintenanceCatalog, normalizeMaintenance, normalizeWebsitePackage, readWebsiteCommercialOrder, selectMaintenance };
