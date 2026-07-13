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

  function MetricBadge({ value = "", tone = "neutral", label = "" } = {}) {
    const badge = element("span", `mws-sidebar-badge is-${tone}`, value);
    if (label) badge.setAttribute("aria-label", label);
    if (value === "" || value === null || value === undefined) badge.hidden = true;
    return badge;
  }

  function StatusBadge({ label = "", tone = "neutral" } = {}) {
    const badge = element("span", `mws-sidebar-status is-${tone}`);
    badge.append(element("span", "mws-sidebar-status-dot"), element("span", "", label));
    return badge;
  }

  function Avatar({ name = "", imageUrl = "", size = "medium" } = {}) {
    const fallback = element("span", `mws-sidebar-avatar is-${size}`, initials(name));
    fallback.setAttribute("aria-label", name || "Gebruiker");
    if (!imageUrl) return fallback;
    const image = element("img", `mws-sidebar-avatar is-${size}`);
    image.alt = name || "Gebruiker";
    image.src = imageUrl;
    image.addEventListener("error", () => image.replaceWith(fallback), { once: true });
    return image;
  }

  function SidebarItem({ item, active = false, badgeValue, disabled = false, workspaceMuted = false } = {}) {
    const link = element("a", "mws-sidebar-item");
    link.href = item.route;
    link.dataset.sidebarItem = item.id;
    link.dataset.workspaceRequired = String(Boolean(item.workspaceRequired));
    if (active) { link.classList.add("is-active"); link.setAttribute("aria-current", "page"); }
    if (disabled) { link.classList.add("is-disabled"); link.setAttribute("aria-disabled", "true"); link.tabIndex = -1; }
    if (workspaceMuted) link.classList.add("is-workspace-muted");
    link.append(icon(item.icon), element("span", "mws-sidebar-item-label", item.label));
    if (item.badge) link.append(MetricBadge({ value: badgeValue, tone: item.statusTone, label: `${item.label}: ${badgeValue}` }));
    return link;
  }

  function SidebarSection({ section, activeId = "", badgeValues = {}, relationship = null, canAccess = () => true } = {}) {
    const wrapper = element("section", "mws-sidebar-section");
    wrapper.dataset.sidebarSection = section.id;
    const heading = element("h2", "mws-sidebar-section-label", section.label);
    const list = element("nav", "mws-sidebar-section-items");
    list.setAttribute("aria-label", section.label);
    section.items.filter(canAccess).forEach((entry) => list.append(SidebarItem({ item: entry, active: entry.id === activeId, badgeValue: badgeValues[entry.badge], workspaceMuted: entry.workspaceRequired && !relationship })));
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

  function WorkspaceCard({ relationship = null, onSwitch, onSelect } = {}) {
    const card = element("section", "mws-workspace-card");
    card.setAttribute("aria-label", "Actieve werkruimte");
    card.append(element("span", "mws-workspace-kicker", "Actieve werkruimte"));
    if (!relationship) { card.append(EmptyWorkspaceState({ onSelect: onSelect || onSwitch })); return card; }
    const head = element("div", "mws-workspace-heading");
    head.append(StatusBadge({ label: relationship.entityType === "lead" ? "Lead" : "Klant", tone: relationship.statusTone || "success" }), element("strong", "mws-workspace-company", relationship.companyName || "Onbekende relatie"));
    const detail = [relationship.lifecycleStage, relationship.assignedUserName ? `Eigenaar: ${relationship.assignedUserName}` : ""].filter(Boolean).join(" · ");
    card.append(head, element("p", "mws-workspace-detail", detail || "Status nog niet beschikbaar"));
    const button = element("button", "mws-workspace-action", "Wissel relatie");
    button.type = "button";
    if (typeof onSwitch === "function") button.addEventListener("click", onSwitch);
    card.append(button);
    return card;
  }

  function WorkspaceSelector({ results = [], onSearch, onSelect } = {}) {
    const selector = element("section", "mws-workspace-selector");
    selector.setAttribute("role", "dialog");
    selector.setAttribute("aria-modal", "true");
    selector.setAttribute("aria-label", "Relatie selecteren");
    const input = element("input", "mws-workspace-search");
    input.type = "search";
    input.placeholder = "Zoek op bedrijf, contactpersoon of e-mail";
    input.setAttribute("aria-label", input.placeholder);
    if (typeof onSearch === "function") input.addEventListener("input", (event) => onSearch(event.target.value));
    const list = element("div", "mws-workspace-results");
    list.setAttribute("role", "listbox");
    results.forEach((result) => { const option = element("button", "mws-workspace-result"); option.type = "button"; option.setAttribute("role", "option"); option.append(element("strong", "", result.companyName || "Onbekende relatie"), element("span", "", [result.entityType === "lead" ? "Lead" : "Klant", result.contactName, result.status].filter(Boolean).join(" · "))); if (typeof onSelect === "function") option.addEventListener("click", () => onSelect(result)); list.append(option); });
    if (!results.length) list.append(element("p", "mws-workspace-no-results", "Nog geen resultaten."));
    selector.append(input, list);
    return selector;
  }

  function LoadingSkeleton({ rows = 3, label = "Laden" } = {}) {
    const skeleton = element("div", "mws-sidebar-loading");
    skeleton.setAttribute("role", "status");
    skeleton.setAttribute("aria-label", label);
    for (let index = 0; index < rows; index += 1) skeleton.append(element("span", "mws-sidebar-skeleton"));
    return skeleton;
  }

  function UserProfileMenu({ user = {}, actions = [] } = {}) {
    const wrapper = element("div", "mws-user-profile");
    const trigger = element("button", "mws-user-profile-trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-expanded", "false");
    trigger.append(Avatar({ name: user.name || user.email, imageUrl: user.avatarUrl }), profileCopy(user));
    const menu = element("div", "mws-user-profile-menu");
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    actions.forEach((action) => { const button = element("button", "mws-user-profile-action", action.label); button.type = "button"; button.setAttribute("role", "menuitem"); if (action.disabled) button.disabled = true; if (typeof action.onSelect === "function") button.addEventListener("click", action.onSelect); menu.append(button); });
    trigger.addEventListener("click", () => { const open = menu.hidden; menu.hidden = !open; trigger.setAttribute("aria-expanded", String(open)); });
    wrapper.append(trigger, menu);
    return wrapper;
  }

  function profileCopy(user) { const copy = element("span", "mws-user-profile-copy"); copy.append(element("strong", "", user.name || user.email || "Onbekende gebruiker"), element("small", "", user.roleLabel || user.role || "Rol onbekend")); return copy; }
  function initials(name = "") { const parts = String(name || "").trim().split(/\s+/).filter(Boolean); return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "—").toUpperCase(); }

  function AdminSidebar({ navigation, activeId = "", relationship = null, user = {}, badgeValues = {}, canAccess = () => true, onSwitchWorkspace, onSelectWorkspace, profileActions = [] } = {}) {
    const config = navigation || global.MaxAdminSidebarNavigation?.ADMIN_SIDEBAR_NAVIGATION || [];
    const sidebar = element("aside", "mws-admin-sidebar-v2");
    sidebar.setAttribute("aria-label", "Admin navigatie");
    const brand = element("a", "mws-sidebar-brand"); brand.href = "admin-dashboard.html"; brand.append(element("span", "mws-sidebar-brand-mark", "M"), element("span", "", "Max Webstudio")); sidebar.append(brand);
    const content = element("div", "mws-sidebar-content");
    config.forEach((section) => { if (section.type === "workspace") content.append(WorkspaceCard({ relationship, onSwitch: onSwitchWorkspace, onSelect: onSelectWorkspace })); else content.append(SidebarSection({ section, activeId, badgeValues, relationship, canAccess })); });
    sidebar.append(content, UserProfileMenu({ user, actions: profileActions }));
    return sidebar;
  }

  const api = Object.freeze({ AdminSidebar, Avatar, EmptyWorkspaceState, LoadingSkeleton, MetricBadge, SidebarItem, SidebarSection, StatusBadge, UserProfileMenu, WorkspaceCard, WorkspaceSelector, icon, initials });
  global.MaxAdminSidebar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
