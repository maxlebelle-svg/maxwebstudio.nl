const crypto = require("crypto");
const { TOKEN_PATTERN, clean } = require("./_dca-invitation");
const {
  SESSION_MAX_AGE_SECONDS,
  bodyWithinLimit,
  clientRateKey,
  isJsonRequest,
  sameOrigin,
  sessionCookie,
  sessionSecret,
  sha256,
} = require("./_dca-exchange");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return response(405, { success: false, error: genericError() });
  if (!sameOrigin(event) || !isJsonRequest(event) || !bodyWithinLimit(event)) return response(400, { success: false, error: genericError() });
  const context = config();
  if (!context.available) return response(503, { success: false, error: genericError() });

  let token = "";
  try {
    const body = JSON.parse(event.body || "{}");
    token = clean(body.token).toLowerCase();
    if (!TOKEN_PATTERN.test(token)) return response(404, { success: false, error: genericError() });

    const rateKey = clientRateKey(event, context.rateSecret);
    if (!rateKey || await rpc(context, "dca_1_consume_exchange_rate_limit", { input_rate_key_hash: rateKey }) !== true) {
      return response(429, { success: false, error: genericError() });
    }

    const secret = sessionSecret();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    const exchanged = await rpc(context, "dca_1_exchange_activation_token", {
      input_activation_token: token,
      input_session_hash: sha256(secret),
      input_correlation_id: crypto.randomUUID(),
      input_expires_at: expiresAt,
    });
    if (exchanged !== true) return response(404, { success: false, error: genericError() });
    token = "";
    return response(204, null, sessionCookie(secret, context.environment));
  } catch {
    token = "";
    return response(404, { success: false, error: genericError() });
  }
};

async function rpc(context, name, body) {
  const result = await fetch(`${context.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: context.key, Authorization: `Bearer ${context.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await result.json().catch(() => null);
  if (!result.ok) throw new Error("Exchange rejected");
  return data;
}

function config() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const rateSecret = clean(process.env.DCA_EXCHANGE_RATE_LIMIT_SECRET);
  const environment = clean(process.env.APP_ENV || process.env.APP_ENVIRONMENT || "staging");
  return { url, key, rateSecret, environment, available: Boolean(url && key && rateSecret.length >= 32) };
}
function genericError() { return "Deze persoonlijke link is ongeldig of niet meer actief."; }
function response(statusCode, body, cookie = "") {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
    multiValueHeaders: cookie ? { "Set-Cookie": [cookie] } : undefined,
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

exports._private = { config, genericError, response };
