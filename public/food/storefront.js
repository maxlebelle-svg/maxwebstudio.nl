(function foodStorefrontModule(globalScope) {
  "use strict";

  const MAX_QUANTITY = 20;
  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const REFERENCE_PATTERN = /^[a-f0-9]{32}$/;

  class FoodClientError extends Error {
    constructor(code, status, message, uncertain = false) {
      super(message);
      this.name = "FoodClientError";
      this.code = code;
      this.status = status;
      this.uncertain = uncertain;
    }
  }

  function storefrontSlug(locationValue) {
    const pathname = String(locationValue?.pathname || "");
    const pathMatch = pathname.match(/^\/food\/([^/?#]+)\/?$/);
    const queryValue = new URLSearchParams(String(locationValue?.search || "")).get("storefront");
    const candidate = decodeURIComponent(pathMatch?.[1] || queryValue || "").trim().toLowerCase();
    return SLUG_PATTERN.test(candidate) && candidate.length <= 100 ? candidate : "";
  }

  function formatMoney(minor, currency = "EUR") {
    const amount = Number(minor);
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(Number.isFinite(amount) ? amount / 100 : 0);
  }

  function safeImageUrl(value) {
    const url = String(value || "").trim();
    if (/^\/assets\/[A-Za-z0-9_./-]+$/.test(url)) return url;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function cartSnapshot(raw, menuItems) {
    const available = new Map(menuItems.filter((item) => item.available !== false).map((item) => [item.item_ref, item]));
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const cart = {};
    for (const [itemRef, quantity] of Object.entries(source)) {
      if (available.has(itemRef) && Number.isInteger(quantity) && quantity > 0 && quantity <= MAX_QUANTITY) cart[itemRef] = quantity;
    }
    return cart;
  }

  function setCartQuantity(cart, itemRef, quantity, availableRefs) {
    const next = { ...cart };
    if (!availableRefs.has(itemRef)) return next;
    const normalized = Number(quantity);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > MAX_QUANTITY) return next;
    if (normalized === 0) delete next[itemRef]; else next[itemRef] = normalized;
    return next;
  }

  function cartTotals(cart, menuItems) {
    const byRef = new Map(menuItems.map((item) => [item.item_ref, item]));
    return Object.entries(cart).reduce((result, [itemRef, quantity]) => {
      const item = byRef.get(itemRef);
      if (!item || item.available === false) return result;
      result.quantity += quantity;
      result.subtotal_minor += Number(item.price_minor) * quantity;
      result.lines.push({ item, quantity });
      return result;
    }, { quantity: 0, subtotal_minor: 0, lines: [] });
  }

  function buildOrderPayload(cart, menuItems, customer) {
    const totals = cartTotals(cart, menuItems);
    return {
      fulfilment_type: "pickup",
      customer: {
        name: String(customer.name || "").trim(),
        phone: String(customer.phone || "").trim(),
        ...(String(customer.email || "").trim() ? { email: String(customer.email).trim() } : {}),
      },
      pickup: String(customer.pickup_at || "").trim() ? { pickup_at: new Date(customer.pickup_at).toISOString() } : {},
      items: totals.lines.map((line) => ({ item_ref: line.item.item_ref, quantity: line.quantity })),
      ...(String(customer.note || "").trim() ? { note: String(customer.note).trim() } : {}),
    };
  }

  function payloadFingerprint(payload) {
    return JSON.stringify(payload);
  }

  function createIdempotencyKey(cryptoApi = globalScope.crypto) {
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    const bytes = new Uint8Array(24);
    if (!cryptoApi?.getRandomValues) throw new FoodClientError("SECURE_RANDOM_UNAVAILABLE", 0, "Veilig bestellen wordt niet ondersteund in deze browser.");
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function createApiClient(fetchImpl, basePath = "/api/food/v1") {
    async function request(path, options = {}) {
      let response;
      try {
        response = await fetchImpl(`${basePath}${path}`, {
          ...options,
          headers: { Accept: "application/json", ...(options.headers || {}) },
        });
      } catch {
        throw new FoodClientError("NETWORK_UNCERTAIN", 0, "De verbinding werd onderbroken.", options.method === "POST");
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.success !== true) {
        throw new FoodClientError(
          String(body?.code || "REQUEST_FAILED"),
          response.status,
          String(body?.error || "Deze aanvraag kon niet worden verwerkt."),
          options.method === "POST" && response.status >= 500,
        );
      }
      return body.data;
    }
    return {
      storefront: (slug) => request(`/storefronts/${encodeURIComponent(slug)}`),
      menu: (slug) => request(`/storefronts/${encodeURIComponent(slug)}/menu`),
      createOrder: (slug, payload, key) => request(`/storefronts/${encodeURIComponent(slug)}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(payload),
      }),
      confirmation: (slug, reference) => request(`/storefronts/${encodeURIComponent(slug)}/orders/${encodeURIComponent(reference)}/confirmation`),
    };
  }

  const exportsForTests = {
    FoodClientError,
    MAX_QUANTITY,
    buildOrderPayload,
    cartSnapshot,
    cartTotals,
    createApiClient,
    createIdempotencyKey,
    formatMoney,
    payloadFingerprint,
    safeImageUrl,
    setCartQuantity,
    storefrontSlug,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = exportsForTests;
  if (typeof document === "undefined") return;

  const slug = storefrontSlug(globalScope.location);
  const api = createApiClient(globalScope.fetch.bind(globalScope));
  const nodes = Object.fromEntries([
    "brandMark", "storefrontName", "openingChip", "openingLabel", "hero", "heroTitle", "heroIntro", "phoneLink",
    "locationName", "locationAddress", "menuLoading", "loadError", "loadErrorMessage", "retryLoad", "categoryNav",
    "menuGroups", "menuDisclaimer", "infoName", "infoIntro", "infoAddress", "infoOpening", "infoPhone", "footerName",
    "cartCount", "stickyCount", "stickyTotal", "stickyCart", "cartDialog", "cartEmpty", "cartLines", "cartTotals",
    "cartTotal", "cartStep", "checkoutOpen", "orderingMessage", "checkoutStep", "checkoutBack", "checkoutForm",
    "checkoutTotal", "checkoutMessage", "orderSubmit", "confirmationStep", "confirmationReference", "confirmationStatus",
    "confirmationStorefront", "confirmationLines", "confirmationTotal", "confirmationFollowup", "toast",
  ].map((name) => [name, document.querySelector(`[data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`)]));

  const state = {
    profile: null,
    menu: null,
    menuItems: [],
    cart: {},
    pendingAttempt: null,
    submitting: false,
    toastTimer: null,
  };

  function storageKey() { return `mws-food-cart-v1:${slug}`; }
  function readCart() {
    try { return JSON.parse(globalScope.sessionStorage.getItem(storageKey()) || "{}"); } catch { return {}; }
  }
  function saveCart() {
    try { globalScope.sessionStorage.setItem(storageKey(), JSON.stringify(state.cart)); } catch { /* Device-local recovery is optional. */ }
  }
  function clearCart() {
    state.cart = {};
    state.pendingAttempt = null;
    try { globalScope.sessionStorage.removeItem(storageKey()); } catch { /* No-op. */ }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showToast(message) {
    nodes.toast.textContent = message;
    nodes.toast.hidden = false;
    globalScope.clearTimeout(state.toastTimer);
    state.toastTimer = globalScope.setTimeout(() => { nodes.toast.hidden = true; }, 2200);
  }

  function addressText(address) {
    const line = [address?.street, address?.house_number].filter(Boolean).join(" ");
    const city = [address?.postal_code, address?.city].filter(Boolean).join(" ");
    return [line, city].filter(Boolean).join(", ") || "Adres wordt nog bevestigd";
  }

  function applyProfile(profile) {
    state.profile = profile;
    document.title = `${profile.name} | Afhalen`;
    for (const node of document.querySelectorAll("[data-storefront-name]")) node.textContent = profile.name;
    nodes.brandMark.textContent = String(profile.name || "R").charAt(0).toUpperCase();
    nodes.heroTitle.textContent = profile.name;
    nodes.heroIntro.textContent = profile.intro || "Bekijk het actuele menu en plaats een afhaalbestelling.";
    nodes.locationName.textContent = profile.address?.city || profile.name;
    nodes.locationAddress.textContent = addressText(profile.address);
    nodes.infoName.textContent = profile.name;
    nodes.infoIntro.textContent = profile.intro || "Restaurantinformatie wordt vóór livegang bevestigd.";
    nodes.infoAddress.textContent = addressText(profile.address);
    nodes.infoOpening.textContent = profile.opening?.label || "Openingstijden worden nog bevestigd";
    nodes.footerName.textContent = profile.name;

    const status = ["open", "closed", "unknown"].includes(profile.opening?.status) ? profile.opening.status : "unknown";
    nodes.openingChip.dataset.status = status;
    nodes.openingChip.textContent = profile.opening?.label || "Opening onbekend";
    nodes.openingLabel.parentElement.dataset.status = status;
    nodes.openingLabel.textContent = profile.opening?.label || "Opening onbekend";

    if (profile.phone) {
      const href = `tel:${String(profile.phone).replace(/[^+\d]/g, "")}`;
      nodes.phoneLink.href = href;
      nodes.phoneLink.hidden = false;
      nodes.infoPhone.href = href;
      nodes.infoPhone.textContent = profile.phone;
    } else {
      nodes.infoPhone.removeAttribute("href");
      nodes.infoPhone.textContent = "Telefoon wordt nog bevestigd";
    }

    const heroImage = safeImageUrl(profile.branding?.hero_image_url);
    if (heroImage) nodes.hero.style.setProperty("--food-hero-image", `url("${heroImage.replace(/["\\]/g, "")}")`);
    syncOrderingState();
  }

  function syncOrderingState() {
    if (!state.profile) return;
    const enabled = state.profile.ordering?.enabled === true;
    nodes.checkoutOpen.disabled = !enabled;
    nodes.orderSubmit.disabled = !enabled || state.submitting;
    nodes.orderingMessage.hidden = enabled;
    if (!enabled) {
      const reason = state.profile.ordering?.reason;
      nodes.orderingMessage.textContent = reason === "storefront_closed"
        ? "Het restaurant is nu gesloten. Je kunt het menu bekijken, maar nog niet bestellen."
        : "Online bestellen staat voor deze pilot nog uit. Je kunt het volledige menu en mandje wel demonstreren.";
    }
  }

  function renderMenu(menu) {
    state.menu = menu;
    state.menuItems = menu.categories.flatMap((category) => category.items.map((item) => ({ ...item, category_ref: category.category_ref })));
    state.cart = cartSnapshot(readCart(), state.menuItems);
    saveCart();
    nodes.categoryNav.replaceChildren();
    nodes.menuGroups.replaceChildren();

    for (const [index, category] of menu.categories.entries()) {
      const sectionId = `menu-category-${index + 1}`;
      const navButton = element("button", "category-link", category.name);
      navButton.type = "button";
      navButton.addEventListener("click", () => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      nodes.categoryNav.append(navButton);

      const group = element("section", "menu-group");
      group.id = sectionId;
      group.setAttribute("aria-labelledby", `${sectionId}-title`);
      const heading = element("div", "menu-group-heading");
      const title = element("h3", "", category.name);
      title.id = `${sectionId}-title`;
      heading.append(title, element("span", "", `${category.items.length} ${category.items.length === 1 ? "gerecht" : "gerechten"}`));
      const grid = element("div", "menu-grid");
      for (const item of category.items) grid.append(renderMenuItem(item, menu.currency));
      group.append(heading, grid);
      nodes.menuGroups.append(group);
    }
    nodes.menuLoading.hidden = true;
    nodes.categoryNav.hidden = menu.categories.length === 0;
    nodes.menuDisclaimer.hidden = false;
    renderCart();
  }

  function renderMenuItem(item, currency) {
    const card = element("article", "menu-card");
    const media = element("div", "menu-card-media", String(item.name || "G").charAt(0).toUpperCase());
    const imageUrl = safeImageUrl(item.image_url);
    if (imageUrl) {
      const image = element("img");
      image.src = imageUrl;
      image.alt = item.name;
      image.loading = "lazy";
      media.replaceChildren(image);
    }
    const body = element("div", "menu-card-body");
    const copy = element("div");
    copy.append(element("h4", "", item.name), element("p", "", item.description || "Beschrijving wordt nog bevestigd."));
    const bottom = element("div", "menu-card-bottom");
    const price = element("strong", "menu-price", formatMoney(item.price_minor, currency));
    const add = element("button", "add-item", "Voeg toe");
    add.type = "button";
    add.disabled = item.available === false;
    add.setAttribute("aria-label", `${item.name} toevoegen aan winkelmandje`);
    add.addEventListener("click", () => changeQuantity(item.item_ref, (state.cart[item.item_ref] || 0) + 1));
    bottom.append(price, add);
    body.append(copy, bottom);
    card.append(media, body);
    return card;
  }

  function changeQuantity(itemRef, quantity) {
    state.cart = setCartQuantity(state.cart, itemRef, quantity, new Set(state.menuItems.filter((item) => item.available !== false).map((item) => item.item_ref)));
    state.pendingAttempt = null;
    saveCart();
    renderCart();
    const item = state.menuItems.find((candidate) => candidate.item_ref === itemRef);
    if (quantity > 0 && item) showToast(`${item.name} toegevoegd`);
  }

  function renderCart() {
    const totals = cartTotals(state.cart, state.menuItems);
    const currency = state.menu?.currency || state.profile?.currency || "EUR";
    nodes.cartLines.replaceChildren();
    for (const line of totals.lines) {
      const row = element("article", "cart-line");
      const copy = element("div");
      copy.append(element("h3", "", line.item.name), element("p", "", `${line.quantity} × ${formatMoney(line.item.price_minor, currency)}`));
      const controls = element("div", "quantity-control");
      const decrease = element("button", "quantity-button", "−");
      decrease.type = "button";
      decrease.setAttribute("aria-label", `${line.item.name} verminderen`);
      decrease.addEventListener("click", () => changeQuantity(line.item.item_ref, line.quantity - 1));
      const quantity = element("span", "quantity-value", String(line.quantity));
      quantity.setAttribute("aria-label", `${line.quantity} stuks`);
      const increase = element("button", "quantity-button", "+");
      increase.type = "button";
      increase.disabled = line.quantity >= MAX_QUANTITY;
      increase.setAttribute("aria-label", `${line.item.name} verhogen`);
      increase.addEventListener("click", () => changeQuantity(line.item.item_ref, line.quantity + 1));
      controls.append(decrease, quantity, increase);
      row.append(copy, controls);
      nodes.cartLines.append(row);
    }
    nodes.cartEmpty.hidden = totals.quantity > 0;
    nodes.cartTotals.hidden = totals.quantity === 0;
    nodes.cartCount.textContent = String(totals.quantity);
    nodes.stickyCount.textContent = `${totals.quantity} ${totals.quantity === 1 ? "item" : "items"}`;
    nodes.stickyTotal.textContent = formatMoney(totals.subtotal_minor, currency);
    nodes.cartTotal.textContent = formatMoney(totals.subtotal_minor, currency);
    nodes.checkoutTotal.textContent = formatMoney(totals.subtotal_minor, currency);
    nodes.stickyCart.hidden = totals.quantity === 0 || nodes.cartDialog.open;
    syncOrderingState();
  }

  function showCart() {
    nodes.cartStep.hidden = false;
    nodes.checkoutStep.hidden = true;
    nodes.confirmationStep.hidden = true;
    if (!nodes.cartDialog.open) nodes.cartDialog.showModal();
    nodes.stickyCart.hidden = true;
  }
  function closeCart() {
    nodes.cartDialog.close();
    renderCart();
  }
  function showCheckout() {
    if (!state.profile?.ordering?.enabled) return;
    nodes.cartStep.hidden = true;
    nodes.checkoutStep.hidden = false;
    nodes.confirmationStep.hidden = true;
    nodes.checkoutForm.elements.name.focus();
  }

  function formCustomer() {
    const data = new FormData(nodes.checkoutForm);
    return Object.fromEntries(data.entries());
  }

  function validCheckout(customer) {
    let valid = true;
    for (const input of nodes.checkoutForm.elements) {
      if (!(input instanceof HTMLElement) || !("value" in input)) continue;
      const trimmed = String(input.value || "").trim();
      const invalid = (input.required && !trimmed) || !input.checkValidity();
      input.setAttribute("aria-invalid", String(invalid));
      if (invalid) valid = false;
    }
    if (String(customer.phone || "").trim().length < 6) valid = false;
    return valid;
  }

  async function submitOrder() {
    if (state.submitting || !state.profile?.ordering?.enabled) return;
    const customer = formCustomer();
    if (!validCheckout(customer)) {
      nodes.checkoutMessage.textContent = "Controleer je naam, telefoonnummer en eventuele e-mail.";
      return;
    }
    const payload = buildOrderPayload(state.cart, state.menuItems, customer);
    if (!payload.items.length) {
      nodes.checkoutMessage.textContent = "Je winkelmandje is leeg.";
      return;
    }
    const fingerprint = payloadFingerprint(payload);
    if (!state.pendingAttempt || state.pendingAttempt.fingerprint !== fingerprint) {
      state.pendingAttempt = { fingerprint, key: createIdempotencyKey(), payload };
    }
    state.submitting = true;
    syncOrderingState();
    nodes.orderSubmit.textContent = "Bestelling veilig controleren…";
    nodes.checkoutMessage.textContent = "";
    try {
      let created;
      try {
        created = await api.createOrder(slug, state.pendingAttempt.payload, state.pendingAttempt.key);
      } catch (error) {
        if (!error.uncertain) throw error;
        created = await api.createOrder(slug, state.pendingAttempt.payload, state.pendingAttempt.key);
      }
      const confirmed = await api.confirmation(slug, created.public_reference);
      showConfirmation(confirmed);
    } catch (error) {
      nodes.checkoutMessage.textContent = error.uncertain
        ? "De bestelstatus is nog onzeker. Probeer opnieuw te controleren; dezelfde veilige sleutel voorkomt een dubbele bestelling."
        : friendlyError(error);
      nodes.orderSubmit.textContent = error.uncertain ? "Bestelstatus opnieuw controleren" : "Bestelling bevestigen";
    } finally {
      state.submitting = false;
      syncOrderingState();
      if (nodes.orderSubmit.textContent === "Bestelling veilig controleren…") nodes.orderSubmit.textContent = "Bestelling bevestigen";
    }
  }

  function friendlyError(error) {
    const codes = {
      RATE_LIMITED: "Er zijn tijdelijk te veel bestelpogingen. Probeer het straks opnieuw.",
      STOREFRONT_CLOSED: "Het restaurant is momenteel gesloten voor bestellingen.",
      ORDERING_UNAVAILABLE: "Online bestellen staat voor deze pilot nog uit.",
      IDEMPOTENCY_CONFLICT: "De bestelling is gewijzigd. Sluit het mandje en probeer opnieuw.",
      ORDER_REJECTED: "Een gerecht is niet meer beschikbaar. Vernieuw het menu en probeer opnieuw.",
    };
    return codes[error?.code] || "De bestelling kon niet worden bevestigd. Controleer je gegevens en probeer opnieuw.";
  }

  function showConfirmation(confirmation) {
    nodes.cartStep.hidden = true;
    nodes.checkoutStep.hidden = true;
    nodes.confirmationStep.hidden = false;
    nodes.confirmationReference.textContent = confirmation.public_reference;
    nodes.confirmationStatus.textContent = confirmation.status === "pending" ? "Ontvangen" : String(confirmation.status || "Ontvangen");
    nodes.confirmationStorefront.textContent = confirmation.storefront?.name || state.profile?.name || "Restaurant";
    nodes.confirmationFollowup.textContent = "Bewaar de referentie en meld je bij het restaurant voor afhalen.";
    nodes.confirmationLines.replaceChildren();
    for (const item of Array.isArray(confirmation.items) ? confirmation.items : []) {
      const line = element("div", "confirmation-line");
      line.append(element("span", "", `${item.quantity} × ${item.name}`), element("strong", "", formatMoney(item.line_total_minor, confirmation.currency)));
      nodes.confirmationLines.append(line);
    }
    nodes.confirmationTotal.textContent = formatMoney(confirmation.total_minor, confirmation.currency);
    clearCart();
    renderCart();
    const url = new URL(globalScope.location.href);
    url.searchParams.delete("storefront");
    url.searchParams.set("order", confirmation.public_reference);
    globalScope.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
    nodes.confirmationStep.querySelector("button")?.focus();
  }

  async function restoreConfirmation() {
    const reference = new URLSearchParams(globalScope.location.search).get("order");
    if (!REFERENCE_PATTERN.test(String(reference || ""))) return;
    try {
      const confirmed = await api.confirmation(slug, reference);
      showCart();
      showConfirmation(confirmed);
    } catch {
      const url = new URL(globalScope.location.href);
      url.searchParams.delete("order");
      globalScope.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  }

  async function loadStorefront() {
    nodes.menuLoading.hidden = false;
    nodes.loadError.hidden = true;
    if (!slug) {
      showLoadError("De restaurantlink is ongeldig of onvolledig.");
      return;
    }
    try {
      const [profile, menu] = await Promise.all([api.storefront(slug), api.menu(slug)]);
      applyProfile(profile);
      renderMenu(menu);
      document.body.classList.remove("is-loading");
      await restoreConfirmation();
    } catch (error) {
      showLoadError(error?.code === "NOT_FOUND" ? "Deze storefront bestaat niet of is niet gepubliceerd." : "Het actuele menu kon niet veilig worden geladen. Probeer het later opnieuw.");
    }
  }

  function showLoadError(message) {
    nodes.menuLoading.hidden = true;
    nodes.categoryNav.hidden = true;
    nodes.loadErrorMessage.textContent = message;
    nodes.loadError.hidden = false;
    nodes.heroTitle.textContent = "Deze storefront is niet beschikbaar.";
    nodes.heroIntro.textContent = "Controleer de link of probeer het later opnieuw.";
  }

  for (const button of document.querySelectorAll("[data-cart-open]")) button.addEventListener("click", showCart);
  for (const button of document.querySelectorAll("[data-cart-close]")) button.addEventListener("click", closeCart);
  nodes.cartDialog.addEventListener("click", (event) => { if (event.target === nodes.cartDialog) closeCart(); });
  nodes.checkoutOpen.addEventListener("click", showCheckout);
  nodes.checkoutBack.addEventListener("click", showCart);
  nodes.checkoutForm.addEventListener("input", () => { state.pendingAttempt = null; nodes.checkoutMessage.textContent = ""; });
  nodes.checkoutForm.addEventListener("submit", (event) => { event.preventDefault(); submitOrder(); });
  nodes.retryLoad.addEventListener("click", loadStorefront);
  document.querySelector("[data-confirmation-close]").addEventListener("click", closeCart);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && nodes.cartDialog.open) closeCart(); });

  loadStorefront();
})(typeof window !== "undefined" ? window : globalThis);
