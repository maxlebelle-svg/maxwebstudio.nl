const crypto = require("node:crypto");
const { rest } = require("./services/partnerOnboardingAccessService");

const BUCKET = "staff-private-documents";
const MAX_BYTES = 8 * 1024 * 1024;
const INTERNAL_ROLES = new Set(["super_admin","admin","sales_manager","sales_partner","designer","developer","support"]);
const DOCUMENT_TYPES = new Set(["signed_assignment_agreement","identity_verification_copy","bank_account_proof","kvk_extract","other"]);
const IDENTITY_TYPES = new Set(["passport","identity_card","driving_licence"]);
const MIME_TYPES = new Set(["application/pdf","image/jpeg","image/png"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (!["GET","POST"].includes(event.httpMethod)) return json(405, { success:false, error:"Methode niet toegestaan." });
  try {
    const context = config();
    const token = bearer(event);
    if (!token) return json(401, { success:false, error:"Log opnieuw in." });
    const user = await authUser(context, token);
    const profile = await profileForUser(context, user.id);
    if (!profile || !INTERNAL_ROLES.has(profile.role) || !["invited","pending","active"].includes(profile.status)) {
      return json(403, { success:false, error:"Dit account heeft geen toegang tot het medewerkersdossier." });
    }
    if (event.httpMethod === "GET") return dossierResponse(context, profile);

    const input = parse(event.body);
    const action = clean(input.action).toLowerCase();
    if (action === "save_dossier") await saveDossier(context, profile, input, false);
    else if (action === "submit_dossier") await saveDossier(context, profile, input, true);
    else if (action === "prepare_document") return prepareDocument(context, profile, input);
    else if (action === "finalize_document") return finalizeDocument(context, profile, input);
    else if (action === "send_message") await sendMessage(context, profile, input);
    else if (action === "mark_messages_read") await markMessagesRead(context, profile);
    else return json(400, { success:false, error:"Onbekende dossieractie." });
    return dossierResponse(context, profile);
  } catch (error) {
    console.error("Staff self service failed", { code:error.code || "", status:error.status || 500 });
    return json(error.status || 500, { success:false, code:error.code || "STAFF_DOSSIER_FAILED", error:error.status ? error.message : "Het dossier kon niet veilig worden verwerkt." });
  }
};

async function dossierResponse(context, profile) {
  const [dossiers, documents, messages] = await Promise.all([
    rest(context.url, context.service, `staff_zzp_dossiers?select=*&profile_id=eq.${profile.id}&limit=1`),
    rest(context.url, context.service, `staff_zzp_documents?select=id,document_type,identity_document_type,original_filename,mime_type,size_bytes,status,scan_status,purpose,uploaded_at,reviewed_at,rejection_reason,created_at&profile_id=eq.${profile.id}&status=neq.archived&order=created_at.desc`),
    rest(context.url, context.service, `staff_messages?select=id,employee_profile_id,sender_profile_id,body,read_at,created_at&employee_profile_id=eq.${profile.id}&archived_at=is.null&order=created_at.asc&limit=500`),
  ]);
  const dossier = dossiers?.[0] || null;
  return json(200, {
    success:true,
    profile:{ id:profile.id, name:profile.name, email:profile.email, role:profile.role, status:profile.status },
    dossier:safeDossier(dossier),
    documents:documents || [],
    messages:(messages || []).map((message) => ({ ...message, mine:message.sender_profile_id === profile.id })),
    completeness:completeness(dossier, documents || []),
    privacy:{ relationshipType:"zzp", bankCardStored:false, identityCopyOptional:true, identityInstruction:"Gebruik een watermerk en scherm het BSN af wanneer dit niet noodzakelijk is." },
  });
}

async function saveDossier(context, profile, input, submit) {
  if (profile.role !== "sales_partner") throw coded("ZZP_ROLE_REQUIRED", 409, "Het ZZP-dossier is alleen beschikbaar voor salespartners.");
  const partnerRows = await rest(context.url, context.service, `partner_profiles?select=id&profile_id=eq.${profile.id}&limit=1`);
  const currentRows = await rest(context.url, context.service, `staff_zzp_dossiers?select=id,status&profile_id=eq.${profile.id}&limit=1`);
  const current = currentRows?.[0] || null;
  const record = validatedDossier(input, profile, partnerRows?.[0]?.id || null, submit);
  if (submit) {
    if (!current) throw coded("SAVE_FIRST", 409, "Sla het dossier eerst op voordat je het indient.");
    const docs = await rest(context.url, context.service, `staff_zzp_documents?select=id,document_type,status&profile_id=eq.${profile.id}&status=eq.available`);
    const types = new Set((docs || []).map((doc) => doc.document_type));
    if (!types.has("signed_assignment_agreement") || !types.has("bank_account_proof")) {
      throw coded("REQUIRED_DOCUMENTS_MISSING", 409, "Upload eerst de ondertekende overeenkomst en een afgeschermd rekeningbewijs.");
    }
  }
  let rows;
  if (current) {
    rows = await rest(context.url, context.service, `staff_zzp_dossiers?id=eq.${current.id}&profile_id=eq.${profile.id}`, { method:"PATCH", headers:{ Prefer:"return=representation" }, body:JSON.stringify(record) });
  } else {
    rows = await rest(context.url, context.service, "staff_zzp_dossiers", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify(record) });
  }
  const dossier = rows?.[0];
  await event(context, profile.id, profile.id, submit ? "dossier.submitted" : "dossier.saved", "dossier", dossier.id, { status:dossier.status });
}

