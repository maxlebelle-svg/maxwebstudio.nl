import { ENVIRONMENTS, PROVIDERS, getCurrentEnvironment, getCurrentProviderType } from "../config/environment.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import {
  LEADFINDER_CALL_STATUSES,
  normalizeLeadFinderLead,
  saveLeadFinderLeadLocally,
  updateLeadFinderLeadLocally,
} from "./leadFinderService.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALL_STATUS_VALUES = new Set(LEADFINDER_CALL_STATUSES.map((item) => item.value));

function storageAvailable() {
  return typeof localStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function todayLabel() {
  return new Date().toISOString().slice(0, 10);
}

function readFlag(key) {
  if (!storageAvailable()) return false;
  return ["true", "1", "yes", "ja", "enabled"].includes(String(localStorage.getItem(key) || "").toLowerCase());
}

function writeStatus(status = {}) {
  if (!storageAvailable()) return status;
  const payload = {
    ...status,
    checkedAt: status.checkedAt || nowIso(),
  };
  localStorage.setItem(STORAGE_KEYS.lastLeadNoteWriteStatus, JSON.stringify(payload));
  return payload;
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

function appendNote(existingNotes = "", note = "") {
  const cleanExisting = String(existingNotes || "").trim();
  const cleanNote = String(note || "").trim();
  if (!cleanNote) return cleanExisting;
  const line = `${todayLabel()}: ${cleanNote}`;
  return cleanExisting ? `${cleanExisting}\n${line}` : line;
}

function remoteLeadId(lead = {}) {
  const id = String(lead._supabaseId || lead.id || "").trim();
  return isUuid(id) ? id : "";
}

function isLocalLead(lead = {}) {
  return !lead._source || lead._source === "local";
}

export function getLeadNoteWriteReadiness() {
  const providerMode = getCurrentProviderType();
  const environment = getCurrentEnvironment();
  const browserFlag = typeof window !== "undefined" && window.__MAXWEBSTUDIO_LEAD_NOTE_WRITE__ === true;
  const flagEnabled = readFlag(STORAGE_KEYS.leadNoteWriteEnabled) || browserFlag;
  const supabaseStatus = supabaseProvider.getStatus();
  const missing = [];
  if (providerMode !== PROVIDERS.SUPABASE_WRITE_TEST) missing.push("Provider mode moet supabase-write-test zijn.");
  if (!flagEnabled) missing.push(`${STORAGE_KEYS.leadNoteWriteEnabled}=true ontbreekt.`);
  if (environment === ENVIRONMENTS.PRODUCTION) missing.push("Productieomgeving blokkeert lead note write MVP.");
  if (!supabaseStatus.configured) missing.push("Supabase URL/anon key ontbreekt in runtime-config.");

  const allowed = missing.length === 0;
  return {
    allowed,
    missing,
    providerMode,
    environment,
    flagEnabled,
    supabaseConfigured: Boolean(supabaseStatus.configured),
    mode: "lead_notes_append_only",
    writesEnabled: allowed,
    table: "leads",
    restrictions: [
      "notes/updated_at/metadata only",
      "geen lead delete",
      "geen volledige lead overwrite",
      "local fallback actief",
    ],
  };
}

export function validateLeadNotePayload(lead = {}, note = "") {
  const normalized = normalizeLeadFinderLead(lead);
  const cleanNote = String(note || "").trim();
  const errors = [];
  if (!normalized.id) errors.push("Lead id ontbreekt.");
  if (!cleanNote || cleanNote.length < 2) errors.push("Notitie is verplicht en moet minimaal 2 tekens bevatten.");
  if (cleanNote.length > 1500) errors.push("Notitie mag maximaal 1500 tekens bevatten.");
  return { valid: errors.length === 0, errors, lead: normalized, note: cleanNote };
}

function saveLeadNoteLocally(lead = {}, note = "", options = {}) {
  const normalized = normalizeLeadFinderLead(lead);
  const updates = {
    ...normalized,
    notes: appendNote(normalized.notes, note),
    source: normalized.source || "lead_note_fallback",
    updatedAt: nowIso(),
  };
  if (options.callStatus && CALL_STATUS_VALUES.has(options.callStatus)) updates.callStatus = options.callStatus;
  return saveLeadFinderLeadLocally(updates);
}

function mapSupabaseLeadToLocalLead(row = {}, fallback = {}) {
  return normalizeLeadFinderLead({
    ...fallback,
    id: row.id || fallback.id,
    companyName: row.company || row.name || fallback.companyName,
    industry: row.branch || fallback.industry,
    region: row.region || fallback.region,
    phone: row.phone || fallback.phone,
    email: row.email || fallback.email,
    websiteUrl: row.website_url || fallback.websiteUrl,
    websiteStatus: fallback.websiteStatus,
    leadScore: row.lead_score ?? fallback.leadScore,
    callStatus: fallback.callStatus,
    followUpDate: row.follow_up_date || fallback.followUpDate,
    notes: row.notes || fallback.notes,
    source: "supabase_lead_note_write_mvp",
    convertedCustomerId: row.converted_customer_id || fallback.convertedCustomerId,
    createdAt: row.created_at || fallback.createdAt,
    updatedAt: row.updated_at || fallback.updatedAt,
  });
}

export async function saveLeadNoteWithWriteFallback(lead = {}, note = "", options = {}) {
  const validation = validateLeadNotePayload(lead, note);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(" "));
    error.validationErrors = validation.errors;
    throw error;
  }

  const readiness = getLeadNoteWriteReadiness();
  const leadId = remoteLeadId(lead);
  if (!readiness.allowed || !leadId) {
    const localLead = isLocalLead(lead)
      ? updateLeadFinderLeadLocally(validation.lead.id, {
        notes: appendNote(validation.lead.notes, validation.note),
        callStatus: options.callStatus && CALL_STATUS_VALUES.has(options.callStatus) ? options.callStatus : validation.lead.callStatus,
      }) || saveLeadNoteLocally(validation.lead, validation.note, options)
      : saveLeadNoteLocally(validation.lead, validation.note);
    writeStatus({
      status: "fallback_local",
      fallbackUsed: true,
      reason: !leadId ? "Remote lead id ontbreekt of is geen UUID." : readiness.missing.join(" "),
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      leadId: localLead?.id || validation.lead.id,
    });
    return { lead: localLead, fallbackUsed: true, status: "fallback_local", readiness };
  }

  try {
    const existingMetadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
    const notes = appendNote(validation.lead.notes, validation.note);
    const result = await supabaseProvider.appendLeadNote(leadId, {
      notes,
      updated_at: nowIso(),
      metadata: {
        ...existingMetadata,
        createdBy: "lead-note-write-mvp",
        lastLeadNoteWriteAt: nowIso(),
        safeToArchive: true,
        clientWritePhase: "35B",
      },
    }, { leadNoteWrite: true });
    const localMirror = saveLeadFinderLeadLocally(mapSupabaseLeadToLocalLead(result.data, validation.lead));
    writeStatus({
      status: "supabase_updated",
      fallbackUsed: false,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      leadId: localMirror.id,
      supabaseLeadId: result.data?.id || "",
    });
    return { lead: localMirror, fallbackUsed: false, status: "supabase_updated", readiness, result };
  } catch (error) {
    const localLead = saveLeadNoteLocally(validation.lead, validation.note);
    writeStatus({
      status: "fallback_after_supabase_error",
      fallbackUsed: true,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      leadId: localLead.id,
      error: error.message || "Supabase lead note write is mislukt.",
    });
    return { lead: localLead, fallbackUsed: true, status: "fallback_after_supabase_error", readiness, error };
  }
}
