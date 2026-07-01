import { ROLES } from "../config/roles.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { getClientAuthReadiness } from "./clientAuthReadinessService.js";

const SUPABASE_AUTH_SESSION_KEY = "maxwebstudioSupabaseAuthSession";
const STAGING_CUSTOMER_ID = "demo-staging-testklant";
const STAGING_WEBSITE_ID = "demo-staging-website";
const STAGING_PROJECT_ID = "demo-staging-project";

function nowIso() {
  return new Date().toISOString();
}

function addHours(date, hours) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next.toISOString();
}

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readArray(key) {
  const value = readJson(key, []);
  return Array.isArray(value) ? value : [];
}

function upsertById(key, record) {
  const items = readArray(key);
  const exists = items.some((item) => String(item.id) === String(record.id));
  const next = exists
    ? items.map((item) => (String(item.id) === String(record.id) ? { ...item, ...record, updatedAt: nowIso() } : item))
    : [...items, record];
  writeJson(key, next);
  return record;
}

function readSupabaseSession() {
  const session = readJson(SUPABASE_AUTH_SESSION_KEY, null);
  if (!session?.access_token || !session?.user?.id) return null;
  if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
    localStorage.removeItem(SUPABASE_AUTH_SESSION_KEY);
    return null;
  }
  return session;
}

function stagingCustomerEmail(session = {}) {
  return session.user?.email || "testklant@maxwebstudio.nl";
}

function seedStagingDemoData(session) {
  const createdAt = nowIso();
  const customerEmail = stagingCustomerEmail(session);
  const baseMeta = {
    isDemo: true,
    environment: "demo",
    demoScenarioId: "staging-auth-client-portal",
    demoJourneyId: "staging-auth-client-portal",
    createdAt,
    updatedAt: createdAt,
  };

  const customer = {
    id: STAGING_CUSTOMER_ID,
    name: "Test Klant",
    company: "Max Webstudio Testklant",
    email: customerEmail,
    phone: "Demo",
    status: "actief",
    portalStatus: "staging-demo",
    ...baseMeta,
  };
  upsertById(STORAGE_KEYS.crmCustomers, customer);
  upsertById(STORAGE_KEYS.customers, customer);

  upsertById(STORAGE_KEYS.managedSites, {
    id: STAGING_WEBSITE_ID,
    customerId: STAGING_CUSTOMER_ID,
    profileId: STAGING_CUSTOMER_ID,
    name: "Staging demo website",
    domain: "staging-demo.maxwebstudio.nl",
    status: "online",
    maintenanceStatus: "actief",
    publishStatus: "demo",
    seoNotes: "Demo SEO-check voorbereid.",
    ...baseMeta,
  });

  upsertById(STORAGE_KEYS.projects, {
    id: STAGING_PROJECT_ID,
    customerId: STAGING_CUSTOMER_ID,
    websiteId: STAGING_WEBSITE_ID,
    name: "Staging klantportaal validatie",
    type: "Website",
    status: "in_ontwikkeling",
    phase: "Staging Auth",
    progress: 65,
    clientVisibleNotes: "Je bekijkt een veilige staging/demo-omgeving.",
    ...baseMeta,
  });

  upsertById(STORAGE_KEYS.quotes, {
    id: "demo-staging-quote",
    quoteNumber: "OFF-STAGING-001",
    customerId: STAGING_CUSTOMER_ID,
    profileId: STAGING_CUSTOMER_ID,
    websiteId: STAGING_WEBSITE_ID,
    projectId: STAGING_PROJECT_ID,
    title: "Demo offerte klantportaal",
    status: "verzonden",
    total: 1495,
    amount: 1495,
    quoteDate: createdAt,
    validUntil: addHours(createdAt, 24 * 14),
    lines: [{ description: "Demo website pakket", quantity: 1, price: 1495, total: 1495 }],
    ...baseMeta,
  });

  upsertById(STORAGE_KEYS.invoices, {
    id: "demo-staging-invoice",
    invoiceNumber: "INV-STAGING-001",
    customerId: STAGING_CUSTOMER_ID,
    profileId: STAGING_CUSTOMER_ID,
    websiteId: STAGING_WEBSITE_ID,
    projectId: STAGING_PROJECT_ID,
    title: "Demo factuur klantportaal",
    status: "verzonden",
    total: 299,
    amount: 299,
    invoiceDate: createdAt,
    dueDate: addHours(createdAt, 24 * 14),
    lines: [{ description: "Demo aanbetaling", quantity: 1, price: 299, total: 299 }],
    ...baseMeta,
  });

  upsertById(STORAGE_KEYS.subscriptions, {
    id: "demo-staging-subscription",
    customerId: STAGING_CUSTOMER_ID,
    profileId: STAGING_CUSTOMER_ID,
    websiteId: STAGING_WEBSITE_ID,
    name: "Onderhoud demo",
    plan: "Basis onderhoud",
    status: "actief",
    amount: 19.95,
    interval: "monthly",
    ...baseMeta,
  });

  upsertById(STORAGE_KEYS.changeRequests, {
    id: "demo-staging-change-request",
    customerId: STAGING_CUSTOMER_ID,
    websiteId: STAGING_WEBSITE_ID,
    projectId: STAGING_PROJECT_ID,
    title: "Demo wijzigingsverzoek",
    description: "Voorbeeld van een klantverzoek in staging.",
    status: "nieuw",
    category: "content",
    ...baseMeta,
  });

  upsertById(STORAGE_KEYS.clientPortalMessages, {
    id: "demo-staging-message",
    customerId: STAGING_CUSTOMER_ID,
    subject: "Welkom in het staging klantportaal",
    body: "Dit bericht bevestigt dat de staging/demo-koppeling werkt.",
    direction: "outbound",
    status: "unread",
    ...baseMeta,
  });

  upsertById(STORAGE_KEYS.clientPortalNotifications, {
    id: "demo-staging-notification",
    customerId: STAGING_CUSTOMER_ID,
    title: "Staging klantportaal actief",
    message: "Je bent ingelogd met Supabase Auth en gekoppeld aan demo klantdata.",
    type: "info",
    status: "unread",
    ...baseMeta,
  });

  upsertById(STORAGE_KEYS.files, {
    id: "demo-staging-file",
    customerId: STAGING_CUSTOMER_ID,
    websiteId: STAGING_WEBSITE_ID,
    projectId: STAGING_PROJECT_ID,
    name: "Demo projectbrief.pdf",
    type: "document",
    url: "#",
    status: "demo",
    ...baseMeta,
  });

  return customer;
}

