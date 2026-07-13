const dns = require("dns").promises;
const net = require("net");

const BLOCKED_QUERY_KEYS = new Set(["token", "auth", "key", "deploy", "deployment", "preview", "redirect", "redirect_to"]);

function resolveLiveUrlPolicy(input = {}) {
  const website = object(input.website);
  const metadata = object(website.metadata);
  const candidate = text(input.candidate || website.live_url || website.domain);
  let url;
  try { url = new URL(withHttps(candidate)); } catch { return denied("live_url_invalid"); }
  if (url.protocol !== "https:") return denied("live_url_https_required");
  if (url.username || url.password || (url.port && url.port !== "443")) return denied("live_url_credentials_or_port_forbidden");
  const hostname = normalizeHost(url.hostname);
  if (!hostname || isLocalHostname(hostname) || isPrivateAddress(hostname)) return denied("live_url_private_or_local");
  if (technicalPath(url)) return denied("live_url_technical_route");
  if ([...url.searchParams.keys()].some((key) => BLOCKED_QUERY_KEYS.has(key.toLowerCase()))) return denied("live_url_technical_query");

  const expectedCustomHosts = customHosts(website);
  const isNetlify = hostname.endsWith(".netlify.app");
  const agreedNetlify = isNetlify && netlifyAgreed(hostname, website, metadata);
  const customMatch = expectedCustomHosts.has(hostname);
  if (!customMatch && !agreedNetlify) return denied(isNetlify ? "netlify_live_url_not_explicitly_agreed" : "live_url_website_mismatch");
  if (isNetlify && /(^|[.-])(deploy-preview|preview|staging|branch)([.-]|$)/i.test(hostname)) return denied("netlify_preview_url_forbidden");

  url.hash = "";
  const allowedHostnames = new Set(customMatch ? expectedCustomHosts : [hostname]);
  return {
    safe: true,
    reasonCode: customMatch ? "custom_domain_url_valid" : "agreed_netlify_url_valid",
    canonicalUrl: url.toString(),
    hostname,
    hostnameCategory: customMatch ? "custom_domain" : "agreed_netlify",
    allowedHostnames,
  };
}

async function verifyLiveUrlReachability(policy = {}, options = {}) {
  if (policy.safe !== true || !policy.canonicalUrl) return { reachable: false, reasonCode: policy.reasonCode || "live_url_policy_failed" };
  const fetchImpl = options.fetchImpl || global.fetch;
  const lookup = options.lookup || dns.lookup.bind(dns);
  const timeoutMs = bounded(options.timeoutMs, 3500, 500, 5000);
  const maxRedirects = bounded(options.maxRedirects, 2, 0, 3);
  if (typeof fetchImpl !== "function") return { reachable: false, reasonCode: "live_url_probe_unavailable" };
  let current = new URL(policy.canonicalUrl);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const hostname = normalizeHost(current.hostname);
    if (!policy.allowedHostnames?.has(hostname)) return { reachable: false, reasonCode: "live_url_redirect_host_forbidden" };
    const addresses = await resolveAddresses(hostname, lookup).catch(() => []);
    if (!addresses.length) return { reachable: false, reasonCode: "live_url_dns_unresolved" };
    if (addresses.some(isPrivateAddress)) return { reachable: false, reasonCode: "live_url_private_address_resolved" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(current.toString(), { method: "HEAD", redirect: "manual", signal: controller.signal, headers: { Accept: "text/html,application/xhtml+xml" } });
    } catch (error) {
      clearTimeout(timer);
      return { reachable: false, reasonCode: error?.name === "AbortError" ? "live_url_probe_timeout" : "live_url_probe_failed" };
    }
    clearTimeout(timer);
    if (response.status >= 200 && response.status < 300) return { reachable: true, reasonCode: "live_url_reachable", statusCategory: "2xx", finalUrl: current.toString() };
    if (response.status < 300 || response.status >= 400) return { reachable: false, reasonCode: "live_url_http_unhealthy", statusCategory: `${Math.floor(response.status / 100)}xx` };
    const location = response.headers?.get?.("location");
    if (!location) return { reachable: false, reasonCode: "live_url_redirect_missing_location" };
    try { current = new URL(location, current); } catch { return { reachable: false, reasonCode: "live_url_redirect_invalid" }; }
    if (current.protocol !== "https:" || technicalPath(current)) return { reachable: false, reasonCode: "live_url_redirect_unsafe" };
  }
  return { reachable: false, reasonCode: "live_url_redirect_limit" };
}

async function resolveAddresses(hostname, lookup) {
  if (net.isIP(hostname)) return [hostname];
  const rows = await lookup(hostname, { all: true, verbatim: true });
  return (Array.isArray(rows) ? rows : [rows]).map((row) => text(row?.address || row)).filter(Boolean);
}

function customHosts(website) {
  const values = [website.domain, object(website.metadata).canonicalDomain, object(website.metadata).customDomain];
  const hosts = new Set();
  values.forEach((value) => {
    const host = hostFrom(value);
    if (!host || host.endsWith(".netlify.app")) return;
    hosts.add(host);
    if (host.startsWith("www.")) hosts.add(host.slice(4));
    else hosts.add(`www.${host}`);
  });
  return hosts;
}

function netlifyAgreed(hostname, website, metadata) {
  const slug = text(website.netlify_project_name || metadata.netlifyProjectName).toLowerCase();
  const explicit = metadata.netlifyIsCanonical === true || metadata.liveUrlType === "netlify_production" || metadata.canonicalHost === hostname;
  return explicit && Boolean(slug) && hostname === `${slug}.netlify.app`;
}

function technicalPath(url) {
  const value = `${url.pathname}${url.search}`.toLowerCase();
  return value.includes("/.netlify/functions/") || /(^|\/)preview(?:\/|$)/.test(url.pathname.toLowerCase()) || value.includes("deploy-preview");
}

function isPrivateAddress(value) {
  const address = normalizeHost(value).replace(/^\[|\]$/g, "");
  if (net.isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || parts[0] >= 224;
  }
  if (net.isIP(address) === 6) return address === "::1" || address === "::" || /^f[cd]/i.test(address) || /^fe[89ab]/i.test(address);
  return false;
}

function isLocalHostname(hostname) { return hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal"); }
function hostFrom(value) { try { return normalizeHost(new URL(withHttps(text(value))).hostname); } catch { return ""; } }
function withHttps(value) { const result = text(value); return /^[a-z][a-z0-9+.-]*:/i.test(result) ? result : `https://${result}`; }
function normalizeHost(value) { return text(value).toLowerCase().replace(/\.$/, ""); }
function bounded(value, fallback, min, max) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value || "").trim(); }
function denied(reasonCode) { return { safe: false, reasonCode, canonicalUrl: "", hostname: "", hostnameCategory: "blocked", allowedHostnames: new Set() }; }

module.exports = { resolveLiveUrlPolicy, verifyLiveUrlReachability, _private: { customHosts, isPrivateAddress, technicalPath } };
