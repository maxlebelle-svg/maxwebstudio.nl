const SAFE_ACTIONS = Object.freeze({
  onboarding_information: { type: "provide_information", url: "/klantportaal.html#onboarding", label: "Briefing invullen" },
  content_ready: { type: "provide_information", url: "/klantportaal.html#bestanden", label: "Bestanden aanleveren" },
  preview_intake: { type: "provide_information", url: "/klantportaal.html#onboarding", label: "Preview-informatie invullen" },
  preview_shared: { type: "review", url: "/klantportaal.html#website-review", label: "Preview bekijken" },
  preview_feedback: { type: "provide_information", url: "/klantportaal.html#website-review", label: "Feedback geven" },
  preview_approved: { type: "approve", url: "/klantportaal.html#website-review", label: "Ontwerp goedkeuren" },
  customer_review: { type: "review", url: "/klantportaal.html#website-review", label: "Ontwerp beoordelen" },
  commercial_agreement: { type: "approve", url: "/klantportaal.html#website-review", label: "Opdracht bevestigen" },
  payment_confirmed: { type: "pay", url: "/klantportaal.html#facturen", label: "Factuur bekijken" },
  handover: { type: "approve", url: "/klantportaal.html#website-review", label: "Oplevering bekijken" },
});

const SAFE_PORTAL_PATH = /^\/klantportaal\.html#(?:onboarding|bestanden|website-review|facturen)$/;

function resolveClientAction(step = {}) {
  const key = text(step.key);
  const requestedType = text(step.customerActionType);
  const mapping = SAFE_ACTIONS[key];
  if (!mapping || mapping.type !== requestedType || !isSafeClientActionUrl(mapping.url)) {
    return { required: Boolean(requestedType && requestedType !== "none"), found: false, type: requestedType || "none", url: null, label: null };
  }
  return { required: true, found: true, ...mapping };
}

function isSafeClientActionUrl(value) {
  return SAFE_PORTAL_PATH.test(text(value));
}

function text(value) { return String(value || "").trim(); }

module.exports = { SAFE_ACTIONS, isSafeClientActionUrl, resolveClientAction };
