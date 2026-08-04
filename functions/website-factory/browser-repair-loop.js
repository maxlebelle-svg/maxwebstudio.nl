"use strict";

const { createHash } = require("crypto");
const { evaluateBrowserReview } = require("./browser-review");

const MAX_BROWSER_REPAIR_ATTEMPTS = 2;
const REPAIR_STYLE_MARKER = "/* mws-browser-repair-v1 */";

function artifactHashForPackage(generatedPackage = {}) {
  return createHash("sha256").update(JSON.stringify(generatedPackage || {})).digest("hex");
}

function processBrowserReview({ staticReport = {}, evidence = {}, generatedPackage = {}, previousQualityReport = {}, expectedArtifactHash = "" } = {}) {
  const trustedArtifactHash = /^[0-9a-f]{64}$/i.test(String(expectedArtifactHash || ""))
    ? String(expectedArtifactHash).toLowerCase()
    : artifactHashForPackage(generatedPackage);
  const report = evaluateBrowserReview({ staticReport, evidence });
  if (report.artifactHash !== trustedArtifactHash) {
    report.blockers.push({
      id: "artifact_hash_mismatch",
      reason: "artifact_hash_mismatch",
      message: "Het browserbewijs hoort niet bij de actuele websitebuild.",
    });
    report.passed = false;
    report.status = "failed";
    report.summary = "Browser-review blokkeert publicatie: de gecontroleerde build is niet de actuele build.";
    report.readiness = { internalPreview: staticReport.passed === true, customerPreview: false, reason: "artifact_hash_mismatch" };
  }

  const previousAttempts = Math.max(0, Number(previousQualityReport?.browserRepair?.attempts || 0));
  const attempts = report.passed ? previousAttempts : previousAttempts + 1;
  const repairPlan = report.passed ? [] : buildRepairPlan(report.blockers, report);
  const retryAvailable = !report.passed && attempts <= MAX_BROWSER_REPAIR_ATTEMPTS;
  const browserRepair = {
    version: "mws.browser-repair.v1",
    attempts,
    maximumAttempts: MAX_BROWSER_REPAIR_ATTEMPTS,
    status: report.passed ? "passed" : retryAvailable ? "repair_required" : "manual_review_required",
    retryAvailable,
    repairPlan,
    lastReviewedAt: report.reviewedAt,
    artifactHash: trustedArtifactHash,
  };
  return {
    report,
    browserRepair,
    qualityReport: {
      ...staticReport,
      browserReview: report,
      browserRepair,
      readiness: report.readiness,
    },
  };
}

function buildRepairPlan(blockers = [], report = {}) {
  const plan = [];
  const ids = new Set(blockers.map((item) => String(item?.id || "")));
  const missingAssets = Object.values(report?.viewports || {}).some((viewport) => {
    const details = String(viewport?.checks?.layout?.details || "");
    return /\b[1-9]\d*\s+ontbrekende afbeeldingen\b/i.test(details);
  });
  if (missingAssets) {
    return [{ id: "asset_repair", automatic: false, message: "Ontbrekende afbeeldingen vereisen herstel van de website-assets." }];
  }
  if ([...ids].some((id) => /_(?:layout|overflow)$/.test(id))) {
    plan.push({ id: "responsive_safety", automatic: true, message: "Beperk brede elementen en herstel mobiel/tablet rastergedrag." });
  }
  if ([...ids].some((id) => /_typography$/.test(id))) {
    plan.push({ id: "typography_safety", automatic: true, message: "Herstel tekstafbreking en veilige minimale lettergroottes." });
  }
  if ([...ids].some((id) => /_forms$/.test(id))) {
    plan.push({ id: "form_accessibility", automatic: true, message: "Voeg ontbrekende toegankelijke veldnamen toe." });
  }
  if ([...ids].some((id) => /_(?:interaction|console)$/.test(id))) {
    plan.push({ id: "runtime_repair", automatic: false, message: "Interactie- of scriptfout vereist een gerichte code-reparatie." });
  }
  if (!plan.length) plan.push({ id: "visual_revision", automatic: false, message: "Visuele beoordeling vereist een gerichte ontwerpaanpassing." });
  return plan;
}

