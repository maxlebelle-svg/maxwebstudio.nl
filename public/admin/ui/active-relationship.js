(function initActiveRelationship() {
  if (window.ActiveRelationship?.ready) return;

  const STORAGE_KEY = "maxwebstudioActiveRelationship";
  const EVENT_NAME = "maxwebstudio:relationship-change";
  const ENTITY_TYPES = new Set(["lead", "customer"]);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let active = null;
  let ready = false;
  let resolveReady;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

  function clean(value) { return String(value || "").trim(); }
  function session() {
    for (const key of ["maxwebstudioSupabaseAuthSession", "mws_admin_supabase_session"]) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        if (value?.access_token) return { token: value.access_token, userId: value.user?.id || "" };
        if (value?.accessToken) return { token: value.accessToken, userId: value.userId || "" };
      } catch { /* invalid storage is ignored */ }
    }
    return { token: "", userId: "" };
  }

  function normalize(input = {}) {
    const explicitEntityType = clean(input.entityType).toLowerCase();
    const explicitRelationshipType = clean(input.relationshipType).toLowerCase();
    if (explicitEntityType && explicitRelationshipType && explicitEntityType !== explicitRelationshipType) return null;
    const entityType = explicitRelationshipType || explicitEntityType;
    const relationshipId = clean(input.relationshipId);
    const leadId = clean(input.leadId || (entityType === "lead" ? relationshipId : ""));
    const customerId = clean(input.customerId || (entityType === "customer" ? relationshipId : ""));
    if (!ENTITY_TYPES.has(entityType)) return null;
    if (entityType === "lead" && (!UUID.test(leadId) || customerId)) return null;
    if (entityType === "customer" && (!UUID.test(customerId) || leadId)) return null;
    const canonicalId = entityType === "lead" ? leadId : customerId;
    if (relationshipId && relationshipId !== canonicalId) return null;
    return Object.freeze({
      entityType,
      relationshipType: entityType,
      relationshipId: canonicalId,
      leadId: entityType === "lead" ? leadId : null,
      customerId: entityType === "customer" ? customerId : null,
      profileId: clean(input.profileId) || null,
      companyName: clean(input.companyName) || "Onbekende relatie",
      contactName: clean(input.contactName),
      websiteUrl: clean(input.websiteUrl),
      email: clean(input.email),
      phone: clean(input.phone),
      assignedUserId: clean(input.assignedUserId) || null,
      assignedUserName: clean(input.assignedUserName),
      lifecycleStage: clean(input.lifecycleStage),
      selectedAt: clean(input.selectedAt) || new Date().toISOString(),
      selectedByAuthUserId: clean(input.selectedByAuthUserId || session().userId),
    });
  }

  function minimalStorageRecord(relationship) {
    const normalized = normalize(relationship || {});
    if (!normalized) return null;
    const relationshipId = normalized.entityType === "lead" ? normalized.leadId : normalized.customerId;
    return {
      relationshipType: normalized.entityType,
      relationshipId,
      leadId: normalized.entityType === "lead" ? relationshipId : null,
      customerId: normalized.entityType === "customer" ? relationshipId : null,
      companyName: normalized.companyName,
      lifecycleStage: normalized.lifecycleStage,
      selectedAt: normalized.selectedAt,
    };
  }

  function readStored() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {};
      const normalized = normalize(stored);
      const minimal = minimalStorageRecord(normalized);
      if (minimal && JSON.stringify(stored) !== JSON.stringify(minimal)) localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
      return normalized;
    }
    catch { return null; }
  }

  function notify(value, source = "user") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { relationship: value, source } }));
    render();
  }

  function clearActiveRelationship(source = "clear") {
    active = null;
    localStorage.removeItem(STORAGE_KEY);
    const url = new URL(window.location.href);
    const hadRelationshipParams = url.searchParams.has("leadId") || url.searchParams.has("customerId");
    url.searchParams.delete("leadId"); url.searchParams.delete("customerId");
    if (hadRelationshipParams) window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
    notify(null, source);
  }

  function contextError(code = "UNKNOWN", fallback = "") {
    const messages = { INVALID_ID: "Deze relatie heeft geen geldige centrale koppeling.", INVALID_ENTITY_TYPE: "Dit zoekresultaat kan niet als relatie worden geopend.", NOT_FOUND: "Deze relatie bestaat niet meer of is nog niet centraal opgeslagen.", FORBIDDEN: "Je hebt geen toegang tot deze relatie.", ARCHIVED: "Deze relatie is gearchiveerd en kan niet worden geopend.", CONTEXT_MISMATCH: "De relatiegegevens komen niet met elkaar overeen.", STALE_DEPLOYMENT: "De relatiecontext is bijgewerkt. Vernieuw de pagina en probeer opnieuw.", RELATIONSHIP_SOURCE_QUERY_FAILED: "De relatiebron kon niet veilig worden gecontroleerd. Probeer het later opnieuw.", SERVICE_UNAVAILABLE: "Relatiecontrole is tijdelijk niet beschikbaar." };
    const error = new Error(messages[code] || fallback || "Deze relatie kon niet worden geopend.");
    error.code = code;
    error.userMessage = error.message;
    return error;
  }

  async function validateActiveRelationship(input, source = "user") {
    const candidate = normalize(input);
    const auth = session();
    if (!candidate) throw contextError("INVALID_ID");
    if (!auth.token) throw contextError("FORBIDDEN", "Log opnieuw in om een relatie te openen.");
    const response = await fetch("/api/admin-relationship-context", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}`, "X-Relationship-Contract": "2" },
      body: JSON.stringify({ contractVersion: 2, entityType: candidate.entityType, relationshipType: candidate.relationshipType, relationshipId: candidate.relationshipId, leadId: candidate.leadId, customerId: candidate.customerId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.relationship) throw contextError(data.code || (response.status === 403 ? "FORBIDDEN" : response.status === 404 ? "NOT_FOUND" : "UNKNOWN"), data.error);
    if (data.contractVersion !== 2) throw contextError("STALE_DEPLOYMENT");
    const validated = normalize({ ...data.relationship, selectedAt: new Date().toISOString(), selectedByAuthUserId: auth.userId });
    if (!validated) throw new Error("De relatie kon niet veilig worden geladen.");
    active = validated;
    if (source !== "storage") localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalStorageRecord(validated)));
    notify(validated, source);
    return validated;
  }

  function getActiveRelationship() { return active; }
  function whenReady() { return readyPromise; }
  function setActiveRelationship(input, options = {}) { return validateActiveRelationship(input, options.source || "user"); }
  function subscribeToRelationshipChanges(callback) {
    const listener = (event) => callback(event.detail?.relationship || null, event.detail || {});
    window.addEventListener(EVENT_NAME, listener);
    return () => window.removeEventListener(EVENT_NAME, listener);
  }
  function buildRelationshipUrl(url, relationship = active) {
    const target = new URL(url, window.location.origin);
    target.searchParams.delete("leadId"); target.searchParams.delete("customerId");
    if (relationship?.entityType === "lead") target.searchParams.set("leadId", relationship.leadId);
    if (relationship?.entityType === "customer") target.searchParams.set("customerId", relationship.customerId);
    return `${target.pathname}${target.search}${target.hash}`;
  }

  function ensureStyles() {
    if (document.getElementById("active-relationship-styles")) return;
    const style = document.createElement("style");
    style.id = "active-relationship-styles";
    style.textContent = `.relationship-workspace{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:14px;padding:10px 18px;margin:0;background:linear-gradient(100deg,#11182b,#182546);color:#fff;border-bottom:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px rgba(15,23,42,.12)}.relationship-workspace__copy{min-width:0;flex:1}.relationship-workspace__eyebrow{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9fb4df}.relationship-workspace strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.relationship-workspace p{margin:2px 0 0;color:#c8d3ea;font-size:12px}.relationship-workspace__actions{display:flex;gap:8px}.relationship-workspace button,.relationship-workspace a{min-height:36px;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font:inherit;text-decoration:none;cursor:pointer}.relationship-workspace button:focus-visible,.relationship-workspace a:focus-visible{outline:3px solid #7dd3fc;outline-offset:2px}.relationship-workspace [data-primary]{background:#fff;color:#14203a}@media(max-width:640px){.relationship-workspace{align-items:flex-start;flex-wrap:wrap;padding:9px 12px}.relationship-workspace__actions{width:100%}.relationship-workspace button,.relationship-workspace a{flex:1;text-align:center}.relationship-workspace p{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:92vw}}`;
    document.head.append(style);
  }

  function ensureBar() {
    let bar = document.getElementById("active-relationship-workspace");
    if (bar) return bar;
    ensureStyles();
    bar = document.createElement("section");
    bar.id = "active-relationship-workspace";
    bar.className = "relationship-workspace";
    bar.setAttribute("aria-label", "Actieve relatie");
    const anchor = document.querySelector(".admin-topbar, header, main");
    (anchor?.parentNode || document.body).insertBefore(bar, anchor || document.body.firstChild);
    return bar;
  }

  function render() {
    if (!document.body) return;
    if (document.body.dataset.sharedAdminSidebar === "true" || document.body.dataset.adminSidebarException === "standalone") { document.getElementById("active-relationship-workspace")?.remove(); return; }
    const bar = ensureBar();
    const relationship = active;
    if (!relationship) {
      bar.innerHTML = `<div class="relationship-workspace__copy"><span class="relationship-workspace__eyebrow">Actieve werkruimte</span><strong>Geen actieve relatie geselecteerd</strong><p>Selecteer een lead of klant voor relatiegebonden acties.</p></div><div class="relationship-workspace__actions"><button type="button" data-primary data-relationship-switch>Selecteer relatie</button></div>`;
    } else {
      const detail = [relationship.entityType === "lead" ? "Lead" : "Klant", relationship.lifecycleStage, relationship.assignedUserName ? `Eigenaar: ${relationship.assignedUserName}` : ""].filter(Boolean).join(" · ");
      const relationshipId = relationship.entityType === "lead" ? relationship.leadId : relationship.customerId;
      const dossier = `admin-relatie-workspace.html?entityType=${encodeURIComponent(relationship.entityType)}&id=${encodeURIComponent(relationshipId)}&module=overview`;
      bar.innerHTML = `<div class="relationship-workspace__copy"><span class="relationship-workspace__eyebrow">Actieve werkruimte</span><strong></strong><p></p></div><div class="relationship-workspace__actions"><button type="button" data-relationship-switch>Wisselen</button><a data-primary href="${dossier}">Open dossier</a></div>`;
      bar.querySelector("strong").textContent = relationship.companyName;
      bar.querySelector("p").textContent = detail || relationship.websiteUrl || relationship.email;
    }
    bar.querySelector("[data-relationship-switch]")?.addEventListener("click", () => window.MaxCommand?.open?.(""));
  }

  async function hydrate() {
    const params = new URLSearchParams(window.location.search);
    const leadId = clean(params.get("leadId"));
    const customerId = clean(params.get("customerId"));
    if (leadId && customerId) { clearActiveRelationship("invalid-deep-link"); finishHydration(); return; }
    const candidate = leadId ? { entityType: "lead", leadId } : customerId ? { entityType: "customer", customerId } : readStored();
    if (!candidate) { render(); finishHydration(); return; }
    try { await validateActiveRelationship(candidate, leadId || customerId ? "deep-link" : "restore"); }
    catch { clearActiveRelationship("validation-failed"); }
    finishHydration();
  }

  function finishHydration() {
    if (ready) return;
    ready = true;
    resolveReady(active);
    window.dispatchEvent(new CustomEvent("maxwebstudio:relationship-ready", { detail: { relationship: active } }));
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#auth-logout,#admin-session-logout,[data-action='logout']")) clearActiveRelationship("logout");
  }, true);
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    const candidate = readStored();
    if (!candidate) { active = null; notify(null, "storage"); return; }
    validateActiveRelationship(candidate, "storage").catch(() => clearActiveRelationship("storage-validation-failed"));
  });
  window.addEventListener("maxwebstudio:admin-logout", () => clearActiveRelationship("logout"));

  window.ActiveRelationship = { ready: true, whenReady, getActiveRelationship, setActiveRelationship, clearActiveRelationship, validateActiveRelationship, subscribeToRelationshipChanges, buildRelationshipUrl, minimalStorageRecord, readStored };
  active = null;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hydrate, { once: true }); else hydrate();
})();
