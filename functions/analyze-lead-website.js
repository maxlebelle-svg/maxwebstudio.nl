const dns = require("dns").promises;
const net = require("net");
const { corsHeaders } = require("./_cors");

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 1.5 * 1024 * 1024;
const TIMEOUT_MS = 9000;
const MAX_SCAN_PAGES = 8;
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
    const finalUrl = new URL(result.finalUrl);
    const scannedPages = await scanPublicPages(finalUrl, result.body);
    const [robotsFound, sitemapFound] = await Promise.all([
      checkKnownFile(finalUrl, "/robots.txt"),
      checkKnownFile(finalUrl, "/sitemap.xml"),
    ]);
    const analysis = analyzeHtml(result.body, {
      inputUrl,
      finalUrl: result.finalUrl,
      statusCode: result.statusCode,
      responseTimeMs: result.responseTimeMs,
      pageSizeBytes: result.pageSizeBytes,
      redirectedToHttps: result.redirectedToHttps,
      redirectCount: result.redirectCount,
      robotsFound,
      sitemapFound,
      scannedPages,
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
  const startedAt = Date.now();
  const initialProtocol = initialUrl.protocol;
  let redirectedToHttps = false;
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
      const nextUrl = new URL(response.headers.get("location"), currentUrl);
      if (currentUrl.protocol === "http:" && nextUrl.protocol === "https:") {
        redirectedToHttps = true;
      }
      currentUrl = nextUrl;
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) {
      const error = new Error("De URL geeft geen HTML-pagina terug.");
      error.statusCode = 400;
      throw error;
    }

    const body = await readLimitedBody(response);
    const finalUrl = response.url || currentUrl.toString();
    return {
      finalUrl,
      statusCode: response.status,
      responseTimeMs: Date.now() - startedAt,
      pageSizeBytes: Buffer.byteLength(body, "utf8"),
      redirectedToHttps: redirectedToHttps || (initialProtocol === "http:" && finalUrl.startsWith("https://")),
      redirectCount,
      body,
    };
  }

  const error = new Error("Te veel redirects tijdens het ophalen van de website.");
  error.statusCode = 400;
  throw error;
}

