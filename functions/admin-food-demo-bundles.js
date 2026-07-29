const { verifyAdmin } = require("./_admin-auth");
const { sendTrackedEmail } = require("./services/resendMailService");
const { buildFoodDemoBundleMail } = require("./services/foodDemoBundleTemplate");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WRITE_ROLES = ["super_admin", "admin", "sales_manager", "sales_partner"];
const BLUEPRINTS = Object.freeze({
  "silverado-food-v1": Object.freeze({
    key: "silverado-food-v1", version: 1, name: "Silverado Roti Shop",
    storefrontUrl: "https://max-webstudio-food-demo.netlify.app/food/silverado-roti-shop-emmeloord",
    dashboardUrl: "https://max-webstudio-food-demo.netlify.app/admin/food",
    dashboardDeeplink: "https://max-webstudio-food-demo.netlify.app/login.html?next=%2Fadmin%2Ffood",
    qrAssetUrl: "/assets/food/silverado/silverado-demo-qr.svg",
  }),
});

function createHandler(deps = {}) {
  const verify = deps.verifyAdmin || verifyAdmin;
  const fetchImpl = deps.fetchImpl || global.fetch;
  const sendMail = deps.sendMail || sendTrackedEmail;
  return async (event) => {
    if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { success: false, code: "METHOD_NOT_ALLOWED", error: "Deze methode is niet toegestaan." });
    const auth = await verify(event, json, { module: "food_demo_bundles", action: event.httpMethod === "GET" ? "read" : "write", allowedRoles: WRITE_ROLES, allowedStatuses: ["active"], disableLegacyToken: true });
    if (!auth.success) return auth.response;
    try {
      const config = runtimeConfig(process.env);
      if (!config.ready) throw httpError(503, "BUNDLE_STORAGE_UNAVAILABLE", "Food-demo-opslag is niet geconfigureerd.");
      if (event.httpMethod === "GET") return await handleGet(event, auth.admin, config, fetchImpl);
      const input = parseBody(event);
      const action = clean(input.action).toLowerCase();
      if (action === "create" || action === "update") return await upsertBundle(input, auth.admin, config, fetchImpl);
      if (["test", "send", "resend"].includes(action)) return await dispatchBundle(action, input, auth.admin, config, fetchImpl, sendMail);
      if (action === "revoke") return await revokeBundle(input, auth.admin, config, fetchImpl);
      if (action === "check_links") return await checkLinks(input, auth.admin, config, fetchImpl);
      throw httpError(400, "ACTION_INVALID", "Kies een geldige Food-demoactie.");
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      console.error("Food demo bundle request failed", { code: error.code || "BUNDLE_ERROR", status });
      return json(status, { success: false, code: error.code || "BUNDLE_ERROR", error: status >= 500 ? "De Food-demoactie kon niet veilig worden verwerkt." : error.message });
    }
  };
}

async function handleGet(event, admin, config, fetchImpl) {
  const query = event.queryStringParameters || {};
  const relation = validateRelationship(query);
  if (query.bundleId && !UUID.test(query.bundleId)) throw httpError(400, "BUNDLE_INVALID", "De Food-demo is ongeldig.");
  const rows = await readBundles(fetchImpl, config, admin, relation, query.bundleId || null);
  const allowed = [];
  for (const bundle of rows || []) {
    assertBundleUrls(bundle);
    const relation = await assertOwnership(fetchImpl, config, admin, bundle.relationship_type, bundle.relationship_id, false);
    if (relation) allowed.push({ ...sanitizeBundle(bundle), mailPreview: mailPreview(bundle, relation) });
  }
  return json(200, { success: true, bundles: allowed, blueprints: Object.values(BLUEPRINTS), presentationSteps: presentationSteps(), capabilities: { canTestMail: config.nonProduction && EMAIL.test(config.testEmail), canLiveSend: config.production && config.liveSendEnabled } });
}