function validatedDossier(input, profile, partnerProfileId, submit) {
  const value = (key, max = 160) => clean(input[key]).slice(0, max) || null;
  const kvk = clean(input.kvkNumber).replace(/\s/g, "");
  const vat = clean(input.vatNumber).replace(/[\s.-]/g, "").toUpperCase();
  const iban = clean(input.iban).replace(/\s/g, "").toUpperCase();
  if (kvk && !/^\d{8}$/.test(kvk)) throw coded("INVALID_KVK", 400, "Vul een geldig KvK-nummer van 8 cijfers in.");
  if (vat && !/^[A-Z]{2}[A-Z0-9]{6,18}$/.test(vat)) throw coded("INVALID_VAT", 400, "Vul een geldig btw-nummer in.");
  if (iban && !ibanValid(iban)) throw coded("INVALID_IBAN", 400, "Vul een geldig IBAN in.");
  const record = {
    profile_id:profile.id, partner_profile_id:partnerProfileId, relationship_type:"zzp",
    status:submit ? "submitted" : "draft", legal_name:value("legalName"), trade_name:value("tradeName"),
    phone:value("phone", 40), street:value("street"), house_number:value("houseNumber", 30),
    postal_code:value("postalCode", 20)?.toUpperCase() || null, city:value("city"), country_code:(value("countryCode",2) || "NL").toUpperCase(),
    kvk_number:kvk || null, vat_number:vat || null, iban:iban || null, iban_account_name:value("ibanAccountName"),
    submitted_at:submit ? new Date().toISOString() : null, verified_at:null, verified_by_profile_id:null,
    updated_at:new Date().toISOString(),
  };
  if (submit && ["legal_name","phone","street","house_number","postal_code","city","kvk_number","vat_number","iban","iban_account_name"].some((key) => !record[key])) {
    throw coded("DOSSIER_INCOMPLETE", 400, "Vul eerst alle verplichte ZZP- en NAW-gegevens in.");
  }
  return record;
}

