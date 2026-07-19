const crypto = require("crypto");
const { sendTrackedEmail } = require("./resendMailService");

const MESSAGE_TYPE = "demo_preview_invitation";
const DEFAULT_TEMPLATE_ID = "demo_preview_invitation";
const DEFAULT_TEMPLATE_VERSION = 1;

async function sendDemoInvitation(input = {}, dependencies = {}) {
  const config = resolveConfig(input.config);
  const journeyId = uuid(input.journeyId || input.demoJourneyId);
  const expectedPreviewVersionId = uuid(input.previewVersionId || input.expectedPreviewVersionId);
  const recipient = normalizeEmail(input.recipient || input.to);
  const templateId = cleanText(input.templateId) || DEFAULT_TEMPLATE_ID;
  const templateVersion = positiveInteger(input.templateVersion, DEFAULT_TEMPLATE_VERSION);
  const actor = cleanText(input.createdBy || input.actorId);
  const requestingUserId = uuid(input.requestingUserId || input.actorUserId) || null;
  if (!journeyId || !recipient || !templateId || !templateVersion || !actor) {
    throw contractError(400, "Demo-uitnodiging mist verplichte gegevens.", "INVALID_DEMO_INVITATION_REQUEST");
  }

  const journey = await fetchJourney(config, journeyId, dependencies.fetch || fetch);
  if (!journey) throw contractError(404, "Demo-klantreis niet gevonden.", "DEMO_JOURNEY_NOT_FOUND");
  if (journey.email && normalizeEmail(journey.email) !== recipient) {
    throw contractError(409, "Ontvanger hoort niet bij deze demo-klantreis.", "DEMO_RECIPIENT_MISMATCH");
  }
  const preview = await fetchActivePreview(config, journeyId, dependencies.fetch || fetch);
  if (!preview) throw contractError(409, "Er is geen actieve previewversie beschikbaar.", "ACTIVE_PREVIEW_NOT_FOUND");
  if (expectedPreviewVersionId && preview.id !== expectedPreviewVersionId) {
    throw contractError(409, "De actieve previewversie is gewijzigd. Vernieuw de demo-klantreis.", "ACTIVE_PREVIEW_CHANGED");
  }
  if (preview.preview_token !== journey.preview_token || preview.preview_url !== journey.preview_url) {
    throw contractError(409, "De journey en actieve preview zijn niet gelijk gebonden.", "PREVIEW_BINDING_MISMATCH");
  }

  const identity = invitationIdentity({ journeyId, previewVersionId: preview.id, templateId, templateVersion, recipient });
  const invitationUrl = appendQuery(preview.preview_url, "invitation", identity.publicReference);
  const template = buildDemoInvitationTemplate({
    businessName: journey.business_name,
    contactName: journey.contact_name,
    previewUrl: invitationUrl,
  });
  const tokenFingerprint = sha256(preview.preview_token);

  const planned = first(await rpc(config, "plan_demo_invitation", {
    input_demo_journey_id: journeyId,
    input_preview_version_id: preview.id,
    input_template_id: templateId,
    input_template_version: templateVersion,
    input_recipient_email: recipient,
    input_subject: template.subject,
    input_html_body: template.html,
    input_text_body: template.text,
    input_idempotency_key: identity.idempotencyKey,
    input_public_reference: identity.publicReference,
    input_preview_token_fingerprint: tokenFingerprint,
    input_created_by: actor,
    input_requesting_user_id: requestingUserId,
  }, dependencies.fetch || fetch));

  if (!planned?.email_log_id) throw contractError(502, "Mailregistratie kon niet worden gepland.", "INVITATION_PLAN_FAILED");
  if (planned.status === "sent") return invitationResult("already_sent", planned, preview, identity);
  if (planned.status === "sending") return invitationResult("already_processing", planned, preview, identity);
  if (planned.status === "delivery_unknown") return invitationResult("delivery_unknown", planned, preview, identity);
  if (["failed", "cancelled"].includes(planned.status)) return invitationResult("not_retryable", planned, preview, identity);
  if (planned.status !== "planned") throw contractError(409, "Mailregistratie heeft een ongeldige status.", "INVALID_INVITATION_STATUS");

  const claimToken = crypto.randomBytes(32).toString("hex");
  const claimed = first(await rpc(config, "claim_demo_invitation", {
    input_email_log_id: planned.email_log_id,
    input_claim_token: claimToken,
    input_claimed_by: actor,
  }, dependencies.fetch || fetch));
  if (!claimed?.claimed) {
    const state = claimed?.status === "sent" ? "already_sent"
      : claimed?.status === "delivery_unknown" ? "delivery_unknown" : "already_processing";
    return invitationResult(state, { ...planned, ...claimed }, preview, identity);
  }

  const sendProvider = dependencies.sendProvider || ((payload) => sendTrackedEmail({
    ...payload,
    suppressEmailLog: true,
    suppressTimelineEvent: true,
  }));
  let providerResult;
  try {
    providerResult = await sendProvider({
      to: recipient,
      subject: template.subject,
      html: template.html,
      text: template.text,
      templateKey: templateId,
      templateName: "Persoonlijke demo-uitnodiging",
      idempotencyKey: identity.idempotencyKey,
    });
  } catch (error) {
    providerResult = { sent: false, deliveryUnknown: true, errorCode: "provider_adapter_error", warning: safeError(error) };
  }

  const outcome = providerResult.sent ? "sent" : providerResult.deliveryUnknown ? "delivery_unknown" : "failed";
  let completed;
  try {
    completed = first(await rpc(config, "complete_demo_invitation", {
      input_email_log_id: planned.email_log_id,
      input_claim_token: claimToken,
      input_outcome: outcome,
      input_provider_message_id: cleanText(providerResult.id) || null,
      input_provider_metadata: safeProviderMetadata(providerResult),
      input_error_code: cleanText(providerResult.errorCode) || null,
      input_error_category: outcome === "delivery_unknown" ? "ambiguous_provider_result" : outcome === "failed" ? "definitive_provider_failure" : null,
      input_error_message: outcome === "sent" ? null : cleanText(providerResult.warning).slice(0, 500) || "Providerverzending is niet bevestigd.",
    }, dependencies.fetch || fetch));
  } catch (error) {
    const result = invitationResult("delivery_unknown", planned, preview, identity);
    result.warning = "Providerresultaat kon lokaal niet definitief worden geregistreerd; automatische retry is geblokkeerd.";
    result.errorCode = "PROVIDER_RESULT_PERSISTENCE_FAILED";
    return result;
  }
  return invitationResult(outcome === "sent" ? "sent" : outcome, { ...planned, ...completed }, preview, identity);
}