async function upsertBundle(input, admin, config, fetchImpl) {
  const relationship = validateRelationship(input);
  const relation = await assertOwnership(fetchImpl, config, admin, relationship.type, relationship.id, true);
  const blueprint = BLUEPRINTS[clean(input.blueprintKey) || "silverado-food-v1"];
  if (!blueprint) throw httpError(400, "BLUEPRINT_INVALID", "Deze Food-demo-blueprint is niet toegestaan.");
  if (input.factoryProjectId) await assertFactoryProject(fetchImpl, config, input.factoryProjectId, relationship);
  const row = {
    relationship_type: relationship.type, relationship_id: relationship.id,
    lead_id: relationship.type === "lead" ? relationship.id : null, customer_id: relationship.type === "customer" ? relationship.id : null,
    factory_project_id: UUID.test(clean(input.factoryProjectId)) ? clean(input.factoryProjectId) : null,
    demo_type: "food", display_name: validName(input.displayName || relation.company_name || relation.company || relation.name || blueprint.name),
    blueprint_key: blueprint.key, blueprint_version: blueprint.version,
    storefront_url: blueprint.storefrontUrl, dashboard_url: blueprint.dashboardUrl, dashboard_deeplink: blueprint.dashboardDeeplink, qr_asset_url: blueprint.qrAssetUrl,
  };
  const existing = (await readBundles(fetchImpl, config, admin, relationship)).find((item) => item.blueprint_key === blueprint.key);
  const bundle = firstRow(await bundleRpc(fetchImpl, config, "food_demo_bundle_upsert_v1", {
    ...actorRpcInput(admin), input_relationship_type: relationship.type, input_relationship_id: relationship.id,
    input_factory_project_id: row.factory_project_id, input_display_name: row.display_name, input_blueprint_key: blueprint.key,
  }));
  return json(existing ? 200 : 201, { success: true, bundle: sanitizeBundle(bundle), mailPreview: mailPreview(bundle, relation) });
}

async function dispatchBundle(action, input, admin, config, fetchImpl, sendMail) {
  const bundle = await loadOwnedBundle(fetchImpl, config, admin, input.bundleId);
  if (bundle.revoked_at && action !== "resend") throw httpError(409, "BUNDLE_REVOKED", "Deze uitnodiging is ingetrokken. Kies bewust voor opnieuw versturen.");
  const relation = await assertOwnership(fetchImpl, config, admin, bundle.relationship_type, bundle.relationship_id, true);
  const actionKey = clean(input.actionKey);
  if (actionKey.length < 16 || actionKey.length > 160) throw httpError(400, "ACTION_KEY_INVALID", "De actiebeveiliging ontbreekt.");
  const recipient = resolveRecipient(action, relation, config);
  assertDispatchEnvironment(action, config);
  const reservation = await reserveDispatch(fetchImpl, config, bundle, action, actionKey, admin, recipient.kind);
  if (reservation.duplicate) return json(200, { success: true, duplicate: true, sent: reservation.row.status === "sent", bundle: sanitizeBundle(bundle), message: "Deze verzendactie was al verwerkt." });
  const mail = mailPreview(bundle, relation);
  const result = await sendMail({
    to: recipient.email, from: config.fromEmail || undefined, replyTo: config.replyTo || undefined,
    subject: mail.subject, html: mail.html, text: mail.text, templateKey: "food_demo_bundle", templateName: "Food Demo Bundle",
    leadId: bundle.lead_id, customerId: bundle.customer_id, triggeredBy: "admin_food_demo_bundle",
    idempotencyKey: `food.demo.bundle:${bundle.id}:${actionKey}`, metadata: { bundleId: bundle.id, blueprintKey: bundle.blueprint_key, recipientKind: recipient.kind },
  });
  const sent = Boolean(result?.sent && result?.id);
  const updated = firstRow(await bundleRpc(fetchImpl, config, "food_demo_bundle_complete_dispatch_v1", {
    ...actorRpcInput(admin), input_bundle_id: bundle.id, input_dispatch_id: reservation.row.id,
    input_action_type: action, input_action_key: actionKey, input_sent: sent,
    input_provider_message_id: sent ? clean(result.id) : null, input_error_code: sent ? null : clean(result?.errorCode || "provider_send_failed"),
  }));
  if (!sent) throw httpError(502, "EMAIL_SEND_FAILED", "De uitnodiging is niet verzonden; veilig opnieuw proberen is mogelijk.");
  return json(200, { success: true, sent: true, recipientKind: recipient.kind, bundle: sanitizeBundle(updated), message: action === "test" ? "Testmail is verzonden naar het gecontroleerde interne adres." : "De Food-demo is verzonden." });
}

