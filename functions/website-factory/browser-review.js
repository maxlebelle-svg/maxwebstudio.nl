"use strict";

const BROWSER_REVIEW_SCHEMA_VERSION = "mws.browser-review.v1";
const REQUIRED_VIEWPORTS = Object.freeze(["mobile", "tablet", "desktop"]);
const REQUIRED_CHECKS = Object.freeze(["layout", "overflow", "typography", "interaction", "console", "forms", "visual_rubric"]);
const CRITICAL_CHECKS = new Set(["layout", "overflow", "interaction", "console", "forms"]);
const MINIMUM_VISUAL_SCORE = 80;

function evaluateBrowserReview({ staticReport = {}, evidence = {} } = {}) {
  const normalized = normalizeEvidence(evidence);
  const blockers = [];
  if (normalized.schemaVersion !== BROWSER_REVIEW_SCHEMA_VERSION) {
    blockers.push(blocker("browser_review_schema", "Browser-review gebruikt niet het ondersteunde bewijscontract.", "schema_invalid"));
  }
  if (!normalized.artifactHash) {
    blockers.push(blocker("artifact_identity", "Het gecontroleerde websitepakket heeft geen artifact-hash.", "artifact_hash_missing"));
  }
  if (!normalized.reviewedAt) blockers.push(blocker("review_timestamp", "Browser-review mist een geldige controletijd.", "reviewed_at_missing"));
  if (!normalized.provider) blockers.push(blocker("review_provider", "Browser-review mist de uitvoerende provider.", "provider_missing"));

  const viewports = Object.fromEntries(REQUIRED_VIEWPORTS.map((viewport) => {
    const result = evaluateViewport(viewport, normalized.viewports[viewport]);
    blockers.push(...result.blockers);
    return [viewport, result.summary];
  }));
  const visualScores = Object.values(viewports).map((item) => item.visualScore).filter(Number.isFinite);
  const visualScore = visualScores.length === REQUIRED_VIEWPORTS.length
    ? Math.round(visualScores.reduce((sum, value) => sum + value, 0) / visualScores.length)
    : 0;
  if (visualScore < MINIMUM_VISUAL_SCORE) {
    blockers.push(blocker("visual_score", `De gemiddelde visuele score is ${visualScore}; minimaal ${MINIMUM_VISUAL_SCORE} is vereist.`, "visual_score_below_threshold"));
  }
  if (staticReport.passed !== true) {
    blockers.push(blocker("static_quality_gate", "De statische Quality Gate is niet geslaagd.", "static_quality_failed"));
  }
  const passed = blockers.length === 0;

  return {
    schemaVersion: BROWSER_REVIEW_SCHEMA_VERSION,
    stage: "browser_visual_review",
    artifactHash: normalized.artifactHash,
    reviewedAt: normalized.reviewedAt,
    provider: normalized.provider,
    score: visualScore,
    passed,
    status: passed ? "passed" : "failed",
    summary: passed
      ? "Browser- en visuele controle geslaagd op mobiel, tablet en desktop."
      : "Browser- en visuele controle blokkeert publicatie naar de klant.",
    thresholds: { visualScore: MINIMUM_VISUAL_SCORE },
    requiredViewports: [...REQUIRED_VIEWPORTS],
    requiredChecks: [...REQUIRED_CHECKS],
    viewports,
    blockers: uniqueBlockers(blockers),
    readiness: {
      internalPreview: staticReport.passed === true,
      customerPreview: passed,
      reason: passed ? "quality_gates_passed" : "browser_review_failed",
    },
  };
}

function normalizeEvidence(evidence = {}) {
  const source = object(evidence);
  const viewportSource = object(source.viewports);
  return {
    schemaVersion: clean(source.schemaVersion),
    artifactHash: /^[0-9a-f]{64}$/i.test(clean(source.artifactHash)) ? clean(source.artifactHash).toLowerCase() : "",
    reviewedAt: validIso(source.reviewedAt),
    provider: clean(source.provider),
    viewports: Object.fromEntries(REQUIRED_VIEWPORTS.map((key) => [key, normalizeViewport(viewportSource[key])])),
  };
}

function normalizeViewport(value) {
  const source = object(value);
  const checks = object(source.checks);
  return {
    width: positiveInteger(source.width),
    height: positiveInteger(source.height),
    screenshotRef: clean(source.screenshotRef),
    visualScore: boundedScore(source.visualScore),
    checks: Object.fromEntries(REQUIRED_CHECKS.map((key) => [key, normalizeCheck(checks[key])])),
  };
}

function normalizeCheck(value) {
  const source = typeof value === "string" ? { status: value } : object(value);
  const status = ["passed", "failed"].includes(clean(source.status)) ? clean(source.status) : "missing";
  return { status, details: clean(source.details).slice(0, 500) };
}

function evaluateViewport(key, viewport) {
  const blockers = [];
  if (!viewport.width || !viewport.height) blockers.push(blocker(`${key}_dimensions`, `${key} mist geldige viewportafmetingen.`, "viewport_dimensions_missing"));
  if (!viewport.screenshotRef) blockers.push(blocker(`${key}_screenshot`, `${key} mist screenshotbewijs.`, "screenshot_missing"));
  if (!Number.isFinite(viewport.visualScore)) blockers.push(blocker(`${key}_visual_score`, `${key} mist een visuele score.`, "visual_score_missing"));
  for (const checkId of REQUIRED_CHECKS) {
    const check = viewport.checks[checkId];
    if (check.status === "missing") blockers.push(blocker(`${key}_${checkId}`, `${key}: controle ${checkId} ontbreekt.`, "browser_check_missing"));
    if (check.status === "failed") blockers.push(blocker(
      `${key}_${checkId}`,
      `${key}: ${CRITICAL_CHECKS.has(checkId) ? "kritieke " : ""}controle ${checkId} is afgekeurd.`,
      CRITICAL_CHECKS.has(checkId) ? "critical_browser_check_failed" : "browser_check_failed",
    ));
  }
  const failedChecks = REQUIRED_CHECKS.filter((checkId) => viewport.checks[checkId].status === "failed");
  return {
    blockers,
    summary: {
      width: viewport.width,
      height: viewport.height,
      screenshotRef: viewport.screenshotRef,
      visualScore: viewport.visualScore,
      passed: blockers.length === 0 && failedChecks.length === 0 && viewport.visualScore >= MINIMUM_VISUAL_SCORE,
      failedChecks,
      checks: viewport.checks,
    },
  };
}

function blocker(id, message, reason) {
  return { id, message, reason };
}

function uniqueBlockers(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clean(value) { return String(value || "").trim(); }
function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : 0; }
function boundedScore(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 && number <= 100 ? Math.round(number) : null; }
function validIso(value) { const text = clean(value); return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : ""; }

module.exports = {
  BROWSER_REVIEW_SCHEMA_VERSION,
  MINIMUM_VISUAL_SCORE,
  REQUIRED_CHECKS,
  REQUIRED_VIEWPORTS,
  evaluateBrowserReview,
  normalizeEvidence,
};
