import { partnerPreviewData } from "./partner-onboarding-preview.js";

const endpoint = "/.netlify/functions/partner-onboarding";
const staffEndpoint = "/.netlify/functions/staff-self-service";
const signingEndpoint = "/.netlify/functions/partner-signing";
const previewStorageKey = "mwsPartnerOnboardingPreviewV2";
const controlledLabels = {
  commission_system: ["Commissievoorwaarden", "Accepteer de exacte, actuele planversie."],
  knowledge_assessment: ["Kennistoets", "Behaal de vastgestelde voldoende-score."],
  document_acceptance: ["Documenten", "Controleer en accepteer de vereiste afspraken."],
};
const state = {
  token: "",
  data: null,
  activeStepKey: "",
  preview: new URLSearchParams(location.search).get("preview") === "1",
  staff: null,
  signing: null,
};
const element = (id) => document.getElementById(id);

function sessionToken() {
  for (const key of ["maxwebstudioSupabaseAuthSession", "mws_admin_supabase_session"]) {
    try {
      const session = JSON.parse(localStorage.getItem(key) || "null");
      const token = session?.access_token || session?.accessToken || "";
      if (token) return token;
    } catch { /* Invalid local state means signed out. */ }
  }
  location.replace(`/admin-login.html?next=${encodeURIComponent(location.pathname + location.search)}`);
  return "";
}

