const crypto = require("node:crypto");
const { rest } = require("./services/partnerOnboardingAccessService");
const { downloadReceipt, downloadSignedPdf, signhostConfig, validatePostback } = require("./services/signhostService");

const BUCKET = "staff-private-documents";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return ok();
  const input = parseSoft(event.body);
  // Signhost probes a new global postback URL with an empty POST.
  if (!Object.keys(input).length) return ok();
  try {
    const validation = validatePostback(input, event.headers || {});
    if (!validation.valid) {
      console.error("Signhost postback rejected", { reason:validation.reason });
      return ok();
    }
    const context = config();
    const rows = await rest(context.url, context.service, `staff_signing_transactions?select=*&provider=eq.signhost&provider_transaction_id=eq.${encodeURIComponent(validation.id)}&limit=1`);
    const signing = rows?.[0];
    if (!signing) {
      const smokeRows = await rest(context.url, context.service, `signhost_smoke_tests?select=*&provider=eq.signhost&provider_transaction_id=eq.${encodeURIComponent(validation.id)}&limit=1`);
      const smoke = smokeRows?.[0];
      if (!smoke) {
        console.error("Signhost postback has no local transaction", { providerStatus:validation.status });
        return ok();
      }
      await processSmokePostback(context, smoke, validation);
      return ok();
    }
    const now = new Date().toISOString();
    const patch = { provider_status:validation.status, status:validation.mappedStatus, last_postback_at:now, updated_at:now };
    if (validation.mappedStatus === "signed_pending_scan") {
      if (!signing.signed_document_path || !signing.receipt_path) Object.assign(patch, await preserveArtifacts(context, signing));
      patch.signed_at = signing.signed_at || now;
    }
    await rest(context.url, context.service, `staff_signing_transactions?id=eq.${signing.id}`, { method:"PATCH", body:JSON.stringify(patch) });
    await logEvent(context, signing, eventName(validation.mappedStatus), { provider:"signhost", providerStatus:validation.status, artifactsQuarantined:validation.mappedStatus === "signed_pending_scan" });
  } catch (error) {
    // A 2xx response prevents Signhost's global queue from being blocked. Errors are
    // retained in server logs and can be replayed from the provider portal.
    console.error("Signhost postback processing failed", { code:error.code || "POSTBACK_FAILED", status:error.status || 500 });
  }
  return ok();
};

async function processSmokePostback(context, smoke, validation) {
  const now = new Date().toISOString();
  const status = smokeStatus(validation.mappedStatus);
  const patch = { provider_status:validation.status, status, last_postback_at:now, updated_at:now };
  if (status === "signed") {
    if (!smoke.signed_document_path || !smoke.receipt_path) Object.assign(patch, await preserveSmokeArtifacts(context, smoke));
    patch.signed_at = smoke.signed_at || now;
  }
  await rest(context.url, context.service, `signhost_smoke_tests?id=eq.${smoke.id}`, { method:"PATCH", body:JSON.stringify(patch) });
}

async function preserveArtifacts(context, signing) {
  const provider = signhostConfig();
  const [document, receipt] = await Promise.all([
    downloadSignedPdf(provider, signing.provider_transaction_id, signing.provider_file_id),
    downloadReceipt(provider, signing.provider_transaction_id),
  ]);
  assertPdf(document.bytes, "ondertekende overeenkomst");
  assertPdf(receipt.bytes, "ondertekenbewijs");
  const documentId = crypto.randomUUID();
  const documentPath = `${signing.profile_id}/${documentId}/signhost-ondertekende-overeenkomst.pdf`;
  const receiptPath = `${signing.profile_id}/${signing.id}/signhost-ondertekenbewijs.pdf`;
  await Promise.all([
    storageUpload(context, documentPath, document.bytes),
    storageUpload(context, receiptPath, receipt.bytes),
  ]);
  const documentSha = crypto.createHash("sha256").update(document.bytes).digest("hex");
  const receiptSha = crypto.createHash("sha256").update(receipt.bytes).digest("hex");
  await rest(context.url, context.service, "staff_zzp_documents", { method:"POST", headers:{ Prefer:"resolution=ignore-duplicates" }, body:JSON.stringify({
    id:documentId,
    dossier_id:signing.dossier_id,
    profile_id:signing.profile_id,
    document_type:"signed_assignment_agreement",
    identity_document_type:null,
    storage_path:documentPath,
    original_filename:"signhost-ondertekende-zzp-overeenkomst.pdf",
    mime_type:"application/pdf",
    size_bytes:document.bytes.length,
    checksum_sha256:documentSha,
    status:"quarantined",
    scan_status:"pending",
    purpose:"Definitieve via Signhost ondertekende ZZP-overeenkomst",
    employee_declaration:"signhost_provider_artifact_v1",
    uploaded_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }) });
  return { signed_document_path:documentPath, receipt_path:receiptPath, signed_document_sha256:documentSha, receipt_sha256:receiptSha };
}

