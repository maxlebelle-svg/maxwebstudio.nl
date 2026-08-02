"use strict";

const QUALITY_GATE_VERSION = 2;
const MINIMUM_TOTAL_SCORE = 80;
const MINIMUM_CATEGORY_SCORE = 65;
const CATEGORY_DEFINITIONS = Object.freeze({
  technical: Object.freeze({ label: "Techniek", required: true }),
  content: Object.freeze({ label: "Content", required: true }),
  conversion: Object.freeze({ label: "Conversie", required: true }),
  visualFoundation: Object.freeze({ label: "Visuele basis", required: true }),
});

function summarizeQualityGate({ checks = [], renderValidation = {} } = {}) {
  const normalizedChecks = checks.map(normalizeCheck);
  const maxScore = normalizedChecks.reduce((sum, item) => sum + item.weight, 0);
  const earnedScore = normalizedChecks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
  const score = maxScore ? Math.round((earnedScore / maxScore) * 100) : 0;
  const categories = Object.fromEntries(Object.entries(CATEGORY_DEFINITIONS).map(([key, definition]) => {
    const categoryChecks = normalizedChecks.filter((item) => item.category === key);
    const maximum = categoryChecks.reduce((sum, item) => sum + item.weight, 0);
    const earned = categoryChecks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
    const categoryScore = maximum ? Math.round((earned / maximum) * 100) : 0;
    return [key, {
      key,
      label: definition.label,
      required: definition.required,
      score: categoryScore,
      passed: !definition.required || categoryScore >= MINIMUM_CATEGORY_SCORE,
      failedCheckIds: categoryChecks.filter((item) => !item.passed).map((item) => item.id),
    }];
  }));
  const blockingChecks = normalizedChecks
    .filter((item) => item.critical && !item.passed)
    .map((item) => ({ id: item.id, label: item.label, reason: "critical_check_failed" }));
  if (renderValidation.passed !== true) {
    blockingChecks.push({
      id: "render_package_complete",
      label: "Websitepakket volledig renderbaar",
      reason: "render_validation_failed",
      missing: Array.isArray(renderValidation.missing) ? [...renderValidation.missing] : [],
    });
  }
  const failedCategories = Object.values(categories).filter((category) => !category.passed).map((category) => category.key);
  const passed = score >= MINIMUM_TOTAL_SCORE && blockingChecks.length === 0 && failedCategories.length === 0;

  return {
    version: QUALITY_GATE_VERSION,
    rubric: "max-webstudio-website-quality-v2",
    stage: "static_preflight",
    score,
    passed,
    status: passed ? "completed" : "quality_failed",
    summary: passed
      ? "Statische kwaliteitscontrole geslaagd; browser- en visuele controle is de volgende stap."
      : blockingChecks.length
        ? "Preview is geblokkeerd door een kritieke kwaliteitsfout."
        : "Preview voldoet nog niet aan de minimale kwaliteit per categorie.",
    thresholds: {
      total: MINIMUM_TOTAL_SCORE,
      category: MINIMUM_CATEGORY_SCORE,
    },
    categories,
    blockingChecks,
    failedCategories,
    browserReview: {
      required: true,
      status: "not_run",
      viewports: ["mobile", "tablet", "desktop"],
      checks: ["layout", "overflow", "typography", "interaction", "console", "forms", "visual_rubric"],
    },
    readiness: {
      internalPreview: passed,
      customerPreview: false,
      reason: passed ? "browser_review_required" : "static_quality_failed",
    },
  };
}

function normalizeCheck(item = {}) {
  return {
    id: clean(item.id) || slug(item.label),
    label: clean(item.label) || "Onbenoemde controle",
    passed: item.passed === true,
    weight: Math.max(0, Number(item.weight) || 0),
    category: CATEGORY_DEFINITIONS[item.category] ? item.category : "technical",
    critical: item.critical === true,
  };
}

function slug(value = "") {
  return clean(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function clean(value) {
  return String(value || "").trim();
}

module.exports = {
  CATEGORY_DEFINITIONS,
  MINIMUM_CATEGORY_SCORE,
  MINIMUM_TOTAL_SCORE,
  QUALITY_GATE_VERSION,
  summarizeQualityGate,
};
