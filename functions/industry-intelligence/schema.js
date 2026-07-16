"use strict";

const SCHEMA_VERSION = "mws.industry-profile.v1";
const CLASSIFICATION_STATUSES = Object.freeze(["confirmed", "probable", "uncertain", "neutral"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function statusForConfidence(confidence) {
  const score = Number(confidence) || 0;
  if (score >= 0.85) return "confirmed";
  if (score >= 0.65) return "probable";
  if (score >= 0.45) return "uncertain";
  return "neutral";
}

module.exports = { CLASSIFICATION_STATUSES, SCHEMA_VERSION, deepFreeze, statusForConfidence };
