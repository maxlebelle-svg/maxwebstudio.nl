const crypto = require("node:crypto");
const { verifyAdmin } = require("./_admin-auth");
const { rest } = require("./services/partnerOnboardingAccessService");
const {
  buildSmokeTestMetadata,
  createSmokeTestTransaction,
  signhostConfig,
  startTransaction,
  uploadFileMetadata,
  uploadPdf,
} = require("./services/signhostService");

const BUCKET = "staff-private-documents";
const TEMPLATE_PATH = "signhost-smoke-tests/template/max-webstudio-signhost-technische-test.pdf";
const TEMPLATE_SHA256 = "1738a2a14d30f139aee3c7e71aa13c6f49f9dec2443519c100c138b14b0edf71";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (!["GET","POST"].includes(event.httpMethod)) return json(405, { success:false, error:"Methode niet toegestaan." });
  const auth = await verifyAdmin(event, json, {
    module:"signhost_smoke_test",
    action:event.httpMethod === "POST" ? "execute" : "view",
    allowedRoles:["super_admin"],
    allowedStatuses:["active"],
    disableLegacyToken:true,
  });
  if (!auth.success) return auth.response;
  try {
    const context = config();
    const input = event.httpMethod === "POST" ? parse(event.body) : {};
    if (event.httpMethod === "POST") {
      const action = clean(input.action);
      if (action === "start_smoke_test") await startSmokeTest(context, auth.admin, input);
      else if (action === "download_artifact") return artifactDownload(context, auth.admin, input);
      else return json(400, { success:false, error:"Onbekende Signhost-testactie." });
    }
    return statusResponse(context, auth.admin);
  } catch (error) {
    console.error("Admin Signhost smoke test failed", { code:error.code || "", status:error.status || 500, providerStatus:error.providerStatus || null });
    return json(error.status || 500, { success:false, code:error.code || "SIGNHOST_SMOKE_TEST_FAILED", error:error.status ? error.message : "De technische Signhost-test kon niet veilig worden uitgevoerd." });
  }
};

async function statusResponse(context, admin) {
  const rows = await rest(context.url, context.service, `signhost_smoke_tests?select=id,status,provider_status,signer_email,requested_at,signed_at,last_postback_at,signed_document_path,receipt_path,failure_code,created_at,updated_at&requested_by_profile_id=eq.${admin.profileId}&order=created_at.desc&limit=5`);
  return json(200, {
    success:true,
    enabled:smokeEnabled(admin.email),
    configured:Boolean(clean(process.env.SIGNHOST_APP_KEY) && clean(process.env.SIGNHOST_USER_TOKEN)),
    recipient:admin.email,
    current:rows?.[0] || null,
    history:rows || [],
  });
}

async function startSmokeTest(context, admin, input) {
  assertSmokeEnabled(admin.email);
  const requestKey = clean(input.idempotencyKey);
  if (requestKey.length < 16 || requestKey.length > 160) throw coded("IDEMPOTENCY_REQUIRED", 400, "De herhaalbeveiliging voor de test ontbreekt.");
  const existingByKey = await rest(context.url, context.service, `signhost_smoke_tests?select=id,status&request_key=eq.${encodeURIComponent(requestKey)}&limit=1`);
  if (existingByKey?.[0]) return existingByKey[0];
  const open = await rest(context.url, context.service, `signhost_smoke_tests?select=id,status&requested_by_profile_id=eq.${admin.profileId}&status=in.(creating,waiting_for_signer)&limit=1`);
  if (open?.[0]) return open[0];

  const profileRows = await rest(context.url, context.service, `profiles?select=id,name,email&id=eq.${admin.profileId}&limit=1`);
  const profile = profileRows?.[0];
  if (!profile?.id || clean(profile.email).toLowerCase() !== clean(admin.email).toLowerCase()) throw coded("TEST_PROFILE_INVALID", 409, "Het superadmin-testprofiel kon niet veilig worden vastgesteld.");
  const signerName = clean(profile.name) || "Max Webstudio testbeheerder";
  const rows = await rest(context.url, context.service, "signhost_smoke_tests", {
    method:"POST",
    headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      requested_by_profile_id:admin.profileId,
      request_key:requestKey,
      signer_email:admin.email,
      signer_name:signerName,
      template_bucket:BUCKET,
      template_path:TEMPLATE_PATH,
      template_sha256:TEMPLATE_SHA256,
      status:"creating",
    }),
  });
  const smoke = rows?.[0];
  if (!smoke?.id) throw coded("SMOKE_TEST_CREATE_FAILED", 502, "De technische test kon niet worden vastgelegd.");
  try {
    const pdf = await storageDownload(context, TEMPLATE_PATH);
    const checksum = crypto.createHash("sha256").update(pdf).digest("hex");
    if (checksum !== TEMPLATE_SHA256) throw coded("SMOKE_TEMPLATE_INTEGRITY_FAILED", 409, "De integriteitscontrole van het testdocument is mislukt.");
    const provider = signhostConfig();
    const signerInput = { signerEmail:admin.email, signerName };
    const transaction = await createSmokeTestTransaction(provider, signerInput);
    const transactionId = clean(transaction.Id || transaction.id);
    if (!UUID.test(transactionId)) throw coded("SIGNHOST_RESPONSE_INVALID", 502, "Signhost gaf geen geldig testtransactienummer terug.");
    await uploadFileMetadata(provider, transactionId, smoke.provider_file_id, buildSmokeTestMetadata(transaction, signerInput));
    await uploadPdf(provider, transactionId, smoke.provider_file_id, pdf);
    await startTransaction(provider, transactionId);
    const now = new Date().toISOString();
    await rest(context.url, context.service, `signhost_smoke_tests?id=eq.${smoke.id}`, {
      method:"PATCH",
      body:JSON.stringify({ provider_transaction_id:transactionId, provider_status:Number(transaction.Status || 10), status:"waiting_for_signer", requested_at:now, updated_at:now }),
    });
  } catch (error) {
    await rest(context.url, context.service, `signhost_smoke_tests?id=eq.${smoke.id}`, { method:"PATCH", body:JSON.stringify({ status:"failed", failure_code:clean(error.code || "provider_error").slice(0,120), updated_at:new Date().toISOString() }) }).catch(() => {});
    throw error;
  }
}

