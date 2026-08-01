"use strict";

const { verifyAdmin } = require("./_admin-auth");

const PROBES = Object.freeze([
  Object.freeze({ resource: "profiles", path: "profiles?select=id&limit=0" }),
  Object.freeze({ resource: "customers", path: "customers?select=id&limit=0" }),
]);
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 5;
const rateWindows = new Map();

function createHandler(dependencies = {}) {
  const authenticate = dependencies.verifyAdmin || verifyAdmin;
  const request = dependencies.fetch || global.fetch;
  const env = dependencies.env || process.env;
  const now = dependencies.now || (() => new Date());
  const logger = dependencies.logger || console;
  const consumeRateLimit = dependencies.consumeRateLimit || defaultRateLimit;

  return async function handler(event = {}) {
    if (event.httpMethod !== "GET") {
      return json(405, { probes: [] });
    }

    const auth = await authenticate(event, json, {
      module: "commercial_postgrest_preflight",
      action: "read",
      allowedRoles: ["super_admin"],
      allowedStatuses: ["active"],
      disableLegacyToken: true,
    });
    if (!auth.success) return auth.response;

    const actorProfileId = clean(auth.admin?.profileId);
    const checkedAt = timestamp(now);
    if (!consumeRateLimit(actorProfileId, new Date(checkedAt).getTime())) {
      safeAudit(logger, { actorProfileId, checkedAt, result: "RATE_LIMITED", probes: [] });
      return json(429, { probes: [] }, { "Retry-After": "60" });
    }

    const supabaseUrl = clean(env.SUPABASE_URL).replace(/\/$/, "");
    const serviceRoleKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!supabaseUrl || !serviceRoleKey || typeof request !== "function") {
      safeAudit(logger, { actorProfileId, checkedAt, result: "CONFIGURATION_ERROR", probes: [] });
      return json(500, { probes: [] });
    }

    const probes = await Promise.all(PROBES.map((probe) => executeProbe({
      probe,
      request,
      supabaseUrl,
      serviceRoleKey,
    })));
    const success = probes.every((probe) => probe.httpStatus === 200 && probe.resultCategory === "healthy");
    safeAudit(logger, {
      actorProfileId,
      checkedAt,
      result: success ? "PASS" : "STOP",
      probes: probes.map(({ resource, httpStatus, errorCode, resultCategory }) => ({ resource, httpStatus, errorCode, resultCategory })),
    });
    return json(success ? 200 : 502, { probes });
  };
}

async function executeProbe({ probe, request, supabaseUrl, serviceRoleKey }) {
  try {
    const response = await request(`${supabaseUrl}/rest/v1/${probe.path}`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    });
    const errorCode = response.ok ? "" : await extractErrorCode(response);
    return Object.freeze({
      resource: probe.resource,
      httpStatus: Number(response.status) || 0,
      errorCode,
      resultCategory: category(response.status, errorCode),
    });
  } catch {
    return Object.freeze({
      resource: probe.resource,
      httpStatus: 0,
      errorCode: "POSTGREST_REQUEST_FAILED",
      resultCategory: "transport_error",
    });
  }
}

async function extractErrorCode(response) {
  try {
    const body = await response.json();
    const code = clean(body?.code);
    return /^[A-Z0-9_]{2,64}$/i.test(code) ? code : "POSTGREST_ERROR";
  } catch {
    return "POSTGREST_ERROR";
  }
}

function category(status, code) {
  if (Number(status) === 200) return "healthy";
  if ([401, 403].includes(Number(status))) return "authorization_failed";
  if (code === "PGRST205") return "schema_unavailable";
  if (Number(status) >= 500) return "upstream_unavailable";
  return "unexpected_response";
}

function defaultRateLimit(actorProfileId, nowMs) {
  if (!actorProfileId || !Number.isFinite(nowMs)) return false;
  const current = rateWindows.get(actorProfileId);
  if (!current || nowMs - current.startedAt >= RATE_WINDOW_MS) {
    rateWindows.set(actorProfileId, { startedAt: nowMs, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

function safeAudit(logger, metadata) {
  const write = typeof logger?.info === "function" ? logger.info.bind(logger) : () => {};
  write("Commercial PostgREST preflight audit", {
    module: "commercial_postgrest_preflight",
    action: "read",
    actorProfileId: metadata.actorProfileId,
    checkedAt: metadata.checkedAt,
    result: metadata.result,
    probes: metadata.probes,
  });
}

function timestamp(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function clean(value) {
  return String(value ?? "").trim();
}

exports.handler = createHandler();
exports._test = Object.freeze({ PROBES, RATE_LIMIT, RATE_WINDOW_MS, category, createHandler, defaultRateLimit });
