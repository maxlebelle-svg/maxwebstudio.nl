export const escapeHtml = (value = "") => {
  const sharedEscapeHtml = globalThis.MaxSharedUI?.escapeHtml || globalThis.escapeHtml;
  if (typeof sharedEscapeHtml === "function" && sharedEscapeHtml !== escapeHtml) {
    return sharedEscapeHtml(value);
  }
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const classNames = (...values) => values.flat().filter(Boolean).join(" ");

export function Button({ label = "", variant = "secondary", size = "", icon = "", type = "button", className = "", attrs = "" } = {}) {
  return `<button class="${classNames("mws-button", `mws-button-${variant}`, size && `mws-button-${size}`, className)}" type="${escapeHtml(type)}" ${attrs}>${icon ? `<span aria-hidden="true">${escapeHtml(icon)}</span>` : ""}<span>${escapeHtml(label)}</span></button>`;
}

export function IconButton({ label = "", icon = "", className = "", attrs = "" } = {}) {
  return `<button class="${classNames("mws-icon-button", className)}" type="button" aria-label="${escapeHtml(label)}" ${attrs}>${escapeHtml(icon || label.slice(0, 1))}</button>`;
}

export function StatusBadge({ label = "", tone = "info", className = "" } = {}) {
  return `<span class="${classNames("mws-status-badge", `mws-badge-${tone}`, className)}">${escapeHtml(label)}</span>`;
}

export function Tag({ label = "", tone = "info", className = "" } = {}) {
  return `<span class="${classNames("mws-tag", `mws-badge-${tone}`, className)}">${escapeHtml(label)}</span>`;
}

export function PremiumCard({ title = "", kicker = "", body = "", actions = "", className = "" } = {}) {
  return `<article class="${classNames("mws-premium-card", className)}">${title || kicker || actions ? `<header class="mws-section-header"><div>${kicker ? `<p class="section-kicker">${escapeHtml(kicker)}</p>` : ""}${title ? `<h2>${escapeHtml(title)}</h2>` : ""}</div>${actions || ""}</header>` : ""}${body}</article>`;
}

export function StatCard({ label = "", value = "", note = "", tone = "info", className = "" } = {}) {
  return `<article class="${classNames("mws-stat-card", `mws-stat-${tone}`, className)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</article>`;
}

export function KpiCard(options = {}) {
  return StatCard({ ...options, className: classNames("mws-kpi-card", options.className) });
}

export function SectionHeader({ kicker = "", title = "", intro = "", actions = "" } = {}) {
  return `<header class="mws-section-header"><div>${kicker ? `<p class="section-kicker">${escapeHtml(kicker)}</p>` : ""}<h2>${escapeHtml(title)}</h2>${intro ? `<p class="mws-subtitle">${escapeHtml(intro)}</p>` : ""}</div>${actions}</header>`;
}

export function HeroBanner({ kicker = "", title = "", description = "", aside = "" } = {}) {
  return `<section class="mws-hero-banner"><div>${kicker ? `<p class="section-kicker">${escapeHtml(kicker)}</p>` : ""}<h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div>${aside}</section>`;
}

export function Toolbar({ left = "", right = "" } = {}) {
  return `<div class="mws-toolbar"><div>${left}</div><div>${right}</div></div>`;
}

export function FormField({ id = "", label = "", helper = "", error = "", control = "" } = {}) {
  return `<label class="mws-form-field ${error ? "is-invalid" : ""}" for="${escapeHtml(id)}">${escapeHtml(label)}${control}${helper || error ? `<span class="${error ? "mws-error-text" : "mws-helper-text"}">${escapeHtml(error || helper)}</span>` : ""}</label>`;
}

export function TextInput({ id = "", name = "", value = "", placeholder = "", type = "text", className = "" } = {}) {
  return `<input class="${classNames("mws-text-input", className)}" id="${escapeHtml(id)}" name="${escapeHtml(name || id)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />`;
}

export function Select({ id = "", name = "", value = "", options = [], className = "" } = {}) {
  const optionHtml = options.map((option) => {
    const optionValue = typeof option === "string" ? option : option.value;
    const optionLabel = typeof option === "string" ? option : option.label;
    return `<option value="${escapeHtml(optionValue)}" ${String(optionValue) === String(value) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
  }).join("");
  return `<select class="${classNames("mws-select", className)}" id="${escapeHtml(id)}" name="${escapeHtml(name || id)}">${optionHtml}</select>`;
}

export function EmptyState({ icon = "", title = "", description = "", action = "" } = {}) {
  return `<div class="mws-empty-state">${icon ? `<span class="mws-empty-state-icon" aria-hidden="true">${escapeHtml(icon)}</span>` : ""}<h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ""}${action}</div>`;
}

export function LoadingState({ label = "Laden..." } = {}) {
  return `<div class="mws-loading-state"><span class="mws-skeleton mws-skeleton-card"></span><strong>${escapeHtml(label)}</strong></div>`;
}

export function Skeleton({ variant = "card", className = "" } = {}) {
  return `<span class="${classNames("mws-skeleton", `mws-skeleton-${variant}`, className)}"></span>`;
}

export function Alert({ title = "", message = "", tone = "info" } = {}) {
  return `<div class="${classNames("mws-alert", tone === "success" && "mws-success-message", tone === "warning" && "mws-warning-message", tone === "error" && "mws-error-message")}">${title ? `<strong>${escapeHtml(title)}</strong>` : ""}${message ? `<span>${escapeHtml(message)}</span>` : ""}</div>`;
}

export function Tabs({ tabs = [], active = "" } = {}) {
  return `<div class="mws-tabs">${tabs.map((tab) => `<button class="mws-tab ${tab.id === active ? "is-active" : ""}" type="button" data-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join("")}</div>`;
}

export function Avatar({ label = "" } = {}) {
  return `<span class="mws-avatar">${escapeHtml(label.slice(0, 1).toUpperCase())}</span>`;
}

export const PremiumUI = {
  Alert,
  Avatar,
  Button,
  EmptyState,
  FormField,
  HeroBanner,
  IconButton,
  KpiCard,
  LoadingState,
  PremiumCard,
  SectionHeader,
  Select,
  Skeleton,
  StatCard,
  StatusBadge,
  Tabs,
  Tag,
  TextInput,
  escapeHtml,
};

if (typeof window !== "undefined") {
  window.escapeHtml = window.MaxSharedUI?.escapeHtml || escapeHtml;
  window.MaxPremiumUI = PremiumUI;
}
