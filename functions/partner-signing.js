const crypto = require("node:crypto");
const { hasPartnerOnboardingAccess } = require("./services/profileAccessPolicy");
const { rest } = require("./services/partnerOnboardingAccessService");
const { buildAgreementMetadata, createTransaction, signhostConfig, startTransaction, uploadFileMetadata, uploadPdf } = require("./services/signhostService");

const BUCKET = "staff-private-documents";
const SIGNABLE_REVIEW_STATUSES = new Set(["internal_approved", "legally_reviewed"]);

exports.handler = async (event) => {
  if (!["GET","POST"].includes(event.httpMethod)) return json(405, { success:false, error:"Methode niet toegestaan." });
  try {
    const context = config();
    const token = bearer(event);
    if (!token) return json(401, { success:false, error:"Log opnieuw in." });
    const user = await authUser(context, token);
    const profile = await profileForUser(context, user.id);
    if (!profile || !hasPartnerOnboardingAccess(profile) || profile.role !== "sales_partner") {
      return json(403, { success:false, error:"Dit account heeft geen toegang tot de ZZP-ondertekening." });
    }
    if (event.httpMethod === "POST") {
      const input = parse(event.body);
      if (clean(input.action) !== "start_agreement") return json(400, { success:false, error:"Onbekende ondertekenactie." });
      const key = clean(input.idempotencyKey);
      if (key.length < 16 || key.length > 160) return json(400, { success:false, error:"De herhaalbeveiliging ontbreekt." });
      await startAgreement(context, profile);
    }
    return statusResponse(context, profile);
  } catch (error) {
    console.error("Partner signing failed", { code:error.code || "", status:error.status || 500, providerStatus:error.providerStatus || null });
    return json(error.status || 500, { success:false, code:error.code || "PARTNER_SIGNING_FAILED", error:error.status ? error.message : "Digitale ondertekening kon niet veilig worden verwerkt." });
  }
};

async function statusResponse(context, profile) {
  const [dossiers, transactions, templates] = await Promise.all([
    rest(context.url, context.service, `staff_zzp_dossiers?select=id,status,legal_name,phone&profile_id=eq.${profile.id}&limit=1`),
    rest(context.url, context.service, `staff_signing_transactions?select=id,status,provider,provider_status,requested_at,signed_at,failure_code,created_at,updated_at&profile_id=eq.${profile.id}&order=created_at.desc&limit=5`),
    rest(context.url, context.service, "partner_signing_templates?select=id,verification_method,active&provider=eq.signhost&active=eq.true&limit=1"),
  ]);
  const dossier = dossiers?.[0] || null;
  return json(200, {
    success:true,
    configured:Boolean(clean(process.env.SIGNHOST_APP_KEY) && clean(process.env.SIGNHOST_USER_TOKEN)),
    templateReady:Boolean(templates?.[0]),
    dossierReady:Boolean(dossier?.id && dossier?.legal_name && dossier?.phone),
    current:transactions?.[0] || null,
    history:transactions || [],
  });
}

