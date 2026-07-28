(function foodDashboardModule(globalScope) {
  "use strict";

  const STATUS_LABELS = Object.freeze({ pending: "Nieuw", accepted: "Geaccepteerd", preparing: "In bereiding", ready: "Gereed", completed: "Afgerond", cancelled: "Geannuleerd" });
  const STATUS_ACTIONS = Object.freeze({ accepted: "Bestelling accepteren", preparing: "Start bereiding", ready: "Markeer als gereed", completed: "Bestelling afronden" });
  const POLL_INTERVAL_MS = 5000;
  const MAX_PRICE_MINOR = 100000000;

  function parseEuroMinor(value) {
    const input = String(value ?? "").trim();
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(input)) return null;
    const [whole, decimals = ""] = input.replace(",", ".").split(".");
    const minor = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
    return Number.isSafeInteger(minor) && minor >= 0 && minor <= MAX_PRICE_MINOR ? minor : null;
  }

  function formatMoney(minor, currency = "EUR") {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format((Number(minor) || 0) / 100);
  }

  function nextStatus(status, role) {
    if (role === "viewer") return null;
    if (role === "kitchen_staff") return status === "accepted" ? "preparing" : status === "preparing" ? "ready" : null;
    return ({ pending: "accepted", accepted: "preparing", preparing: "ready", ready: "completed" })[status] || null;
  }

  function dayKey(value, timezone) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
    } catch { return ""; }
  }

  function dashboardMetrics(orders, timezone, now = new Date()) {
    const today = dayKey(now, timezone);
    return orders.reduce((result, order) => {
      if (order.status === "pending") result.pending += 1;
      if (["accepted", "preparing"].includes(order.status)) result.preparing += 1;
      if (order.status === "ready") result.ready += 1;
      if (order.status === "completed" && dayKey(order.updated_at || order.created_at, timezone) === today) {
        result.completed += 1;
        result.revenue_minor += Number(order.total_minor) || 0;
      }
      return result;
    }, { pending: 0, preparing: 0, ready: 0, completed: 0, revenue_minor: 0 });
  }

  function createFoodManagementClient(fetchImpl, tokenProvider, basePath = "/api/food/v1") {
    async function request(path, options = {}) {
      const token = await tokenProvider();
      const response = await fetchImpl(`${basePath}${path}`, {
        ...options,
        cache: "no-store",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true) {
        const error = new Error(payload.error || "De Food-service is tijdelijk niet beschikbaar.");
        error.code = payload.code || (response.status === 401 ? "AUTH_REQUIRED" : "REQUEST_FAILED");
        error.status = response.status;
        throw error;
      }
      return payload.data;
    }
    return {
      context: () => request("/session/context"),
      orders: (scope) => request(`/accounts/${encodeURIComponent(scope.account_ref)}/orders?${new URLSearchParams({ location_id: scope.location_ref, limit: "100", offset: "0" })}`),
      order: (scope, orderId) => request(`/accounts/${encodeURIComponent(scope.account_ref)}/orders/${encodeURIComponent(orderId)}`),
      transition: (scope, orderId, status) => request(`/accounts/${encodeURIComponent(scope.account_ref)}/orders/${encodeURIComponent(orderId)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }),
      menu: (scope) => request(`/accounts/${encodeURIComponent(scope.account_ref)}/menu?${new URLSearchParams({ location_id: scope.location_ref })}`),
      updateMenuItem: (scope, itemId, changes) => request(`/accounts/${encodeURIComponent(scope.account_ref)}/menu/items/${encodeURIComponent(itemId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }),
    };
  }

  function createDashboardApp(options = {}) {
    if (typeof document === "undefined") throw new Error("Dashboard requires a browser document.");
    const api = createFoodManagementClient(options.fetch || globalScope.fetch.bind(globalScope), options.sessionProvider);
    const node = (name) => document.querySelector(`[data-${name}]`);
    const nodes = {
      app: node("app"), loading: node("loading"), error: node("error"), errorTitle: node("error-title"), errorMessage: node("error-message"), retry: node("retry"),
      locationName: node("location-name"), locationWordmark: node("location-wordmark"), locationLogoText: node("location-logo-text"), locationLogoSuffix: node("location-logo-suffix"), locationRole: node("location-role"), scopeSelect: node("scope-select"), pollingLabel: node("polling-label"), signout: node("signout"),
      breadcrumb: node("breadcrumb"), pageTitle: node("page-title"), lastUpdated: node("last-updated"), refresh: node("refresh"), storefrontLink: node("storefront-link"),
      newNavCount: node("new-nav-count"), newCallout: node("new-callout"), newCount: node("new-count"), welcomeTitle: node("welcome-title"),
      metricPending: node("metric-pending"), metricPreparing: node("metric-preparing"), metricReady: node("metric-ready"), metricCompleted: node("metric-completed"), metricRevenue: node("metric-revenue"),
      recentOrders: node("recent-orders"), recentEmpty: node("recent-empty"), orders: node("orders"), ordersEmpty: node("orders-empty"), orderCount: node("order-count"),
      menuPermission: node("menu-permission"), menuGroups: node("menu-groups"), menuEmpty: node("menu-empty"), detailOverlay: node("detail-overlay"), detailDrawer: node("detail-drawer"), detailTitle: node("detail-title"), detailBody: node("detail-body"), detailClose: node("detail-close"), toast: node("toast"),
    };
    const state = { active: false, context: null, scope: null, orders: [], menu: null, filter: "all", route: "dashboard", pollTimer: null, loadingOrders: false, mutation: false, toastTimer: null, selectedOrder: null };

    function el(tag, className, text) { const result = document.createElement(tag); if (className) result.className = className; if (text !== undefined) result.textContent = text; return result; }
    function roleLabel(role) { return ({ owner: "Eigenaar", manager: "Manager", staff: "Medewerker", kitchen_staff: "Keukenmedewerker", viewer: "Alleen bekijken", platform_admin: "Platformbeheer" })[role] || "Restaurantlid"; }
    function statusLabel(status) { return STATUS_LABELS[status] || "Onbekend"; }
    function safeMessage(error) {
      if (["AUTH_REQUIRED", "INVALID_SESSION"].includes(error?.code)) return "Je sessie is verlopen. Log opnieuw in.";
      if (["FORBIDDEN", "CAPABILITY_UNAVAILABLE"].includes(error?.code)) return "Je account heeft voor deze restaurantlocatie geen toegang.";
      if (error?.code === "INVALID_TRANSITION") return "Deze statusstap is niet meer toegestaan. De bestelling wordt opnieuw geladen.";
      return "Het Food-dashboard kon de actuele gegevens niet veilig laden. Probeer het opnieuw.";
    }
    function showToast(message) { nodes.toast.textContent = message; nodes.toast.hidden = false; globalScope.clearTimeout(state.toastTimer); state.toastTimer = globalScope.setTimeout(() => { nodes.toast.hidden = true; }, 2600); }
    function setBusy(value) { state.mutation = value; nodes.refresh.disabled = value; }
    function showError(error) { nodes.loading.hidden = true; nodes.app.hidden = true; nodes.error.hidden = false; nodes.errorTitle.textContent = error?.status === 403 ? "Geen toegang tot Food" : "Dashboard niet beschikbaar"; nodes.errorMessage.textContent = safeMessage(error); }
    function showApp() { nodes.loading.hidden = true; nodes.error.hidden = true; nodes.app.hidden = false; document.documentElement.dataset.foodDashboardState = "ready"; }

    function currentRoute(pathname = globalScope.location.pathname) {
      if (/\/admin\/food\/menu\/?$/.test(pathname)) return "menu";
      if (/\/admin\/food\/orders(?:\/|$)/.test(pathname)) return "orders";
      return "dashboard";
    }
    function routePath(route) { return route === "orders" ? "/admin/food/orders" : route === "menu" ? "/admin/food/menu" : "/admin/food"; }
    function setRoute(route, push = false) {
      state.route = route;
      if (push && globalScope.location.pathname !== routePath(route)) globalScope.history.pushState({}, "", routePath(route));
      for (const view of document.querySelectorAll("[data-view]")) view.hidden = view.dataset.view !== route;
      for (const link of document.querySelectorAll("[data-route]")) link.setAttribute("aria-current", link.dataset.route === route ? "page" : "false");
      const copy = { dashboard: ["Food / Overzicht", "Restaurantdashboard"], orders: ["Food / Bestellingen", "Bestellingen"], menu: ["Food / Menukaart", "Menukaart"] }[route];
      nodes.breadcrumb.textContent = copy[0]; nodes.pageTitle.textContent = copy[1];
      if (route === "menu" && !state.menu) loadMenu().catch(showError);
    }

    function configureScope() {
      const scopes = state.context?.scopes || [];
      state.scope = state.scope || scopes[0];
      const logoText = String(state.scope.branding?.logo_text || "").trim();
      nodes.locationName.textContent = state.scope.location_name;
      nodes.locationName.hidden = Boolean(logoText);
      nodes.locationWordmark.hidden = !logoText;
      nodes.locationLogoText.textContent = logoText;
      nodes.locationLogoSuffix.textContent = String(state.scope.branding?.logo_suffix || "").trim();
      nodes.locationRole.textContent = `${roleLabel(state.scope.role)} · ${state.scope.city || "Locatie"}`;
      nodes.welcomeTitle.textContent = `${state.scope.location_name} in één oogopslag.`;
      nodes.storefrontLink.href = `/food/${encodeURIComponent(state.scope.storefront_slug)}`;
      nodes.scopeSelect.replaceChildren();
      for (const scope of scopes) { const option = el("option", "", `${scope.account_name} · ${scope.location_name}`); option.value = `${scope.account_ref}:${scope.location_ref}`; nodes.scopeSelect.append(option); }
      nodes.scopeSelect.hidden = scopes.length < 2;
      nodes.scopeSelect.value = `${state.scope.account_ref}:${state.scope.location_ref}`;
    }

    function orderTime(value) { try { return new Intl.DateTimeFormat("nl-NL", { timeZone: state.scope.timezone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(value)); } catch { return "Onbekend"; } }
    function orderReference(order) { return String(order.public_reference || order.id || "").slice(0, 8).toUpperCase(); }
    function orderCard(order) {
      const button = el("button", `food-order-card${order.status === "pending" ? " is-new" : ""}`); button.type = "button"; button.dataset.orderId = order.id; button.setAttribute("aria-label", `Open bestelling ${orderReference(order)}`);
      const ref = el("div", "food-order-ref"); ref.append(el("strong", "", `#${orderReference(order)}`), el("small", "", orderTime(order.created_at)));
      const status = el("div", "food-order-cell"); status.append(el("span", "", "Status"), el("strong", `food-status ${order.status}`, statusLabel(order.status)));
      const fulfilment = el("div", "food-order-cell"); fulfilment.append(el("span", "", "Type"), el("strong", "", order.fulfilment_type === "pickup" ? "Afhalen" : "Onbekend"));
      const total = el("div", "food-order-cell"); total.append(el("span", "", "Totaal"), el("strong", "", formatMoney(order.total_minor, order.currency)));
      button.append(ref, status, fulfilment, total, el("span", "food-order-open", "Open →"));
      button.addEventListener("click", () => openOrder(order.id));
      return button;
    }

    function renderOrders() {
      const metrics = dashboardMetrics(state.orders, state.scope.timezone);
      nodes.metricPending.textContent = metrics.pending; nodes.metricPreparing.textContent = metrics.preparing; nodes.metricReady.textContent = metrics.ready; nodes.metricCompleted.textContent = metrics.completed; nodes.metricRevenue.textContent = formatMoney(metrics.revenue_minor, state.scope.currency);
      nodes.newNavCount.textContent = metrics.pending; nodes.newNavCount.hidden = metrics.pending === 0; nodes.newCallout.hidden = metrics.pending === 0; nodes.newCount.textContent = metrics.pending;
      nodes.recentOrders.replaceChildren(...state.orders.slice(0, 6).map(orderCard)); nodes.recentEmpty.hidden = state.orders.length > 0;
      const filtered = state.filter === "all" ? state.orders : state.orders.filter((order) => order.status === state.filter);
      nodes.orders.replaceChildren(...filtered.map(orderCard)); nodes.ordersEmpty.hidden = filtered.length > 0; nodes.orderCount.textContent = `${filtered.length} ${filtered.length === 1 ? "resultaat" : "resultaten"}`;
      nodes.lastUpdated.textContent = `Bijgewerkt ${new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`;
    }

    async function loadOrders(options = {}) {
      if (!state.active || state.loadingOrders || !state.scope?.permissions?.orders_read || document.hidden) return;
      state.loadingOrders = true;
      try { const result = await api.orders(state.scope); state.orders = Array.isArray(result.orders) ? result.orders : []; renderOrders(); if (!options.silent) showApp(); }
      finally { state.loadingOrders = false; }
    }

    function detailField(label, value) { const wrap = el("div"); wrap.append(el("span", "", label), el("strong", "", value || "—")); return wrap; }
    function renderDetail(order) {
      nodes.detailTitle.textContent = `Bestelling #${orderReference(order)}`; nodes.detailBody.replaceChildren();
      const overview = el("section", "food-detail-card"); overview.append(el("h3", "", "Overzicht")); const grid = el("div", "food-detail-grid"); grid.append(detailField("Status", statusLabel(order.status)), detailField("Tijdstip", orderTime(order.created_at)), detailField("Klant", order.customer?.name), detailField("Telefoon", order.customer?.phone), detailField("Afhalen", order.fulfilment?.pickup_at ? orderTime(order.fulfilment.pickup_at) : "Zo snel mogelijk"), detailField("Totaal", formatMoney(order.total_minor, order.currency))); overview.append(grid);
      const items = el("section", "food-detail-card"); items.append(el("h3", "", "Bestelde gerechten")); for (const item of order.items || []) { const line = el("div", "food-detail-line"); line.append(el("span", "", `${item.quantity} × ${item.item_name_snapshot}`), el("strong", "", formatMoney(item.line_total_minor, order.currency))); items.append(line); }
      nodes.detailBody.append(overview, items);
      if (order.customer_note) { const note = el("section", "food-detail-card"); note.append(el("h3", "", "Opmerking"), el("p", "", order.customer_note)); nodes.detailBody.append(note); }
      const next = state.scope.permissions.orders_update ? nextStatus(order.status, state.scope.role) : null;
      if (next) { const actions = el("section", "food-detail-card food-status-actions"); actions.append(el("h3", "", "Volgende stap")); const action = el("button", "food-status-action", STATUS_ACTIONS[next]); action.type = "button"; action.addEventListener("click", () => transitionOrder(order.id, next, action)); actions.append(action); nodes.detailBody.append(actions); }
      const history = el("section", "food-detail-card"); history.append(el("h3", "", "Statusgeschiedenis")); for (const entry of order.status_history || []) { const line = el("div", "food-history-line"); line.append(el("span", "", statusLabel(entry.new_status)), el("small", "", orderTime(entry.created_at))); history.append(line); } nodes.detailBody.append(history);
    }

    async function openOrder(orderId) {
      if (globalScope.location.pathname !== `/admin/food/orders/${orderId}`) globalScope.history.pushState({}, "", `/admin/food/orders/${orderId}`);
      nodes.detailOverlay.hidden = false; nodes.detailDrawer.hidden = false; nodes.detailBody.replaceChildren(el("p", "", "Bestelling veilig laden…"));
      try { const order = await api.order(state.scope, orderId); state.selectedOrder = order; renderDetail(order); nodes.detailClose.focus(); }
      catch (error) { nodes.detailBody.replaceChildren(el("p", "", safeMessage(error))); }
    }
    function closeDetail() { nodes.detailOverlay.hidden = true; nodes.detailDrawer.hidden = true; state.selectedOrder = null; if (/\/admin\/food\/orders\/[0-9a-f-]{36}$/.test(globalScope.location.pathname)) globalScope.history.pushState({}, "", "/admin/food/orders"); }
    async function transitionOrder(orderId, status, button) {
      if (state.mutation) return; setBusy(true); button.disabled = true; button.textContent = "Status bijwerken…";
      try { await api.transition(state.scope, orderId, status); const fresh = await api.order(state.scope, orderId); state.selectedOrder = fresh; renderDetail(fresh); await loadOrders({ silent: true }); showToast(`Bestelling staat nu op ${statusLabel(fresh.status).toLowerCase()}.`); }
      catch (error) { showToast(safeMessage(error)); const fresh = await api.order(state.scope, orderId).catch(() => null); if (fresh) renderDetail(fresh); }
      finally { setBusy(false); }
    }

    function renderMenu() {
      const menu = state.menu || { categories: [], items: [] }; const itemsByCategory = new Map(menu.categories.map((category) => [category.id, []])); for (const item of menu.items || []) if (itemsByCategory.has(item.category_id)) itemsByCategory.get(item.category_id).push(item);
      nodes.menuGroups.replaceChildren(); nodes.menuPermission.textContent = state.scope.permissions.menu_update ? "Prijs en beschikbaarheid beheren" : "Alleen bekijken";
      for (const category of menu.categories || []) {
        const group = el("section", "food-menu-group"); group.append(el("h3", "", category.name));
        for (const item of itemsByCategory.get(category.id) || []) {
          const row = el("article", "food-menu-item"); const copy = el("div", "food-menu-copy"); copy.append(el("strong", "", item.name), el("small", "", item.description || "Geen omschrijving"));
          const form = el("form", "food-price-form"); const label = el("label", "", `Prijs van ${item.name}`); const input = el("input"); input.name = "price"; input.inputMode = "decimal"; input.value = (item.price_minor / 100).toFixed(2).replace(".", ","); input.disabled = !state.scope.permissions.menu_update; const save = el("button", "food-button food-button-secondary", "Opslaan"); save.type = "submit"; save.disabled = !state.scope.permissions.menu_update; form.append(label, input, save); form.addEventListener("submit", (event) => { event.preventDefault(); updatePrice(item, input, save); });
          const availability = el("label", "food-availability"); const toggle = el("input"); toggle.type = "checkbox"; toggle.checked = item.available === true; toggle.disabled = !state.scope.permissions.menu_update; toggle.addEventListener("change", () => updateAvailability(item, toggle)); availability.append(toggle, el("span", "", toggle.checked ? "Beschikbaar" : "Niet beschikbaar"));
          row.append(copy, form, availability); group.append(row);
        }
        nodes.menuGroups.append(group);
      }
      nodes.menuEmpty.hidden = (menu.items || []).length > 0;
    }
    async function loadMenu() { if (!state.scope?.permissions?.menu_read) return; state.menu = await api.menu(state.scope); renderMenu(); }
    async function updatePrice(item, input, button) {
      if (state.mutation) return; const price = parseEuroMinor(input.value); if (price === null) { input.setAttribute("aria-invalid", "true"); showToast("Gebruik een geldige prijs, bijvoorbeeld 12,50."); return; }
      input.setAttribute("aria-invalid", "false"); setBusy(true); button.disabled = true;
      try { const updated = await api.updateMenuItem(state.scope, item.id, { price_minor: price }); item.price_minor = updated.price_minor; input.value = (updated.price_minor / 100).toFixed(2).replace(".", ","); showToast(`${item.name} staat nu op ${formatMoney(updated.price_minor, state.scope.currency)}.`); }
      catch (error) { showToast(safeMessage(error)); }
      finally { setBusy(false); button.disabled = !state.scope.permissions.menu_update; }
    }
    async function updateAvailability(item, toggle) {
      if (state.mutation) return; const desired = toggle.checked; setBusy(true); toggle.disabled = true;
      try { const updated = await api.updateMenuItem(state.scope, item.id, { available: desired }); item.available = updated.available; toggle.nextElementSibling.textContent = updated.available ? "Beschikbaar" : "Niet beschikbaar"; showToast(`${item.name} is ${updated.available ? "beschikbaar" : "tijdelijk niet beschikbaar"}.`); }
      catch (error) { toggle.checked = !desired; showToast(safeMessage(error)); }
      finally { setBusy(false); toggle.disabled = !state.scope.permissions.menu_update; }
    }

    function schedulePoll() { globalScope.clearInterval(state.pollTimer); state.pollTimer = globalScope.setInterval(() => loadOrders({ silent: true }).catch(() => {}), POLL_INTERVAL_MS); nodes.pollingLabel.textContent = "Elke 5 seconden"; }
    function stop() { state.active = false; globalScope.clearInterval(state.pollTimer); state.pollTimer = null; nodes.pollingLabel.textContent = "Gestopt"; }
    function handleLogout(path = "/login.html?next=%2Fadmin%2Ffood") { stop(); globalScope.location.assign(path); }
    async function start() {
      state.active = true; nodes.loading.hidden = false; nodes.error.hidden = true;
      try { state.context = await api.context(); configureScope(); setRoute(currentRoute()); await Promise.all([loadOrders(), state.scope.permissions.menu_read ? loadMenu() : Promise.resolve()]); const directOrder = globalScope.location.pathname.match(/\/admin\/food\/orders\/([0-9a-f-]{36})$/)?.[1]; if (directOrder) await openOrder(directOrder); showApp(); schedulePoll(); }
      catch (error) { showError(error); }
    }

    nodes.retry.addEventListener("click", start); nodes.refresh.addEventListener("click", () => Promise.all([loadOrders(), state.route === "menu" ? loadMenu() : Promise.resolve()]).catch(showError)); nodes.signout.addEventListener("click", () => options.logout?.()); nodes.detailClose.addEventListener("click", closeDetail); nodes.detailOverlay.addEventListener("click", closeDetail);
    nodes.scopeSelect.addEventListener("change", async () => { const selected = state.context.scopes.find((scope) => `${scope.account_ref}:${scope.location_ref}` === nodes.scopeSelect.value); if (!selected) return; state.scope = selected; state.menu = null; state.orders = []; configureScope(); await Promise.all([loadOrders(), loadMenu()]).catch(showError); });
    for (const filter of document.querySelectorAll("[data-order-filter]")) filter.addEventListener("click", () => { state.filter = filter.dataset.orderFilter; for (const candidate of document.querySelectorAll("[data-order-filter]")) candidate.setAttribute("aria-pressed", String(candidate === filter)); renderOrders(); });
    for (const link of document.querySelectorAll("a[data-route],a[data-route-link]")) link.addEventListener("click", (event) => { event.preventDefault(); setRoute(link.dataset.route || link.dataset.routeLink, true); });
    globalScope.addEventListener("popstate", () => { setRoute(currentRoute()); const directOrder = globalScope.location.pathname.match(/\/admin\/food\/orders\/([0-9a-f-]{36})$/)?.[1]; if (directOrder) openOrder(directOrder); else if (!nodes.detailDrawer.hidden) { nodes.detailOverlay.hidden = true; nodes.detailDrawer.hidden = true; state.selectedOrder = null; } }); globalScope.addEventListener("pagehide", stop); document.addEventListener("visibilitychange", () => { if (!state.active) return; if (document.hidden) { globalScope.clearInterval(state.pollTimer); state.pollTimer = null; nodes.pollingLabel.textContent = "Gepauzeerd"; } else { loadOrders({ silent: true }).catch(() => {}); schedulePoll(); } }); document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !nodes.detailDrawer.hidden) closeDetail(); });
    return { start, stop, handleLogout, loadOrders, loadMenu, state };
  }

  const exported = { MAX_PRICE_MINOR, POLL_INTERVAL_MS, STATUS_LABELS, createDashboardApp, createFoodManagementClient, dashboardMetrics, formatMoney, nextStatus, parseEuroMinor };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  globalScope.MaxFoodDashboard = exported;
})(typeof window !== "undefined" ? window : globalThis);
