const crypto = require("crypto");

const BUCKET = "relationship-assets";
const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED = new Set(["image/jpeg","image/png","image/webp","image/svg+xml","video/mp4","video/webm","application/pdf","text/plain","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const CATEGORIES = new Set(["logo","photo","team","project","product","brand","video","document","text","social","other"]);

exports.handler = async (event) => {
  if (!["GET","POST"].includes(event.httpMethod)) return response(405, { success:false, code:"INVALID_METHOD", error:"Deze actie wordt niet ondersteund." });
  try {
    const context = config();
    const token = bearer(event);
    if (!token) return response(401, { success:false, code:"AUTH_REQUIRED", error:"Log opnieuw in." });
    const user = await authUser(context, token);
    const customer = await ownedCustomer(context, user.id);
    if (!customer) return response(403, { success:false, code:"FORBIDDEN", error:"Er is geen toegankelijke klantwerkruimte gevonden." });
    if (event.httpMethod === "GET") return listAssets(context, customer.id);
    const input = JSON.parse(event.body || "{}");
    return uploadAsset(context, user, customer, input);
  } catch (error) {
    console.error("Client relationship asset failed", { code:error.code||"INTERNAL_ERROR", message:error.message });
    return response(error.status||500, { success:false, code:error.code||"INTERNAL_ERROR", error:error.status?error.message:"Bestanden konden niet veilig worden verwerkt." });
  }
};

async function listAssets(context, customerId) {
  const [assets, requests] = await Promise.all([
    rest(context, `files?select=id,name,file_type,category,status,is_client_visible,original_filename,mime_type,size_bytes,uploaded_by_type,source_module,usage_rights_confirmed,is_primary,created_at,updated_at&customer_id=eq.${customerId}&is_client_visible=eq.true&order=created_at.desc`, { method:"GET" }),
    rest(context, `asset_requests?select=id,title,instructions,requested_categories,minimum_count,deadline,status,created_at&customer_id=eq.${customerId}&status=in.(open,partial)&order=created_at.desc`, { method:"GET" }).catch(()=>[]),
  ]);
  return response(200, { success:true, assets:Array.isArray(assets)?assets:[], requests:Array.isArray(requests)?requests:[] });
}

async function uploadAsset(context, user, customer, input) {
  const name = clean(input.name).slice(0,180);
  const mimeType = clean(input.mimeType).toLowerCase();
  const category = CATEGORIES.has(clean(input.category).toLowerCase()) ? clean(input.category).toLowerCase() : "other";
  const content = clean(input.content);
  const usageRightsConfirmed = input.usageRightsConfirmed === true;
  if (!name || !ALLOWED.has(mimeType) || !content) throw coded("INVALID_FILE",400,"Dit bestandstype kan niet worden geüpload.");
  if (!usageRightsConfirmed) throw coded("USAGE_RIGHTS_REQUIRED",400,"Bevestig dat je dit bestand mag aanleveren.");
  let bytes;
  try { bytes = Buffer.from(content,"base64"); } catch { throw coded("INVALID_FILE",400,"Het bestand kon niet worden gelezen."); }
  if (!bytes.length || bytes.length > MAX_BYTES) throw coded("FILE_TOO_LARGE",413,"Een bestand mag maximaal 8 MB zijn.");
  if (!signatureMatches(bytes,mimeType)) throw coded("MIME_MISMATCH",400,"Het bestandstype komt niet overeen met de inhoud.");
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const duplicate = await rest(context, `files?select=id,name,status&customer_id=eq.${customer.id}&checksum=eq.${checksum}&status=neq.archived&limit=1`, { method:"GET" });
  if (duplicate?.[0]) return response(200, { success:true, duplicate:true, asset:duplicate[0], message:"Dit bestand staat al in je werkruimte." });
  const assetId = crypto.randomUUID();
  const safeName = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-120) || "bestand";
  const storagePath = `${customer.id}/${assetId}/${safeName}`;
  await storageUpload(context, storagePath, mimeType, bytes);
  const record = { id:assetId, customer_id:customer.id, lead_id:null, uploaded_by_auth_user_id:user.id, uploaded_by_type:"customer", source_module:"customer_portal", name, original_filename:name, file_type:mimeType.split("/")[0], category, storage_path:storagePath, mime_type:mimeType, size_bytes:bytes.length, checksum, status:"new", usage_rights_confirmed:true, is_client_visible:true, metadata:{ source:"customer_portal", description:clean(input.description).slice(0,500) } };
  const inserted = await rest(context, "files", { method:"POST", headers:{Prefer:"return=representation"}, body:JSON.stringify(record) });
  await timeline(context, customer.id, user.id, "asset_uploaded", { assetId, category, sizeBytes:bytes.length });
  return response(201, { success:true, duplicate:false, asset:safeAsset(inserted?.[0]||record), message:"Je bestand is veilig aangeleverd en wacht op controle." });
}

function signatureMatches(bytes,mime) {
  if (mime==="image/jpeg") return bytes[0]===0xff&&bytes[1]===0xd8;
  if (mime==="image/png") return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime==="image/webp") return bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP";
  if (mime==="application/pdf") return bytes.subarray(0,5).toString()==="%PDF-";
  if (mime==="video/mp4") return bytes.subarray(4,8).toString()==="ftyp";
  if (mime==="video/webm") return bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  return !bytes.subarray(0,2).equals(Buffer.from("MZ"));
}
async function authUser(context,token){const result=await fetch(`${context.url}/auth/v1/user`,{headers:{apikey:context.anon,Authorization:`Bearer ${token}`}});const data=await result.json().catch(()=>({}));if(!result.ok||!data.id)throw coded("AUTH_REQUIRED",401,"Log opnieuw in.");return data;}
async function ownedCustomer(context,userId){const rows=await rest(context,`customers?select=id,profile_id,auth_user_id,status&auth_user_id=eq.${userId}&limit=1`,{method:"GET"});if(rows?.[0])return rows[0];const profiles=await rest(context,`profiles?select=id&auth_user_id=eq.${userId}&limit=1`,{method:"GET"});if(!profiles?.[0])return null;const customers=await rest(context,`customers?select=id,profile_id,auth_user_id,status&profile_id=eq.${profiles[0].id}&limit=1`,{method:"GET"});return customers?.[0]||null;}
async function storageUpload(context,path,mime,bytes){const result=await fetch(`${context.url}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`,{method:"POST",headers:{apikey:context.key,Authorization:`Bearer ${context.key}`,"Content-Type":mime,"x-upsert":"false"},body:bytes});if(!result.ok)throw coded("STORAGE_FAILED",502,"Het bestand kon niet worden opgeslagen.");}
async function timeline(context,customerId,userId,eventType,metadata){await rest(context,"customer_timeline_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({customer_id:customerId,event_type:eventType,title:"Bestand aangeleverd",actor_auth_user_id:userId,source_module:"customer_portal",status:"success",metadata})}).catch(()=>null);}
async function rest(context,path,options={}){const result=await fetch(`${context.url}/rest/v1/${path}`,{...options,headers:{apikey:context.key,Authorization:`Bearer ${context.key}`,Accept:"application/json","Content-Type":"application/json",...(options.headers||{})}});const data=await result.json().catch(()=>null);if(!result.ok)throw coded("DATA_FAILED",result.status>=500?502:400,"Bestandsgegevens konden niet worden verwerkt.");return data;}
function safeAsset(row){return {id:row.id,name:row.name,category:row.category,status:row.status,mimeType:row.mime_type,sizeBytes:row.size_bytes,uploadedByType:row.uploaded_by_type,createdAt:row.created_at};}
function bearer(event){const value=event.headers.authorization||event.headers.Authorization||"";return value.startsWith("Bearer ")?value.slice(7).trim():"";}
function config(){const url=clean(process.env.SUPABASE_URL).replace(/\/$/,"");const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);const anon=clean(process.env.SUPABASE_ANON_KEY);if(!url||!key||!anon)throw coded("SERVICE_UNAVAILABLE",503,"Uploaden is tijdelijk niet beschikbaar.");return{url,key,anon};}
function clean(value){return String(value||"").trim();}function coded(code,status,message){return Object.assign(new Error(message),{code,status});}function response(statusCode,body){return{statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)};}

exports._test={signatureMatches,safeAsset,ALLOWED,CATEGORIES,MAX_BYTES};
