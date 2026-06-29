import { getAllRoles, ROLES } from "../config/roles.js";
import { listProtectedRoutes } from "../config/protectedRoutes.js";
import { getAuthStatus } from "./authService.js";
import { getProfileReadinessSummary } from "./authProfileService.js";

const AUTH_READINESS_STATUS = Object.freeze({
  PREPARED: "prepared",
  BLOCKED: "blocked",
  READY_FOR_TEST: "ready_for_test",
});

const roleOwnership = Object.freeze({
  [ROLES.SUPER_ADMIN]: {
    scope: "Alle platformdata",
    profileRule: "Alleen voor eigenaar/technisch beheer",
    productionUse: "Beperkt tot noodbeheer en releasebeheer",
  },
  [ROLES.ADMIN]: {
    scope: "Klanten, websites, projecten, offertes, facturen, abonnementen en instellingen",
    profileRule: "Mag alle customer records beheren via server-side policies",
    productionUse: "Primair intern beheer",
  },
  [ROLES.SALES]: {
    scope: "Leads, klanten, offertes en opvolging",
    profileRule: "Geen developer tools, geen betaalmutaties",
    productionUse: "Sales en leadopvolging",
  },
  [ROLES.SUPPORT]: {
    scope: "Klant-, project-, website- en factuurinzage voor support",
    profileRule: "Geen migratie, settings of betaalstatus-mutaties",
    productionUse: "Support/viewer-achtige rol",
  },
  [ROLES.DEVELOPER]: {
    scope: "Developer Mode, validatie, releasechecks en technische readiness",
    profileRule: "Geen klantbetaling-write of klantcommunicatie zonder adminreview",
    productionUse: "Technisch beheer en debugging",
  },
  [ROLES.CUSTOMER]: {
    scope: "Alleen eigen klantportaaldata",
    profileRule: "customers.auth_user_id of customers.profile_id moet matchen",
    productionUse: "Klantlogin",
  },
  [ROLES.DEMO_USER]: {
    scope: "Alleen demo-omgeving",
    profileRule: "is_demo/environment demo verplicht",
    productionUse: "Salesdemo, nooit productieklantdata",
  },
});

const pageAccess = Object.freeze([
  {
    page: "login",
    path: "/login.html",
    requiredRoles: ["Publiek"],
    productionGuard: "Publiek; redirect na login op basis van profile.role.",
  },
  {
    page: "admin-dashboard",
    path: "/admin-dashboard.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.SALES, ROLES.SUPPORT],
    productionGuard: "Auth vereist; rol- en permissiecheck voor modules en gevaarlijke acties.",
  },
  {
    page: "klantportaal",
    path: "/klantportaal.html",
    requiredRoles: [ROLES.CUSTOMER, ROLES.SUPER_ADMIN, ROLES.ADMIN],
    productionGuard: "Auth vereist; customer ownership via customers.auth_user_id/profile_id en RLS.",
  },
  {
    page: "leadfinder/sales",
    path: "/admin-dashboard.html#leadfinder",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES],
    productionGuard: "Auth vereist; salesdata blijft intern en klant-onzichtbaar.",
  },
  {
    page: "developer mode",
    path: "/admin-dashboard.html#instellingen",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER],
    productionGuard: "Developer tools alleen voor technische rollen; geen klantdata-export zonder audit.",
  },
]);

const blockingItems = Object.freeze([
  "Supabase Auth testgebruikers en profiles moeten in testomgeving gevalideerd zijn.",
  "profiles.auth_user_id moet uniek koppelen aan auth.users.id.",
  "customers.auth_user_id/profile_id ownership moet bewezen zijn met Customer A/B isolatie.",
  "Hard route guards mogen pas standaard aan na geslaagde Auth/RLS test.",
  "Admin en sales routes mogen geen klantportaaldata tonen zonder server/RLS check.",
]);

function normalizeRoleList(roles = []) {
  return roles.map((role) => roleOwnership[role] ? role : String(role)).join(", ");
}

export function getAuthRolesMatrix() {
  return getAllRoles().map((role) => ({
    ...role,
    ...(roleOwnership[role.role] || {
      scope: "Niet gespecificeerd",
      profileRule: "Nog te bepalen",
      productionUse: "Nog te bepalen",
    }),
  }));
}

export function getAuthPageAccessMatrix() {
  const routeMap = new Map(listProtectedRoutes().map((route) => [route.pageName, route]));
  return pageAccess.map((entry) => {
    const route = routeMap.get(entry.page);
    return {
      ...entry,
      currentRouteGuard: route
        ? `${route.hardReady ? "hard-ready" : "soft/readiness"}; demo ${route.allowDemo ? "toegestaan" : "geblokkeerd"}`
        : "conceptueel",
      requiredRolesLabel: normalizeRoleList(entry.requiredRoles),
    };
  });
}

export function getProfileAuthMappingPlan() {
  return {
    profilesTable: "profiles",
    authUserField: "profiles.auth_user_id -> auth.users.id",
    customerFields: ["customers.profile_id -> profiles.id", "customers.auth_user_id -> auth.users.id"],
    primaryCustomerOwnership: "customers.auth_user_id en customers.profile_id",
    fallbackDuringMigration: "localStorage profile/customer links blijven alleen demo/fallback",
    notAllowed: [
      "E-mailadres als enige autorisatiebron",
      "Service role in frontend",
      "Klantdata tonen zonder customer ownership",
      "Demo-user toegang tot productiedata",
    ],
  };
}

export function getAuthProfilesReadiness() {
  const authStatus = getAuthStatus();
  const profileSummary = getProfileReadinessSummary();
  const roles = getAuthRolesMatrix();
  const pages = getAuthPageAccessMatrix();
  const hasProfiles = profileSummary.profileCount > 0;
  const supabaseConfigured = Boolean(authStatus.supabaseAuthConfigured || authStatus.supabaseAuthActive);
  const status = supabaseConfigured && hasProfiles
    ? AUTH_READINESS_STATUS.READY_FOR_TEST
    : AUTH_READINESS_STATUS.PREPARED;

  return {
    status,
    live: false,
    writesEnabled: false,
    sqlExecuted: false,
    authProvider: authStatus.mode || "demo/local",
    supabaseAuthConfigured: supabaseConfigured,
    supabaseAuthActive: Boolean(authStatus.supabaseAuthActive),
    demoLoginActive: true,
    profileSummary,
    roles,
    pages,
    mapping: getProfileAuthMappingPlan(),
    blockers: [...blockingItems],
    nextActions: [
      "Supabase testgebruikers aanmaken",
      "profiles.auth_user_id mapping valideren",
      "Customer A/B isolation opnieuw testen",
      "Hard route guards pas activeren na RLS pass",
    ],
  };
}

export const authReadinessService = {
  getAuthRolesMatrix,
  getAuthPageAccessMatrix,
  getProfileAuthMappingPlan,
  getAuthProfilesReadiness,
};
