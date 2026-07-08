"use strict";

import { loadBrandingState, preparePrintProposals, saveBrandingState, updatePrintStatus } from "./brand-assets-adapter.js";

export const PRINT_STATUSES = ["not_started", "designing", "ready", "approved", "ordered", "delivered"];

const catalog = [
  { id: "business-cards", name: "Visitekaartjes", category: "Print", basePrice: 39, leadTime: "3-5 werkdagen" },
  { id: "letterhead", name: "Briefpapier", category: "Print", basePrice: 59, leadTime: "5 werkdagen" },
  { id: "envelopes", name: "Enveloppen", category: "Print", basePrice: 69, leadTime: "5-7 werkdagen" },
  { id: "flyers", name: "Flyers", category: "Marketing", basePrice: 79, leadTime: "4-6 werkdagen" },
  { id: "folders", name: "Folders", category: "Marketing", basePrice: 99, leadTime: "5-7 werkdagen" },
  { id: "brochures", name: "Brochures", category: "Marketing", basePrice: 149, leadTime: "7-10 werkdagen" },
  { id: "rollup-banners", name: "Roll-up banners", category: "Events", basePrice: 129, leadTime: "5-7 werkdagen" },
  { id: "posters", name: "Posters", category: "Events", basePrice: 49, leadTime: "4-6 werkdagen" },
  { id: "stickers", name: "Stickers", category: "Signing", basePrice: 49, leadTime: "4-6 werkdagen" },
  { id: "workwear", name: "Kleding", category: "Textiel", basePrice: 189, leadTime: "10-14 werkdagen" },
  { id: "vehicle-lettering", name: "Voertuigbelettering", category: "Signing", basePrice: 399, leadTime: "Op aanvraag" },
  { id: "banners", name: "Spandoeken", category: "Signing", basePrice: 119, leadTime: "5-8 werkdagen" },
  { id: "gift-vouchers", name: "Cadeaubonnen", category: "Retail", basePrice: 89, leadTime: "5-7 werkdagen" },
  { id: "gift-cards", name: "Cadeaukaarten", category: "Retail", basePrice: 99, leadTime: "5-7 werkdagen" },
  { id: "presentation-folders", name: "Presentatiemappen", category: "Sales", basePrice: 159, leadTime: "7-10 werkdagen" },
  { id: "notepads", name: "Notitieblokken", category: "Kantoor", basePrice: 99, leadTime: "6-8 werkdagen" },
  { id: "proposal-folders", name: "Offertemappen", category: "Sales", basePrice: 149, leadTime: "7-10 werkdagen" },
];

const optionsByProduct = {
  default: {
    quantities: [50, 100, 250, 500, 1000],
    materials: ["Standaard", "Premium mat", "Premium glans", "Gerecycled"],
    finishes: ["Geen", "Mat laminaat", "Glans laminaat", "Soft touch"],
  },
  workwear: {
    quantities: [10, 25, 50, 100],
    materials: ["T-shirt", "Polo", "Sweater", "Softshell jas"],
    finishes: ["Borstlogo", "Ruglogo", "Borst- en ruglogo"],
  },
  "vehicle-lettering": {
    quantities: [1, 2, 5, 10],
    materials: ["Deurstickers", "Halve belettering", "Volledige belettering"],
    finishes: ["Ontwerpcontrole", "Montagevoorbereiding", "Montage op locatie"],
  },
};

export async function getCatalog() {
  return { success: true, catalog: clone(catalog) };
}

export async function getProductOptions(productId) {
  const options = optionsByProduct[productId] || optionsByProduct.default;
  return { success: true, productId, options: clone(options) };
}

export async function calculatePrice(config = {}) {
  const product = getProduct(config.productId);
  const quantity = Number(config.quantity || 100);
  const materialFactor = String(config.material || "").toLowerCase().includes("premium") ? 1.22 : 1;
  const finishFactor = String(config.finish || "").toLowerCase() === "geen" ? 1 : 1.14;
  const price = Math.round((product.basePrice + quantity * 0.18) * materialFactor * finishFactor);
  return {
    success: true,
    config: clone(config),
    currency: "EUR",
    estimatedTotal: price,
    vatIncluded: false,
  };
}

export async function createDraftOrder(order = {}) {
  const product = getProduct(order.productId);
  const state = loadBrandingState();
  const projectId = order.projectId || state.projects[0]?.id || "";
  if (projectId && !state.printAssets.some((asset) => asset.projectId === projectId)) preparePrintProposals(projectId);
  const nextState = loadBrandingState();
  const row = {
    id: order.id || `print-${product.id}-${Date.now()}`,
    projectId,
    customerId: order.customerId || nextState.projects.find((project) => project.id === projectId)?.customerId || "",
    assetName: product.name,
    printType: product.name,
    category: product.category,
    status: order.status || "designing",
    quantity: Number(order.quantity || 100),
    material: order.material || "",
    finish: order.finish || "",
    estimatedTotal: order.estimatedTotal || 0,
    sizeOrFormat: order.sizeOrFormat || product.name,
    supplierNotes: "Voorbereid in Brand Center.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  nextState.printAssets = [row, ...nextState.printAssets.filter((asset) => asset.id !== row.id)];
  saveBrandingState(nextState);
  return { success: true, draftOrder: row };
}

export async function getOrderStatus(orderId) {
  const state = loadBrandingState();
  const row = state.printAssets.find((asset) => asset.id === orderId);
  return {
    success: true,
    orderId,
    status: row?.status || "not_started",
    note: row ? "Printregistratie gevonden in Brand Center." : "Geen printregistratie gevonden.",
  };
}

export async function setOrderStatus(orderId, status) {
  if (!PRINT_STATUSES.includes(status)) return { success: false, error: "Onbekende printstatus." };
  updatePrintStatus(orderId, status);
  return getOrderStatus(orderId);
}

function getProduct(productId) {
  return catalog.find((product) => product.id === productId) || catalog[0];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
