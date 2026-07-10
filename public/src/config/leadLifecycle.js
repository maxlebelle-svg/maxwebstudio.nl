export const LEAD_LIFECYCLE_STATUSES = Object.freeze([
  { value: "new", label: "Nieuw", className: "status-prepared" },
  { value: "reviewing", label: "Wordt beoordeeld", className: "status-planned" },
  { value: "interesting", label: "Interessant", className: "status-active" },
  { value: "not_interesting", label: "Niet interessant", className: "status-attention" },
  { value: "assigned", label: "Toegewezen", className: "status-prepared" },
  { value: "call_scheduled", label: "Belmoment gepland", className: "status-planned" },
  { value: "contact_attempted", label: "Belpoging gedaan", className: "status-warning" },
  { value: "contacted", label: "Contact gehad", className: "status-active" },
  { value: "follow_up", label: "Opvolgen", className: "status-warning" },
  { value: "appointment_scheduled", label: "Afspraak gepland", className: "status-planned" },
  { value: "demo_requested", label: "Demo aangevraagd", className: "status-prepared" },
  { value: "demo_building", label: "Demo in productie", className: "status-planned" },
  { value: "demo_ready", label: "Demo klaar", className: "status-active" },
  { value: "demo_sent", label: "Demo verstuurd", className: "status-active" },
  { value: "proposal_sent", label: "Voorstel verstuurd", className: "status-prepared" },
  { value: "negotiation", label: "Onderhandeling", className: "status-warning" },
  { value: "won", label: "Verkocht", className: "status-active" },
  { value: "lost", label: "Verloren", className: "status-attention" },
  { value: "customer", label: "Klant", className: "status-active" },
]);

export const LEAD_REJECTION_REASONS = Object.freeze([
  { value: "website_already_good", label: "Website is al goed" },
  { value: "no_suitable_contact_details", label: "Geen geschikte contactgegevens" },
  { value: "business_inactive", label: "Bedrijf lijkt niet actief" },
  { value: "too_small_no_commercial_chance", label: "Te klein of geen commerciële kans" },
  { value: "wrong_business_type", label: "Geen passend type bedrijf" },
  { value: "outside_target_group", label: "Buiten doelgroep" },
  { value: "outside_region", label: "Buiten werkgebied" },
  { value: "already_customer", label: "Al klant" },
  { value: "competitor", label: "Concurrent" },
  { value: "duplicate_lead", label: "Dubbele lead" },
  { value: "no_interest", label: "Geen interesse" },
  { value: "no_budget", label: "Geen budget" },
  { value: "other", label: "Anders" },
]);

const LEGACY_STATUS_MAP = Object.freeze({
  lead: "new",
  nieuw: "new",
  new: "new",
  bellen: "call_scheduled",
  te_bellen: "call_scheduled",
  contact_planned: "call_scheduled",
  contact_attempted: "contact_attempted",
  belpoging: "contact_attempted",
  gebeld: "contacted",
  contacted: "contacted",
  voicemail: "follow_up",
  opvolgen: "follow_up",
  follow_up: "follow_up",
  appointment_scheduled: "appointment_scheduled",
  afspraak_gepland: "appointment_scheduled",
  interesse: "interesting",
  qualified: "interesting",
  offerte: "proposal_sent",
  quote_ready: "proposal_sent",
  quote_sent: "proposal_sent",
  voorstel_verstuurd: "proposal_sent",
  negotiation: "negotiation",
  onderhandeling: "negotiation",
  verkocht: "won",
  won: "won",
  geconverteerd: "customer",
  klant_actief: "customer",
  customer_active: "customer",
  lost: "lost",
  geen_interesse: "not_interesting",
  archived: "lost",
  gearchiveerd: "lost",
});

export function normalizeLeadLifecycleStatus(value = "") {
  const key = String(value || "").trim().toLowerCase();
  return LEGACY_STATUS_MAP[key] || key || "new";
}

export function getLeadLifecycleConfig(value = "") {
  const status = normalizeLeadLifecycleStatus(value);
  return LEAD_LIFECYCLE_STATUSES.find((item) => item.value === status) || LEAD_LIFECYCLE_STATUSES[0];
}

export function getLeadRejectionReasonLabel(value = "") {
  return LEAD_REJECTION_REASONS.find((item) => item.value === value)?.label || value || "";
}
