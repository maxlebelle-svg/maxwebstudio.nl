(function initAdminToast(root) {
  "use strict";

  if (!root || typeof root.document === "undefined" || typeof root.showToast === "function") return;

  const toastTypes = new Set(["success", "info", "warning", "error"]);
  const toastIcons = { success: "✓", info: "i", warning: "!", error: "×" };
  const activeToasts = new Map();
  const duplicateWindowMs = 900;

  function toastType(type = "info") {
    if (type === "attention") return "warning";
    return toastTypes.has(type) ? type : "info";
  }

  function toastKey(message, type) {
    return `${type}::${message}`;
  }

  function ensureToastRegion() {
    let region = root.document.querySelector("[data-toast-region]");
    if (region) return region;
    region = root.document.createElement("div");
    region.className = "toast-region";
    region.dataset.toastRegion = "true";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "false");
    root.document.body.append(region);
    return region;
  }

  function scheduleToastClose(toast, duration) {
    root.clearTimeout(toast._closeTimer);
    toast.style.setProperty("--toast-duration", `${duration}ms`);
    toast.classList.remove("is-progress-reset");
    void toast.offsetWidth;
    toast.classList.add("is-progress-reset");
    toast._closeTimer = root.setTimeout(() => toast._controller.close(), duration);
  }

  function normalizedActions(options = {}) {
    if (Array.isArray(options.actions)) {
      return options.actions.filter((action) => action?.label && typeof action.onAction === "function");
    }
    if (options.actionLabel && typeof options.onAction === "function") {
      return [{ label: options.actionLabel, onAction: options.onAction }];
    }
    return [];
  }

  function applyToastContent(toast, message, type, options = {}) {
    const normalizedType = toastType(type);
    const text = String(message || "").trim();
    toast.className = `toast toast-${normalizedType}${options.loading ? " is-loading" : ""}${options.persistent ? " is-persistent" : ""}`;
    toast.dataset.toastType = normalizedType;
    toast.dataset.toastMessage = text;
    toast.setAttribute("role", normalizedType === "error" ? "alert" : "status");
    toast.setAttribute("aria-live", normalizedType === "error" ? "assertive" : "polite");
    toast.querySelector(".toast-icon").textContent = options.loading ? "" : toastIcons[normalizedType];
    toast.querySelector(".toast-message").textContent = text;
    const actions = toast.querySelector(".toast-actions");
    actions.replaceChildren();
    for (const action of normalizedActions(options)) {
      const button = root.document.createElement("button");
      button.className = "toast-action";
      button.type = "button";
      button.textContent = String(action.label);
      button.addEventListener("click", () => {
        action.onAction();
        if (action.closeOnAction !== false) toast._controller.close();
      });
      actions.append(button);
    }
    actions.hidden = !actions.children.length;
  }

  function createToastElement() {
    const toast = root.document.createElement("div");
    const icon = root.document.createElement("span");
    const message = root.document.createElement("span");
    const actions = root.document.createElement("span");
    const progress = root.document.createElement("span");
    icon.className = "toast-icon";
    icon.setAttribute("aria-hidden", "true");
    message.className = "toast-message";
    actions.className = "toast-actions";
    actions.hidden = true;
    progress.className = "toast-progress";
    progress.setAttribute("aria-hidden", "true");
    toast.append(icon, message, actions, progress);
    return toast;
  }

  root.showToast = function showToast(message, type = "info", options = {}) {
    const text = String(message || "").trim();
    if (!text) return null;
    const normalizedType = toastType(type);
    const key = toastKey(text, normalizedType);
    const now = Date.now();
    const existing = activeToasts.get(key);
    if (existing?.toast?.isConnected && now - existing.createdAt < duplicateWindowMs) {
      existing.createdAt = now;
      existing.controller.update(text, normalizedType, options);
      return existing.controller;
    }
    if (existing && !existing.toast?.isConnected) activeToasts.delete(key);

    const toast = createToastElement();
    const controller = {
      update(nextMessage = text, nextType = normalizedType, nextOptions = {}) {
        const nextText = String(nextMessage || "").trim();
        const nextNormalizedType = toastType(nextType);
        const nextKey = toastKey(nextText, nextNormalizedType);
        if (toast._toastKey && toast._toastKey !== nextKey) activeToasts.delete(toast._toastKey);
        toast._toastKey = nextKey;
        activeToasts.set(nextKey, { controller, toast, createdAt: Date.now() });
        applyToastContent(toast, nextText, nextNormalizedType, nextOptions);
        if (nextOptions.persistent) {
          root.clearTimeout(toast._closeTimer);
          return controller;
        }
        scheduleToastClose(toast, Number(nextOptions.duration || 3000));
        return controller;
      },
      close() {
        root.clearTimeout(toast._closeTimer);
        activeToasts.delete(toast._toastKey);
        toast.classList.add("is-leaving");
        root.setTimeout(() => toast.remove(), 220);
      },
    };
    toast._controller = controller;
    toast._toastKey = key;
    applyToastContent(toast, text, normalizedType, options);
    ensureToastRegion().append(toast);
    activeToasts.set(key, { controller, toast, createdAt: now });
    if (!options.persistent) scheduleToastClose(toast, Number(options.duration || 3000));
    return controller;
  };
})(typeof window !== "undefined" ? window : null);
