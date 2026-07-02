const dns = require("dns").promises;
const net = require("net");

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 1.5 * 1024 * 1024;
const TIMEOUT_MS = 9000;
const USER_AGENT = "MaxWebstudioLeadAnalyzer/1.0 (+https://maxwebstudio.nl)";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Alleen handmatige POST-analyses zijn toegestaan." });
  }

  try {
    const payload = parseJson(event.body);
    const inputUrl = String(payload.url || "").trim();
    if (!inputUrl) {
      return jsonResponse(400, {
        ok: false,
        error: "Website niet bereikbaar of ongeldig.",
        details: "Vul eerst een website-url in.",
      });
    }

    const startUrl = normalizeInputUrl(inputUrl);
    await assertSafeUrl(startUrl);

    const result = await fetchWithRedirects(startUrl);
    const analysis = analyzeHtml(result.body, {
      inputUrl,
      finalUrl: result.finalUrl,
      statusCode: result.statusCode,
    });

    return jsonResponse(200, analysis);
  } catch (error) {
    return jsonResponse(error.statusCode || 400, {
      ok: false,
      error: "Website niet bereikbaar of ongeldig.",
      details: safeErrorMessage(error),
    });
  }
};

function parseJson(body) {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    const parseError = new Error("Ongeldige aanvraag.");
    parseError.statusCode = 400;
    throw parseError;
  }
}

function normalizeInputUrl(value) {
  const trimmed = String(value || "").trim();
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url;
  try {
    url = new URL(candidate);
  } catch (error) {
    const urlError = new Error("De website-url is niet geldig.");
    urlError.statusCode = 400;
    throw urlError;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    const protocolError = new Error("Alleen http- en https-websites kunnen worden geanalyseerd.");
    protocolError.statusCode = 400;
    throw protocolError;
  }

  url.hash = "";
  return url;
}

async function assertSafeUrl(url) {
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    const error = new Error("Interne of lokale adressen zijn geblokkeerd.");
    error.statusCode = 400;
    throw error;
  }

  if (isPrivateIp(hostname)) {
    const error = new Error("Private IP-adressen zijn geblokkeerd.");
    error.statusCode = 400;
    throw error;
  }

  const records = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (!records.length) {
    const error = new Error("Domein kon niet worden gevonden.");
    error.statusCode = 400;
    throw error;
  }

  if (records.some((record) => isPrivateIp(record.address))) {
    const error = new Error("Domein verwijst naar een intern adres en is geblokkeerd.");
    error.statusCode = 400;
    throw error;
  }
}

function isPrivateIp(value) {
  const ipVersion = net.isIP(value);
  if (!ipVersion) return false;

  if (ipVersion === 4) {
    const parts = value.split(".").map(Number);
    return parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || parts[0] === 0;
  }

  const normalized = value.toLowerCase();
  return normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe80:")
    || normalized === "::";
}

async function fetchWithRedirects(initialUrl) {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertSafeUrl(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response;
    try {
      response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      currentUrl = new URL(response.headers.get("location"), currentUrl);
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) {
      const error = new Error("De URL geeft geen HTML-pagina terug.");
      error.statusCode = 400;
      throw error;
    }

    const body = await readLimitedBody(response);
    return {
      finalUrl: response.url || currentUrl.toString(),
      statusCode: response.status,
      body,
    };
  }

  const error = new Error("Te veel redirects tijdens het ophalen van de website.");
  error.statusCode = 400;
  throw error;
}

