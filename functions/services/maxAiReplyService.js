const { renderKnowledge, KNOWLEDGE_VERSION } = require("../max-ai-knowledge");

const MAX_CONTEXT_MESSAGES = 24;
const MAX_CONTEXT_CHARS = 12000;
const TIMEOUT_MS = 15000;
const PROMPT_VERSION = "max-ai-autopilot-v1";
const MIN_AUTOPILOT_CONFIDENCE = 0.72;
const HANDOFF_TEXT = "Dank je voor je bericht. Ik zorg dat een medewerker van Max Webstudio dit persoonlijk met je oppakt.";

function detectMandatoryHandoff(message){
  const value=clean(message).toLocaleLowerCase("nl-NL");
  const rules=[
    ["human_requested",/\b(medewerker|echt persoon|mens spreken|persoon spreken|bel me|terugbellen)\b/],
    ["complaint",/\b(klacht|boos|ontevreden|oplichting|slecht|annuleren|geld terug|refund)\b/],
    ["custom_commitment",/\b(korting|garantie|juridisch|contract|definitieve prijs|vaste prijs|opleverdatum|deadline)\b/],
    ["sensitive_data",/\b(wachtwoord|creditcard|bankrekening|bsn|paspoort|identiteitsbewijs)\b/],
  ];
  return rules.find(([,pattern])=>pattern.test(value))?.[0]||"";
}

function buildContext(messages){
  let used=0;const output=[];
  for(const row of [...(messages||[])].slice(-MAX_CONTEXT_MESSAGES)){
    const body=clean(row.body);if(!body)continue;
    const speaker=row.sender_type==="prospect"||row.senderType==="prospect"?"Prospect":row.sender_type==="bot"||row.senderType==="bot"?"Max AI":"Medewerker";
    const channel=clean(row.channel)||"onbekend";const line=`${speaker} (${channel}): ${body}`;
    if(used+line.length>MAX_CONTEXT_CHARS)continue;
    output.push(line);used+=line.length;
  }
  return output.join("\n");
}

async function generateAutomatedReply({messages,channel,env=process.env,fetchImpl=(...args)=>fetch(...args)}){
  const lastProspect=[...(messages||[])].reverse().find(row=>row.sender_type==="prospect"||row.senderType==="prospect");
  const mandatoryReason=detectMandatoryHandoff(lastProspect?.body);
  if(mandatoryReason)return handoff(mandatoryReason,1);
  const apiKey=clean(env.OPENAI_API_KEY);if(!apiKey)throw coded("OPENAI_CONFIGURATION_MISSING");
  const model=clean(env.OPENAI_MODEL)||"gpt-5.6-sol";const context=buildContext(messages);
  if(!context)throw coded("OPENAI_CONTEXT_MISSING");
  const firstBotMessage=!(messages||[]).some(row=>row.sender_type==="bot"||row.senderType==="bot");
  const prompt=`Je bent Max AI, de Nederlandstalige AI-assistent van Max Webstudio. Je voert zelfstandig een zakelijk chatgesprek, maar alleen binnen onderstaande grenzen. Gebruik uitsluitend de goedgekeurde kennis en letterlijke gespreksinformatie. Verzin geen prijzen, planning, demo-status, kortingen, afspraken, garanties of technische mogelijkheden. Vraag nooit om wachtwoorden, betaalkaartgegevens, BSN of identiteitsdocumenten. Maak geen juridisch bindende toezeggingen. Zet requires_human op true bij twijfel, klachten, privacy- of betaalproblemen, maatwerkoffertes, kortingsverzoeken, definitieve planning of als iemand een mens wil spreken. Houd antwoorden kort, vriendelijk en natuurlijk. Stel maximaal één logische vervolgvraag. ${firstBotMessage?"Stel je in dit antwoord kort voor als Max, de AI-assistent van Max Webstudio.":"Herhaal niet dat je AI bent tenzij dat relevant is."}\n\nGOEDGEKEURDE KENNIS (${KNOWLEDGE_VERSION}):\n${renderKnowledge()}`;
  let response;try{response=await fetchImpl("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,input:[{role:"developer",content:[{type:"input_text",text:prompt}]},{role:"user",content:[{type:"input_text",text:`Kanaal: ${clean(channel)||"web"}\n\nGESPREK:\n${context}\n\nGeef het beste volgende antwoord.`}]}],store:false,reasoning:{effort:"low"},max_output_tokens:500,text:{verbosity:"low",format:{type:"json_schema",name:"max_ai_autopilot_reply",strict:true,schema:{type:"object",properties:{draft:{type:"string",minLength:1,maxLength:4096},confidence:{type:"number",minimum:0,maximum:1},requires_human:{type:"boolean"},reason:{type:"string",maxLength:120},category:{type:"string",enum:["greeting","qualification","pricing","demo","process","support","other"]}},required:["draft","confidence","requires_human","reason","category"],additionalProperties:false}}}}),signal:AbortSignal.timeout(TIMEOUT_MS)});}catch{throw coded("OPENAI_UNAVAILABLE");}
  const data=await response.json().catch(()=>null);if(!response.ok)throw coded(response.status===429?"OPENAI_RATE_LIMITED":"OPENAI_REJECTED");
  const parsed=parseResponse(data);const confidence=Math.max(0,Math.min(1,Number(parsed.confidence)||0));
  if(parsed.requires_human||confidence<MIN_AUTOPILOT_CONFIDENCE)return handoff(parsed.reason||"low_confidence",confidence);
  return{body:clean(parsed.draft).slice(0,4096),confidence,requiresHuman:false,reason:clean(parsed.reason).slice(0,120),category:parsed.category,model,promptVersion:PROMPT_VERSION,knowledgeVersion:KNOWLEDGE_VERSION};
}

function parseResponse(response){
  const direct=clean(response?.output_text);const text=direct||((response?.output||[]).flatMap(item=>item?.content||[]).find(item=>item?.type==="output_text")?.text||"");
  if(!text)throw coded("OPENAI_INVALID_RESPONSE");let value;try{value=JSON.parse(text);}catch{throw coded("OPENAI_INVALID_RESPONSE");}
  if(!clean(value?.draft))throw coded("OPENAI_INVALID_RESPONSE");return value;
}
function handoff(reason,confidence){return{body:HANDOFF_TEXT,confidence,requiresHuman:true,reason,category:"support",model:"policy",promptVersion:PROMPT_VERSION,knowledgeVersion:KNOWLEDGE_VERSION};}
function coded(code){const error=new Error(code);error.code=code;return error;}
function clean(value){return value===undefined||value===null?"":String(value).trim();}

module.exports={MAX_CONTEXT_CHARS,MAX_CONTEXT_MESSAGES,MIN_AUTOPILOT_CONFIDENCE,PROMPT_VERSION,HANDOFF_TEXT,buildContext,detectMandatoryHandoff,generateAutomatedReply,parseResponse};
