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
    return card;
  }));
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
