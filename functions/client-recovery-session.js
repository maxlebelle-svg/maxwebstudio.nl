exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const anonKey = cleanText(process.env.SUPABASE_ANON_KEY);
  if (!supabaseUrl || !anonKey) {
    return jsonResponse(500, { success: false, error: "Recovery is nog niet geconfigureerd." });
  }

  const input = parsePayload(event.body);
  const tokenHash = cleanText(input.tokenHash || input.token_hash);
  const code = cleanText(input.code);

  if (!tokenHash && !code) {
    return jsonResponse(400, { success: false, error: "Herstel-link ontbreekt." });
  }

  try {
    const session = tokenHash
      ? await verifyTokenHash(supabaseUrl, anonKey, tokenHash)
      : await exchangeCode(supabaseUrl, anonKey, code);
    if (!session?.access_token) {
      return jsonResponse(400, { success: false, error: "Herstel-link is ongeldig of verlopen." });
    }
    return jsonResponse(200, { success: true, session });
  } catch (error) {
    console.info("Client recovery session failed", { code: error.code || "RECOVERY_FAILED", status: error.status || "" });
    return jsonResponse(error.status >= 400 && error.status < 500 ? 400 : 502, {
      success: false,
      error: "Herstel-link is ongeldig of verlopen.",
      code: error.code || "RECOVERY_FAILED",
    });
  }
};

async function verifyTokenHash(supabaseUrl, anonKey, tokenHash) {
  const response = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: authHeaders(anonKey),
    body: JSON.stringify({ type: "recovery", token_hash: tokenHash }),
  });
  return readSessionResponse(response, "SUPABASE_RECOVERY_VERIFY_FAILED");
}

async function exchangeCode(supabaseUrl, anonKey, code) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: authHeaders(anonKey),
    body: JSON.stringify({ auth_code: code }),
  });
  return readSessionResponse(response, "SUPABASE_RECOVERY_CODE_FAILED");
}

async function readSessionResponse(response, fallbackCode) {
  const payload = await response.json().catch(() => ({}));
  const session = normalizeAuthSession(payload);
  if (!response.ok || !session?.access_token) {
    const error = new Error(cleanText(payload.message || payload.msg || payload.error_description || payload.error) || "Recovery failed");
    error.status = response.status;
    error.code = cleanText(payload.error_code || payload.code || payload.error) || fallbackCode;
    throw error;
  }
  return session;
}

function normalizeAuthSession(payload = {}) {
  if (payload?.access_token) return payload;
  if (payload?.session?.access_token) return payload.session;
  if (payload?.data?.session?.access_token) return payload.data.session;
  return null;
}

function authHeaders(anonKey) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    return {};
  }
}

function cleanText(value) {
  return String(value || "").trim();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}
