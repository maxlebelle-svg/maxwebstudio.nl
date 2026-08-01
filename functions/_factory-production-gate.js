const crypto = require("node:crypto");

const RESULT_STATUSES = new Set(["not_configured", "missing", "passed", "failed", "expired"]);

const GENERIC_CHECKS = Object.freeze([
  definition("product_ready", "production", "Productie gereed", "factory_context", ["factory_type", "blueprint_key", "configuration"], 24),
  definition("domain_mapping", "domain", "Domeinkoppeling", "domain_center", ["relationship_type", "relationship_id"], 1),
  definition("ssl_active", "domain", "SSL actief", "domain_center", ["relationship_type", "relationship_id"], 1),
  definition("internal_approval", "approval", "Interne goedkeuring", "internal_attestation", ["id", "updated_at"], 0, ["super_admin"]),
  definition("customer_approval", "approval", "Klantgoedkeuring", "customer_approval_registry", ["id", "relationship_type", "relationship_id", "updated_at"], 0, ["customer"]),
]);

function definition(key, groupKey, label, provider, dependencies, ttlHours, allowedAttestorRoles = []) {
  return Object.freeze({ key, groupKey, label, provider, dependencies: Object.freeze(dependencies), ttlHours, required: true, allowedAttestorRoles: Object.freeze(allowedAttestorRoles) });
}

function definitionsFor(project = {}) {
  return GENERIC_CHECKS.map((item) => ({ ...item, dependencies: [...item.dependencies], allowedAttestorRoles: [...item.allowedAttestorRoles] }));
}

function definitionFor(project, key) {
  return definitionsFor(project).find((item) => item.key === String(key || "").trim()) || null;
}

function fingerprintFor(project, checkDefinition, trustedSnapshot = null) {
  const payload = {
    project: checkDefinition.dependencies.map((path) => [path, valueAt(project, path)]),
    provider: checkDefinition.provider,
    trustedSnapshot,
  };
  return sha256(stableStringify(payload));
}

function normalizeSupplierResult(project, checkKey, provider, result, now = new Date()) {
  const checkDefinition = definitionFor(project, checkKey);
  if (!checkDefinition) throw gateError(400, "CHECK_UNKNOWN", "Onbekende Production Gate-controle.");
  if (provider !== checkDefinition.provider) throw gateError(500, "SUPPLIER_MISMATCH", "De bewijsleverancier hoort niet bij deze controle.");
  const status = String(result?.status || "").trim();
  if (!RESULT_STATUSES.has(status) || status === "expired") throw gateError(500, "SUPPLIER_STATUS_INVALID", "De bewijsleverancier gaf een ongeldige status terug.");
  const trustedSnapshot = cloneObject(result?.trustedSnapshot);
  const evidence = normalizeEvidence(result?.evidence, status);
  const checkedAt = now.toISOString();
  const expiresAt = status === "passed" && checkDefinition.ttlHours > 0
    ? new Date(now.getTime() + checkDefinition.ttlHours * 3600000).toISOString()
    : null;
  return {
    check_key: checkDefinition.key,
    group_key: checkDefinition.groupKey,
    required: checkDefinition.required,
    status,
    source: checkDefinition.provider,
    source_version: clean(result?.sourceVersion || "v1", 40),
    input_fingerprint: fingerprintFor(project, checkDefinition, trustedSnapshot),
    evidence,
    evidence_hash: sha256(stableStringify(evidence)),
    blocking_error: status === "passed" ? null : clean(result?.blockingError || defaultBlockingError(status), 500),
    checked_at: checkedAt,
    expires_at: expiresAt,
  };
}

function summarizeGate(project, storedChecks = [], storedOverrides = [], now = new Date()) {
  const newest = newestChecks(storedChecks, project);
  const checks = definitionsFor(project).map((item) => hydrateCheck(item, newest.get(item.key), now));
  const blocking = checks.filter((item) => item.required && item.effectiveStatus !== "passed");
  const passed = checks.filter((item) => item.effectiveStatus === "passed");
  const failed = checks.filter((item) => item.effectiveStatus === "failed");
  const expired = checks.filter((item) => item.effectiveStatus === "expired");
  const override = activeOverride(storedOverrides, now);
  const bindingComplete = Boolean(project?.gate_generation_id)
    && checks.length > 0
    && checks.every((item) => item.projectGenerationBound === true);
  const strictCanGoLive = blocking.length === 0;
  return {
    version: 2,
    bindingComplete,
    canGoLive: bindingComplete && (strictCanGoLive || Boolean(override)),
    strictCanGoLive: bindingComplete && strictCanGoLive,
    releaseMode: bindingComplete && override && !strictCanGoLive ? "override" : bindingComplete && strictCanGoLive ? "standard" : "blocked",
    progress: checks.length ? Math.round((passed.length / checks.length) * 100) : 0,
    counts: { total: checks.length, passed: passed.length, blocking: blocking.length, failed: failed.length, expired: expired.length },
    checks,
    blockingKeys: blocking.map((item) => item.key),
    override: override ? sanitizeOverride(override) : null,
  };
}