async function artifactDownload(context, admin, input) {
  const id = uuid(input.testId, "Kies een geldige Signhost-test.");
  const type = clean(input.artifactType);
  if (!['signed_document','receipt'].includes(type)) throw coded("INVALID_ARTIFACT", 400, "Kies het ondertekende testdocument of auditbewijs.");
  const rows = await rest(context.url, context.service, `signhost_smoke_tests?select=id,status,signed_document_path,receipt_path&id=eq.${id}&requested_by_profile_id=eq.${admin.profileId}&limit=1`);
  const row = rows?.[0];
  const path = type === "receipt" ? row?.receipt_path : row?.signed_document_path;
  if (!row || row.status !== "signed" || !path) throw coded("ARTIFACT_NOT_READY", 409, "Dit testbewijs is nog niet beschikbaar.");
  const response = await fetch(`${context.url}/storage/v1/object/sign/${BUCKET}/${encodePath(path)}`, {
    method:"POST",
    headers:serviceHeaders(context),
    body:JSON.stringify({ expiresIn:60 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw coded("ARTIFACT_DOWNLOAD_FAILED", 502, "Het testbewijs kon niet veilig worden geopend.");
  const url = resolveSignedUrl(context.url, data.signedURL || data.signedUrl || data.url);
  if (!url) throw coded("ARTIFACT_DOWNLOAD_FAILED", 502, "Het testbewijs kon niet veilig worden geopend.");
  return json(200, { success:true, url, expiresIn:60, artifactType:type });
}

async function storageDownload(context, path) {
  const response = await fetch(`${context.url}/storage/v1/object/${BUCKET}/${encodePath(path)}`, { headers:serviceHeaders(context, false) });
  if (!response.ok) throw coded("SMOKE_TEMPLATE_DOWNLOAD_FAILED", 502, "Het technische testdocument kon niet veilig worden geladen.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 9 || bytes.subarray(0,5).toString("ascii") !== "%PDF-") throw coded("SMOKE_TEMPLATE_INVALID", 409, "Het technische testdocument is geen geldige PDF.");
  return bytes;
}

function smokeEnabled(email, env = process.env) {
  if (clean(env.SIGNHOST_SMOKE_TEST_ENABLED).toLowerCase() !== "true") return false;
  const allowlist = clean(env.SIGNHOST_SMOKE_TEST_ALLOWED_EMAILS).split(",").map((value) => clean(value).toLowerCase()).filter(Boolean);
  return allowlist.includes(clean(email).toLowerCase());
}
function assertSmokeEnabled(email) { if (!smokeEnabled(email)) throw coded("SMOKE_TEST_DISABLED", 409, "De Signhost-test is niet expliciet voor dit stagingaccount ingeschakeld."); }
function config(){const url=clean(process.env.SUPABASE_URL).replace(/\/$/,"");const service=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!service)throw coded("CONFIG_MISSING",500,"Signhost-testconfiguratie ontbreekt.");return {url,service};}
function serviceHeaders(context, jsonBody = true){return {apikey:context.service,Authorization:`Bearer ${context.service}`,...(jsonBody?{"Content-Type":"application/json"}:{})};}
function resolveSignedUrl(base,value){const path=clean(value);if(!path)return "";if(path.startsWith("http"))return path;if(path.startsWith("/storage/v1/"))return `${base}${path}`;if(path.startsWith("/object/"))return `${base}/storage/v1${path}`;return `${base}/storage/v1/${path.replace(/^\/+/,"")}`;}
function encodePath(value){return String(value).split("/").map(encodeURIComponent).join("/");}
function uuid(value,message){const result=clean(value);if(!UUID.test(result))throw coded("INVALID_ID",400,message);return result;}
function parse(value){try{const parsed=JSON.parse(value||"{}");return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};}catch{throw coded("INVALID_JSON",400,"Ongeldige invoer.");}}
function clean(value){return String(value??"").trim();}
function coded(code,status,message){return Object.assign(new Error(message),{code,status});}
function json(statusCode,body){return {statusCode,headers:{"Content-Type":"application/json","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"},body:JSON.stringify(body)};}

exports._test = { TEMPLATE_PATH, TEMPLATE_SHA256, resolveSignedUrl, smokeEnabled };

