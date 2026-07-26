import { partnerPreviewData } from "./partner-onboarding-preview.js";

const endpoint = "/.netlify/functions/partner-onboarding";
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
    ? "Preview voor Max Webstudio: bekijk alle hoofdstukken, de commissie-uitleg, documenten en de volledige kennistoets. Er wordt niets opgeslagen."
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
  prepareAgreement("Verplichte documenten", "Lees iedere gepubliceerde versie. Deze bevestiging is uitdrukkelijk geen vervanging voor een volledig ondertekende opdrachtovereenkomst.");
  for(const document of state.data.commercial.documents){ const article=document.createElement("article"); article.className="document-card"; const title=document.createElement("h3"); title.textContent=document.title; const body=document.createElement("p"); body.textContent=document.content; const meta=document.createElement("small"); meta.textContent=`Versie ${document.versionCode} · ${document.reviewStatus === "legal_review_required" ? "juridische review vereist" : "intern goedgekeurd"}`; const label=document.createElement("label"); label.className="option"; const input=document.createElement("input"); input.type="checkbox"; input.name="document"; input.value=document.versionCode; input.checked=document.accepted; input.disabled=document.accepted; const text=document.createElement("span"); text.textContent="Ik heb deze exacte versie gelezen en begrepen."; label.append(input,text); article.append(title,body,meta,label); element("agreementsContent").append(article); }
  const button=document.createElement("button"); button.className="primary"; button.type="button"; button.textContent="Alle documentversies bevestigen"; button.addEventListener("click",acceptDocuments); element("agreementsContent").append(button); element("agreements").scrollIntoView({behavior:"smooth",block:"start"});
}
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
    result.textContent = "Voorbeeldtoets afgerond. In de echte onboarding beoordeelt de server de antwoorden en is minimaal 80% nodig. Deze preview heeft niets opgeslagen.";
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
      element("securityText").textContent = "Je kunt alles bekijken en aanklikken; er wordt niets opgeslagen of beoordeeld.";
      render(structuredClone(partnerPreviewData));
      return;
    }
    state.token = sessionToken();
    if (!state.token) throw new Error("Log opnieuw in om verder te gaan.");
    render(await request());
  } catch (error) {
    element("notice").className = "notice error";
    element("notice").textContent = error.message;
  }
}

function completePreviewStep(stepKey, rerender = true) {
  const step = state.data.steps.find((item) => item.stepKey === stepKey);
  if (step) step.status = "completed";
  if (!rerender) return;
  const modules = state.data.training.modules || [];
  const next = modules.find((module) => state.data.steps.find((item) => item.stepKey === module.stepKey)?.status !== "completed");
  render(state.data, next?.stepKey || state.activeStepKey);
}

initialize();
