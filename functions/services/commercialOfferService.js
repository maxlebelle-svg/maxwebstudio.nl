const crypto = require("node:crypto");
const {
  CATALOG_KEY,
  CATALOG_VERSION,
  CURRENCY,
  VAT_RATE,
  CLASSIFICATIONS,
  PRODUCTS,
  WEBSITE_PRODUCT_IDS,
  catalogChecksum,
  catalogSnapshot,
  stable,
} = require("../_commercial-catalog");

const PAYMENT_CHOICES = new Set(["fixed_deposit", "full", "none"]);
const CUSTOM_PRICE_ROLES = new Set(["super_admin"]);

function buildOfferVersion(input = {}, actor = {}) {
  const selections = Array.isArray(input.selections) ? input.selections : [];
  if (!selections.length || selections.length > 60) throw validation("Kies minimaal één en maximaal zestig producten.");
  const paymentChoice = clean(input.paymentChoice || "none").toLowerCase();
  if (!PAYMENT_CHOICES.has(paymentChoice)) throw validation("Ongeldige betaalkeuze.");

  const selectedIds = selections.map((entry) => clean(entry.productId));
  if (new Set(selectedIds).size !== selectedIds.length) throw validation("Een product mag maar één keer in een voorstel staan.");
  const websiteIds = selectedIds.filter((id) => WEBSITE_PRODUCT_IDS.includes(id));
  if (websiteIds.length > 1) throw validation("Een voorstel kan maximaal één websitepakket bevatten.");
  if (paymentChoice === "fixed_deposit" && websiteIds.length !== 1) throw validation("Een vaste aanbetaling vereist exact één websitepakket.");

  const lines = [];
  const customPriceEvents = [];
  selections.forEach((selection, selectionIndex) => {
    const productId = clean(selection.productId);
    const item = PRODUCTS[productId];
    if (!item?.active || !item.adminSelectable) throw validation(`Product is niet beschikbaar: ${productId || "onbekend"}.`);
    validateDependencies(item, selectedIds);
    const quantity = integer(selection.quantity ?? 1, "Ongeldig aantal.");
    if (quantity < Math.max(1, item.minQuantity || 1) || quantity > item.maxQuantity) throw validation(`Ongeldig aantal voor ${item.name}.`);
    const overrides = normalizeOverrides(selection.customComponents);

    if (!item.components.length) {
      const override = overrides.proposal;
      lines.push(buildLine(item, { code: "proposal", type: clean(override?.type || "one_time"), billingInterval: override?.billingInterval || null, amountExVatCents: null, startingAmountExVatCents: null }, quantity, override, actor, selectionIndex, customPriceEvents));
      return;
    }
    item.components.forEach((entry, componentIndex) => {
      lines.push(buildLine(item, entry, quantity, overrides[entry.code], actor, selectionIndex * 10 + componentIndex, customPriceEvents));
    });
  });

  const totals = calculateTotals(lines, websiteIds[0], paymentChoice);
  const snapshot = {
    catalogKey: CATALOG_KEY,
    catalogVersion: CATALOG_VERSION,
    catalogChecksum: catalogChecksum(),
    currency: CURRENCY,
    vatRate: VAT_RATE,
    paymentChoice,
    ...totals,
    lines,
  };
  const checksum = crypto.createHash("sha256").update(JSON.stringify(stable(snapshot))).digest("hex");
  return { ...snapshot, checksum, customPriceEvents };
}

