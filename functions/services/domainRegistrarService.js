const DEFAULT_BASE_URL = "https://api.openprovider.eu/v1beta";
const REQUEST_TIMEOUT_MS = 8000;
const TOKEN_SAFETY_WINDOW_MS = 60 * 1000;
const CHECK_CACHE_MS = 5 * 60 * 1000;

let authCache = null;
const availabilityCache = new Map();

function configured(env = process.env) {
  return Boolean(clean(env.OPENPROVIDER_USERNAME) && clean(env.OPENPROVIDER_PASSWORD));
}

async function checkDomain(domainName, options = {}) {
  const env = options.env || process.env;
  if (!configured(env)) return { configured: false, provider: "openprovider" };
  const domain = splitDomain(domainName);
  const cached = availabilityCache.get(domainName);
  if (!options.force && cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };

  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = baseUrlFor(env);
  const token = await accessToken({ env, fetchImpl, baseUrl });
  const response = await request(fetchImpl, `${baseUrl}/domains/check`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ domains: [domain], with_price: true }),
  });
  const payload = await json(response);
  if (!response.ok || Number(payload?.code || 0) !== 0) throw providerError(payload?.desc || "Openprovider kon het domein niet controleren.", response.status, "registrar_check_failed");
  const result = payload?.data?.results?.[0];
  if (!result || clean(result.domain).toLowerCase() !== domainName) throw providerError("Openprovider gaf geen geldig domeinresultaat.", 502, "registrar_invalid_response");
  const status = clean(result.status).toLowerCase();
  const available = status === "free" || status === "available";
  const value = {
    configured: true,
    provider: "openprovider",
    definitive: true,
    available,
    status,
    premium: Boolean(result.is_premium || result.premium),
    price: normalizePrice(result.price),
  };
  availabilityCache.set(domainName, { value, expiresAt: Date.now() + CHECK_CACHE_MS });
  trimCache();
  return value;
}

async function registerDomain(input = {}, options = {}) {
  const env = options.env || process.env;
  const config = registrationConfig(env, input.domainName);
  if (!config.enabled) return { configured: configured(env), enabled: false, provider: "openprovider", warning: config.warning };
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = baseUrlFor(env);
  const domainName = clean(input.domainName).toLowerCase();
  const availability = await checkDomain(domainName, { env, fetchImpl, force: true });
  if (!availability.definitive || !availability.available) throw providerError("De domeinnaam is vlak voor registratie niet meer beschikbaar.", 409, "registrar_domain_unavailable");
  if (availability.premium) throw providerError("Premiumdomeinen worden nooit automatisch geregistreerd.", 409, "registrar_premium_blocked");

  const token = await accessToken({ env, fetchImpl, baseUrl });
  const customer = await createCustomer({ env, fetchImpl, baseUrl, token, holder: input.holder || {} });
  const domain = splitDomain(domainName);
  const response = await request(fetchImpl, `${baseUrl}/domains`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      owner_handle: customer.handle,
      admin_handle: customer.handle,
      tech_handle: customer.handle,
      billing_handle: customer.handle,
      domain,
      period: 1,
      unit: "y",
      name_servers: config.nameServers.map((name, index) => ({ name, seq_nr: index })),
      autorenew: input.autoRenew === false ? "off" : "on",
      comments: `Max Webstudio online bestelling ${clean(input.requestId).slice(0, 80)}`,
    }),
  });
  const payload = await json(response);
  if (!response.ok || Number(payload?.code || 0) !== 0 || !payload?.data?.id) {
    throw providerError(payload?.desc || payload?.data?.error || "Openprovider kon het domein niet registreren.", response.status, "registrar_registration_failed", payload?.code);
  }
  const providerStatus = clean(payload.data.status).toUpperCase();
  return {
    configured: true,
    enabled: true,
    provider: "openprovider",
    domainName,
    domainId: Number(payload.data.id),
    providerStatus,
    active: providerStatus === "ACT",
    requested: providerStatus === "REQ",
    customerHandle: customer.handle,
    activationDate: clean(payload.data.activation_date) || null,
    expirationDate: clean(payload.data.expiration_date) || null,
    renewalDate: clean(payload.data.renewal_date) || null,
  };
}

