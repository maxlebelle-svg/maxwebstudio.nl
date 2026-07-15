"use strict";

const NO_WEBSITE_VALUES = new Set([
  "geen website",
  "geen bestaande website",
  "no website",
  "n.v.t.",
  "nvt",
  "-",
]);

function normalizeWebsiteInput(value = "", options = {}) {
  const raw = String(value || "").trim();
  const intent = String(options.intent || "").trim().toLowerCase();
  const explicitNoWebsite = Boolean(options.explicitNoWebsite)
    || intent === "none"
    || NO_WEBSITE_VALUES.has(raw.toLowerCase());

  if (!raw || explicitNoWebsite) {
    return {
      url: "",
      kind: "none",
      shouldScan: false,
      warning: "",
      fallbackAllowed: true,
    };
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : intent === "existing"
      ? `https://${raw}`
      : "";
  if (!candidate) return invalidWebsiteInput();

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const validHostname = hostname.includes(".")
      && !hostname.startsWith(".")
      && !hostname.endsWith(".")
      && hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !validHostname) {
      return invalidWebsiteInput();
    }
    parsed.hash = "";
    return {
      url: parsed.toString().replace(/\/$/, ""),
      kind: "website",
      shouldScan: true,
      warning: "",
      fallbackAllowed: true,
    };
  } catch {
    return invalidWebsiteInput();
  }
}

function invalidWebsiteInput() {
  return {
    url: "",
    kind: "invalid",
    shouldScan: false,
    warning: "De website-URL is ongeldig; de demo wordt zonder websitescan gemaakt.",
    fallbackAllowed: true,
  };
}

module.exports = { normalizeWebsiteInput };
