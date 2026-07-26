const CANONICAL_ROLES = Object.freeze([
  "super_admin",
  "admin",
  "sales_manager",
  "sales_partner",
  "designer",
  "developer",
  "support",
  "customer",
  "demo_user",
]);

const CANONICAL_PROFILE_STATUSES = Object.freeze([
  "invited",
  "pending",
  "active",
  "disabled",
  "archived",
]);

const LEGACY_ROLE_ALIASES = Object.freeze({ sales: "sales_partner" });

const PROFILE_STATUS_TRANSITIONS = Object.freeze({
  invited: Object.freeze(["invited", "pending", "active", "disabled", "archived"]),
  pending: Object.freeze(["pending", "invited", "active", "disabled", "archived"]),
  active: Object.freeze(["active", "disabled", "archived"]),
  disabled: Object.freeze(["disabled", "invited", "pending", "active", "archived"]),
  archived: Object.freeze(["archived"]),
});

function normalizeRole(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return LEGACY_ROLE_ALIASES[normalized] || normalized;
}

function normalizeProfileStatus(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isCanonicalRole(value = "") {
  return CANONICAL_ROLES.includes(normalizeRole(value));
}

function isCanonicalProfileStatus(value = "") {
  return CANONICAL_PROFILE_STATUSES.includes(normalizeProfileStatus(value));
}

function canTransitionProfileStatus(fromStatus = "", toStatus = "") {
  const from = normalizeProfileStatus(fromStatus);
  const to = normalizeProfileStatus(toStatus);
  return Boolean(PROFILE_STATUS_TRANSITIONS[from]?.includes(to));
}

function hasOperationalAccess(profile = {}) {
  return isCanonicalRole(profile.role) && normalizeProfileStatus(profile.status) === "active";
}

function hasPartnerOnboardingAccess(profile = {}) {
  return normalizeRole(profile.role) === "sales_partner"
    && ["invited", "pending", "active"].includes(normalizeProfileStatus(profile.status));
}

module.exports = {
  CANONICAL_ROLES,
  CANONICAL_PROFILE_STATUSES,
  PROFILE_STATUS_TRANSITIONS,
  normalizeRole,
  normalizeProfileStatus,
  isCanonicalRole,
  isCanonicalProfileStatus,
  canTransitionProfileStatus,
  hasOperationalAccess,
  hasPartnerOnboardingAccess,
};