async function readLimitedBody(response) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    return text.slice(0, MAX_BODY_BYTES);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function analyzeHtml(html, context) {
  const finalUrl = String(context.finalUrl || "");
  const statusCode = Number(context.statusCode || 0);
  const text = stripHtml(html).toLowerCase();
  const raw = String(html || "");
  const titleText = extractFirst(raw, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescriptionText = extractMetaDescription(raw);
  const h1Text = extractFirst(raw, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const hasViewportMeta = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(raw);
  const hasMediaQuery = /@media\s*\(|min-width|max-width|container-query|srcset|sizes=/i.test(raw);
  const hasContactFormSignal = /<form[\s>]/i.test(raw)
    || /type=["'](?:email|tel|text)["']/i.test(raw)
    || hasAny(text, ["contact", "offerte", "afspraak", "aanvraag", "bel ons", "neem contact op"]);
  const hasWhatsAppSignal = /wa\.me|whatsapp\.com|api\.whatsapp\.com/i.test(raw);
  const hasSocialLinksSignal = /instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com/i.test(raw);
  const hasPrivacySignal = hasAny(text, ["privacy", "privacyverklaring"]);
  const hasCookieSignal = hasAny(text, ["cookie", "cookiebeleid"]);
  const hasTermsSignal = hasAny(text, ["voorwaarden", "algemene voorwaarden"]);
  const hasCtaSignal = hasAny(text, [
    "offerte aanvragen",
    "afspraak maken",
    "bel direct",
    "neem contact op",
    "vraag aan",
    "plan gesprek",
    "gratis advies",
    "contact",
  ]);
  const hasMobileResponsiveSignal = hasViewportMeta || hasMediaQuery || /responsive|mobile-first|mobiel/i.test(raw);

  const checks = {
    websiteReachable: statusCode >= 200 && statusCode < 400,
    usesHttps: finalUrl.startsWith("https://"),
    hasTitle: Boolean(titleText),
    titleText,
    hasMetaDescription: Boolean(metaDescriptionText),
    metaDescriptionText,
    hasH1: Boolean(h1Text),
    h1Text,
    hasContactFormSignal,
    hasWhatsAppSignal,
    hasSocialLinksSignal,
    hasPrivacySignal,
    hasCookieSignal,
    hasTermsSignal,
    hasCtaSignal,
    hasViewportMeta,
    hasMobileResponsiveSignal,
  };

  const score = calculateScore(checks);
  return {
    ok: true,
    inputUrl: context.inputUrl,
    finalUrl,
    statusCode,
    score,
    checks,
    improvements: buildImprovements(checks),
    salesOpportunities: buildSalesOpportunities(checks),
  };
}

function calculateScore(checks) {
  const policySignal = checks.hasPrivacySignal || checks.hasCookieSignal || checks.hasTermsSignal;
  const score = (checks.websiteReachable ? 20 : 0)
    + (checks.usesHttps ? 10 : 0)
    + (checks.hasTitle ? 8 : 0)
    + (checks.hasMetaDescription ? 8 : 0)
    + (checks.hasH1 ? 8 : 0)
    + (checks.hasContactFormSignal ? 10 : 0)
    + (checks.hasCtaSignal ? 10 : 0)
    + (checks.hasWhatsAppSignal ? 5 : 0)
    + (checks.hasSocialLinksSignal ? 5 : 0)
    + (policySignal ? 8 : 0)
    + (checks.hasMobileResponsiveSignal ? 8 : 0);
  return Math.max(0, Math.min(100, score));
}

function buildImprovements(checks) {
  const items = [];
  if (!checks.usesHttps) items.push("Zorg dat de website veilig via HTTPS opent.");
  if (!checks.hasTitle) items.push("Voeg een duidelijke SEO titel toe.");
  if (!checks.hasMetaDescription) items.push("Voeg een aantrekkelijke meta description toe.");
  if (!checks.hasH1) items.push("Maak de hoofdboodschap duidelijk met een H1-kop.");
  if (!checks.hasCtaSignal) items.push("Maak de belangrijkste call-to-action zichtbaarder.");
  if (!checks.hasContactFormSignal) items.push("Maak contact opnemen makkelijker met een formulier of duidelijke contactknop.");
  if (!checks.hasMobileResponsiveSignal) items.push("Controleer of mobiele bezoekers een goede ervaring krijgen.");
  if (!checks.hasPrivacySignal || !checks.hasCookieSignal) items.push("Maak privacy- en cookie-informatie duidelijk zichtbaar.");
  return items.length ? items : ["De homepage bevat de belangrijkste basis-signalen. Controleer visueel of de uitstraling nog actueel is."];
}

function buildSalesOpportunities(checks) {
  const items = [];
  if (!checks.usesHttps) items.push("Bezoekers kunnen afhaken door een onveilig gevoel.");
  if (!checks.hasMetaDescription) items.push("Het Google-resultaat kan minder aantrekkelijk zijn.");
  if (!checks.hasH1) items.push("De pagina mist mogelijk een duidelijke hoofdboodschap.");
  if (!checks.hasCtaSignal) items.push("Bezoekers weten mogelijk niet wat de volgende stap is.");
  if (!checks.hasWhatsAppSignal) items.push("Laagdrempelig contact via mobiel ontbreekt.");
  if (!checks.hasPrivacySignal || !checks.hasCookieSignal || !checks.hasTermsSignal) items.push("De website oogt minder professioneel en mogelijk minder AVG-proof.");
  if (!checks.hasMobileResponsiveSignal) items.push("Mobiele bezoekers kunnen afhaken.");
  return items.length ? items : ["Gebruik de scan als opening: de basis is aanwezig, maar design, snelheid en conversie kunnen vaak nog beter."];
}

function extractFirst(html, pattern) {
  const match = String(html || "").match(pattern);
  return match ? cleanExtractedText(match[1]) : "";
}

function extractMetaDescription(html) {
  const match = String(html || "").match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
    || String(html || "").match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  return match ? cleanExtractedText(match[1]) : "";
}

function stripHtml(html) {
  return decodeEntities(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function cleanExtractedText(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 220);
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function hasAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function safeErrorMessage(error) {
  if (error.name === "AbortError") return "Website reageerde te langzaam.";
  return String(error.message || "Onbekende fout.").slice(0, 180);
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