async function request(body) {
  if (state.preview) throw new Error("De previewstand voert geen serveracties uit.");
  const response = await fetch(endpoint, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Onboarding kon niet worden geladen.");
  return data;
}

async function staffRequest(body) {
  if (state.preview) return previewStaffAction(body || {});
  const response = await fetch(staffEndpoint, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Het ZZP-dossier kon niet worden geladen.");
  state.staff = data;
  return data;
}

async function signingRequest(body) {
  if (state.preview) return previewSigningAction(body || {});
  const response = await fetch(signingEndpoint, {
    method:body ? "POST" : "GET",
    headers:{ Authorization:`Bearer ${state.token}`, "Content-Type":"application/json" },
    body:body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "De ondertekening kon niet worden geladen.");
  state.signing = data;
  return data;
}

function stepFor(key) { return state.data.steps.find((step) => step.stepKey === key); }
function moduleFor(key) { return state.data.training.modules.find((module) => module.stepKey === key); }

function render(data, preferredStep = "") {
  state.data = data;
  const total = data.steps.length;
  const completed = data.steps.filter((step) => step.status === "completed").length;
  const percentage = total ? Math.round(completed / total * 100) : 0;
  element("progress").style.width = `${percentage}%`;
  element("progress").parentElement.setAttribute("aria-valuenow", String(percentage));
  element("percentage").textContent = `${percentage}%`;
  element("version").textContent = state.preview ? "Partnertraining · voorbeeldweergave" : data.training.version ? `${data.training.version.title} · ${data.training.version.code}` : "Trainingsinhoud niet beschikbaar";
  element("previewBadge").hidden = !state.preview;
  element("notice").className = `notice ${data.access.allowed ? "success" : ""}`;
  element("notice").textContent = state.preview
    ? "Preview voor Max Webstudio: bekijk alle hoofdstukken, het ZZP-dossier, documenten en de volledige kennistoets. Je voortgang blijft alleen in deze browser bewaard."
    : data.access.allowed
    ? "Je onboarding is volledig afgerond en je verkoopomgeving is vrijgegeven."
    : data.onboarding?.status === "certified"
      ? "Je certificaat is toegekend. Een bevoegde admin moet je account nog expliciet activeren."
      : `${completed} van ${total} verplichte stappen afgerond. Je kunt veilig verdergaan waar je gebleven bent.`;

  const modules = data.training.modules || [];
  element("stepNav").replaceChildren(...modules.map((module) => {
    const step = stepFor(module.stepKey);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `step-link ${step?.status === "completed" ? "done" : ""}`;
    button.innerHTML = `<span class="dot">${step?.status === "completed" ? "✓" : module.order}</span><span>${escapeHtml(module.title)}</span>`;
    button.addEventListener("click", () => showModule(module.stepKey));
    button.dataset.stepKey = module.stepKey;
    return button;
  }));
  renderControlled();
  renderCertificate();
  const firstIncomplete = modules.find((module) => stepFor(module.stepKey)?.status !== "completed");
  showModule(preferredStep || firstIncomplete?.stepKey || modules[0]?.stepKey || "", false);
}

function showModule(stepKey, shouldScroll = true) {
  const module = moduleFor(stepKey);
  if (!module) { element("module").hidden = true; return; }
  state.activeStepKey = stepKey;
  document.querySelectorAll(".step-link").forEach((button) => button.classList.toggle("active", button.dataset.stepKey === stepKey));
  const step = stepFor(stepKey);
  element("module").hidden = false;
  element("moduleNumber").textContent = `Hoofdstuk ${module.order}`;
  element("moduleTime").textContent = `${module.estimatedMinutes} min lezen`;
  element("moduleTitle").textContent = module.title;
  element("moduleSummary").textContent = module.summary;
  element("acknowledgementText").textContent = module.acknowledgementText;
  element("acknowledge").checked = step?.status === "completed";
  element("acknowledge").disabled = step?.status === "completed";
  element("complete").textContent = step?.status === "completed" ? "Hoofdstuk afgerond" : "Bevestigen en verder";
  element("complete").disabled = true;
  const sections = Array.isArray(module.content?.sections) ? module.content.sections : [];
  element("moduleContent").replaceChildren(...sections.map(renderSection));
  if (shouldScroll) element("module").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSection(section) {
  const node = document.createElement("section");
  node.className = "content-section";
  const heading = document.createElement("h3");
  heading.textContent = section.heading || "Onderdeel";
  node.append(heading);
  for (const paragraph of section.paragraphs || []) {
    const text = document.createElement("p");
    text.textContent = paragraph;
    node.append(text);
  }
  if (section.bullets?.length) {
    const list = document.createElement("ul");
    list.replaceChildren(...section.bullets.map((bullet) => { const item = document.createElement("li"); item.textContent = bullet; return item; }));
    node.append(list);
  }
  return node;
}

function renderControlled() {
  const entries = state.data.steps.filter((step) => controlledLabels[step.stepKey]);
  element("controlledSteps").hidden = !entries.length;
  element("controlledCards").replaceChildren(...entries.map((step) => {
    const [title, description] = controlledLabels[step.stepKey];
    const card = document.createElement("article");
    card.className = "controlled-card";
    card.innerHTML = `<h3>${title}</h3><p>${description}</p><span class="status ${step.status === "completed" ? "done" : ""}">${step.status === "completed" ? "Afgerond" : "Nog te doen"}</span>`;
    if (step.stepKey === "knowledge_assessment" && step.status !== "completed" && state.data.certification?.assessment?.available) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = state.preview ? "Bekijk de tien toetsvragen" : "Start kennistoets";
      button.addEventListener("click", showAssessment);
      card.append(button);
    }
    if (step.stepKey === "commission_system" && step.status !== "completed" && state.data.commercial?.plan) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = state.preview ? "Bekijk het voorbeeldplan" : "Plan bekijken en accepteren"; button.addEventListener("click", showCommissionPlan); card.append(button);
    }
    if (step.stepKey === "document_acceptance" && step.status !== "completed" && state.data.commercial?.documents?.length) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = state.preview ? "Bekijk de vier documenten" : "Documenten controleren"; button.addEventListener("click", showDocuments); card.append(button);
    }
    return card;
  }).concat(allStepsComplete() && !state.data.certification?.certificate ? [finalizationCard()] : []));
}

function allStepsComplete() { return state.data.steps.length > 0 && state.data.steps.every((step) => step.status === "completed"); }
function finalizationCard() {
  const card = document.createElement("article"); card.className = "controlled-card";
  card.innerHTML = "<h3>Certificering afronden</h3><p>Alle vereiste onderdelen zijn voltooid. Laat de server de volledige bewijsset controleren.</p>";
  const button = document.createElement("button"); button.type="button"; button.textContent="Certificaat uitgeven voor admincontrole"; button.addEventListener("click", finalizeCertification); card.append(button); return card;
}

function prepareAgreement(title, intro) {
  element("module").hidden = true; element("assessment").hidden = true; element("agreements").hidden = false;
  element("agreementsTitle").textContent = title; element("agreementsIntro").textContent = intro; element("agreementsContent").replaceChildren();
}
function showCommissionPlan() {
  const plan = state.data.commercial.plan; prepareAgreement("Commissieplan", "De gekoppelde versie blijft onderdeel van je auditbare onboardinghistorie.");
  const list=document.createElement("div"); list.className="plan-tiers";
  let previous=0; for(const tier of plan.tiers||[]){ const row=document.createElement("div"); const upper=tier.upToCents==null?"en hoger":`tot ${money(tier.upToCents)}`; const range=document.createElement("span"); range.textContent=`${previous?`boven ${money(previous)} `:""}${upper}`; const rate=document.createElement("strong"); rate.textContent=`${Number(tier.rateBps)/100}%`; row.append(range,rate); list.append(row); if(tier.upToCents!=null)previous=tier.upToCents; }
  const note=document.createElement("p"); note.className="document-note"; note.textContent=`Methode: ${plan.calculationMethod === "progressive" ? "progressief per schijf" : "hoogste schijf over het geheel"}. Grondslag: daadwerkelijk ontvangen omzet exclusief btw. Abonnementen: ${plan.includeSubscriptions ? "inbegrepen" : "niet standaard inbegrepen"}.`;
  const button=document.createElement("button"); button.className="primary"; button.type="button"; button.textContent=`Accepteer ${plan.versionCode}`; button.addEventListener("click",acceptCommissionPlan);
  element("agreementsContent").append(list,note,button); element("agreements").scrollIntoView({behavior:"smooth",block:"start"});
}
async function acceptCommissionPlan(event) {
  if (state.preview) { completePreviewStep("commission_system"); element("agreements").hidden = true; return; }
  event.currentTarget.disabled=true;
  try{ render(await request({action:"accept_commission_plan",versionCode:state.data.commercial.plan.versionCode,idempotencyKey:crypto.randomUUID()})); element("agreements").hidden=true; }
  catch(error){showError(error);event.currentTarget.disabled=false;}
}
function showDocuments() {
  prepareAgreement("ZZP-dossier en documenten", "Vul je zakelijke en betaalgegevens in, lever de benodigde bewijsstukken veilig aan en bevestig daarna de actuele afspraken. Deze bevestiging is geen vervanging voor een volledig ondertekende opdrachtovereenkomst.");
  renderZzpDossierPanel(element("agreementsContent"));
  for(const agreement of state.data.commercial.documents){ const article=document.createElement("article"); article.className="document-card"; const title=document.createElement("h3"); title.textContent=agreement.title; const body=document.createElement("p"); body.textContent=agreement.content; const meta=document.createElement("small"); meta.textContent=`Versie ${agreement.versionCode} · ${agreement.reviewStatus === "legal_review_required" ? "juridische review vereist" : "intern goedgekeurd"}`; const label=document.createElement("label"); label.className="option"; const input=document.createElement("input"); input.type="checkbox"; input.name="document"; input.value=agreement.versionCode; input.checked=agreement.accepted; input.disabled=agreement.accepted; const text=document.createElement("span"); text.textContent="Ik heb deze exacte versie gelezen en begrepen."; label.append(input,text); article.append(title,body,meta,label); element("agreementsContent").append(article); }
  const button=document.createElement("button"); button.className="primary"; button.type="button"; button.textContent="Alle documentversies bevestigen"; button.addEventListener("click",acceptDocuments); element("agreementsContent").append(button); element("agreements").scrollIntoView({behavior:"smooth",block:"start"});
}

function renderZzpDossierPanel(container) {
  const staff = state.staff || { dossier:null, documents:[], messages:[], completeness:{ percent:0 } };
  const panel = document.createElement("section");
  panel.className = "zzp-dossier";
  panel.innerHTML = `
    <header class="zzp-dossier-head"><div><p class="eyebrow">Privé ZZP-dossier</p><h3>Persoons-, bedrijfs- en betaalgegevens</h3><p>Alleen jij en de super admin kunnen deze gegevens via de beveiligde dossierfunctie bekijken.</p></div><strong class="zzp-score">${Number(staff.completeness?.percent || 0)}%</strong></header>
    <form id="zzpDossierForm" class="zzp-form">
      <label>Volledige wettelijke naam<input name="legalName" required autocomplete="name"></label>
      <label>Handelsnaam<input name="tradeName" autocomplete="organization"></label>
      <label>Telefoonnummer<input name="phone" required autocomplete="tel"></label>
      <label>Straat<input name="street" required autocomplete="address-line1"></label>
      <label>Huisnummer<input name="houseNumber" required></label>
      <label>Postcode<input name="postalCode" required autocomplete="postal-code"></label>
      <label>Plaats<input name="city" required autocomplete="address-level2"></label>
      <label>Land<select name="countryCode"><option value="NL">Nederland</option><option value="BE">België</option><option value="DE">Duitsland</option></select></label>
      <label>KvK-nummer<input name="kvkNumber" required inputmode="numeric" maxlength="8" placeholder="12345678"></label>
      <label>Btw-nummer<input name="vatNumber" required placeholder="NL123456789B01"></label>
      <label>IBAN<input name="iban" required autocomplete="off" placeholder="NL00 BANK 0000 0000 00"></label>
      <label>Naam rekeninghouder<input name="ibanAccountName" required autocomplete="off"></label>
      <div class="zzp-form-actions"><button class="secondary" type="submit">Dossier opslaan</button><button id="submitZzpDossier" class="primary" type="button">Dossier ter controle indienen</button></div>
      <p id="zzpDossierStatus" class="document-note" role="status"></p>
    </form>
    <section id="zzpSigningPanel" class="zzp-signing"></section>
    <section class="zzp-upload"><div><p class="eyebrow">Privédocumenten</p><h3>Veilig aanleveren</h3><p>Geen bankpas uploaden. Gebruik een afgeschermd rekeningbewijs. Een identiteitskopie is voor ZZP optioneel: gebruik KopieID, een watermerk en scherm het BSN af als dit niet nodig is.</p></div>
      <form id="zzpUploadForm" class="zzp-upload-form">
        <label>Documenttype<select name="documentType"><option value="signed_assignment_agreement">Ondertekende opdrachtovereenkomst</option><option value="bank_account_proof">Afgeschermd rekeningbewijs</option><option value="kvk_extract">KvK-uittreksel</option><option value="identity_verification_copy">Optionele identiteitsverificatie</option></select></label>
        <label id="identityTypeLabel" hidden>Identiteitsdocument<select name="identityDocumentType"><option value="passport">Paspoort</option><option value="identity_card">Identiteitskaart</option><option value="driving_licence">Rijbewijs</option></select></label>
        <label>Bestand<input name="document" type="file" accept="application/pdf,image/jpeg,image/png" required></label>
        <label class="zzp-declaration"><input name="declaration" type="checkbox" required><span>Ik mag dit document aanleveren en heb onnodige gegevens afgeschermd.</span></label>
        <button class="secondary" type="submit">Document veilig uploaden</button><p id="zzpUploadStatus" class="document-note" role="status"></p>
      </form>
      <div id="zzpDocumentList" class="zzp-document-list"></div>
    </section>
    <section class="zzp-chat"><div><p class="eyebrow">Direct contact</p><h3>Chat met Max</h3><p>Berichten blijven gekoppeld aan je dossier.</p></div><div id="zzpMessages" class="zzp-messages"></div><form id="zzpMessageForm"><textarea name="body" rows="3" maxlength="4000" placeholder="Schrijf een bericht…" required></textarea><button class="secondary" type="submit">Bericht sturen</button></form></section>`;
  container.append(panel);
  fillDossierForm(panel.querySelector("#zzpDossierForm"), staff.dossier);
  renderSigningPanel(panel.querySelector("#zzpSigningPanel"), state.signing);
  renderStaffDocuments(panel.querySelector("#zzpDocumentList"), staff.documents || []);
  renderStaffMessages(panel.querySelector("#zzpMessages"), staff.messages || []);
  const uploadForm = panel.querySelector("#zzpUploadForm");
  const identityLabel = panel.querySelector("#identityTypeLabel");
  uploadForm.elements.documentType.addEventListener("change", () => { identityLabel.hidden = uploadForm.elements.documentType.value !== "identity_verification_copy"; });
  panel.querySelector("#zzpDossierForm").addEventListener("submit", saveZzpDossier);
  panel.querySelector("#submitZzpDossier").addEventListener("click", submitZzpDossier);
  uploadForm.addEventListener("submit", uploadZzpDocument);
  panel.querySelector("#zzpMessageForm").addEventListener("submit", sendStaffMessage);
}

function renderSigningPanel(container, signing = {}) {
  const current = signing?.current || null;
  const labels = {
    creating:"Ondertekening voorbereiden", waiting_for_signer:"Wacht op handtekeningen",
    signed_pending_scan:"Ondertekend · veiligheidscontrole loopt", signed:"Volledig ondertekend",
    rejected:"Ondertekening geweigerd", expired:"Ondertekening verlopen",
    cancelled:"Ondertekening geannuleerd", failed:"Ondertekening mislukt",
  };
  const ready = Boolean(signing?.configured && signing?.templateReady && signing?.dossierReady);
  const open = current && ["creating","waiting_for_signer","signed_pending_scan","signed"].includes(current.status);
  const explanation = current
    ? `${labels[current.status] || current.status}. Je ontvangt de uitnodiging en herinneringen rechtstreeks via Signhost.`
    : !signing?.templateReady
      ? "De definitieve juridisch goedgekeurde overeenkomst wordt nog door Max Webstudio klaargezet."
      : !signing?.dossierReady
        ? "Sla eerst je wettelijke naam en mobiele telefoonnummer op."
        : "De overeenkomst wordt door jou en Max Webstudio via Signhost ondertekend.";
  container.innerHTML = `<div><p class="eyebrow">Digitale overeenkomst</p><h3>Ondertekenen via Signhost</h3><p>${escapeHtml(explanation)}</p></div>`;
  const badge=document.createElement("span");badge.className=`signing-badge ${current?.status || "not-ready"}`;badge.textContent=current ? (labels[current.status] || current.status) : "Nog niet gestart";container.append(badge);
  const button=document.createElement("button");button.type="button";button.className="primary";button.textContent=open ? "Ondertekenstatus vernieuwen" : "ZZP-overeenkomst laten ondertekenen";button.disabled=!open&&!ready;button.addEventListener("click",()=>open ? refreshSigning(button) : startSigning(button));container.append(button);
}

async function startSigning(button) {
  button.disabled=true;button.textContent="Signhost voorbereiden…";
  try{await signingRequest({action:"start_agreement",idempotencyKey:crypto.randomUUID()});showDocuments();}
  catch(error){showError(error);button.disabled=false;button.textContent="Opnieuw proberen";}
}
async function refreshSigning(button) {
  button.disabled=true;
  try{await signingRequest();showDocuments();}
  catch(error){showError(error);button.disabled=false;}
}

function fillDossierForm(form, dossier = {}) {
  for (const [name, value] of Object.entries(dossier || {})) if (form.elements[name]) form.elements[name].value = value || "";
}
function dossierPayload(form) { return Object.fromEntries(new FormData(form).entries()); }
async function saveZzpDossier(event) {
  event.preventDefault(); const form=event.currentTarget; const status=form.querySelector("#zzpDossierStatus");
  try { await staffRequest({ action:"save_dossier", ...dossierPayload(form) }); await signingRequest(); status.textContent="Dossier veilig opgeslagen."; showDocuments(); }
  catch(error){status.textContent=error.message;}
}
async function submitZzpDossier(event) {
  const form=event.currentTarget.closest(".zzp-dossier").querySelector("#zzpDossierForm"); const status=form.querySelector("#zzpDossierStatus");
  try { await staffRequest({ action:"submit_dossier", ...dossierPayload(form) }); await signingRequest(); status.textContent="Dossier ingediend voor controle door Max."; showDocuments(); }
  catch(error){status.textContent=error.message;}
}
async function uploadZzpDocument(event) {
  event.preventDefault(); const form=event.currentTarget; const status=form.querySelector("#zzpUploadStatus"); const file=form.elements.document.files[0];
  if(!file)return;
  try {
    const input={ action:"prepare_document", documentType:form.elements.documentType.value, identityDocumentType:form.elements.documentType.value === "identity_verification_copy" ? form.elements.identityDocumentType.value : "", filename:file.name, mimeType:file.type, sizeBytes:file.size, declaration:"staff_zzp_document_upload_nl_v1" };
    if(state.preview){ await staffRequest({ ...input, previewFilename:file.name }); status.textContent="Voorbeelddocument toegevoegd; er zijn geen bestandsbytes opgeslagen."; showDocuments(); return; }
    status.textContent="Veilige upload voorbereiden…"; const prepared=await staffRequest(input);
    const upload=await fetch(prepared.uploadUrl,{method:prepared.uploadMethod||"PUT",headers:prepared.uploadHeaders||{},body:file});
    if(!upload.ok)throw new Error("Het bestand kon niet naar de private opslag worden verzonden.");
    await staffRequest({action:"finalize_document",uploadId:prepared.uploadId}); status.textContent="Document veilig opgeslagen."; showDocuments();
  } catch(error){status.textContent=error.message;}
}
async function sendStaffMessage(event) {
  event.preventDefault(); const form=event.currentTarget; const body=form.elements.body.value.trim(); if(!body)return;
  try{await staffRequest({action:"send_message",body,idempotencyKey:crypto.randomUUID()});form.reset();showDocuments();}catch(error){showError(error);}
}
function renderStaffDocuments(container, documents) {
  container.replaceChildren(...(documents.length ? documents.map((doc)=>{const item=document.createElement("article");item.className="zzp-document-item";item.innerHTML=`<strong>${escapeHtml(documentTypeLabel(doc.document_type||doc.documentType))}</strong><span>${escapeHtml(doc.original_filename||doc.originalFilename||"Document")} · ${escapeHtml(doc.status||"beschikbaar")}</span>`;return item;}) : [Object.assign(document.createElement("p"),{className:"document-note",textContent:"Nog geen documenten aangeleverd."})]));
}
function renderStaffMessages(container, messages) {
  container.replaceChildren(...(messages.length ? messages.map((message)=>{const item=document.createElement("article");item.className=`zzp-message ${message.mine ? "mine" : "admin"}`;const body=document.createElement("p");body.textContent=message.body;const meta=document.createElement("small");meta.textContent=`${message.mine ? "Jij" : "Max"} · ${formatDate(message.created_at||message.createdAt)}`;item.append(body,meta);return item;}) : [Object.assign(document.createElement("p"),{className:"document-note",textContent:"Nog geen berichten."})]));
}
function documentTypeLabel(value){return ({signed_assignment_agreement:"Ondertekende opdrachtovereenkomst",bank_account_proof:"Rekeningbewijs",kvk_extract:"KvK-uittreksel",identity_verification_copy:"Identiteitsverificatie",other:"Overig"})[value]||value||"Document";}
async function acceptDocuments(event) {
  const checked=[...element("agreementsContent").querySelectorAll('input[name="document"]')].filter((input)=>input.checked||input.disabled).map((input)=>input.value);
  if(checked.length!==state.data.commercial.documents.length){showError(new Error("Bevestig eerst iedere documentversie."));return;}
  if (state.preview) { completePreviewStep("document_acceptance"); element("agreements").hidden = true; return; }
  event.currentTarget.disabled=true;
  try{render(await request({action:"accept_required_documents",versionCodes:checked,idempotencyKey:crypto.randomUUID()}));element("agreements").hidden=true;}
  catch(error){showError(error);event.currentTarget.disabled=false;}
}
async function finalizeCertification(event){event.currentTarget.disabled=true;try{const data=await request({action:"finalize_certification",idempotencyKey:crypto.randomUUID()});render(data);element("certificate").scrollIntoView({behavior:"smooth",block:"start"});}catch(error){showError(error);event.currentTarget.disabled=false;}}
function showError(error){element("notice").className="notice error";element("notice").textContent=error.message;}
function money(cents){return new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(Number(cents)/100);}

function showAssessment() {
  const assessment = state.data.certification?.assessment;
  if (!assessment?.available) return;
  element("module").hidden = true;
  element("assessment").hidden = false;
  element("assessmentTitle").textContent = assessment.title;
  element("assessmentIntro").textContent = `Beantwoord alle ${assessment.questions.length} vragen. Je slaagt bij ${assessment.passScore}% of hoger. Maximaal ${assessment.maxAttempts} pogingen.`;
  const form = element("assessmentForm");
  form.replaceChildren(...assessment.questions.map((question, index) => {
    const section = document.createElement("section");
    section.className = "question";
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = `${index + 1}. ${question.prompt}`;
    fieldset.append(legend, ...question.options.map((option) => {
      const label = document.createElement("label");
      label.className = "option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = question.id;
      input.value = option;
      input.required = true;
      const text = document.createElement("span");
      text.textContent = option;
      label.append(input, text);
      return label;
    }));
    section.append(fieldset);
    return section;
  }));
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = state.preview ? "Voorbeeldtoets afronden" : "Toets definitief indienen";
  form.append(submit);
  form.onsubmit = submitAssessment;
  element("assessment").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function submitAssessment(event) {
  event.preventDefault();
  const assessment = state.data.certification.assessment;
  const formData = new FormData(event.currentTarget);
  const answers = Object.fromEntries(assessment.questions.map((question) => [question.id, formData.get(question.id)]));
  const submit = event.currentTarget.querySelector("button[type=submit]");
  if (state.preview) {
    const answered = Object.values(answers).filter(Boolean).length;
    if (answered !== assessment.questions.length) return;
    completePreviewStep("knowledge_assessment", false);
    const result = document.createElement("div");
    result.className = "assessment-result";
    result.textContent = "Voorbeeldtoets afgerond. Je resultaat blijft in deze browser bewaard. In de echte onboarding beoordeelt de server de antwoorden en is minimaal 80% nodig.";
    event.currentTarget.replaceChildren(result);
    return;
  }
  submit.disabled = true;
  submit.textContent = "Veilig beoordelen…";
  try {
    const data = await request({ action: "submit_assessment", assessmentVersionCode: assessment.versionCode, answers, idempotencyKey: crypto.randomUUID() });
    const latest = data.certification.attempts[0];
    render(data);
    element("assessment").hidden = false;
    const result = document.createElement("div");
    result.className = "assessment-result";
    result.textContent = latest?.passed
      ? `Geslaagd met ${latest.score}%. Je resultaat is veilig opgeslagen.`
      : `Je score is ${latest?.score ?? 0}%. Voor deze versie is ${assessment.passScore}% nodig.`;
    element("assessmentForm").replaceChildren(result);
  } catch (error) {
    element("notice").className = "notice error";
    element("notice").textContent = error.message;
    submit.disabled = false;
    submit.textContent = "Opnieuw indienen";
  }
}

function renderCertificate() {
  const certificate = state.data.certification?.certificate;
  element("certificate").hidden = !certificate;
  if (!certificate) return;
  element("certificateName").textContent = certificate.partnerName;
  element("certificateType").textContent = certificate.certificationType;
  const details = [
    ["Certificaat-ID", certificate.certificateId],
    ["Status", certificate.status === "valid" ? "Geldig" : certificate.status === "revoked" ? "Ingetrokken" : "Verlopen"],
    ["Uitgiftedatum", formatDate(certificate.issuedAt)],
    ["Geldig tot", formatDate(certificate.expiresAt)],
    ["Trainingsversie", certificate.trainingVersionCode],
    ["Certificaatversie", certificate.certificateVersion],
    ["Ondertekenaar", `${certificate.authorizedSignerName} - ${certificate.authorizedSignerTitle}`],
    ["Verificatie", certificate.verificationPath],
  ];
  element("certificateDetails").replaceChildren(...details.flatMap(([term, value]) => {
    const dt = document.createElement("dt"); dt.textContent = term;
    const dd = document.createElement("dd"); dd.textContent = value;
    return [dt, dd];
  }));
  element("certificateDisclaimer").textContent = certificate.disclaimer;
  element("certificateDownload").onclick = async () => {
    const response = await fetch(`/.netlify/functions/partner-certificate-pdf?certificateId=${encodeURIComponent(certificate.certificateId)}`, { headers:{ Authorization:`Bearer ${state.token}` } });
    if (!response.ok) { const data=await response.json().catch(()=>({})); showError(new Error(data.error||"PDF kon niet worden gedownload.")); return; }
    const url=URL.createObjectURL(await response.blob()); const link=document.createElement("a"); link.href=url; link.download=`${certificate.certificateId}.pdf`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value)) : "–";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

element("acknowledge").addEventListener("change", (event) => {
  element("complete").disabled = !event.target.checked;
});
element("complete").addEventListener("click", async () => {
  const button = element("complete");
  button.disabled = true;
  button.textContent = "Opslaan…";
  if (state.preview) {
    completePreviewStep(state.activeStepKey);
    return;
  }
  try {
    const data = await request({ action: "complete_step", stepKey: state.activeStepKey, idempotencyKey: crypto.randomUUID() });
    const modules = data.training.modules || [];
    const next = modules.find((module) => data.steps.find((step) => step.stepKey === module.stepKey)?.status !== "completed");
    render(data, next?.stepKey || state.activeStepKey);
  } catch (error) {
    element("notice").className = "notice error";
    element("notice").textContent = error.message;
    button.disabled = false;
    button.textContent = "Opnieuw proberen";
  }
});

async function initialize() {
  try {
    if (state.preview) {
      document.body.classList.add("is-preview");
      element("sidebarIntro").textContent = "Bekijk de volledige leerroute zoals een nieuwe medewerker die straks doorloopt.";
      element("securityTitle").textContent = "Veilige voorbeeldstand";
      element("securityText").textContent = "Je voortgang blijft alleen in deze browser bewaard; er worden geen echte persoonsgegevens of bestanden verstuurd.";
      const preview = loadPreviewState();
      state.staff = preview.staff;
      state.signing = { configured:true, templateReady:true, dossierReady:Boolean(state.staff?.dossier?.legalName && state.staff?.dossier?.phone), current:null, history:[] };
      const data = structuredClone(partnerPreviewData);
      for (const step of data.steps) if (preview.completedStepKeys.includes(step.stepKey)) step.status = "completed";
      render(data);
      return;
    }
    state.token = sessionToken();
    if (!state.token) throw new Error("Log opnieuw in om verder te gaan.");
    const [onboarding] = await Promise.all([request(), staffRequest(), signingRequest()]);
    render(onboarding);
  } catch (error) {
    element("notice").className = "notice error";
    element("notice").textContent = error.message;
  }
}

function completePreviewStep(stepKey, rerender = true) {
  const step = state.data.steps.find((item) => item.stepKey === stepKey);
  if (step) step.status = "completed";
  persistPreviewState();
  if (!rerender) return;
  const modules = state.data.training.modules || [];
  const next = modules.find((module) => state.data.steps.find((item) => item.stepKey === module.stepKey)?.status !== "completed");
  render(state.data, next?.stepKey || state.activeStepKey);
}

function emptyPreviewStaff() {
  return { profile:{name:"Voorbeeldpartner",email:"preview@maxwebstudio.nl",role:"sales_partner"}, dossier:null, documents:[], messages:[], completeness:{percent:0,completed:0,total:12} };
}
function previewSigningAction(input={}) {
  state.signing=state.signing||{configured:true,templateReady:true,dossierReady:Boolean(state.staff?.dossier?.legalName&&state.staff?.dossier?.phone),current:null,history:[]};
  state.signing.dossierReady=Boolean(state.staff?.dossier?.legalName&&state.staff?.dossier?.phone);
  if(input.action==="start_agreement") state.signing.current={id:crypto.randomUUID(),status:"waiting_for_signer",requested_at:new Date().toISOString()};
  return structuredClone(state.signing);
}
function loadPreviewState() {
  try {
    const saved=JSON.parse(localStorage.getItem(previewStorageKey)||"null");
    return { completedStepKeys:Array.isArray(saved?.completedStepKeys)?saved.completedStepKeys:[], staff:saved?.staff&&typeof saved.staff==="object"?saved.staff:emptyPreviewStaff() };
  } catch { return { completedStepKeys:[], staff:emptyPreviewStaff() }; }
}
function persistPreviewState() {
  if(!state.preview)return;
  const completedStepKeys=(state.data?.steps||[]).filter((step)=>step.status==="completed").map((step)=>step.stepKey);
  localStorage.setItem(previewStorageKey,JSON.stringify({completedStepKeys,staff:state.staff||emptyPreviewStaff(),savedAt:new Date().toISOString()}));
}
function previewCompleteness(staff) {
  const dossier=staff.dossier||{}; const fields=["legalName","phone","street","houseNumber","postalCode","city","kvkNumber","vatNumber","iban","ibanAccountName"];
  const types=new Set((staff.documents||[]).map((doc)=>doc.documentType)); const completed=fields.filter((key)=>String(dossier[key]||"").trim()).length+Number(types.has("signed_assignment_agreement"))+Number(types.has("bank_account_proof"));
  return {percent:Math.round(completed/12*100),completed,total:12};
}
function previewStaffAction(input={}) {
  state.staff=state.staff||emptyPreviewStaff(); const action=input.action||"";
  if(action==="save_dossier"||action==="submit_dossier") state.staff.dossier={...(state.staff.dossier||{}),...input,status:action==="submit_dossier"?"submitted":"draft",updatedAt:new Date().toISOString()};
  else if(action==="prepare_document") state.staff.documents.unshift({id:crypto.randomUUID(),documentType:input.documentType,identityDocumentType:input.identityDocumentType,originalFilename:input.previewFilename||input.filename,status:"preview",createdAt:new Date().toISOString()});
  else if(action==="send_message") state.staff.messages.push({id:crypto.randomUUID(),body:input.body,mine:true,createdAt:new Date().toISOString()});
  else if(action==="mark_messages_read") for(const message of state.staff.messages)message.readAt=message.readAt||new Date().toISOString();
  state.staff.completeness=previewCompleteness(state.staff);
  if(state.signing)state.signing.dossierReady=Boolean(state.staff?.dossier?.legalName&&state.staff?.dossier?.phone);
  persistPreviewState(); return structuredClone(state.staff);
}

initialize();
