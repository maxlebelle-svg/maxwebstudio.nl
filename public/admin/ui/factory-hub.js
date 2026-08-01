(function factoryHub(globalScope) {
  "use strict";

  const endpoint = "/.netlify/functions/admin-factory-projects";
  const icons = { website: "W", webshop: "S" };
  const statusLabels = { intake: "Intake", ready: "Klaar voor productie", in_production: "In productie", review: "Review", live: "Live", paused: "Gepauzeerd", archived: "Gearchiveerd" };
  const fallbackBlueprints = [
    { key: "website-service-v1", factoryType: "website", version: 1, name: "Website voor dienstverleners", shortName: "Website Factory", description: "Van klantbriefing naar merk, content, preview, feedback en livegang.", reference: "De bestaande Max Webstudio Website Factory", modules: ["Merk & huisstijl", "Pagina-opbouw", "Content & SEO", "Preview & feedback", "Domein & livegang"], launchPath: "admin-website-factory.html", accent: "#3b82f6" },
    { key: "webshop-commerce-v1", factoryType: "webshop", version: 1, name: "Webshop basisformule", shortName: "Webshop Factory", description: "Een herhaalbare commerce-opzet voor assortiment, checkout en beheer.", reference: "Website Factory met commerce-briefing", modules: ["Merk & storefront", "Productcatalogus", "Winkelmand & checkout", "Betaling & verzending", "Orders & beheer"], launchPath: "admin-website-factory.html", accent: "#a855f7" },
  ];
  const state = { relationship: null, blueprints: fallbackBlueprints, projects: [], selectedBlueprint: "", loading: false };
  const nodes = {};

  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
  function readSession() { try { return JSON.parse(localStorage.getItem("mws_admin_supabase_session") || "{}"); } catch { return {}; } }
  function token() { const session = readSession(); return String(session.accessToken || session.access_token || sessionStorage.getItem("mws_admin_token") || "").trim(); }
  function relationshipIdentity(relationship = state.relationship) {
    if (!relationship) return null;
    const type = relationship.relationshipType || relationship.entityType;
    const id = relationship.relationshipId || (type === "lead" ? relationship.leadId : relationship.customerId);
    return type && id ? { type, id } : null;
  }
  function relationshipName() { return state.relationship?.companyName || state.relationship?.name || "Geselecteerde relatie"; }

  async function request(method = "GET", body) {
    const identity = relationshipIdentity();
    const url = new URL(endpoint, globalScope.location.origin);
    if (method === "GET" && identity) { url.searchParams.set("relationshipType", identity.type); url.searchParams.set("relationshipId", identity.id); }
    const response = await fetch(`${url.pathname}${url.search}`, {
      method,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token()}` },
      credentials: "include",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(payload.error || "Factory Hub kon niet laden.");
    return payload;
  }

  function renderContext() {
    const identity = relationshipIdentity();
    nodes.context.classList.toggle("is-active", Boolean(identity));
    nodes.context.querySelector("div").innerHTML = identity
      ? `<span>Actieve ${escapeHtml(identity.type === "lead" ? "lead" : "klant")}</span><strong>${escapeHtml(relationshipName())}</strong><small>Nieuwe dossiers worden uitsluitend aan deze relatie gekoppeld.</small>`
      : `<span>Actieve relatie</span><strong>Selecteer eerst een lead of klant</strong><small>Gebruik de centrale relatiekiezer in de zijbalk.</small>`;
    nodes.newButton.disabled = !identity || !state.blueprints.length;
  }

  function renderBlueprints() {
    if (!state.blueprints.length) { nodes.blueprints.innerHTML = `<article class="factory-loading-card">Factory-blueprints konden nog niet worden geladen.</article>`; return; }
    nodes.blueprints.innerHTML = state.blueprints.map((blueprint) => `
      <article class="factory-blueprint-card" style="--factory-accent:${escapeHtml(blueprint.accent)}">
        <header><span class="factory-blueprint-icon">${escapeHtml(icons[blueprint.factoryType] || "F")}</span><div><small>Blueprint v${escapeHtml(blueprint.version)}</small><h3>${escapeHtml(blueprint.shortName)}</h3></div></header>
        <p>${escapeHtml(blueprint.description)}</p>
        <ul class="factory-module-list">${blueprint.modules.map((module) => `<li>${escapeHtml(module)}</li>`).join("")}</ul>
        <footer><span class="factory-reference">Gebaseerd op: <strong>${escapeHtml(blueprint.reference)}</strong></span><button class="button primary" type="button" data-start-blueprint="${escapeHtml(blueprint.key)}" ${relationshipIdentity() ? "" : "disabled"}>Start deze formule</button></footer>
      </article>`).join("");
  }

  function projectTone(status) { return status === "live" ? "success" : status === "review" || status === "in_production" ? "info" : status === "paused" ? "warning" : "neutral"; }
  function gateTone(status) { return status === "passed" ? "success" : status === "failed" ? "danger" : status === "expired" ? "warning" : "neutral"; }
  function renderProductionGate(project) {
    const gate = project.productionGate || { available: false, progress: 0, checks: [], counts: { blocking: 0 } };
    if (!gate.available) return `<section class="factory-production-gate is-unavailable"><header><div><small>Production Gate</small><strong>Nog niet geactiveerd</strong></div><span class="factory-status-pill" data-tone="warning">Livegang geblokkeerd</span></header><p>De centrale gate-database moet eerst gecontroleerd worden geactiveerd. Dit dossier kan niet live worden gezet.</p></section>`;
    const checks = Array.isArray(gate.checks) ? gate.checks : [];
    const groups = [...new Set(checks.map((item) => item.groupKey))];
    const groupCards = groups.map((group) => {
      const rows = checks.filter((item) => item.groupKey === group);
      const passed = rows.filter((item) => item.effectiveStatus === "passed").length;
      const tone = passed === rows.length ? "success" : rows.some((item) => item.effectiveStatus === "failed") ? "danger" : rows.some((item) => item.effectiveStatus === "expired") ? "warning" : "neutral";
      return `<span class="factory-gate-group" data-tone="${tone}"><b>${escapeHtml(group.replaceAll("_", " "))}</b><small>${passed}/${rows.length}</small></span>`;
    }).join("");
    const checkRows = checks.map((item) => `<li data-tone="${gateTone(item.effectiveStatus)}"><span aria-hidden="true">${item.effectiveStatus === "passed" ? "✓" : item.effectiveStatus === "failed" ? "×" : item.effectiveStatus === "expired" ? "!" : "·"}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.reason || item.sourceLabel)}</small></div></li>`).join("");
    const override = gate.releaseMode === "override" && gate.override ? `<div class="factory-gate-override"><strong>LIVE VIA UITZONDERING</strong><span>Reden: ${escapeHtml(gate.override.reason)}</span><small>Openstaande risico's: ${escapeHtml((gate.override.risks || []).join(" · "))}</small></div>` : "";
    const liveLabel = gate.releaseMode === "override" ? "Live zetten via uitzondering" : "Definitief live zetten";
    return `<section class="factory-production-gate" data-release-mode="${escapeHtml(gate.releaseMode)}">
      <header><div><small>Centrale Production Gate</small><strong>${escapeHtml(gate.progress)}% bewezen</strong></div><span class="factory-status-pill" data-tone="${gate.canGoLive ? gate.releaseMode === "override" ? "warning" : "success" : "warning"}">${gate.canGoLive ? gate.releaseMode === "override" ? "Uitzondering actief" : "Livegang gereed" : `${escapeHtml(gate.counts?.blocking || 0)} blokkades`}</span></header>
      <div class="factory-gate-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(gate.progress)}"><span style="width:${escapeHtml(gate.progress)}%"></span></div>
      <div class="factory-gate-groups">${groupCards}</div>${override}
      <details><summary>Alle verplichte controles bekijken</summary><ul>${checkRows}</ul></details>
      <div class="factory-gate-actions"><button class="button secondary" type="button" data-production-preflight="${escapeHtml(project.id)}">Controles herijken</button><button class="button primary" type="button" data-production-live="${escapeHtml(project.id)}" ${gate.canGoLive ? "" : "disabled"}>${liveLabel}</button></div>
    </section>`;
  }
  function renderProjects() {
    if (!relationshipIdentity()) { nodes.projects.innerHTML = `<div class="factory-empty"><strong>Nog geen relatie geselecteerd</strong><span>Na selectie verschijnen hier alle Website- en Webshop-dossiers.</span></div>`; return; }
    if (state.loading) { nodes.projects.innerHTML = `<div class="factory-loading-card">Factory-dossiers laden…</div>`; return; }
    if (!state.projects.length) { nodes.projects.innerHTML = `<div class="factory-empty"><strong>Nog geen factory-dossier voor ${escapeHtml(relationshipName())}</strong><span>Kies hierboven Website of Webshop om het eerste herhaalbare project te starten.</span></div>`; return; }
    nodes.projects.innerHTML = state.projects.map((project) => {
      const blueprint = state.blueprints.find((item) => item.key === project.blueprint_key) || {};
      const path = launchUrl(project, blueprint);
      return `<article class="factory-project">
        <div><small>${escapeHtml(blueprint.shortName || project.factory_type)}</small><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.configuration?.industry || "Branche nog invullen")}</p></div>
        <div><small>Status</small><span class="factory-status-pill" data-tone="${projectTone(project.status)}">${escapeHtml(statusLabels[project.status] || project.status)}</span></div>
        <div><small>Herhaalbaar recept</small><strong>${escapeHtml(blueprint.name || project.blueprint_key)}</strong><p>Versie ${escapeHtml(project.blueprint_version)}</p></div>
        <div class="factory-project-actions"><a class="button primary" href="${escapeHtml(path)}">Productie openen</a><button class="button secondary" type="button" data-project-ready="${escapeHtml(project.id)}" ${project.status !== "intake" ? "hidden" : ""}>Intake gereed</button></div>
        ${renderProductionGate(project)}
      </article>`;
    }).join("");
  }

  function launchUrl(project, blueprint) {
    const identity = relationshipIdentity();
    const path = blueprint.launchPath || "admin-website-factory.html";
    const url = new URL(path, globalScope.location.origin);
    if (identity) { url.searchParams.set("relationshipType", identity.type); url.searchParams.set("relationshipId", identity.id); url.searchParams.set(identity.type === "lead" ? "leadId" : "customerId", identity.id); }
    url.searchParams.set("factoryProjectId", project.id);
    url.searchParams.set("factoryType", project.factory_type);
    return `${url.pathname.replace(/^\//, "")}${url.search}`;
  }

  function renderTypeOptions() {
    nodes.typeOptions.innerHTML = state.blueprints.map((blueprint) => `<label class="factory-type-option" style="--option-accent:${escapeHtml(blueprint.accent)}"><input type="radio" name="blueprintKey" value="${escapeHtml(blueprint.key)}" ${blueprint.key === state.selectedBlueprint ? "checked" : ""} /><strong>${escapeHtml(blueprint.shortName)}</strong><small>${escapeHtml(blueprint.reference)}</small></label>`).join("");
    renderRecipe();
  }

  function renderRecipe() {
    const blueprint = state.blueprints.find((item) => item.key === state.selectedBlueprint);
    if (!blueprint) { nodes.recipe.innerHTML = ""; return; }
    nodes.recipe.innerHTML = `<small>Dit recept wordt vastgezet in het dossier</small><h3>${escapeHtml(blueprint.name)}</h3><p>${escapeHtml(blueprint.modules.join(" · "))}</p><p><strong>Veiligheidsregel:</strong> aanmaken is alleen voorbereiding; livegang vraagt altijd een aparte controle.</p>`;
    const nameInput = document.getElementById("factory-project-name");
    if (!nameInput.dataset.edited) nameInput.value = `${blueprint.shortName} — ${relationshipName()}`;
  }

  function openDialog(blueprintKey = "") {
    if (!relationshipIdentity()) return;
    state.selectedBlueprint = blueprintKey || state.blueprints[0]?.key || "";
    nodes.form.reset();
    document.getElementById("factory-project-name").dataset.edited = "";
    nodes.message.textContent = "";
    renderTypeOptions();
    nodes.dialog.showModal();
  }
  function closeDialog() { nodes.dialog.close(); }

  async function load() {
    state.relationship = globalScope.ActiveRelationship?.getActiveRelationship?.() || await globalScope.ActiveRelationship?.whenReady?.();
    state.loading = true; renderContext(); renderProjects();
    if (!relationshipIdentity()) {
      state.projects = [];
      state.loading = false;
      nodes.storage.textContent = "Wachten op relatie";
      nodes.storage.dataset.tone = "neutral";
      nodes.projectsIntro.textContent = "Selecteer een relatie om de bijbehorende dossiers te zien.";
      renderContext(); renderBlueprints(); renderProjects();
      return;
    }
    try {
      const payload = await request("GET");
      state.blueprints = Array.isArray(payload.blueprints) ? payload.blueprints : [];
      state.projects = Array.isArray(payload.projects) ? payload.projects : [];
      nodes.storage.textContent = state.projects.length ? `${state.projects.length} dossier${state.projects.length === 1 ? "" : "s"}` : "Klaar voor eerste dossier";
      nodes.storage.dataset.tone = state.projects.length ? "success" : "info";
      nodes.projectsIntro.textContent = `${relationshipName()}: alle formules en productiestatussen bij elkaar.`;
    } catch (error) {
      nodes.storage.textContent = "Opslag niet beschikbaar"; nodes.storage.dataset.tone = "warning";
      nodes.projects.innerHTML = `<div class="factory-empty"><strong>Factory-dossiers konden niet laden</strong><span>${escapeHtml(error.message)}</span></div>`;
    } finally { state.loading = false; renderContext(); renderBlueprints(); if (state.projects.length || !nodes.projects.querySelector(".factory-empty strong")) renderProjects(); }
  }

  async function submit(event) {
    event.preventDefault();
    const identity = relationshipIdentity();
    const data = new FormData(nodes.form);
    const blueprintKey = String(data.get("blueprintKey") || state.selectedBlueprint);
    nodes.submit.disabled = true; nodes.submit.textContent = "Aanmaken…"; nodes.message.textContent = "";
    try {
      const payload = await request("POST", {
        relationshipType: identity.type, relationshipId: identity.id, blueprintKey,
        name: data.get("name"),
        configuration: { industry: data.get("industry"), domain: data.get("domain"), conversion: data.get("conversion"), goals: data.get("goals"), source: "factory_hub" },
      });
      state.projects.unshift(payload.project); closeDialog(); renderProjects(); nodes.storage.textContent = `${state.projects.length} dossier${state.projects.length === 1 ? "" : "s"}`; nodes.storage.dataset.tone = "success";
    } catch (error) { nodes.message.textContent = error.message; }
    finally { nodes.submit.disabled = false; nodes.submit.textContent = "Dossier aanmaken"; }
  }

  async function markReady(id, button) {
    button.disabled = true;
    try { const payload = await request("PATCH", { id, status: "ready" }); const index = state.projects.findIndex((project) => project.id === id); if (index >= 0) state.projects[index] = payload.project; renderProjects(); }
    catch (error) { button.disabled = false; button.textContent = error.message; }
  }

  async function runGateAction(id, action, button) {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = action === "go_live" ? "Livegang controleren…" : "Herijken…";
    try {
      const payload = await request("POST", { action, projectId: id });
      const index = state.projects.findIndex((project) => project.id === id);
      if (index >= 0) state.projects[index] = { ...state.projects[index], ...(payload.project || {}), productionGate: payload.productionGate || state.projects[index].productionGate };
      renderProjects();
    } catch (error) {
      button.disabled = false;
      button.textContent = error.message;
      globalScope.setTimeout(() => { button.textContent = original; }, 3500);
    }
  }

  function init() {
    Object.assign(nodes, {
      context: document.getElementById("factory-context"), newButton: document.getElementById("factory-new-project"), blueprints: document.getElementById("factory-blueprints"), projects: document.getElementById("factory-projects"), projectsIntro: document.getElementById("factory-projects-intro"), storage: document.getElementById("factory-storage-status"), dialog: document.getElementById("factory-dialog"), form: document.getElementById("factory-form"), typeOptions: document.getElementById("factory-type-options"), recipe: document.getElementById("factory-recipe-preview"), message: document.getElementById("factory-form-message"), submit: document.getElementById("factory-submit"),
    });
    nodes.newButton.addEventListener("click", () => openDialog());
    nodes.context.querySelector("[data-select-relationship]").addEventListener("click", () => globalScope.MaxCommand?.open?.(""));
    nodes.blueprints.addEventListener("click", (event) => { const button = event.target.closest("[data-start-blueprint]"); if (button) openDialog(button.dataset.startBlueprint); });
    nodes.typeOptions.addEventListener("change", (event) => { if (event.target.name === "blueprintKey") { state.selectedBlueprint = event.target.value; renderRecipe(); } });
    document.getElementById("factory-project-name").addEventListener("input", (event) => { event.target.dataset.edited = "true"; });
    nodes.form.addEventListener("submit", submit);
    nodes.dialog.querySelector(".factory-dialog-close").addEventListener("click", closeDialog);
    nodes.dialog.querySelector(".factory-dialog-cancel").addEventListener("click", closeDialog);
    nodes.projects.addEventListener("click", (event) => {
      const ready = event.target.closest("[data-project-ready]");
      const preflight = event.target.closest("[data-production-preflight]");
      const live = event.target.closest("[data-production-live]");
      if (ready) markReady(ready.dataset.projectReady, ready);
      else if (preflight) runGateAction(preflight.dataset.productionPreflight, "preflight", preflight);
      else if (live) runGateAction(live.dataset.productionLive, "go_live", live);
    });
    globalScope.ActiveRelationship?.subscribeToRelationshipChanges?.(() => load());
    load();
  }

  const exported = { launchUrl, projectTone, statusLabels };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init(); }
})(typeof window !== "undefined" ? window : globalThis);
