const { PRODUCTS } = require("./product-catalog");

const aliases = Object.freeze({
  starter: "starter_site",
  starter_site: "starter_site",
  business: "business_website",
  business_website: "business_website",
  premium: "premium_growth",
  premium_growth: "premium_growth",
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

module.exports = { buildWebsiteCommercialOrder, normalizeWebsitePackage, readWebsiteCommercialOrder };
