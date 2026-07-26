const crypto = require("node:crypto");
const { verifyAdmin } = require("./_admin-auth");
const { rest } = require("./services/partnerOnboardingAccessService");

const BUCKET = "staff-private-documents";
const INTERNAL_ROLES = ["super_admin","admin","sales_manager","sales_partner","designer","developer","support"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (!["GET","POST"].includes(event.httpMethod)) return json(405, { success:false, error:"Methode niet toegestaan." });
  const auth = await verifyAdmin(event, json, { module:"staff_directory", action:event.httpMethod === "GET" ? "view" : "manage", allowedRoles:["super_admin"], allowedStatuses:["active"], disableLegacyToken:true });
  if (!auth.success) return auth.response;
  try {
    const context = config();
    const input = event.httpMethod === "POST" ? parse(event.body) : {};
    if (event.httpMethod === "POST") {
      const profileId = uuid(input.profileId, "Kies een geldige medewerker.");
      const action = clean(input.action).toLowerCase();
      if (action === "send_message") await sendMessage(context, auth.admin.profileId, profileId, input);
      else if (action === "mark_messages_read") await markMessagesRead(context, auth.admin.profileId, profileId);
      else if (action === "verify_dossier") await changeDossier(context, auth.admin.profileId, profileId, "verified", input);
      else if (action === "request_changes") await changeDossier(context, auth.admin.profileId, profileId, "changes_requested", input);
      else if (action === "download_document") return documentDownload(context, auth.admin.profileId, profileId, input);
      else return json(400, { success:false, error:"Onbekende beheeractie." });
    }
    const profileId = clean(event.queryStringParameters?.profileId || input.profileId);
    return profileId ? detail(context, uuid(profileId, "Kies een geldige medewerker."), auth.admin.profileId) : directory(context);
  } catch (error) {
    console.error("Admin staff directory failed", { code:error.code || "", status:error.status || 500 });
    return json(error.status || 500, { success:false, code:error.code || "STAFF_DIRECTORY_FAILED", error:error.status ? error.message : "Medewerkers konden niet veilig worden geladen." });
  }
};

async function directory(context) {
  const profiles = await rest(context.url, context.service, `profiles?select=id,name,email,role,status,auth_user_id,metadata&role=in.(${INTERNAL_ROLES.join(",")})&order=name.asc.nullslast&limit=500`);
  const visible = (profiles || []).filter(validEmployee);
  const ids = visible.map((profile) => profile.id);
  if (!ids.length) return json(200, { success:true, employees:[] });
  const filter = ids.join(",");
  const [dossiers, partnerProfiles, messages, documents] = await Promise.all([
    rest(context.url, context.service, `staff_zzp_dossiers?select=id,profile_id,status,legal_name,trade_name,kvk_number,vat_number,city,submitted_at,verified_at,updated_at&profile_id=in.(${filter})`),
    rest(context.url, context.service, `partner_profiles?select=id,profile_id,status,updated_at&profile_id=in.(${filter})`),
    rest(context.url, context.service, `staff_messages?select=id,employee_profile_id,sender_profile_id,read_at,created_at&employee_profile_id=in.(${filter})&archived_at=is.null`),
    rest(context.url, context.service, `staff_zzp_documents?select=id,profile_id,document_type,status&profile_id=in.(${filter})&status=neq.archived`),
  ]);
  const dossierByProfile = new Map((dossiers || []).map((row) => [row.profile_id,row]));
  const partnerByProfile = new Map((partnerProfiles || []).map((row) => [row.profile_id,row]));
  return json(200, { success:true, employees:visible.map((profile) => {
    const dossier = dossierByProfile.get(profile.id);
    const docs = (documents || []).filter((doc) => doc.profile_id === profile.id);
    const thread = (messages || []).filter((message) => message.employee_profile_id === profile.id);
    return {
      id:profile.id, name:profile.name, email:profile.email, role:profile.role, status:profile.status,
      team:clean(profile.metadata?.team), avatarUrl:safeAvatar(profile.metadata?.avatarUrl || profile.metadata?.avatar_url),
      onboarding:partnerByProfile.get(profile.id) || null,
      dossier:dossier ? { id:dossier.id, status:dossier.status, tradeName:dossier.trade_name, kvkNumber:dossier.kvk_number, vatNumber:dossier.vat_number, city:dossier.city, updatedAt:dossier.updated_at } : null,
      documentCount:docs.filter((doc) => doc.status === "available").length,
      unreadMessages:thread.filter((message) => !message.read_at && message.sender_profile_id === profile.id).length,
    };
  }) });
}

