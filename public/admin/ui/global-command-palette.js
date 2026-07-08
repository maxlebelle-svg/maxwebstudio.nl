(function initGlobalCommandPalette() {
  if (window.MaxGlobalCommandPalette?.ready) return;

  const STORAGE = {
    recents: "maxwebstudioGlobalSearchRecents",
    pinned: "maxwebstudioGlobalSearchPinned",
    customers: ["maxwebstudioCrmCustomers", "maxwebstudioCustomers", "maxwebstudioProfiles"],
    leads: ["maxwebstudioLeads", "maxwebstudioLeadRequests", "maxwebstudioLeadFinderLeads"],
    invoices: ["maxwebstudioInvoices"],
    emails: ["maxwebstudioDemoEmails", "maxwebstudioEmailTemplates", "maxwebstudioMailLogs"],
    websites: ["maxwebstudioManagedSites", "maxwebstudioWebsites"],
    assets: ["maxwebstudioFiles", "maxwebstudioBrandAssets", "maxwebstudioLogoProjects"],
    tasks: ["maxwebstudioCrmTasks"],
    notifications: ["maxwebstudioClientPortalNotifications", "maxwebstudioActivityLog"],
    settings: ["maxwebstudioSettings"],
  };

  const GROUP_ORDER = [
    "Pinned",
    "Recent",
    "Commands",
    "Klanten",
    "Leads",
    "Facturen",
    "E-mails",
    "Websites",
    "Branding",
    "Assets",
    "Instellingen",
    "AI",
    "Notifications",
    "Documentation",
  ];

  const PAGE_RESULTS = [
    ["dashboard", "Open Dashboard", "Admin CRM overzicht", "admin-dashboard.html", "Instellingen", "Page"],
    ["notification-center", "Open Notification Center", "CRM alerts en activity feed", "admin-notification-center.html", "Notifications", "Page"],
    ["mail-center", "Open Mail Center", "Verzonden e-mails en Resend statussen", "admin-mail-center.html", "E-mails", "Page"],
    ["email-studio", "Open E-mail Studio", "Templates beheren", "admin-email-studio.html", "E-mails", "Page"],
    ["customers", "Open Klanten", "Customer CRM", "admin-klanten.html", "Klanten", "Page"],
    ["sales", "Open Leads", "Lead generator en sales pipeline", "admin-sales.html", "Leads", "Page"],
    ["invoices", "Open Facturen", "Facturen en betalingen", "admin-facturen.html", "Facturen", "Page"],
    ["quotes", "Open Offertes", "Offertes en proposal flow", "admin-offertes.html", "Facturen", "Page"],
    ["websites", "Open Websites", "Website Operations Center", "admin-websites.html", "Websites", "Page"],
    ["website-factory", "Open Website Factory", "AI website builds en previews", "admin-website-factory.html", "Websites", "Page"],
    ["seo-studio", "Open SEO Studio", "SEO scans en content", "admin-seo-studio.html", "AI", "Page"],
    ["qa-scanner", "Open QA Scanner", "Website quality scans", "admin-website-qa-scanner.html", "AI", "Page"],
    ["logo-studio", "Open Logo Studio", "Logo concepten genereren", "admin-logo-studio.html", "Branding", "Page"],
    ["brand-center", "Open Brand Center", "Brand assets en stijlgids", "admin-brand-center.html", "Branding", "Page"],
    ["assets", "Open Asset Manager", "Bestanden en klantassets", "admin-assets.html", "Assets", "Page"],
    ["domain-center", "Open Domein Center", "Domeinen en hosting", "admin-domain-center.html", "Websites", "Page"],
    ["ai-content", "Open AI Content Library", "Content en prompts", "admin-ai-content-library.html", "AI", "Page"],
    ["social-media", "Open Social Media Studio", "Campagnes en posts", "admin-social-media-studio.html", "AI", "Page"],
    ["onboarding", "Open Onboarding", "Klant onboarding checklist", "admin-onboarding.html", "Klanten", "Page"],
    ["settings", "Open Settings", "Instellingen en systeemstatus", "admin-instellingen.html", "Instellingen", "Page"],
    ["docs-design", "Documentation: Premium CRM Design System", "Design afspraken en UI patronen", "docs/design-system/PREMIUM_CRM_DESIGN_SYSTEM.md", "Documentation", "Doc"],
  ];

  const COMMANDS = [
    ["new-customer", "Nieuwe klant", "Maak een nieuw klantprofiel aan", "Klanten", "Command", "admin-klanten.html", "#open-new-customer-secondary"],
    ["new-lead", "Nieuwe lead", "Open lead generator", "Leads", "Command", "admin-sales.html", "#leadfinder-focus-search"],
    ["new-invoice", "Nieuwe factuur", "Maak een factuur aan", "Facturen", "Command", "admin-facturen.html", "#new-invoice"],
    ["new-quote", "Nieuwe offerte", "Maak een offerte aan", "Facturen", "Command", "admin-offertes.html", "#new-quote"],
    ["send-email", "Verzend e-mail", "Open Mail Center", "E-mails", "Command", "admin-mail-center.html", "#mail-refresh"],
    ["open-mail", "Open Mail Center", "Verzonden CRM-mails", "E-mails", "Command", "admin-mail-center.html"],
    ["open-notifications", "Open Notification Center", "CRM notifications", "Notifications", "Command", "admin-notification-center.html"],
    ["open-dashboard", "Open Dashboard", "Max CRM home", "Instellingen", "Command", "admin-dashboard.html"],
    ["open-seo", "Open SEO Studio", "SEO projecten", "AI", "Command", "admin-seo-studio.html"],
    ["open-factory", "Open Website Factory", "Website previews genereren", "Websites", "Command", "admin-website-factory.html"],
    ["open-logo", "Open Logo Studio", "Logo generatie", "Branding", "Command", "admin-logo-studio.html"],
    ["open-ai-content", "Open AI Content Library", "AI content genereren", "AI", "Command", "admin-ai-content-library.html"],
    ["open-assets", "Open Asset Manager", "Assets beheren", "Assets", "Command", "admin-assets.html"],
    ["open-domain", "Open Domein Center", "Domeinen beheren", "Websites", "Command", "admin-domain-center.html"],
    ["open-brand", "Open Brand Center", "Brand assets beheren", "Branding", "Command", "admin-brand-center.html"],
    ["open-settings", "Open Settings", "CRM instellingen", "Instellingen", "Command", "admin-instellingen.html"],
    ["generate-logo", "Generate logo", "Start Logo Studio", "Branding", "Command", "admin-logo-studio.html"],
    ["start-onboarding", "Start onboarding", "Open onboarding module", "Klanten", "Command", "admin-onboarding.html"],
  ];

  const state = {
    open: false,
    query: "",
    activeIndex: 0,
    results: [],
    focusable: [],
    debounceTimer: 0,
  };

  function escapeHtml(value = "") {
    const shared = window.MaxSharedUI?.escapeHtml || window.escapeHtml;
    if (typeof shared === "function" && shared !== escapeHtml) return shared(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can fail in private contexts; search still works without history.
    }
  }

  function normalize(value = "") {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function uniqueRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.type}:${row.id || row.url || row.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function result({ id, type, group, title, subtitle = "", url = "", status = "", icon = "", updatedAt = "", metadata = {}, action = "", hint = "Enter" }) {
    return {
      id: String(id || `${type}-${title}-${url}`),
      type,
      group,
      title: String(title || "Untitled"),
      subtitle: String(subtitle || ""),
      url,
      status: String(status || type || ""),
      icon: icon || iconFor(type, group),
      updatedAt: updatedAt || metadata.updatedAt || metadata.createdAt || "",
      metadata,
      action,
      hint,
      searchable: normalize([title, subtitle, type, group, status, url, Object.values(metadata || {}).join(" ")].join(" ")),
    };
  }

  function iconFor(type, group) {
    if (type === "Command") return ">";
    if (group === "Klanten") return "K";
    if (group === "Leads") return "L";
    if (group === "Facturen") return "€";
    if (group === "E-mails") return "@";
    if (group === "Websites") return "W";
    if (group === "Branding") return "B";
    if (group === "Assets") return "A";
    if (group === "AI") return "AI";
    if (group === "Notifications") return "!";
    if (group === "Instellingen") return "#";
    return "•";
  }

  function compactDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" }).format(date);
  }

  function pageResult(row) {
    const [id, title, subtitle, url, group, type] = row;
    return result({ id, title, subtitle, url, group, type, status: type, icon: iconFor(type, group), metadata: { source: "page" } });
  }

  function commandResult(row) {
    const [id, title, subtitle, group, type, url, action] = row;
    return result({ id, title, subtitle, url, group: "Commands", type, status: group, icon: ">", action, metadata: { group } });
  }

  function rowsFromKeys(keys, mapper) {
    return keys.flatMap((key) => readArray(key).map((item) => mapper(item, key))).filter(Boolean);
  }

  function buildEntityIndex() {
    const customers = rowsFromKeys(STORAGE.customers, (item) => result({
      id: item.id || item.profileId || item.customerId || item.email,
      type: "Customer",
      group: "Klanten",
      title: item.company || item.name || item.email || "Klant",
      subtitle: [item.name, item.email, item.website || item.domain].filter(Boolean).join(" · "),
      url: `admin-klanten.html?customerId=${encodeURIComponent(item.id || item.profileId || item.customerId || "")}`,
      status: item.status || item.portalStatus || "customer",
      updatedAt: item.updatedAt || item.createdAt || item.customerSince,
      metadata: item,
    }));

    const leads = rowsFromKeys(STORAGE.leads, (item) => result({
      id: item.id || item.leadId || item.email || item.companyName,
      type: "Lead",
      group: "Leads",
      title: item.companyName || item.company || item.name || item.contactName || "Lead",
      subtitle: [item.contactName || item.name, item.email, item.phone, item.websiteUrl || item.website].filter(Boolean).join(" · "),
      url: `admin-sales.html?leadId=${encodeURIComponent(item.id || item.leadId || "")}`,
      status: item.status || item.callStatus || item.websiteStatus || "lead",
      updatedAt: item.updatedAt || item.createdAt || item.followUpDate,
      metadata: item,
    }));

    const invoices = rowsFromKeys(STORAGE.invoices, (item) => result({
      id: item.id || item.invoiceNumber || item.number,
      type: "Invoice",
      group: "Facturen",
      title: item.invoiceNumber || item.number || item.title || "Factuur",
      subtitle: [item.customerCompany || item.customerName, item.title, item.total ? `€ ${item.total}` : ""].filter(Boolean).join(" · "),
      url: `admin-facturen.html?invoiceId=${encodeURIComponent(item.id || "")}`,
      status: item.status || item.paymentStatus || "invoice",
      updatedAt: item.updatedAt || item.invoiceDate || item.createdAt,
      metadata: item,
    }));

    const emails = rowsFromKeys(STORAGE.emails, (item) => result({
      id: item.id || item.messageId || item.templateKey || item.subject,
      type: item.templateKey ? "Email template" : "Email",
      group: "E-mails",
      title: item.subject || item.templateName || item.name || item.templateKey || "E-mail",
      subtitle: [item.toEmail || item.toName, item.status, item.providerMessageId].filter(Boolean).join(" · "),
      url: item.templateKey ? "admin-email-studio.html" : "admin-mail-center.html",
      status: item.status || item.templateKey || "email",
      updatedAt: item.updatedAt || item.createdAt || item.sentAt,
      metadata: item,
    }));

    const websites = rowsFromKeys(STORAGE.websites, (item) => result({
      id: item.id || item.domain || item.liveUrl,
      type: "Website",
      group: "Websites",
      title: item.name || item.domain || item.liveUrl || "Website",
      subtitle: [item.customerCompany || item.customerName, item.domain, item.liveUrl].filter(Boolean).join(" · "),
      url: `admin-websites.html?websiteId=${encodeURIComponent(item.id || "")}`,
      status: item.status || item.publishStatus || item.sslStatus || "website",
      updatedAt: item.updatedAt || item.lastDeployAt || item.createdAt,
      metadata: item,
    }));

    const assets = rowsFromKeys(STORAGE.assets, (item) => result({
      id: item.id || item.name || item.fileName,
      type: item.type || "Asset",
      group: item.type === "logo" || item.kind === "logo" ? "Branding" : "Assets",
      title: item.name || item.fileName || item.label || "Asset",
      subtitle: [item.customerName || item.customerCompany, item.category || item.kind, item.status].filter(Boolean).join(" · "),
      url: item.type === "logo" || item.kind === "logo" ? "admin-brand-center.html" : "admin-assets.html",
      status: item.status || item.category || "asset",
      updatedAt: item.updatedAt || item.createdAt,
      metadata: item,
    }));

    const tasks = rowsFromKeys(STORAGE.tasks, (item) => result({
      id: item.id || item.title,
      type: "Task",
      group: "Notifications",
      title: item.title || "Taak",
      subtitle: [item.customerName, item.projectName, item.notes].filter(Boolean).join(" · "),
      url: "admin-roadmap.html",
      status: item.status || item.priority || "task",
      updatedAt: item.updatedAt || item.dueDate || item.createdAt,
      metadata: item,
    }));

    const notifications = rowsFromKeys(STORAGE.notifications, (item) => result({
      id: item.id || item.title || item.action,
      type: "Notification",
      group: "Notifications",
      title: item.title || item.action || item.eventType || "Notification",
      subtitle: item.description || item.message || item.module || "",
      url: "admin-notification-center.html",
      status: item.severity || item.status || "notification",
      updatedAt: item.updatedAt || item.createdAt || item.timestamp,
      metadata: item,
    }));

    return uniqueRows([
      ...COMMANDS.map(commandResult),
      ...PAGE_RESULTS.map(pageResult),
      ...customers,
      ...leads,
      ...invoices,
      ...emails,
      ...websites,
      ...assets,
      ...tasks,
      ...notifications,
    ]);
  }

  function score(row, query) {
    if (!query) return row.type === "Command" ? 90 : 20;
    const title = normalize(row.title);
    const type = normalize(row.type);
    const group = normalize(row.group);
    let value = 0;
    if (title === query) value += 120;
    if (title.startsWith(query)) value += 90;
    if (type.includes(query) || group.includes(query)) value += 55;
    if (row.searchable.includes(query)) value += 35;
    if (row.type === "Command" && (title.includes(query) || type.includes(query))) value += 35;
    if (query.includes("invoice") && row.group === "Facturen") value += 40;
    if (query.includes("mail") && row.group === "E-mails") value += 40;
    if (query.includes("website") && row.group === "Websites") value += 40;
    return value;
  }

  function pinnedResults() {
    const pinned = readJson(STORAGE.pinned, []);
    return Array.isArray(pinned) ? pinned.map((item) => result({ ...item, group: "Pinned", status: item.status || "pinned", hint: "Enter" })) : [];
  }

  function recentResults() {
    const recents = readJson(STORAGE.recents, []);
    return Array.isArray(recents) ? recents.slice(0, 8).map((item) => result({ ...item, group: "Recent", status: item.status || "recent", hint: "Enter" })) : [];
  }

  function search(query = "") {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) {
      return uniqueRows([...pinnedResults(), ...recentResults(), ...COMMANDS.slice(0, 8).map(commandResult)]);
    }
    return uniqueRows([...pinnedResults(), ...buildEntityIndex()])
      .map((item) => ({ ...item, _score: score(item, normalizedQuery) }))
      .filter((item) => item._score > 0)
      .sort((a, b) => b._score - a._score || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
      .slice(0, 20);
  }

  function ensurePalette() {
    if (document.querySelector("[data-global-command-palette]")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="global-command-backdrop" data-global-command-palette hidden>
        <section class="global-command-dialog" role="dialog" aria-modal="true" aria-labelledby="global-command-title">
          <header class="global-command-header">
            <div>
              <p class="section-kicker">Global Search</p>
              <h2 id="global-command-title">Command Palette</h2>
            </div>
            <button class="global-command-close" type="button" aria-label="Sluiten">×</button>
          </header>
          <label class="global-command-input-wrap" for="global-command-input">
            <span aria-hidden="true">⌕</span>
            <input id="global-command-input" type="search" autocomplete="off" placeholder="Zoek klanten, leads, websites, facturen of voer een opdracht uit..." />
            <kbd>ESC</kbd>
          </label>
          <div class="global-command-quick" aria-label="Quick actions"></div>
          <div class="global-command-results" role="listbox" aria-label="Zoekresultaten"></div>
          <footer class="global-command-footer">
            <span>↑↓ navigeren</span><span>Enter openen</span><span>Tab secties</span><span>P pinnen</span>
          </footer>
        </section>
      </div>
    `);

    const backdrop = getBackdrop();
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closePalette();
    });
    backdrop.querySelector(".global-command-close")?.addEventListener("click", closePalette);
    input().addEventListener("input", () => {
      window.clearTimeout(state.debounceTimer);
      state.debounceTimer = window.setTimeout(() => {
        state.query = input().value;
        state.activeIndex = 0;
        renderResults();
      }, 90);
    });
    input().addEventListener("keydown", handleInputKeydown);
    renderQuickActions();
  }

  function getBackdrop() {
    return document.querySelector("[data-global-command-palette]");
  }

  function input() {
    return document.getElementById("global-command-input");
  }

  function resultsContainer() {
    return document.querySelector(".global-command-results");
  }

  function openPalette(seed = "") {
    ensurePalette();
    state.open = true;
    state.query = seed || "";
    state.activeIndex = 0;
    const backdrop = getBackdrop();
    backdrop.hidden = false;
    document.body.classList.add("global-command-open");
    input().value = seed || "";
    renderResults();
    window.setTimeout(() => input().focus({ preventScroll: true }), 20);
  }

  function closePalette() {
    const backdrop = getBackdrop();
    if (!backdrop) return;
    state.open = false;
    backdrop.hidden = true;
    document.body.classList.remove("global-command-open");
  }

  function renderQuickActions() {
    const quick = document.querySelector(".global-command-quick");
    if (!quick) return;
    quick.innerHTML = COMMANDS.slice(0, 6).map((command) => {
      const item = commandResult(command);
      return `<button type="button" data-command-id="${escapeHtml(item.id)}"><span>${escapeHtml(item.icon)}</span>${escapeHtml(item.title)}</button>`;
    }).join("");
    quick.querySelectorAll("[data-command-id]").forEach((button) => {
      button.addEventListener("click", () => executeResult(commandResult(COMMANDS.find(([id]) => id === button.dataset.commandId))));
    });
  }

  function renderResults() {
    state.results = search(state.query);
    const container = resultsContainer();
    if (!container) return;
    if (!state.results.length) {
      container.innerHTML = `
        <div class="global-command-empty">
          <strong>No results found.</strong>
          <p>Probeer een klant, factuurnummer of website. Je kunt ook een nieuwe klant aanmaken.</p>
          <button class="button secondary" type="button" data-empty-command="new-customer">Create customer</button>
        </div>
      `;
      container.querySelector("[data-empty-command]")?.addEventListener("click", () => executeResult(commandResult(COMMANDS[0])));
      return;
    }
    const grouped = groupResults(state.results);
    let cursor = 0;
    container.innerHTML = grouped.map(([group, items]) => {
      const html = items.map((item) => {
        const index = cursor++;
        return resultCardHtml(item, index);
      }).join("");
      return `
        <details class="global-command-group" open>
          <summary>${escapeHtml(group)}<span>${items.length}</span></summary>
          <div>${html}</div>
        </details>
      `;
    }).join("");
    state.focusable = [...container.querySelectorAll("[data-result-index]")];
    state.focusable.forEach((button) => {
      button.addEventListener("click", () => executeResult(state.results[Number(button.dataset.resultIndex)]));
    });
    updateActiveResult();
  }

  function groupResults(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const group = row.group || "Recent";
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(row);
    });
    return [...map.entries()].sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
  }

  function resultCardHtml(item, index) {
    const date = compactDate(item.updatedAt);
    const pinLabel = isPinned(item) ? "Unpin" : "Pin";
    return `
      <button class="global-command-result" type="button" role="option" data-result-index="${index}" aria-selected="${index === state.activeIndex ? "true" : "false"}">
        <span class="global-command-icon">${escapeHtml(item.icon)}</span>
        <span class="global-command-main">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.subtitle || item.url || item.type)}</small>
        </span>
        <span class="global-command-meta">
          <mark>${escapeHtml(item.status || item.type)}</mark>
          ${date ? `<time>${escapeHtml(date)}</time>` : ""}
          <kbd>${escapeHtml(item.hint || "Enter")}</kbd>
          <em>${escapeHtml(pinLabel)}</em>
        </span>
      </button>
    `;
  }

  function updateActiveResult() {
    state.focusable.forEach((button, index) => {
      const active = index === state.activeIndex;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      if (active) button.scrollIntoView({ block: "nearest" });
    });
  }

  function handleInputKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.activeIndex = Math.min(state.activeIndex + 1, Math.max(0, state.results.length - 1));
      updateActiveResult();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      state.activeIndex = Math.max(0, state.activeIndex - 1);
      updateActiveResult();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      executeResult(state.results[state.activeIndex]);
      return;
    }
    if (event.key.toLowerCase() === "p" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      togglePin(state.results[state.activeIndex]);
      renderResults();
    }
  }

  function executeResult(item) {
    if (!item) return;
    rememberRecent(item);
    if (item.action && document.querySelector(item.action)) {
      closePalette();
      document.querySelector(item.action).click();
      return;
    }
    if (item.action && item.url && samePath(item.url)) {
      closePalette();
      window.setTimeout(() => document.querySelector(item.action)?.click(), 40);
      return;
    }
    if (item.url) {
      closePalette();
      window.location.href = item.url;
      return;
    }
    closePalette();
  }

  function samePath(url) {
    return String(url || "").split("?")[0] === window.location.pathname.split("/").pop();
  }

  function rememberRecent(item) {
    const recents = readJson(STORAGE.recents, []);
    const clean = compactResult(item);
    writeJson(STORAGE.recents, [clean, ...recents.filter((row) => `${row.type}:${row.id}` !== `${clean.type}:${clean.id}`)].slice(0, 12));
  }

  function compactResult(item) {
    return {
      id: item.id,
      type: item.type,
      group: item.group === "Pinned" ? item.metadata?.originalGroup || "Recent" : item.group,
      title: item.title,
      subtitle: item.subtitle,
      url: item.url,
      status: item.status,
      icon: item.icon,
      updatedAt: item.updatedAt,
      action: item.action,
      metadata: { originalGroup: item.group },
    };
  }

  function isPinned(item) {
    const pinned = readJson(STORAGE.pinned, []);
    return pinned.some((row) => `${row.type}:${row.id}` === `${item.type}:${item.id}`);
  }

  function togglePin(item) {
    if (!item) return;
    const pinned = readJson(STORAGE.pinned, []);
    const key = `${item.type}:${item.id}`;
    if (pinned.some((row) => `${row.type}:${row.id}` === key)) {
      writeJson(STORAGE.pinned, pinned.filter((row) => `${row.type}:${row.id}` !== key));
    } else {
      writeJson(STORAGE.pinned, [compactResult(item), ...pinned].slice(0, 12));
    }
  }

  function installShortcut() {
    document.addEventListener("keydown", (event) => {
      const key = String(event.key || "").toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        openPalette();
      }
      if (state.open && key === "escape") {
        event.preventDefault();
        closePalette();
      }
    });
    document.addEventListener("click", (event) => {
      const searchTrigger = event.target.closest(".admin-page-search, .admin-topbar-search");
      if (!searchTrigger) return;
      const inputEl = searchTrigger.querySelector("input[type='search']");
      if (!inputEl) return;
      event.preventDefault();
      openPalette(inputEl.value || "");
    });
  }

  window.MaxGlobalCommandPalette = {
    ready: true,
    open: openPalette,
    close: closePalette,
    search,
  };

  installShortcut();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensurePalette, { once: true });
  } else {
    ensurePalette();
  }
})();
