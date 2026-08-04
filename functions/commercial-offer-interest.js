const crypto = require("node:crypto");
const { corsHeaders } = require("./_cors");
const { normalizeValidityDate, isExpired } = require("./services/commercialOfferValidityService");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { success: false, code: "METHOD_NOT_ALLOWED", error: "Methode niet toegestaan." });
  try {
    const input = parseBody(event);
    const token = clean(input.token);
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw problem(404, "INTEREST_LINK_INVALID", "Deze interesselink is ongeldig of niet meer beschikbaar.");
    const config = runtimeConfig();
    if (!config.ready) throw problem(503, "INTEREST_STORAGE_UNAVAILABLE", "De interessebevestiging is tijdelijk niet beschikbaar.");
    if (clean(input.action).toLowerCase() === "inspect") {
      const offer = await inspectOffer(config, sha256(token));
      return json(200, { success: true, ...offer, expired: false });
    }
    const result = await rpc(config, "commercial_confirm_offer_interest_v1", {
      input_token_sha256: sha256(token),
      input_idempotency_key: `interest:${sha256(`${token}:confirm`).slice(0, 48)}`,
    });
    return json(200, {
      success: true,
      confirmed: result.confirmed === true,
      duplicate: result.duplicate === true,
      message: "Met deze bevestiging geef je aan dat je verder wilt praten over dit voorstel. Dit is nog geen digitale ondertekening of betalingsopdracht.",
    });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    console.error("Commercial interest confirmation failed", { code: error.code || "INTEREST_CONFIRMATION_FAILED", status });
    return json(status, { success: false, code: error.code || "INTEREST_CONFIRMATION_FAILED", error: status >= 500 ? "De interessebevestiging kon niet veilig worden verwerkt." : error.message });
  }
};

async function inspectOffer(config, tokenHash) {
  const tokens = await rest(config, `commercial_offer_interest_tokens?select=offer_version_id,expires_at,confirmed_at,revoked_at&token_sha256=eq.${tokenHash}&limit=1`);
  const token = tokens[0];
  if (!token || token.revoked_at || new Date(token.expires_at).getTime() <= Date.now()) throw problem(404, "INTEREST_LINK_INVALID", "Deze interesselink is ongeldig, verlopen of ingetrokken.");
  const versions = await rest(config, `commercial_offer_versions?select=offer_id,snapshot&id=eq.${token.offer_version_id}&limit=1`);
  const version = versions[0];
  const validUntil = normalizeValidityDate(version?.snapshot?.validUntil);
  if (!validUntil || isExpired(validUntil)) throw problem(404, "INTEREST_LINK_INVALID", "Deze interesselink is ongeldig, verlopen of ingetrokken.");
  const offers = await rest(config, `commercial_offers?select=relationship_type,relationship_id,demo_journey_id&id=eq.${version.offer_id}&limit=1`);
  const offer = offers[0];
  if (!offer || !["lead", "customer"].includes(offer.relationship_type)) throw problem(404, "INTEREST_LINK_INVALID", "Deze interesselink is ongeldig, verlopen of ingetrokken.");
  const table = offer.relationship_type === "lead" ? "leads" : "customers";
  const [relationships, demos] = await Promise.all([
    rest(config, `${table}?select=*&id=eq.${offer.relationship_id}&limit=1`),
    rest(config, `demo_journeys?select=business_name,preview_package&id=eq.${offer.demo_journey_id}&limit=1`),
  ]);
  if (!relationships[0] || !demos[0]) throw problem(404, "INTEREST_LINK_INVALID", "Deze interesselink is ongeldig, verlopen of ingetrokken.");
  return publicOfferDetails(version.snapshot, relationships[0], demos[0], validUntil);
}

function publicOfferDetails(snapshot = {}, relationship = {}, demo = {}, validUntil = "") {
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  if (!lines.length || snapshot.hasNonBindingLines) throw problem(404, "INTEREST_LINK_INVALID", "Deze interesselink is ongeldig, verlopen of ingetrokken.");
  return {
    validUntil,
    companyName: clean(relationship.company_name || relationship.company || relationship.name || "Jouw organisatie"),
    demoName: clean(demo.business_name || demo.preview_package?.name || "Persoonlijke demo"),
    lines: lines.map((line) => ({
      name: clean(line.productName),
      kind: line.componentType === "recurring" ? "monthly" : "one_time",
      amountExVatCents: safeCents(line.subtotalExVatCents),
    })),
    oneTimeExVatCents: safeCents(snapshot.oneTimeExVatCents),
    oneTimeBeforeDiscountExVatCents: safeCents(snapshot.oneTimeBeforeDiscountExVatCents ?? snapshot.oneTimeExVatCents),
    discountPercentage: [0, 10, 15, 20, 25, 50, 75].includes(Number(snapshot.discountPercentage)) ? Number(snapshot.discountPercentage) : 0,
    discountExVatCents: safeCents(snapshot.discountExVatCents),
    recurringExVatCents: safeCents(snapshot.recurringExVatCents),
    paymentChoice: snapshot.paymentChoice === "full" ? "full" : snapshot.paymentChoice === "fixed_deposit" ? "fixed_deposit" : "none",
    dueNowExVatCents: safeCents(snapshot.dueNowExVatCents),
    disclaimer: "Dit is nog geen digitale ondertekening, contract, factuur of betalingsopdracht.",
  };
}

async function rpc(config, name, body) {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (response.ok) return data;
  const code = clean(data?.code);
  if (code === "P0002" || ["22023", "23514"].includes(code)) throw problem(404, "INTEREST_LINK_INVALID", "Deze interesselink is ongeldig, verlopen of ingetrokken.");
  throw problem(503, "INTEREST_CONFIRMATION_UNAVAILABLE", "De interessebevestiging is tijdelijk niet beschikbaar.");
}
async function rest(config, path) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json" } });
  const data = await response.json().catch(() => null);
  if (response.ok) return Array.isArray(data) ? data : [];
  throw problem(503, "INTEREST_CONFIRMATION_UNAVAILABLE", "De interessebevestiging is tijdelijk niet beschikbaar.");
}
function runtimeConfig() { const url = clean(process.env.SUPABASE_URL).replace(/\/$/, ""); const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY); return { url, key, ready: Boolean(url && key) }; }
function parseBody(event) { const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : String(event.body || ""); if (!raw || Buffer.byteLength(raw) > 4096) throw problem(400, "BODY_INVALID", "De aanvraag is ongeldig."); try { return JSON.parse(raw); } catch { throw problem(400, "JSON_INVALID", "De aanvraag is ongeldig."); } }
function sha256(value) { return crypto.createHash("sha256").update(clean(value)).digest("hex"); }
function safeCents(value) { const cents = Number(value); return Number.isInteger(cents) && cents >= 0 ? cents : 0; }
function clean(value) { return String(value || "").trim(); }
function problem(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }
function json(statusCode, body) { return { statusCode, headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { sha256, inspectOffer, publicOfferDetails };