async function recordDemoPreviewOpen(input = {}, dependencies = {}) {
  const config = resolveConfig(input.config);
  const journeyId = uuid(input.journeyId || input.demoJourneyId);
  const token = cleanText(input.previewToken || input.token);
  const invitationReference = cleanText(input.invitationReference || input.invitation);
  if (!journeyId || !token) return { recorded: false, reason: "missing_preview_binding" };
  try {
    const row = first(await rpc(config, "record_demo_preview_open", {
      input_demo_journey_id: journeyId,
      input_preview_token_fingerprint: sha256(token),
      input_invitation_reference: invitationReference || null,
    }, dependencies.fetch || fetch));
    return { recorded: Boolean(row?.access_id), access: row || null };
  } catch (error) {
    return { recorded: false, reason: "preview_open_registration_failed" };
  }
}

function invitationIdentity({ journeyId, previewVersionId, templateId, templateVersion, recipient }) {
  const canonical = [MESSAGE_TYPE, uuid(journeyId), uuid(previewVersionId), cleanText(templateId), String(positiveInteger(templateVersion, 0)), normalizeEmail(recipient)].join("\n");
  const idempotencyKey = sha256(canonical);
  return { canonical, idempotencyKey, publicReference: sha256(`demo_invitation_public\n${idempotencyKey}`) };
}