async function createCustomer({ env, fetchImpl, baseUrl, token, holder }) {
  const normalized = normalizeHolder(holder);
  const response = await request(fetchImpl, `${baseUrl}/customers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(normalized),
  });
  const payload = await json(response);
  const handle = clean(payload?.data?.handle);
  if (!response.ok || Number(payload?.code || 0) !== 0 || !handle) {
    throw providerError(payload?.desc || "Openprovider kon de domeinhouder niet aanmaken.", response.status, "registrar_customer_failed", payload?.code);
  }
  return { handle };
}

function registrationConfig(env = {}, domainName = "") {
  const enabled = truthy(env.DOMAIN_REGISTRATION_AUTOMATION_ENABLED) && truthy(env.DOMAIN_REGISTRATION_LIVE_ENABLED);
  const extension = clean(domainName).toLowerCase().split(".").pop();
  const nameServers = clean(env.OPENPROVIDER_NAMESERVERS).split(/[\s,;]+/).map((value) => value.toLowerCase().replace(/\.$/, "")).filter(Boolean);
  if (!enabled) return { enabled: false, warning: "Automatische domeinregistratie staat nog niet live.", nameServers };
  if (!configured(env)) return { enabled: false, warning: "De Openprovider API-inlog ontbreekt.", nameServers };
  if (!["nl", "com"].includes(extension)) return { enabled: false, warning: "Deze extensie wordt nog handmatig geregistreerd.", nameServers };
  if (nameServers.length < 2 || nameServers.some((name) => !/^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9]?))+$/.test(name))) {
    return { enabled: false, warning: "Er zijn nog geen geldige nameservers voor automatische registratie ingesteld.", nameServers: [] };
  }
  return { enabled: true, nameServers: [...new Set(nameServers)].slice(0, 8) };
}

function normalizeHolder(holder = {}) {
  const country = countryCode(holder.country);
  if (!country) throw providerError("Het land van de domeinhouder vraagt handmatige controle.", 400, "registrar_holder_country_unsupported");
  const name = splitPersonName(holder.holderName);
  const address = splitAddress(holder.address);
  const phone = splitPhone(holder.phone, country);
  const email = clean(holder.email).toLowerCase();
  if (!name.first_name || !name.last_name || !address.street || !address.number || !clean(holder.postalCode) || !clean(holder.city) || !/^\S+@\S+\.\S+$/.test(email)) {
    throw providerError("De houdergegevens zijn niet volledig genoeg voor automatische registratie.", 400, "registrar_holder_invalid");
  }
  const result = {
    name,
    address: { street: address.street, number: address.number, suffix: address.suffix, zipcode: clean(holder.postalCode), city: clean(holder.city), country, state: clean(holder.state) },
    phone,
    email,
    locale: country === "NL" ? "nl_NL" : "en_GB",
    comments: "Aangemaakt via Max Webstudio domeinbestelling",
  };
  if (clean(holder.holderType).toLowerCase() !== "person" && clean(holder.companyName)) result.company_name = clean(holder.companyName);
  return result;
}

function splitPersonName(value) {
  const parts = clean(value).replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length < 2) return { first_name: parts[0] || "", last_name: "", initials: (parts[0] || "").slice(0, 1).toUpperCase() };
  return { first_name: parts.shift(), last_name: parts.join(" "), initials: value.trim().slice(0, 1).toUpperCase() };
}

function splitAddress(value) {
  const match = clean(value).match(/^(.*?)[,\s]+(\d+)(?:[-\s]?([a-z0-9]+))?$/i);
  return match ? { street: clean(match[1]), number: match[2], suffix: clean(match[3]) } : { street: clean(value), number: "", suffix: "" };
}

function splitPhone(value, country) {
  let digits = clean(value).replace(/[^0-9+]/g, "");
  if (country !== "NL") throw providerError("Dit internationale telefoonnummer vraagt handmatige controle.", 400, "registrar_holder_phone_unsupported");
  digits = digits.replace(/^\+31/, "").replace(/^0031/, "").replace(/^0/, "").replace(/\D/g, "");
  if (digits.length < 9) throw providerError("Het telefoonnummer van de domeinhouder is ongeldig.", 400, "registrar_holder_invalid");
  const areaLength = digits.startsWith("6") ? 1 : 2;
  return { country_code: "+31", area_code: digits.slice(0, areaLength), subscriber_number: digits.slice(areaLength) };
}

function countryCode(value) {
  const normalized = clean(value).toLowerCase().replace(/[^a-z]/g, "");
  if (["nl", "nederland", "netherlands", "thenetherlands"].includes(normalized)) return "NL";
  return "";
}

async function accessToken({ env, fetchImpl, baseUrl }) {
  const username = clean(env.OPENPROVIDER_USERNAME);
  if (authCache && authCache.username === username && authCache.baseUrl === baseUrl && authCache.expiresAt > Date.now() + TOKEN_SAFETY_WINDOW_MS) return authCache.token;
  const response = await request(fetchImpl, `${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password: String(env.OPENPROVIDER_PASSWORD), ip: clean(env.OPENPROVIDER_IP) || "0.0.0.0" }),
  });
  const payload = await json(response);
  const token = clean(payload?.data?.token);
  if (!response.ok || Number(payload?.code || 0) !== 0 || !token) throw providerError(payload?.desc || "Openprovider-aanmelding is mislukt.", response.status === 401 ? 502 : response.status, classifyAuthFailure(payload, response.status), payload?.code);
  const expiresIn = Math.max(300, Number(payload?.data?.expires_in || payload?.data?.expiresIn || 3600));
  authCache = { username, baseUrl, token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

function splitDomain(domainName) {
  const labels = String(domainName || "").toLowerCase().split(".");
  if (labels.length < 2) throw providerError("Ongeldige domeinnaam.", 400);
  return { name: labels.shift(), extension: labels.join(".") };
}

function normalizePrice(price) {
  const candidate = price?.reseller || price?.product || price;
  const amount = Number(candidate?.price ?? candidate?.amount);
  const currency = clean(candidate?.currency).toUpperCase();
  return Number.isFinite(amount) && currency ? { amount, currency } : null;
}

async function request(fetchImpl, url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try { return await fetchImpl(url, { ...options, signal: controller.signal }); }
  catch (error) { throw providerError(error?.name === "AbortError" ? "Openprovider reageerde niet op tijd." : "Openprovider is tijdelijk niet bereikbaar.", 502); }
  finally { clearTimeout(timer); }
}

async function json(response) { return response.json().catch(() => null); }
function baseUrlFor(env) { return clean(env.OPENPROVIDER_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""); }
function clean(value) { return String(value || "").trim(); }
function truthy(value) { return ["true", "1", "yes", "on"].includes(clean(value).toLowerCase()); }
function classifyAuthFailure(payload, status) {
  const code = Number(payload?.code);
  const description = clean(payload?.desc).toLowerCase();
  if (code === 197) return "registrar_contract_required";
  if (code === 10005 || /access denied|white.?list|black.?list/.test(description)) return "registrar_access_denied";
  if (code === 10008 || code === 10009 || /api access.*disabled/.test(description)) return "registrar_api_disabled";
  if (code === 10006 || /two.factor|2fa/.test(description)) return "registrar_2fa_required";
  if ([10002, 10003, 10004, 192].includes(code) || status === 401 || /invalid (username|password)|password.*match|authenticat|credential|login failed/.test(description)) return "registrar_credentials_rejected";
  if (/contract|processor agreement/.test(description)) return "registrar_contract_required";
  return "registrar_unavailable";
}
function providerError(message, statusCode = 502, code = "registrar_unavailable", externalCode = null) { const error = new Error(message); error.statusCode = statusCode >= 400 && statusCode < 500 ? statusCode : 502; error.code = code; const numeric = Number(externalCode); error.externalCode = Number.isInteger(numeric) && numeric >= 0 && numeric <= 99999 ? numeric : null; return error; }
function trimCache() { if (availabilityCache.size <= 500) return; for (const [key, item] of availabilityCache) if (item.expiresAt <= Date.now()) availabilityCache.delete(key); }
function resetForTests() { authCache = null; availabilityCache.clear(); }

module.exports = { checkDomain, configured, registerDomain, registrationConfig, _private: { classifyAuthFailure, countryCode, normalizeHolder, normalizePrice, resetForTests, splitAddress, splitDomain, splitPersonName, splitPhone } };