async function prepareDocument(context, profile, input) {
  if (profile.role !== "sales_partner") throw coded("ZZP_ROLE_REQUIRED", 409, "Documentupload is alleen beschikbaar voor salespartners.");
  const dossierRows = await rest(context.url, context.service, `staff_zzp_dossiers?select=id&profile_id=eq.${profile.id}&limit=1`);
  const dossier = dossierRows?.[0];
  if (!dossier) throw coded("DOSSIER_REQUIRED", 409, "Sla eerst je ZZP-gegevens op.");
  const meta = validateDocument(input);
  const documentId = crypto.randomUUID();
  const storagePath = `${profile.id}/${documentId}/${safeFilename(meta.filename)}`;
  const uploadUrl = await signedUploadUrl(context, storagePath);
  const uploadId = seal({ version:1, exp:Math.floor(Date.now()/1000)+1800, documentId, dossierId:dossier.id, profileId:profile.id, storagePath, ...meta }, context.service);
  return json(200, { success:true, uploadId, uploadUrl, uploadMethod:"PUT", uploadHeaders:{ "x-upsert":"false" }, expiresIn:1800 });
}

async function finalizeDocument(context, profile, input) {
  const prepared = openSeal(clean(input.uploadId), context.service);
  if (prepared.profileId !== profile.id || !UUID.test(prepared.documentId)) throw coded("UPLOAD_INVALID", 400, "De uploadcontext is ongeldig.");
  const existing = await rest(context.url, context.service, `staff_zzp_documents?select=id&profile_id=eq.${profile.id}&id=eq.${prepared.documentId}&limit=1`);
  if (existing?.[0]) return dossierResponse(context, profile);
  const stored = await storageDownload(context, prepared.storagePath);
  validateBytes(stored.bytes, prepared.mimeType, prepared.sizeBytes);
  const checksum = crypto.createHash("sha256").update(stored.bytes).digest("hex");
  const rows = await rest(context.url, context.service, "staff_zzp_documents", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({
    id:prepared.documentId, dossier_id:prepared.dossierId, profile_id:profile.id, document_type:prepared.documentType,
    identity_document_type:prepared.identityDocumentType || null, storage_path:prepared.storagePath,
    original_filename:prepared.filename, mime_type:prepared.mimeType, size_bytes:stored.bytes.length, checksum_sha256:checksum,
    status:"available", scan_status:"not_configured", purpose:prepared.purpose, employee_declaration:prepared.declaration,
    uploaded_at:new Date().toISOString(), updated_at:new Date().toISOString(),
  }) });
  await event(context, profile.id, profile.id, "document.uploaded", "document", rows[0].id, { documentType:prepared.documentType, scanStatus:"not_configured" });
  return dossierResponse(context, profile);
}

function validateDocument(input) {
  const documentType = clean(input.documentType);
  const identityDocumentType = clean(input.identityDocumentType) || null;
  const filename = clean(input.filename).normalize("NFC");
  const mimeType = clean(input.mimeType).toLowerCase();
  const sizeBytes = Number(input.sizeBytes || 0);
  if (!DOCUMENT_TYPES.has(documentType)) throw coded("INVALID_DOCUMENT_TYPE", 400, "Kies een geldig documenttype.");
  if (documentType === "identity_verification_copy" && !IDENTITY_TYPES.has(identityDocumentType)) throw coded("INVALID_IDENTITY_TYPE", 400, "Kies het type identiteitsdocument.");
  if (documentType !== "identity_verification_copy" && identityDocumentType) throw coded("INVALID_IDENTITY_TYPE", 400, "Identiteitstype hoort alleen bij een verificatiekopie.");
  if (!filename || filename.length > 180 || /[\x00-\x1f\x7f\\/]/.test(filename)) throw coded("INVALID_FILENAME", 400, "De bestandsnaam is ongeldig.");
  if (!MIME_TYPES.has(mimeType)) throw coded("INVALID_MIME", 400, "Gebruik een PDF-, JPG- of PNG-bestand.");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_BYTES) throw coded("INVALID_SIZE", 400, "Gebruik een bestand van maximaal 8 MB.");
  const purpose = documentType === "identity_verification_copy" ? "Optionele ZZP-identiteitsverificatie voor Max Webstudio" : "ZZP-onboarding en dossiercontrole";
  const declaration = clean(input.declaration);
  if (declaration !== "staff_zzp_document_upload_nl_v1") throw coded("DECLARATION_REQUIRED", 400, "Bevestig de veilige documentaanlevering.");
  return { documentType, identityDocumentType, filename, mimeType, sizeBytes, purpose, declaration };
}

