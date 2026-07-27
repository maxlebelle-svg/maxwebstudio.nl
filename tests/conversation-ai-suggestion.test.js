const assert=require("node:assert/strict");
const test=require("node:test");
const {createHandler,buildContext,parseStructuredResponse}=require("../functions/conversation-ai-suggestion")._private;

const conversationId="10000000-0000-4000-8000-000000000001";
const suggestionId="30000000-0000-4000-8000-000000000003";
const staffId="20000000-0000-4000-8000-000000000002";
const env={SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"service",OPENAI_API_KEY:"openai-test",OPENAI_MODEL:"gpt-5.6-sol"};
function event(body){return{httpMethod:"POST",headers:{authorization:"Bearer test"},body:JSON.stringify(body)};}
function ok(data){return{ok:true,status:200,json:async()=>data};}

test("assigned employee can request a human-reviewed AI draft",async()=>{
  const calls=[];
  const handler=createHandler({env,verifyStaff:async()=>({success:true,admin:{id:staffId,role:"support"}}),fetchImpl:async(url,options={})=>{
    calls.push({url,options});
    if(url.includes("/conversations?"))return ok([{id:conversationId,assigned_user_id:staffId,status:"open",active_channel:"whatsapp",bot_mode:"assisted"}]);
    if(url.includes("/conversation_messages?"))return ok([{body:"Wat kost een website?",sender_type:"prospect",channel:"whatsapp",created_at:"2026-07-27T10:00:00Z"}]);
    if(url==="https://api.openai.com/v1/responses")return ok({output:[{content:[{type:"output_text",text:JSON.stringify({draft:"Een Starter Site kost €495 excl. btw. Zal ik kort uitleggen wat daarin zit?",confidence:.96,requires_human:false,note:""})}]}]});
    if(url.includes("/rpc/mws_create_ai_suggestion_v1"))return ok({id:suggestionId,conversationId,body:"Een Starter Site kost €495 excl. btw. Zal ik kort uitleggen wat daarin zit?",approvalStatus:"pending",confidence:.96,aiModel:"gpt-5.6-sol"});
    throw new Error(`Unexpected URL: ${url}`);
  }});
  const response=await handler(event({action:"generate",conversationId}));const body=JSON.parse(response.body);
  assert.equal(response.statusCode,200);assert.equal(body.suggestion.approvalStatus,"pending");
  const openAi=calls.find(call=>call.url==="https://api.openai.com/v1/responses");assert.ok(openAi);
  const request=JSON.parse(openAi.options.body);assert.equal(request.model,"gpt-5.6-sol");assert.equal(request.store,false);assert.equal(request.reasoning.effort,"low");assert.equal(request.text.format.type,"json_schema");
  const rpc=calls.find(call=>call.url.includes("mws_create_ai_suggestion_v1"));assert.ok(rpc);assert.equal(JSON.parse(rpc.options.body).p_actor_auth_user_id,staffId);
  assert.equal(calls.some(call=>call.url.includes("whatsapp-send")||call.url.includes("graph.facebook.com")),false);
});

test("employee cannot generate a draft for somebody else's prospect",async()=>{
  let openAiCalls=0;const handler=createHandler({env,verifyStaff:async()=>({success:true,admin:{id:staffId,role:"support"}}),fetchImpl:async(url)=>{if(url==="https://api.openai.com/v1/responses")openAiCalls+=1;return ok([{id:conversationId,assigned_user_id:"40000000-0000-4000-8000-000000000004"}]);}});
  const response=await handler(event({action:"generate",conversationId}));assert.equal(response.statusCode,403);assert.equal(openAiCalls,0);
});

test("approving a suggestion only records review and never sends it",async()=>{
  const calls=[];const handler=createHandler({env,verifyStaff:async()=>({success:true,admin:{id:staffId,role:"sales_manager"}}),fetchImpl:async(url,options={})=>{calls.push({url,options});if(url.includes("/conversation_messages?"))return ok([{id:suggestionId,conversation_id:conversationId,channel:"internal",approval_status:"pending"}]);if(url.includes("/conversations?"))return ok([{id:conversationId,assigned_user_id:null}]);if(url.includes("mws_review_ai_suggestion_v1"))return ok({id:suggestionId,conversationId,body:"Concept",approvalStatus:"approved"});throw new Error(`Unexpected URL: ${url}`);}});
  const response=await handler(event({action:"review",suggestionId,decision:"approved"}));assert.equal(response.statusCode,200);assert.equal(JSON.parse(response.body).suggestion.approvalStatus,"approved");assert.equal(calls.some(call=>call.url.includes("whatsapp-send")||call.url.includes("graph.facebook.com")||call.url==="https://api.openai.com/v1/responses"),false);
});

test("context is bounded and structured responses are parsed safely",()=>{
  const long="x".repeat(13000);const context=buildContext([{body:long,sender_type:"prospect",channel:"web"},{body:"Korte vraag",sender_type:"prospect",channel:"web"}]);assert.equal(context,"Prospect (web): Korte vraag");
  assert.deepEqual(parseStructuredResponse({output_text:'{"draft":"Hoi","confidence":0.5,"requires_human":true,"note":"Controle"}'}),{draft:"Hoi",confidence:0.5,requires_human:true,note:"Controle"});
});
