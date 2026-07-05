"use strict";

/**
 * Mock adapter for the future Brand & Print Center order layer.
 *
 * Environment placeholders for later provider wiring:
 * PRINT_PROVIDER=mock
 * PRINT_API_KEY=
 * PRINT_API_BASE_URL=
 *
 * Brand & Print Center input:
 * - Uses brandAssets from the AI Content Library as the basis for mockups.
 * - Later uses printProviderAdapter for real catalog, pricing, ordering, and status calls.
 *
 * TODO future API partners, without credentials:
 * - Print.com API
 * - HelloPrint / HelloConnect API
 * - FLYERALARM PRO Reseller API
 * - PrintAPI.nl REST API
 * - Drukwerkdeal / Printdeal API
 */

const catalog = [
  { id: "business-cards", name: "Visitekaartjes", category: "Drukwerk", basePrice: 39, leadTime: "3-5 werkdagen" },
  { id: "flyers", name: "Flyers", category: "Drukwerk", basePrice: 79, leadTime: "4-6 werkdagen" },
  { id: "letterhead", name: "Briefpapier", category: "Kantoor", basePrice: 59, leadTime: "5 werkdagen" },
  { id: "pens", name: "Pennen", category: "Merchandise", basePrice: 119, leadTime: "7-10 werkdagen" },
  { id: "notepads", name: "Kladblokken", category: "Kantoor", basePrice: 99, leadTime: "6-8 werkdagen" },
  { id: "agendas", name: "Agenda's", category: "Merchandise", basePrice: 149, leadTime: "10 werkdagen" },
  { id: "stickers", name: "Stickers", category: "Signing", basePrice: 49, leadTime: "4-6 werkdagen" },
  { id: "rollup-banners", name: "Roll-up banners", category: "Events", basePrice: 129, leadTime: "5-7 werkdagen" },
  { id: "workwear", name: "Bedrijfskleding", category: "Textiel", basePrice: 189, leadTime: "10-14 werkdagen" },
  { id: "vehicle-wrap", name: "Auto/bus bestickering", category: "Signing", basePrice: 399, leadTime: "Op aanvraag" },
  { id: "facade-signage", name: "Gevelreclame", category: "Signing", basePrice: 499, leadTime: "Op aanvraag" },
  { id: "window-stickers", name: "Raamstickers", category: "Signing", basePrice: 89, leadTime: "5-8 werkdagen" },
];

const optionsByProduct = {
  default: {
    quantities: [50, 100, 250, 500, 1000],
    materials: ["Standaard", "Premium mat", "Premium glans", "Gerecycled"],
    finishes: ["Geen", "Mat laminaat", "Glans laminaat", "Soft touch"],
  },
  pens: {
    quantities: [100, 250, 500, 1000],
    materials: ["Blauwschrijvend", "Zwartschrijvend", "Metaal", "Gerecycled kunststof"],
    finishes: ["Een kleur bedrukking", "Full-color bedrukking"],
  },
  workwear: {
    quantities: [10, 25, 50, 100],
    materials: ["T-shirt", "Polo", "Sweater", "Softshell jas"],
    finishes: ["Borstlogo", "Ruglogo", "Borst- en ruglogo"],
  },
  "vehicle-wrap": {
    quantities: [1, 2, 5, 10],
    materials: ["Deurstickers", "Halve wrap", "Volledige wrap"],
    finishes: ["Ontwerpcontrole", "Montage op locatie", "Montage bij partner"],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getProduct(productId) {
  return catalog.find((product) => product.id === productId) || catalog[0];
}

function demoResult(action, payload = {}) {
  return {
    provider: "mock",
    action,
    success: true,
    productionConnected: false,
    ...payload,
  };
}

export async function getCatalog() {
  return demoResult("getCatalog", { catalog: clone(catalog) });
}

export async function getProductOptions(productId) {
  const options = optionsByProduct[productId] || optionsByProduct.default;
  return demoResult("getProductOptions", {
    productId,
    options: clone(options),
  });
}

export async function calculatePrice(config = {}) {
  const product = getProduct(config.productId);
  const quantity = Number(config.quantity || 100);
  const materialFactor = String(config.material || "").toLowerCase().includes("premium") ? 1.22 : 1;
  const finishFactor = String(config.finish || "").toLowerCase() === "geen" ? 1 : 1.14;
  const price = Math.round((product.basePrice + quantity * 0.18) * materialFactor * finishFactor);

  return demoResult("calculatePrice", {
    config: clone(config),
    currency: "EUR",
    estimatedTotal: price,
    vatIncluded: false,
  });
}

export async function createDraftOrder(order = {}) {
  return demoResult("createDraftOrder", {
    draftOrder: {
      id: `draft-print-${Date.now()}`,
      status: "Concept offerte",
      createdAt: new Date().toISOString(),
      ...order,
    },
  });
}

export async function getOrderStatus(orderId) {
  return demoResult("getOrderStatus", {
    orderId,
    status: "Demo concept",
    note: "Er is geen order geplaatst bij een printpartner.",
  });
}

