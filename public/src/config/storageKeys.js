export const STORAGE_KEYS = Object.freeze({
  leads: "maxwebstudioLeads",
  leadRequests: "maxwebstudioLeadRequests",
  customers: "maxwebstudioCustomers",
  crmCustomers: "maxwebstudioCrmCustomers",
  websites: "maxwebstudioWebsites",
  managedSites: "maxwebstudioManagedSites",
  projects: "maxwebstudioProjects",
  files: "maxwebstudioFiles",
  quotes: "maxwebstudioQuotes",
  invoices: "maxwebstudioInvoices",
  subscriptions: "maxwebstudioSubscriptions",
  settings: "maxwebstudioSettings",
  demoEmails: "maxwebstudioDemoEmails",
  importLog: "maxwebstudioImportLog",
  activityLog: "maxwebstudioActivityLog",
});

export const MODULE_STORAGE_KEYS = Object.freeze({
  leads: [STORAGE_KEYS.leads, STORAGE_KEYS.leadRequests],
  customers: [STORAGE_KEYS.crmCustomers, STORAGE_KEYS.customers],
  websites: [STORAGE_KEYS.managedSites, STORAGE_KEYS.websites],
  projects: [STORAGE_KEYS.projects],
  files: [STORAGE_KEYS.files],
  quotes: [STORAGE_KEYS.quotes],
  invoices: [STORAGE_KEYS.invoices],
  subscriptions: [STORAGE_KEYS.subscriptions],
  settings: [STORAGE_KEYS.settings],
  demo: [STORAGE_KEYS.demoEmails, STORAGE_KEYS.importLog, STORAGE_KEYS.activityLog],
});

export const PRIMARY_MODULE_KEYS = Object.freeze({
  leads: STORAGE_KEYS.leads,
  customers: STORAGE_KEYS.crmCustomers,
  websites: STORAGE_KEYS.managedSites,
  projects: STORAGE_KEYS.projects,
  files: STORAGE_KEYS.files,
  quotes: STORAGE_KEYS.quotes,
  invoices: STORAGE_KEYS.invoices,
  subscriptions: STORAGE_KEYS.subscriptions,
  settings: STORAGE_KEYS.settings,
  demoEmails: STORAGE_KEYS.demoEmails,
  importLog: STORAGE_KEYS.importLog,
  activityLog: STORAGE_KEYS.activityLog,
});

export function getKnownStorageKeys() {
  return Object.values(STORAGE_KEYS);
}
