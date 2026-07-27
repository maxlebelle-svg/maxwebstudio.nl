const assert=require("node:assert/strict");
const test=require("node:test");
const {createHandler}=require("../functions/conversations-inbox")._private;

const conversationId="10000000-0000-4000-8000-000000000001";
const staffId="20000000-0000-4000-8000-000000000002";
const env={SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"service"};
function event(method="GET",query={},body=null){return{httpMethod:method,headers:{authorization:"Bearer test"},queryStringParameters:query,body:body?JSON.stringify(body):""};}

test("employee list query is always scoped to the authenticated assignment",async()=>{
  const urls=[];const handler=createHandler({env,verifyStaff:async()=>({success:true,admin:{id:staffId,role:"sales_partner"}}),fetchImpl:async(url)=>{urls.push(url);if(url.includes("/conversations?"))return{ok:true,json:async()=>[]};return{ok:true,json:async()=>[]};}});
  const response=await handler(event());
  assert.equal(response.statusCode,200);
  assert.match(urls[0],new RegExp(`assigned_user_id=eq\\.${staffId}`));
  assert.equal(JSON.parse(response.body).scope,"assigned");
});

test("manager sees all conversations and receives an assignment list",async()=>{
  const urls=[];const handler=createHandler({env,verifyStaff:async()=>({success:true,admin:{id:staffId,role:"sales_manager"}}),fetchImpl:async(url)=>{urls.push(url);if(url.includes("/profiles?"))return{ok:true,json:async()=>[{auth_user_id:staffId,name:"Max",role:"sales_manager"}]};return{ok:true,json:async()=>[]};}});
  const response=await handler(event());const body=JSON.parse(response.body);
  assert.equal(response.statusCode,200);assert.equal(body.scope,"all");assert.equal(body.staff.length,1);
  assert.doesNotMatch(urls[0],/assigned_user_id=eq/);
});

test("employee cannot assign conversations",async()=>{
  let rpcCalls=0;const handler=createHandler({env,verifyStaff:async()=>({success:true,admin:{id:staffId,role:"sales_partner"}}),fetchImpl:async(url)=>{if(url.includes("/conversations?"))return{ok:true,json:async()=>[{id:conversationId,assigned_user_id:staffId}]};if(url.includes("/rpc/"))rpcCalls+=1;return{ok:true,json:async()=>({status:"resolved"})};}});
  const response=await handler(event("POST",{}, {conversationId,action:"assign",assignedUserId:staffId}));
  assert.equal(response.statusCode,403);assert.equal(rpcCalls,0);
});

test("employee can pause an assigned conversation through the audited RPC",async()=>{
  const calls=[];const handler=createHandler({env,verifyStaff:async()=>({success:true,admin:{id:staffId,role:"support"}}),fetchImpl:async(url,options={})=>{calls.push({url,options});if(url.includes("/conversations?"))return{ok:true,json:async()=>[{id:conversationId,assigned_user_id:staffId}]};return{ok:true,json:async()=>({status:"resolved",conversationId,action:"pause_bot"})};}});
  const response=await handler(event("POST",{}, {conversationId,action:"pause_bot"}));
  assert.equal(response.statusCode,200);const rpc=calls.find(call=>call.url.endsWith("mws_manage_conversation_v1"));assert.ok(rpc);assert.equal(JSON.parse(rpc.options.body).p_actor_auth_user_id,staffId);
});

test("employee cannot manage another employee's conversation",async()=>{
  let rpcCalls=0;const handler=createHandler({env,verifyStaff:async()=>({success:true,admin:{id:staffId,role:"support"}}),fetchImpl:async(url)=>{if(url.includes("/conversations?"))return{ok:true,json:async()=>[{id:conversationId,assigned_user_id:"30000000-0000-4000-8000-000000000003"}]};if(url.includes("/rpc/"))rpcCalls+=1;return{ok:true,json:async()=>({})};}});
  const response=await handler(event("POST",{}, {conversationId,action:"resolve"}));assert.equal(response.statusCode,403);assert.equal(rpcCalls,0);
});