async function detail(context, profileId, actorProfileId) {
  const [profileRows, dossierRows, documents, messages, partnerRows, events] = await Promise.all([
    rest(context.url, context.service, `profiles?select=id,name,email,role,status,auth_user_id,metadata&id=eq.${profileId}&limit=1`),
    rest(context.url, context.service, `staff_zzp_dossiers?select=*&profile_id=eq.${profileId}&limit=1`),
    rest(context.url, context.service, `staff_zzp_documents?select=id,document_type,identity_document_type,original_filename,mime_type,size_bytes,status,scan_status,purpose,uploaded_at,reviewed_at,rejection_reason,created_at&profile_id=eq.${profileId}&status=neq.archived&order=created_at.desc`),
    rest(context.url, context.service, `staff_messages?select=id,employee_profile_id,sender_profile_id,body,read_at,created_at&employee_profile_id=eq.${profileId}&archived_at=is.null&order=created_at.asc&limit=500`),
    rest(context.url, context.service, `partner_profiles?select=id,profile_id,status,assigned_manager_profile_id,invited_at,activated_at,updated_at&profile_id=eq.${profileId}&limit=1`),
    rest(context.url, context.service, `staff_dossier_events?select=id,event_type,subject_type,subject_id,safe_metadata,occurred_at&employee_profile_id=eq.${profileId}&order=occurred_at.desc&limit=100`),
  ]);
  const profile = profileRows?.[0];
  if (!validEmployee(profile)) throw coded("EMPLOYEE_NOT_FOUND", 404, "Deze medewerker bestaat niet of valt buiten de interne scope.");
  const partner = partnerRows?.[0] || null;
  let onboarding = null, steps = [], attempts = [];
  if (partner) {
    onboarding = (await rest(context.url, context.service, `partner_onboardings?select=*&partner_profile_id=eq.${partner.id}&order=created_at.desc&limit=1`))?.[0] || null;
    if (onboarding) [steps,attempts] = await Promise.all([
      rest(context.url, context.service, `partner_onboarding_steps?select=step_key,step_order,status,completed_at&onboarding_id=eq.${onboarding.id}&order=step_order.asc`),
      rest(context.url, context.service, `partner_assessment_attempts?select=attempt_number,score,passed,submitted_at&onboarding_id=eq.${onboarding.id}&order=attempt_number.desc`),
    ]);
  }
  const dossier = dossierRows?.[0] || null;
  await logEvent(context, profileId, actorProfileId, "dossier.viewed", "dossier", dossier?.id || profileId, { containsSensitiveData:Boolean(dossier) });
  return json(200, { success:true,
    employee:{ id:profile.id, name:profile.name, email:profile.email, role:profile.role, status:profile.status, team:clean(profile.metadata?.team), avatarUrl:safeAvatar(profile.metadata?.avatarUrl || profile.metadata?.avatar_url) },
    dossier:safeDossier(dossier), documents:documents || [],
    messages:(messages || []).map((message) => ({ ...message, fromAdmin:message.sender_profile_id !== profileId })),
    partnerProfile:partner, onboarding, steps:steps || [], attempts:attempts || [], events:events || [],
  });
}

async function sendMessage(context, actorProfileId, profileId, input) {
  const body = clean(input.body);
  if (!body || body.length > 4000) throw coded("INVALID_MESSAGE", 400, "Schrijf een bericht van maximaal 4.000 tekens.");
  const key = clean(input.idempotencyKey) || `staff-message:${crypto.randomUUID()}`;
  const rows = await rest(context.url, context.service, "staff_messages", { method:"POST", headers:{ Prefer:"return=representation,resolution=ignore-duplicates" }, body:JSON.stringify({ employee_profile_id:profileId, sender_profile_id:actorProfileId, body, idempotency_key:key }) });
  if (rows?.[0]) await logEvent(context, profileId, actorProfileId, "message.sent", "message", rows[0].id, {});
}

async function markMessagesRead(context, actorProfileId, profileId) {
  await rest(context.url, context.service, `staff_messages?employee_profile_id=eq.${profileId}&sender_profile_id=eq.${profileId}&read_at=is.null`, { method:"PATCH", body:JSON.stringify({ read_at:new Date().toISOString() }) });
  await logEvent(context, profileId, actorProfileId, "message.read", "message", profileId, {});
}

async function changeDossier(context, actorProfileId, profileId, status, input) {
  const rows = await rest(context.url, context.service, `staff_zzp_dossiers?select=id,status&profile_id=eq.${profileId}&limit=1`);
  const dossier = rows?.[0];
  if (!dossier) throw coded("DOSSIER_NOT_FOUND", 404, "Deze medewerker heeft nog geen ZZP-dossier.");
  if (status === "verified" && dossier.status !== "submitted") throw coded("DOSSIER_NOT_SUBMITTED", 409, "Alleen een ingediend dossier kan worden geverifieerd.");
  const reason = clean(input.reason).slice(0,1000);
  if (status === "changes_requested" && reason.length < 5) throw coded("REASON_REQUIRED", 400, "Geef duidelijk aan wat aangepast moet worden.");
  const now = new Date().toISOString();
  await rest(context.url, context.service, `staff_zzp_dossiers?id=eq.${dossier.id}&profile_id=eq.${profileId}`, { method:"PATCH", body:JSON.stringify({ status, verified_at:status === "verified" ? now : null, verified_by_profile_id:status === "verified" ? actorProfileId : null, change_request_reason:status === "changes_requested" ? reason : null, updated_at:now }) });
  await logEvent(context, profileId, actorProfileId, status === "verified" ? "dossier.verified" : "dossier.changes_requested", "dossier", dossier.id, status === "changes_requested" ? { reason } : {});
}