async function revokeBundle(input, admin, config, fetchImpl) {
  const bundle = await loadOwnedBundle(fetchImpl, config, admin, input.bundleId);
  const actionKey = clean(input.actionKey); if (actionKey.length < 16) throw httpError(400, "ACTION_KEY_INVALID", "De actiebeveiliging ontbreekt.");
  const row = firstRow(await bundleRpc(fetchImpl, config, "food_demo_bundle_revoke_v1", { ...actorRpcInput(admin), input_bundle_id: bundle.id, input_action_key: actionKey }));
  return json(200, { success: true, bundle: sanitizeBundle(row), message: "De uitnodiging is ingetrokken. De audit- en demo-gegevens zijn behouden." });
}

async function checkLinks(input, admin, config, fetchImpl) {
  const bundle = await loadOwnedBundle(fetchImpl, config, admin, input.bundleId);
  const [storefront, dashboard] = await Promise.all([probe(bundle.storefront_url, fetchImpl), probe(bundle.dashboard_deeplink, fetchImpl)]);
  const row = firstRow(await bundleRpc(fetchImpl, config, "food_demo_bundle_update_links_v1", {
    ...actorRpcInput(admin), input_bundle_id: bundle.id, input_storefront_status: storefront ? "reachable" : "unreachable",
    input_dashboard_status: dashboard ? "reachable" : "unreachable", input_action_key: clean(input.actionKey) || null,
  }));
  return json(200, { success: true, bundle: sanitizeBundle(row) });
}

async function assertOwnership(fetchImpl, config, admin, type, id, required) {
  const table = type === "lead" ? "leads" : "customers";
  const rows = await rest(fetchImpl, config, table, { select: "*", id: `eq.${id}`, limit: "1" });
  const row = rows?.[0]; if (!row) { if (required) throw httpError(404, "RELATIONSHIP_NOT_FOUND", "De gekoppelde lead of klant bestaat niet meer."); return null; }
  const role = clean(admin.role).toLowerCase().replace(/[\s-]+/g, "_");
  if (["super_admin", "admin", "sales_manager"].includes(role)) return row;
  const m = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const owners = [row.assigned_user_id,row.owner_auth_user_id,row.owner_profile_id,row.owner_id,row.assigned_to,m.assignedUserId,m.assigned_user_id,m.ownerAuthUserId,m.owner_profile_id].map(clean).filter(Boolean);
  if (role === "sales_partner" && (owners.includes(clean(admin.id)) || owners.includes(clean(admin.profileId)))) return row;
  if (required) throw httpError(403, "RELATIONSHIP_FORBIDDEN", "U mag voor deze relatie geen Food-demo beheren."); return null;
}

async function loadOwnedBundle(fetchImpl, config, admin, id) { if (!UUID.test(clean(id))) throw httpError(400,"BUNDLE_INVALID","De Food-demo is ongeldig."); const rows=await readBundles(fetchImpl,config,admin,null,id); const b=rows?.[0]; if(!b) throw httpError(404,"BUNDLE_NOT_FOUND","De Food-demo bestaat niet meer."); assertBundleUrls(b); await assertOwnership(fetchImpl,config,admin,b.relationship_type,b.relationship_id,true); return b; }
async function assertFactoryProject(fetchImpl, config, id, relation) { if(!UUID.test(clean(id))) throw httpError(400,"FACTORY_PROJECT_INVALID","Het Factory-dossier is ongeldig."); const rows=await rest(fetchImpl,config,"factory_projects",{select:"id,relationship_type,relationship_id,factory_type",id:`eq.${id}`,limit:"1"}); const p=rows?.[0]; if(!p||p.relationship_type!==relation.type||p.relationship_id!==relation.id||p.factory_type!=="food") throw httpError(409,"FACTORY_PROJECT_MISMATCH","Het Factory-dossier hoort niet bij deze Food-relatie."); }
async function reserveDispatch(fetchImpl, config, bundle, action, actionKey, admin, recipientKind) { const row=firstRow(await bundleRpc(fetchImpl,config,"food_demo_bundle_reserve_dispatch_v1",{...actorRpcInput(admin),input_bundle_id:bundle.id,input_action_type:action,input_action_key:actionKey,input_recipient_kind:recipientKind,input_max_attempts:action==="test"?8:5})); return {duplicate:Boolean(row?.duplicate),row}; }
async function readBundles(fetchImpl,config,admin,relation,bundleId=null){const data=await bundleRpc(fetchImpl,config,"food_demo_bundle_read_v1",{...actorRpcInput(admin),input_relationship_type:relation?.type||null,input_relationship_id:relation?.id||null,input_bundle_id:bundleId||null});return Array.isArray(data)?data:data?[data]:[];}
function actorRpcInput(admin){if(!UUID.test(clean(admin?.profileId))||!UUID.test(clean(admin?.id)))throw httpError(403,"ACTOR_INVALID","De actieve beheerder kon niet veilig worden vastgesteld.");return {input_actor_profile_id:admin.profileId,input_actor_auth_user_id:admin.id};}
function firstRow(value){return Array.isArray(value)?value[0]:value;}

