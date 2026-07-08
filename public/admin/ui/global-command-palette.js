(function initMaxCommand() {
  if (window.MaxCommand?.ready || window.MaxGlobalCommandPalette?.ready) return;

  const STORAGE = {
    recents: "maxwebstudioMaxCommandRecents",
    legacyRecents: "maxwebstudioGlobalSearchRecents",
    recentSearches: "maxwebstudioMaxCommandRecentSearches",
    recentPages: "maxwebstudioMaxCommandRecentPages",
    recentCustomers: "maxwebstudioMaxCommandRecentCustomers",
    pinned: "maxwebstudioMaxCommandPinned",
    legacyPinned: "maxwebstudioGlobalSearchPinned",
    customers: ["maxwebstudioCrmCustomers", "maxwebstudioCustomers", "maxwebstudioProfiles"],
    leads: ["maxwebstudioLeads", "maxwebstudioLeadRequests", "maxwebstudioLeadFinderLeads"],
    invoices: ["maxwebstudioInvoices"],
    emails: ["maxwebstudioDemoEmails", "maxwebstudioEmailTemplates", "maxwebstudioMailLogs"],
    brainCache: "maxwebstudioMaxBrainCache",
    websites: ["maxwebstudioManagedSites", "maxwebstudioWebsites"],
    projects: ["maxwebstudioProjects", "maxwebstudioCrmProjects"],
    assets: ["maxwebstudioFiles", "maxwebstudioBrandAssets", "maxwebstudioLogoProjects"],
    tasks: ["maxwebstudioCrmTasks"],
    notifications: ["maxwebstudioClientPortalNotifications", "maxwebstudioActivityLog"],
    automations: ["maxwebstudioAutomationWorkflows", "maxwebstudioAutomationExecutions"],
    settings: ["maxwebstudioSettings"],
  };

  const GROUP_ORDER = [
    "Pinned",
    "Recent",
    "Commands",
    "Klanten",
    "Leads",
    "Facturen",
    "Projecten",
    "E-mails",
    "Websites",
    "Branding",
    "Assets",
    "Instellingen",
    "AI",
    "Automations",
    "Notifications",
    "Documentation",
  ];

  const PAGE_RESULTS = [
    ["dashboard", "Open Dashboard", "Admin CRM overzicht", "admin-dashboard.html", "Instellingen", "Page"],
    ["notification-center", "Open Notification Center", "CRM alerts en activity feed", "admin-notification-center.html", "Notifications", "Page"],
    ["commercial-order", "Open Nieuwe Opdracht", "Order, voorwaarden, betaling en projectstart", "admin-nieuwe-opdracht.html", "Facturen", "Page"],
    ["max-automations", "Open Max Automations", "No-code workflow builder", "admin-max-automations.html", "Automations", "Page"],
    ["max-brain", "Open Max Brain", "AI context engine diagnostics", "admin-max-brain.html", "AI", "Page"],
    ["platform-health", "Open Platform Health", "System status, production monitoring en platform diagnostics", "admin-platform-health.html", "Instellingen", "Page"],
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
    ["new-commercial-order", "Nieuwe opdracht", "Start order naar contract, betaling en project", "Facturen", "Command", "admin-nieuwe-opdracht.html"],
    ["new-quote", "Nieuwe offerte", "Maak een offerte aan", "Facturen", "Command", "admin-offertes.html", "#new-quote"],
    ["send-email", "Verzend e-mail", "Open Mail Center", "E-mails", "Command", "admin-mail-center.html", "#mail-refresh"],
    ["open-mail", "Open Mail Center", "Verzonden CRM-mails", "E-mails", "Command", "admin-mail-center.html"],
    ["open-notifications", "Open Notification Center", "CRM notifications", "Notifications", "Command", "admin-notification-center.html"],
    ["open-automations", "Open Max Automations", "Workflow builder en simulation runs", "Automations", "Command", "admin-max-automations.html"],
    ["open-customer", "Open customer", "Open klantenmodule", "Klanten", "Command", "admin-klanten.html"],
    ["open-project", "Open project", "Open projectenmodule", "Projecten", "Command", "admin-projecten.html"],
    ["open-invoice", "Open invoice", "Open facturenmodule", "Facturen", "Command", "admin-facturen.html"],
    ["open-timeline", "Open timeline", "Open klanttimeline en activity feed", "Notifications", "Command", "admin-notification-center.html"],
    ["open-health", "Open health", "Open Platform Health Center", "Instellingen", "Command", "admin-platform-health.html"],
    ["search-customer", "Search customer", "Zoek klanten in Max Command", "Klanten", "Command", "admin-klanten.html"],
    ["search-project", "Search project", "Zoek projecten in Max Command", "Projecten", "Command", "admin-projecten.html"],
    ["show-ceo-summary", "Show CEO summary", "Open CEO Mode briefing", "Instellingen", "Command", "admin-dashboard.html#dashboard"],
    ["open-max-brain", "Open Max Brain", "Context engine diagnostics", "AI", "Command", "admin-max-brain.html"],
    ["open-platform-health", "Open Platform Health", "System status, production monitoring en diagnostics", "Instellingen", "Command", "admin-platform-health.html"],
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
    ["open-onboarding", "Open onboarding", "Open klant onboarding", "Klanten", "Command", "admin-onboarding.html"],
    ["review-onboarding", "Review onboarding", "Open onboarding review", "Klanten", "Command", "admin-onboarding.html"],
    ["approve-onboarding", "Approve onboarding", "Open onboarding goedkeuring", "Klanten", "Command", "admin-onboarding.html"],
    ["send-onboarding-reminder", "Send onboarding reminder", "Open onboarding reminders", "Klanten", "Command", "admin-onboarding.html"],
    ["open-website-factory-input", "Open Website Factory input", "Open Website Factory met onboardinginput", "Websites", "Command", "admin-website-factory.html"],
  ];

  const state = {
    open: false,
    query: "",
    activeIndex: 0,
    intent: null,
    results: [],
    focusable: [],
    debounceTimer: 0,
  };

  const MaxCommandAI = window.maxCommandAI || {
    analyzeIntent(query = "") {
      const text = normalize(query);
      const command = COMMANDS.find(([id, title]) => text && (normalize(title).includes(text) || text.includes(normalize(title))));
      if (/^(open|ga naar|toon|laat zien)\b/.test(text) || text.startsWith("open ")) {
        return { type: "Navigation", confidence: 0.82, query: text };
      }
      if (/^(maak|nieuwe|create|genereer|generate|start|verzend|send)\b/.test(text)) {
        return { type: "Action", confidence: 0.78, commandId: command?.[0] || actionCommandId(text), query: text };
      }
      if (/^(welke|wat|hoeveel|wie|waar)\b/.test(text) || text.includes("?")) {
        return { type: "Question", confidence: 0.72, query: text };
      }
      if (/(openstaande|klaar|wachten|ouder dan|vandaag|betaald|facturen|websites|leads)/.test(text)) {
        return { type: "Filter", confidence: 0.68, query: text };
      }
      return { type: text ? "Search" : "Search", confidence: text ? 0.54 : 0.2, query: text };
    },
    suggestActions(item = {}) {
      if (item.type === "Customer") return ["Create invoice", "Send email", "Generate logo", "Start onboarding", "Open assets", "Open timeline", "View website"];
      if (item.type === "Invoice") return ["Mark paid", "Open invoice", "Send reminder", "Download PDF"];
      if (item.group === "Websites") return ["Open website", "Resume Website Factory", "Run QA scan"];
      return ["Open", "Pin", "Search related"];
    },
    answerQuestion(query = "") {
      return `Max AI is voorbereid voor vragen zoals: "${String(query || "").trim()}". Tot de AI-backend live is, gebruik ik de lokale CRM-index als veilige fallback.`;
    },
  };

  window.maxCommandAI = MaxCommandAI;

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

  function readMergedJson(primaryKey, legacyKey, fallback) {
    const primary = readJson(primaryKey, null);
    if (primary !== null) return primary;
    return readJson(legacyKey, fallback);
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

  function words(value = "") {
    return normalize(value).split(/\s+/).filter(Boolean);
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
    if (group === "Automations") return "⚡";
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

    const projects = rowsFromKeys(STORAGE.projects, (item) => result({
      id: item.id || item.projectId || item.name,
      type: "Project",
      group: "Projecten",
      title: item.name || item.projectName || item.title || "Project",
      subtitle: [item.customerName || item.customerCompany, item.status, item.phase].filter(Boolean).join(" · "),
      url: `admin-projecten.html?projectId=${encodeURIComponent(item.id || item.projectId || "")}`,
      status: item.status || item.phase || "project",
      updatedAt: item.updatedAt || item.updated_at || item.createdAt || item.created_at,
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

    const automations = rowsFromKeys(STORAGE.automations, (item) => result({
      id: item.id || item.name || item.workflowName,
      type: item.workflowId ? "Automation Run" : "Workflow",
      group: "Automations",
      title: item.name || item.workflowName || "Automation",
      subtitle: [item.description, item.trigger, item.status].filter(Boolean).join(" · "),
      url: "admin-max-automations.html",
      status: item.status || item.trigger || "automation",
      updatedAt: item.updatedAt || item.completedAt || item.startedAt || item.createdAt,
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
      ...projects,
      ...assets,
      ...tasks,
      ...notifications,
      ...automations,
    ]);
  }

  function actionCommandId(text = "") {
    if (/(zoek|search).*(klant|customer)/.test(text)) return "search-customer";
    if (/(zoek|search).*(project)/.test(text)) return "search-project";
    if (/(klant|customer)/.test(text)) return "new-customer";
    if (/(lead)/.test(text)) return "new-lead";
    if (/(opdracht|order|contract)/.test(text)) return "new-commercial-order";
    if (/(factuur|invoice)/.test(text)) return "new-invoice";
    if (/(offerte|quote)/.test(text)) return "new-quote";
    if (/(mail|email|e-mail)/.test(text)) return "send-email";
    if (/(logo)/.test(text)) return "generate-logo";
    if (/(onboarding)/.test(text)) return "start-onboarding";
    if (/(brain|context|ai context|max brain)/.test(text)) return "open-max-brain";
    if (/(health|system|status|production|monitoring|platform)/.test(text)) return "open-platform-health";
    if (/(ceo|summary|briefing|samenvatting)/.test(text)) return "show-ceo-summary";
    if (/(timeline|activity|feed)/.test(text)) return "open-timeline";
    return "";
  }

  function fuzzyScore(query = "", target = "") {
    const q = normalize(query);
    const t = normalize(target);
    if (!q || !t) return 0;
    if (t === q) return 100;
    if (t.startsWith(q)) return 86;
    if (t.includes(q)) return 68;
    const queryWords = words(q);
    const targetWords = words(t);
    const partialWordScore = queryWords.reduce((sum, word) => {
      if (targetWords.some((targetWord) => targetWord.startsWith(word))) return sum + 18;
      if (targetWords.some((targetWord) => targetWord.includes(word))) return sum + 11;
      return sum;
    }, 0);
    let qIndex = 0;
    let streak = 0;
    let subsequence = 0;
    for (let index = 0; index < t.length && qIndex < q.length; index += 1) {
      if (t[index] === q[qIndex]) {
        qIndex += 1;
        streak += 1;
        subsequence += 4 + Math.min(streak, 5);
      } else {
        streak = 0;
      }
    }
    const typoTolerance = qIndex >= Math.max(2, q.length - 1) ? 24 : 0;
    return Math.min(64, partialWordScore + subsequence + typoTolerance);
  }

  function score(row, query, intent = null) {
    if (!query) return row.group === "Pinned" ? 120 : row.group === "Recent" ? 95 : row.type === "Command" ? 90 : 20;
    const title = normalize(row.title);
    const type = normalize(row.type);
    const group = normalize(row.group);
    let value = 0;
    if (title === query) value += 120;
    if (title.startsWith(query)) value += 90;
    if (type.includes(query) || group.includes(query)) value += 55;
    if (row.searchable.includes(query)) value += 35;
    value += fuzzyScore(query, [row.title, row.subtitle, row.type, row.group].join(" "));
    if (row.type === "Command" && (title.includes(query) || type.includes(query))) value += 35;
    if (intent?.type === "Action" && row.type === "Command") value += 48;
    if (intent?.type === "Navigation" && row.type === "Page") value += 42;
    if (intent?.commandId && row.id === intent.commandId) value += 120;
    if (intent?.type === "Question" && ["Facturen", "Websites", "Leads", "Klanten", "Notifications"].includes(row.group)) value += 18;
    if (query.includes("invoice") && row.group === "Facturen") value += 40;
    if (query.includes("factuur") && row.group === "Facturen") value += 40;
    if (query.includes("mail") && row.group === "E-mails") value += 40;
    if (query.includes("website") && row.group === "Websites") value += 40;
    return value;
  }

  function pinnedResults() {
    const pinned = readMergedJson(STORAGE.pinned, STORAGE.legacyPinned, []);
    return Array.isArray(pinned) ? pinned.map((item) => result({ ...item, group: "Pinned", status: item.status || "pinned", hint: "Enter" })) : [];
  }

  function recentResults() {
    const recents = readMergedJson(STORAGE.recents, STORAGE.legacyRecents, []);
    return Array.isArray(recents) ? recents.slice(0, 8).map((item) => result({ ...item, group: "Recent", status: item.status || "recent", hint: "Enter" })) : [];
  }

  function search(query = "") {
    const normalizedQuery = normalize(query);
    const intent = MaxCommandAI.analyzeIntent(query);
    state.intent = intent;
    if (!normalizedQuery) {
      return uniqueRows([...pinnedResults(), ...recentResults(), ...recentSearchResults(), ...COMMANDS.slice(0, 8).map(commandResult)]);
    }
    return uniqueRows([...pinnedResults(), ...buildEntityIndex()])
      .map((item) => ({ ...item, _score: score(item, normalizedQuery, intent) }))
      .filter((item) => item._score > 0)
      .sort((a, b) => b._score - a._score || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
      .slice(0, 20);
  }

  function recentSearchResults() {
    const searches = readJson(STORAGE.recentSearches, []);
    return Array.isArray(searches) ? searches.slice(0, 4).map((query) => result({
      id: `search-${query}`,
      type: "Search",
      group: "Recent",
      title: `Zoek "${query}"`,
      subtitle: "Recente zoekopdracht",
      status: "search",
      icon: "⌕",
      metadata: { query },
    })) : [];
  }

  function highlightText(text = "", query = "") {
    const raw = String(text || "");
    const q = normalize(query);
    if (!q) return escapeHtml(raw);
    const lowerRaw = normalize(raw);
    const start = lowerRaw.indexOf(q);
    if (start >= 0) {
      return `${escapeHtml(raw.slice(0, start))}<mark>${escapeHtml(raw.slice(start, start + q.length))}</mark>${escapeHtml(raw.slice(start + q.length))}`;
    }
    const chars = new Set(q.replace(/\s+/g, "").split(""));
    return raw.split("").map((char) => chars.has(normalize(char)) ? `<mark>${escapeHtml(char)}</mark>` : escapeHtml(char)).join("");
  }

  function ensurePalette() {
    if (document.querySelector("[data-global-command-palette]")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="global-command-backdrop" data-global-command-palette hidden>
        <section class="global-command-dialog" role="dialog" aria-modal="true" aria-labelledby="global-command-title">
          <header class="global-command-header">
            <div>
              <p class="section-kicker">Max AI</p>
              <h2 id="global-command-title">Max Command</h2>
              <span>Zoek, navigeer of geef een opdracht aan Max AI.</span>
            </div>
            <button class="global-command-close" type="button" aria-label="Sluiten">×</button>
          </header>
          <div class="global-command-layout">
            <div class="global-command-left">
              <label class="global-command-input-wrap" for="global-command-input">
                <span aria-hidden="true">⌕</span>
                <input id="global-command-input" type="search" autocomplete="off" placeholder="Zoek klanten, leads, websites, facturen of voer een opdracht uit..." />
                <kbd>ESC</kbd>
              </label>
              <div class="max-command-intent" aria-live="polite"></div>
              <div class="global-command-quick" aria-label="AI suggestions"></div>
              <div class="global-command-results" role="listbox" aria-label="Zoekresultaten"></div>
            </div>
            <aside class="max-command-preview" aria-live="polite">
              <section class="max-command-preview-card" data-preview-panel>
                <span>Context Preview</span>
                <strong>Selecteer een resultaat</strong>
                <p>Max toont hier context, slimme acties en vervolgstappen.</p>
              </section>
              <section class="max-command-ai-card" data-ai-panel>
                <span>AI Suggestions</span>
                <div class="max-command-ai-suggestions"></div>
              </section>
              <section class="max-command-actions-card">
                <span>Quick Actions</span>
                <div class="max-command-side-actions"></div>
              </section>
              <section class="max-command-shortcuts-card">
                <span>Keyboard Shortcuts</span>
                <p><kbd>⌘/Ctrl K</kbd> open</p>
                <p><kbd>↑↓</kbd> navigeren</p>
                <p><kbd>Tab</kbd> volgende groep</p>
                <p><kbd>Enter</kbd> openen</p>
                <p><kbd>Esc</kbd> sluiten</p>
              </section>
            </aside>
          </div>
          <footer class="global-command-footer">
            <span>Natural language ready</span><span>Fuzzy search</span><span>Pinned first</span>
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
    const suggestions = suggestedCommands();
    quick.innerHTML = `<strong>Suggested</strong>${suggestions.map((command) => {
      const item = commandResult(command);
      return `<button type="button" data-command-id="${escapeHtml(item.id)}"><span>${escapeHtml(item.icon)}</span>${escapeHtml(item.title)}</button>`;
    }).join("")}`;
    quick.querySelectorAll("[data-command-id]").forEach((button) => {
      button.addEventListener("click", () => executeResult(commandResult(COMMANDS.find(([id]) => id === button.dataset.commandId))));
    });
  }

  function suggestedCommands() {
    const notifications = readArray("maxwebstudioClientPortalNotifications").length + readArray("maxwebstudioActivityLog").length;
    const invoices = readArray("maxwebstudioInvoices").filter((invoice) => !["betaald", "paid"].includes(normalize(invoice.status || invoice.paymentStatus))).length;
    const automations = readArray("maxwebstudioAutomationWorkflows").length;
    const brainCache = readJson(STORAGE.brainCache, null);
    const hasBrainRecommendations = Array.isArray(brainCache?.recommendations) && brainCache.recommendations.length > 0;
    const baseIds = [
      readMergedJson(STORAGE.recents, STORAGE.legacyRecents, []).length ? "open-dashboard" : "new-customer",
      invoices ? "new-invoice" : "open-mail",
      "start-onboarding",
      "generate-logo",
      automations ? "open-automations" : "open-factory",
      hasBrainRecommendations ? "open-max-brain" : notifications ? "open-notifications" : "open-assets",
    ];
    return baseIds.map((id) => COMMANDS.find(([commandId]) => commandId === id)).filter(Boolean);
  }

  function renderResults() {
    state.results = search(state.query);
    renderIntent();
    renderQuickActions();
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
      renderPreview(null);
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

  function renderIntent() {
    const target = document.querySelector(".max-command-intent");
    if (!target) return;
    const intent = state.intent || MaxCommandAI.analyzeIntent(state.query);
    const answer = intent.type === "Question" && state.query ? MaxCommandAI.answerQuestion(state.query) : "";
    target.innerHTML = `
      <span>Intent: ${escapeHtml(intent.type || "Search")}</span>
      <strong>${escapeHtml(intentSummary(intent))}</strong>
      ${answer ? `<p>${escapeHtml(answer)}</p>` : ""}
    `;
  }

  function intentSummary(intent = {}) {
    if (intent.type === "Action") return "Ik zoek eerst de beste uitvoerbare opdracht.";
    if (intent.type === "Navigation") return "Ik prioriteer pagina's en navigatiecommando's.";
    if (intent.type === "Question") return "AI-vraagmodus staat klaar; lokale search blijft actief.";
    if (intent.type === "Filter") return "Ik vertaal dit naar relevante CRM-filters.";
    return "Typ natuurlijk of zoek direct op objectnaam.";
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
          <strong>${highlightText(item.title, state.query)}</strong>
          <small>${highlightText(item.subtitle || item.url || item.type, state.query)}</small>
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
    renderPreview(state.results[state.activeIndex] || null);
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
    if (event.key === "Tab") {
      event.preventDefault();
      moveActiveGroup(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key.toLowerCase() === "p" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      togglePin(state.results[state.activeIndex]);
      renderResults();
    }
  }

  function moveActiveGroup(direction = 1) {
    if (!state.results.length) return;
    const currentGroup = state.results[state.activeIndex]?.group;
    const groups = state.results.map((item) => item.group);
    let targetIndex = state.activeIndex;
    if (direction > 0) {
      targetIndex = groups.findIndex((group, index) => index > state.activeIndex && group !== currentGroup);
      if (targetIndex < 0) targetIndex = 0;
    } else {
      for (let index = state.activeIndex - 1; index >= 0; index -= 1) {
        if (groups[index] !== currentGroup) {
          targetIndex = index;
          while (targetIndex > 0 && groups[targetIndex - 1] === groups[targetIndex]) targetIndex -= 1;
          break;
        }
      }
      if (targetIndex === state.activeIndex) targetIndex = Math.max(0, state.results.length - 1);
    }
    state.activeIndex = targetIndex;
    updateActiveResult();
  }

  function renderPreview(item) {
    const panel = document.querySelector("[data-preview-panel]");
    const aiPanel = document.querySelector(".max-command-ai-suggestions");
    const actionPanel = document.querySelector(".max-command-side-actions");
    if (!panel || !aiPanel || !actionPanel) return;
    if (!item) {
      panel.innerHTML = `<span>Context Preview</span><strong>Selecteer een resultaat</strong><p>Max toont hier context, slimme acties en vervolgstappen.</p>`;
      aiPanel.innerHTML = `<p>Typ bijvoorbeeld: Maak factuur voor Quantum, Open Mail Center, Welke leads zijn vandaag toegevoegd?</p>`;
      actionPanel.innerHTML = sideActionButtons(COMMANDS.slice(0, 4).map(commandResult));
      bindSideActions();
      return;
    }
    const meta = item.metadata || {};
    const rows = previewRows(item, meta);
    panel.innerHTML = `
      <span>${escapeHtml(item.type)} · ${escapeHtml(item.group)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.subtitle || item.url || "Geen extra omschrijving beschikbaar.")}</p>
      <div class="max-command-preview-grid">
        ${rows.map(([label, value]) => `<div><small>${escapeHtml(label)}</small><b>${escapeHtml(value || "-")}</b></div>`).join("")}
      </div>
    `;
    aiPanel.innerHTML = MaxCommandAI.suggestActions(item).map((suggestion) => `<button type="button" data-ai-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>`).join("");
    actionPanel.innerHTML = sideActionButtons(previewActions(item));
    bindSideActions();
  }

  function previewRows(item, meta) {
    if (item.type === "Customer") {
      const openInvoices = readArray("maxwebstudioInvoices").filter((invoice) => [meta.id, meta.profileId, meta.customerId].filter(Boolean).includes(invoice.profileId || invoice.customerId)).filter((invoice) => !["betaald", "paid"].includes(normalize(invoice.status || invoice.paymentStatus))).length;
      return [
        ["Customer", meta.company || meta.name || item.title],
        ["Status", meta.status || item.status],
        ["Package", meta.package || meta.plan],
        ["Website", meta.website || meta.domain],
        ["Open invoices", String(openInvoices)],
        ["Last activity", compactDate(meta.updatedAt || meta.createdAt)],
        ["Timeline summary", "Open timeline voor alle events"],
        ["Assigned sales", meta.ownerName || meta.salesOwner || "-"],
      ];
    }
    if (item.type === "Invoice") {
      return [["Invoice", item.title], ["Status", item.status], ["Customer", meta.customerCompany || meta.customerName], ["Total", meta.total ? `€ ${meta.total}` : ""], ["Updated", compactDate(item.updatedAt)]];
    }
    if (item.type === "Website") {
      return [["Website", item.title], ["Status", item.status], ["Customer", meta.customerCompany || meta.customerName], ["Domain", meta.domain], ["Updated", compactDate(item.updatedAt)]];
    }
    return [["Type", item.type], ["Status", item.status], ["Group", item.group], ["Updated", compactDate(item.updatedAt)], ["URL", item.url]];
  }

  function previewActions(item) {
    if (item.type === "Customer") {
      return [
        result({ id: "open-customer-preview", type: "Command", group: "Commands", title: "Open customer", url: item.url, icon: "K" }),
        commandResult(COMMANDS.find(([id]) => id === "new-invoice")),
        commandResult(COMMANDS.find(([id]) => id === "send-email")),
        result({ id: "open-timeline-preview", type: "Command", group: "Commands", title: "Open timeline", url: item.url, icon: "T" }),
        commandResult(COMMANDS.find(([id]) => id === "open-factory")),
        result({ id: "add-note-preview", type: "Command", group: "Commands", title: "Add note", url: item.url, icon: "N" }),
      ];
    }
    if (item.type === "Invoice") {
      return [
        result({ id: "open-invoice-preview", type: "Command", group: "Commands", title: "Open invoice", url: item.url, icon: "€" }),
        commandResult(COMMANDS.find(([id]) => id === "send-email")),
        result({ id: "download-pdf-preview", type: "Command", group: "Commands", title: "Download PDF", url: item.url, icon: "PDF" }),
      ];
    }
    return [item, commandResult(COMMANDS.find(([id]) => id === "open-dashboard"))].filter(Boolean);
  }

  function sideActionButtons(items = []) {
    return items.filter(Boolean).map((item, index) => `<button type="button" data-side-action="${index}">${escapeHtml(item.title)}</button>`).join("");
  }

  function bindSideActions() {
    document.querySelectorAll("[data-side-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const selected = state.results[state.activeIndex] || null;
        const actions = selected ? previewActions(selected) : COMMANDS.slice(0, 4).map(commandResult);
        executeResult(actions[Number(button.dataset.sideAction)]);
      });
    });
  }

  function executeResult(item) {
    if (!item) return;
    rememberRecent(item);
    if (item.type === "Search" && item.metadata?.query) {
      openPalette(item.metadata.query);
      return;
    }
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
    const recents = readMergedJson(STORAGE.recents, STORAGE.legacyRecents, []);
    const clean = compactResult(item);
    writeJson(STORAGE.recents, [clean, ...recents.filter((row) => `${row.type}:${row.id}` !== `${clean.type}:${clean.id}`)].slice(0, 12));
    if (state.query) {
      const searches = readJson(STORAGE.recentSearches, []);
      writeJson(STORAGE.recentSearches, [state.query, ...searches.filter((query) => normalize(query) !== normalize(state.query))].slice(0, 10));
    }
    if (item.type === "Page" || item.url) {
      const pages = readJson(STORAGE.recentPages, []);
      writeJson(STORAGE.recentPages, [clean, ...pages.filter((row) => row.url !== clean.url)].slice(0, 10));
    }
    if (item.type === "Customer") {
      const customers = readJson(STORAGE.recentCustomers, []);
      writeJson(STORAGE.recentCustomers, [clean, ...customers.filter((row) => row.id !== clean.id)].slice(0, 10));
    }
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
    const pinned = readMergedJson(STORAGE.pinned, STORAGE.legacyPinned, []);
    return pinned.some((row) => `${row.type}:${row.id}` === `${item.type}:${item.id}`);
  }

  function togglePin(item) {
    if (!item) return;
    const pinned = readMergedJson(STORAGE.pinned, STORAGE.legacyPinned, []);
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

  window.MaxCommand = {
    ready: true,
    open: openPalette,
    close: closePalette,
    search,
    analyzeIntent: (query) => MaxCommandAI.analyzeIntent(query),
  };
  window.MaxGlobalCommandPalette = window.MaxCommand;

  installShortcut();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensurePalette, { once: true });
  } else {
    ensurePalette();
  }
})();