function buildDemoInvitationTemplate(input = {}) {
  const businessName = cleanText(input.businessName) || "uw bedrijf";
  const contactName = cleanText(input.contactName);
  const previewUrl = cleanText(input.previewUrl);
  const salutation = contactName ? `Beste ${contactName},` : "Hallo,";
  const subject = `Uw persoonlijke demo voor ${businessName} staat klaar`;
  const text = [salutation, "", `De persoonlijke website-demo voor ${businessName} staat voor u klaar.`, "", previewUrl,
    "", "Deze link is persoonlijk. Deel hem daarom alleen met mensen die de demo mogen bekijken.", "",
    "Met vriendelijke groet,", "Max Webstudio", "info@maxwebstudio.nl"].join("\n");
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="supported-color-schemes" content="light dark"><style>@media (max-width: 620px){.wrap{padding:20px!important}.mws-cta{display:block!important}}</style></head><body><div class="wrap" style="max-width:620px;margin:auto;padding:32px;font-family:Arial,sans-serif;color:#132238"><img src="https://maxwebstudio.nl/max-webstudio-logo-mark.svg" alt="Max Webstudio" width="44"><p>${escapeHtml(salutation)}</p><h1 style="font-size:26px">Uw persoonlijke demo staat klaar</h1><p>De persoonlijke website-demo voor <strong>${escapeHtml(businessName)}</strong> staat voor u klaar.</p><p><a class="mws-cta" href="${escapeHtml(previewUrl)}" style="background:#0b63ce;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none">Bekijk mijn persoonlijke demo</a></p><p>Werkt de knop niet? Open dan deze link:<br><a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><p><strong>Let op:</strong> deze link is persoonlijk. Deel hem alleen met mensen die de demo mogen bekijken.</p><p>Met vriendelijke groet,<br>Max Webstudio<br><a href="mailto:info@maxwebstudio.nl">info@maxwebstudio.nl</a><br><a href="https://wa.me/31851302326">WhatsApp</a></p><p><a href="https://instagram.com/maxwebstudio.nl">Instagram</a> · <a href="https://linkedin.com/company/130444905">LinkedIn</a></p></div></body></html>`;
  return { subject, html, text };
}

async function fetchJourney(config, journeyId, fetchImpl) {
  const rows = await request(`${config.supabaseUrl}/rest/v1/demo_journeys?select=id,lead_id,customer_id,business_name,contact_name,email,preview_url,preview_token&id=eq.${encodeURIComponent(journeyId)}&limit=1`, { method: "GET", headers: restHeaders(config.serviceRoleKey) }, fetchImpl);
  return first(rows);
}

async function fetchActivePreview(config, journeyId, fetchImpl) {
  const rows = await request(`${config.supabaseUrl}/rest/v1/website_preview_versions?select=id,demo_journey_id,version,preview_url,preview_token,package_checksum,is_active&demo_journey_id=eq.${encodeURIComponent(journeyId)}&is_active=eq.true&limit=1`, { method: "GET", headers: restHeaders(config.serviceRoleKey) }, fetchImpl);
  return first(rows);
}

async function rpc(config, name, body, fetchImpl) {
  return request(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...restHeaders(config.serviceRoleKey), "Content-Type": "application/json", "Content-Profile": "public" },
    body: JSON.stringify(body),
  }, fetchImpl);
}

async function request(url, options, fetchImpl) {
  const response = await fetchImpl(url, options);
  const text = await response.text();
  let data = null;
  if (text) try { data = JSON.parse(text); } catch { throw contractError(response.status || 502, "Database gaf geen geldige response.", "INVALID_DATABASE_RESPONSE"); }
  if (!response.ok) throw contractError(response.status, data?.message || "Databaseverzoek is mislukt.", data?.code || "DATABASE_REQUEST_FAILED");
  return data;
}

function resolveConfig(config = {}) {
  const supabaseUrl = cleanText(config.supabaseUrl || process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(config.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) throw contractError(500, "Stagingdatabaseconfiguratie ontbreekt.", "MISSING_DATABASE_CONFIG");
  return { supabaseUrl, serviceRoleKey };
}

function invitationResult(state, record, preview, identity) {
  return { success: state === "sent" || state === "already_sent", state, sent: state === "sent" || state === "already_sent",
    emailLogId: cleanText(record?.email_log_id), providerMessageId: cleanText(record?.provider_message_id),
    previewVersionId: preview.id, previewVersion: Number(preview.version), previewChecksum: preview.package_checksum,
    idempotencyKey: identity.idempotencyKey, publicReference: identity.publicReference };
}

function safeProviderMetadata(result = {}) { return { provider: "resend", accepted: Boolean(result.sent), responseIdPresent: Boolean(cleanText(result.id)) }; }
function safeError(error) { return cleanText(error?.message || "Provideradapterfout").slice(0, 300); }
function appendQuery(url, key, value) { return `${url}${url.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(value)}`; }
function sha256(value) { return crypto.createHash("sha256").update(String(value), "utf8").digest("hex"); }
function normalizeEmail(value) { const email=cleanText(value).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:""; }
function uuid(value) { const text=cleanText(value); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)?text:""; }
function positiveInteger(value, fallback) { const number=Number(value); return Number.isInteger(number)&&number>0?number:fallback; }
function first(value) { return Array.isArray(value) ? value[0] || null : value || null; }
function restHeaders(key) { return { apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json","Accept-Profile":"public" }; }
function cleanText(value) { return String(value || "").trim(); }
function escapeHtml(value) { return cleanText(value).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]); }
function contractError(statusCode, message, code) { const error=new Error(message); error.statusCode=statusCode; error.status=statusCode; error.code=code; return error; }

module.exports = { MESSAGE_TYPE, buildDemoInvitationTemplate, invitationIdentity, recordDemoPreviewOpen, sendDemoInvitation };