async function documentDownload(context, actorProfileId, profileId, input) {
  const documentId = uuid(input.documentId, "Kies een geldig document.");
  const rows = await rest(context.url, context.service, `staff_zzp_documents?select=id,storage_path,original_filename,document_type,status,scan_status&id=eq.${documentId}&profile_id=eq.${profileId}&limit=1`);
  const document = rows?.[0];
  if (!document || document.status !== "available") throw coded("DOCUMENT_NOT_AVAILABLE", 404, "Dit document is niet beschikbaar.");
  const response = await fetch(`${context.url}/storage/v1/object/sign/${BUCKET}/${encodePath(document.storage_path)}`, { method:"POST", headers:serviceHeaders(context), body:JSON.stringify({ expiresIn:60 }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw coded("DOWNLOAD_FAILED", 502, "Het document kon niet veilig worden geopend.");
  const signedUrl = resolveSignedUrl(context.url, data.signedURL || data.signedUrl || data.url);
  if (!signedUrl) throw coded("DOWNLOAD_FAILED", 502, "Het document kon niet veilig worden geopend.");
  await logEvent(context, profileId, actorProfileId, "document.opened", "document", document.id, { documentType:document.document_type, scanStatus:document.scan_status, expiresIn:60 });
  return json(200, { success:true, url:signedUrl, expiresIn:60, filename:document.original_filename, scanStatus:document.scan_status, warning:document.scan_status !== "clean" ? "Virusscan is nog niet gekoppeld; open alleen een verwacht testdocument op staging." : "" });
}

async function logEvent(context, employeeProfileId, actorProfileId, eventType, subjectType, subjectId, safeMetadata) {
  await rest(context.url, context.service, "staff_dossier_events", { method:"POST", body:JSON.stringify({ employee_profile_id:employeeProfileId, actor_profile_id:actorProfileId, event_type:eventType, subject_type:subjectType, subject_id:subjectId, safe_metadata:safeMetadata }) });
}

function validEmployee(profile) {
  if (!profile || !UUID.test(clean(profile.id)) || !INTERNAL_ROLES.includes(clean(profile.role))) return false;
  const email = clean(profile.email).toLowerCase();
  return !profile.metadata?.serviceAccount && !/^(service|system|automation|noreply|no-reply|bot)[+@._-]/.test(email);
}
function safeDossier(row) { if(!row)return null; return { id:row.id,status:row.status,relationshipType:row.relationship_type,legalName:row.legal_name||"",tradeName:row.trade_name||"",phone:row.phone||"",street:row.street||"",houseNumber:row.house_number||"",postalCode:row.postal_code||"",city:row.city||"",countryCode:row.country_code||"NL",kvkNumber:row.kvk_number||"",vatNumber:row.vat_number||"",iban:row.iban||"",ibanAccountName:row.iban_account_name||"",submittedAt:row.submitted_at,verifiedAt:row.verified_at,changeRequestReason:row.change_request_reason||"",updatedAt:row.updated_at }; }
function safeAvatar(value){const url=clean(value);if(!url)return null;if(url.startsWith("/assets/")||url.startsWith("/images/"))return url;try{const parsed=new URL(url);return parsed.protocol==="https:"?parsed.toString():null;}catch{return null;}}
function resolveSignedUrl(base,value){const path=clean(value);if(!path)return "";if(path.startsWith("http"))return path;if(path.startsWith("/storage/v1/"))return `${base}${path}`;if(path.startsWith("/object/"))return `${base}/storage/v1${path}`;return `${base}/storage/v1/${path.replace(/^\/+/,"")}`;}
function config(){const url=clean(process.env.SUPABASE_URL).replace(/\/$/,"");const service=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!service)throw coded("CONFIG_MISSING",500,"Dossierconfiguratie ontbreekt.");return {url,service};}
function serviceHeaders(context){return {apikey:context.service,Authorization:`Bearer ${context.service}`,"Content-Type":"application/json"};}
function encodePath(value){return String(value).split("/").map(encodeURIComponent).join("/");}
function uuid(value,message){const result=clean(value);if(!UUID.test(result))throw coded("INVALID_ID",400,message);return result;}
function parse(value){try{return JSON.parse(value||"{}");}catch{throw coded("INVALID_JSON",400,"Ongeldige invoer.");}}
function clean(value){return String(value??"").trim();}
function coded(code,status,message){return Object.assign(new Error(message),{code,status});}
function json(statusCode,body){return {statusCode,headers:{"Content-Type":"application/json","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"},body:JSON.stringify(body)};}

exports._test = { resolveSignedUrl, safeDossier, validEmployee };
