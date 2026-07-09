import { STORAGE_KEYS } from "../config/storageKeys.js";

export const LEADFINDER_WEBSITE_STATUSES = Object.freeze([
  { value: "geen_website", label: "Geen website" },
  { value: "verouderd", label: "Verouderd" },
  { value: "traag", label: "Traag" },
  { value: "niet_mobielvriendelijk", label: "Niet mobielvriendelijk" },
  { value: "geen_ssl", label: "Geen SSL" },
  { value: "onbekend", label: "Onbekend" },
]);

export const LEADFINDER_CALL_STATUSES = Object.freeze([
  { value: "lead", label: "Lead" },
  { value: "bellen", label: "Bellen" },
  { value: "offerte", label: "Offerte" },
  { value: "verkocht", label: "Verkocht" },
  { value: "klant_actief", label: "Klant actief" },
  { value: "nieuw", label: "Nieuw" },
  { value: "contact_planned", label: "Contact gepland" },
  { value: "contacted", label: "Contact gehad" },
  { value: "qualified", label: "Gekwalificeerd" },
  { value: "quote_ready", label: "Offerte klaar" },
  { value: "quote_sent", label: "Offerte verzonden" },
  { value: "won", label: "Verkocht" },
  { value: "lost", label: "Niet doorgegaan" },
  { value: "customer_active", label: "Klant actief" },
  { value: "te_bellen", label: "Te bellen" },
  { value: "gebeld", label: "Gebeld" },
  { value: "voicemail", label: "Voicemail" },
  { value: "interesse", label: "Interesse" },
  { value: "opvolgen", label: "Opvolgen" },
  { value: "geen_interesse", label: "Geen interesse" },
  { value: "archived", label: "Gearchiveerd" },
  { value: "geconverteerd", label: "Geconverteerd" },
]);

export const LEADFINDER_SCORE_BUCKETS = Object.freeze([
  { value: "80", label: "80+ hoge kans" },
  { value: "60", label: "60+ warm" },
  { value: "40", label: "40+ oriënteren" },
]);

const WEBSITE_STATUS_VALUES = new Set(LEADFINDER_WEBSITE_STATUSES.map((item) => item.value));
const CALL_STATUS_VALUES = new Set(LEADFINDER_CALL_STATUSES.map((item) => item.value));

function createId(prefix = "leadfinder") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeString(value) {
  return String(value || "").trim();
}

function sanitizeScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function readJson(key, fallback = []) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.warn(`Kon ${key} niet lezen`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function normalizeLeadFinderLead(lead = {}) {
  const createdAt = sanitizeString(lead.createdAt) || nowIso();
  const websiteStatus = WEBSITE_STATUS_VALUES.has(lead.websiteStatus) ? lead.websiteStatus : "onbekend";
  const callStatus = CALL_STATUS_VALUES.has(lead.callStatus) ? lead.callStatus : "nieuw";
  const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
  const websiteAnalysis = lead.websiteAnalysis && typeof lead.websiteAnalysis === "object"
    ? lead.websiteAnalysis
    : metadata.websiteAnalysis && typeof metadata.websiteAnalysis === "object"
      ? metadata.websiteAnalysis
      : null;
  const analysisScore = websiteAnalysis?.ok && Number.isFinite(Number(websiteAnalysis.score)) ? websiteAnalysis.score : null;
  return {
    id: sanitizeString(lead.id) || createId(),
    companyName: sanitizeString(lead.companyName || lead.company || lead.businessName),
    contactName: sanitizeString(lead.contactName || lead.contact || lead.contactPerson || lead.contact_person || lead.person || lead.name),
    industry: sanitizeString(lead.industry || lead.branche),
    region: sanitizeString(lead.region || lead.city || lead.plaats),
    phone: sanitizeString(lead.phone),
    email: sanitizeString(lead.email),
    websiteUrl: sanitizeString(lead.websiteUrl || lead.website),
    websiteStatus,
    leadScore: sanitizeScore(analysisScore ?? lead.leadScore ?? lead.score),
    callStatus,
    followUpDate: sanitizeString(lead.followUpDate),
    notes: sanitizeString(lead.notes),
    source: sanitizeString(lead.source) || "handmatig",
    googlePlaceId: sanitizeString(lead.googlePlaceId || lead.google_place_id || lead.placeId),
    googleMapsUrl: sanitizeString(lead.googleMapsUrl || lead.google_maps_url || lead.mapsUrl),
    websiteAnalysis,
    convertedCustomerId: sanitizeString(lead.convertedCustomerId),
    ownerAuthUserId: sanitizeString(lead.ownerAuthUserId || lead.owner_auth_user_id || lead.assignedAuthUserId || lead.assigned_auth_user_id || metadata.ownerAuthUserId || metadata.owner_auth_user_id),
    ownerProfileId: sanitizeString(lead.ownerProfileId || lead.owner_profile_id || lead.assignedProfileId || lead.assigned_profile_id || metadata.ownerProfileId || metadata.owner_profile_id),
    ownerEmail: sanitizeString(lead.assignedUserEmail || lead.assigned_user_email || metadata.assignedUserEmail || metadata.assigned_user_email || lead.assignedToEmail || lead.assigned_to_email || metadata.assignedToEmail || metadata.assigned_to_email || lead.medewerkerEmail || lead.medewerker_email || metadata.medewerkerEmail || metadata.medewerker_email || lead.employeeEmail || lead.employee_email || metadata.employeeEmail || metadata.employee_email || lead.salesPartnerEmail || lead.sales_partner_email || metadata.salesPartnerEmail || metadata.sales_partner_email || lead.ownerEmail || lead.owner_email || metadata.ownerEmail || metadata.owner_email || lead.userEmail || lead.user_email || metadata.userEmail || metadata.user_email),
    ownerName: sanitizeString(lead.assignedUserName || lead.assigned_user_name || metadata.assignedUserName || metadata.assigned_user_name || lead.assignedToName || lead.assigned_to_name || metadata.assignedToName || metadata.assigned_to_name || lead.medewerker || metadata.medewerker || lead.employee || metadata.employee || lead.salesPartnerName || lead.sales_partner_name || metadata.salesPartnerName || metadata.sales_partner_name || lead.ownerName || lead.owner_name || metadata.ownerName || metadata.owner_name || lead.userName || lead.user_name || metadata.userName || metadata.user_name),
    assignedUserEmail: sanitizeString(lead.assignedUserEmail || lead.assigned_user_email || lead.assignedToEmail || lead.assigned_to_email || lead.medewerkerEmail || lead.medewerker_email || lead.employeeEmail || lead.employee_email || metadata.assignedUserEmail || metadata.assigned_user_email || metadata.assignedToEmail || metadata.assigned_to_email || metadata.medewerkerEmail || metadata.medewerker_email || metadata.employeeEmail || metadata.employee_email),
    assignedUserId: sanitizeString(lead.assignedUserId || lead.assigned_user_id || metadata.assignedUserId || metadata.assigned_user_id),
    assignedUserName: sanitizeString(lead.assignedUserName || lead.assigned_user_name || lead.assignedToName || lead.assigned_to_name || lead.medewerker || lead.employee || metadata.assignedUserName || metadata.assigned_user_name || metadata.assignedToName || metadata.assigned_to_name || metadata.medewerker || metadata.employee),
    salesPartnerEmail: sanitizeString(lead.salesPartnerEmail || lead.sales_partner_email || metadata.salesPartnerEmail || metadata.sales_partner_email),
    salesPartnerName: sanitizeString(lead.salesPartnerName || lead.sales_partner_name || metadata.salesPartnerName || metadata.sales_partner_name),
    createdBy: sanitizeString(lead.createdBy || lead.created_by || lead.created_by_auth_user_id || metadata.createdBy || metadata.created_by),
    createdByEmail: sanitizeString(lead.createdByEmail || lead.created_by_email || metadata.createdByEmail || metadata.created_by_email),
    createdByName: sanitizeString(lead.createdByName || lead.created_by_name || metadata.createdByName || metadata.created_by_name),
    assignedTo: sanitizeString(lead.assignedTo || lead.assigned_to || metadata.assignedTo || metadata.assigned_to),
    metadata,
    isDemo: Boolean(lead.isDemo || lead.is_demo || metadata.isDemo),
    environment: sanitizeString(lead.environment || metadata.environment),
    createdAt,
    updatedAt: sanitizeString(lead.updatedAt) || createdAt,
  };
}

export function readLeadFinderLeads() {
  return readJson(STORAGE_KEYS.leadFinderLeads).map(normalizeLeadFinderLead);
}

function normalizeStoredLeadRecord(lead = {}, source = "local") {
  const normalized = normalizeLeadFinderLead({
    ...lead,
    companyName: lead.companyName || lead.company || lead.businessName || lead.packageInterest,
    contactName: lead.contactName || lead.name || lead.contact,
    websiteUrl: lead.websiteUrl || lead.website,
    notes: lead.notes || lead.message || lead.packageInterest || "",
    source: lead.source || source,
    callStatus: lead.callStatus || lead.status || "nieuw",
    websiteStatus: lead.websiteStatus || (lead.website || lead.websiteUrl ? "onbekend" : "geen_website"),
    leadScore: lead.leadScore || lead.score || 60,
  });
  return {
    ...normalized,
    _source: source,
  };
}

function uniqueLeadsByKey(leads = []) {
  const seen = new Set();
  return leads.filter((lead) => {
    const key = [
      lead.id,
      lead.email && `email:${lead.email.toLowerCase()}`,
      lead.phone && `phone:${lead.phone.replace(/[^\d+]/g, "")}`,
      lead.companyName && `company:${lead.companyName.toLowerCase()}`,
    ].filter(Boolean)[0];
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readAllLocalLeadSources() {
  const leadfinder = readLeadFinderLeads().map((lead) => ({ ...lead, _source: lead._source || "local" }));
  const leads = readJson(STORAGE_KEYS.leads).map((lead) => normalizeStoredLeadRecord(lead, "local-leads"));
  const requests = readJson(STORAGE_KEYS.leadRequests).map((lead) => normalizeStoredLeadRecord(lead, "homepage-aanvraag"));
  return uniqueLeadsByKey([...leadfinder, ...leads, ...requests]).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export function writeLeadFinderLeads(leads = []) {
  const normalized = leads.map(normalizeLeadFinderLead).sort((a, b) => {
    if (b.leadScore !== a.leadScore) return b.leadScore - a.leadScore;
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  writeJson(STORAGE_KEYS.leadFinderLeads, normalized);
  return normalized;
}

export function saveLeadFinderLeadLocally(lead = {}) {
  const leads = readLeadFinderLeads();
  const normalized = normalizeLeadFinderLead({ ...lead, updatedAt: nowIso() });
  const index = leads.findIndex((item) => item.id === normalized.id);
  if (index >= 0) leads[index] = normalized;
  else leads.unshift(normalized);
  writeLeadFinderLeads(leads);
  return normalized;
}

export function updateLeadFinderLeadLocally(leadId, updates = {}) {
  const leads = readLeadFinderLeads();
  const index = leads.findIndex((lead) => lead.id === leadId);
  if (index < 0) return null;
  const updated = normalizeLeadFinderLead({ ...leads[index], ...updates, updatedAt: nowIso() });
  leads[index] = updated;
  writeLeadFinderLeads(leads);
  return updated;
}

export function deleteLeadFinderLeadLocally(leadId) {
  const remaining = readLeadFinderLeads().filter((lead) => lead.id !== leadId);
  writeLeadFinderLeads(remaining);
  return remaining;
}

export function deleteLeadFromLocalSources(lead = {}) {
  const leadId = sanitizeString(lead.id);
  const email = sanitizeString(lead.email).toLowerCase();
  const phone = sanitizeString(lead.phone).replace(/[^\d+]/g, "");
  const companyName = sanitizeString(lead.companyName || lead.company || lead.businessName).toLowerCase();
  const matchesLead = (item = {}) => {
    const itemId = sanitizeString(item.id);
    const itemEmail = sanitizeString(item.email).toLowerCase();
    const itemPhone = sanitizeString(item.phone).replace(/[^\d+]/g, "");
    const itemCompany = sanitizeString(item.companyName || item.company || item.businessName || item.packageInterest).toLowerCase();
    return (leadId && itemId === leadId)
      || (email && itemEmail === email)
      || (phone && itemPhone === phone)
      || (companyName && itemCompany === companyName);
  };
  const sources = [STORAGE_KEYS.leadFinderLeads, STORAGE_KEYS.leads, STORAGE_KEYS.leadRequests];
  const result = sources.reduce((summary, key) => {
    const before = readJson(key);
    const after = before.filter((item) => !matchesLead(item));
    if (after.length !== before.length) {
      writeJson(key, after);
      summary.deleted += before.length - after.length;
      summary.sources.push(key);
    }
    return summary;
  }, { deleted: 0, sources: [] });
  return result;
}

export function getLeadFinderSummary(leads = readLeadFinderLeads()) {
  return leads.reduce((summary, lead) => {
    summary.total += 1;
    if (lead.leadScore >= 80) summary.hot += 1;
    if (["bellen", "offerte", "te_bellen", "opvolgen", "interesse", "contact_planned", "qualified", "quote_ready", "quote_sent", "won", "verkocht"].includes(lead.callStatus)) summary.actionNeeded += 1;
    if (["geconverteerd", "customer_active", "verkocht", "klant_actief"].includes(lead.callStatus) || lead.convertedCustomerId) summary.converted += 1;
    if (lead.followUpDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const followUp = new Date(`${lead.followUpDate}T00:00:00`);
      if (followUp <= today && !lead.convertedCustomerId && !["customer_active", "klant_actief"].includes(lead.callStatus)) summary.due += 1;
    }
    return summary;
  }, {
    total: 0,
    hot: 0,
    actionNeeded: 0,
    due: 0,
    converted: 0,
  });
}

export function ensureLeadFinderDemoData() {
  const existing = readLeadFinderLeads();
  if (existing.length) return existing;

  const demoLeads = [
    {
      id: "leadfinder-demo-aannemer-westland",
      companyName: "Van Dijk Renovatie",
      industry: "Bouwbedrijf",
      region: "Westland",
      phone: "0174-000000",
      email: "info@vandijk-renovatie.example",
      websiteUrl: "https://vandijk-renovatie.example",
      websiteStatus: "verouderd",
      leadScore: 88,
      callStatus: "te_bellen",
      followUpDate: "",
      notes: "Website oogt verouderd en mist duidelijke offerte-CTA. Kansrijk voor bouwbedrijf-demo.",
      source: "demo leadfinder",
    },
    {
      id: "leadfinder-demo-salon-utrecht",
      companyName: "Studio Bella Hair",
      industry: "Kapsalon",
      region: "Utrecht",
      phone: "030-0000000",
      email: "contact@studiobella.example",
      websiteUrl: "",
      websiteStatus: "geen_website",
      leadScore: 81,
      callStatus: "opvolgen",
      followUpDate: "",
      notes: "Actief op social media maar geen eigen website. Mogelijke starter website.",
      source: "demo leadfinder",
    },
    {
      id: "leadfinder-demo-installateur-breda",
      companyName: "Eco Installatie Breda",
      industry: "Installatie & verduurzaming",
      region: "Breda",
      phone: "076-0000000",
      email: "info@ecoinstallatie.example",
      websiteUrl: "https://ecoinstallatie.example",
      websiteStatus: "niet_mobielvriendelijk",
      leadScore: 92,
      callStatus: "interesse",
      followUpDate: "",
      notes: "Veel diensten, maar mobiele site is onduidelijk. Sluit goed aan op installatiebedrijf-demo.",
      source: "demo leadfinder",
    },
  ].map(normalizeLeadFinderLead);

  return writeLeadFinderLeads(demoLeads);
}

function readCustomers() {
  const primary = readJson(STORAGE_KEYS.crmCustomers);
  const fallback = readJson(STORAGE_KEYS.customers);
  const seen = new Set();
  return [...primary, ...fallback].filter((customer) => {
    const id = sanitizeString(customer.id || customer.customerId || customer.profileId);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function writeCustomers(customers) {
  writeJson(STORAGE_KEYS.crmCustomers, customers);
  writeJson(STORAGE_KEYS.customers, customers);
}

export function convertLeadFinderLeadToCustomer(leadId) {
  const lead = readLeadFinderLeads().find((item) => item.id === leadId);
  if (!lead) return null;
  if (lead.convertedCustomerId) return { lead, customer: readCustomers().find((item) => item.id === lead.convertedCustomerId), alreadyConverted: true };

  const customer = {
    id: createId("customer"),
    name: lead.companyName,
    company: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    website: lead.websiteUrl,
    package: "Nog te bepalen",
    status: "onboarding",
    portalStatus: "geen_login",
    customerSince: new Date().toISOString().slice(0, 10),
    notes: `Aangemaakt vanuit Leadfinder. Branche: ${lead.industry || "-"}; regio: ${lead.region || "-"}. ${lead.notes || ""}`.trim(),
    source: "leadfinder",
    leadFinderId: lead.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const customers = readCustomers().filter((item) => item.id !== customer.id);
  writeCustomers([customer, ...customers]);
  const updatedLead = updateLeadFinderLeadLocally(lead.id, {
    callStatus: "geconverteerd",
    convertedCustomerId: customer.id,
  });

  return { lead: updatedLead, customer, alreadyConverted: false };
}

export function getLeadFinderLabel(options, value, fallback = "Onbekend") {
  return options.find((item) => item.value === value)?.label || fallback;
}
