import { getClientJourneyProgress } from "../services/clientJourneyProgressService.js";

const SAFE_ACTION_URL = /^\/klantportaal\.html#(?:onboarding|bestanden|website-review|facturen)$/;

export async function loadClientJourneyProgress(options = {}) {
  const elements = options.elements || findElements(options.document || document);
  if (!elements.card) return { state: "missing_target" };
  const fallback = captureFallback(elements);
  renderLoading(elements);
  const result = await (options.load || getClientJourneyProgress)(options.serviceOptions || {});
  if (result.disabled) {
    restoreFallback(elements, fallback);
    return result;
  }
  if (result.state === "ready" || result.state === "unavailable") renderProgressState(elements, result.progress);
  else renderError(elements, result.state);
  return result;
}

export function renderProgressState(elements, progress) {
  clearLoading(elements);
  if (!progress || progress.source === "unavailable" || !progress.available) return renderUnavailable(elements);
  const percentage = clampPercentage(progress.percentage);
  elements.card.dataset.journeyProgressActive = "true";
  elements.card.setAttribute("aria-busy", "false");
  elements.title.textContent = progress.productLabel || "Uw websiteproject";
  elements.subtitle.textContent = progress.currentStepDescription
    ? `Nu bezig: ${lowercaseFirst(progress.currentStepDescription)}`
    : progress.currentPhase ? `Huidige fase: ${humanize(progress.currentPhase)}` : "Uw project wordt bijgewerkt.";
  elements.value.textContent = `${percentage}%`;
  elements.value.setAttribute("aria-label", `${percentage} procent voltooid`);
  elements.bar.style.width = `${percentage}%`;
  const progressbar = elements.bar.parentElement;
  progressbar?.setAttribute("role", "progressbar");
  progressbar?.setAttribute("aria-label", `Voortgang van ${progress.productLabel || "uw project"}`);
  progressbar?.setAttribute("aria-valuemin", "0");
  progressbar?.setAttribute("aria-valuemax", "100");
  progressbar?.setAttribute("aria-valuenow", String(percentage));
  renderMilestones(elements.steps, progress);
  renderEstimateLabel(elements, progress);
  renderContact(elements, progress.contact);
  renderNextStep(elements, progress);
  suppressConflictingOverview(elements);
}

function renderLoading(elements) {
  elements.card.setAttribute("aria-busy", "true");
  elements.card.dataset.journeyProgressLoading = "true";
  elements.title.textContent = "Projectvoortgang laden";
  elements.subtitle.textContent = "We halen uw actuele projectstap veilig op.";
  elements.value.textContent = "…";
  elements.bar.style.width = "0%";
}

function renderUnavailable(elements) {
  elements.card.dataset.journeyProgressActive = "true";
  elements.title.textContent = "Projectvoortgang wordt bijgewerkt";
  elements.subtitle.textContent = "Uw projectgegevens zijn tijdelijk niet als centrale voortgang beschikbaar. De rest van uw portaal blijft gewoon werken.";
  elements.value.textContent = "Niet beschikbaar";
  elements.value.removeAttribute("aria-label");
  elements.bar.style.width = "0%";
  elements.bar.parentElement?.removeAttribute("role");
  elements.steps.replaceChildren(message("Neem gerust contact op als u wilt weten wat de actuele volgende stap is.", "neutral"));
  renderContact(elements, null);
  renderNextStep(elements, { available: false, contact: null });
  suppressConflictingOverview(elements);
}

function renderError(elements, state) {
  clearLoading(elements);
  elements.card.dataset.journeyProgressActive = "true";
  elements.title.textContent = state === "unauthenticated" ? "Log opnieuw in voor projectvoortgang" : "Projectvoortgang kon niet worden geladen";
  elements.subtitle.textContent = "Uw overige klantportaalfuncties blijven beschikbaar. Probeer het later opnieuw of neem contact op.";
  elements.value.textContent = "Tijdelijk niet beschikbaar";
  elements.bar.style.width = "0%";
  elements.steps.replaceChildren(message("Er is geen technische actie van u nodig.", "neutral"));
  renderNextStep(elements, { available: false, contact: null });
  suppressConflictingOverview(elements);
}

