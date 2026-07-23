export const CONTENT_GOALS = Object.freeze([
  { id: "leadgeneratie", name: "Leadgeneratie", hero_intents: ["conversion", "local", "proof"], cta_intents: ["quote", "call", "whatsapp", "callback"], proof_weight: "high" },
  { id: "afspraken", name: "Afspraken en reserveringen", hero_intents: ["conversion", "emotional"], cta_intents: ["appointment", "booking", "call"], proof_weight: "medium" },
  { id: "lokale-zichtbaarheid", name: "Lokale zichtbaarheid", hero_intents: ["local", "proof", "storytelling"], cta_intents: ["call", "directions", "appointment"], proof_weight: "high" },
  { id: "autoriteit", name: "Autoriteit en expertise", hero_intents: ["storytelling", "portfolio", "proof"], cta_intents: ["advice", "contact", "download"], proof_weight: "high" },
  { id: "portfolio", name: "Portfolio en bewijs", hero_intents: ["portfolio", "storytelling", "emotional"], cta_intents: ["view_projects", "contact", "quote"], proof_weight: "very-high" },
  { id: "directe-verkoop", name: "Directe verkoop", hero_intents: ["price", "conversion", "proof"], cta_intents: ["buy", "quote", "whatsapp", "call"], proof_weight: "medium" }
]);

export const DEFAULT_GOAL_ID = "leadgeneratie";

export function resolveContentGoal(value) {
  const normalized = String(value || DEFAULT_GOAL_ID).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return CONTENT_GOALS.find((goal) => goal.id === normalized) || null;
}