async function sendMessage(context, profile, input) {
  const body = clean(input.body);
  if (!body || body.length > 4000) throw coded("INVALID_MESSAGE", 400, "Schrijf een bericht van maximaal 4.000 tekens.");
  const key = clean(input.idempotencyKey);
  if (key.length < 16 || key.length > 160) throw coded("INVALID_IDEMPOTENCY", 400, "De berichtbeveiliging ontbreekt.");
  const rows = await rest(context.url, context.service, "staff_messages", { method:"POST", headers:{ Prefer:"return=representation,resolution=ignore-duplicates" }, body:JSON.stringify({ employee_profile_id:profile.id, sender_profile_id:profile.id, body, idempotency_key:key }) });
  if (rows?.[0]) await event(context, profile.id, profile.id, "message.sent", "message", rows[0].id, {});
}

async function markMessagesRead(context, profile) {
  await rest(context.url, context.service, `staff_messages?employee_profile_id=eq.${profile.id}&sender_profile_id=neq.${profile.id}&read_at=is.null`, { method:"PATCH", body:JSON.stringify({ read_at:new Date().toISOString() }) });
}

async function event(context, employeeProfileId, actorProfileId, eventType, subjectType, subjectId, metadata) {
  await rest(context.url, context.service, "staff_dossier_events", { method:"POST", body:JSON.stringify({ employee_profile_id:employeeProfileId, actor_profile_id:actorProfileId, event_type:eventType, subject_type:subjectType, subject_id:subjectId, safe_metadata:metadata }) });
}

function safeDossier(row) {
  if (!row) return null;
  return { id:row.id, status:row.status, relationshipType:row.relationship_type, legalName:row.legal_name || "", tradeName:row.trade_name || "", phone:row.phone || "", street:row.street || "", houseNumber:row.house_number || "", postalCode:row.postal_code || "", city:row.city || "", countryCode:row.country_code || "NL", kvkNumber:row.kvk_number || "", vatNumber:row.vat_number || "", iban:row.iban || "", ibanAccountName:row.iban_account_name || "", submittedAt:row.submitted_at, verifiedAt:row.verified_at, changeRequestReason:row.change_request_reason || "", updatedAt:row.updated_at };
}

function completeness(dossier, documents) {
  const fields = dossier ? ["legal_name","phone","street","house_number","postal_code","city","kvk_number","vat_number","iban","iban_account_name"] : [];
  const completeFields = fields.filter((key) => clean(dossier?.[key])).length;
  const types = new Set((documents || []).filter((doc) => doc.status === "available").map((doc) => doc.document_type));
  const completed = completeFields + Number(types.has("signed_assignment_agreement")) + Number(types.has("bank_account_proof"));
  return { percent:Math.round(completed/12*100), completed, total:12, missingRequiredDocuments:["signed_assignment_agreement","bank_account_proof"].filter((type) => !types.has(type)) };
}

function ibanValid(value) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(value)) return false;
  const rearranged = value.slice(4) + value.slice(0,4);
  const numeric = [...rearranged].map((char) => /[A-Z]/.test(char) ? String(char.charCodeAt(0)-55) : char).join("");
  let remainder = 0; for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

function validateBytes(bytes, mimeType, expectedSize) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES || bytes.length !== expectedSize) throw coded("STORED_FILE_INVALID", 409, "Het opgeslagen bestand wijkt af van de upload.");
  const valid = mimeType === "application/pdf" ? bytes.subarray(0,5).toString() === "%PDF-" : mimeType === "image/png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) throw coded("FILE_SIGNATURE_INVALID", 400, "De bestandsinhoud past niet bij het gekozen bestandstype.");
}