async function preserveSmokeArtifacts(context, smoke) {
  const provider = signhostConfig();
  const [document, receipt] = await Promise.all([
    downloadSignedPdf(provider, smoke.provider_transaction_id, smoke.provider_file_id),
    downloadReceipt(provider, smoke.provider_transaction_id),
  ]);
  assertPdf(document.bytes, "ondertekende technische test");
  assertPdf(receipt.bytes, "technisch testbewijs");
  const documentPath = `signhost-smoke-tests/${smoke.id}/ondertekende-technische-test.pdf`;
  const receiptPath = `signhost-smoke-tests/${smoke.id}/signhost-auditbewijs.pdf`;
  await Promise.all([
    storageUpload(context, documentPath, document.bytes),
    storageUpload(context, receiptPath, receipt.bytes),
  ]);
  return {
    signed_document_path:documentPath,
    receipt_path:receiptPath,
    signed_document_sha256:crypto.createHash("sha256").update(document.bytes).digest("hex"),
    receipt_sha256:crypto.createHash("sha256").update(receipt.bytes).digest("hex"),
  };
}

async function storageUpload(context, path, bytes) {
  const response = await fetch(`${context.url}/storage/v1/object/${BUCKET}/${encodePath(path)}`, {
    method:"POST",
    headers:{ apikey:context.service, Authorization:`Bearer ${context.service}`, "Content-Type":"application/pdf", "x-upsert":"false" },
    body:bytes,
  });
  if (!response.ok && response.status !== 409) throw coded("SIGNING_ARTIFACT_STORAGE_FAILED", 502, "Ondertekenbewijs kon niet veilig worden opgeslagen.");
}

function assertPdf(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 9 || bytes.subarray(0,5).toString("ascii") !== "%PDF-" || !bytes.subarray(Math.max(0, bytes.length-2048)).toString("latin1").includes("%%EOF")) {
    throw coded("SIGNHOST_ARTIFACT_INVALID", 502, `Signhost leverde geen geldige ${label}.`);
  }
}
async function logEvent(context, signing, eventType, metadata) { return rest(context.url, context.service, "staff_dossier_events", { method:"POST", body:JSON.stringify({ employee_profile_id:signing.profile_id, actor_profile_id:null, event_type:eventType, subject_type:"signing_transaction", subject_id:signing.id, safe_metadata:metadata }) }); }
function eventName(status){return ({signed_pending_scan:"signing.signed",rejected:"signing.rejected",expired:"signing.expired",cancelled:"signing.cancelled",failed:"signing.failed"})[status]||"signing.updated";}
function smokeStatus(status){return status === "signed_pending_scan" ? "signed" : status;}
function config(){const url=clean(process.env.SUPABASE_URL).replace(/\/$/,"");const service=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!service)throw coded("CONFIG_MISSING",500,"Postbackconfiguratie ontbreekt.");return {url,service};}
function encodePath(value){return String(value).split("/").map(encodeURIComponent).join("/");}
function parseSoft(value){try{const parsed=JSON.parse(value||"{}");return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};}catch{return {};}}
function clean(value){return String(value??"").trim();}
function coded(code,status,message){return Object.assign(new Error(message),{code,status});}
function ok(){return {statusCode:200,headers:{"Content-Type":"text/plain","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"},body:"OK"};}

exports._test = { assertPdf, eventName, parseSoft, smokeStatus };
