(function initAdminSidebarComponents(global) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const ICON_PATHS = Object.freeze({
    activity: ["M3 12h4l3-8 4 16 3-8h4"], bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
    brain: ["M9.5 4.5A3 3 0 0 0 5 7a3 3 0 0 0 .4 5.9A3 3 0 0 0 9 18v-1", "M14.5 4.5A3 3 0 0 1 19 7a3 3 0 0 1-.4 5.9A3 3 0 0 1 15 18v-1", "M12 4v16"],
    briefcase: ["M9 6V4h6v2", "M3 7h18v13H3z", "M3 12h18"], building: ["M4 21V3h16v18", "M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"],
    calendar: ["M3 5h18v16H3z", "M16 3v4M8 3v4M3 10h18"], "clipboard-check": ["M9 5h6", "M9 3h6v4H9z", "M6 5H4v16h16V5h-2", "m8 14 2 2 5-5"],
    "file-signature": ["M14 2H6a2 2 0 0 0-2 2v16h16V8z", "M14 2v6h6", "m9 15 5-5 2 2-5 5-3 1z"], "file-text": ["M14 2H6a2 2 0 0 0-2 2v16h16V8z", "M14 2v6h6", "M8 13h8M8 17h6"],
    folder: ["M3 5h7l2 2h9v12H3z"], gauge: ["M4 18a8 8 0 1 1 16 0", "m12 14 4-4"], globe: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20", "M2 12h20", "M12 2a15 15 0 0 1 0 20"],
    history: ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5", "M12 7v5l3 2"], layout: ["M3 3h18v18H3z", "M9 3v18M9 9h12"], "list-checks": ["m3 6 2 2 4-4", "M11 6h10", "m3 14 2 2 4-4", "M11 14h10", "M11 20h10"],
    mail: ["M3 5h18v14H3z", "m3 7 9 6 9-6"], monitor: ["M3 4h18v13H3z", "M8 21h8M12 17v4"], palette: ["M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4A9 9 0 0 0 12 3z"],
    "pen-line": ["m15 5 4 4L8 20H4v-4z", "M12 20h8"], receipt: ["M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2-4 2z", "M9 9h6M9 13h6"], repeat: ["m17 2 4 4-4 4", "M3 11V9a3 3 0 0 1 3-3h15", "m7 22-4-4 4-4", "M21 13v2a3 3 0 0 1-3 3H3"],
    search: ["M21 21l-4.3-4.3", "M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0"], send: ["m22 2-7 20-4-9-9-4z", "M22 2 11 13"], settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1.5 1V21h-4v-.6A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1L3.2 17l.1-.1A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-1-1.5H2v-4h.6A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.3-1.9L3.2 6 6 3.2l.1.1A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1.5-1V2h4v.6a1.7 1.7 0 0 0 1.5 1 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 6l-.1.1A1.7 1.7 0 0 0 19.4 8a1.7 1.7 0 0 0 1 1.5h.6v4h-.6a1.7 1.7 0 0 0-1 1.5z"],
    sparkles: ["m12 3-1 3-3 1 3 1 1 3 1-3 3-1-3-1z", "m19 13-.7 2.3L16 16l2.3.7L19 19l.7-2.3L22 16l-2.3-.7z", "m5 14-.7 2.3L2 17l2.3.7L5 20l.7-2.3L8 17l-2.3-.7z"], users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"],
    wand: ["m15 4 5 5L8 21l-5-5z", "M6 4v4M4 6h4M19 14v4M17 16h4"], workflow: ["M5 3v12M19 9v12", "M5 15a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4", "M5 7h8a4 4 0 0 1 4 4"],
  });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function icon(name, label = "") {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.classList.add("mws-sidebar-icon");
    if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); } else svg.setAttribute("aria-hidden", "true");
    (ICON_PATHS[name] || ICON_PATHS.layout).forEach((data) => { const path = document.createElementNS(SVG_NS, "path"); path.setAttribute("d", data); svg.append(path); });
    return svg;
  }

  function MetricBadge({ value = "", tone = "neutral", label = "", loading = false } = {}) {
    const badge = element("span", `mws-sidebar-badge is-${tone}${loading ? " is-loading" : ""}`, loading ? "" : value);
    if (label) badge.setAttribute("aria-label", label);
    if (label) badge.title = label;
    if (loading) { badge.setAttribute("role", "status"); badge.append(element("span", "mws-sidebar-badge-skeleton")); }
    if (!loading && (value === "" || value === null || value === undefined)) badge.hidden = true;
    return badge;
  }

  function StatusBadge({ label = "", tone = "neutral" } = {}) {
    const badge = element("span", `mws-sidebar-status is-${tone}`);
    badge.append(element("span", "mws-sidebar-status-dot"), element("span", "", label));
    return badge;
  }

  function Avatar({ name = "", imageUrl = "", size = "medium", seed = "" } = {}) {
    const fallback = element("span", `mws-sidebar-avatar is-${size} is-tone-${avatarTone(seed || name)}`, initials(name));
    fallback.setAttribute("aria-label", name || "Gebruiker");
    imageUrl = safeImageUrl(imageUrl);
    if (!imageUrl) return fallback;
    const image = element("img", `mws-sidebar-avatar is-${size}`);
    image.alt = name || "Gebruiker";
    image.src = imageUrl;
    image.addEventListener("error", () => image.replaceWith(fallback), { once: true });
    return image;
  }

  function safeImageUrl(value = "") { const url = String(value || "").trim(); if (url.startsWith("/assets/") || url.startsWith("/images/")) return url; try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.toString() : ""; } catch { return ""; } }

  function avatarTone(value = "") {
    return [...String(value)].reduce((total, character) => (total + character.charCodeAt(0)) % 6, 0);
  }

  function SidebarItem({ item, active = false, badgeValue, disabled = false, workspaceMuted = false, relationship = null } = {}) {
    const link = element("a", "mws-sidebar-item");
    link.href = global.ActiveRelationship?.buildRelationshipUrl?.(item.route, relationship) || item.route;
    link.dataset.sidebarItem = item.id;
    link.dataset.workspaceRequired = String(Boolean(item.workspaceRequired));
    if (active) { link.classList.add("is-active"); link.setAttribute("aria-current", "page"); }
    if (disabled) { link.classList.add("is-disabled"); link.setAttribute("aria-disabled", "true"); link.tabIndex = -1; link.addEventListener("click", (event) => event.preventDefault()); }
    if (workspaceMuted) link.classList.add("is-workspace-muted");
    link.append(icon(item.icon), element("span", "mws-sidebar-item-label", item.label));
    if (item.badge) {
      const metric = badgeValue && typeof badgeValue === "object" ? badgeValue : { value: badgeValue };
      const hasDisplayValue = Boolean(metric.loading) || !["", null, undefined].includes(metric.value);
      link.append(MetricBadge({ value: metric.value, tone: metric.tone || item.statusTone, loading: Boolean(metric.loading), label: metric.label || (hasDisplayValue ? `${item.label}: ${metric.value}` : "") }));
    }
    return link;
  }

  function SidebarSection({ section, activeId = "", badgeValues = {}, relationship = null, canAccess = () => true } = {}) {
    const wrapper = element("section", "mws-sidebar-section");
    wrapper.dataset.sidebarSection = section.id;
    const heading = element("h2", "mws-sidebar-section-label", section.label);
    const list = element("nav", "mws-sidebar-section-items");
    list.setAttribute("aria-label", section.label);
    section.items.filter(canAccess).forEach((entry) => {
      const relationshipType = relationship?.relationshipType || relationship?.entityType || "";
      const unsupported = Boolean(entry.workspaceRequired && relationship && !entry.relationshipTypes.includes(relationshipType));
      const missing = Boolean(entry.workspaceRequired && !relationship);
      const link = SidebarItem({ item: entry, active: entry.id === activeId, badgeValue: badgeValues[entry.badge], disabled: missing || unsupported, workspaceMuted: missing || unsupported, relationship });
      if (missing) link.title = "Selecteer eerst een actieve lead of klant.";
      if (unsupported) link.title = "Deze functie wordt beschikbaar nadat de lead klant is geworden.";
      list.append(link);
    });
    wrapper.append(heading, list);
    return wrapper;
  }

  function EmptyWorkspaceState({ onSelect } = {}) {
    const state = element("div", "mws-workspace-empty");
    state.append(element("strong", "", "Geen relatie geselecteerd"), element("p", "", "Selecteer een lead of klant om relatiegebonden modules te gebruiken."));
    const button = element("button", "mws-workspace-action", "Selecteer lead of klant");
    button.type = "button";
    if (typeof onSelect === "function") button.addEventListener("click", onSelect);
    state.append(button);
    return state;
  }

  function WorkspaceCard({ relationship = null, onSwitch, onSelect, onClear } = {}) {
    const card = element("section", "mws-workspace-card");
    card.setAttribute("aria-label", "Actieve werkruimte");
    card.append(element("span", "mws-workspace-kicker", "Actieve werkruimte"));
    if (!relationship) { card.append(EmptyWorkspaceState({ onSelect: onSelect || onSwitch })); return card; }
    const head = element("div", "mws-workspace-heading");
    const statuses = element("div", "mws-workspace-statuses");
    statuses.append(StatusBadge({ label: relationship.entityType === "lead" ? "Lead" : "Klant", tone: relationship.statusTone || "success" }));
    if (relationship.lifecycleStage) statuses.append(StatusBadge({ label: relationship.lifecycleStage, tone: relationship.lifecycleTone || "neutral" }));
    head.append(statuses, element("strong", "mws-workspace-company", relationship.companyName || "Onbekende relatie"));
    const detail = relationship.assignedUserName ? `Eigenaar: ${relationship.assignedUserName}` : "";
    card.append(head, element("p", "mws-workspace-detail", detail || "Status nog niet beschikbaar"));
    const actions = element("div", "mws-workspace-actions");
    const button = element("button", "mws-workspace-action", "Wissel relatie"); button.type = "button";
    if (typeof onSwitch === "function") button.addEventListener("click", onSwitch);
    const relationshipId = relationship.entityType === "lead" ? relationship.leadId : relationship.customerId;
    const dossier = element("a", "mws-workspace-action is-link", "Open relatiedossier");
    dossier.href = `admin-relatie-workspace.html?entityType=${encodeURIComponent(relationship.entityType)}&id=${encodeURIComponent(relationshipId)}&module=overview`;
    const clear = element("button", "mws-workspace-action is-quiet", "Werkruimte wissen"); clear.type = "button";
    if (typeof onClear === "function") clear.addEventListener("click", onClear);
    actions.append(button, dossier, clear); card.append(actions);
    return card;
  }

  function WorkspaceSelector({ results = [], activeType = "all", onSearch, onSelect, onTypeChange, onClose } = {}) {
    const selector = element("section", "mws-workspace-selector");
    selector.setAttribute("role", "dialog");
    selector.setAttribute("aria-modal", "true");
    selector.setAttribute("aria-label", "Relatie selecteren");
    selector.tabIndex = -1;
    const header = element("header", "mws-workspace-selector-header");
    const title = element("div", ""); title.append(element("span", "mws-workspace-kicker", "Werkruimte"), element("strong", "", "Selecteer een relatie"));
    const close = element("button", "mws-workspace-selector-close", "×"); close.type = "button"; close.setAttribute("aria-label", "Selector sluiten");
    if (typeof onClose === "function") close.addEventListener("click", onClose);
    header.append(title, close);
    const tabs = element("div", "mws-workspace-tabs"); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Relatietype");
    [["all", "Alle"], ["lead", "Leads"], ["customer", "Klanten"]].forEach(([value, label]) => { const tab = element("button", "mws-workspace-tab", label); tab.type = "button"; tab.dataset.workspaceType = value; tab.setAttribute("role", "tab"); tab.setAttribute("aria-selected", String(activeType === value)); if (activeType === value) tab.classList.add("is-active"); if (typeof onTypeChange === "function") tab.addEventListener("click", () => onTypeChange(value)); tabs.append(tab); });
    const input = element("input", "mws-workspace-search");
    input.type = "search";
    input.placeholder = "Zoek op bedrijf, contactpersoon of e-mail";
    input.setAttribute("aria-label", input.placeholder);
    input.dataset.workspaceSearch = "true";
    if (typeof onSearch === "function") input.addEventListener("input", (event) => onSearch(event.target.value));
    const status = element("div", "mws-workspace-selector-status", "Relaties laden…"); status.setAttribute("role", "status"); status.dataset.workspaceStatus = "true";
    const list = element("div", "mws-workspace-results");
    list.setAttribute("role", "listbox");
    list.dataset.workspaceResults = "true";
    results.forEach((result) => { const option = element("button", "mws-workspace-result"); option.type = "button"; option.setAttribute("role", "option"); option.append(element("strong", "", result.companyName || "Onbekende relatie"), element("span", "", [result.entityType === "lead" ? "Lead" : "Klant", result.contactName, result.status, result.createdAt ? new Date(result.createdAt).toLocaleDateString("nl-NL") : "", result.assignedUserName ? `Eigenaar: ${result.assignedUserName}` : ""].filter(Boolean).join(" · "))); if (typeof onSelect === "function") option.addEventListener("click", () => onSelect(result)); list.append(option); });
    if (!results.length) list.append(element("p", "mws-workspace-no-results", "Relaties laden…"));
    selector.append(header, tabs, input, status, list, element("small", "mws-workspace-selector-hint", "Gebruik ↑ en ↓ om te navigeren · Esc sluit"));
    return selector;
  }

  function LoadingSkeleton({ rows = 3, label = "Laden" } = {}) {
    const skeleton = element("div", "mws-sidebar-loading");
    skeleton.setAttribute("role", "status");
    skeleton.setAttribute("aria-label", label);
    for (let index = 0; index < rows; index += 1) skeleton.append(element("span", "mws-sidebar-skeleton"));
    return skeleton;
  }

  function EmployeeSelector({ results = [], loading = false, query = "", error = "", current = null, onSearch, onSelect, onStop, onClose } = {}) {
    const selector = element("section", "mws-employee-selector");
    selector.setAttribute("role", "dialog"); selector.setAttribute("aria-modal", "true"); selector.setAttribute("aria-label", "Medewerkerperspectief kiezen"); selector.tabIndex = -1;
    const header = element("header", "mws-workspace-selector-header");
    const title = element("div"); title.append(element("span", "mws-workspace-kicker", "Perspectief"), element("strong", "", "Bekijk als medewerker"));
    const close = element("button", "mws-workspace-selector-close", "×"); close.type = "button"; close.setAttribute("aria-label", "Medewerkerselector sluiten");
    if (typeof onClose === "function") close.addEventListener("click", onClose); header.append(title, close);
    const explanation = element("p", "mws-employee-selector-explanation", "Alleen de veilige dashboardweergave verandert. Je blijft ingelogd als jezelf.");
    const input = element("input", "mws-workspace-search"); input.type = "search"; input.value = query; input.placeholder = "Zoek medewerker op naam"; input.dataset.employeeSearch = "true"; input.setAttribute("aria-label", input.placeholder);
    if (typeof onSearch === "function") input.addEventListener("input", (event) => onSearch(event.target.value));
    const status = element("div", `mws-workspace-selector-status${error ? " is-error" : ""}`, error || (loading ? "Medewerkers laden…" : `${results.length} ${results.length === 1 ? "medewerker" : "medewerkers"}`)); status.setAttribute("role", "status"); status.dataset.employeeStatus = "true";
    const list = element("div", "mws-workspace-results"); list.setAttribute("role", "listbox"); list.dataset.employeeResults = "true";
    if (loading) list.append(LoadingSkeleton({ rows: 4, label: "Medewerkers laden" }));
    else results.forEach((employee) => { const option = element("button", "mws-employee-result"); option.type = "button"; option.setAttribute("role", "option"); option.dataset.employeeId = employee.id; option.append(Avatar({ name: employee.name, imageUrl: employee.avatarUrl, size: "small", seed: employee.id })); const copy = element("span", "mws-employee-result-copy"); copy.append(element("strong", "", employee.name), element("small", "", [employee.roleLabel || employee.role, employee.team, "Actief"].filter(Boolean).join(" · "))); option.append(copy); if (typeof onSelect === "function") option.addEventListener("click", () => onSelect(employee)); list.append(option); });
    if (!loading && !results.length) list.append(element("p", "mws-workspace-no-results", query.trim().length < 2 ? "Typ minimaal twee tekens om te zoeken." : "Geen actieve medewerker gevonden."));
    selector.append(header, explanation, input, status, list);
    if (current) { const stop = element("button", "mws-perspective-stop", "Terug naar mijn dashboard"); stop.type = "button"; if (typeof onStop === "function") stop.addEventListener("click", onStop); selector.append(stop); }
    selector.append(element("small", "mws-workspace-selector-hint", "Gebruik ↑ en ↓ om te navigeren · Esc sluit"));
    return selector;
  }

  function UserProfileMenu({ user = {}, actions = [], perspective = null } = {}) {
    const wrapper = element("div", "mws-user-profile");
    const trigger = element("button", "mws-user-profile-trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-expanded", "false");
    trigger.append(Avatar({ name: user.name || user.email, imageUrl: user.avatarUrl, seed: user.id || user.authUserId }), profileCopy(user, perspective));
    const menu = element("div", "mws-user-profile-menu");
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    actions.forEach((action) => { const button = element(action.href && !action.disabled ? "a" : "button", "mws-user-profile-action", action.label); if (button.tagName === "BUTTON") button.type = "button"; if (action.href && !action.disabled) button.href = action.href; button.setAttribute("role", "menuitem"); if (action.disabled) { button.disabled = true; button.setAttribute("aria-disabled", "true"); } if (typeof action.onSelect === "function") button.addEventListener("click", (event) => { menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); action.onSelect(event); }); menu.append(button); });
    const menuItems = () => [...menu.children].filter((item) => !item.disabled);
    const setOpen = (open, focus = false) => { menu.hidden = !open; trigger.setAttribute("aria-expanded", String(open)); if (open && focus) menuItems()[0]?.focus(); };
    trigger.addEventListener("click", () => setOpen(menu.hidden));
    trigger.addEventListener("keydown", (event) => { if (["ArrowDown", "Enter", " "].includes(event.key) && menu.hidden) { event.preventDefault(); setOpen(true, true); } });
    menu.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.focus(); return; } if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return; const items = menuItems(); if (!items.length) return; event.preventDefault(); const current = items.indexOf(document.activeElement); const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current <= 0 ? items.length - 1 : current - 1); items[next].focus(); });
    wrapper.addEventListener("focusout", (event) => { if (!wrapper.contains(event.relatedTarget)) setOpen(false); });
    wrapper.append(trigger, menu);
    return wrapper;
  }

  function profileCopy(user, perspective) { const copy = element("span", "mws-user-profile-copy"); copy.append(element("strong", "", user.name || user.email || "Onbekende gebruiker"), element("small", "", user.roleLabel || user.role || "Rol onbekend")); if (perspective?.name) copy.append(element("small", "mws-user-profile-perspective", `Bekijkt als: ${perspective.name}`)); return copy; }
  function initials(name = "") { const parts = String(name || "").trim().split(/\s+/).filter(Boolean); const surnamePrefixes = ["de", "den", "der", "van", "von", "le", "la"]; const surname = parts.length > 2 && surnamePrefixes.includes(parts[1].toLowerCase()) ? parts[1] : parts.at(-1); return (parts.length > 1 ? `${parts[0][0]}${surname[0]}` : parts[0]?.slice(0, 2) || "—").toUpperCase(); }

  function AdminSidebar({ navigation, activeId = "", relationship = null, user = {}, perspective = null, badgeValues = {}, canAccess = () => true, onSwitchWorkspace, onSelectWorkspace, onClearWorkspace, profileActions = [] } = {}) {
    const config = navigation || global.MaxAdminSidebarNavigation?.ADMIN_SIDEBAR_NAVIGATION || [];
    const sidebar = element("aside", "mws-admin-sidebar-v2");
    sidebar.setAttribute("aria-label", "Admin navigatie");
    const brand = element("a", "mws-sidebar-brand"); brand.href = "admin-dashboard.html"; brand.setAttribute("aria-label", "Max Webstudio admin dashboard");
    const brandLogo = element("img", "mws-sidebar-brand-logo"); brandLogo.src = "/max-webstudio-logo-mark.svg"; brandLogo.alt = ""; brandLogo.width = 54; brandLogo.height = 54;
    const brandFallback = element("span", "mws-sidebar-brand-mark", "M"); brandFallback.setAttribute("aria-hidden", "true");
    const brandCopy = element("span", "mws-sidebar-brand-copy"); brandCopy.append(element("strong", "", "Max Webstudio"), element("small", "", "BUILD BETTER ONLINE"));
    brandLogo.addEventListener("error", () => brand.classList.add("is-fallback"), { once: true });
    brand.append(brandLogo, brandFallback, brandCopy); sidebar.append(brand);
    const content = element("div", "mws-sidebar-content");
    config.forEach((section) => { if (section.type === "workspace") content.append(WorkspaceCard({ relationship, onSwitch: onSwitchWorkspace, onSelect: onSelectWorkspace, onClear: onClearWorkspace })); else content.append(SidebarSection({ section, activeId, badgeValues, relationship, canAccess })); });
    sidebar.append(content, UserProfileMenu({ user, perspective, actions: profileActions }));
    return sidebar;
  }

  const api = Object.freeze({ AdminSidebar, Avatar, EmptyWorkspaceState, EmployeeSelector, LoadingSkeleton, MetricBadge, SidebarItem, SidebarSection, StatusBadge, UserProfileMenu, WorkspaceCard, WorkspaceSelector, avatarTone, icon, initials, safeImageUrl });
  global.MaxAdminSidebar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
