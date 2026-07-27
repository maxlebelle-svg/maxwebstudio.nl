const crypto=require("crypto");
const {generateAutomatedReply}=require("./services/maxAiReplyService");

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMEOUT_MS=15000;

function createHandler(overrides={}){
  const dependencies={env:process.env,fetchImpl:(...args)=>fetch(...args),logger:console,generateReply:generateAutomatedReply,...overrides};
  return async(event={})=>{
    const raw=String(event.body||"");
    if(event.httpMethod!=="POST")return response(405,"Method not allowed");
    if(!verifyInternalSignature(raw,header(event,"x-max-ai-signature"),dependencies.env.WHATSAPP_APP_SECRET))return response(401,"Invalid signature");
    let payload;try{payload=JSON.parse(raw);}catch{return response(400,"Invalid JSON");}
    if(!UUID.test(clean(payload.conversationId))||!UUID.test(clean(payload.inboundMessageId)))return response(400,"Invalid job");
    try{await processAutopilot(payload,dependencies);return response(200,"Processed");}
    catch(error){dependencies.logger.error?.("whatsapp_autopilot_failed",{code:safeCode(error.code),conversationId:payload.conversationId});return response(503,"Processing unavailable");}
  };
}

async function processAutopilot(payload,dependencies){
  const config=configuration(dependencies.env);const conversationId=clean(payload.conversationId);const inboundMessageId=clean(payload.inboundMessageId);
  const conversations=await rest(`conversations?select=id,bot_mode,status,active_channel&id=eq.${encodeURIComponent(conversationId)}&limit=1`,config,dependencies.fetchImpl);const conversation=conversations?.[0];
  if(!conversation||conversation.bot_mode!=="autopilot"||["resolved","closed","spam"].includes(conversation.status))return{skipped:true,reason:"mode"};
  const messages=await rest(`conversation_messages?select=id,channel,direction,sender_type,body,created_at,provider_created_at&conversation_id=eq.${encodeURIComponent(conversationId)}&channel=neq.internal&order=created_at.desc&limit=24`,config,dependencies.fetchImpl);messages.reverse();
  if(!messages.some(item=>item.id===inboundMessageId&&item.direction==="inbound"))return{skipped:true,reason:"stale"};
  let reply;try{reply=await dependencies.generateReply({messages,channel:"whatsapp",env:dependencies.env,fetchImpl:dependencies.fetchImpl});}
  catch(error){await rpc("mws_handoff_ai_autopilot_v1",{p_conversation_id:conversationId,p_inbound_message_id:inboundMessageId,p_reason:safeCode(error.code)},config,dependencies.fetchImpl);throw error;}
  const queued=await rpc("mws_queue_whatsapp_ai_text_v1",{p_conversation_id:conversationId,p_inbound_message_id:inboundMessageId,p_body:reply.body,p_ai_model:reply.model,p_prompt_version:reply.promptVersion,p_confidence:reply.confidence,p_metadata:{knowledgeVersion:reply.knowledgeVersion,category:reply.category,reason:reply.reason}},config,dependencies.fetchImpl);
  if(!queued?.queued)return{skipped:true,reason:clean(queued?.reason)||"not_queued"};
  const messageId=clean(queued.messageId);if(!UUID.test(messageId))throw coded("AUTOPILOT_QUEUE_INVALID");
  let providerMessageId;try{providerMessageId=await sendToMeta(queued,reply.body,config,dependencies.fetchImpl);}catch(error){await finalize(messageId,null,false,error.code,"Automatisch antwoord niet geaccepteerd.",config,dependencies.fetchImpl).catch(()=>null);throw error;}
  await finalize(messageId,providerMessageId,true,null,null,config,dependencies.fetchImpl);
  if(reply.requiresHuman)await rpc("mws_handoff_ai_autopilot_v1",{p_conversation_id:conversationId,p_inbound_message_id:inboundMessageId,p_reason:reply.reason},config,dependencies.fetchImpl);
  return{sent:true,messageId,requiresHuman:reply.requiresHuman};
}

