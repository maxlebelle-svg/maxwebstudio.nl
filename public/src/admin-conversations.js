(function initConversationInbox(){
  const state={conversations:[],staff:[],selectedId:"",detail:null,messages:[],suggestions:[],timer:null,loading:false};
  const $=(id)=>document.getElementById(id);
  const clean=(value)=>String(value||"").trim();

  function token(){
    for(const key of ["maxwebstudioSupabaseAuthSession","mws_admin_supabase_session"]){
      try{const value=JSON.parse(localStorage.getItem(key)||"null");if(value?.access_token)return value.access_token;if(value?.accessToken)return value.accessToken;}catch{}
    }
    return"";
  }
  async function api(path,options={}){
    const response=await fetch(path,{...options,headers:{Accept:"application/json",Authorization:`Bearer ${token()}`,...(options.headers||{})},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.success)throw new Error(data.error||"De gesprekkeninbox kon niet worden geladen.");
    return data;
  }
  function setStatus(message,error=false){const node=$("conversation-status");node.textContent=message||"";node.classList.toggle("is-error",error);}
  function formatTime(value){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("nl-NL",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date):"";}
  function visibleConversations(){
    const query=clean($("conversation-search").value).toLowerCase();const filter=$("conversation-filter").value;
    return state.conversations.filter(item=>{const matches=!query||[item.title,item.contactName,item.phone,item.email].join(" ").toLowerCase().includes(query);const active=!["resolved","closed","spam"].includes(item.status);return matches&&(filter==="all"||filter==="active"&&active||item.status===filter);});
  }
  function renderList(){
    const list=$("conversation-list");list.replaceChildren();const rows=visibleConversations();
    if(!rows.length){const empty=document.createElement("div");empty.className="conversation-empty";empty.textContent="Geen gesprekken gevonden.";list.appendChild(empty);return;}
    rows.forEach(item=>{const button=document.createElement("button");button.type="button";button.className=`conversation-item${item.id===state.selectedId?" is-active":""}`;const title=document.createElement("strong");title.textContent=item.title;const channel=document.createElement("span");channel.className="conversation-item__channel";channel.textContent=item.activeChannel;const meta=document.createElement("p");meta.textContent=`${item.assignedUserName} · ${formatTime(item.lastMessageAt)} · ${item.status.replaceAll("_"," ")}`;button.append(title,channel,meta);button.addEventListener("click",()=>selectConversation(item.id));list.appendChild(button);});
  }
  async function loadList(silent=false){
    if(state.loading)return;state.loading=true;
    try{const data=await api("/api/conversations-inbox");state.conversations=data.conversations||[];state.staff=data.staff||[];$("conversation-scope").textContent=data.scope==="all"?"Alle gesprekken":"Mijn prospects";renderList();if(state.selectedId&&state.conversations.some(item=>item.id===state.selectedId))await loadDetail(state.selectedId,true);if(!silent)setStatus(`${state.conversations.length} gesprekken geladen.`);}catch(error){setStatus(error.message,true);}finally{state.loading=false;}
  }
  async function selectConversation(id){state.selectedId=id;renderList();await loadDetail(id,false);}
  async function loadDetail(id,silent){
    try{const data=await api(`/api/conversations-inbox?id=${encodeURIComponent(id)}`);state.detail=data.conversation;const all=data.messages||[];state.messages=all.filter(item=>item.channel!=="internal");state.suggestions=all.filter(item=>item.channel==="internal"&&item.aiGenerated);renderDetail();if(!silent)setStatus(`Gesprek met ${state.detail.title} geopend.`);}catch(error){setStatus(error.message,true);}
  }
  function renderDetail(){
    const root=$("conversation-detail");root.replaceChildren();if(!state.detail)return;
    const header=document.createElement("header");header.className="conversation-header";
    const identity=document.createElement("div");const title=document.createElement("h2");title.textContent=state.detail.title;const meta=document.createElement("p");meta.textContent=[state.detail.contactName,state.detail.phone,state.detail.email].filter(Boolean).join(" · ")||"Nog geen contactgegevens";identity.append(title,meta);
    const actions=document.createElement("div");actions.className="conversation-header__actions";
    if(state.staff.length){const select=document.createElement("select");select.setAttribute("aria-label","Medewerker toewijzen");select.add(new Option("Niet toegewezen",""));state.staff.forEach(person=>select.add(new Option(`${person.name} · ${person.role}`,person.id)));select.value=state.detail.assignedUserId||"";select.addEventListener("change",()=>manage(select.value?"assign":"unassign",select.value));actions.appendChild(select);}
    if(state.staff.length){const autopilot=document.createElement("button");autopilot.type="button";autopilot.className=state.detail.botMode==="autopilot"?"conversation-ai-button":"";autopilot.textContent=state.detail.botMode==="autopilot"?"Automatisch aan":"Automatisch inschakelen";autopilot.addEventListener("click",()=>manage(state.detail.botMode==="autopilot"?"resume_bot":"enable_autopilot"));actions.appendChild(autopilot);}
    const suggest=document.createElement("button");suggest.type="button";suggest.className="conversation-ai-button";suggest.textContent="Max AI voorstel";suggest.addEventListener("click",()=>generateSuggestion(suggest));
    const pause=document.createElement("button");pause.type="button";pause.textContent=state.detail.botMode==="paused"?"Max hervatten":"Max pauzeren";pause.addEventListener("click",()=>manage(state.detail.botMode==="paused"?"resume_bot":"pause_bot"));
    const resolve=document.createElement("button");resolve.type="button";resolve.textContent=state.detail.status==="resolved"?"Heropenen":"Afronden";resolve.addEventListener("click",()=>manage(state.detail.status==="resolved"?"reopen":"resolve"));actions.append(suggest,pause,resolve);header.append(identity,actions);

    const messages=document.createElement("div");messages.className="conversation-messages";messages.id="conversation-messages";
    state.messages.forEach(item=>{const article=document.createElement("article");article.className=`conversation-message${item.direction==="outbound"?" is-outbound":""}`;const label=document.createElement("small");label.textContent=`${item.senderType==="prospect"?"Prospect":item.senderType==="bot"?"Max AI":"Medewerker"} · ${item.channel} · ${formatTime(item.createdAt)}`;const body=document.createElement("p");body.textContent=item.body;article.append(label,body);messages.appendChild(article);});
    if(!state.messages.length){const empty=document.createElement("div");empty.className="conversation-empty";empty.textContent="Nog geen berichten.";messages.appendChild(empty);}

    const composer=document.createElement("form");composer.className="conversation-composer";const input=document.createElement("textarea");input.id="conversation-message-input";input.name="message";input.maxLength=4096;input.required=true;const hasWhatsApp=state.detail.channels.some(channel=>channel.channel==="whatsapp"&&channel.status==="active");input.placeholder=hasWhatsApp?"Typ een WhatsApp-bericht…":"Nog geen WhatsApp-kanaal gekoppeld.";const send=document.createElement("button");send.type="submit";send.textContent="Versturen";send.disabled=!hasWhatsApp;composer.append(input,send);composer.addEventListener("submit",event=>sendMessage(event,input,send));
    root.append(header,messages);const suggestion=renderSuggestion();if(suggestion)root.appendChild(suggestion);root.appendChild(composer);messages.scrollTop=messages.scrollHeight;
  }
  function renderSuggestion(){
    const item=[...state.suggestions].reverse().find(entry=>entry.approvalStatus==="pending");if(!item)return null;
    const card=document.createElement("section");card.className="conversation-ai-draft";
    const heading=document.createElement("div");const title=document.createElement("strong");title.textContent="Max AI antwoordvoorstel";const meta=document.createElement("span");meta.textContent=`Concept · ${item.confidence===null?"controle nodig":`${Math.round(item.confidence*100)}% zekerheid`} · nooit automatisch verzonden`;heading.append(title,meta);
    const body=document.createElement("p");body.textContent=item.body;
    const actions=document.createElement("div");const use=document.createElement("button");use.type="button";use.textContent="Gebruik concept";use.addEventListener("click",()=>reviewSuggestion(item,"approved",use));const reject=document.createElement("button");reject.type="button";reject.className="is-secondary";reject.textContent="Afwijzen";reject.addEventListener("click",()=>reviewSuggestion(item,"rejected",reject));actions.append(use,reject);card.append(heading,body,actions);return card;
  }
  async function manage(action,assignedUserId=null){try{await api("/api/conversations-inbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId:state.selectedId,action,assignedUserId})});await loadList(true);setStatus("Gesprek bijgewerkt.");}catch(error){setStatus(error.message,true);}}
  async function generateSuggestion(button){
    button.disabled=true;const original=button.textContent;button.textContent="Max denkt…";
    try{await api("/api/conversation-ai-suggestion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"generate",conversationId:state.selectedId})});await loadDetail(state.selectedId,true);setStatus("Max AI heeft een concept gemaakt. Controleer het vóór gebruik.");}catch(error){setStatus(error.message,true);}finally{button.disabled=false;button.textContent=original;}
  }
  async function reviewSuggestion(item,decision,button){
    button.disabled=true;
    try{await api("/api/conversation-ai-suggestion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"review",suggestionId:item.id,decision})});await loadDetail(state.selectedId,true);if(decision==="approved"){const input=$("conversation-message-input");if(input){input.value=item.body;input.focus();}setStatus("Concept staat klaar. Pas het eventueel aan en druk zelf op Versturen.");}else setStatus("AI-concept afgewezen.");}catch(error){setStatus(error.message,true);}finally{button.disabled=false;}
  }
  async function sendMessage(event,input,button){event.preventDefault();const body=clean(input.value);if(!body)return;button.disabled=true;try{await api("/api/whatsapp-send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId:state.selectedId,clientMessageId:crypto.randomUUID(),body})});input.value="";await loadDetail(state.selectedId,true);setStatus("WhatsApp-bericht aangeboden voor verzending.");}catch(error){setStatus(error.message,true);}finally{button.disabled=false;}}

  $("conversation-search").addEventListener("input",renderList);$("conversation-filter").addEventListener("change",renderList);$("conversation-refresh").addEventListener("click",()=>loadList(false));
  loadList(false);state.timer=setInterval(()=>{if(!document.hidden)loadList(true);},7000);window.addEventListener("beforeunload",()=>clearInterval(state.timer));
})();
