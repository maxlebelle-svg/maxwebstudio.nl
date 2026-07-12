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
  none: { maintenanceCode: "none", maintenanceName: "Geen onderhoud", maintenanceAmountCents: 0, startTrigger: "none" },
  care_basic: { maintenanceCode: "care_basic", maintenanceName: "Basis onderhoud", maintenanceAmountCents: 1995, startTrigger: "project_delivered" },
  care_plus: { maintenanceCode: "care_plus", maintenanceName: "Plus onderhoud", maintenanceAmountCents: 4900, startTrigger: "project_delivered" },
  care_growth: { maintenanceCode: "care_growth", maintenanceName: "Groei onderhoud", maintenanceAmountCents: 9900, startTrigger: "project_delivered" },
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
  return {
    ...order,
    ...maintenance,
    maintenanceSelectedAt: now,
    maintenanceSelectedByAuthUserId: authUserId,
    maintenanceDeclinedAt: maintenance.maintenanceCode === "none" ? now : "",
    maintenanceDeclinedByAuthUserId: maintenance.maintenanceCode === "none" ? authUserId : "",
    status: "maintenance_selected",
    updatedAt: now,
  };
}

module.exports = { buildWebsiteCommercialOrder, maintenanceCatalog, normalizeMaintenance, normalizeWebsitePackage, readWebsiteCommercialOrder, selectMaintenance };