function validateRelationship(input={}) { const type=clean(input.relationshipType).toLowerCase(); const id=clean(input.relationshipId); if(!["lead","customer"].includes(type)||!UUID.test(id)) throw httpError(400,"RELATIONSHIP_INVALID","Kies één geldige lead of klant."); return {type,id}; }
function assertBundleUrls(bundle={}) { const blueprint=BLUEPRINTS[clean(bundle.blueprint_key)]; if(!blueprint||clean(bundle.storefront_url)!==blueprint.storefrontUrl||clean(bundle.dashboard_url)!==blueprint.dashboardUrl||clean(bundle.dashboard_deeplink)!==blueprint.dashboardDeeplink||clean(bundle.qr_asset_url)!==blueprint.qrAssetUrl) throw httpError(409,"BUNDLE_LINK_MISMATCH","De Food-demolinks wijken af van de gecontroleerde blueprint."); const dashboard=new URL(bundle.dashboard_deeplink); if(dashboard.protocol!=="https:"||dashboard.hostname!=="max-webstudio-food-demo.netlify.app"||dashboard.pathname!=="/login.html"||dashboard.searchParams.get("next")!=="/admin/food") throw httpError(409,"DASHBOARD_DEEPLINK_INVALID","De dashboardloginroute is niet veilig."); return true; }
function resolveRecipient(action, relation, config) { if(action==="test"){ if(!EMAIL.test(config.testEmail)) throw httpError(503,"TEST_RECIPIENT_UNAVAILABLE","Het gecontroleerde interne testadres ontbreekt."); return {email:config.testEmail,kind:"internal_test"}; } const email=clean(relation.email).toLowerCase(); if(!EMAIL.test(email)) throw httpError(422,"RELATIONSHIP_EMAIL_INVALID","De relatie heeft geen geldig e-mailadres."); return {email,kind:"relationship"}; }
function assertDispatchEnvironment(action, config) { if(action==="test"){ if(!config.nonProduction) throw httpError(403,"TESTMAIL_PRODUCTION_FORBIDDEN","Testmail is alleen in een gecontroleerde niet-productieomgeving toegestaan."); return; } if(!config.production||!config.liveSendEnabled) throw httpError(403,"LIVE_SEND_GATE_CLOSED","Definitief versturen is pas toegestaan na de afzonderlijke productievrijgave."); }
function mailPreview(bundle, relation) { const origin=new URL(bundle.storefront_url).origin; return buildFoodDemoBundleMail({ contactName:relation.contact_name||relation.name,restaurantName:bundle.display_name,storefrontUrl:bundle.storefront_url,dashboardUrl:bundle.dashboard_deeplink,qrUrl:`${origin}${bundle.qr_asset_url}`,blueprintKey:bundle.blueprint_key }); }
function validName(value) { const v=clean(value); if(v.length<2||v.length>160||/[<>\u0000-\u001f]/.test(v)) throw httpError(400,"NAME_INVALID","De restaurantnaam is ongeldig."); return v; }
function sanitizeBundle(b={}) { return { id:b.id,relationshipType:b.relationship_type,relationshipId:b.relationship_id,leadId:b.lead_id,customerId:b.customer_id,factoryProjectId:b.factory_project_id,demoType:b.demo_type,displayName:b.display_name,blueprintKey:b.blueprint_key,blueprintVersion:b.blueprint_version,storefrontUrl:b.storefront_url,dashboardUrl:b.dashboard_url,dashboardDeeplink:b.dashboard_deeplink,qrAssetUrl:b.qr_asset_url,storefrontStatus:b.storefront_status,dashboardStatus:b.dashboard_status,invitationStatus:b.invitation_status,recipientEmail:b.recipient_email,createdAt:b.created_at,lastSentAt:b.last_sent_at,revokedAt:b.revoked_at,expiresAt:b.expires_at,metadata:b.metadata||{} }; }
function presentationSteps(){return ["Dashboard vooraf veilig openen en inloggen.","Storefront op telefoon openen via QR-code.","Product toevoegen en winkelwagen tonen.","Afhalen kiezen; bezorgen is niet beschikbaar.","Testbestelling plaatsen; er vindt geen echte betaling plaats.","Bestelling in dashboard zien, accepteren en naar preparing en ready zetten.","Alleen de gevalideerde reset-/opruimprocedure uitvoeren."];}
async function probe(url,fetchImpl){try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);const res=await fetchImpl(url,{method:"HEAD",redirect:"follow",signal:controller.signal});clearTimeout(timer);return res.ok||[301,302,303,307,308,401,403].includes(res.status);}catch{return false;}}
function runtimeConfig(env){const values=[env.APP_ENV,env.APP_ENVIRONMENT,env.CONTEXT,env.NETLIFY_ENV].map(v=>clean(v).toLowerCase());const production=values.some(v=>["production","prod"].includes(v));return {url:clean(env.SUPABASE_URL).replace(/\/$/,""),key:clean(env.SUPABASE_SERVICE_ROLE_KEY),siteUrl:clean(env.SITE_URL),fromEmail:clean(env.RESEND_FROM_EMAIL||env.EMAIL_FROM),replyTo:clean(env.RESEND_REPLY_TO||env.EMAIL_REPLY_TO),testEmail:clean(env.FOOD_DEMO_INTERNAL_TEST_EMAIL).toLowerCase(),production,nonProduction:!production&&values.some(v=>["test","staging","deploy-preview","branch-deploy"].includes(v)),liveSendEnabled:clean(env.FOOD_DEMO_BUNDLE_EMAIL_ENABLED).toLowerCase()==="true",get ready(){return Boolean(this.url&&this.key);}};}
async function rest(fetchImpl,config,table,params={},options={}){const q=new URLSearchParams(params);const res=await fetchImpl(`${config.url}/rest/v1/${table}?${q}`,{method:options.method||"GET",headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,Accept:"application/json",...(options.body!==undefined?{"Content-Type":"application/json"}:{}),...(options.prefer?{Prefer:options.prefer}:{})},...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})});const data=await res.json().catch(()=>null);if(!res.ok){const e=httpError(res.status===409?409:res.status>=500?503:400,res.status===409?"REST_CONFLICT":"STORAGE_REJECTED","De Food-demo-opslag weigerde de aanvraag.");throw e;}return data;}
async function bundleRpc(fetchImpl,config,name,body){const res=await fetchImpl(`${config.url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(body)});const data=await res.json().catch(()=>null);if(res.ok)return data;const code=clean(data?.code);if(code==="42501")throw httpError(403,"RELATIONSHIP_FORBIDDEN","U mag voor deze relatie geen Food-demo beheren.");if(code==="P0002")throw httpError(404,"BUNDLE_NOT_FOUND","De Food-demo bestaat niet meer.");if(code==="P0001")throw httpError(429,"RATE_LIMITED","Wacht even voordat u opnieuw een demo verstuurt.");if(["22023","23514","55000"].includes(code))throw httpError(409,"BUNDLE_STATE_REJECTED","De Food-demoactie past niet bij de huidige veilige status.");throw httpError(503,"BUNDLE_RPC_UNAVAILABLE","De beveiligde Food-demo-opslag is tijdelijk niet beschikbaar.");}
function parseBody(event){const raw=event.isBase64Encoded?Buffer.from(event.body||"","base64").toString("utf8"):String(event.body||"");if(!raw||Buffer.byteLength(raw)>32768)throw httpError(400,"BODY_INVALID","De aanvraag is leeg of te groot.");try{return JSON.parse(raw);}catch{throw httpError(400,"JSON_INVALID","De aanvraag bevat geen geldige gegevens.");}}
function clean(value){return String(value||"").trim();} function httpError(statusCode,code,message){return Object.assign(new Error(message),{statusCode,code});} function json(statusCode,body){return {statusCode,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff"},body:JSON.stringify(body)};}

exports.handler=createHandler();
exports._private={actorRpcInput,assertBundleUrls,assertDispatchEnvironment,buildFoodDemoBundleMail,bundleRpc,createHandler,mailPreview,presentationSteps,runtimeConfig,sanitizeBundle,validateRelationship};
