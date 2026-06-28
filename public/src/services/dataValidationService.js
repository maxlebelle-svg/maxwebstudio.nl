import { STORAGE_KEYS } from "../config/storageKeys.js";
import { normalizeCustomer, customerIdentityKeys } from "../utils/customerNormalizer.js";
import { normalizeWebsite } from "../utils/websiteNormalizer.js";

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function pushIssue(issues, severity, module, message, id = "") {
  issues.push({ severity, module, message, id });
}

function validateIds(module, records, issues) {
  const seen = new Set();
  records.forEach((record) => {
    if (!record.id) pushIssue(issues, "error", module, "Record mist id.");
    if (record.id && seen.has(record.id)) pushIssue(issues, "error", module, "Dubbele id gevonden.", record.id);
    if (record.id) seen.add(record.id);
    if (!record.createdAt) pushIssue(issues, "warning", module, "Record mist createdAt.", record.id);
    if (!record.updatedAt) pushIssue(issues, "warning", module, "Record mist updatedAt.", record.id);
    if (record.isDemo || record.isDemoJourney) pushIssue(issues, "info", module, "Demo-record aanwezig.", record.id);
  });
}

export function validateLocalStorageData() {
  const issues = [];
  const customers = readArray(STORAGE_KEYS.crmCustomers);
  const websites = readArray(STORAGE_KEYS.managedSites);
  const projects = readArray(STORAGE_KEYS.projects);
  const quotes = readArray(STORAGE_KEYS.quotes);
  const invoices = readArray(STORAGE_KEYS.invoices);
  const subscriptions = readArray(STORAGE_KEYS.subscriptions);
  const files = readArray(STORAGE_KEYS.files);

  [
    ["customers", customers],
    ["websites", websites],
    ["projects", projects],
    ["quotes", quotes],
    ["invoices", invoices],
    ["subscriptions", subscriptions],
    ["files", files],
  ].forEach(([module, records]) => validateIds(module, records, issues));

  const emailSeen = new Map();
  const companyPhoneSeen = new Map();
  customers.map(normalizeCustomer).forEach((customer) => {
    if (!customer.name && !customer.company) pushIssue(issues, "warning", "customers", "Klant mist naam en bedrijf.", customer.id);
    if (!customer.email) pushIssue(issues, "warning", "customers", "Klant mist e-mailadres.", customer.id);
    if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) pushIssue(issues, "error", "customers", "Klant heeft ongeldig e-mailadres.", customer.id);
    if (!customer.status) pushIssue(issues, "warning", "customers", "Klant mist status.", customer.id);
    if (!customer.createdAt) pushIssue(issues, "warning", "customers", "Klant mist createdAt.", customer.id);
    if ((customer.isDemo || customer.isDemoJourney || customer.environment === "demo") && !customer.demoScenarioId && !customer.demoJourneyId) {
      pushIssue(issues, "info", "customers", "Demo-klant mist demoScenarioId/demoJourneyId.", customer.id);
    }
    const keys = customerIdentityKeys(customer);
    if (keys.email) {
      if (emailSeen.has(keys.email)) pushIssue(issues, "warning", "customers", "Dubbele e-mail gevonden.", customer.id);
      emailSeen.set(keys.email, customer.id);
    }
    if (keys.companyPhone) {
      if (companyPhoneSeen.has(keys.companyPhone)) pushIssue(issues, "warning", "customers", "Dubbele bedrijfsnaam + telefoon gevonden.", customer.id);
      companyPhoneSeen.set(keys.companyPhone, customer.id);
    }
  });
  invoices.forEach((invoice) => {
    if (!Array.isArray(invoice.lines) || !invoice.lines.length) pushIssue(issues, "error", "invoices", "Factuur mist factuurregels.", invoice.id);
  });
  quotes.forEach((quote) => {
    if (!Array.isArray(quote.lines) || !quote.lines.length) pushIssue(issues, "error", "quotes", "Offerte mist offertregels.", quote.id);
  });
  subscriptions.forEach((subscription) => {
    if (!subscription.profileId && !subscription.customerId) pushIssue(issues, "error", "subscriptions", "Abonnement mist klantkoppeling.", subscription.id);
  });
  projects.forEach((project) => {
    if (!project.customerId && !project.profileId) pushIssue(issues, "error", "projects", "Project mist klantkoppeling.", project.id);
  });
  const websiteDomains = new Map();
  websites.map(normalizeWebsite).forEach((website) => {
    if (!website.name) pushIssue(issues, "error", "websites", "Website mist naam.", website.id);
    if (!website.profileId && !website.customerId) pushIssue(issues, "error", "websites", "Website mist klantkoppeling.", website.id);
    if (!website.domain && !website.liveUrl) pushIssue(issues, "error", "websites", "Website mist domein/live URL.", website.id);
    if (website.liveUrl && !/^https?:\/\//i.test(website.liveUrl)) pushIssue(issues, "error", "websites", "Website heeft ongeldige live URL.", website.id);
    if (!website.status) pushIssue(issues, "warning", "websites", "Website mist status.", website.id);
    if (!website.createdAt) pushIssue(issues, "warning", "websites", "Website mist createdAt.", website.id);
    if (!website.updatedAt) pushIssue(issues, "warning", "websites", "Website mist updatedAt.", website.id);
    if ((website.isDemo || website.isDemoJourney || website.environment === "demo") && !website.demoScenarioId && !website.demoJourneyId) {
      pushIssue(issues, "info", "websites", "Demo-website mist demoScenarioId/demoJourneyId.", website.id);
    }
    if (website.domain) {
      if (websiteDomains.has(website.domain)) pushIssue(issues, "warning", "websites", "Dubbel domein gevonden.", website.id);
      websiteDomains.set(website.domain, website.id);
    }
  });

  const ready = !issues.some((issue) => issue.severity === "error");
  return {
    ready,
    ok: ready,
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
    info: issues.filter((issue) => issue.severity === "info"),
    issues,
  };
}