function renderMilestones(target, progress) {
  const milestones = [...(progress.completedMilestones || []), ...(progress.remainingMilestones || [])]
    .filter((step) => step && step.label)
    .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));
  if (!milestones.length && progress.currentStep) milestones.push(progress.currentStep);
  target.replaceChildren();
  milestones.forEach((step, index) => {
    const status = milestoneStatus(step, progress);
    const item = document.createElement("article");
    item.className = `portal-command-step is-${status.className}`;
    item.dataset.stepStatus = status.key;
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = status.icon || String(index + 1);
    const title = document.createElement("strong");
    title.textContent = step.label;
    const label = document.createElement("small");
    label.textContent = status.label;
    item.setAttribute("aria-label", `${step.label}: ${status.label}`);
    item.append(icon, title, label);
    target.append(item);
  });
}

function milestoneStatus(step, progress) {
  if (step.status === "completed") return { key: "completed", className: "done", icon: "✓", label: "Afgerond" };
  if (step.status === "skipped") return { key: "skipped", className: "skipped", icon: "–", label: "Overgeslagen" };
  if (step.status === "blocked" || (progress.blocked && step.key === progress.currentStep?.key)) return { key: "blocked", className: "blocked", icon: "!", label: "Aandacht nodig" };
  if (["ready", "in_progress"].includes(step.status) || step.key === progress.currentStep?.key) return { key: "active", className: "active", icon: "→", label: "Nu bezig" };
  return { key: "upcoming", className: "upcoming", icon: "", label: step.optional ? "Optioneel" : "Hierna" };
}

function renderNextStep(elements, progress) {
  if (!elements.nextCard) return;
  const action = progress.customerAction || {};
  const safeAction = action.available && SAFE_ACTION_URL.test(String(action.url || ""));
  elements.nextActions.replaceChildren();
  if (!progress.available) {
    elements.nextCard.dataset.journeyAction = "unavailable";
    elements.nextTitle.textContent = "Wij houden uw project in beeld";
    elements.nextText.textContent = "Uw actuele volgende stap is nu niet betrouwbaar beschikbaar. Neem contact op als u direct duidelijkheid wilt.";
    elements.nextActions.append(contactLink(progress.contact));
    return;
  }
  if (progress.customerActionRequired) {
    elements.nextCard.dataset.journeyAction = safeAction ? "required" : "mapping-missing";
    elements.nextTitle.textContent = safeAction ? action.label || "Uw actie is nodig" : "Er is iets van u nodig";
    elements.nextText.textContent = progress.blocked
      ? progress.blocker?.label || "Deze projectstap wacht op uw aandacht."
      : progress.currentStepDescription || "Open de bijbehorende portaalstap om verder te gaan.";
    if (safeAction) elements.nextActions.append(actionLink(action.label || "Open actie", action.url, true));
    else elements.nextActions.append(contactLink(progress.contact));
    return;
  }
  elements.nextCard.dataset.journeyAction = "none";
  elements.nextTitle.textContent = progress.complete ? "Uw traject is afgerond" : "Wij zijn aan zet";
  elements.nextText.textContent = progress.complete
    ? "De zichtbare stappen in dit traject zijn afgerond."
    : progress.nextStep?.label ? `Hierna: ${lowercaseFirst(progress.nextStep.label)}.` : "Zodra er iets van u nodig is, verschijnt dat hier.";
  elements.nextActions.append(contactLink(progress.contact));
}