async function sendToMeta(queued,body,config,fetchImpl){const phoneNumberId=clean(queued.phoneNumberId);const recipient=clean(queued.recipient).replace(/[^0-9]/g,"");if(!phoneNumberId||phoneNumberId!==config.phoneNumberId||!recipient)throw coded("WHATSAPP_AUTOPILOT_TARGET_INVALID");let result;try{result=await fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${phoneNumberId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${config.accessToken}`,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:recipient,type:"text",text:{preview_url:false,body}}),signal:AbortSignal.timeout(TIMEOUT_MS)});}catch{throw coded("WHATSAPP_META_UNAVAILABLE");}const data=await result.json().catch(()=>null);if(!result.ok)throw coded("WHATSAPP_META_REJECTED");const id=clean(data?.messages?.[0]?.id);if(!id)throw coded("WHATSAPP_META_INVALID_RESPONSE");return id;}
function finalize(messageId,providerMessageId,sent,failureCode,failureReason,config,fetchImpl){return rpc("mws_finalize_whatsapp_text_v1",{p_message_id:messageId,p_provider_message_id:providerMessageId,p_sent:sent,p_failure_code:failureCode,p_failure_reason:failureReason},config,fetchImpl);}
async function rest(path,config,fetchImpl){const result=await fetchImpl(`${config.url}/rest/v1/${path}`,{headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,Accept:"application/json"},signal:AbortSignal.timeout(TIMEOUT_MS)});const data=await result.json().catch(()=>null);if(!result.ok)throw coded("AUTOPILOT_STORAGE_REJECTED");return data;}
async function rpc(name,body,config,fetchImpl){const result=await fetchImpl(`${config.url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,"Content-Type":"application/json",Accept:"application/json","Accept-Profile":"public","Content-Profile":"public"},body:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT_MS)});const data=await result.json().catch(()=>null);if(!result.ok)throw coded("AUTOPILOT_STORAGE_REJECTED");return data;}
function configuration(env){const value={url:clean(env.SUPABASE_URL).replace(/\/$/,""),key:clean(env.SUPABASE_SERVICE_ROLE_KEY),accessToken:clean(env.WHATSAPP_ACCESS_TOKEN),phoneNumberId:clean(env.WHATSAPP_PHONE_NUMBER_ID),graphVersion:clean(env.WHATSAPP_GRAPH_API_VERSION)};if(!value.url||!value.key||!value.accessToken||!value.phoneNumberId||!/^v\d+\.\d+$/.test(value.graphVersion))throw coded("WHATSAPP_CONFIGURATION_MISSING");return value;}
function signInternalPayload(raw,secret){const key=deriveKey(secret);return key?`sha256=${crypto.createHmac("sha256",key).update(raw).digest("hex")}`:"";}
function verifyInternalSignature(raw,signature,secret){const expected=signInternalPayload(raw,secret);const left=Buffer.from(clean(signature));const right=Buffer.from(expected);return Boolean(expected)&&left.length===right.length&&crypto.timingSafeEqual(left,right);}
function deriveKey(secret){const value=clean(secret);return value?crypto.createHmac("sha256",value).update("max-ai-autopilot-v1").digest():null;}
function header(event,name){const pair=Object.entries(event.headers||{}).find(([key])=>key.toLowerCase()===name.toLowerCase());return clean(pair?.[1]);}
function safeCode(code){return /^[A-Z0-9_]+$/.test(clean(code))?clean(code):"AUTOPILOT_INTERNAL_ERROR";}
function coded(code){const error=new Error(code);error.code=code;return error;}
function clean(value){return value===undefined||value===null?"":String(value).trim();}
function response(statusCode,body){return{statusCode,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"},body:String(body)};}

exports.handler=createHandler();exports._private={createHandler,processAutopilot,sendToMeta,signInternalPayload,verifyInternalSignature};
