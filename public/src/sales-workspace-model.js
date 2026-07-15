(function salesWorkspaceModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MaxSalesWorkspaceModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSalesWorkspaceModel() {
  "use strict";

  const PIPELINE_STAGES = Object.freeze([
    ["new", "Nieuwe lead"],
    ["contacted", "Gebeld"],
    ["interested", "Geïnteresseerd"],
    ["demo_planned", "Demo gepland"],
    ["demo_in_progress", "Demo in ontwikkeling"],
    ["demo_sent", "Demo verzonden"],
    ["awaiting_feedback", "Wacht op feedback"],
    ["approved", "Goedgekeurd"],
    ["awaiting_payment", "Wacht op betaling"],
    ["customer", "Klant"],
    ["closed", "Afgesloten"],
  ].map(([value, label]) => Object.freeze({ value, label })));

  const LEGACY_PIPELINE_MAP = Object.freeze({
    reviewing: "new", interesting: "interested", assigned: "new", call_scheduled: "new",
    contact_attempted: "contacted", follow_up: "contacted", appointment_scheduled: "demo_planned",
    demo_requested: "demo_planned", demo_building: "demo_in_progress", demo_ready: "demo_in_progress",
    proposal_sent: "awaiting_feedback", negotiation: "awaiting_feedback", won: "approved",
    lost: "closed", not_interesting: "closed",
  });

  const CALL_STATUS_MAP = Object.freeze({
    interested: "called", contacted: "called", no_answer: "no_answer", voicemail_left: "voicemail",
    callback_requested: "callback", wrong_number: "invalid_number", busy: "busy",
  });

  const SMART_VIEWS = Object.freeze([
    ["all", "Alle leads"], ["today", "Vandaag actie"], ["new", "Nieuwe leads"],
    ["interested", "Geïnteresseerd"], ["callback", "Terugbellen"], ["voicemail", "Voicemails"],
    ["not_interested", "Niet geïnteresseerd"], ["demos", "Demo’s"], ["payment", "Wacht op betaling"],
    ["won", "Gewonnen"], ["lost", "Verloren"], ["archived", "Gearchiveerd"],
    ["hot", "Warme leads"], ["customers", "Klanten"], ["closed", "Afgesloten"],
  ].map(([value, label]) => Object.freeze({ value, label })));

  const FAVORITE_WRITE_ROLES = new Set(["super_admin", "admin", "sales_manager", "sales_partner"]);

  const asText = (value) => String(value || "").trim();
  const dayKey = (value) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  function normalizeLead(lead = {}) {
    const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
    const rawPipeline = asText(lead.pipelineStage || lead.pipeline_stage || metadata.pipelineStage || metadata.pipeline_stage || lead.leadStatus || lead.lead_status || "new").toLowerCase();
    const rawOutcome = asText(lead.lastCallOutcome || lead.last_call_outcome || metadata.lastCallOutcome).toLowerCase();
    const pipelineStage = LEGACY_PIPELINE_MAP[rawPipeline] || rawPipeline || "new";
    const callStatus = asText(lead.callDisposition || lead.call_disposition || metadata.callDisposition || CALL_STATUS_MAP[rawOutcome] || (lead.lastContactedAt ? "called" : "not_called"));
    const score = Math.max(0, Math.min(100, Number(lead.leadScore || lead.lead_score || metadata.leadScore || 0)));
    const interestLevel = asText(lead.interestLevel || lead.interest_level || metadata.interestLevel || (rawOutcome === "not_interested" ? "not_interested" : score >= 80 ? "hot" : rawOutcome === "interested" ? "interested" : "unsure"));
    const priority = asText(lead.priority || metadata.priority || (score >= 80 ? "high" : score < 40 ? "low" : "normal"));
    const nextActionAt = asText(lead.nextActionAt || lead.next_action_at || metadata.nextActionAt || lead.followUpDate);
    const leadStatus = asText(lead.leadStatus || lead.lead_status || metadata.leadStatus || metadata.lead_status).toLowerCase();
    const archivedAt = asText(lead.archivedAt || lead.archived_at || metadata.archivedAt || metadata.archived_at);
    const wonAt = asText(lead.wonAt || lead.won_at || metadata.wonAt || metadata.won_at);
    const lostAt = asText(lead.lostAt || lead.lost_at || metadata.lostAt || metadata.lost_at);
    const lostReason = asText(lead.lostReason || lead.lost_reason || metadata.lostReason || metadata.lost_reason);
    const lostNote = asText(lead.lostNote || lead.lost_note || metadata.lostNote || metadata.lost_note);
    const isFavorite = Boolean(lead.isFavorite ?? lead.is_favorite ?? metadata.isFavorite ?? false);
    return { ...lead, pipelineStage, callDisposition: callStatus, interestLevel, priority, nextActionAt, leadScore: score, leadStatus, archivedAt, wonAt, lostAt, lostReason, lostNote, isFavorite };
  }

  function isArchivedLead(lead = {}) {
    const item = normalizeLead(lead);
    return Boolean(item.archivedAt) || ["archived", "gearchiveerd"].includes(item.leadStatus);
  }

  function isLostLead(lead = {}) {
    const item = normalizeLead(lead);
    return item.leadStatus === "lost"
      || (item.pipelineStage === "closed" && Boolean(item.lostAt || item.lostReason || item.lostNote));
  }

  function isWonLead(lead = {}) {
    const item = normalizeLead(lead);
    return item.pipelineStage === "customer" || ["won", "customer"].includes(item.leadStatus) || Boolean(item.wonAt);
  }

  function needsActionToday(lead, now = new Date()) {
    const item = normalizeLead(lead);
    if (["customer", "closed"].includes(item.pipelineStage)) return false;
    if (!item.nextActionAt) return ["new", "contacted", "interested"].includes(item.pipelineStage);
    return dayKey(item.nextActionAt) <= dayKey(now);
  }

  function matchesSmartView(lead, view = "all", now = new Date()) {
    const item = normalizeLead(lead);
    if (view === "today") return needsActionToday(item, now);
    if (view === "new") return item.pipelineStage === "new";
    if (view === "interested") return ["hot", "interested"].includes(item.interestLevel) && !isArchivedLead(item) && !isLostLead(item);
    if (view === "callback") return item.callDisposition === "callback";
    if (view === "voicemail") return item.callDisposition === "voicemail";
    if (view === "not_interested") return item.interestLevel === "not_interested";
    if (view === "hot") return item.interestLevel === "hot" || item.leadScore >= 80;
    if (view === "demos") return ["demo_planned", "demo_in_progress", "demo_sent", "awaiting_feedback"].includes(item.pipelineStage);
    if (view === "payment") return item.pipelineStage === "awaiting_payment";
    if (view === "won") return isWonLead(item);
    if (view === "lost") return isLostLead(item);
    if (view === "archived") return isArchivedLead(item);
    if (view === "customers") return item.pipelineStage === "customer";
    if (view === "closed") return item.pipelineStage === "closed";
    return true;
  }

  function matchesFilters(lead, filters = {}, now = new Date()) {
    const item = normalizeLead(lead);
    const query = asText(filters.query).toLowerCase();
    const searchValues = [item.companyName, item.contactName, item.email, item.phone, item.websiteUrl, item.region, item.industry].join(" ").toLowerCase();
    const ownerTokens = [item.assignedUserId, item.assignedUserEmail, item.assignedTo, item.ownerEmail, item.ownerName].map((value) => asText(value).toLowerCase());
    return (!query || searchValues.includes(query))
      && matchesSmartView(item, filters.smartView || "all", now)
      && (!filters.owner || ownerTokens.includes(asText(filters.owner).toLowerCase()))
      && (!filters.pipelineStage || item.pipelineStage === filters.pipelineStage)
      && (!filters.callDisposition || item.callDisposition === filters.callDisposition)
      && (!filters.interestLevel || item.interestLevel === filters.interestLevel)
      && (!filters.priority || item.priority === filters.priority)
      && (!filters.favoritesOnly || item.isFavorite)
      && (!filters.source || asText(item.acquisitionChannel || item.source).toLowerCase() === asText(filters.source).toLowerCase())
      && (!filters.industry || asText(item.industry).toLowerCase().includes(asText(filters.industry).toLowerCase()))
      && (!filters.region || asText(item.region).toLowerCase().includes(asText(filters.region).toLowerCase()))
      && (!filters.nextAction || (filters.nextAction === "today" ? needsActionToday(item, now) : Boolean(item.nextActionAt)));
  }

  function smartViewCounts(leads = [], now = new Date()) {
    return Object.fromEntries(SMART_VIEWS.map(({ value }) => [value, leads.filter((lead) => matchesSmartView(lead, value, now)).length]));
  }

  function kpiCounts(leads = [], now = new Date()) {
    const items = leads.map(normalizeLead);
    return {
      new: items.filter((lead) => lead.pipelineStage === "new").length,
      callback: items.filter((lead) => lead.callDisposition === "callback" && needsActionToday(lead, now)).length,
      voicemail: items.filter((lead) => lead.callDisposition === "voicemail").length,
      demos: items.filter((lead) => ["demo_planned", "demo_in_progress", "demo_sent", "awaiting_feedback"].includes(lead.pipelineStage)).length,
      payment: items.filter((lead) => lead.pipelineStage === "awaiting_payment").length,
      customers: items.filter((lead) => lead.pipelineStage === "customer").length,
    };
  }

  function paginate(leads = [], page = 1, pageSize = 25) {
    const total = leads.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, Number(page) || 1), pages);
    return { records: leads.slice((current - 1) * pageSize, current * pageSize), page: current, pageSize, pages, total };
  }

  function canToggleFavorite(role = "") {
    return FAVORITE_WRITE_ROLES.has(asText(role).toLowerCase());
  }

  async function toggleFavoriteOptimistically(lead = {}, persist, apply) {
    if (typeof persist !== "function" || typeof apply !== "function") throw new TypeError("Favoriettoggle mist persist- of applyfunctie.");
    const previous = Boolean(normalizeLead(lead).isFavorite);
    const optimistic = !previous;
    apply(optimistic);
    try {
      const saved = await persist(optimistic);
      const confirmed = Boolean(saved?.isFavorite ?? saved?.lead?.isFavorite ?? optimistic);
      if (confirmed !== optimistic) apply(confirmed);
      return { ...(saved && typeof saved === "object" ? saved : {}), isFavorite: confirmed };
    } catch (error) {
      apply(previous);
      throw error;
    }
  }

  return Object.freeze({ PIPELINE_STAGES, SMART_VIEWS, normalizeLead, isArchivedLead, isLostLead, isWonLead, needsActionToday, matchesSmartView, matchesFilters, smartViewCounts, kpiCounts, paginate, canToggleFavorite, toggleFavoriteOptimistically, dayKey });
});