async function startAgreement(context, profile) {
  const [dossiers, templates] = await Promise.all([
    rest(context.url, context.service, `staff_zzp_dossiers?select=id,status,legal_name,phone&profile_id=eq.${profile.id}&limit=1`),
    rest(context.url, context.service, "partner_signing_templates?select=*&provider=eq.signhost&active=eq.true&limit=1"),
  ]);
  const dossier = dossiers?.[0];
  if (!dossier?.id || !clean(dossier.legal_name) || !clean(dossier.phone)) throw coded("SIGNING_DOSSIER_INCOMPLETE", 409, "Vul eerst je naam en mobiele telefoonnummer in het ZZP-dossier in.");
  const template = templates?.[0];
  if (!template) throw coded("SIGNING_TEMPLATE_NOT_READY", 409, "De goedgekeurde ZZP-overeenkomst is nog niet geactiveerd.");
  const versions = await rest(context.url, context.service, `partner_document_versions?select=id,version_code,review_status,status&id=eq.${template.document_version_id}&limit=1`);
  const version = versions?.[0];
  if (!version || version.status !== "published" || !SIGNABLE_REVIEW_STATUSES.has(version.review_status)) {
    throw coded("SIGNING_TEMPLATE_NOT_APPROVED", 409, "De overeenkomst moet eerst expliciet door de eigenaar of een jurist worden goedgekeurd.");
  }
  const open = await rest(context.url, context.service, `staff_signing_transactions?select=id,status&dossier_id=eq.${dossier.id}&status=in.(creating,waiting_for_signer,signed_pending_scan)&limit=1`);
  if (open?.[0]) return open[0];

  const countersignerEmail = clean(process.env.SIGNHOST_COUNTERSIGNER_EMAIL);
  const countersignerName = clean(process.env.SIGNHOST_COUNTERSIGNER_NAME);
  if (!countersignerEmail || !countersignerName) throw coded("SIGNHOST_COUNTERSIGNER_MISSING", 503, "De bevoegde medeondertekenaar is nog niet ingesteld.");
  const rows = await rest(context.url, context.service, "staff_signing_transactions", {
    method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({
      dossier_id:dossier.id, profile_id:profile.id, template_id:template.id,
      signer_email:profile.email, signer_name:dossier.legal_name,
      countersigner_email:countersignerEmail, countersigner_name:countersignerName,
      status:"creating",
    }),
  });
  const signing = rows?.[0];
  try {
    const pdf = await storageDownload(context, template.storage_path);
    const checksum = crypto.createHash("sha256").update(pdf).digest("hex");
    if (checksum !== template.checksum_sha256) throw coded("SIGNING_TEMPLATE_INTEGRITY_FAILED", 409, "De integriteitscontrole van de overeenkomst is mislukt.");
    const provider = signhostConfig();
    const signerInput = {
      signerEmail:profile.email, signerName:dossier.legal_name, signerPhone:dossier.phone,
      countersignerEmail, countersignerName, verificationMethod:template.verification_method,
    };
    const transaction = await createTransaction(provider, signerInput);
    const transactionId = clean(transaction.Id || transaction.id);
    if (!transactionId) throw coded("SIGNHOST_RESPONSE_INVALID", 502, "Signhost gaf geen geldig transactienummer terug.");
    await uploadFileMetadata(provider, transactionId, signing.provider_file_id, buildAgreementMetadata(transaction, signerInput));
    await uploadPdf(provider, transactionId, signing.provider_file_id, pdf);
    await startTransaction(provider, transactionId);
    const now = new Date().toISOString();
    await rest(context.url, context.service, `staff_signing_transactions?id=eq.${signing.id}`, {
      method:"PATCH", body:JSON.stringify({ provider_transaction_id:transactionId, provider_status:Number(transaction.Status || 10), status:"waiting_for_signer", requested_at:now, updated_at:now }),
    });
    await logEvent(context, profile.id, profile.id, "signing.requested", signing.id, { provider:"signhost", agreementVersion:version.version_code, verificationMethod:template.verification_method });
    return signing;
  } catch (error) {
    await rest(context.url, context.service, `staff_signing_transactions?id=eq.${signing.id}`, { method:"PATCH", body:JSON.stringify({ status:"failed", failure_code:clean(error.code || "provider_error").slice(0,120), updated_at:new Date().toISOString() }) }).catch(() => {});
    throw error;
  }
}

async function storageDownload(context, path) {
  const response = await fetch(`${context.url}/storage/v1/object/${BUCKET}/${encodePath(path)}`, { headers:serviceHeaders(context) });
  if (!response.ok) throw coded("SIGNING_TEMPLATE_DOWNLOAD_FAILED", 502, "De overeenkomst kon niet veilig worden geladen.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 9 || bytes.subarray(0,5).toString("ascii") !== "%PDF-") throw coded("SIGNING_TEMPLATE_INVALID", 409, "De geactiveerde overeenkomst is geen geldige PDF.");
  return bytes;
}

async function logEvent(context, employeeProfileId, actorProfileId, eventType, subjectId, metadata) {
  return rest(context.url, context.service, "staff_dossier_events", { method:"POST", body:JSON.stringify({ employee_profile_id:employeeProfileId, actor_profile_id:actorProfileId, event_type:eventType, subject_type:"signing_transaction", subject_id:subjectId, safe_metadata:metadata }) });
}
async function authUser(context, token) { const response=await fetch(`${context.url}/auth/v1/user`,{headers:{apikey:context.anon,Authorization:`Bearer ${token}`}});const data=await response.json().catch(()=>({}));if(!response.ok||!data.id)throw coded("AUTH_INVALID",401,"Sessie is ongeldig.");return data; }
async function profileForUser(context,userId){return (await rest(context.url,context.service,`profiles?select=id,name,email,role,status&auth_user_id=eq.${userId}&limit=1`))?.[0]||null;}
function config(){const url=clean(process.env.SUPABASE_URL).replace(/\/$/,"");const anon=clean(process.env.SUPABASE_ANON_KEY);const service=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!anon||!service)throw coded("CONFIG_MISSING",500,"Ondertekenconfiguratie ontbreekt.");return {url,anon,service};}
function serviceHeaders(context){return {apikey:context.service,Authorization:`Bearer ${context.service}`};}
function encodePath(value){return String(value).split("/").map(encodeURIComponent).join("/");}
function bearer(event){const value=event.headers?.authorization||event.headers?.Authorization||"";return value.startsWith("Bearer ")?value.slice(7).trim():"";}
function parse(value){try{return JSON.parse(value||"{}");}catch{throw coded("INVALID_JSON",400,"Ongeldige invoer.");}}
function clean(value){return String(value??"").trim();}
function coded(code,status,message){return Object.assign(new Error(message),{code,status});}
function json(statusCode,body){return {statusCode,headers:{"Content-Type":"application/json","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"},body:JSON.stringify(body)};}

exports._test = { statusResponse };