function newestChecks(rows, project) {
  if (!project?.gate_generation_id) return new Map();
  const ordered = [...(Array.isArray(rows) ? rows : [])]
    .filter((row) => row.project_generation_id === project.gate_generation_id
      && Number(row.project_generation) === Number(project.gate_generation)
      && /^[0-9a-f]{64}$/.test(String(row.project_generation_fingerprint || "")))
    .sort((a, b) => new Date(b.checked_at || 0) - new Date(a.checked_at || 0));
  const result = new Map();
  for (const row of ordered) if (!result.has(row.check_key)) result.set(row.check_key, row);
  return result;
}

function hydrateCheck(checkDefinition, stored, now) {
  let effectiveStatus = stored?.status || "missing";
  let reason = stored?.blocking_error || (stored ? "" : "Nog geen resultaat van de vertrouwde bewijsleverancier.");
  if (effectiveStatus === "passed" && stored?.expires_at && new Date(stored.expires_at).getTime() <= now.getTime()) {
    effectiveStatus = "expired";
    reason = "Het controlebewijs is verlopen.";
  }
  return {
    key: checkDefinition.key,
    groupKey: checkDefinition.groupKey,
    label: checkDefinition.label,
    sourceLabel: checkDefinition.provider,
    provider: checkDefinition.provider,
    required: checkDefinition.required,
    status: stored?.status || "missing",
    effectiveStatus,
    reason,
    checkedAt: stored?.checked_at || null,
    expiresAt: stored?.expires_at || null,
    fingerprint: stored?.input_fingerprint || null,
    projectGenerationBound: Boolean(stored),
    evidence: safeEvidence(stored?.evidence),
  };
}

function normalizeEvidence(value, status) {
  const evidence = cloneObject(value);
  if (Buffer.byteLength(JSON.stringify(evidence), "utf8") > 8192) throw gateError(500, "EVIDENCE_TOO_LARGE", "Het leveranciersbewijs is te groot.");
  if (status === "passed" && (!clean(evidence.summary, 300) || !clean(evidence.artifactRef, 500) || !clean(evidence.observedAt, 80))) {
    throw gateError(500, "SUPPLIER_EVIDENCE_INVALID", "Een PASS vereist door de leverancier vastgelegde bron, tijd en bewijsreferentie.");
  }
  return evidence;
}

function activeOverride(rows, now) {
  return [...(Array.isArray(rows) ? rows : [])]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .find((item) => item.status === "active" && (!item.expires_at || new Date(item.expires_at).getTime() > now.getTime())) || null;
}

function sanitizeOverride(row) {
  return { id: row.id, reason: row.reason, risks: Array.isArray(row.open_risks) ? row.open_risks : [], createdBy: row.created_by, createdAt: row.created_at, expiresAt: row.expires_at || null };
}

function safeEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return { summary: clean(value.summary, 300), artifactRef: clean(value.artifactRef, 500), observedAt: clean(value.observedAt, 80) };
}

function cloneObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {}; }
function valueAt(source, path) { return path.split(".").reduce((value, key) => value && typeof value === "object" ? value[key] : undefined, source); }
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value === undefined ? null : value);
}
function defaultBlockingError(status) { return status === "not_configured" ? "Deze bewijsleverancier is nog niet geconfigureerd." : status === "missing" ? "Vereist bronbewijs ontbreekt." : "De bewijsleverancier heeft de controle afgekeurd."; }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function clean(value, max) { return String(value || "").trim().slice(0, max); }
function gateError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }

module.exports = { GENERIC_CHECKS, RESULT_STATUSES, definitionFor, definitionsFor, fingerprintFor, normalizeSupplierResult, summarizeGate };
