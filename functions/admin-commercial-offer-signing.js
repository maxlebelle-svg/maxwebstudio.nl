const crypto = require("node:crypto");
const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { rest: serviceRest } = require("./services/partnerOnboardingAccessService");
const {
  buildCommercialOfferMetadata,
  createCommercialOfferTransaction,
  getTransaction,
  mapTransactionStatus,
  signhostConfig,
  startTransaction,
  uploadFileMetadata,
  uploadPdf,
} = require("./services/signhostService");
const { processCommercialPostback } = require("./signhost-postback")._internal;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = ["super_admin", "admin", "sales_manager", "sales_partner", "sales"];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { success: false, code: "METHOD_NOT_ALLOWED", error: "Methode niet toegestaan." });
  const auth = await verifyAdmin(event, json, {
    module: "commercial_offers",
    action: event.httpMethod === "GET" ? "read" : "write",
    allowedRoles: ROLES,
    allowedStatuses: ["active"],
    disableLegacyToken: true,
  });
  if (!auth.success) return auth.response;
  try {
    const config = runtimeConfig();
    if (!config.ready) throw problem(503, "OFFER_STORAGE_UNAVAILABLE", "De commerciële opslag is niet geconfigureerd.");
    const actor = { id: auth.admin.id, profileId: auth.admin.profileId, role: auth.admin.role };
    if (!UUID.test(clean(actor.id)) || !UUID.test(clean(actor.profileId))) throw problem(403, "ACTOR_INVALID", "De actieve beheerder kon niet veilig worden vastgesteld.");
    if (event.httpMethod === "GET") return json(200, { success: true, ...(await readState(event.queryStringParameters || {}, actor, config)) });
    const input = parseBody(event);
    const action = clean(input.action).toLowerCase();
    if (action === "request_signature") return await requestSignature(input, actor, config);
    if (action === "reconcile_signature") return await reconcileSignature(event.queryStringParameters || {}, actor, config);
    throw problem(400, "ACTION_INVALID", "Kies een geldige ondertekenactie.");
  } catch (error) {
    const status = Number(error.statusCode || error.status) || 500;
    console.error("Commercial signing action failed", { code: clean(error.code || "COMMERCIAL_SIGNING_FAILED"), status });
    return json(status, { success: false, code: clean(error.code || "COMMERCIAL_SIGNING_FAILED"), error: status >= 500 ? "De ondertekenactie kon niet veilig worden verwerkt." : error.message });
  }
};

async function readState(query, actor, config) {
  const relationshipType = clean(query.relationshipType).toLowerCase();
  const relationshipId = uuid(query.relationshipId, "Kies een geldige lead of klant.");
  if (!["lead", "customer"].includes(relationshipType)) throw problem(400, "RELATIONSHIP_INVALID", "Kies een geldige lead of klant.");
  const relationship = await loadRelationship(relationshipType, relationshipId, config);
  assertRelationshipAccess(actor, relationshipType, relationship);
  let offerQuery = `commercial_offers?select=id,title,current_version_id,relationship_type,relationship_id&relationship_type=eq.${relationshipType}&relationship_id=eq.${relationshipId}&order=updated_at.desc&limit=1`;
  if (clean(query.offerId)) offerQuery += `&id=eq.${uuid(query.offerId, "Het voorstel is ongeldig.")}`;
  const offer = (await rest(config, offerQuery))[0] || null;
  if (!offer?.current_version_id) return { enabled: providerEnabled(), relationship: mapRelationship(relationship), offer: null, version: null, signing: null, fulfilment: null, interestConfirmed: false };
  const [version, interest, signings, fulfilments] = await Promise.all([
    rest(config, `commercial_offer_versions?select=id,offer_id,version_number,status,has_non_binding_lines,due_now_incl_vat_cents&id=eq.${offer.current_version_id}&limit=1`).then((rows) => rows[0] || null),
    rest(config, `commercial_offer_interest_tokens?select=id,confirmed_at,revoked_at&offer_version_id=eq.${offer.current_version_id}&confirmed_at=not.is.null&revoked_at=is.null&limit=1`).then((rows) => rows[0] || null),
    rest(config, `commercial_offer_signing_transactions?select=id,status,provider_status,signer_name,requested_at,signed_at,failure_code,updated_at&offer_version_id=eq.${offer.current_version_id}&limit=1`),
    rest(config, `commercial_offer_fulfilment_runs?select=id,status,customer_id,invoice_id,project_id,factory_project_id,checkout_url_created_at,production_handover_at,last_error_code,updated_at&offer_version_id=eq.${offer.current_version_id}&limit=1`),
  ]);
  return {
    enabled: providerEnabled(), relationship: mapRelationship(relationship), offer, version,
    signing: signings[0] || null, fulfilment: fulfilments[0] || null, interestConfirmed: Boolean(interest),
  };
}