function buildLine(item, component, quantity, override, actor, position, customPriceEvents) {
  const original = component.amountExVatCents ?? component.startingAmountExVatCents;
  const hasOverride = override && Number.isInteger(override.unitExVatCents);
  let unitExVatCents = item.classification === CLASSIFICATIONS.FIXED ? component.amountExVatCents : null;
  let bindingState = item.classification === CLASSIFICATIONS.FIXED ? "binding" : "non_binding";
  let priceClassification = item.classification;
  let customPriceReason = null;
  let customPriceAuthorizedBy = null;

  if (hasOverride) {
    if (!CUSTOM_PRICE_ROLES.has(role(actor.role))) throw forbidden("Alleen super_admin mag een definitieve maatwerkprijs autoriseren.");
    customPriceReason = clean(override.reason);
    if (customPriceReason.length < 8 || customPriceReason.length > 500) throw validation("Een maatwerkprijs vereist een duidelijke reden.");
    if (override.unitExVatCents < 0 || override.unitExVatCents > 100000000) throw validation("Maatwerkprijs valt buiten de veilige grens.");
    unitExVatCents = override.unitExVatCents;
    bindingState = "binding";
    priceClassification = "custom";
    customPriceAuthorizedBy = clean(actor.profileId);
    customPriceEvents.push({ productId: item.id, componentCode: component.code, originalCatalogUnitExVatCents: original, customUnitExVatCents: unitExVatCents, reason: customPriceReason });
  }

  const subtotalExVatCents = bindingState === "binding" ? unitExVatCents * quantity : null;
  const vatCents = subtotalExVatCents === null ? null : Math.round(subtotalExVatCents * VAT_RATE / 100);
  return {
    productId: item.id,
    productCode: item.code,
    productName: item.name,
    productDescription: item.description,
    componentCode: component.code,
    componentType: component.type === "recurring" ? "recurring" : "one_time",
    billingInterval: component.type === "recurring" ? (component.billingInterval || "monthly") : null,
    quantity,
    priceClassification,
    bindingState,
    originalCatalogUnitExVatCents: original,
    unitExVatCents,
    subtotalExVatCents,
    vatRate: VAT_RATE,
    vatCents,
    totalInclVatCents: subtotalExVatCents === null ? null : subtotalExVatCents + vatCents,
    customPriceReason,
    customPriceAuthorizedBy,
    position,
  };
}

function calculateTotals(lines, websiteId, paymentChoice) {
  const binding = lines.filter((line) => line.bindingState === "binding");
  const oneTime = binding.filter((line) => line.componentType === "one_time");
  const recurring = binding.filter((line) => line.componentType === "recurring");
  const oneTimeExVatCents = sum(oneTime, "subtotalExVatCents");
  const oneTimeVatCents = sum(oneTime, "vatCents");
  const recurringExVatCents = sum(recurring, "subtotalExVatCents");
  const recurringVatCents = sum(recurring, "vatCents");
  const fixedDepositExVatCents = paymentChoice === "fixed_deposit" ? PRODUCTS[websiteId].fixedDepositExVatCents : 0;
  const dueNowExVatCents = paymentChoice === "full" ? oneTimeExVatCents : fixedDepositExVatCents;
  const dueNowVatCents = Math.round(dueNowExVatCents * VAT_RATE / 100);
  return {
    oneTimeExVatCents,
    oneTimeVatCents,
    oneTimeInclVatCents: oneTimeExVatCents + oneTimeVatCents,
    recurringExVatCents,
    recurringVatCents,
    recurringInclVatCents: recurringExVatCents + recurringVatCents,
    fixedDepositExVatCents,
    dueNowExVatCents,
    dueNowVatCents,
    dueNowInclVatCents: dueNowExVatCents + dueNowVatCents,
    remainingExVatCents: Math.max(0, oneTimeExVatCents - dueNowExVatCents),
    hasNonBindingLines: lines.some((line) => line.bindingState !== "binding"),
  };
}

function normalizeOverrides(value) {
  if (!value) return {};
  if (!Array.isArray(value)) throw validation("Ongeldige maatwerkcomponenten.");
  return Object.fromEntries(value.map((entry) => {
    const code = clean(entry.componentCode || "proposal");
    const amount = Number(entry.unitExVatCents);
    if (!code || !Number.isInteger(amount)) throw validation("Ongeldige maatwerkcomponent.");
    return [code, { unitExVatCents: amount, reason: entry.reason, type: entry.type, billingInterval: entry.billingInterval }];
  }));
}

function validateDependencies(item, selectedIds) {
  if (item.dependencies.length && !item.dependencies.some((dependency) => selectedIds.includes(dependency))) throw validation(`${item.name} vereist een passend basisproduct.`);
}

function catalogRegistrationPayload() {
  const snapshot = catalogSnapshot();
  return { catalog_key: CATALOG_KEY, version: CATALOG_VERSION, checksum_sha256: catalogChecksum(snapshot), snapshot };
}

function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] || 0), 0); }
function clean(value) { return String(value || "").trim(); }
function role(value) { return clean(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function integer(value, message) { const result = Number(value); if (!Number.isInteger(result)) throw validation(message); return result; }
function validation(message) { return Object.assign(new Error(message), { statusCode: 400, code: "OFFER_VALIDATION_FAILED" }); }
function forbidden(message) { return Object.assign(new Error(message), { statusCode: 403, code: "CUSTOM_PRICE_FORBIDDEN" }); }

module.exports = {
  buildOfferVersion,
  catalogRegistrationPayload,
  PAYMENT_CHOICES,
};
