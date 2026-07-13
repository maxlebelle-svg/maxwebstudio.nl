const dns = require("dns").promises;
const net = require("net");
const { resolveLiveUrlPolicy, _private: urlPrivate } = require("../websiteLive/urlPolicy");

async function runNetworkCheck(website = {}, options = {}) {
  const policy = resolveLiveUrlPolicy({ website });
  if (!policy.safe) return result({ liveUrlState: "blocked", httpsState: "blocked", dnsState: "blocked", sslState: "not_checked", responseState: "blocked_unsafe_destination", redirectState: "none", basicContentState: "unchecked", reasonCodes: [policy.reasonCode] });
  const fetchImpl = options.fetchImpl || global.fetch;
  const lookup = options.lookup || dns.lookup.bind(dns);
  const timeoutMs = bounded(options.timeoutMs, 4000, 500, 5000);
  const maxRedirects = bounded(options.maxRedirects, 2, 0, 3);
  const maxBytes = bounded(options.maxBytes, 131072, 1024, 262144);
  let current = new URL(policy.canonicalUrl);
  let redirected = false;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const host = normalizeHost(current.hostname);
    if (!policy.allowedHostnames.has(host) || urlPrivate.isPrivateAddress(host)) return result({ liveUrlState: "blocked", httpsState: "valid", dnsState: "blocked", sslState: "not_checked", responseState: "blocked_unsafe_destination", redirectState: "blocked", basicContentState: "unchecked", reasonCodes: ["redirect_destination_forbidden"] });
    let addresses;
    try { addresses = await resolveAddresses(host, lookup); } catch { return inconclusive("dns_failure", redirected); }
    if (!addresses.length) return inconclusive("dns_failure", redirected);
    if (addresses.some(urlPrivate.isPrivateAddress)) return result({ liveUrlState: "blocked", httpsState: "valid", dnsState: "blocked", sslState: "not_checked", responseState: "blocked_unsafe_destination", redirectState: "blocked", basicContentState: "unchecked", reasonCodes: ["private_address_resolved"] });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try { response = await fetchImpl(current.toString(), { method: "GET", redirect: "manual", signal: controller.signal, headers: { Accept: "text/html,application/xhtml+xml" } }); }
    catch (error) { clearTimeout(timer); return networkError(error, redirected); }
    clearTimeout(timer);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.("location");
      if (!location) return attention("client_error", redirected, "redirect_location_missing");
      let next; try { next = new URL(location, current); } catch { return attention("blocked_unsafe_destination", true, "redirect_location_invalid"); }
      if (next.protocol !== "https:" || next.username || next.password || (next.port && next.port !== "443") || urlPrivate.technicalPath(next)) return attention("blocked_unsafe_destination", true, "redirect_destination_forbidden");
      redirected = true; current = next; continue;
    }
    if (response.status >= 500) return attention("server_error", redirected, "http_server_error");
    if (response.status >= 400) return attention("client_error", redirected, "http_client_error");
    if (response.status < 200) return inconclusive("unexpected_http_status", redirected);
    const type = String(response.headers?.get?.("content-type") || "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) return attention("success", redirected, "content_not_html", "non_html");
    let body; try { body = await readBounded(response, maxBytes); } catch (error) { return error.code === "response_too_large" ? attention("success", redirected, error.code, "too_large") : inconclusive("response_read_failed", redirected); }
    const contentState = !body.trim() ? "empty" : /(?:preview|staging|concept)[ -]?(?:omgeving|version|banner)/i.test(body.slice(0, 32768)) ? "preview_marker" : "html";
    if (contentState !== "html") return attention(redirected ? "redirect_success" : "success", redirected, `content_${contentState}`, contentState);
    return result({ liveUrlState: "reachable", httpsState: "valid", dnsState: "resolved", sslState: "valid", responseState: redirected ? "redirect_success" : "success", redirectState: redirected ? "safe" : "none", basicContentState: "html", reasonCodes: ["website_healthy"] });
  }
  return attention("blocked_unsafe_destination", true, "redirect_limit_exceeded");
}

async function readBounded(response, maxBytes) {
  const declared = Number(response.headers?.get?.("content-length") || 0); if (declared > maxBytes) throw coded("response_too_large");
  if (response.body?.getReader) { const reader = response.body.getReader(); const chunks = []; let size = 0; while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw coded("response_too_large"); } chunks.push(Buffer.from(value)); } return Buffer.concat(chunks).toString("utf8"); }
  const text = typeof response.text === "function" ? await response.text() : ""; if (Buffer.byteLength(text) > maxBytes) throw coded("response_too_large"); return text;
}
function networkError(error, redirected) { const code = String(error?.cause?.code || error?.code || ""); if (error?.name === "AbortError") return inconclusive("timeout", redirected); if (/CERT|TLS|SSL/i.test(code)) return attention("tls_failure", redirected, "tls_failure"); if (/ENOTFOUND|EAI_AGAIN|DNS/i.test(code)) return inconclusive("dns_failure", redirected); return inconclusive("network_failure", redirected); }
function attention(responseState, redirected, reason, content = "unchecked") { return result({ liveUrlState: "reachable", httpsState: "valid", dnsState: "resolved", sslState: responseState === "tls_failure" ? "certificate_problem" : "valid", responseState, redirectState: redirected ? "safe" : "none", basicContentState: content, reasonCodes: [reason] }); }
function inconclusive(reason, redirected) { return result({ liveUrlState: "unconfirmed", httpsState: "valid", dnsState: reason === "dns_failure" ? "unresolved" : "unknown", sslState: "not_checked", responseState: reason, redirectState: redirected ? "safe" : "none", basicContentState: "unchecked", reasonCodes: [reason] }); }
function result(value) { return value; }
async function resolveAddresses(host, lookup) { if (net.isIP(host)) return [host]; const rows = await lookup(host, { all: true, verbatim: true }); return (Array.isArray(rows) ? rows : [rows]).map((row) => String(row?.address || row || "")).filter(Boolean); }
function normalizeHost(value) { return String(value || "").toLowerCase().replace(/\.$/, ""); }
function bounded(value, fallback, min, max) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback; }
function coded(code) { return Object.assign(new Error(code), { code }); }
module.exports = { runNetworkCheck, _private: { readBounded } };