function renderContact(elements, contact) {
  let target = elements.card.querySelector("[data-journey-contact]");
  if (!target) { target = document.createElement("aside"); target.dataset.journeyContact = "true"; target.className = "journey-contact-card"; elements.card.append(target); }
  const safe = contact?.name ? contact : { name: "Team Max Webstudio", role: "Uw vaste webstudioteam", email: "info@maxwebstudio.nl", phone: "085 130 2326", photoUrl: null, fallback: true };
  target.replaceChildren();
  if (safe.photoUrl) { const image = document.createElement("img"); image.src = safe.photoUrl; image.alt = ""; image.loading = "lazy"; target.append(image); }
  else { const avatar = document.createElement("span"); avatar.className = "journey-contact-avatar"; avatar.textContent = safe.fallback ? "MW" : initials(safe.name); avatar.setAttribute("aria-hidden", "true"); target.append(avatar); }
  const details = document.createElement("div");
  const label = document.createElement("small"); label.textContent = "Uw contact";
  const name = document.createElement("strong"); name.textContent = safe.name;
  const role = document.createElement("p"); role.textContent = safe.role || "Projectcontact";
  details.append(label, name, role);
  const links = document.createElement("div"); links.className = "journey-contact-links";
  if (safe.email) { const email = document.createElement("a"); email.href = `mailto:${safe.email}`; email.textContent = "E-mail"; email.setAttribute("aria-label", `E-mail ${safe.name}`); links.append(email); }
  if (safe.phone) { const phone = document.createElement("a"); phone.href = `tel:${String(safe.phone).replace(/[^+\d]/g, "")}`; phone.textContent = safe.phone; phone.setAttribute("aria-label", `Bel ${safe.name}`); links.append(phone); }
  target.append(details, links);
}

function renderEstimateLabel(elements, progress) {
  let label = elements.card.querySelector("[data-journey-estimate-label]");
  if (progress.source !== "legacy_estimate") { label?.remove(); return; }
  if (!label) { label = document.createElement("p"); label.dataset.journeyEstimateLabel = "true"; label.className = "journey-estimate-label"; elements.card.insertBefore(label, elements.steps); }
  label.textContent = progress.estimateLabel || "Gebaseerd op de huidige projectfase";
}

function suppressConflictingOverview(elements) {
  if (elements.workspaceProgress) { elements.workspaceProgress.textContent = ""; elements.workspaceProgress.hidden = true; }
  if (elements.nextCard) elements.nextCard.dataset.journeyProgressActive = "true";
}

function clearLoading(elements) { elements.card.removeAttribute("data-journey-progress-loading"); elements.card.setAttribute("aria-busy", "false"); }
function captureFallback(elements) { return { title: elements.title.textContent, subtitle: elements.subtitle.textContent, value: elements.value.textContent, barWidth: elements.bar.style.width, steps: [...elements.steps.childNodes].map((node) => node.cloneNode(true)) }; }
function restoreFallback(elements, fallback) { clearLoading(elements); elements.title.textContent = fallback.title; elements.subtitle.textContent = fallback.subtitle; elements.value.textContent = fallback.value; elements.bar.style.width = fallback.barWidth; elements.steps.replaceChildren(...fallback.steps); }
function findElements(doc) { return { card: doc.getElementById("portal-command-progress"), title: doc.getElementById("command-progress-title"), subtitle: doc.getElementById("command-progress-subtitle"), value: doc.getElementById("command-progress-value"), bar: doc.getElementById("command-progress-bar"), steps: doc.getElementById("command-progress-steps"), nextCard: doc.getElementById("portal-command-next-step"), nextTitle: doc.getElementById("command-next-title"), nextText: doc.getElementById("command-next-text"), nextActions: doc.getElementById("command-next-actions"), workspaceProgress: doc.getElementById("project-workspace-progress") }; }
function actionLink(label, url, primary = false) { const link = document.createElement("a"); link.className = `button ${primary ? "primary" : "secondary"}`; link.href = url; link.textContent = label; return link; }
function contactLink(contact) { const email = contact?.email || "info@maxwebstudio.nl"; return actionLink("Neem contact op", `mailto:${email}`); }
function message(text, tone) { const paragraph = document.createElement("p"); paragraph.className = `journey-progress-message is-${tone}`; paragraph.textContent = text; return paragraph; }
function clampPercentage(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0; }
function humanize(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/^./, (character) => character.toUpperCase()); }
function lowercaseFirst(value) { const text = String(value || "").trim(); return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : ""; }
function initials(value) { return String(value || "MW").split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "MW"; }

export const _private = { clampPercentage, findElements, milestoneStatus };
