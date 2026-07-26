const endpoint = "/.netlify/functions/partner-onboarding";
const controlledLabels = {
  commission_system: ["Commissievoorwaarden", "Accepteer de exacte, actuele planversie."],
  knowledge_assessment: ["Kennistoets", "Behaal de vastgestelde voldoende-score."],
  document_acceptance: ["Documenten", "Controleer en accepteer de vereiste afspraken."],
};
const state = { token: "", data: null, activeStepKey: "" };
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
  element("version").textContent = data.training.version ? `${data.training.version.title} · ${data.training.version.code}` : "Trainingsinhoud niet beschikbaar";
  element("notice").className = `notice ${data.access.allowed ? "success" : ""}`;
  element("notice").textContent = data.access.allowed
    ? "Je onboarding is volledig afgerond en je verkoopomgeving is vrijgegeven."
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
  showModule(preferredStep || firstIncomplete?.stepKey || modules[0]?.stepKey || "");
}

function showModule(stepKey) {
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
  element("module").scrollIntoView({ behavior: "smooth", block: "start" });
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
      button.textContent = "Start kennistoets";
      button.addEventListener("click", showAssessment);
      card.append(button);
    }
    return card;
  }));
}

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
  submit.textContent = "Toets definitief indienen";
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
    ["Verificatie", "Controleerbaar in het Max Webstudio-adminportaal"],
  ];
  element("certificateDetails").replaceChildren(...details.flatMap(([term, value]) => {
    const dt = document.createElement("dt"); dt.textContent = term;
    const dd = document.createElement("dd"); dd.textContent = value;
    return [dt, dd];
  }));
  element("certificateDisclaimer").textContent = certificate.disclaimer;
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
    state.token = sessionToken();
    if (!state.token) throw new Error("Log opnieuw in om verder te gaan.");
    render(await request());
  } catch (error) {
    element("notice").className = "notice error";
    element("notice").textContent = error.message;
  }
}

initialize();