function seedStagingAuthSession(session, customer) {
  const startedAt = nowIso();
  const userId = `staging-auth-${session.user.id}`;
  const authUser = {
    id: userId,
    authUserId: session.user.id,
    email: stagingCustomerEmail(session),
    name: customer.name,
    role: ROLES.CUSTOMER,
    roleLabel: "Klant",
    status: "active",
    isDemo: true,
    customerId: customer.id,
    provider: "supabase-staging",
    environment: "demo",
    createdAt: startedAt,
    updatedAt: startedAt,
  };
  upsertById(STORAGE_KEYS.authUsers, authUser);
  upsertById(STORAGE_KEYS.profiles, {
    id: `profile-${userId}`,
    authUserId: userId,
    email: authUser.email,
    name: authUser.name,
    role: ROLES.CUSTOMER,
    status: "active",
    customerId: customer.id,
    environment: "demo",
    isDemoUser: true,
    metadata: {
      source: "staging_supabase_auth_bridge",
      supabaseAuthUserId: session.user.id,
    },
    createdAt: startedAt,
    updatedAt: startedAt,
  });
  writeJson(STORAGE_KEYS.currentSession, {
    id: `session-${userId}`,
    userId,
    role: ROLES.CUSTOMER,
    roleLabel: "Klant",
    environment: "demo",
    isDemo: true,
    provider: "supabase-staging",
    customerId: customer.id,
    startedAt,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : addHours(startedAt, 8),
  });
}

export async function ensureStagingClientPortalDemoSession() {
  const session = readSupabaseSession();
  if (!session) return { active: false, reason: "no_supabase_session", customerId: "" };

  const readiness = await getClientAuthReadiness();
  if (!readiness.authLive || !readiness.testEnvironment) {
    return { active: false, reason: "auth_not_staging_live", customerId: "" };
  }

  const customer = seedStagingDemoData(session);
  seedStagingAuthSession(session, customer);

  return {
    active: true,
    reason: "staging_supabase_user_linked_to_demo_customer",
    customerId: customer.id,
    mode: "demo",
  };
}