async function checkKnownFile(baseUrl, path) {
  const target = new URL(path, baseUrl);
  await assertSafeUrl(target);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/plain,application/xml,text/xml,*/*;q=0.7",
      },
    });
    return response.status >= 200 && response.status < 400;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
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
  const responseTimeMs = Number(context.responseTimeMs || 0);
  const pageSizeBytes = Number(context.pageSizeBytes || Buffer.byteLength(String(html || ""), "utf8"));
  const scannedPages = Array.isArray(context.scannedPages) ? context.scannedPages : [];
  const combinedHtml = [html, ...scannedPages.map((page) => page.html || "")].join("\n");
  const text = stripHtml(html).toLowerCase();
  const raw = String(html || "");
  const titleText = extractFirst(raw, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescriptionText = extractMetaDescription(raw);
  const h1Text = extractFirst(raw, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const hasViewportMeta = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(raw);
  const hasMediaQuery = /@media\s*\(|min-width|max-width|container-query|srcset|sizes=/i.test(raw);
  const hasOpenGraph = /<meta[^>]+(?:property|name)=["']og:/i.test(raw);
  const hasFavicon = /<link[^>]+rel=["'][^"']*(?:icon|shortcut icon|apple-touch-icon)[^"']*["']/i.test(raw);
  const hasTelLink = /href=["']tel:/i.test(raw);
  const hasMailtoLink = /href=["']mailto:/i.test(raw);
  const hasContactFormSignal = /<form[\s>]/i.test(raw)
    || /type=["'](?:email|tel|text)["']/i.test(raw)
    || hasAny(text, ["contact", "offerte", "afspraak", "aanvraag", "bel ons", "neem contact op"]);
  const hasWhatsAppSignal = /wa\.me|whatsapp\.com|api\.whatsapp\.com/i.test(raw);
  const hasSocialLinksSignal = /instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com/i.test(raw);
  const hasPrivacySignal = hasAny(text, ["privacy", "privacyverklaring"]);
  const hasCookieSignal = hasAny(text, ["cookie", "cookiebeleid"]);
  const hasTermsSignal = hasAny(text, ["voorwaarden", "algemene voorwaarden"]);
  const hasKvkSignal = /\bkvk\b|kamer van koophandel/i.test(raw);
  const hasFacebook = /facebook\.com/i.test(raw);
  const hasInstagram = /instagram\.com/i.test(raw);
  const hasLinkedIn = /linkedin\.com/i.test(raw);
  const hasYouTube = /youtube\.com|youtu\.be/i.test(raw);
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
  const currentWebsite = buildCurrentWebsiteSnapshot(raw, {
    inputUrl: context.inputUrl,
    finalUrl,
    titleText,
    metaDescriptionText,
    h1Text,
  });
  const extractedContactData = extractContactData(combinedHtml, finalUrl);
  const extractedMedia = buildMediaInventory(combinedHtml, finalUrl);
  const foundPages = summarizePages(scannedPages, finalUrl);
  const aiBriefing = buildAiBriefing({
    html: combinedHtml,
    currentWebsite,
    contactData: extractedContactData,
    media: extractedMedia,
    finalUrl,
  });

  const checks = {
    websiteReachable: statusCode >= 200 && statusCode < 400,
    httpStatusOk: statusCode >= 200 && statusCode < 400,
    statusCode,
    usesHttps: finalUrl.startsWith("https://"),
    redirectedToHttps: Boolean(context.redirectedToHttps),
    redirectCount: Number(context.redirectCount || 0),
    responseTimeMs,
    pageSizeBytes,
    hasFastResponse: responseTimeMs > 0 && responseTimeMs <= 1800,
    hasAcceptableResponse: responseTimeMs > 0 && responseTimeMs <= 3500,
    hasReasonablePageSize: pageSizeBytes <= 1.2 * 1024 * 1024,
    hasTitle: Boolean(titleText),
    titleText,
    hasMetaDescription: Boolean(metaDescriptionText),
    metaDescriptionText,
    hasH1: Boolean(h1Text),
    h1Text,
    hasOpenGraph,
    hasFavicon,
    hasContactFormSignal,
    hasTelLink,
    hasMailtoLink,
    hasWhatsAppSignal,
    hasSocialLinksSignal,
    hasPrivacySignal,
    hasCookieSignal,
    hasTermsSignal,
    hasKvkSignal,
    hasCtaSignal,
    hasViewportMeta,
    hasMobileResponsiveSignal,
    robotsFound: Boolean(context.robotsFound),
    sitemapFound: Boolean(context.sitemapFound),
    hasFacebook,
    hasInstagram,
    hasLinkedIn,
    hasYouTube,
  };

  const score = calculateScore(checks);
  const briefingCompleteness = calculateBriefingCompleteness(aiBriefing, extractedContactData, extractedMedia, checks);
  const missingFields = buildMissingFields(aiBriefing, extractedContactData, extractedMedia, checks);
  const buildConfidence = calculateBuildConfidence({ briefingCompleteness, missingFields, extractedMedia, foundPages, checks });
  const websiteIntelligence = {
    websiteFound: checks.websiteReachable,
    scanStatus: "klaar",
    foundPages,
    foundContactCount: extractedContactData.emails.length + extractedContactData.phones.length + extractedContactData.addresses.length,
    foundImageCount: extractedMedia.length,
    briefingCompleteness,
    buildConfidence,
    missingFields,
    attentionPoints: buildAttentionPoints(missingFields, checks, extractedMedia),
    lastScannedAt: new Date().toISOString(),
  };
  return {
    ok: true,
    inputUrl: context.inputUrl,
    finalUrl,
    statusCode,
    responseTimeMs,
    pageSizeBytes,
    score,
    scoreLabel: getScoreLabel(score),
    checks,
    currentWebsite,
    websiteScanRaw: {
      pages: foundPages,
      homepage: currentWebsite,
      checks,
    },
    websiteScanSummary: buildScanSummary({ checks, foundPages, extractedContactData, extractedMedia }),
    websiteIntelligence,
    extractedContactData,
    extractedMedia,
    aiBriefing,
    briefingCompleteness,
    buildConfidence,
    missingFields,
    lastScannedAt: websiteIntelligence.lastScannedAt,
    improvements: buildImprovements(checks),
    salesOpportunities: buildSalesOpportunities(checks),
  };
}

function buildCurrentWebsiteSnapshot(html, context = {}) {
  const raw = String(html || "");
  const baseUrl = context.finalUrl || context.inputUrl || "";
  const headings = extractTagTexts(raw, /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi, 10);
  const paragraphs = extractTagTexts(raw, /<p[^>]*>([\s\S]*?)<\/p>/gi, 8)
    .filter((item) => item.length >= 35);
  const pricingItems = extractPricingItems(raw);
  const imageUrls = extractImageUrls(raw, baseUrl).slice(0, 8);
  const socialUrls = extractUrls(raw, /(https?:\/\/(?:www\.)?(?:instagram|facebook|linkedin|youtube|youtu\.be|tiktok)\.com\/[^"'<\s)]+)/gi, 8);
  return {
    sourceUrl: baseUrl,
    title: cleanExtractedText(context.titleText),
    metaDescription: cleanExtractedText(context.metaDescriptionText),
    h1: cleanExtractedText(context.h1Text),
    headings,
    paragraphs,
    pricingItems,
    imageUrls,
    socialUrls,
    extractedAt: new Date().toISOString(),
  };
}

async function scanPublicPages(finalUrl, homepageHtml) {
  const urls = selectInternalPageUrls(homepageHtml, finalUrl).slice(0, Math.max(0, MAX_SCAN_PAGES - 1));
  const pages = [{
    url: finalUrl.toString(),
    title: extractFirst(homepageHtml, /<title[^>]*>([\s\S]*?)<\/title>/i) || "Homepage",
    kind: "homepage",
    html: String(homepageHtml || ""),
    ok: true,
  }];
  for (const url of urls) {
    try {
      await assertSafeUrl(new URL(url));
      const result = await fetchWithRedirects(new URL(url));
      pages.push({
        url: result.finalUrl,
        title: extractFirst(result.body, /<title[^>]*>([\s\S]*?)<\/title>/i) || pageKindFromUrl(result.finalUrl),
        kind: pageKindFromUrl(result.finalUrl),
        html: result.body,
        ok: true,
      });
    } catch {
      pages.push({
        url,
        title: pageKindFromUrl(url),
        kind: pageKindFromUrl(url),
        html: "",
        ok: false,
      });
    }
  }
  return pages.slice(0, MAX_SCAN_PAGES);
}

function selectInternalPageUrls(html, finalUrl) {
  const base = new URL(finalUrl.toString());
  const preferred = ["diensten", "service", "aanbod", "over", "about", "contact", "project", "portfolio", "reviews", "werkwijze"];
  const urls = [];
  const seen = new Set([base.toString().replace(/\/$/, "")]);
  let match;
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = pattern.exec(String(html || ""))) && urls.length < 40) {
    const href = String(match[1] || "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    let url;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(url.protocol) || url.hostname !== base.hostname) continue;
    url.hash = "";
    const normalized = url.toString().replace(/\/$/, "");
    if (seen.has(normalized) || /\.(pdf|zip|jpg|jpeg|png|webp|gif|svg)$/i.test(url.pathname)) continue;
    seen.add(normalized);
    urls.push(url.toString());
  }
  return urls.sort((a, b) => pagePriority(b, preferred) - pagePriority(a, preferred));
}

function pagePriority(url, preferred) {
  const path = new URL(url).pathname.toLowerCase();
  return preferred.reduce((score, word, index) => score + (path.includes(word) ? 30 - index : 0), 0);
}

function pageKindFromUrl(url) {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return String(url || "").toLowerCase();
    }
  })();
  if (/contact/.test(path)) return "contact";
  if (/dienst|service|aanbod/.test(path)) return "diensten";
  if (/over|about/.test(path)) return "over ons";
  if (/project|portfolio|werk/.test(path)) return "projecten";
  if (/review|ervaring/.test(path)) return "reviews";
  return "pagina";
}

function summarizePages(pages = [], finalUrl = "") {
  const fallback = finalUrl ? [{ url: String(finalUrl), title: "Homepage", kind: "homepage", ok: true }] : [];
  return (pages.length ? pages : fallback).map((page) => ({
    url: cleanExtractedText(page.url).slice(0, 300),
    title: cleanExtractedText(page.title || page.kind || "Pagina"),
    kind: cleanExtractedText(page.kind || pageKindFromUrl(page.url)),
    ok: page.ok !== false,
  })).slice(0, MAX_SCAN_PAGES);
}

function extractContactData(html, baseUrl = "") {
  const raw = String(html || "");
  const text = stripHtml(raw);
  const emails = uniqueMatches(raw, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, 8)
    .filter((item) => !/example|sentry|schema|wix|wordpress/i.test(item));
  const phones = uniqueMatches(text, /(?:\+31|0031|0)\s?(?:6|7[0-9]|8[0-9]|[1-5][0-9])(?:[\s().-]?\d){7,9}/g, 8);
  const addresses = uniqueMatches(text, /\b[A-ZÀ-Ÿ][a-zà-ÿ.' -]{2,40}\s+\d{1,4}[a-z]?\s*,?\s+[1-9]\d{3}\s?[A-Z]{2}\s+[A-ZÀ-Ÿ][a-zà-ÿ.' -]{2,40}/g, 4);
  const socialUrls = extractUrls(raw, /(https?:\/\/(?:www\.)?(?:instagram|facebook|linkedin|youtube|youtu\.be|tiktok)\.com\/[^"'<\s)]+)/gi, 12);
  const openingHours = uniqueMatches(text, /\b(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma\.?|di\.?|wo\.?|do\.?|vr\.?|za\.?|zo\.?)\s*[:\-]?\s*\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}/gi, 8);
  return {
    emails,
    phones,
    addresses,
    openingHours,
    socialUrls,
    website: cleanExtractedText(baseUrl),
  };
}

function buildMediaInventory(html, baseUrl = "") {
  return extractImageUrls(html, baseUrl).slice(0, 18).map((url) => {
    const lower = url.toLowerCase();
    const isLogo = /logo|brand|favicon/.test(lower);
    const isTiny = /icon|sprite|pixel|tracking/.test(lower);
    const qualityScore = isTiny ? 35 : isLogo ? 78 : /hero|banner|cover|project|portfolio|gallery/.test(lower) ? 82 : 64;
    return {
      url,
      type: isLogo ? "logo" : "foto",
      qualityScore,
      usable: qualityScore >= 70 ? "yes" : qualityScore >= 50 ? "maybe" : "no",
      recommendedUsage: isLogo ? "Logo/merkherkenning" : qualityScore >= 75 ? "Hero of dienstenbeeld" : "Ondersteunend beeld",
      note: qualityScore >= 70 ? "Lijkt bruikbaar voor de preview." : "Controleer formaat en scherpte voor gebruik.",
    };
  });
}

function buildAiBriefing({ html, currentWebsite, contactData, media, finalUrl }) {
  const text = stripHtml(html).toLowerCase();
  const headings = currentWebsite.headings || [];
  const services = inferServices(text, headings);
  const industry = inferIndustry(text, currentWebsite);
  const cta = inferCta(text);
  const audience = /\bzakelijk|bedrijven|b2b|professionals\b/i.test(text) ? "Zakelijk" : /\bparticulier|consument|gezinnen\b/i.test(text) ? "Particulieren" : "Particulieren en zakelijk";
  const region = inferRegion(text, contactData);
  return {
    business: cleanExtractedText(currentWebsite.h1 || currentWebsite.title || new URL(finalUrl).hostname),
    industry,
    description: cleanExtractedText(currentWebsite.metaDescription || headings.slice(0, 2).join(" · ") || "Bestaande website gevonden; gebruik scan als basis voor een betere preview."),
    audience,
    region,
    services,
    subservices: services.slice(0, 6),
    usps: inferUsps(text),
    tone: inferTone(text),
    currentLook: inferCurrentLook(currentWebsite, media),
    premiumDirection: "Maak de preview duidelijker, rustiger en conversiegerichter dan de huidige site, met sterke CTA's en vertrouwen boven de vouw.",
    ctas: [cta],
    contact: contactData,
    seoKeywords: inferSeoKeywords(text, services, industry, region),
    strengths: inferStrengths(currentWebsite, contactData, media),
    weaknesses: [],
    opportunities: [],
    recommendedPages: ["Home", "Diensten", "Werkwijze", "Projecten/reviews", "Contact"],
    recommendedHero: `Heldere belofte, ${cta.toLowerCase()} als hoofdactie en direct zichtbaar vertrouwen.`,
    recommendedTrust: "Gebruik reviews, keurmerken, projecten en duidelijke contactgegevens als bewijs.",
    recommendedConversion: "Plaats telefoon, formulier en hoofdknop consequent bovenaan en bij elk belangrijk blok.",
    missingInfo: [],
  };
}

function inferServices(text, headings = []) {
  const dictionary = [
    ["maatwerk", "Maatwerk"],
    ["project", "Projecten"],
    ["onderhoud", "Onderhoud"],
    ["advies", "Advies"],
    ["support", "Support"],
    ["installatie", "Installatie"],
    ["renovatie", "Renovatie"],
    ["reparatie", "Reparatie"],
    ["training", "Training"],
    ["behandeling", "Behandelingen"],
    ["apk", "APK"],
    ["occasion", "Occasions"],
  ];
  const found = dictionary.filter(([needle]) => text.includes(needle)).map(([, label]) => label);
  const headingServices = headings.filter((item) => item.length > 3 && item.length < 60).slice(0, 4);
  return [...new Set([...found, ...headingServices])].slice(0, 8);
}

function inferIndustry(text, currentWebsite = {}) {
  const source = [text, currentWebsite.title, currentWebsite.h1].join(" ");
  if (/auto|garage|apk|occasion|showroom/.test(source)) return "Autobedrijf / garage";
  if (/bouw|aannemer|renovatie|dak|kozijn/.test(source)) return "Bouwbedrijf";
  if (/install|zonnepanelen|warmtepomp|airco|laadpaal/.test(source)) return "Installatiebedrijf";
  if (/rijschool|rijles|cbr/.test(source)) return "Rijschool";
  if (/restaurant|cafe|lunch|diner/.test(source)) return "Horeca";
  return "Zakelijke dienstverlening";
}

function inferCta(text) {
  if (/offerte/.test(text)) return "Vraag een offerte aan";
  if (/afspraak/.test(text)) return "Afspraak inplannen";
  if (/bel/.test(text)) return "Bel direct";
  if (/whatsapp/.test(text)) return "Stuur WhatsApp";
  return "Neem contact op";
}

function inferRegion(text, contactData = {}) {
  const address = contactData.addresses?.[0] || "";
  const match = address.match(/[1-9]\d{3}\s?[A-Z]{2}\s+([A-ZÀ-Ÿ][a-zà-ÿ.' -]{2,40})/);
  if (match) return cleanExtractedText(match[1]);
  if (/landelijk/.test(text)) return "Landelijk";
  if (/regio/.test(text)) return "Regionaal";
  return "Lokaal";
}

function inferUsps(text) {
  const items = [];
  if (/ervaring|jaar actief|sinds/.test(text)) items.push("Ervaring");
  if (/snel|spoed|direct/.test(text)) items.push("Snelle reactie");
  if (/maatwerk|persoonlijk/.test(text)) items.push("Persoonlijke aanpak");
  if (/garantie|kwaliteit/.test(text)) items.push("Kwaliteit en zekerheid");
  return items.length ? items : ["Duidelijke service", "Laagdrempelig contact"];
}

function inferTone(text) {
  if (/premium|exclusief|luxe/.test(text)) return "Premium en verzorgd";
  if (/persoonlijk|familie|vertrouwd/.test(text)) return "Persoonlijk en betrouwbaar";
  if (/snel|direct|spoed/.test(text)) return "Direct en actiegericht";
  return "Professioneel, duidelijk en praktisch";
}

function inferCurrentLook(currentWebsite = {}, media = []) {
  const hasVisuals = media.some((item) => item.usable !== "no");
  return hasVisuals ? "Bestaande website bevat bruikbaar beeldmateriaal; controleer kwaliteit per sectie." : "Beeldbasis is beperkt; kies nieuwe premium beelden of laat beelden genereren.";
}

function inferSeoKeywords(text, services = [], industry = "", region = "") {
  const words = [...services, industry, region].filter(Boolean);
  if (/offerte/.test(text)) words.push("offerte");
  if (/contact/.test(text)) words.push("contact");
  return [...new Set(words)].slice(0, 10);
}

function inferStrengths(currentWebsite = {}, contactData = {}, media = []) {
  const strengths = [];
  if (currentWebsite.title) strengths.push("Titel en basispositionering gevonden");
  if (contactData.phones?.length || contactData.emails?.length) strengths.push("Contactgegevens gevonden");
  if (media.some((item) => item.usable === "yes")) strengths.push("Bruikbare beelden gevonden");
  return strengths.length ? strengths : ["Website is bereikbaar en kan als startpunt dienen"];
}

function calculateBriefingCompleteness(aiBriefing, contactData, media, checks) {
  const parts = [
    Boolean(aiBriefing.industry),
    Boolean(aiBriefing.description),
    Boolean(aiBriefing.services?.length),
    Boolean(aiBriefing.audience),
    Boolean(aiBriefing.ctas?.length),
    Boolean(contactData.phones?.length || contactData.emails?.length),
    Boolean(media.length),
    Boolean(checks.hasCtaSignal),
    Boolean(checks.hasMobileResponsiveSignal),
    Boolean(checks.hasOpenGraph || checks.hasFavicon),
  ];
  return Math.round((parts.filter(Boolean).length / parts.length) * 100);
}

function buildMissingFields(aiBriefing, contactData, media, checks) {
  const missing = [];
  if (!aiBriefing.services?.length) missing.push("Diensten");
  if (!contactData.phones?.length && !contactData.emails?.length) missing.push("Contactgegevens");
  if (!media.length) missing.push("Beeldmateriaal");
  if (!checks.hasCtaSignal) missing.push("Call-to-action");
  if (!checks.hasMobileResponsiveSignal) missing.push("Mobiele controle");
  if (!checks.hasOpenGraph && !checks.hasFavicon) missing.push("Merkbasis");
  return missing;
}

function calculateBuildConfidence({ briefingCompleteness, missingFields, extractedMedia, foundPages, checks }) {
  let score = briefingCompleteness;
  if (foundPages.length >= 3) score += 8;
  if (extractedMedia.some((item) => item.usable === "yes")) score += 8;
  if (checks.hasTelLink || checks.hasMailtoLink) score += 5;
  score -= missingFields.length * 7;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildAttentionPoints(missingFields, checks, media) {
  const items = missingFields.map((field) => `${field} controleren`);
  if (!checks.usesHttps) items.push("Veilige verbinding controleren");
  if (!media.some((item) => item.usable === "yes")) items.push("Nieuwe beelden klaarzetten");
  return items.slice(0, 6);
}

function buildScanSummary({ checks, foundPages, extractedContactData, extractedMedia }) {
  return [
    checks.websiteReachable ? "Website bereikbaar" : "Website niet bereikbaar",
    `${foundPages.length} pagina's gevonden`,
    `${extractedContactData.phones.length + extractedContactData.emails.length} contactpunten`,
    `${extractedMedia.length} beelden`,
  ].join(" · ");
}

function uniqueMatches(value, pattern, limit = 8) {
  const items = [];
  let match;
  while ((match = pattern.exec(String(value || ""))) && items.length < limit) {
    const text = cleanExtractedText(match[0]);
    if (text && !items.includes(text)) items.push(text);
  }
  return items;
}

function extractPricingItems(html) {
  const source = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(li|p|h[1-4]|div|section|article|tr|br)\b[^>]*>/gi, "\n")
    .replace(/<\/(li|p|h[1-4]|div|section|article|tr)>/gi, "\n");
  const lines = stripHtml(source)
    .split(/\n+/)
    .map((line) => cleanExtractedText(line).slice(0, 180))
    .filter((line) => line.length >= 5);
  const pricePattern = /(?:vanaf\s*)?(?:€|\beur\b|\beuro\b)\s?\d{1,5}(?:[.,]\d{2})?(?:\s*(?:,-|p\/m|per maand|\/\s?(?:maand|mnd|uur|les|sessie|behandeling|jaar)))?|\d{1,5}(?:[.,]\d{2})?\s*(?:€|euro|eur)(?:\s*(?:p\/m|per maand|\/\s?(?:maand|mnd|uur|les|sessie|behandeling|jaar)))?/i;
  const ignorePattern = /\b(kvk|btw|iban|postcode|telefoon|tel\.?|06[-\s]?\d|whatsapp|copyright|202\d|19\d{2}|cookies?)\b/i;
  const items = [];
  const seen = new Set();

  lines.forEach((line, index) => {
    const priceMatch = line.match(pricePattern);
    if (!priceMatch || ignorePattern.test(line)) return;
    const context = [lines[index - 2], lines[index - 1], line, lines[index + 1]]
      .filter(Boolean)
      .join(" | ");
    const name = inferPricingName({ line, context, price: priceMatch[0] });
    const description = inferPricingDescription({ lines, index, name, price: priceMatch[0] });
    const key = `${name}|${priceMatch[0]}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      name,
      price: cleanExtractedText(priceMatch[0]),
      description,
      sourceText: context.slice(0, 260),
      confidence: /pakket|prijs|tarief|vanaf|per maand|p\/m|€/.test(context.toLowerCase()) ? "medium" : "low",
    });
  });

  return items.slice(0, 8);
}

function inferPricingName({ line, context, price }) {
  const withoutPrice = cleanExtractedText(line.replace(price, " ").replace(/\s{2,}/g, " "));
  const labelMatch = context.match(/(?:pakket|plan|abonnement|behandeling|dienst|les|sessie|consult|starter|basic|plus|pro|premium|gold|silver|bronze|business|growth)[^|€]{0,70}/i);
  const candidate = withoutPrice.length >= 3 && withoutPrice.length <= 70 ? withoutPrice : cleanExtractedText(labelMatch?.[0] || "");
  if (candidate) return titleCase(candidate.replace(/^(vanaf|prijs|tarief|kosten)\s+/i, ""));
  return "Pakket";
}

function inferPricingDescription({ lines, index, name, price }) {
  const candidates = [lines[index + 1], lines[index - 1]]
    .map((line) => cleanExtractedText(line))
    .filter((line) => line && line !== name && !line.includes(price));
  return (candidates[0] || "Prijs gevonden op de huidige website. Controleer deze voor publicatie.").slice(0, 150);
}

function extractTagTexts(html, pattern, limit = 8) {
  const items = [];
  let match;
  while ((match = pattern.exec(String(html || ""))) && items.length < limit) {
    const text = cleanExtractedText(match[2] || match[1]);
    if (text && !items.includes(text)) items.push(text);
  }
  return items;
}

function extractImageUrls(html, baseUrl = "") {
  const urls = [];
  const addUrl = (value) => {
    const url = absolutizeUrl(value, baseUrl);
    if (url && !urls.includes(url)) urls.push(url);
  };
  extractUrls(html, /<meta[^>]+(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi, 3).forEach(addUrl);
  extractUrls(html, /<img[^>]+src=["']([^"']+)["'][^>]*>/gi, 12).forEach(addUrl);
  extractUrls(html, /<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi, 6).forEach((srcset) => {
    const first = String(srcset || "").split(",")[0]?.trim().split(/\s+/)[0];
    addUrl(first);
  });
  return urls.filter((url) => !/data:image|placeholder|blank|spacer|tracking|pixel/i.test(url));
}

function extractUrls(html, pattern, limit = 8) {
  const items = [];
  let match;
  while ((match = pattern.exec(String(html || ""))) && items.length < limit) {
    const value = cleanExtractedText(match[1]);
    if (value && !items.includes(value)) items.push(value);
  }
  return items;
}

function absolutizeUrl(value = "", baseUrl = "") {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("data:")) return "";
  try {
    return new URL(raw, baseUrl || undefined).toString();
  } catch {
    return /^https?:\/\//i.test(raw) ? raw : "";
  }
}

function calculateScore(checks) {
  let score = 100;
  const penalties = [
    [!checks.websiteReachable, 25],
    [!checks.usesHttps, 10],
    [!checks.hasAcceptableResponse, 6],
    [!checks.hasReasonablePageSize, 4],
    [!checks.hasTitle, 6],
    [!checks.hasMetaDescription, 6],
    [!checks.hasH1, 6],
    [!checks.hasOpenGraph, 4],
    [!checks.hasFavicon, 3],
    [!checks.hasContactFormSignal, 8],
    [!checks.hasCtaSignal, 8],
    [!checks.hasTelLink, 4],
    [!checks.hasMailtoLink, 3],
    [!checks.hasWhatsAppSignal, 5],
    [!checks.hasPrivacySignal, 5],
    [!checks.hasCookieSignal, 5],
    [!checks.hasTermsSignal, 4],
    [!checks.hasKvkSignal, 3],
    [!checks.hasViewportMeta, 8],
    [!checks.hasMobileResponsiveSignal, 5],
    [!checks.robotsFound, 3],
    [!checks.sitemapFound, 3],
    [!(checks.hasFacebook || checks.hasInstagram || checks.hasLinkedIn || checks.hasYouTube), 4],
  ];
  penalties.forEach(([condition, penalty]) => {
    if (condition) score -= penalty;
  });
  return Math.max(0, Math.min(100, score));
}

function getScoreLabel(score) {
  if (score >= 90) return "Uitstekend";
  if (score >= 70) return "Redelijk";
  if (score >= 50) return "Goede verkoopkans";
  return "Hoge verkoopkans";
}

function buildImprovements(checks) {
  const items = [];
  if (!checks.usesHttps) items.push("Zorg dat de website veilig via HTTPS opent.");
  if (!checks.hasAcceptableResponse) items.push("Verbeter de eerste responstijd van de homepage.");
  if (!checks.hasReasonablePageSize) items.push("Maak de homepage lichter zodat hij sneller laadt.");
  if (!checks.hasTitle) items.push("Voeg een duidelijke SEO titel toe.");
  if (!checks.hasMetaDescription) items.push("Voeg een aantrekkelijke meta description toe.");
  if (!checks.hasH1) items.push("Maak de hoofdboodschap duidelijk met een H1-kop.");
  if (!checks.hasOpenGraph) items.push("Voeg Open Graph gegevens toe voor delen via social media.");
  if (!checks.hasFavicon) items.push("Voeg een herkenbaar favicon toe.");
  if (!checks.hasCtaSignal) items.push("Maak de belangrijkste call-to-action zichtbaarder.");
  if (!checks.hasContactFormSignal) items.push("Maak contact opnemen makkelijker met een formulier of duidelijke contactknop.");
  if (!checks.hasTelLink && !checks.hasMailtoLink) items.push("Maak telefoon en e-mail direct klikbaar.");
  if (!checks.hasWhatsAppSignal) items.push("Voeg laagdrempelig WhatsApp-contact toe als dat past bij het bedrijf.");
  if (!checks.hasMobileResponsiveSignal) items.push("Controleer of mobiele bezoekers een goede ervaring krijgen.");
  if (!checks.hasPrivacySignal || !checks.hasCookieSignal || !checks.hasTermsSignal) items.push("Maak privacy-, cookie- en voorwaardeninformatie duidelijk zichtbaar.");
  if (!checks.robotsFound || !checks.sitemapFound) items.push("Maak robots.txt en sitemap.xml bereikbaar voor zoekmachines.");
  return items.length ? items : ["De homepage bevat de belangrijkste basis-signalen. Controleer visueel of de uitstraling nog actueel is."];
}

function buildSalesOpportunities(checks) {
  const items = [];
  if (!checks.usesHttps) items.push("Bezoekers kunnen afhaken door een onveilig gevoel.");
  if (!checks.hasAcceptableResponse) items.push("Een trage eerste reactie kan aanvragen kosten.");
  if (!checks.hasMetaDescription) items.push("Het Google-resultaat kan minder aantrekkelijk zijn.");
  if (!checks.hasH1) items.push("De pagina mist mogelijk een duidelijke hoofdboodschap.");
  if (!checks.hasCtaSignal) items.push("Bezoekers weten mogelijk niet wat de volgende stap is.");
  if (!checks.hasTelLink && !checks.hasMailtoLink) items.push("Contact opnemen kost extra moeite.");
  if (!checks.hasWhatsAppSignal) items.push("Laagdrempelig contact via mobiel ontbreekt.");
  if (!checks.hasPrivacySignal || !checks.hasCookieSignal || !checks.hasTermsSignal) items.push("De website oogt minder professioneel en mogelijk minder AVG-proof.");
  if (!checks.hasMobileResponsiveSignal) items.push("Mobiele bezoekers kunnen afhaken.");
  if (!checks.hasFacebook && !checks.hasInstagram && !checks.hasLinkedIn && !checks.hasYouTube) items.push("Social proof en actuele kanalen zijn niet direct zichtbaar.");
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

function titleCase(value = "") {
  return cleanExtractedText(value).replace(/\b([a-zà-ÿ])/gi, (match) => match.toUpperCase());
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
      ...corsHeaders({ headers: "Content-Type", methods: "POST, OPTIONS" }),
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
