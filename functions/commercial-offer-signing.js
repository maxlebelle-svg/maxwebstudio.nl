const crypto = require("node:crypto");
const { corsHeaders } = require("./_cors");
const { generateCommercialOfferPdf } = require("./services/commercialOfferPdfService");
const {
  buildCommercialOfferMetadata, createCommercialOfferTransaction, normalizePhone,
  signhostConfig, startTransaction, transactionSignUrl, uploadFileMetadata, uploadPdf,
} = require("./services/signhostService");

const BUCKET = "commercial-private-documents";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (!["GET","POST"].includes(event.httpMethod)) return json(405,{success:false,error:"Methode niet toegestaan."});
  let failureContext=null; let createdTransactionId=""; let accessTokenId="";
  try {
    const rawToken = bearer(event);
    if (!rawToken) throw coded("SIGNING_TOKEN_REQUIRED",401,"Deze ondertekenlink is ongeldig.");
    const context = config();
    failureContext=context;
    const access = await loadAccess(context, sha256(rawToken));
    accessTokenId=access.id;
    const details = await loadDetails(context, access);
    if (event.httpMethod === "GET") return json(200,{success:true,offer:publicOffer(details),signing:publicSigning(details.transaction)});
    const input = parse(event.body);
    if (clean(input.action) !== "start") throw coded("SIGNING_ACTION_INVALID",400,"Kies een geldige ondertekenactie.");
    if (details.transaction) return json(200,{success:true,duplicate:true,signing:publicSigning(details.transaction)});
    const signerName=clean(input.signerName); const signerRole=clean(input.signerRole); const phone=clean(input.signerPhone);
    if (signerName.length<2||signerName.length>160) throw coded("SIGNER_NAME_INVALID",400,"Vul de volledige naam van de ondertekenaar in.");
    if (signerRole.length<2||signerRole.length>120) throw coded("SIGNER_ROLE_INVALID",400,"Vul de functie van de ondertekenaar in.");
    if (input.authorityConfirmed !== true) throw coded("SIGNER_AUTHORITY_REQUIRED",400,"Bevestig dat je bevoegd bent deze onderneming te vertegenwoordigen.");
    const normalizedPhone=phone?normalizePhone(phone):"";
    if (phone&&!normalizedPhone) throw coded("SIGNER_PHONE_INVALID",400,"Gebruik een mobiel nummer met landcode, bijvoorbeeld +31612345678.");
    const id=crypto.randomUUID(); const fileId=`offerte-${details.version.id}.pdf`;
    const tx=await insert(context,"commercial_offer_signing_transactions",{
      id,offer_id:details.offer.id,offer_version_id:details.version.id,access_token_id:access.id,
      signer_name:signerName,signer_role:signerRole,signer_email_sha256:sha256(details.signerEmail),
      signer_phone_sha256:normalizedPhone?sha256(normalizedPhone):null,authority_confirmed_at:new Date().toISOString(),
      idempotency_key:`commercial-signing:${details.version.id}`,
    });
    createdTransactionId=tx?.id||id;
    const pdf=generateCommercialOfferPdf({offerId:details.offer.id,versionNumber:details.version.version_number,snapshot:{...details.version.snapshot,checksum:details.version.snapshot_checksum_sha256},snapshotChecksum:details.version.snapshot_checksum_sha256,relationship:details.relationship,documents:details.documents,signerName,signerRole});
    const unsignedPath=`${details.offer.id}/${details.version.id}/definitieve-offerte.pdf`;
    await storageUpload(context,unsignedPath,pdf.bytes);
    const provider=signhostConfig();
    const providerTx=await createCommercialOfferTransaction(provider,{signerEmail:details.signerEmail,signerName,signerPhone:normalizedPhone,companyName:details.relationship.companyName,reference:pdf.reference});
    const providerId=clean(providerTx.Id||providerTx.id);
    if(!providerId) throw coded("SIGNHOST_TRANSACTION_INVALID",502,"Signhost gaf geen geldige transactie terug.");
    await uploadFileMetadata(provider,providerId,fileId,buildCommercialOfferMetadata(providerTx,{signerEmail:details.signerEmail,signaturePage:pdf.signaturePage,reference:pdf.reference}));
    await uploadPdf(provider,providerId,fileId,pdf.bytes);
    const started=await startTransaction(provider,providerId);
    const signUrl=transactionSignUrl(started)||transactionSignUrl(providerTx);
    const updated=await patch(context,"commercial_offer_signing_transactions",id,{provider_transaction_id:providerId,provider_file_id:fileId,status:"waiting_for_signer",unsigned_document_path:unsignedPath,unsigned_document_sha256:sha256(pdf.bytes),requested_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    await patch(context,"commercial_offer_signing_access_tokens",access.id,{started_at:new Date().toISOString(),signer_email:null});
    return json(201,{success:true,duplicate:false,signing:{...publicSigning(updated),redirectUrl:signUrl||null,emailSent:true}});
  } catch(error){
    if(failureContext&&createdTransactionId){await patch(failureContext,"commercial_offer_signing_transactions",createdTransactionId,{status:"failed",failure_code:clean(error.code||"provider_error").toLowerCase().replace(/[^a-z0-9_-]+/g,"_").slice(0,120),updated_at:new Date().toISOString()}).catch(()=>{});if(accessTokenId)await patch(failureContext,"commercial_offer_signing_access_tokens",accessTokenId,{signer_email:null}).catch(()=>{});}
    console.error("Commercial offer signing failed",{code:error.code||"SIGNING_FAILED",status:error.status||error.statusCode||500});const status=Number(error.status||error.statusCode)||500;return json(status,{success:false,code:error.code||"SIGNING_FAILED",error:status>=500?"De ondertekening kon niet veilig worden gestart.":error.message});
  }
};

async function loadAccess(context,tokenHash){
  const rows=await rest(context,`commercial_offer_signing_access_tokens?select=*&token_sha256=eq.${tokenHash}&limit=1`);const row=rows[0];
  if(!row||row.revoked_at||new Date(row.expires_at).getTime()<=Date.now())throw coded("SIGNING_LINK_INVALID",410,"Deze ondertekenlink is verlopen of ingetrokken.");return row;
}
async function loadDetails(context,access){
  const versions=await rest(context,`commercial_offer_versions?select=*&id=eq.${access.offer_version_id}&limit=1`);const version=versions[0];
  const offers=await rest(context,`commercial_offers?select=*&id=eq.${access.offer_id}&limit=1`);const offer=offers[0];
  if(!offer||!version||version.snapshot?.offerPurpose!=="definitive_offer"||offer.current_version_id!==version.id)throw coded("SIGNING_OFFER_INVALID",409,"Deze offerteversie kan niet worden ondertekend.");
  const table=offer.relationship_type==="lead"?"leads":"customers";const relationships=await rest(context,`${table}?select=*&id=eq.${offer.relationship_id}&limit=1`);const row=relationships[0];
  const relationship={companyName:clean(row?.company_name||row?.company||row?.name),contactName:clean(row?.contact_name||row?.name)};
  const transactions=await rest(context,`commercial_offer_signing_transactions?select=*&offer_version_id=eq.${version.id}&limit=1`);
  const signerEmail=clean(access.signer_email).toLowerCase();
  if(!transactions[0]&&!validEmail(signerEmail))throw coded("SIGNER_EMAIL_MISSING",409,"Aan deze ondertekenlink ontbreekt een geldig, bevestigd e-mailadres.");
  const documents=await rest(context,`commercial_offer_document_bindings?select=*&offer_version_id=eq.${version.id}&order=document_type.asc`);
  return{access,offer,version,relationship,signerEmail,documents,transaction:transactions[0]||null};
}
function publicOffer(d){return{companyName:d.relationship.companyName,contactName:d.relationship.contactName,versionNumber:d.version.version_number,validUntil:d.version.snapshot.validUntil,lines:d.version.snapshot.lines,oneTimeExVatCents:d.version.snapshot.oneTimeExVatCents,recurringExVatCents:d.version.snapshot.recurringExVatCents,discountPercentage:d.version.snapshot.discountPercentage,documents:d.documents.map(x=>({documentType:x.document_type,versionCode:x.version_code,sourceUrl:safeUrl(x.source_url)}))};}
function publicSigning(tx){return tx?{status:tx.status,requestedAt:tx.requested_at,signedAt:tx.signed_at,emailSent:Boolean(tx.requested_at)}:{status:"not_started"};}
function bearer(event){const auth=clean(event.headers?.authorization||event.headers?.Authorization);if(/^Bearer\s+[-_A-Za-z0-9]{32,200}$/.test(auth))return auth.replace(/^Bearer\s+/i,"");const token=clean(event.queryStringParameters?.token);return /^[-_A-Za-z0-9]{32,200}$/.test(token)?token:"";}
function config(){const url=clean(process.env.SUPABASE_URL).replace(/\/$/,"");const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!key)throw coded("CONFIG_MISSING",503,"Ondertekenen is tijdelijk niet beschikbaar.");return{url,key};}
async function rest(c,route,options={}){const response=await fetch(`${c.url}/rest/v1/${route}`,{method:options.method||"GET",headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,"Content-Type":"application/json",Accept:"application/json",Prefer:options.prefer||"return=representation"},body:options.body&&JSON.stringify(options.body)});const data=await response.json().catch(()=>null);if(!response.ok)throw coded(data?.code||"STORAGE_REQUEST_FAILED",response.status,data?.message||"Opslagverzoek mislukt.");return data;}
async function insert(c,table,body){const rows=await rest(c,table,{method:"POST",body});return rows[0];}
async function patch(c,table,id,body){const rows=await rest(c,`${table}?id=eq.${id}`,{method:"PATCH",body});return rows[0];}
async function storageUpload(c,path,bytes){const response=await fetch(`${c.url}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`,{method:"POST",headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,"Content-Type":"application/pdf","x-upsert":"false"},body:bytes});if(!response.ok&&response.status!==409)throw coded("SIGNING_STORAGE_FAILED",502,"De offerte kon niet veilig worden opgeslagen.");}
function safeUrl(value){try{const url=new URL(clean(value));return url.protocol==="https:"?url.toString():"";}catch{return"";}}
function parse(value){try{return JSON.parse(value||"{}");}catch{throw coded("INVALID_JSON",400,"Ongeldige invoer.");}}
function sha256(value){return crypto.createHash("sha256").update(value).digest("hex");}
function clean(value){return String(value??"").trim();}
function validEmail(value){const email=clean(value);return email.length<=320&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);}
function coded(code,status,message){return Object.assign(new Error(message),{code,status,statusCode:status});}
function json(statusCode,body){return{statusCode,headers:{...corsHeaders(),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"},body:statusCode===204?"":JSON.stringify(body)};}

exports._test={bearer,publicSigning,safeUrl};