async function reconcileSignature(query, actor, config) {
  if (!providerEnabled()) throw problem(403, "COMMERCIAL_SIGNING_DISABLED", "De definitieve ondertekenroute is nog niet geactiveerd.");
  const current = await readState(query, actor, config);
  if (!current.offer?.current_version_id || !current.signing?.id) throw problem(409, "SIGNING_NOT_FOUND", "Er staat geen actief ondertekenverzoek klaar om te controleren.");
  const signing = (await rest(config, `commercial_offer_signing_transactions?select=*&id=eq.${current.signing.id}&offer_version_id=eq.${current.offer.current_version_id}&limit=1`))[0];
  if (!signing) throw problem(409, "SIGNING_NOT_FOUND", "Het ondertekenverzoek kon niet veilig worden teruggevonden.");
  if (!clean(signing.provider_transaction_id)) throw problem(409, "SIGNHOST_TRANSACTION_MISSING", "Het Signhost-transactienummer ontbreekt bij dit verzoek.");

  let providerTransaction;
  try { providerTransaction = await getTransaction(signhostConfig(), signing.provider_transaction_id); }
  catch (error) { throw reconciliationError(error, "STATUS_READ"); }
  const providerStatus = Number(providerTransaction?.Status ?? providerTransaction?.status);
  if (!Number.isInteger(providerStatus)) throw problem(502, "SIGNHOST_STATUS_INVALID", "Signhost gaf geen geldige transactiestatus terug.");
  const mappedStatus = mapTransactionStatus(providerStatus);

  // This is deliberately a one-shot staff action. Signhost recommends using
  // postbacks instead of continuously polling its transaction endpoint.
  if (mappedStatus !== "waiting_for_signer") {
    try {
      await processCommercialPostback(
        { url: config.url, service: config.key },
        signing,
        { status: providerStatus, mappedStatus },
      );
    } catch (error) { throw reconciliationError(error, "PROCESSING"); }
  } else {
    await serviceRest(config.url, config.key, `commercial_offer_signing_transactions?id=eq.${signing.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ provider_status: providerStatus, updated_at: new Date().toISOString() }),
    });
  }

  return json(200, {
    success: true,
    reconciled: mappedStatus !== "waiting_for_signer",
    providerStatus,
    ...(await readState(query, actor, config)),
  });
}

async function requestSignature(input, actor, config) {
  if (!providerEnabled()) throw problem(403, "COMMERCIAL_SIGNING_DISABLED", "De definitieve ondertekenroute is nog niet geactiveerd.");
  const offerVersionId = uuid(input.offerVersionId, "De aanbodversie is ongeldig.");
  const context = await loadSigningContext(offerVersionId, actor, config);
  const signerName = clean(input.signerName || context.relationship.contactName || context.relationship.companyName);
  const signerEmail = clean(input.signerEmail || context.relationship.email).toLowerCase();
  if (!validEmail(signerEmail) || signerName.length < 2 || signerName.length > 160) throw problem(400, "SIGNER_INVALID", "Controleer de naam en het e-mailadres van de ondertekenaar.");
  const reservation = await rpc(config, "commercial_reserve_signature_v1", {
    input_actor_profile_id: actor.profileId,
    input_actor_auth_user_id: actor.id,
    input_offer_version_id: offerVersionId,
    input_signer_name: signerName,
    input_signer_email: signerEmail,
    input_idempotency_key: boundedKey(input.actionKey),
  });
  if (reservation.providerTransactionId || !["creating", "failed"].includes(clean(reservation.status))) {
    return json(200, { success: true, duplicate: true, signing: reservation });
  }
  try {
    const pdf = await loadSignableOfferPdf(config, offerVersionId);
    const provider = signhostConfig();
    const transaction = await createCommercialOfferTransaction(provider, { signerEmail, signerName, offerVersionId, signingTransactionId: reservation.signingId });
    const transactionId = clean(transaction.Id || transaction.id);
    if (!transactionId) throw problem(502, "SIGNING_RESPONSE_INVALID", "De ondertekenprovider gaf geen geldig transactienummer terug.");
    await uploadFileMetadata(provider, transactionId, reservation.providerFileId, buildCommercialOfferMetadata(transaction, {
      signerEmail, displayName: `Definitieve offerte ${context.offer.title || "Max Webstudio"}`, pageNumber: pdfPageCount(pdf),
    }));
    await uploadPdf(provider, transactionId, reservation.providerFileId, pdf);
    await startTransaction(provider, transactionId);
    const now = new Date().toISOString();
    const rows = await serviceRest(config.url, config.key, `commercial_offer_signing_transactions?id=eq.${reservation.signingId}`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ provider_transaction_id: transactionId, provider_status: Number(transaction.Status || 10), status: "waiting_for_signer", requested_at: now, failure_code: null, updated_at: now }),
    });
    return json(200, { success: true, duplicate: false, signing: rows?.[0] || { ...reservation, status: "waiting_for_signer" } });
  } catch (error) {
    await serviceRest(config.url, config.key, `commercial_offer_signing_transactions?id=eq.${reservation.signingId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed", failure_code: clean(error.code || "provider_error").slice(0, 120), updated_at: new Date().toISOString() }),
    }).catch(() => {});
    throw error;
  }
}

