const { verifyAdmin } = require("./_admin-auth");

const STAFF_ROLES = ["super_admin","admin","sales_manager","sales_partner","designer","developer","support"];
const MANAGER_ROLES = new Set(["super_admin","admin","sales_manager"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 8000;

function createHandler(overrides={}) {
  const dependencies={ env:process.env, fetchImpl:(...args)=>fetch(...args), verifyStaff:(event)=>verifyAdmin(event,json,{allowedRoles:STAFF_ROLES,module:"conversations",action:event.httpMethod==="GET"?"view":"manage",disableLegacyToken:true}), ...overrides };
  return async(event={})=>{
    if(!["GET","POST"].includes(event.httpMethod))return json(405,{success:false,error:"Methode niet toegestaan."});
    const auth=await dependencies.verifyStaff(event);if(!auth?.success)return auth?.response||json(401,{success:false,error:"Niet geautoriseerd."});
    try{
      const config=configuration(dependencies.env);
      if(event.httpMethod==="GET")return handleGet(event,auth.admin,config,dependencies.fetchImpl);
      return handlePost(event,auth.admin,config,dependencies.fetchImpl);
    }catch(error){return json(error.statusCode||502,{success:false,error:publicError(error.code)});}
  };
}

async function handleGet(event,staff,config,fetchImpl){
  const id=clean(event.queryStringParameters?.id);
  if(id&&!UUID.test(id))return json(400,{success:false,error:"Ongeldig gesprek."});
  const elevated=MANAGER_ROLES.has(clean(staff.role).toLowerCase());
  const accessFilter=elevated?"":`&assigned_user_id=eq.${encodeURIComponent(staff.id)}`;
  const idFilter=id?`&id=eq.${encodeURIComponent(id)}`:"";
  const rows=await rest(`conversations?select=id,lead_id,customer_id,assigned_user_id,title,status,bot_mode,active_channel,priority,summary,next_action,last_message_at,human_takeover_at,created_at&order=last_message_at.desc.nullslast,created_at.desc&limit=${id?1:100}${idFilter}${accessFilter}`,config,fetchImpl);
  if(id&&!rows?.[0])return json(404,{success:false,error:"Gesprek niet gevonden of niet aan jou toegewezen."});
  const ids=rows.map(row=>row.id);const leadIds=rows.map(row=>row.lead_id).filter(Boolean);const assigneeIds=rows.map(row=>row.assigned_user_id).filter(Boolean);
  const [channels,leads,profiles]=await Promise.all([
    ids.length?rest(`conversation_channels?select=id,conversation_id,channel,status,external_contact_id,display_name,normalized_phone,metadata&conversation_id=in.(${ids.join(",")})`,config,fetchImpl):[],
    leadIds.length?rest(`leads?select=id,company,name,email,phone,status&id=in.(${leadIds.join(",")})`,config,fetchImpl):[],
    assigneeIds.length?rest(`profiles?select=auth_user_id,name,email,role&auth_user_id=in.(${assigneeIds.join(",")})`,config,fetchImpl):[],
  ]);
  const leadMap=new Map(leads.map(row=>[row.id,row]));const profileMap=new Map(profiles.map(row=>[row.auth_user_id,row]));
  const normalized=rows.map(row=>normalizeConversation(row,channels.filter(channel=>channel.conversation_id===row.id),leadMap.get(row.lead_id),profileMap.get(row.assigned_user_id)));
  if(!id){
    const staff=elevated?await rest("profiles?select=auth_user_id,name,email,role&status=eq.active&role=in.(super_admin,admin,sales_manager,sales_partner,designer,developer,support)&order=name.asc",config,fetchImpl):[];
    return json(200,{success:true,conversations:normalized,scope:elevated?"all":"assigned",staff:staff.map(row=>({id:row.auth_user_id,name:row.name||row.email,role:row.role}))});
  }
  const messages=await rest(`conversation_messages?select=id,channel,direction,sender_type,body,content_type,delivery_status,ai_generated,ai_model,prompt_version,confidence,approval_status,created_at,provider_created_at,sent_at,delivered_at,read_at&conversation_id=eq.${encodeURIComponent(id)}&order=created_at.asc&limit=300`,config,fetchImpl);
  return json(200,{success:true,conversation:normalized[0],messages:messages.map(normalizeMessage)});
}

async function handlePost(event,staff,config,fetchImpl){
  let payload;try{payload=JSON.parse(event.body||"{}");}catch{return json(400,{success:false,error:"Ongeldig verzoek."});}
  const conversationId=clean(payload.conversationId);const action=clean(payload.action).toLowerCase();const assignedUserId=clean(payload.assignedUserId)||null;
  if(!UUID.test(conversationId)||!['assign','unassign','resolve','reopen','pause_bot','resume_bot','enable_autopilot'].includes(action))return json(400,{success:false,error:"Ongeldige gespreksactie."});
  const rows=await rest(`conversations?select=id,assigned_user_id&id=eq.${encodeURIComponent(conversationId)}&limit=1`,config,fetchImpl);const conversation=rows?.[0];
  if(!conversation)throw status("CONVERSATION_NOT_FOUND",404);
  const manager=MANAGER_ROLES.has(clean(staff.role).toLowerCase());
  if(['assign','unassign','enable_autopilot'].includes(action)&&!manager)return json(403,{success:false,error:"Alleen een beheerder kan deze actie uitvoeren."});
  if(!manager&&clean(conversation.assigned_user_id)!==clean(staff.id))return json(403,{success:false,error:"Dit gesprek is niet aan jou toegewezen."});
  if(action==='assign'&&!UUID.test(assignedUserId||''))return json(400,{success:false,error:"Kies een geldige medewerker."});
  const result=await rpc("mws_manage_conversation_v1",{p_conversation_id:conversationId,p_action:action,p_actor_auth_user_id:staff.id,p_assigned_user_id:assignedUserId},config,fetchImpl);
  return json(200,{success:true,result});
}

function normalizeConversation(row,channels,lead,assignee){return{id:row.id,title:lead?.company||row.title||lead?.name||"Nieuw gesprek",contactName:lead?.name||channels.find(c=>c.display_name)?.display_name||"",email:lead?.email||"",phone:lead?.phone||channels.find(c=>c.normalized_phone)?.normalized_phone||"",status:row.status,botMode:row.bot_mode,activeChannel:row.active_channel,priority:row.priority,summary:row.summary||"",nextAction:row.next_action||"",lastMessageAt:row.last_message_at||row.created_at,assignedUserId:row.assigned_user_id||null,assignedUserName:assignee?.name||assignee?.email||"Niet toegewezen",channels:channels.map(c=>({id:c.id,channel:c.channel,status:c.status,phone:c.normalized_phone||""}))};}
function normalizeMessage(row){return{id:row.id,channel:row.channel,direction:row.direction,senderType:row.sender_type,body:row.body||"",contentType:row.content_type,deliveryStatus:row.delivery_status,aiGenerated:Boolean(row.ai_generated),aiModel:row.ai_model||"",promptVersion:row.prompt_version||"",confidence:row.confidence===null||row.confidence===undefined?null:Number(row.confidence),approvalStatus:row.approval_status,createdAt:row.provider_created_at||row.created_at,sentAt:row.sent_at||null,deliveredAt:row.delivered_at||null,readAt:row.read_at||null};}
async function rest(path,config,fetchImpl){let response;try{response=await fetchImpl(`${config.url}/rest/v1/${path}`,{headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,Accept:"application/json"},signal:AbortSignal.timeout(TIMEOUT_MS)});}catch{throw status("INBOX_STORAGE_UNAVAILABLE",503);}const data=await response.json().catch(()=>null);if(!response.ok)throw status("INBOX_STORAGE_REJECTED",502);return data;}
async function rpc(name,body,config,fetchImpl){const response=await fetchImpl(`${config.url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,"Content-Type":"application/json",Accept:"application/json","Accept-Profile":"public","Content-Profile":"public"},body:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT_MS)});const data=await response.json().catch(()=>null);if(!response.ok)throw status("INBOX_STORAGE_REJECTED",502);return data;}
function configuration(env){const url=clean(env.SUPABASE_URL).replace(/\/$/,"");const key=clean(env.SUPABASE_SERVICE_ROLE_KEY);if(!url||!key)throw status("INBOX_CONFIGURATION_MISSING",503);return{url,key};}
function publicError(code){return({CONVERSATION_NOT_FOUND:"Gesprek niet gevonden.",INBOX_CONFIGURATION_MISSING:"De gesprekkeninbox is nog niet geactiveerd.",INBOX_STORAGE_UNAVAILABLE:"De gesprekkeninbox is tijdelijk niet bereikbaar."})[code]||"De gesprekkeninbox kon niet veilig worden geladen.";}
function status(code,statusCode){const error=new Error(code);error.code=code;error.statusCode=statusCode;return error;}
function clean(value){return value===undefined||value===null?"":String(value).trim();}
function json(statusCode,body){return{statusCode,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},body:JSON.stringify(body)};}

exports.handler=createHandler();exports._private={createHandler,handleGet,handlePost,normalizeConversation,normalizeMessage};
