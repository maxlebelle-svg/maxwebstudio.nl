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
  const researchPackage = buildResearchPackage({
    html: combinedHtml,
    currentWebsite,
    contactData: extractedContactData,
    media: extractedMedia,
    foundPages,
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
  const qualityScore = buildWebsiteQualityScore({ checks, score, aiBriefing, extractedMedia, foundPages, contactData: extractedContactData, researchPackage });
  const premiumAdvisor = buildPremiumAdvisor({ qualityScore, aiBriefing, checks, extractedMedia, foundPages, contactData: extractedContactData, researchPackage });
  const autoBuildPlan = buildAutoBuildPlan({ aiBriefing, qualityScore, premiumAdvisor, extractedMedia, foundPages, checks });
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
    qualityScore,
    premiumAdvisor,
    autoBuildPlan,
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
    researchPackage,
    websiteIntelligence,
    extractedContactData,
    extractedMedia,
    aiBriefing,
    qualityScore,
    premiumAdvisor,
    autoBuildPlan,
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

function buildResearchPackage({ html, currentWebsite, contactData, media, foundPages, finalUrl }) {
  const text = stripHtml(html).toLowerCase();
  const faqItems = extractFaqItems(html);
  const reviewSignals = extractReviewSignals(html);
  const postSignals = extractPostSignals(html);
  const competitorBenchmark = buildCompetitorBenchmark({ text, currentWebsite, foundPages, media, reviewSignals });
  const sourceStatus = [
    { source: "Website", status: "gevonden", confidence: 95, note: `${foundPages.length || 1} publieke pagina's verwerkt.` },
    { source: "Google Bedrijfsprofiel", status: reviewSignals.length ? "signalen gevonden" : "niet gekoppeld", confidence: reviewSignals.length ? 55 : 0, note: reviewSignals.length ? "Review-signalen op de website gevonden." : "Geen live Google-koppeling in deze scan." },
    { source: "Reviews", status: reviewSignals.length ? "gevonden" : "controle nodig", confidence: reviewSignals.length ? 70 : 20, note: reviewSignals.length ? `${reviewSignals.length} review/vermelding-signalen.` : "Plaats reviews hoger als ze extern beschikbaar zijn." },
    { source: "Social media", status: contactData.socialUrls?.length ? "gevonden" : "mist nog", confidence: contactData.socialUrls?.length ? 75 : 20, note: contactData.socialUrls?.length ? contactData.socialUrls.slice(0, 3).join(", ") : "Geen social links op de website gevonden." },
    { source: "KVK", status: "niet opgehaald", confidence: 0, note: "Alleen verwerken via toegestane publieke of gekoppelde bron." },
    { source: "Contactgegevens", status: contactData.phones?.length || contactData.emails?.length ? "gevonden" : "mist nog", confidence: contactData.phones?.length || contactData.emails?.length ? 80 : 15, note: `${contactData.phones?.length || 0} telefoons, ${contactData.emails?.length || 0} e-mails.` },
    { source: "Openingstijden", status: contactData.openingHours?.length ? "gevonden" : "controle nodig", confidence: contactData.openingHours?.length ? 65 : 10, note: contactData.openingHours?.length ? contactData.openingHours.slice(0, 2).join(" · ") : "Geen duidelijke openingstijden gevonden." },
    { source: "Foto's en logo", status: media.length ? "gevonden" : "mist nog", confidence: media.length ? 70 : 10, note: `${media.length} beelden/logo's beoordeeld.` },
    { source: "FAQ", status: faqItems.length ? "gevonden" : "aanbevolen", confidence: faqItems.length ? 75 : 20, note: faqItems.length ? `${faqItems.length} vragen gevonden.` : "FAQ kan twijfels wegnemen en SEO versterken." },
    { source: "Nieuws/berichten", status: postSignals.length ? "gevonden" : "geen signalen", confidence: postSignals.length ? 55 : 10, note: postSignals.length ? `${postSignals.length} actuele signalen gevonden.` : "Geen recente berichten op de website herkend." },
    { source: "Concurrentie", status: "benchmark", confidence: 45, note: competitorBenchmark.summary },
  ];
  return {
    sourceUrl: cleanExtractedText(finalUrl),
    sourceStatus,
    publicSignals: {
      faqItems,
      reviewSignals,
      postSignals,
      socialUrls: contactData.socialUrls || [],
      contactCompleteness: contactData.phones?.length || contactData.emails?.length ? "voldoende" : "laag",
      structuredData: extractStructuredDataTypes(html),
    },
    competitorBenchmark,
    insights: buildResearchInsights({ text, currentWebsite, contactData, media, foundPages, faqItems, reviewSignals, competitorBenchmark }),
    collectedAt: new Date().toISOString(),
  };
}

function buildWebsiteQualityScore({ checks, score, aiBriefing, extractedMedia, foundPages, contactData, researchPackage }) {
  const usableMedia = extractedMedia.filter((item) => item.usable === "yes").length;
  const hasTrust = Boolean(contactData.phones?.length || contactData.emails?.length || researchPackage.publicSignals.reviewSignals.length);
  const pageDepth = foundPages.length;
  const scores = {
    design: clampQualityScore(55 + usableMedia * 7 + (checks.hasOpenGraph ? 8 : 0) + (checks.hasFavicon ? 6 : 0)),
    conversion: clampQualityScore(45 + (checks.hasCtaSignal ? 20 : 0) + (checks.hasContactFormSignal ? 15 : 0) + (checks.hasTelLink ? 8 : 0) + (checks.hasWhatsAppSignal ? 7 : 0)),
    seo: clampQualityScore(42 + (checks.hasTitle ? 12 : 0) + (checks.hasMetaDescription ? 12 : 0) + (checks.hasH1 ? 10 : 0) + (checks.sitemapFound ? 8 : 0) + Math.min(10, pageDepth * 2)),
    mobile: clampQualityScore(50 + (checks.hasViewportMeta ? 25 : 0) + (checks.hasMobileResponsiveSignal ? 20 : 0)),
    speed: clampQualityScore(checks.hasFastResponse ? 88 : checks.hasAcceptableResponse ? 72 : 48),
    trust: clampQualityScore(38 + (hasTrust ? 20 : 0) + (researchPackage.publicSignals.reviewSignals.length ? 15 : 0) + (checks.hasPrivacySignal ? 8 : 0) + (checks.hasKvkSignal ? 8 : 0) + (checks.hasSocialLinksSignal ? 6 : 0)),
    professionalism: clampQualityScore(Math.round((Number(score || 0) + (aiBriefing.services?.length ? 78 : 55) + (contactData.addresses?.length ? 78 : 58)) / 3)),
  };
  const overall = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.values(scores).length);
  return {
    ...scores,
    overall,
    label: overall >= 85 ? "Sterk" : overall >= 70 ? "Goed" : overall >= 55 ? "Kansrijk" : "Veel winst te halen",
  };
}

function buildPremiumAdvisor({ qualityScore, aiBriefing, checks, extractedMedia, foundPages, contactData, researchPackage }) {
  const recommendations = [];
  if (qualityScore.conversion < 75) recommendations.push("Maak de hero concreter met één hoofd-CTA en herhaal contactmomenten lager op de pagina.");
  if (qualityScore.trust < 75) recommendations.push("Plaats reviews, projecten, keurmerken en contactgegevens hoger voor meer vertrouwen.");
  if (qualityScore.seo < 70) recommendations.push("Versterk SEO met duidelijke H1, lokale zoekwoorden, dienstenpagina's en FAQ-blokken.");
  if (qualityScore.design < 75) recommendations.push("Moderniseer beeld, witruimte, iconen en kleurgebruik zodat het bedrijf direct professioneler voelt.");
  if (!checks.hasWhatsAppSignal) recommendations.push("Voeg WhatsApp of een laagdrempelige contactknop toe als dit bij de branche past.");
  if (!extractedMedia.some((item) => item.usable === "yes")) recommendations.push("Vervang zwakke beelden door eigen fotografie of premium branchebeelden.");
  if (foundPages.length < 4) recommendations.push("Breid de sitestructuur uit met diensten, werkwijze, projecten/reviews en contact.");
  const insights = researchPackage.insights || [];
  return {
    verdict: qualityScore.overall >= 80
      ? "De basis is sterk, maar conversie en bewijsvoering kunnen scherper."
      : "Er ligt duidelijke winst in vertrouwen, structuur en conversie.",
    executiveSummary: [
      `${aiBriefing.industry || "Dit bedrijf"} heeft genoeg basisinformatie voor een sterke preview.`,
      qualityScore.trust < 70 ? "De huidige presentatie geeft nog te weinig bewijs waarom bezoekers direct moeten vertrouwen." : "De vertrouwensbasis is aanwezig en kan visueel sterker worden gemaakt.",
      qualityScore.conversion < 70 ? "De volgende stap voor bezoekers mag duidelijker en vaker terugkomen." : "De conversierichting is bruikbaar voor de eerste preview.",
    ].join(" "),
    recommendations: [...new Set([...recommendations, ...insights])].slice(0, 10),
    commercialAngle: `Positioneer de nieuwe website als een professionelere, duidelijkere versie die sneller vertrouwen opbouwt en meer ${ensureArray(aiBriefing.ctas)[0]?.toLowerCase() || "aanvragen"} oplevert.`,
    competitorObservation: researchPackage.competitorBenchmark.summary,
  };
}

function buildAutoBuildPlan({ aiBriefing, qualityScore, premiumAdvisor, extractedMedia, foundPages, checks }) {
  const services = ensureArray(aiBriefing.services).slice(0, 6);
  const pages = [
    { title: "Home", goal: "Binnen 5 seconden duidelijk maken wat het bedrijf doet en waarom bezoekers kunnen vertrouwen.", sections: ["Hero", "Bewijsbalk", "Diensten", "Werkwijze", "Projecten/reviews", "Contact CTA"] },
    { title: "Diensten", goal: "Aanbod scanbaar maken met concrete voordelen en CTA per dienst.", sections: services.length ? services : ["Belangrijkste diensten", "Werkwijze", "Veelgestelde vragen"] },
    { title: "Over ons", goal: "Vertrouwen en persoonlijkheid toevoegen.", sections: ["Intro", "Team/aanpak", "Kwaliteit", "Waarom kiezen voor ons"] },
    { title: "Projecten/reviews", goal: "Bewijs tonen dat concurrenten vaak wel laten zien.", sections: ["Projectkaarten", "Reviewblok", "Voor/na of resultaten"] },
    { title: "Contact", goal: "Drempel naar aanvraag zo laag mogelijk maken.", sections: ["Formulier", "Telefoon", "Openingstijden", "Werkgebied"] },
  ];
  const wireframe = [
    "Sticky header met logo, diensten, werkwijze en primaire CTA",
    "Hero met concrete belofte, korte bewijsregel en twee acties",
    "Score/bewijsbalk met reviews, ervaring, regio of garanties",
    "Dienstenraster met iconen en korte resultaatgerichte teksten",
    "Werkwijze in 3 stappen",
    "Projecten/reviews voor vertrouwen",
    "FAQ voor bezwaren en SEO",
    "Contactblok met telefoon, formulier en werkgebied",
  ];
  return {
    readiness: qualityScore.overall >= 70 && checks.websiteReachable ? "Ik weet genoeg" : "Nog enkele controles nodig",
    sitemap: pages,
    wireframe,
    copyDirection: {
      hero: aiBriefing.recommendedHero,
      tone: aiBriefing.tone,
      trust: premiumAdvisor.commercialAngle,
      seoKeywords: aiBriefing.seoKeywords || [],
    },
    visualDirection: {
      colors: qualityScore.design >= 75 ? "Gebruik bestaande merkbasis en maak contrast/CTA sterker." : "Maak een frissere premium kleurset met duidelijke CTA-kleur.",
      images: extractedMedia.some((item) => item.usable === "yes") ? "Gebruik bestaande bruikbare beelden en vul aan per dienst." : "Gebruik premium branchebeelden of genereer passende sectiebeelden.",
      icons: "Gebruik eenvoudige lijniconen per dienst en voordeel.",
    },
    buildActions: [
      "Sitemap klaarzetten",
      "Wireframe per sectie opbouwen",
      "Copywriting schrijven vanuit briefing en advisor",
      "SEO titels en lokale keywords verwerken",
      "Beeldplan koppelen aan hero, diensten en vertrouwen",
      "Preview genereren en quality check uitvoeren",
    ],
  };
}

function buildCompetitorBenchmark({ text, currentWebsite, foundPages, media, reviewSignals }) {
  const gaps = [];
  if (foundPages.length < 4) gaps.push("meer aparte pagina's voor diensten en bewijs");
  if (!reviewSignals.length) gaps.push("zichtbaardere reviews");
  if (!media.some((item) => item.usable === "yes")) gaps.push("sterker eigen beeldmateriaal");
  if (!/project|portfolio|cases|werk/.test(text)) gaps.push("projecten of voorbeelden");
  if (!/faq|veelgestelde/.test(text)) gaps.push("FAQ voor bezwaren en SEO");
  return {
    level: gaps.length <= 1 ? "sterk" : gaps.length <= 3 ? "gemiddeld" : "achterstand",
    summary: gaps.length
      ? `Concurrenten in deze branche tonen vaak ${gaps.slice(0, 3).join(", ")} duidelijker.`
      : "De website bevat al meerdere signalen die concurrenten normaal gebruiken.",
    gaps,
    referenceBasis: cleanExtractedText(currentWebsite.title || currentWebsite.h1 || "Publieke websitesignalen"),
  };
}

function buildResearchInsights({ text, contactData, media, foundPages, faqItems, reviewSignals, competitorBenchmark }) {
  const insights = [];
  if (!contactData.phones?.length) insights.push("Telefoonnummer directer tonen voor snelle aanvragen.");
  if (!reviewSignals.length) insights.push("Reviews hoger plaatsen om vertrouwen sneller op te bouwen.");
  if (!faqItems.length) insights.push("FAQ toevoegen om twijfels en SEO-vragen af te vangen.");
  if (!media.some((item) => item.usable === "yes")) insights.push("Teamfoto, projectfoto of sterke hero-afbeelding verbeteren.");
  if (foundPages.length < 4) insights.push("Sitemap uitbreiden zodat bezoekers aanbod en bewijs sneller vinden.");
  if (/welkom|home|klik hier/.test(text)) insights.push("Algemene teksten vervangen door concrete klantvoordelen.");
  if (competitorBenchmark.gaps?.length) insights.push(competitorBenchmark.summary);
  return [...new Set(insights)].slice(0, 8);
}

function extractFaqItems(html) {
  const raw = String(html || "");
  const questions = uniqueMatches(stripHtml(raw), /(?:wie|wat|waar|wanneer|waarom|hoe|kan|kost|zijn|is|hebben|moet)[^?.!]{12,110}\?/gi, 10);
  if (/faq|veelgestelde vragen/i.test(raw) && !questions.length) return ["FAQ-sectie gevonden, vragen handmatig controleren."];
  return questions;
}

function extractReviewSignals(html) {
  const text = stripHtml(html);
  const signals = [];
  uniqueMatches(text, /\b(?:review|reviews|beoordeling|beoordelingen|klanten vertellen|ervaringen|tevreden klanten)\b.{0,90}/gi, 8).forEach((item) => signals.push(item));
  uniqueMatches(text, /\b[1-5][,.][0-9]\s*(?:\/\s*5|sterren|stars)?\b/gi, 4).forEach((item) => signals.push(`Score-signaal: ${item}`));
  return [...new Set(signals)].slice(0, 8);
}

function extractPostSignals(html) {
  const text = stripHtml(html);
  return uniqueMatches(text, /\b(?:nieuws|blog|update|bericht|laatste|recent)\b.{0,120}/gi, 8);
}

function extractStructuredDataTypes(html) {
  const types = [];
  const raw = String(html || "");
  let match;
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = pattern.exec(raw)) && types.length < 8) {
    try {
      const data = JSON.parse(match[1].trim());
      ensureArray(data).forEach((item) => {
        const type = cleanExtractedText(item?.["@type"] || item?.type || "");
        if (type && !types.includes(type)) types.push(type);
      });
    } catch {
      if (!types.includes("Structured data aanwezig")) types.push("Structured data aanwezig");
    }
  }
  return types;
}

function clampQualityScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
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