async function signedUploadUrl(context, path) {
  const response = await fetch(`${context.url}/storage/v1/object/upload/sign/${BUCKET}/${encodePath(path)}`, { method:"POST", headers:serviceHeaders(context), body:"{}" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw coded("UPLOAD_URL_FAILED", 502, "De veilige upload kon niet worden gestart.");
  const value = clean(data.url || data.signedURL || data.signedUrl);
  if (!value) throw coded("UPLOAD_URL_FAILED", 502, "De veilige upload kon niet worden gestart.");
  return resolveSignedUrl(context.url, value);
}

async function storageDownload(context, path) {
  const response = await fetch(`${context.url}/storage/v1/object/${BUCKET}/${encodePath(path)}`, { headers:serviceHeaders(context) });
  if (!response.ok) throw coded("STORAGE_READ_FAILED", response.status === 404 ? 409 : 502, "De upload kon niet worden afgerond.");
  return { bytes:Buffer.from(await response.arrayBuffer()) };
}

async function authUser(context, token) {
  const response = await fetch(`${context.url}/auth/v1/user`, { headers:{ apikey:context.anon, Authorization:`Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw coded("AUTH_INVALID", 401, "Sessie is ongeldig.");
  return data;
}
async function profileForUser(context, userId) { return (await rest(context.url, context.service, `profiles?select=id,name,email,role,status&auth_user_id=eq.${userId}&limit=1`))?.[0] || null; }
function config() { const url=clean(process.env.SUPABASE_URL).replace(/\/$/,""); const anon=clean(process.env.SUPABASE_ANON_KEY); const service=clean(process.env.SUPABASE_SERVICE_ROLE_KEY); if(!url||!anon||!service) throw coded("CONFIG_MISSING",500,"Dossierconfiguratie ontbreekt."); return {url,anon,service}; }
function serviceHeaders(context){return { apikey:context.service, Authorization:`Bearer ${context.service}`, "Content-Type":"application/json" };}
function seal(payload, secret){const body=Buffer.from(JSON.stringify(payload)).toString("base64url");const sig=crypto.createHmac("sha256",secret).update(body).digest("base64url");return `v1.${body}.${sig}`;}
function openSeal(value, secret){try{const [version,body,sig]=value.split(".");if(version!=="v1")throw 0;const expected=crypto.createHmac("sha256",secret).update(body).digest();const actual=Buffer.from(sig,"base64url");if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))throw 0;const data=JSON.parse(Buffer.from(body,"base64url"));if(data.exp<Math.floor(Date.now()/1000))throw 0;return data;}catch{throw coded("UPLOAD_INVALID",400,"De uploadcontext is ongeldig of verlopen.");}}
function safeFilename(value){const ext=(clean(value).toLowerCase().match(/\.(pdf|png|jpe?g)$/)||[])[1]||"bin";return `document.${ext === "jpeg" ? "jpg" : ext}`;}
function encodePath(value){return String(value).split("/").map(encodeURIComponent).join("/");}
function resolveSignedUrl(base,value){const path=clean(value);if(!path)return "";if(path.startsWith("http"))return path;if(path.startsWith("/storage/v1/"))return `${base}${path}`;if(path.startsWith("/object/"))return `${base}/storage/v1${path}`;return `${base}/storage/v1/${path.replace(/^\/+/,"")}`;}
function bearer(event){const value=event.headers?.authorization||event.headers?.Authorization||"";return value.startsWith("Bearer ")?value.slice(7).trim():"";}
function parse(value){try{return JSON.parse(value||"{}");}catch{throw coded("INVALID_JSON",400,"Ongeldige invoer.");}}
function clean(value){return String(value??"").trim();}
function coded(code,status,message){return Object.assign(new Error(message),{code,status});}
function json(statusCode,body){return {statusCode,headers:{"Content-Type":"application/json","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"},body:JSON.stringify(body)};}

exports._test = { completeness, ibanValid, resolveSignedUrl, safeDossier, validateBytes, validateDocument };
