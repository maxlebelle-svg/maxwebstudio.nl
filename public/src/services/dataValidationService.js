import { STORAGE_KEYS } from "../config/storageKeys.js";
import { normalizeCustomer, customerIdentityKeys } from "../utils/customerNormalizer.js";
import { normalizeWebsite } from "../utils/websiteNormalizer.js";
import { normalizeProject, projectIdentityKeys } from "../utils/projectNormalizer.js";
import { calculateQuoteTotals, normalizeQuote, quoteIdentityKeys } from "../utils/quoteNormalizer.js";
import { calculateInvoiceTotals, normalizeInvoice, invoiceIdentityKeys } from "../utils/invoiceNormalizer.js";
import { normalizeSubscription, subscriptionIdentityKeys } from "../utils/subscriptionNormalizer.js";

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
  const customerIds = new Set(customers.map((customer) => normalizeCustomer(customer).id).filter(Boolean));
  const websiteIds = new Set(websites.map((website) => normalizeWebsite(website).id).filter(Boolean));
  const projectIds = new Set(projects.map((project) => normalizeProject(project).id).filter(Boolean));
  const quoteIds = new Set(quotes.map((quote) => normalizeQuote(quote).id).filter(Boolean));
  const subscriptionIds = new Set(subscriptions.map((subscription) => subscription.id).filter(Boolean));
  const quoteNumbers = new Map();
  quotes.map(normalizeQuote).forEach((quote) => {
    if (!quote.quoteNumber) pushIssue(issues, "error", "quotes", "Offerte mist offertenummer.", quote.id);
    if (!quote.profileId && !quote.customerId) pushIssue(issues, "error", "quotes", "Offerte mist klantkoppeling.", quote.id);
    if (quote.profileId && !customerIds.has(quote.profileId)) pushIssue(issues, "error", "quotes", "Offerte heeft ontbrekende klant.", quote.id);
    if (quote.websiteId && !websiteIds.has(quote.websiteId)) pushIssue(issues, "warning", "quotes", "Offerte heeft ontbrekende website.", quote.id);
    if (!Array.isArray(quote.lines) || !quote.lines.length) pushIssue(issues, "error", "quotes", "Offerte mist offertregels.", quote.id);
    quote.lines.forEach((line, index) => {
      if (!line.description) pushIssue(issues, "error", "quotes", `Offertregel ${index + 1} mist omschrijving.`, quote.id);
      if (line.quantity <= 0) pushIssue(issues, "error", "quotes", `Offertregel ${index + 1} heeft een ongeldige hoeveelheid.`, quote.id);
      if (line.unitPrice < 0) pushIssue(issues, "error", "quotes", `Offertregel ${index + 1} heeft een negatieve prijs.`, quote.id);
    });
    const totals = calculateQuoteTotals(quote.lines);
    if (Math.abs(Number(quote.total || 0) - Number(totals.total || 0)) > 0.05) pushIssue(issues, "warning", "quotes", "Offertetotaal wijkt af van berekende offertregels.", quote.id);
    const keys = quoteIdentityKeys(quote);
    if (keys.quoteNumber) {
      if (quoteNumbers.has(keys.quoteNumber)) pushIssue(issues, "warning", "quotes", "Dubbel offertenummer gevonden.", quote.id);
      quoteNumbers.set(keys.quoteNumber, quote.id);
    }
  });
  const activeSubscriptionKeys = new Map();
  subscriptions.map(normalizeSubscription).forEach((subscription) => {
    if (!subscription.profileId && !subscription.customerId) pushIssue(issues, "error", "subscriptions", "Abonnement mist klantkoppeling.", subscription.id);
    if (subscription.profileId && !customerIds.has(subscription.profileId)) pushIssue(issues, "error", "subscriptions", "Abonnement heeft ontbrekende klant.", subscription.id);
    if (subscription.websiteId && !websiteIds.has(subscription.websiteId)) pushIssue(issues, "warning", "subscriptions", "Abonnement heeft ontbrekende website.", subscription.id);
    if (subscription.projectId && !projectIds.has(subscription.projectId)) pushIssue(issues, "warning", "subscriptions", "Abonnement heeft ontbrekend project.", subscription.id);
    if (subscription.lastInvoiceId && !invoices.some((invoice) => invoice.id === subscription.lastInvoiceId)) pushIssue(issues, "warning", "subscriptions", "Abonnement heeft ontbrekende laatste factuur.", subscription.id);
    if (!subscription.plan) pushIssue(issues, "warning", "subscriptions", "Abonnement mist plan.", subscription.id);
    if (!subscription.status) pushIssue(issues, "warning", "subscriptions", "Abonnement mist status.", subscription.id);
    if (!subscription.invoiceFrequency && !subscription.billingCycle) pushIssue(issues, "warning", "subscriptions", "Abonnement mist frequentie.", subscription.id);
    if (!subscription.startDate) pushIssue(issues, "warning", "subscriptions", "Abonnement mist startdatum.", subscription.id);
    if (subscription.nextInvoiceDate && Number.isNaN(new Date(subscription.nextInvoiceDate).getTime())) pushIssue(issues, "warning", "subscriptions", "Abonnement heeft ongeldige volgende factuurdatum.", subscription.id);
    if (subscription.priceExVat < 0) pushIssue(issues, "error", "subscriptions", "Abonnement heeft negatieve prijs.", subscription.id);
    if ((subscription.isDemo || subscription.isDemoJourney || subscription.environment === "demo") && !subscription.demoScenarioId && !subscription.demoJourneyId) {
      pushIssue(issues, "info", "subscriptions", "Demo-abonnement mist demoScenarioId/demoJourneyId.", subscription.id);
    }
    const keys = subscriptionIdentityKeys(subscription);
    if (subscription.status === "actief" && keys.customerWebsitePlan) {
      if (activeSubscriptionKeys.has(keys.customerWebsitePlan)) pushIssue(issues, "warning", "subscriptions", "Dubbel actief abonnement voor klant/website/plan.", subscription.id);
      activeSubscriptionKeys.set(keys.customerWebsitePlan, subscription.id);
    }
  });

  const invoiceNumbers = new Map();
  invoices.map(normalizeInvoice).forEach((invoice) => {
    if (!invoice.invoiceNumber) pushIssue(issues, "error", "invoices", "Factuur mist factuurnummer.", invoice.id);
    if (!invoice.profileId && !invoice.customerId) pushIssue(issues, "error", "invoices", "Factuur mist klantkoppeling.", invoice.id);
    if (invoice.profileId && !customerIds.has(invoice.profileId)) pushIssue(issues, "error", "invoices", "Factuur heeft ontbrekende klant.", invoice.id);
    if (invoice.websiteId && !websiteIds.has(invoice.websiteId)) pushIssue(issues, "warning", "invoices", "Factuur heeft ontbrekende website.", invoice.id);
    if (invoice.projectId && !projectIds.has(invoice.projectId)) pushIssue(issues, "warning", "invoices", "Factuur heeft ontbrekend project.", invoice.id);
    if (invoice.sourceQuoteId && !quoteIds.has(invoice.sourceQuoteId)) pushIssue(issues, "warning", "invoices", "Factuur heeft ontbrekende gekoppelde offerte.", invoice.id);
    if (invoice.subscriptionId && !subscriptionIds.has(invoice.subscriptionId)) pushIssue(issues, "warning", "invoices", "Factuur heeft ontbrekend abonnement.", invoice.id);
    if (!invoice.status) pushIssue(issues, "warning", "invoices", "Factuur mist status.", invoice.id);
    if (!invoice.paymentStatus) pushIssue(issues, "warning", "invoices", "Factuur mist betaalstatus.", invoice.id);
    if (!invoice.invoiceDate) pushIssue(issues, "warning", "invoices", "Factuur mist factuurdatum.", invoice.id);
    if (!Array.isArray(invoice.lines) || !invoice.lines.length) pushIssue(issues, "error", "invoices", "Factuur mist factuurregels.", invoice.id);
    invoice.lines.forEach((line, index) => {
      if (!line.description) pushIssue(issues, "error", "invoices", `Factuurregel ${index + 1} mist omschrijving.`, invoice.id);
      if (line.quantity <= 0) pushIssue(issues, "error", "invoices", `Factuurregel ${index + 1} heeft een ongeldige hoeveelheid.`, invoice.id);
      if (line.unitPrice < 0) pushIssue(issues, "error", "invoices", `Factuurregel ${index + 1} heeft een negatieve prijs.`, invoice.id);
    });
    const totals = calculateInvoiceTotals(invoice.lines);
    if (Math.abs(Number(invoice.total || 0) - Number(totals.total || 0)) > 0.05) pushIssue(issues, "warning", "invoices", "Factuurtotaal wijkt af van berekende factuurregels.", invoice.id);
    if ((invoice.isDemo || invoice.isDemoJourney || invoice.environment === "demo") && !invoice.demoScenarioId && !invoice.demoJourneyId) {
      pushIssue(issues, "info", "invoices", "Demo-factuur mist demoScenarioId/demoJourneyId.", invoice.id);
    }
    const keys = invoiceIdentityKeys(invoice);
    if (keys.invoiceNumber) {
      if (invoiceNumbers.has(keys.invoiceNumber)) pushIssue(issues, "warning", "invoices", "Dubbel factuurnummer gevonden.", invoice.id);
      invoiceNumbers.set(keys.invoiceNumber, invoice.id);
    }
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

  const projectKeys = new Map();
  projects.map(normalizeProject).forEach((project) => {
    if (!project.name) pushIssue(issues, "error", "projects", "Project mist projectnaam.", project.id);
    if (!project.customerId && !project.profileId) pushIssue(issues, "error", "projects", "Project mist klantkoppeling.", project.id);
    if (project.customerId && !customerIds.has(project.customerId)) pushIssue(issues, "error", "projects", "Project heeft ontbrekende klant.", project.id);
    if (project.websiteId && !websiteIds.has(project.websiteId)) pushIssue(issues, "warning", "projects", "Project heeft ontbrekende website.", project.id);
    if (!project.status) pushIssue(issues, "warning", "projects", "Project mist status.", project.id);
    if (!project.phase) pushIssue(issues, "warning", "projects", "Project mist fase.", project.id);
    if (!project.createdAt) pushIssue(issues, "warning", "projects", "Project mist createdAt.", project.id);
    if (!project.updatedAt) pushIssue(issues, "warning", "projects", "Project mist updatedAt.", project.id);
    if ((project.isDemo || project.isDemoJourney || project.environment === "demo") && !project.demoScenarioId && !project.demoJourneyId) {
      pushIssue(issues, "info", "projects", "Demo-project mist demoScenarioId/demoJourneyId.", project.id);
    }
    const keys = projectIdentityKeys(project);
    const key = keys.customerWebsiteName || keys.customerName;
    if (key) {
      if (projectKeys.has(key)) pushIssue(issues, "warning", "projects", "Dubbele projectnaam bij dezelfde klant/website gevonden.", project.id);
      projectKeys.set(key, project.id);
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