async function loadSigningContext(offerVersionId, actor, config) {
  const version = (await rest(config, `commercial_offer_versions?select=id,offer_id,status&id=eq.${offerVersionId}&limit=1`))[0];
  if (!version) throw problem(404, "OFFER_NOT_FOUND", "De aanbodversie bestaat niet.");
  const offer = (await rest(config, `commercial_offers?select=id,title,relationship_type,relationship_id,current_version_id&id=eq.${version.offer_id}&limit=1`))[0];
  if (!offer) throw problem(404, "OFFER_NOT_FOUND", "Het voorstel bestaat niet.");
  const row = await loadRelationship(offer.relationship_type, offer.relationship_id, config);
  assertRelationshipAccess(actor, offer.relationship_type, row);
  return { version, offer, relationship: mapRelationship(row) };
}

async function loadSignableOfferPdf(config, offerVersionId) {
  const bindings = await rest(config, `commercial_offer_document_bindings?select=document_type,storage_bucket,storage_path,source_url,checksum_sha256&offer_version_id=eq.${offerVersionId}&document_type=in.(quote,agreement)&order=document_type.desc&limit=2`);
  const binding = bindings.find((entry) => entry.document_type === "quote") || bindings[0];
  if (!binding) throw problem(409, "SIGNABLE_DOCUMENT_MISSING", "Koppel eerst de definitieve offerte-PDF.");
  const response = binding.storage_bucket && binding.storage_path
    ? await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(binding.storage_bucket)}/${encodePath(binding.storage_path)}`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } })
    : await fetch(safeHttpsUrl(binding.source_url), { headers: { Accept: "application/pdf" }, redirect: "error" });
  if (!response.ok) throw problem(502, "SIGNABLE_DOCUMENT_DOWNLOAD_FAILED", "De definitieve offerte-PDF kon niet veilig worden geladen.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100 || bytes.length > 15 * 1024 * 1024 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw problem(409, "SIGNABLE_DOCUMENT_INVALID", "De gekoppelde offerte is geen geldige PDF.");
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  if (checksum !== clean(binding.checksum_sha256).toLowerCase()) throw problem(409, "SIGNABLE_DOCUMENT_INTEGRITY_FAILED", "De integriteitscontrole van de offerte-PDF is mislukt.");
  return bytes;
}

async function loadRelationship(type, id, config) {
  const rows = await rest(config, `${type === "lead" ? "leads" : "customers"}?select=*&id=eq.${id}&limit=1`);
  if (!rows[0]) throw problem(404, "RELATIONSHIP_NOT_FOUND", "De geselecteerde relatie bestaat niet.");
  return rows[0];
}
function assertRelationshipAccess(actor, type, record) {
  if (["super_admin", "admin", "sales_manager"].includes(normalizeRole(actor.role))) return;
  const metadata = record?.metadata && typeof record.metadata === "object" ? record.metadata : {};
  const authOwners = [metadata.assignedUserId, metadata.ownerAuthUserId];
  if (type === "lead") authOwners.push(record.assigned_user_id, record.assigned_to, record.owner_id);
  const allowed = authOwners.map(clean).includes(clean(actor.id)) || [metadata.ownerProfileId, metadata.assignedProfileId].map(clean).includes(clean(actor.profileId));
  if (!allowed) throw problem(403, "OFFER_FORBIDDEN", "U mag voor deze relatie geen voorstel beheren.");
}
function mapRelationship(row) {
  return {
    companyName: clean(row.company_name || row.company || row.name), contactName: clean(row.contact_name || row.name),
    email: clean(row.email).toLowerCase(), phone: clean(row.phone),
  };
}
async function rest(config, path) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json" } });
  const data = await response.json().catch(() => null);
  if (response.ok && Array.isArray(data)) return data;
  console.error("Commercial signing read failed", {
    resource: clean(path).split("?")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 80),
    status: response.status,
    providerCode: clean(data?.code).slice(0, 40),
  });
  throw problem(503, "OFFER_READ_UNAVAILABLE", "De commerciële context kon niet veilig worden geladen.");
}
async function rpc(config, name, body) {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (response.ok) return data;
  const code = clean(data?.code);
  if (code === "42501") throw problem(403, "OFFER_FORBIDDEN", "U mag voor deze relatie geen voorstel beheren.");
  if (["22023", "23514", "40001", "55000"].includes(code)) throw problem(409, "OFFER_STATE_REJECTED", "De offerte is nog niet klaar voor ondertekening.");
  if (code === "P0002") throw problem(404, "OFFER_NOT_FOUND", "De aanbodversie bestaat niet.");
  throw problem(503, "OFFER_RPC_UNAVAILABLE", "De beveiligde offeropslag is tijdelijk niet beschikbaar.");
}
function providerEnabled() {
  return clean(process.env.COMMERCIAL_OFFER_SIGNHOST_ENABLED).toLowerCase() === "true"
    && clean(process.env.COMMERCIAL_OFFER_POST_SIGNATURE_ENABLED).toLowerCase() === "true"
    && Boolean(clean(process.env.SIGNHOST_APP_KEY)) && Boolean(clean(process.env.SIGNHOST_USER_TOKEN)) && environmentAllowed();
}
function environmentAllowed() {
  let site = ""; let database = "";
  try { site = new URL(clean(process.env.URL || process.env.DEPLOY_PRIME_URL)).hostname.toLowerCase(); } catch {}
  try { database = new URL(clean(process.env.SUPABASE_URL)).hostname.toLowerCase(); } catch {}
  return [["maxwebstudio-staging.netlify.app", "xlxpuuycigeqhgxqtzni.supabase.co"], ["maxwebstudio.nl", "yxxahurphdbblkuxoeje.supabase.co"]]
    .some(([allowedSite, allowedDatabase]) => site === allowedSite && database === allowedDatabase);
}
function runtimeConfig() { const url = clean(process.env.SUPABASE_URL).replace(/\/$/, ""); const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY); return { url, key, ready: Boolean(url && key) }; }
function parseBody(event) { const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : String(event.body || ""); if (!raw || Buffer.byteLength(raw) > 32768) throw problem(400, "BODY_INVALID", "De aanvraag is leeg of te groot."); try { return JSON.parse(raw); } catch { throw problem(400, "JSON_INVALID", "De aanvraag bevat geen geldige gegevens."); } }
function pdfPageCount(bytes) { return Math.max(1, Math.min(250, bytes.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length || 1)); }
function safeHttpsUrl(value) { try { const url = new URL(clean(value)); if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe"); return url.toString(); } catch { throw problem(400, "DOCUMENT_URL_INVALID", "Document-URL moet een veilige HTTPS-URL zijn."); } }
function encodePath(value) { return clean(value).split("/").map(encodeURIComponent).join("/"); }
function boundedKey(value) { const key = clean(value); if (key.length < 16 || key.length > 150 || !/^[a-zA-Z0-9:_-]+$/.test(key)) throw problem(400, "ACTION_KEY_INVALID", "De actiebeveiliging ontbreekt."); return key; }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value)); }
function normalizeRole(value) { return clean(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function uuid(value, message) { const id = clean(value); if (!UUID.test(id)) throw problem(400, "ID_INVALID", message); return id; }
function clean(value) { return String(value ?? "").trim(); }
function problem(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }
function reconciliationError(error, stage) {
  const cause = clean(error?.code || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 72);
  return problem(Number(error?.statusCode || error?.status) || 502, `SIGNHOST_RECONCILE_${stage}_${cause}`.slice(0, 120), error?.message || "De Signhost-status kon niet veilig worden verwerkt.");
}
function json(statusCode, body) { return { statusCode, headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { providerEnabled, environmentAllowed, pdfPageCount, assertRelationshipAccess };
