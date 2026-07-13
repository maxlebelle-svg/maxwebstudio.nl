const { resolveLiveUrlPolicy, verifyLiveUrlReachability } = require("./urlPolicy");

const LIVE_WEBSITE_STATES = new Set(["live", "online", "active", "actief"]);
const CANCELLED_PROJECT_STATES = new Set(["cancelled", "canceled", "geannuleerd", "archived"]);

async function resolveWebsiteLiveContext(input = {}, options = {}) {
  const customer = object(input.customer);
  const project = object(input.project);
  const website = object(input.website);
  const health = object(input.healthWebsite);
  const review = object(input.review);
  const environment = normalizeEnvironment(input.environment);
  const base = {
    environment,
    websiteReference: text(website.id),
    projectReference: text(project.id),
    journeyType: text(input.journeyType || project.metadata?.journeyType || "website.direct_checkout"),
    publicationSource: text(input.publicationSource || "website_factory_complete_launch"),
    publicationReference: publicationReference(website, review),
    liveState: status(website.status),
    urlState: "unverified",
    dnsState: category(health.dns_status || website.dns_status, ["valid", "warning", "invalid", "unknown"]),
    sslState: category(health.ssl_status || website.ssl_status, ["active", "pending", "inactive", "unknown"]),
    commercialReadinessState: commercialState(project),
    maintenanceState: maintenanceState(project, input.maintenanceSubscription),
    nextStepType: "post_launch_check",
    customerActionRequired: false,
    internalActionRequired: false,
    safeLiveUrl: "",
    safePortalCta: "https://maxwebstudio.nl/klantportaal.html",
    reasonCode: "website_live_context_unverified",
    confidence: "low",
    source: "server_side_factory_records",
    journeyRelevant: true,
  };

  if (!base.websiteReference || !base.projectReference || !text(customer.id)) return unsafe(base, "website_live_identity_missing");
  if (text(project.customer_id) !== text(customer.id) || text(website.customer_id) !== text(customer.id) || (text(project.website_id) && text(project.website_id) !== text(website.id))) return unsafe(base, "website_live_ownership_mismatch");
  if (CANCELLED_PROJECT_STATES.has(status(project.status))) return unsafe(base, "website_live_project_cancelled");
  if (status(project.status) !== "live" || status(review.status) !== "live" || input.technicalStored !== true) return unsafe(base, "website_live_not_durably_stored");
  if (!LIVE_WEBSITE_STATES.has(status(website.status))) return unsafe(base, "website_live_status_unconfirmed");
  if (!base.publicationReference) return unsafe(base, "website_live_publication_reference_missing");
  if (base.commercialReadinessState === "inconsistent") return unsafe(base, "website_live_commercial_state_inconsistent");

  const policy = resolveLiveUrlPolicy({ website, candidate: website.live_url || website.domain });
  if (!policy.safe) return unsafe({ ...base, urlState: "blocked" }, policy.reasonCode);
  if (base.dnsState === "invalid" || base.sslState === "inactive") return unsafe({ ...base, safeLiveUrl: policy.canonicalUrl, urlState: "configuration_invalid" }, "website_live_dns_or_ssl_invalid");
  if (base.dnsState === "warning" || base.sslState === "pending") return unsafe({ ...base, safeLiveUrl: policy.canonicalUrl, urlState: "configuration_pending" }, "website_live_dns_or_ssl_pending");

  const probe = options.reachabilityChecker
    ? await options.reachabilityChecker(policy)
    : await verifyLiveUrlReachability(policy, options);
  if (probe?.reachable !== true) return unsafe({ ...base, safeLiveUrl: policy.canonicalUrl, urlState: "unreachable" }, probe?.reasonCode || "website_live_unreachable");
  return {
    ...base,
    safe: true,
    safeLiveUrl: policy.canonicalUrl,
    safeHostname: policy.hostname,
    hostnameCategory: policy.hostnameCategory,
    urlState: "reachable",
    dnsState: base.dnsState === "unknown" ? "verified_by_probe" : base.dnsState,
    sslState: base.sslState === "unknown" ? "verified_by_https_probe" : base.sslState,
    internalActionRequired: base.commercialReadinessState === "uncertain",
    reasonCode: "website_live_verified",
    confidence: "server_verified",
    source: "stored_launch_plus_bounded_https_probe",
  };
}

function publicationReference(website, review) {
  const metadata = object(website.metadata);
  return text(review.livePublicationReference || metadata.livePublicationReference || metadata.netlifyDeployId || metadata.deploymentId || website.last_deploy_at || review.liveAt);
}
function commercialState(project) {
  const metadata = object(project.metadata);
  const order = object(metadata.websiteCommercialOrder || metadata.commercialOrder);
  const value = status(order.status || order.paymentStatus || metadata.paymentStatus);
  if (["cancelled", "canceled", "refunded", "charged_back", "unpaid", "failed"].includes(value)) return "inconsistent";
  if (["paid", "complete", "completed", "deposit_paid", "active"].includes(value)) return "ready";
  return value ? "uncertain" : "not_asserted";
}
function maintenanceState(project, subscription) {
  const order = object(object(project.metadata).websiteCommercialOrder);
  if (subscription?.id && ["active", "planned"].includes(status(subscription.status))) return status(subscription.status);
  if (text(order.maintenanceCode) === "none") return "not_selected";
  if (text(order.maintenanceCode)) return "selected_not_activated";
  return "unknown";
}
function normalizeEnvironment(value) { return ["production", "prod"].includes(status(value)) ? "production" : "test"; }
function category(value, allowed) { const result = status(value || "unknown"); return allowed.includes(result) ? result : "unknown"; }
function unsafe(base, reasonCode) { return { ...base, safe: false, reasonCode, internalActionRequired: true, confidence: "low" }; }
function status(value) { return text(value).toLowerCase(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value || "").trim(); }

module.exports = { resolveWebsiteLiveContext, _private: { commercialState, maintenanceState, publicationReference } };
