"use strict";

/**
 * Mock adapter for the future AI Content Library data layer.
 *
 * Environment placeholders for later provider wiring:
 * BRAND_ASSETS_PROVIDER=mock
 *
 * AI Content Library output shape:
 * brandAssets: {
 *   logo,
 *   colors,
 *   fonts,
 *   images,
 *   copy,
 *   slogans,
 *   brandGuidelines
 * }
 *
 * This module is intentionally disconnected from Supabase, the client portal,
 * live customer data, and production website flows.
 */

const mockAssets = [
  {
    id: "asset-logo-primary",
    type: "logo",
    title: "Primair logo",
    category: "Logo's",
    status: "Goedgekeurd",
    usage: "Gebruikt op website",
    description: "Donker woordmerk met compact beeldmerk voor web en drukwerk.",
  },
  {
    id: "asset-image-hero",
    type: "images",
    title: "AI stock afbeelding - teamoverleg",
    category: "AI stock afbeeldingen",
    status: "Concept",
    usage: "Niet gekoppeld",
    description: "Warme zakelijke sfeer voor homepage, LinkedIn en brochurebeelden.",
  },
  {
    id: "asset-copy-home",
    type: "copy",
    title: "Homepage headline set",
    category: "Website teksten",
    status: "Goedgekeurd",
    usage: "Gebruikt op website",
    description: "Hero, USP-blokken en call-to-action teksten voor de huidige site.",
  },
  {
    id: "asset-blog-local-seo",
    type: "copy",
    title: "SEO-pagina lokale vindbaarheid",
    category: "Blogs/SEO-pagina's",
    status: "Concept",
    usage: "Klaar voor review",
    description: "Longform SEO-opzet met meta title, intro en FAQ-fragmenten.",
  },
  {
    id: "asset-social-launch",
    type: "copy",
    title: "Social launch posts",
    category: "Social media posts",
    status: "Goedgekeurd",
    usage: "Herbruikbaar",
    description: "Drie korte posts voor LinkedIn, Instagram en Facebook.",
  },
  {
    id: "asset-signature",
    type: "copy",
    title: "E-mailhandtekening sales",
    category: "E-mailhandtekeningen",
    status: "Goedgekeurd",
    usage: "Niet gekoppeld",
    description: "Compacte HTML-handtekening met logo, contactgegevens en CTA.",
  },
  {
    id: "asset-palette-core",
    type: "colors",
    title: "Kernpalet",
    category: "Kleurpaletten",
    status: "Goedgekeurd",
    usage: "Gebruikt op website",
    description: "Navy, helder blauw, fris groen en zachte neutrale kleuren.",
  },
  {
    id: "asset-fonts-ui",
    type: "fonts",
    title: "Typografie systeem",
    category: "Lettertypes",
    status: "Goedgekeurd",
    usage: "Gebruikt op website",
    description: "Inter voor UI, duidelijke hiërarchie voor web, offertes en drukwerk.",
  },
  {
    id: "asset-icons-service",
    type: "icons",
    title: "Service iconenset",
    category: "Iconen",
    status: "Concept",
    usage: "Niet gekoppeld",
    description: "Lijniconen voor diensten, support, snelheid en onderhoud.",
  },
  {
    id: "asset-guidelines-v1",
    type: "brandGuidelines",
    title: "Merkrichtlijnen v1",
    category: "Merkrichtlijnen",
    status: "Concept",
    usage: "Klaar voor review",
    description: "Basisregels voor logo, kleurgebruik, fotografie en tone of voice.",
  },
];

const mockBrandAssets = {
  logo: mockAssets.find((asset) => asset.type === "logo"),
  colors: ["#06121f", "#155eef", "#19c2ff", "#2bd982", "#f6f8fb"],
  fonts: ["Inter", "System UI"],
  images: mockAssets.filter((asset) => asset.type === "images"),
  copy: mockAssets.filter((asset) => asset.type === "copy"),
  slogans: ["Sterke websites, strak geregeld.", "Van merkidee naar online groei."],
  brandGuidelines: mockAssets.find((asset) => asset.type === "brandGuidelines"),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

export async function getBrandAssets(clientId = "demo-client") {
  return demoResult("getBrandAssets", {
    clientId,
    brandAssets: clone(mockBrandAssets),
  });
}

export async function listAssets(type = "all") {
  const assets = type === "all" ? mockAssets : mockAssets.filter((asset) => asset.type === type);
  return demoResult("listAssets", { type, assets: clone(assets) });
}

export async function saveAsset(asset) {
  return demoResult("saveAsset", {
    asset: {
      id: asset?.id || `asset-demo-${Date.now()}`,
      status: asset?.status || "Concept",
      ...asset,
    },
  });
}

export async function markAssetAsApproved(assetId) {
  return demoResult("markAssetAsApproved", {
    assetId,
    status: "Goedgekeurd",
  });
}

export async function linkAssetToProduct(assetId, productId) {
  return demoResult("linkAssetToProduct", {
    assetId,
    productId,
    message: "Demo-koppeling gemaakt. Nog niet verbonden met productie.",
  });
}