function applyAutomaticBrowserRepairs({ generatedPackage = {}, browserRepair = {} } = {}) {
  const automaticIds = new Set((browserRepair.repairPlan || []).filter((item) => item.automatic).map((item) => item.id));
  if (!automaticIds.size) return { generatedPackage, changed: false, applied: [] };
  const repaired = JSON.parse(JSON.stringify(generatedPackage || {}));
  const files = Array.isArray(repaired.files) ? repaired.files : [];
  const applied = [];

  const cssFile = files.find((file) => /(?:^|\/)styles\.css$/i.test(String(file?.path || "")))
    || files.find((file) => /\.css$/i.test(String(file?.path || "")));
  if (cssFile && !String(cssFile.content || "").includes(REPAIR_STYLE_MARKER)
      && (automaticIds.has("responsive_safety") || automaticIds.has("typography_safety"))) {
    cssFile.content = `${String(cssFile.content || "").trim()}\n\n${browserRepairCss()}\n`;
    if (automaticIds.has("responsive_safety")) applied.push("responsive_safety");
    if (automaticIds.has("typography_safety")) applied.push("typography_safety");
  }

  if (automaticIds.has("form_accessibility")) {
    for (const file of files.filter((item) => /\.html?$/i.test(String(item?.path || "")))) {
      const before = String(file.content || "");
      file.content = addFallbackFormLabels(before);
      if (file.content !== before && !applied.includes("form_accessibility")) applied.push("form_accessibility");
    }
  }

  if (!applied.length) return { generatedPackage, changed: false, applied: [] };
  repaired.meta = {
    ...(repaired.meta || {}),
    browserRepair: {
      version: "mws.browser-repair.v1",
      attempt: Number(browserRepair.attempts || 1),
      applied,
      repairedAt: new Date().toISOString(),
    },
  };
  return { generatedPackage: repaired, changed: true, applied };
}

function addFallbackFormLabels(html = "") {
  return String(html).replace(/<(input|select|textarea)\b([^>]*)>/gi, (match, tag, attributes) => {
    if (/\b(?:aria-label|aria-labelledby)\s*=/i.test(attributes)) return match;
    if (tag.toLowerCase() === "input" && /\btype\s*=\s*["']?(?:hidden|submit|button|reset|image)["']?/i.test(attributes)) return match;
    const name = attributes.match(/\b(?:name|id)\s*=\s*["']([^"']+)["']/i)?.[1] || "veld";
    const label = humanizeFieldName(name);
    return `<${tag}${attributes} aria-label="${escapeAttribute(label)}">`;
  });
}

function humanizeFieldName(value = "") {
  const text = String(value || "veld").replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Veld";
}

function escapeAttribute(value = "") {
  return String(value).replace(/[&"<>]/g, (character) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[character]);
}

function browserRepairCss() {
  return `${REPAIR_STYLE_MARKER}
html,body{max-width:100%;overflow-x:hidden}
img,svg,video,canvas,iframe{max-width:100%}
img,video{height:auto}
body *{min-width:0}
h1,h2,h3,p,a,button,label,li{overflow-wrap:anywhere}
input,select,textarea,button{max-width:100%;font:inherit}
.social-links a{font-size:12px!important}
@media(max-width:820px){
  .container,.section-shell,.hero-inner,.contact-grid,.review-grid,.gallery-grid{width:min(100%,calc(100% - 32px));max-width:100%}
  .hero-inner,.contact-grid,.review-grid,.gallery-grid{grid-template-columns:minmax(0,1fr)!important}
}
@media(max-width:480px){body{font-size:max(16px,1rem)}button,.button,.btn,[class*="cta"]{white-space:normal}}
`;
}

module.exports = {
  MAX_BROWSER_REPAIR_ATTEMPTS,
  REPAIR_STYLE_MARKER,
  applyAutomaticBrowserRepairs,
  artifactHashForPackage,
  buildRepairPlan,
  processBrowserReview,
};
