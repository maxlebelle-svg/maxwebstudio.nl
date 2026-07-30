const crypto = require("node:crypto");
const { corsHeaders } = require("./_cors");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { success: false, code: "METHOD_NOT_ALLOWED", error: "Methode niet toegestaan." });
  try {
    const input = parseBody(event);
    const token = clean(input.token);
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw problem(404, "INTEREST_LINK_INVALID", "Deze interesselink is ongeldig of niet meer beschikbaar.");
    const config = runtimeConfig();
    if (!config.ready) throw problem(503, "INTEREST_STORAGE_UNAVAILABLE", "De interessebevestiging is tijdelijk niet beschikbaar.");
    const result = await rpc(config, "commercial_confirm_offer_interest_v1", {
      input_token_sha256: sha256(token),
      input_idempotency_key: `interest:${sha256(`${token}:confirm`).slice(0, 48)}`,
    });
    return json(200, {
      success: true,
      confirmed: result.confirmed === true,
      duplicate: result.duplicate === true,
      message: "Met deze bevestiging geeft u aan dat u verder wilt praten over dit voorstel. Dit is nog geen digitale ondertekening of betalingsopdracht.",
    });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    console.error("Commercial interest confirmation failed", { code: error.code || "INTEREST_CONFIRMATION_FAILED", status });
    return json(status, { success: false, code: error.code || "INTEREST_CONFIRMATION_FAILED", error: status >= 500 ? "De interessebevestiging kon niet veilig worden verwerkt." : error.message });
  }
};

async function rpc(config, name, body) {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (response.ok) return data;
  const code = clean(data?.code);
  if (code === "P0002" || ["22023", "23514"].includes(code)) throw problem(404, "INTEREST_LINK_INVALID", "Deze interesselink is ongeldig, verlopen of ingetrokken.");
  throw problem(503, "INTEREST_CONFIRMATION_UNAVAILABLE", "De interessebevestiging is tijdelijk niet beschikbaar.");
}
function runtimeConfig() { const url = clean(process.env.SUPABASE_URL).replace(/\/$/, ""); const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY); return { url, key, ready: Boolean(url && key) }; }
function parseBody(event) { const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : String(event.body || ""); if (!raw || Buffer.byteLength(raw) > 4096) throw problem(400, "BODY_INVALID", "De aanvraag is ongeldig."); try { return JSON.parse(raw); } catch { throw problem(400, "JSON_INVALID", "De aanvraag is ongeldig."); } }
function sha256(value) { return crypto.createHash("sha256").update(clean(value)).digest("hex"); }
function clean(value) { return String(value || "").trim(); }
function problem(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }
function json(statusCode, body) { return { statusCode, headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { sha256 };
